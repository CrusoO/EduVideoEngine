import { WORD_BUDGET, quadraticOf, quadraticRoots, wholeRootsOfEquation } from "@eve/components";
import { deriveClaims, recallAnswerClaim, type ContentRecord, type Retrieval } from "@eve/content";
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
  beatKinds: ["prerequisite", "concept"],
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
  beatKinds: ["hook", "check"],
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
  beatKinds: ["worked"],
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

/**
 * The number line of the hops of a stored solution, as an object of a scene, with the expressions of its stops: for a beat that shows the hops without being the
 * worked example (the hook shows them with its answer, ADR 0072). Null when the solution cannot be hopped (no whole-number roots, no sum step).
 */
export type HopLine = { object: SceneSpec["objects"][number]; expressions: Record<string, Expr>; hops: number };

/** The number line of hops through `stops` (the first is 0), with the total bracketed and labelled by the expression `total`. */
function hopLine(sceneId: string, stops: readonly number[], total: string): HopLine {
  const stopId = (i: number) => `${sceneId}.stop.${i}`;
  const expressions: Record<string, Expr> = Object.fromEntries(stops.map((v, i) => [stopId(i), num(v)]));
  const hops = stops.slice(1).map((_v, i) => ({ from: stopId(i), to: stopId(i + 1), ...(i > 0 ? { color: "green" as const } : {}) }));
  const lo = Math.floor(Math.min(...stops)) - (Math.min(...stops) < 0 ? 1 : 0);
  const hi = Math.ceil(Math.max(...stops)) + 1;
  return { object: { id: "line", component: "numberLine", props: { min: Math.min(0, lo), max: hi, hops, brackets: [{ span: "hops", label: total }] } }, expressions, hops: hops.length };
}

export function hopsPreview(r: Retrieval, sceneId: string): HopLine | null {
  const filled = hopsOnNumberLine.fill(r);
  return filled.ok ? hopLine(sceneId, filled.content.stops, filled.content.total) : null;
}

/**
 * The hops of a recall question whose answer is the sum of the roots (ADR 0073): the roots are found from the question's equation by code (`wholeRootsOfEquation`,
 * each checked by exact substitution), and come with the `roots` claim that SymPy proves, so what the line shows is proved before it is shown. The bracket is
 * labelled with the question's own answer equation, which the number line checks against the length it spans. Null for any other kind of question.
 */
export function checkHops(r: Retrieval, sceneId: string, beatId: string): (HopLine & { claim: Claim }) | null {
  const filled = checkQuestion.fill(r);
  if (!filled.ok) return null;
  const { rec, problem, answer } = filled.content;
  const equation = r.expressions[problem];
  const roots = equation ? wholeRootsOfEquation(equation) : null;
  if (rec.answerKind !== "sum-of-roots" || !roots) return null;
  const stops = roots.reduce<number[]>((acc, v) => [...acc, acc.at(-1)! + v], [0]);
  const claim: Claim = { id: `${rec.id}.roots.${beatId}`, beatId, kind: "roots", equation: problem, values: roots.map((v) => num(v)), sourceIds: [rec.id], claimMode: "computed", importance: "support" };
  return { ...hopLine(sceneId, stops, answer), claim };
}

// ---------------------------------------------------------------------------------------------------------------------------------------------------
// 4. plot and mark the roots
type Window = { xMin: number; xMax: number; yMin: number; yMax: number };
type PlotContent = { problem: string; fn: string; window: Window; roots: number; recordIds: string[]; sweep: { window: Window; factor: { from: number; to: number; min: number; max: number } } | null };

/** How long the sweep of a plotted quadratic runs (ADR 0070). */
const SWEEP_HOLD_MS = 3500;
const SWEEP_TO = 1.4;
const SWEEP_MIN = 0.6;
/**
 * A plotted quadratic with two positive roots can be swept: its x-coefficient is multiplied by a factor that goes from 1 up to 1.4 and back, and the student may
 * drag it between 0.6 and 1.4 while the lesson is paused. The window is widened so both roots stay on it at every factor. Null for any other function.
 */
