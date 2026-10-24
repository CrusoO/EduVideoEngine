import { SLOT_BEAT_KIND, slotSequences, type SlotId } from "@eve/patterns";
import { GOAL_MAX_WORDS, goalProblems } from "@eve/schema";
import type { ContentRecord } from "@eve/content";
import type { LessonContext } from "../lesson/context";
import type { ArcPlan } from "../lesson/types";
import { checkArcPlan, offeredArcs, slotOptions, type SlotOption } from "./index";

/**
 * The planner as code (ADR 0088). What the model planner did was to choose from closed lists: an arc, a pattern for each slot, the records each beat is built from.
 * Code can make those choices with the rules it already has: it tries the arcs in order, the patterns of each slot picture-first, gives each beat the records its pattern
 * needs and the concept claims in the order they depend on each other, and takes the first plan `checkArcPlan` accepts (the same rules, the same gates, the same
 * validators that judge a model's plan). Titles and learning goals come from short templates, so they are plain; the polisher may improve them, and the plan stays
 * valid either way. No model is asked, so this costs no request and cannot be refused by a token limit.
 */
export type DeterministicPlan = { ok: true; plan: ArcPlan; tried: number; arc: string } | { ok: false; errors: string[]; tried: number };

const MAX_COMBINATIONS = 400;

/** The goal and the title of a slot: plain words that fit the slot, with the skill's own words where they read as a question. */
const SLOT_WORDS: Record<SlotId, { title: string; goal: string }> = {
  hook: { title: "A first question", goal: "Can you guess the answer before we work it out?" },
  prerequisite_activation: { title: "Before we start", goal: "What do we need to remember first?" },
  concept: { title: "The key idea", goal: "What is the idea that makes this work?" },
  worked_example: { title: "A worked example", goal: "Can we use the idea on a real example?" },
  second_worked_example: { title: "Another example", goal: "Does the idea work on a different example too?" },
  common_mistake_contrast: { title: "A common mistake", goal: "What mistake is easy to make here?" },
  why_it_fails: { title: "Why it fails", goal: "Why does that mistake not work?" },
  check: { title: "Your turn", goal: "Can you try one yourself?" },
};

/** "Find the sum of the roots of a quadratic equation from its coefficients." becomes "How do we find the sum of the roots of a quadratic equation from its coefficients?" when it fits a goal. */
export function conceptGoal(skillText: string | undefined): string {
  const fallback = SLOT_WORDS.concept.goal;
  if (!skillText) return fallback;
  const t = skillText.trim().replace(/[.!?]+$/, "");
  const m = /^(find|calculate|work out|solve|use|apply|write|draw|read|explain|show|state|compare|identify|recognise|recognize)\s+(.+)$/i.exec(t);
  if (!m) return fallback;
  const goal = `How do we ${m[1]!.toLowerCase()} ${m[2]}?`;
  return goalProblems(goal).length === 0 && goal.split(/\s+/).length <= GOAL_MAX_WORDS ? goal : fallback;
}

/** Concept claims in the order they can be said: a claim after every claim it depends on, otherwise as the records list them. */
function inDependencyOrder(claims: readonly ContentRecord[]): ContentRecord[] {
  const ids = new Set(claims.map((c) => c.id));
  const out: ContentRecord[] = [];
  const done = new Set<string>();
  const visit = (c: ContentRecord, trail: Set<string>): void => {
    if (done.has(c.id) || trail.has(c.id)) return;
    trail.add(c.id);
    for (const d of c.dependsOn ?? []) {
      const dep = claims.find((x) => x.id === d && ids.has(d));
      if (dep) visit(dep, trail);
    }
    done.add(c.id);
    out.push(c);
  };
  for (const c of claims) visit(c, new Set());
  return out;
}

/** Picture patterns first, then those that need fewer records: what a lesson wants to look like, before the rules judge it. */
const preferred = (slot: SlotId, o: readonly SlotOption[], mistakeIds: ReadonlySet<string>): SlotOption[] => {
  const rank = (x: SlotOption): number => {
    // a check asks a question, so the question pattern comes first there; a mistake slot first takes the pattern that states the mistake claim of the records
    if (slot === "check") return x.pattern === "check-question" ? 0 : 1;
    if ((slot === "common_mistake_contrast" || slot === "why_it_fails") && mistakeIds.size > 0) return x.needs.some((n) => mistakeIds.has(n)) ? 0 : 1;
    return 0;
  };
  return [...o].sort((a, b) => rank(a) - rank(b) || Number(a.textHeavy) - Number(b.textHeavy) || a.needs.length - b.needs.length);
};

function* combinations(lists: SlotOption[][]): Generator<SlotOption[]> {
  const idx = lists.map(() => 0);
  while (true) {
    yield lists.map((l, i) => l[idx[i]!]!);
    let k = lists.length - 1;
    while (k >= 0 && ++idx[k]! >= lists[k]!.length) idx[k--] = 0;
    if (k < 0) return;
  }
}

export function planDeterministic(ctx: LessonContext): DeterministicPlan {
  const options = slotOptions(ctx);
  const arcs = offeredArcs(ctx, options);
  if (arcs.length === 0) return { ok: false, errors: ["no arc can be filled from the records"], tried: 0 };
  const hasPrerequisites = ctx.prerequisites.length > 0;
  const claims = inDependencyOrder(ctx.lesson.byKind.conceptClaim);
  const mistakeIds = new Set(claims.filter((c) => /mistake|avoid|misconception/i.test(c.id)).map((c) => c.id));
  let tried = 0;
  let best: string[] = ["no plan was tried"];

  for (const arc of arcs) {
    for (const sequence of slotSequences(arc.id, hasPrerequisites)) {
      const lists = sequence.map((slot) => preferred(slot, options[slot], mistakeIds));
      if (lists.some((l) => l.length === 0)) continue;
      for (const picks of combinations(lists)) {
        if (++tried > MAX_COMBINATIONS) return { ok: false, errors: best, tried: tried - 1 };
        const needed = new Set(picks.flatMap((p) => p.needs));
        const recapSkill = picks[sequence.indexOf("prerequisite_activation")]?.skillId;
        const beats = sequence.map((slotId, i) => {
          const pick = picks[i]!;
          const extra = SLOT_BEAT_KIND[slotId] === "concept" ? claims.filter((c) => !needed.has(c.id)).map((c) => c.id) : [];
          const sourceIds = [...new Set([...pick.needs, ...extra])];
          return {
            id: `b${i + 1}`,
            slotId,
            pattern: pick.pattern,
            title: SLOT_WORDS[slotId].title,
            learningGoal: slotId === "concept" ? conceptGoal(ctx.skillRecord?.text) : SLOT_WORDS[slotId].goal,
            sourceIds,
          };
        });
        const plan: ArcPlan = {
          arcId: arc.id,
          prerequisites: ctx.prerequisites.map((p) => ({ skillId: p.skillId, status: p.skillId === recapSkill ? ("recapped" as const) : ("linked" as const) })),
          beats,
        };
        const errors = checkArcPlan(ctx, plan);
        if (errors.length === 0) return { ok: true, plan, tried, arc: arc.id };
        if (errors.length < best.length || best[0] === "no plan was tried") best = errors;
      }
    }
  }
  return { ok: false, errors: best, tried };
}
