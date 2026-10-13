import { WORD_BUDGET } from "@eve/components";
import { deriveClaims, type ContentRecord, type Retrieval } from "@eve/content";
import { evaluate, num, termIds, type Claim, type Cue, type Expr, type SceneSpec } from "@eve/schema";
import { TITLE_MAX_CHARS, heightCostPx } from "./cost";
import { PatternError, type FillResult, type Instance, type Pattern, type PatternArgs, type Slot } from "./types";

/** The writer slots every pattern has: what the screen says in the student's own words, and the description for screen readers. */
const ALT: Slot = { name: "altText", source: "writer", what: "what the scene shows, for a screen reader", maxChars: 400 };
const TITLE: Slot = { name: "title", source: "writer", what: "a short heading (at most two lines)", maxChars: TITLE_MAX_CHARS, maxWords: WORD_BUDGET.title };
const PROMPT: Slot = { name: "prompt", source: "writer", what: "the question asked of the student, which pauses the lesson", maxChars: 140 };
const PROMPT_OPTIONAL: Slot = { ...PROMPT, optional: true };

const solution = (r: Retrieval): ContentRecord | undefined => r.byKind.solutionSteps[0];
const valueOf = (e: Expr | undefined): number | null => {
  const v = e ? evaluate(e) : null;
  return v === null ? null : Number(v.n) / Number(v.d);
};
const rootsOf = (rec: ContentRecord): Array<{ step: string; expr: Expr; value: number }> =>
  (rec.steps ?? []).flatMap((s) => {
    const e = rec.expressions[s.expr];
    return s.role === "root" && e?.op === "eq" ? [{ step: s.id, expr: e.b, value: valueOf(e.b) ?? NaN }] : [];
  });

/** A cue at the start of the i-th sentence of the beat (the last one if the beat has fewer). */
const cue = (a: PatternArgs, i: number, targetObject: string, action: Cue["action"], minHoldMs: number, at: "start" | "end" = "start"): Cue => ({
  targetObject,
  action,
  anchor: { sentenceId: a.sentenceIds[Math.min(i, a.sentenceIds.length - 1)]!, at },
  minHoldMs,
});

/** Claims of a worked beat, derived from the stored solution; the id carries the beat so the same record can serve two beats. */
const claimsFor = (rec: ContentRecord, beatId: string): Claim[] => deriveClaims(rec, beatId).map((c) => ({ ...c, id: `${c.id}.${beatId}` }));

function scene(a: PatternArgs, recordIds: string[], objects: SceneSpec["objects"], layout: SceneSpec["layout"], cues: Cue[], interactions?: SceneSpec["interactions"]): SceneSpec {
  return {
    id: a.sceneId,
    beatId: a.beatId,
    sourceIds: recordIds,
    objects,
    layout,
    cues,
    ...(interactions && interactions.length > 0 ? { interactions } : {}),
    a11y: { altText: a.text.altText! },
  };
}
const column = (items: string[]): SceneSpec["layout"] => [{ rule: "column", items }];
const ask = (a: PatternArgs, goalExprRef?: string): NonNullable<SceneSpec["interactions"]> =>
  a.text.prompt ? [{ id: `ask.${a.sceneId}`, afterSentenceId: a.sentenceIds.at(-1)!, prompt: a.text.prompt, ...(goalExprRef ? { goalExprRef } : {}) }] : [];

// ---------------------------------------------------------------------------------------------------------------------------------------------------
// 1. colour-bound terms
type ColourContent = { equation: string; recordIds: string[] };
const colourBoundTerms: Pattern<ColourContent> = {
  id: "colour-bound-terms",
  kinds: ["predict", "explore", "explain"],
  pause: "none",
  derivesClaims: false,
  sources: (c) => c.recordIds,
  useWhen: "Show an equation for the first time, with each of its terms in its own colour, so later steps can point at a colour instead of at symbols.",
  components: ["text", "equation"],
  slots: [
    { name: "equation", source: "content", what: "an equation of a passage with at least two named terms, each with a colour in termColors" },
    TITLE,
    ALT,
  ],
  minSentences: 1,
  heightCostPx: heightCostPx(["text (title, one line)", "equation, large"]),
  fill(r): FillResult<ColourContent> {
    for (const rec of r.byKind.passage) {
      for (const [id, e] of Object.entries(rec.expressions)) {
        const terms = [...termIds(e)];
        const colours = terms.map((t) => r.termColors[t]);
        if (e.op === "eq" && terms.length >= 2 && colours.every(Boolean) && new Set(colours).size === colours.length) return { ok: true, content: { equation: id, recordIds: [rec.id] } };
      }
    }
    return { ok: false, missing: ["a passage with an equation of at least two named terms, each with its own colour in termColors"] };
  },
  build(c, a) {
    const cues = [cue(a, 0, "title", "reveal", 800), cue(a, 1, "eq", "reveal", 1500, a.sentenceIds.length > 1 ? "start" : "end")];
    const s = scene(a, c.recordIds, [{ id: "title", component: "text", props: { text: a.text.title!, role: "title" } }, { id: "eq", component: "equation", props: { size: "l" }, exprRef: c.equation }], [...column(["title", "eq"]), { rule: "center", item: "title" }], cues);
    return { scene: s, expressions: {}, claims: [], recordIds: c.recordIds };
  },
};

