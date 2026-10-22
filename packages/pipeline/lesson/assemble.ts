import { syntheticDurationMs } from "@eve/gates";
import { instantiate, type PedagogyBeatKind } from "@eve/patterns";
import { SCENE_TAIL_MS, SENTENCE_GAP_MS } from "@eve/resolver";
import { CLAIM_KINDS_FROM_2_1, LOCALES, seal, type Claim, type ColorName, type Expr, type LessonBundle, type NarrationSentence, type SceneSpec } from "@eve/schema";
import { fallbackContent } from "../fallback";
import { composeSceneSync } from "../scene/compose";
import { buildBeats, type BeatBuild } from "./beats";
import { retrievalOf, type LessonContext } from "./context";
import { applyCarry, type CarryBeat } from "./carry";
import { previewCheckHops, previewHops } from "./preview";
import { finishScene } from "./scene";
import { writeOn } from "./style";
import { sentencesOf } from "./sentences";
import type { ArcPlan, LessonScript } from "./types";

export class AssembleError extends Error {
  constructor(readonly errors: string[]) {
    super(`the plan cannot be built:\n- ${errors.join("\n- ")}`);
  }
}

/** The legacy beat kind (spec 1.0.0 vocabulary, still a required field) for each beat kind of the arcs. */
export const LEGACY_KIND: Record<PedagogyBeatKind, LessonBundle["plan"]["beats"][number]["kind"]> = {
  hook: "predict",
  prerequisite: "explain",
  concept: "explore",
  worked: "worked",
  mistake: "explain",
  check: "check",
};
const TEMPLATE_OF_ARC = { problem_first: "problem-first", concept_first: "example-first", misconception_first: "problem-first" } as const;

/** What ADRs 0066 to 0072 added to a lesson, each on by default. All off builds the lesson as it was before them. */
export type Features = { signalling?: boolean; carry?: boolean; motion?: boolean; writeOn?: boolean };

export type AssembleOptions = {
  /** The length to record in the plan, in seconds (the measured length once there is audio). Estimated from the words otherwise. */
  targetLengthS?: number;
  /** How many transitions to add after the first in a beat that has no claims, by beat id: a beat that must last longer for its scene to be read (the build asks for it). */
  extraTransitions?: Readonly<Record<string, number>>;
  /** Switch off what ADR 0066 and 0067 added, to build the lesson as it was before them and compare (the inspection tool, `pnpm lesson:build --baseline`). Both default to on. */
  features?: Features;
};

export type AssembleResult = {
  bundle: LessonBundle;
  builds: BeatBuild[];
  /** The beats whose scene could not be composed: they carry the template scene and a review mark. The reasons are the validator's, per attempt. */
  fallbacks: Array<{ beatId: string; attempts: string[][] }>;
};

const slug = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

/** The id of the lesson generated for a skill in a language: fixed by the two, so a folder for its voice can be made before the lesson exists. */
export const bundleIdFor = (skillId: string, locale: string): string => `bundle.generated.${slug(skillId)}.${locale}`;

/** A rough length of the whole lesson in seconds from its words at the configured speaking rate, with the gaps and tails the resolver adds. */
export function estimateLengthS(sentences: readonly NarrationSentence[], scenes: number): number {
  const ms = sentences.reduce((n, s) => n + syntheticDurationMs(s.text) + SENTENCE_GAP_MS, 0) + scenes * SCENE_TAIL_MS;
  return Math.max(1, Math.ceil(ms / 1000));
}

/**
 * Builds the lesson bundle for a plan and a script (ADR 0061). Code decides everything a gate can check; the plan and the script supply only text:
 *  - the claims of every beat come from the pattern and from the records (`buildBeats`);
 *  - the sentences get their roles and ids from code (`sentencesOf`), the goal sentence is the learning goal word for word;
 *  - each pattern is instantiated from the beat's records, given the sentences it expects, and finished (`finishScene`); a scene that fails validation twice is
 *    replaced by the template scene and marked for human review (`composeScene`);
 *  - the bundle is sealed (hashes), and judged by the gates and the validators afterwards, as any other lesson is.
 * Throws `AssembleError` when the plan cannot be built at all (a source that is not a record, a pattern that cannot be filled, a title that is too long).
 */