function sweepOf(f: Expr | undefined, w: Window): PlotContent["sweep"] {
  const q = f ? quadraticOf(f) : null;
  if (!q || q.a <= 0 || q.b >= 0 || q.c <= 0 || quadraticRoots(q).length !== 2) return null;
  const far = quadraticRoots({ ...q, b: q.b * SWEEP_TO });
  const deepest = q.c - (q.b * SWEEP_TO) ** 2 / (4 * q.a);
  return { window: { xMin: Math.min(w.xMin, 0), xMax: Math.max(w.xMax, Math.ceil(far[1]!) + 1), yMin: Math.min(w.yMin, Math.floor(deepest) - 1), yMax: w.yMax }, factor: { from: 1, to: SWEEP_TO, min: SWEEP_MIN, max: SWEEP_TO } };
}
const plotAndMarkRoots: Pattern<PlotContent> = {
  id: "plot-and-mark-roots",
  beatKinds: ["concept"],
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
    return { ok: true, content: { problem: rec!.problem!, fn: expr, window, roots, recordIds: [passage!.id, rec!.id], sweep: sweepOf(r.expressions[expr], window) } };
  },
  build(c, a) {
    const cues: Cue[] = [cue(a, 0, "graph#curve", "draw", 800), ...Array.from({ length: c.roots }, (_x, i) => cue(a, i + 1, `graph#root${i}`, "pop", 300))];
    // the sweep starts on the sentence after the last root appears, so the viewer has seen the curve and its roots before they move
    const sweep = a.motion === true ? c.sweep : null;
    if (sweep) cues.push(cue(a, c.roots + 1, "graph", "morph", SWEEP_HOLD_MS));
    const s = scene(
      a,
      c.recordIds,
      [
        { id: "eq", component: "equation", props: { size: "m" }, exprRef: c.problem },
        { id: "graph", component: "functionGraph", props: sweep ? { ...sweep.window, roots: true, sweep: { ...sweep.factor, readout: true, roundTrip: true } } : { ...c.window, roots: true }, exprRef: c.fn },
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
  beatKinds: ["worked"],
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
  beatKinds: ["hook", "mistake"],
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
// ---------------------------------------------------------------------------------------------------------------------------------------------------
// 7. recap card (CO-2, ADR 0038): a claim of the lesson shown as a card, for a prerequisite or a concept beat
type RecapContent = { rec: ContentRecord; shown: string };
const claimExpression = (c: NonNullable<ContentRecord["claim"]>): string => (c.kind === "equivalent" ? c.b : c.kind === "roots" ? c.equation : c.equals);
const recapCard: Pattern<RecapContent> = {
  id: "recap-card",
  beatKinds: ["prerequisite", "concept"],
  kinds: ["explain"],
  pause: "none",
  derivesClaims: false,
  sources: (c) => [c.rec.id],
  useWhen: "Show one stated fact of the lesson on a card: a title and the equation that states it. For a prerequisite recap or a short concept beat. Brings the fact's claim to the bundle.",
  components: ["text", "equation"],
  slots: [{ name: "claim", source: "content", what: "a conceptClaim record whose computed claim states an equation" }, TITLE, ALT],
  minSentences: 2,
  heightCostPx: heightCostPx(["text (title, one line)", "equation, large"]),
  fill(r): FillResult<RecapContent> {
    const rec = r.byKind.conceptClaim.find((c) => c.claimMode === "computed" && c.claim);
    return rec?.claim ? { ok: true, content: { rec, shown: claimExpression(rec.claim) } } : { ok: false, missing: ["a conceptClaim record with a computed claim that states an equation"] };
  },
  build(c, a) {
    // With motion, a fact that states an equivalence is shown as the first equation turning into the second, on the sentence that says it (ADR 0072)
    const stated = c.rec.claim!;
    const turns = a.motion === true && stated.kind === "equivalent" && stated.a !== stated.b;
    const cues = turns ? [cue(a, 0, "title", "reveal", 800), cue(a, 0, "fact", "reveal", 1500), cue(a, 0, "fact", "morph", 700, "end")] : [cue(a, 0, "title", "reveal", 800), cue(a, 1, "fact", "reveal", 1500)];
    const props = turns && stated.kind === "equivalent" ? { size: "l", from: stated.a } : { size: "l" };
    const s = scene(a, [c.rec.id], [{ id: "title", component: "text", props: { text: a.text.title!, role: "title" } }, { id: "fact", component: "equation", props, exprRef: c.shown }], [...column(["title", "fact"]), { rule: "center", item: "title" }], cues);
    const claim = { ...c.rec.claim!, id: `${c.rec.id}.${a.beatId}`, beatId: a.beatId, sourceIds: [c.rec.id], claimMode: c.rec.claimMode!, importance: c.rec.importance! } as Claim;
    return { scene: s, expressions: {}, claims: [claim], recordIds: [c.rec.id] };
  },
};

// ---------------------------------------------------------------------------------------------------------------------------------------------------
// 8. check question (CO-2, ADR 0033): a recall question from a practiceQuestion record; the lesson pauses and asks
type CheckContent = { rec: ContentRecord; problem: string; answer: string; answerExpr: Expr };
const checkQuestion: Pattern<CheckContent> = {
  id: "check-question",
  beatKinds: ["check"],
  kinds: ["check"],
  pause: "required",
  derivesClaims: false,
  sources: (c) => [c.rec.id],
  useWhen: "Pause and ask a recall question from a stored practice question: the equation is on screen, the lesson stops for the answer, and the verified answer appears after.",
  components: ["text", "equation"],
  slots: [{ name: "question", source: "content", what: "a practiceQuestion record of type recall: its problem and its verified answer" }, TITLE, PROMPT, ALT],
  minSentences: 2,
  heightCostPx: heightCostPx(["text (title, one line)", "equation", "equation"]),
  fill(r): FillResult<CheckContent> {
    // one answer equation on screen: the kinds with a list of answers (roots) wait for a pattern that shows a list
    const rec = r.byKind.practiceQuestion.find((q) => q.questionType === "recall" && q.question?.answer !== undefined && q.answerKind !== "roots");
    const answer = rec?.question?.answer;
    const answerExpr = answer === undefined ? undefined : r.expressions[answer];
    return rec?.question && answer !== undefined && answerExpr ? { ok: true, content: { rec, problem: rec.question.problem, answer, answerExpr } } : { ok: false, missing: ["a practiceQuestion record of type recall with one answer equation"] };
  },
  build(c, a) {
    const cues = [cue(a, 0, "title", "reveal", 800), cue(a, 0, "problem", "reveal", 1500, "end"), cue(a, a.sentenceIds.length - 1, "answer", "reveal", 1500)];
    const s = scene(
      a,
      [c.rec.id],
      [
        { id: "title", component: "text", props: { text: a.text.title!, role: "title" } },
        { id: "problem", component: "equation", props: { size: "m" }, exprRef: c.problem },
        { id: "answer", component: "equation", props: { size: "m" }, exprRef: c.answer },
      ],
      [...column(["title", "problem", "answer"]), { rule: "center", item: "title" }],
      cues,
      ask(a, c.answer).map((q) => ({ ...q, afterSentenceId: a.sentenceIds[a.sentenceIds.length - 2]! })),
    );
    // the claim the verifier proves depends on the answer kind of the record (the sum or the product of the roots, or the solution)
    const made = recallAnswerClaim(c.rec, (id) => (id === c.answer ? c.answerExpr : undefined), `${c.rec.id}.answer.${a.beatId}`, a.beatId);
    if (typeof made === "string") throw new PatternError(`pattern check-question: ${made}`);
    const claim: Claim = { ...made, sourceIds: [c.rec.id], claimMode: "computed", importance: "core" };
    return { scene: s, expressions: {}, claims: [claim], recordIds: [c.rec.id] };
  },
};

// ---------------------------------------------------------------------------------------------------------------------------------------------------
// 9. statement card (ADR 0062): one grounded fact said in words on a card, with no equation for a gate to tie to a claim
type StatementContent = { rec: ContentRecord };
const NOTE: Slot = { name: "note", source: "writer", what: "the fact in a few words, shown on the card (no digits, no maths)", maxChars: 70, maxWords: WORD_BUDGET.label };
const statementCard: Pattern<StatementContent> = {
  id: "statement-card",
  beatKinds: ["prerequisite", "concept", "mistake"],
  kinds: ["explain"],
  pause: "none",
  derivesClaims: false,
  sources: (c) => [c.rec.id],
  useWhen: "Say one stated fact in words on a card: a title and a short line, with no equation. For a definition, or for a common mistake and why it fails, where the claim is prose that a person approves.",
  components: ["text"],
  slots: [{ name: "claim", source: "content", what: "a conceptClaim record whose claim is grounded prose" }, TITLE, NOTE, ALT],
  minSentences: 2,
  // the note may take two lines of the label size
  heightCostPx: heightCostPx(["text (title, one line)", "text (label, one line)", "text (label, one line)"]),
  fill(r): FillResult<StatementContent> {
    const rec = r.byKind.conceptClaim.find((c) => c.claimMode === "grounded");
    return rec ? { ok: true, content: { rec } } : { ok: false, missing: ["a conceptClaim record with a grounded claim"] };
  },
  build(c, a) {
    const cues = [cue(a, 0, "title", "reveal", 800), cue(a, 1, "note", "reveal", 1500)];
    const s = scene(
      a,
      [c.rec.id],
      [
        { id: "title", component: "text", props: { text: a.text.title!, role: "title" } },
        { id: "note", component: "text", props: { text: a.text.note!, role: "label" } },
      ],
      [...column(["title", "note"]), { rule: "center", item: "title" }, { rule: "center", item: "note" }],
      cues,
    );
    return { scene: s, expressions: {}, claims: [], recordIds: [c.rec.id] };
  },
};

// ---------------------------------------------------------------------------------------------------------------------------------------------------
// 10 and 11. the neuron patterns (ADR 0076): a patch of pixels, and the weights and products that go with it. They read the `grids` of a passage.
type Grid = { cols: number; cells: string[]; tint: "brightness" | "signed"; label?: string };
const gridOf = (r: Retrieval, name: string): { grid: Grid; rec: ContentRecord } | undefined => {
  for (const rec of r.byKind.passage) {
    const grid = rec.grids?.[name];
    if (grid) return { grid, rec };
  }
  return undefined;
};
const tableProps = (g: Grid) => ({ cols: g.cols, cells: g.cells, tint: g.tint, ...(g.label ? { label: g.label } : {}) });

type PatchContent = { pixels: Grid; recordIds: string[] };
const patchHook: Pattern<PatchContent> = {
  id: "patch-hook",
  beatKinds: ["hook"],
  kinds: ["predict"],
  pause: "optional",
  derivesClaims: false,
  sources: (c) => c.recordIds,
  useWhen: "Open on a small patch of pixels drawn as a grid of numbers, each as bright as its value, and ask what a neuron would make of it. For a hook of a lesson about a neuron or any lesson that starts from a picture made of numbers.",
  components: ["text", "table"],
  slots: [{ name: "pixels", source: "content", what: "a passage with a grid named pixels: whole rows of numbers from 0 (dark) to 1 (bright)" }, TITLE, PROMPT_OPTIONAL, ALT],
  minSentences: 2,
  heightCostPx: heightCostPx(["text (title, one line)", "table, 2 by 2"]),
  fill(r): FillResult<PatchContent> {
    const found = gridOf(r, "pixels");
    return found && found.grid.tint === "brightness" ? { ok: true, content: { pixels: found.grid, recordIds: [found.rec.id] } } : { ok: false, missing: ["a passage with a brightness grid named pixels"] };
  },
  build(c, a) {
    const cues = [cue(a, 0, "title", "reveal", 800), cue(a, 0, "pixels", "reveal", 1500, "end"), ...c.pixels.cells.map((_x, i) => cue(a, a.sentenceIds.length - 1, `pixels#cell${i}`, "pop", 300))];
    const s = scene(
      a,
      c.recordIds,
      [
        { id: "title", component: "text", props: { text: a.text.title!, role: "title" } },
        { id: "pixels", component: "table", props: tableProps(c.pixels) },
      ],
      [...column(["title", "pixels"]), { rule: "center", item: "title" }, { rule: "center", item: "pixels" }],
      cues,
      ask(a),
    );
    return { scene: s, expressions: {}, claims: [], recordIds: c.recordIds };
  },
};

type WeightsContent = { grids: [Grid, Grid, Grid]; recordIds: string[] };
const weightsOnPixels: Pattern<WeightsContent> = {
  id: "weights-on-pixels",
  beatKinds: ["concept"],
  kinds: ["explain"],
  pause: "none",
  derivesClaims: false,
  sources: (c) => c.recordIds,
  useWhen: "Set the pixels of a strip, a weight for each, and each pixel times its weight one under another as three grids, so the sum a neuron takes is visible before it is added. For the concept beat of a neuron.",
  components: ["text", "table"],
  slots: [{ name: "grids", source: "content", what: "a passage with three grids of the same size: pixels (brightness), weights (signed) and products (signed)" }, TITLE, ALT],
  minSentences: 2,
  heightCostPx: heightCostPx(["text (title, one line)", "table, 2 by 2"]),
  fill(r): FillResult<WeightsContent> {
    const [px, w, pr] = ["pixels", "weights", "products"].map((n) => gridOf(r, n));
    if (!px || !w || !pr) return { ok: false, missing: ["a passage with the grids pixels, weights and products"] };
    const same = px.grid.cells.length === w.grid.cells.length && w.grid.cells.length === pr.grid.cells.length;
    if (!same) return { ok: false, missing: ["pixels, weights and products with the same number of cells"] };
    return { ok: true, content: { grids: [px.grid, w.grid, pr.grid], recordIds: [...new Set([px.rec.id, w.rec.id, pr.rec.id])] } };
  },
  build(c, a) {
    const [pixels, weights, products] = c.grids;
    const cues = [cue(a, 0, "title", "reveal", 800), cue(a, 0, "pixels", "reveal", 1500), cue(a, 1, "weights", "reveal", 1500), cue(a, 2, "products", "reveal", 1500)];
    const s = scene(
      a,
      c.recordIds,
      [
        { id: "title", component: "text", props: { text: a.text.title!, role: "title" } },
        { id: "pixels", component: "table", props: tableProps(pixels) },
        { id: "weights", component: "table", props: tableProps(weights) },
        { id: "products", component: "table", props: tableProps(products) },
      ],
      [...column(["title", "pixels", "weights", "products"]), { rule: "center", item: "title" }, { rule: "center", item: "pixels" }, { rule: "center", item: "weights" }, { rule: "center", item: "products" }],
      cues,
    );
    return { scene: s, expressions: {}, claims: [], recordIds: c.recordIds };
  },
};

type SumOnGridContent = { rec: ContentRecord; problem: string; steps: string[]; products: Grid; recordIds: string[] };
const workedSumOnGrid: Pattern<SumOnGridContent> = {
  id: "worked-sum-on-grid",
  beatKinds: ["worked"],
  kinds: ["worked"],
  pause: "optional",
  derivesClaims: true,
  sources: (c) => c.recordIds,
  useWhen: "Work a sum of products from a stored solution with the products drawn as a grid above the steps: the problem, the grid of each product, then the steps that add them. For a worked beat of a weighted sum.",
  components: ["equation", "table", "stepList"],
  slots: [
    { name: "problem", source: "content", what: "the equation of a stored solution" },
    { name: "products", source: "content", what: "a passage with a grid named products" },
    { name: "steps", source: "content", what: `the first ${MAX_STEPS} steps of that solution that are not notes` },
    PROMPT_OPTIONAL,
    ALT,
  ],
  minSentences: 2,
  heightCostPx: heightCostPx(["equation", "table, 2 by 2", "stepList, 3 steps"]),
  fill(r): FillResult<SumOnGridContent> {
    const rec = solution(r);
    const found = gridOf(r, "products");
    if (!rec?.problem) return { ok: false, missing: ["a solutionSteps record"] };
    if (!found) return { ok: false, missing: ["a passage with a grid named products"] };
    const steps = (rec.steps ?? []).filter((s) => s.role !== "note").slice(0, MAX_STEPS).map((s) => s.expr);
    if (steps.length === 0) return { ok: false, missing: ["steps that are not notes"] };
    return { ok: true, content: { rec, problem: rec.problem, steps, products: found.grid, recordIds: [rec.id, found.rec.id] } };
  },
  build(c, a) {
    const s = scene(
      a,
      c.recordIds,
      [
        { id: "eq", component: "equation", props: { size: "m" }, exprRef: c.problem },
        { id: "products", component: "table", props: tableProps(c.products) },
        { id: "steps", component: "stepList", props: { steps: c.steps } },
      ],
      [...column(["eq", "products", "steps"]), { rule: "center", item: "products" }],
      [cue(a, 0, "eq", "reveal", 1000), cue(a, 0, "products", "reveal", 1500, "end"), cue(a, 1, "steps", "reveal", 2000)],
      ask(a),
    );
    return { scene: s, expressions: {}, claims: claimsFor(c.rec, a.beatId), recordIds: c.recordIds };
  },
};

// ---------------------------------------------------------------------------------------------------------------------------------------------------
// 12. circuit scene (ADR 0082): a battery, a resistor and a meter in one loop, drawn on a step at a time, then the current set going round
type CircuitContent = { circuit: NonNullable<ContentRecord["circuit"]>; recordIds: string[] };
const circuitScene: Pattern<CircuitContent> = {
  id: "circuit-scene",
  beatKinds: ["hook", "concept"],
  kinds: ["predict", "explain"],
  pause: "none",
  derivesClaims: false,
  sources: (c) => c.recordIds,
  useWhen: "Draw a simple electric circuit: the wires, then the battery, the resistor and the meter, each with its value, and then the current as dots going round the loop. For a lesson about current, voltage or resistance.",
  components: ["text", "circuit"],
  slots: [{ name: "circuit", source: "content", what: "a passage with a circuit: a battery, a resistor and (optionally) a meter, each an expression that is a number" }, TITLE, ALT],
  minSentences: 2,
  heightCostPx: heightCostPx(["text (title, one line)", "circuit"]),
  fill(r): FillResult<CircuitContent> {
    const rec = r.byKind.passage.find((p) => p.circuit && !p.circuit.sweep) ?? r.byKind.passage.find((p) => p.circuit);
    return rec?.circuit ? { ok: true, content: { circuit: rec.circuit, recordIds: [rec.id] } } : { ok: false, missing: ["a passage with a circuit"] };
  },
  build(c, a) {
    const cues = [
      cue(a, 0, "title", "reveal", 800),
      cue(a, 0, "circuit#wires", "draw", 1500),
      cue(a, 1, "circuit#battery", "pop", 600),
      cue(a, 1, "circuit#resistor", "pop", 400),
      ...(c.circuit.meter ? [cue(a, 2, "circuit#meter", "pop", 400)] : []),
      cue(a, Math.min(2, a.sentenceIds.length - 1), "circuit#flow", "reveal", 600),
    ];
    const s = scene(
      a,
      c.recordIds,
      [
        { id: "title", component: "text", props: { text: a.text.title!, role: "title" } },
        { id: "circuit", component: "circuit", props: c.circuit },
      ],
      [...column(["title", "circuit"]), { rule: "center", item: "title" }, { rule: "center", item: "circuit" }],
      cues,
    );
    return { scene: s, expressions: {}, claims: [], recordIds: c.recordIds };
  },
};

// ---------------------------------------------------------------------------------------------------------------------------------------------------
// 13. magnet and coil scene (ADR 0083): a magnet moving towards and away from a coil, and the meter that answers it
type MagnetContent = { magnetCoil: NonNullable<ContentRecord["magnetCoil"]>; recordIds: string[] };
const magnetCoilScene: Pattern<MagnetContent> = {
  id: "magnet-coil-scene",
  beatKinds: ["hook", "concept"],
  kinds: ["predict", "explain"],
  pause: "none",
  derivesClaims: false,
  sources: (c) => c.recordIds,
  useWhen: "Show a bar magnet and a coil joined to a meter: the parts appear, then the magnet moves towards the coil and away from it, and the needle swings while it moves. For electromagnetic induction.",
  components: ["text", "magnetCoil"],
  slots: [{ name: "magnetCoil", source: "content", what: "a passage with a magnet and a coil: the number of turns" }, TITLE, ALT],
  minSentences: 2,
  heightCostPx: heightCostPx(["text (title, one line)", "magnetCoil"]),
  fill(r): FillResult<MagnetContent> {
    const rec = r.byKind.passage.find((p) => p.magnetCoil);
    return rec?.magnetCoil ? { ok: true, content: { magnetCoil: rec.magnetCoil, recordIds: [rec.id] } } : { ok: false, missing: ["a passage with a magnet and a coil"] };
  },
  build(c, a) {
    const cues = [
      cue(a, 0, "title", "reveal", 800),
      cue(a, 0, "magnet#magnet", "pop", 600),
      cue(a, 0, "magnet#coil", "pop", 600),
      cue(a, 1, "magnet#meter", "pop", 400),
      cue(a, 1, "magnet#motion", "reveal", 600),
    ];
    const s = scene(
      a,
      c.recordIds,
      [
        { id: "title", component: "text", props: { text: a.text.title!, role: "title" } },
        { id: "magnet", component: "magnetCoil", props: c.magnetCoil },
      ],
      [...column(["title", "magnet"]), { rule: "center", item: "title" }, { rule: "center", item: "magnet" }],
      cues,
    );
    return { scene: s, expressions: {}, claims: [], recordIds: c.recordIds };
  },
};

// ---------------------------------------------------------------------------------------------------------------------------------------------------
// 14. water scene (ADR 0085): water in a pipe as a picture of current: the tank is the push, the narrow part the resistance, the drops the flow
type WaterContent = { water: NonNullable<ContentRecord["water"]>; recordIds: string[] };
const waterScene: Pattern<WaterContent> = {
  id: "water-scene",
  beatKinds: ["concept"],
  kinds: ["explain"],
  pause: "none",
  derivesClaims: false,
  sources: (c) => c.recordIds,
  useWhen: "Show water in a pipe as a picture of electric current: the tank fills (the push), the narrow part is picked out (what holds the flow back), and the drops run (the current). With a sweep the tank rises and the drops speed up, and the student may drag the level while paused. An analogy: say where it stops.",
  components: ["text", "waterAnalogy"],
  slots: [{ name: "water", source: "content", what: "a passage with a water picture: the push, the narrowness and the reading" }, TITLE, ALT],
  minSentences: 2,
  heightCostPx: heightCostPx(["text (title, one line)", "waterAnalogy"]),
  fill(r): FillResult<WaterContent> {
    const rec = r.byKind.passage.find((p) => p.water);
    return rec?.water ? { ok: true, content: { water: rec.water, recordIds: [rec.id] } } : { ok: false, missing: ["a passage with a water picture"] };
  },
  build(c, a) {
    const last = a.sentenceIds.length - 1;
    const cues = [
      cue(a, 0, "title", "reveal", 800),
      cue(a, 0, "water#tank", "pop", 500),
      cue(a, 1, "water#tank", "highlight", 900),
      cue(a, 1, "water#pipe", "pop", 500),
      cue(a, 2, "water#pipe", "highlight", 900),
      cue(a, 2, "water#flow", "reveal", 500),
      ...(c.water.flow ? [cue(a, Math.min(3, last), "water#reading", "reveal", 500)] : []),
      ...(c.water.sweep ? [cue(a, Math.min(4, last), "water", "morph", 3200)] : []),
    ];
    const s = scene(
      a,
      c.recordIds,
      [
        { id: "title", component: "text", props: { text: a.text.title!, role: "title" } },
        { id: "water", component: "waterAnalogy", props: c.water },
      ],
      [...column(["title", "water"]), { rule: "center", item: "title" }, { rule: "center", item: "water" }],
      cues,
    );
    return { scene: s, expressions: {}, claims: [], recordIds: c.recordIds };
  },
};

// ---------------------------------------------------------------------------------------------------------------------------------------------------
// 15. paired tables (ADR 0085): the measurements of an experiment, a row of what was set and a row of what was read, filled in one pair at a time
type PairedContent = { inputs: Grid; outputs: Grid; recordIds: string[] };
const pairedTables: Pattern<PairedContent> = {
  id: "paired-tables",
  beatKinds: ["concept"],
  kinds: ["explore", "explain"],
  pause: "none",
  derivesClaims: false,
  sources: (c) => c.recordIds,
  useWhen: "Show an experiment's readings: what was set (a row of numbers) above what was measured (a row of numbers), each pair appearing in turn, so the pattern between them is seen before it is said.",
  components: ["text", "table"],
  slots: [{ name: "grids", source: "content", what: "a passage with two grids of the same size: inputs (what was set) and outputs (what was measured)" }, TITLE, ALT],
  minSentences: 2,
  heightCostPx: heightCostPx(["text (title, one line)", "table, 2 by 2", "table, 2 by 2"]),
  fill(r): FillResult<PairedContent> {
    const [i, o] = ["inputs", "outputs"].map((n) => gridOf(r, n));
    if (!i || !o) return { ok: false, missing: ["a passage with the grids inputs and outputs"] };
    if (i.grid.cells.length !== o.grid.cells.length) return { ok: false, missing: ["inputs and outputs with the same number of cells"] };
    return { ok: true, content: { inputs: i.grid, outputs: o.grid, recordIds: [...new Set([i.rec.id, o.rec.id])] } };
  },
  build(c, a) {
    const last = a.sentenceIds.length - 1;
    const cues = [
      cue(a, 0, "title", "reveal", 800),
      cue(a, 0, "inputs", "reveal", 600),
      cue(a, 0, "outputs", "reveal", 600),
      // each reading appears with the sentence that says it: the sentences after the first, one pair each, the last pair on the last sentence but one
      ...c.inputs.cells.flatMap((_x, i) => [cue(a, Math.min(1 + i, last - 1), `inputs#cell${i}`, "pop", 400), cue(a, Math.min(1 + i, last - 1), `outputs#cell${i}`, "pop", 400, "end")]),
      cue(a, last, "outputs", "highlight", 900),
    ];
    const s = scene(
      a,
      c.recordIds,
      [
        { id: "title", component: "text", props: { text: a.text.title!, role: "title" } },
        { id: "inputs", component: "table", props: tableProps(c.inputs) },
        { id: "outputs", component: "table", props: tableProps(c.outputs) },
      ],
      [...column(["title", "inputs", "outputs"]), { rule: "center", item: "title" }, { rule: "center", item: "inputs" }, { rule: "center", item: "outputs" }],
      cues,
    );
    return { scene: s, expressions: {}, claims: [], recordIds: c.recordIds };
  },
};

// ---------------------------------------------------------------------------------------------------------------------------------------------------
// 16. circuit and its law (ADR 0085): the circuit with the law that ties its numbers, the terms of the law in the colours of the parts; the battery can be dragged
type CircuitLawContent = { circuit: NonNullable<ContentRecord["circuit"]>; law: string; claimId: string; recordIds: string[] };
const circuitLawScene: Pattern<CircuitLawContent> = {
  id: "circuit-law-scene",
  beatKinds: ["concept"],
  kinds: ["explain"],
  pause: "required",
  derivesClaims: false,
  sources: (c) => c.recordIds,
  useWhen: "Draw a circuit and, under it, the law that ties its voltage, current and resistance, each term in the colour of its part. With a sweep the battery moves and the meter follows, and the student may drag it while paused.",
  components: ["text", "circuit", "equation"],
  slots: [{ name: "circuit", source: "content", what: "a passage with a circuit" }, { name: "law", source: "content", what: "a grounded concept claim that is about an equation of at least two coloured terms" }, TITLE, PROMPT, ALT],
  minSentences: 2,
  heightCostPx: heightCostPx(["text (title, one line)", "circuit", "equation, large"]),
  fill(r): FillResult<CircuitLawContent> {
    const rec = r.byKind.passage.find((p) => p.circuit?.sweep) ?? r.byKind.passage.find((p) => p.circuit);
    const claim = r.byKind.conceptClaim.find((c) => c.claimMode === "grounded" && (c.exprRefs ?? []).some((id) => {
      const e = r.expressions[id];
      return e?.op === "eq" && [...termIds(e)].length >= 2 && [...termIds(e)].every((t) => r.termColors[t]);
    }));
    const law = claim?.exprRefs?.find((id) => {
      const e = r.expressions[id];
      return e?.op === "eq" && [...termIds(e)].length >= 2;
    });
    return rec?.circuit && claim && law ? { ok: true, content: { circuit: rec.circuit, law, claimId: claim.id, recordIds: [rec.id, claim.id] } } : { ok: false, missing: ["a passage with a circuit and a grounded claim about a coloured equation"] };
  },
  build(c, a) {
    const last = a.sentenceIds.length - 1;
    const cues = [
      cue(a, 0, "title", "reveal", 800),
      cue(a, 0, "circuit#wires", "draw", 1200),
      cue(a, 0, "circuit#battery", "pop", 500),
      cue(a, 0, "circuit#resistor", "pop", 500, "end"),
      ...(c.circuit.meter ? [cue(a, 1, "circuit#meter", "pop", 500)] : []),
      cue(a, 1, "circuit#flow", "reveal", 500, "end"),
      cue(a, Math.min(2, last), "law", "reveal", 1500),
      ...(c.circuit.sweep ? [cue(a, Math.min(4, last), "circuit", "morph", 3200)] : []),
    ];
    const s = scene(
      a,
      c.recordIds,
      [
        { id: "title", component: "text", props: { text: a.text.title!, role: "title" } },
        { id: "circuit", component: "circuit", props: c.circuit },
        { id: "law", component: "equation", props: { size: "l" }, exprRef: c.law },
      ],
      [...column(["title", "circuit", "law"]), { rule: "center", item: "title" }, { rule: "center", item: "circuit" }, { rule: "center", item: "law" }],
      cues,
      ask(a),
    );
    return { scene: s, expressions: {}, claims: [], recordIds: c.recordIds };
  },
};

/**
 * The patterns planner.v2 and planner.v3 know. Their requests and the recorded reference replies are keyed to exactly this list (ADR 0039), so it does not
 * grow: the two CO-2 patterns join the planner with the next planner version, through LIBRARY.
 */
export const PATTERNS = [colourBoundTerms, predictThenReveal, hopsOnNumberLine, plotAndMarkRoots, stepByStep, commonMistakeContrast] as const;
export type PatternId = (typeof PATTERNS)[number]["id"];
export const PATTERN_IDS: readonly PatternId[] = PATTERNS.map((p) => p.id);

// ---------------------------------------------------------------------------------------------------------------------------------------------------
// balance-scale-worked (ADR 0094)
function hasPow(e: Expr): boolean {
  switch (e.op) {
    case "pow":
      return true;
    case "num":
    case "sym":
      return false;
    case "neg":
      return hasPow(e.a);
    default:
      return hasPow(e.a) || hasPow(e.b);
  }
}
type BalanceContent = { rec: ContentRecord; problem: string; steps: string[] };
const MAX_BALANCE_STEPS = 3;
const balanceScaleWorked: Pattern<BalanceContent> = {
  id: "balance-scale-worked",
  beatKinds: ["worked"],
  kinds: ["worked"],
  pause: "optional",
  derivesClaims: true,
  sources: (c) => [c.rec.id],
  useWhen: "Show a linear equation as a balance scale: the problem in the pans and the solution steps listed below. Use only for degree-1 equations (no squared or higher terms).",
  components: ["balanceScale", "stepList"],
  slots: [
    { name: "problem", source: "content", what: "the equation of a stored linear-equation solution (no pow nodes)" },
    { name: "steps", source: "content", what: `the first ${MAX_BALANCE_STEPS} non-note steps of that solution` },
    PROMPT_OPTIONAL,
    ALT,
  ],
  minSentences: 2,
  heightCostPx: heightCostPx(["balanceScale", "stepList, 3 steps"]),
  fill(r) {
    const rec = solution(r);
    if (!rec?.problem) return { ok: false, missing: ["a solutionSteps record"] };
    const probExpr = rec.expressions[rec.problem];
    if (!probExpr || probExpr.op !== "eq") return { ok: false, missing: ["a solutionSteps record whose problem is an equation"] };
    if (hasPow(probExpr)) return { ok: false, missing: ["a linear equation for the problem (no squared or higher terms)"] };
    const steps = (rec.steps ?? []).filter((s) => s.role !== "note").slice(0, MAX_BALANCE_STEPS).map((s) => s.expr);
    if (steps.length === 0) return { ok: false, missing: ["steps that are not notes"] };
    return { ok: true, content: { rec, problem: rec.problem, steps } };
  },
  build(c, a) {
    const s = scene(
      a,
      [c.rec.id],
      [
        { id: "scale", component: "balanceScale", props: {}, exprRef: c.problem },
        { id: "steps", component: "stepList", props: { steps: c.steps } },
      ],
      column(["scale", "steps"]),
      [cue(a, 0, "scale", "reveal", 1000), cue(a, 1, "steps", "reveal", 2000)],
      ask(a),
    );
    return { scene: s, expressions: {}, claims: claimsFor(c.rec, a.beatId), recordIds: [c.rec.id] };
  },
};

/** The whole library: the six above, the two CO-2 patterns (recap card, check question; ADR 0038) and the statement card (ADR 0062). Nine, then the three neuron patterns (ADR 0076), the circuit scene (ADR 0082), the magnet and coil scene (ADR 0083) and the water, paired tables and circuit law scenes (ADR 0085), and the balance-scale pattern for linear equations (ADR 0094). */
export const LIBRARY = [...PATTERNS, recapCard, checkQuestion, statementCard, patchHook, weightsOnPixels, workedSumOnGrid, circuitScene, magnetCoilScene, waterScene, pairedTables, circuitLawScene, balanceScaleWorked] as const;
export type LibraryPatternId = (typeof LIBRARY)[number]["id"];
export const LIBRARY_IDS: readonly LibraryPatternId[] = LIBRARY.map((p) => p.id);

type Any = { id: string; slots: readonly Slot[]; minSentences: number; fill(r: Retrieval): FillResult<unknown>; sources(c: never): string[]; build(c: never, a: PatternArgs): Instance };
const byId = (id: string): Any => {
  const p = (LIBRARY as unknown as readonly Any[]).find((x) => x.id === id);
  if (!p) throw new PatternError(`unknown pattern ${id}: the list is closed (${LIBRARY_IDS.join(", ")})`);
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

const VISUAL_COMPONENTS = new Set(["numberLine", "functionGraph", "shape", "fractionBar", "areaModel", "balanceScale", "table", "circuit", "magnetCoil", "waterAnalogy"]);
/** A pattern is text-heavy when none of its components is a picture or a diagram: it shows words and equations only. Derived from the components, never typed. */
export const isTextHeavy = (p: { components: readonly string[] }): boolean => !p.components.some((c) => VISUAL_COMPONENTS.has(c));

/** The catalogue of the whole library, for the prompts of the next planner version: the same entries as `catalogue()` plus the CO-2 beat kinds, for all eight patterns. */
export function libraryCatalogue() {
  return LIBRARY.map((p) => ({ id: p.id, useWhen: p.useWhen, beatKinds: p.beatKinds, pause: p.pause, derivesClaims: p.derivesClaims, textHeavy: isTextHeavy(p), components: p.components, slots: p.slots, minSentences: p.minSentences, heightCostPx: p.heightCostPx }));
}

/** The catalogue the planner and composer prompts are given: id, when to use, components, slots, minimum sentences and height cost. */
export function catalogue() {
  return PATTERNS.map((p) => ({ id: p.id, useWhen: p.useWhen, kinds: p.kinds, pause: p.pause, derivesClaims: p.derivesClaims, textHeavy: isTextHeavy(p), components: p.components, slots: p.slots, minSentences: p.minSentences, heightCostPx: p.heightCostPx }));
}