// ---------------------------------------------------------------------------------------------------------------------------------------------------
// 2. predict then reveal
type PredictContent = { problem: string; answer: string; recordIds: string[] };
const predictThenReveal: Pattern<PredictContent> = {
  id: "predict-then-reveal",
  kinds: ["predict", "check"],
  pause: "required",
  derivesClaims: false,
  sources: (c) => c.recordIds,
  useWhen: "Ask the student to guess a result before it is shown: the problem is on screen, a question pauses the lesson, and the answer appears afterwards.",
  components: ["text", "equation"],
  slots: [
    { name: "problem", source: "content", what: "the equation of a stored solution" },
    { name: "answer", source: "content", what: "the sum step of that solution (an equation of numbers)" },
    TITLE,
    PROMPT,
    ALT,
  ],
  minSentences: 2,
  heightCostPx: heightCostPx(["text (title, one line)", "equation", "equation"]),
  fill(r) {
    const rec = solution(r);
    const sum = rec?.steps?.find((s) => s.role === "sum");
    if (!rec?.problem || !sum) return { ok: false, missing: ["a solutionSteps record with a problem and a sum step"] };
    return { ok: true, content: { problem: rec.problem, answer: sum.expr, recordIds: [rec.id] } };
  },
  build(c, a) {
    const cues = [cue(a, 0, "title", "reveal", 800), cue(a, 0, "problem", "reveal", 1500, "end"), cue(a, a.sentenceIds.length - 1, "answer", "reveal", 1500)];
    const s = scene(
      a,
      c.recordIds,
      [
        { id: "title", component: "text", props: { text: a.text.title!, role: "title" } },
        { id: "problem", component: "equation", props: { size: "m" }, exprRef: c.problem },
        { id: "answer", component: "equation", props: { size: "m" }, exprRef: c.answer },
      ],
      [...column(["title", "problem", "answer"]), { rule: "center", item: "title" }],
      cues,
      ask(a, c.answer).map((q) => ({ ...q, afterSentenceId: a.sentenceIds[a.sentenceIds.length - 2]! })),
    );
    return { scene: s, expressions: {}, claims: [], recordIds: c.recordIds };
  },
};