export function assembleLesson(ctx: LessonContext, plan: ArcPlan, script: LessonScript, options: AssembleOptions = {}): AssembleResult {
  const built = buildBeats(ctx, plan);
  if (!built.ok) throw new AssembleError(built.errors);
  const transitions = LOCALES[ctx.locale]?.transitions ?? [];

  // expressions and term colours: those of the lesson's skill, of each prerequisite skill a beat draws on, and what the patterns added
  const skills = [...new Set(built.beats.map((b) => b.skillId))];
  const retrievals = [ctx.lesson, ...skills.filter((s) => s !== ctx.skillId).map((s) => retrievalOf(ctx, s)!)];
  const expressions: Record<string, Expr> = Object.assign({}, ...retrievals.map((r) => r.expressions), ...built.beats.map((b) => b.expressions));
  const termColors: Record<string, ColorName> = Object.assign({}, ...retrievals.map((r) => r.termColors));

  const sentences: NarrationSentence[] = [];
  const composed: SceneSpec[] = [];
  const carryBeats: CarryBeat[] = [];
  const fallbacks: AssembleResult["fallbacks"] = [];
  for (const b of built.beats) {
    const mine = sentencesOf(b, script[b.beat.id], transitions, options.extraTransitions?.[b.beat.id] ?? 0);
    sentences.push(...mine.sentences);
    const text = {
      title: b.beat.title,
      // a pause-and-ask needs its question; a beat whose scriptwriter gave none asks its learning goal, which is a question by construction
      prompt: script[b.beat.id]?.prompt ?? b.beat.learningGoal,
      note: script[b.beat.id]?.note ?? "",
      altText: "A scene.",
    };
    const sceneCtx = { sceneId: b.sceneId, beatId: b.beat.id, sourceIds: b.beat.sourceIds, sentences: mine.sentences.map((s) => ({ id: s.id, text: s.text })), expressions, locale: ctx.locale };
    const problem = Object.entries(b.retrieval.expressions).find(([, e]) => e.op === "eq")?.[0] ?? Object.keys(expressions)[0]!;
    const outcome = composeSceneSync(
      sceneCtx,
      () => finishScene(instantiate(b.beat.pattern, b.retrieval, { sceneId: b.sceneId, beatId: b.beat.id, sentenceIds: mine.window, text, motion: options.features?.motion !== false }).scene, b.claims, mine.sentences, expressions, ctx.locale, options.features?.signalling !== false),
      fallbackContent(sceneCtx, b.beat.title, problem, `the ${b.beat.pattern} scene did not validate`),
    );
    composed.push(outcome.scene);
    carryBeats.push({ ctx: sceneCtx, sentences: mine.sentences, claims: b.claims });
    if (outcome.usedFallback) fallbacks.push({ beatId: b.beat.id, attempts: outcome.errors });
  }
  // objects that stay from one scene to the next, and equations that turn into an equivalent one (ADR 0067, 0068); a scene that used the plain template is left alone
  const reviewed = new Set(fallbacks.map((f) => f.beatId));
  // a hook shows its answer as the hops of the worked example (ADR 0072)
  // and a check shows why its answer is right, with the claim that proves the roots it walks out (ADR 0073)
  const provedHere: Claim[] = [];
  const previewed = options.features?.motion === false ? composed : composed.map((s, i) => {
    if (reviewed.has(s.beatId)) return s;
    const [b, c] = [built.beats[i]!, carryBeats[i]!];
    const hooked = previewHops(s, b, c.ctx, c.sentences, c.claims, expressions, ctx.locale);
    const checked = previewCheckHops(hooked, b, c.ctx, c.sentences, c.claims, expressions, ctx.locale);
    provedHere.push(...checked.claims);
    return checked.scene;
  });
  const carried = options.features?.carry === false ? previewed : applyCarry(previewed, carryBeats.map((c, i) => (reviewed.has(composed[i]!.beatId) ? { ...c, claims: [] } : c)), expressions, ctx.locale);
  const scenes = options.features?.writeOn === false ? carried : carried.map(writeOn);

  const claims: Claim[] = [...built.beats.flatMap((b) => b.claims), ...provedHere];
  const sourceIds = [...new Set(built.beats.flatMap((b) => b.beat.sourceIds))];
  const carries = scenes.some((s) => s.cues.some((c) => c.action === "morph") || s.objects.some((o) => o.carryFrom !== undefined));
  const specVersion = carries ? "2.2.0" : claims.some((c) => (CLAIM_KINDS_FROM_2_1 as readonly string[]).includes(c.kind)) ? "2.1.0" : "2.0.0";
  const bundle = seal({
    bundleId: bundleIdFor(ctx.skillId, ctx.locale),
    specVersion,
    skillId: ctx.skillId,
    locale: ctx.locale,
    subjectId: "maths",
    sourceIds,
    expressions,
    ...(Object.keys(termColors).length > 0 ? { termColors } : {}),
    plan: {
      template: TEMPLATE_OF_ARC[plan.arcId],
      targetLengthS: options.targetLengthS ?? estimateLengthS(sentences, scenes.length),
      arcId: plan.arcId,
      level: ctx.level,
      ...(plan.prerequisites.length > 0 ? { prerequisites: plan.prerequisites } : {}),
      beats: built.beats.map((b) => {
        const kind = LEGACY_KIND[b.beatKind];
        const scene = scenes.find((s) => s.beatId === b.beat.id)!;
        const focus = scene.objects.find((o) => o.role !== "static" && o.id !== "title");
        return { id: b.beat.id, kind, title: b.beat.title, animate: kind !== "predict", sourceIds: b.beat.sourceIds, ...(focus ? { cueFocus: focus.id } : {}), beatKind: b.beatKind, slotId: b.beat.slotId, learningGoal: b.beat.learningGoal };
      }),
    },
    script: sentences,
    scenes,
    claims,
  });
  return { bundle, builds: built.beats, fallbacks };
}