// ---------------------------------------------------------------------------------------------------------------------------------------------------
// 3. hops on a number line
type HopsContent = { rec: ContentRecord; problem: string; total: string; stops: number[]; focus: string[] };
const hopsOnNumberLine: Pattern<HopsContent> = {
  id: "hops-on-number-line",
  kinds: ["worked"],
  pause: "required",
  derivesClaims: true,
  sources: (c) => [c.rec.id],
  useWhen: "Add numbers as hops along a number line, one hop per root, with a bracket under the whole length labelled by the sum. For a worked beat that adds the roots.",
  components: ["equation", "numberLine"],
  slots: [
    { name: "problem", source: "content", what: "the equation of a stored solution" },
    { name: "roots", source: "content", what: "the root steps of that solution: whole numbers, one hop each (one to three)" },
    { name: "total", source: "content", what: "the sum step of that solution, the label of the bracket" },
    PROMPT,
    ALT,
  ],
  minSentences: 2,
  heightCostPx: heightCostPx(["equation", "numberLine"]),
  fill(r) {
    const rec = solution(r);
    if (!rec?.problem) return { ok: false, missing: ["a solutionSteps record"] };
    const roots = rootsOf(rec);
    const sum = rec.steps?.find((s) => s.role === "sum");
    const missing: string[] = [];
    if (!r.expressions[rec.problem]) missing.push(`the problem equation ${rec.problem}`);
    if (roots.length < 1 || roots.length > 3) missing.push("one to three root steps");
    if (roots.some((x) => !Number.isInteger(x.value))) missing.push("whole-number roots (a hop is a whole step)");
    if (!sum) missing.push("a sum step");
    if (!sum || !rec.expressions[sum.expr]) missing.push("the expression of the sum step");
    if (missing.length > 0) return { ok: false, missing };
    const stops = roots.reduce<number[]>((acc, x) => [...acc, acc.at(-1)! + x.value], [0]);
    // The term of the problem that the sum is about stays bright; the other terms dim when the hops begin.
    const sumTerms = termIds(rec.expressions[sum!.expr]!);
    const problemTerms = [...termIds(r.expressions[rec.problem]!)];
    const kept = problemTerms.filter((t) => sumTerms.has(t));
    return { ok: true, content: { rec, problem: rec.problem, total: sum!.expr, stops, focus: kept.length > 0 ? problemTerms.filter((t) => !sumTerms.has(t)) : [] } };
  },
  build(c, a) {
    const exprs: Record<string, Expr> = Object.fromEntries(c.stops.map((v, i) => [`${a.sceneId}.stop.${i}`, num(v)]));
    const stopId = (i: number) => `${a.sceneId}.stop.${i}`;
    const hops = c.stops.slice(1).map((_v, i) => ({ from: stopId(i), to: stopId(i + 1), ...(i > 0 ? { color: "green" as const } : {}) }));
    const lo = Math.floor(Math.min(...c.stops)) - (Math.min(...c.stops) < 0 ? 1 : 0);
    const hi = Math.ceil(Math.max(...c.stops)) + 1;
    const cues: Cue[] = [
      ...c.focus.map((t) => cue(a, 0, `eq#${t}`, "dim", 0, "end")),
      ...hops.map((_h, i) => cue(a, i, `line#hop${i}`, "draw", 800)),
      cue(a, a.sentenceIds.length - 1, "line#bracket0", "draw", 800),
    ];
    const s = scene(
      a,
      [c.rec.id],
      [
        { id: "eq", component: "equation", props: { size: "m" }, exprRef: c.problem },
        { id: "line", component: "numberLine", props: { min: Math.min(0, lo), max: hi, hops, brackets: [{ span: "hops", label: c.total }] } },
      ],
      [...column(["eq", "line"]), { rule: "center", item: "line" }],
      cues,
      ask(a, c.total),
    );
    return { scene: s, expressions: exprs, claims: claimsFor(c.rec, a.beatId), recordIds: [c.rec.id] };
  },
};

// ---------------------------------------------------------------------------------------------------------------------------------------------------
// 4. plot and mark the roots
type PlotContent = { problem: string; fn: string; window: { xMin: number; xMax: number; yMin: number; yMax: number }; roots: number; recordIds: string[] };
const plotAndMarkRoots: Pattern<PlotContent> = {
  id: "plot-and-mark-roots",
  kinds: ["explore", "explain"],
  pause: "none",
  derivesClaims: false,
  sources: (c) => c.recordIds,
  useWhen: "Draw the curve of an equation and mark where it crosses the axis: the roots appear one by one, found from the expression, never typed.",
  components: ["equation", "functionGraph"],
  slots: [
    { name: "problem", source: "content", what: "the equation of a stored solution" },
    { name: "plot", source: "content", what: "a passage with a plot: the function and its window" },
    { name: "roots", source: "content", what: "the root steps of the stored solution (how many roots to mark)" },
    ALT,
  ],
  minSentences: 2,
  heightCostPx: heightCostPx(["equation", "functionGraph"]),
  fill(r) {
    const rec = solution(r);
    const passage = r.byKind.passage.find((p) => p.plot);
    const missing: string[] = [];
    if (!rec?.problem) missing.push("a solutionSteps record");
    if (!passage?.plot) missing.push("a passage with a plot");
    const roots = rec ? rootsOf(rec).length : 0;
    if (rec && roots === 0) missing.push("root steps");
    if (missing.length > 0) return { ok: false, missing };
    const { expr, ...window } = passage!.plot!;
    return { ok: true, content: { problem: rec!.problem!, fn: expr, window, roots, recordIds: [passage!.id, rec!.id] } };
  },
  build(c, a) {
    const cues: Cue[] = [cue(a, 0, "graph#curve", "draw", 800), ...Array.from({ length: c.roots }, (_x, i) => cue(a, i + 1, `graph#root${i}`, "pop", 300))];
    const s = scene(
      a,
      c.recordIds,
      [
        { id: "eq", component: "equation", props: { size: "m" }, exprRef: c.problem },
        { id: "graph", component: "functionGraph", props: { ...c.window, roots: true }, exprRef: c.fn },
      ],
      [...column(["eq", "graph"]), { rule: "center", item: "graph" }],
      cues,
    );
    return { scene: s, expressions: {}, claims: [], recordIds: c.recordIds };
  },
};

// ---------------------------------------------------------------------------------------------------------------------------------------------------
// 5. step-by-step worked example
type StepsContent = { rec: ContentRecord; problem: string; steps: string[] };
const MAX_STEPS = 3;
const stepByStep: Pattern<StepsContent> = {
  id: "step-by-step-worked-example",
  kinds: ["worked"],
  pause: "optional",
  derivesClaims: true,
  sources: (c) => [c.rec.id],
  useWhen: "Show a stored solution as its steps, one under another, below the problem. For a worked beat: its claims are derived from the stored steps.",
  components: ["equation", "stepList"],
  slots: [
    { name: "problem", source: "content", what: "the equation of a stored solution" },
    { name: "steps", source: "content", what: `the first ${MAX_STEPS} steps of that solution that are not notes` },
    PROMPT_OPTIONAL,
    ALT,
  ],
  minSentences: 2,
  heightCostPx: heightCostPx(["equation", "stepList, 3 steps"]),
  fill(r) {
    const rec = solution(r);
    if (!rec?.problem) return { ok: false, missing: ["a solutionSteps record"] };
    const steps = (rec.steps ?? []).filter((s) => s.role !== "note").slice(0, MAX_STEPS).map((s) => s.expr);
    if (steps.length === 0) return { ok: false, missing: ["steps that are not notes"] };
    return { ok: true, content: { rec, problem: rec.problem, steps } };
  },
  build(c, a) {
    const s = scene(
      a,
      [c.rec.id],
      [
        { id: "eq", component: "equation", props: { size: "m" }, exprRef: c.problem },
        { id: "steps", component: "stepList", props: { steps: c.steps } },
      ],
      column(["eq", "steps"]),
      [cue(a, 0, "eq", "reveal", 1000), cue(a, 1, "steps", "reveal", 2000)],
      ask(a),
    );
    return { scene: s, expressions: {}, claims: claimsFor(c.rec, a.beatId), recordIds: [c.rec.id] };
  },
};

// ---------------------------------------------------------------------------------------------------------------------------------------------------
// 6. common-mistake contrast
type ContrastContent = { wrong: string; right: string; recordIds: string[] };
const commonMistakeContrast: Pattern<ContrastContent> = {
  id: "common-mistake-contrast",
  kinds: ["explain", "check"],
  pause: "none",
  derivesClaims: false,
  sources: (c) => c.recordIds,
  useWhen: "Put a typical wrong statement next to the right one: the mistake appears first, then the correct version, and the mistake fades.",
  components: ["text", "equation"],
  slots: [{ name: "contrast", source: "content", what: "a misconception record: the wrong and the right statement, as expressions" }, TITLE, ALT],
  minSentences: 2,
  heightCostPx: heightCostPx(["text (title, one line)", "equation", "equation"]),
  fill(r) {
    const rec = r.byKind.misconception.find((m) => m.contrast);
    if (!rec?.contrast) return { ok: false, missing: ["a misconception record with a contrast"] };
    return { ok: true, content: { wrong: rec.contrast.wrong, right: rec.contrast.right, recordIds: [rec.id] } };
  },
  build(c, a) {
    const cues = [cue(a, 0, "title", "reveal", 800), cue(a, 0, "wrong", "reveal", 1500, "end"), cue(a, 1, "right", "reveal", 1500), cue(a, 1, "wrong", "dim", 0)];
    const s = scene(
      a,
      c.recordIds,
      [
        { id: "title", component: "text", props: { text: a.text.title!, role: "title" } },
        { id: "wrong", component: "equation", props: { size: "m" }, exprRef: c.wrong },
        { id: "right", component: "equation", props: { size: "m" }, exprRef: c.right },
      ],
      [...column(["title", "wrong", "right"]), { rule: "center", item: "title" }],
      cues,
    );
    return { scene: s, expressions: {}, claims: [], recordIds: c.recordIds };
  },
};

// ---------------------------------------------------------------------------------------------------------------------------------------------------
/** The closed list. A composer may choose from these and from nothing else; adding one is a code change with a test. */
export const PATTERNS = [colourBoundTerms, predictThenReveal, hopsOnNumberLine, plotAndMarkRoots, stepByStep, commonMistakeContrast] as const;
export type PatternId = (typeof PATTERNS)[number]["id"];
export const PATTERN_IDS: readonly PatternId[] = PATTERNS.map((p) => p.id);

type Any = { id: string; slots: readonly Slot[]; minSentences: number; fill(r: Retrieval): FillResult<unknown>; sources(c: never): string[]; build(c: never, a: PatternArgs): Instance };
const byId = (id: string): Any => {
  const p = (PATTERNS as unknown as readonly Any[]).find((x) => x.id === id);
  if (!p) throw new PatternError(`unknown pattern ${id}: the list is closed (${PATTERN_IDS.join(", ")})`);
  return p;
};

/** Can this pattern be used with these records? A pattern is usable only if every content slot can be filled from them. */
export function usable(id: string, r: Retrieval): FillResult<unknown> {
  return byId(id).fill(r);
}

/** The ids of the records a pattern would be built from, or undefined if it cannot be used with these records. */
export function patternSources(id: string, r: Retrieval): string[] | undefined {
  const p = byId(id);
  const filled = p.fill(r);
  return filled.ok ? p.sources(filled.content as never) : undefined;
}

/** The patterns usable with these records, in list order. This is what the planner may choose from. */
export function usablePatterns(r: Retrieval): PatternId[] {
  return PATTERN_IDS.filter((id) => byId(id).fill(r).ok);
}

/**
 * Builds a scene from a pattern. Refuses (PatternError) if a content slot cannot be filled from the records, a writer slot is missing, empty, too long
 * or holds maths, or the beat has too few sentences. Never returns a half-filled scene.
 */
export function instantiate(id: string, r: Retrieval, args: PatternArgs): Instance {
  const p = byId(id);
  const filled = p.fill(r);
  if (!filled.ok) throw new PatternError(`pattern ${id} cannot be used: missing ${filled.missing.join("; ")}`);
  if (args.sentenceIds.length < p.minSentences) throw new PatternError(`pattern ${id} needs at least ${p.minSentences} sentence(s) in the beat, got ${args.sentenceIds.length}`);
  for (const slot of p.slots.filter((s) => s.source === "writer")) {
    const v = args.text[slot.name];
    if (v === undefined || v.trim() === "") {
      if (slot.optional) continue;
      throw new PatternError(`pattern ${id}: the writer slot ${slot.name} is empty`);
    }
    if (slot.maxChars !== undefined && v.length > slot.maxChars) throw new PatternError(`pattern ${id}: ${slot.name} is ${v.length} characters, the limit is ${slot.maxChars}`);
    if (slot.maxWords !== undefined && v.trim().split(/\s+/).length > slot.maxWords) throw new PatternError(`pattern ${id}: ${slot.name} has ${v.trim().split(/\s+/).length} words, the limit is ${slot.maxWords}`);
  }
  return p.build(filled.content as never, args);
}

const VISUAL_COMPONENTS = new Set(["numberLine", "functionGraph", "shape", "fractionBar", "areaModel", "balanceScale", "table"]);
/** A pattern is text-heavy when none of its components is a picture or a diagram: it shows words and equations only. Derived from the components, never typed. */
export const isTextHeavy = (p: { components: readonly string[] }): boolean => !p.components.some((c) => VISUAL_COMPONENTS.has(c));

/** The catalogue the planner and composer prompts are given: id, when to use, components, slots, minimum sentences and height cost. */
export function catalogue() {
  return PATTERNS.map((p) => ({ id: p.id, useWhen: p.useWhen, kinds: p.kinds, pause: p.pause, derivesClaims: p.derivesClaims, textHeavy: isTextHeavy(p), components: p.components, slots: p.slots, minSentences: p.minSentences, heightCostPx: p.heightCostPx }));
}
