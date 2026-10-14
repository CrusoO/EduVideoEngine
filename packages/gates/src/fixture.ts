import { resolve } from "node:path";
import { deriveClaimGraph, loadStore, type ContentRecord } from "@eve/content";
import { seal, wordsOf, type Claim, type Cue, type Expr, type LessonBundle, type NarrationSentence, type SceneSpec } from "@eve/schema";
import type { Approval } from "./approvals";
import { GATE_CONFIG } from "./config";
import type { GateContext } from "./types";
import { LOCALES } from "@eve/schema";

/**
 * The synthetic compliant fixture of WP2b (AM-2): a lesson written natively in spec 2.0.0, with no audio. It is built from the real records of the sum-of-roots
 * skill, the claim graph DERIVED from the stored solution (deriveClaimGraph), and real sentence roles. It has: a concept-beat claim that a later claim depends
 * on, a link sentence, a question sentence, a static title, grounded claims with approvals, and a beat with no claims (the hook). Audio is synthetic: the
 * duration of a sentence is its number of words at the speaking rate in config/gates.json.
 */
export type Fixture = {
  ctx: GateContext;
  /** The content records the lesson uses, by id (a corruption of a record is rejected by the record validator). */
  records: Record<string, ContentRecord>;
  /** The hash of every record in the store, by id. */
  recordHashes: Record<string, string>;
  approvals: Approval[];
};

const SUM = "MATH.ALG.QUAD.SUM_OF_ROOTS";
const FACTORISE = "MATH.ALG.QUAD.FACTORISE";
const contentRoot = resolve(__dirname, "..", "..", "..", "content");

/** Synthetic narration time of a sentence: its words at the fixed speaking rate (a placeholder counts as one word). */
export const syntheticDurationMs = (text: string): number => Math.ceil((wordsOf(text).length / GATE_CONFIG.speakingRateWordsPerMinute) * 60_000);

export function buildCleanFixture(): Fixture {
  const store = loadStore(contentRoot).records;
  const rec = (id: string): ContentRecord => {
    const r = store.find((x) => x.id === id);
    if (!r) throw new Error(`the fixture needs the record ${id}`);
    return r;
  };
  const used = {
    problem: rec("quad.sum.problem"),
    steps: rec("quad.sum.steps"),
    misconception: rec("quad.sum.misconception"),
    root: rec("quad.sum.claim.root"),
    vieta: rec("quad.sum.claim.vieta"),
    mistake: rec("quad.sum.claim.mistake"),
    factorise: rec("quad.factorise.claim"),
    recall: rec("quad.sum.q.recall"),
  };
  // the reasoning question is not used by this lesson, but it is kept so a corruption of a practice-question record has something to corrupt
  const records = Object.fromEntries([...Object.values(used), rec("quad.sum.q.reasoning")].map((r) => [r.id, r]));
  const expressions: Record<string, Expr> = Object.assign({}, ...Object.values(used).map((r) => r.expressions));

  // claims: the worked beat from the stored solution, the others from their records
  const worked = deriveClaimGraph(used.steps, "b4");
  const sumClaim = worked.find((c) => c.kind === "sum-of-roots")!;
  const cRoot: Claim = { id: "claim.root", beatId: "b3", kind: "statement", sourceIds: [used.root.id], claimMode: "grounded", importance: "support" };
  const cVieta: Claim = { id: "claim.vieta", beatId: "b3", kind: "sum-of-roots", equation: "quad.general", equals: "quad.rule", sourceIds: [used.vieta.id], claimMode: "computed", importance: "core", dependsOn: [cRoot.id] };
  const cFactorise: Claim = { id: "claim.factorise", beatId: "b2", kind: "equivalent", a: "quad.fac.start", b: "quad.fac.done", sourceIds: [used.factorise.id], claimMode: "computed", importance: "support" };
  const cMistake: Claim = { id: "claim.mistake", beatId: "b5", kind: "statement", sourceIds: [used.mistake.id], claimMode: "grounded", importance: "support", dependsOn: [cVieta.id] };
  const cAnswer: Claim = { id: "claim.answer", beatId: "b6", kind: "sum-of-roots", equation: "quad.q.eq", equals: "quad.q.answer", sourceIds: [used.recall.id], claimMode: "computed", importance: "core" };
  // the end of the worked chain also rests on the rule of the concept beat: an author override of the derived edges
  const workedClaims = worked.map((c) => (c.id === sumClaim.id ? { ...c, dependsOn: [...(c.dependsOn ?? []), cVieta.id] } : c));
  const factId = worked.find((c) => c.kind === "equivalent")!.id;
  const rootsId = worked.find((c) => c.kind === "roots")!.id;
  const claims: Claim[] = [cFactorise, cRoot, cVieta, ...workedClaims, cMistake, cAnswer];

  const S = (id: string, beatId: string, role: NarrationSentence["role"], text: string, more: Partial<NarrationSentence> = {}): NarrationSentence => ({
    id,
    beatId,
    text,
    termSpans: [],
    exprRefs: [...text.matchAll(/\{expr:([^}]+)\}/g)].map((m) => m[1]!),
    status: "draft",
    role,
    ...more,
  });
  const goals = {
    b1: "Can you guess what the two roots of this equation add up to?",
    b2: "What does it mean to factorise a quadratic?",
    b3: "Why does the sum of the roots depend only on the first two coefficients?",
    b4: "Does the shortcut agree with solving the long way?",
    b5: "What goes wrong when we add the numbers in the equation?",
    b6: "Can you find the sum of the roots yourself?",
  };
  const script: NarrationSentence[] = [
    S("s1.1", "b1", "goal", goals.b1),
    S("s1.2", "b1", "transition", "Now let us look at the next idea."),
    S("s2.1", "b2", "goal", goals.b2),
    S("s2.2", "b2", "claim", "Factorising {expr:quad.fac.start} gives {expr:quad.fac.done}.", { claimId: cFactorise.id }),
    S("s3.1", "b3", "goal", goals.b3),
    S("s3.2", "b3", "claim", "A root is a value of the unknown that makes the equation true.", { claimId: cRoot.id }),
    S("s3.3", "b3", "claim", "For any quadratic {expr:quad.general}, the sum of the roots is {expr:quad.rule}.", { claimId: cVieta.id }),
    S("s3.4", "b3", "link", "So the roots themselves decide the sum.", { linkClaimIds: [cRoot.id, cVieta.id] }),
    S("s3.5", "b3", "claim", "Only the first two coefficients matter, and the last one does not.", { claimId: cVieta.id }),
    S("s3.6", "b3", "claim", "Remember the rule: the sum is {expr:quad.rule}, whatever the constant term is.", { claimId: cVieta.id }),
    S("s4.1", "b4", "goal", goals.b4),
    S("s4.2", "b4", "claim", "Factorise the equation to get {expr:quad.factored}.", { claimId: factId }),
    S("s4.3", "b4", "claim", "So the roots are two and three.", { claimId: rootsId }),
    S("s4.4", "b4", "claim", "Adding the roots gives {expr:quad.total}.", { claimId: sumClaim.id }),
    S("s4.5", "b4", "claim", "Two plus three is five, and that is the sum of the roots.", { claimId: sumClaim.id }),
    S("s4.6", "b4", "claim", "This matches what the rule told us in the last beat, so the shortcut works.", { claimId: sumClaim.id }),
    S("s5.1", "b5", "goal", goals.b5),
    S("s5.2", "b5", "claim", "Adding the numbers written in the equation does not give the sum of the roots.", { claimId: cMistake.id }),
    S("s5.3", "b5", "transition", "Now try one yourself."),
    S("s6.1", "b6", "goal", goals.b6),
    S("s6.2", "b6", "question", used.recall.text, { questionId: used.recall.id }),
    S("s6.3", "b6", "claim", "The roots add up to {expr:quad.q.answer}.", { claimId: cAnswer.id }),
    S("s6.4", "b6", "claim", "Check it with the rule: the sum is minus the second coefficient over the first.", { claimId: cAnswer.id }),
    S("s6.5", "b6", "claim", "Each root is a value that makes the equation true, so you can test your answer.", { claimId: cAnswer.id }),
  ];

  const cue = (targetObject: string, sentenceId: string): Cue => ({ targetObject, action: "reveal", anchor: { sentenceId, at: "start" }, minHoldMs: 1500 });
  const title = (text: string) => ({ id: "title", component: "text" as const, props: { text, role: "title" }, role: "static" as const, textRole: "title" as const });
  const eqObj = (id: string, exprRef: string) => ({ id, component: "equation" as const, props: { size: "m" }, exprRef });
  const scene = (id: string, beatId: string, sourceIds: string[], objects: SceneSpec["objects"], cues: Cue[], altText: string, extra: Partial<SceneSpec> = {}): SceneSpec => ({
    id,
    beatId,
    sourceIds,
    objects,
    layout: [{ rule: "column", items: objects.map((o) => o.id) }],
    cues,
    a11y: { altText },
    ...extra,
  });
  const scenes: SceneSpec[] = [
    scene("scene.b1", "b1", [used.problem.id], [title("Guess the sum"), eqObj("problem", "quad.eq")], [cue("problem", "s1.1")], "A quadratic equation under the title Guess the sum."),
    scene("scene.b2", "b2", [used.factorise.id], [title("Factorising"), eqObj("done", "quad.fac.done")], [cue("done", "s2.2")], "A quadratic written as a product of two brackets."),
    scene("scene.b3", "b3", [used.root.id, used.vieta.id], [title("The rule"), eqObj("general", "quad.general"), eqObj("rule", "quad.rule")], [cue("general", "s3.3"), cue("rule", "s3.3")], "The general quadratic and the rule for the sum of its roots."),
    scene(
      "scene.b4",
      "b4",
      [used.steps.id],
      [eqObj("problem", "quad.eq"), eqObj("factored", "quad.factored"), { id: "steps", component: "stepList" as const, props: { steps: ["quad.factored", "quad.total"] } }, eqObj("total", "quad.total")],
      [cue("problem", "s4.2"), cue("factored", "s4.2"), cue("steps", "s4.4"), cue("total", "s4.4")],
      "The equation, its factorised form and the roots added to five.",
      { interactions: [{ id: "ask4", afterSentenceId: "s4.6", prompt: "Does the shortcut match the long way?", goalExprRef: "quad.total" }] },
    ),
    scene("scene.b5", "b5", [used.misconception.id, used.mistake.id], [title("A common mistake"), { id: "note", component: "text" as const, props: { text: "Add the roots, not the numbers", role: "label" } }], [cue("note", "s5.2")], "A note about a common mistake."),
    scene("scene.b6", "b6", [used.recall.id], [title("Your turn"), eqObj("question", "quad.q.eq"), eqObj("answer", "quad.q.answer")], [cue("question", "s6.3"), cue("answer", "s6.3")], "A quadratic equation and its answer.", {
      interactions: [{ id: "ask6", afterSentenceId: "s6.2", prompt: "What do the roots add up to?", goalExprRef: "quad.q.answer" }],
    }),
  ];

  const sourceOf = (ids: string[]) => ids;
  const beat = (id: string, kind: LessonBundle["plan"]["beats"][number]["kind"], title_: string, beatKind: NonNullable<LessonBundle["plan"]["beats"][number]["beatKind"]>, slotId: string, sources: string[], cueFocus: string) => ({
    id,
    kind,
    title: title_,
    animate: kind !== "predict",
    sourceIds: sourceOf(sources),
    cueFocus,
    beatKind,
    slotId,
    learningGoal: goals[id as keyof typeof goals],
  });
  const bundle: LessonBundle = seal({
    bundleId: "bundle.synthetic.sum-of-roots.en-IN",
    specVersion: "2.0.0",
    skillId: SUM,
    locale: "en-IN",
    subjectId: "maths",
    sourceIds: Object.values(used).map((r) => r.id),
    expressions,
    plan: {
      template: "problem-first",
      targetLengthS: 180,
      arcId: "problem_first",
      level: "class-10",
      prerequisites: [{ skillId: FACTORISE, status: "recapped" }],
      beats: [
        beat("b1", "predict", "Guess the sum", "hook", "hook", [used.problem.id], "problem"),
        beat("b2", "explain", "Factorising", "prerequisite", "prerequisite_activation", [used.factorise.id], "done"),
        beat("b3", "explain", "The rule", "concept", "concept", [used.root.id, used.vieta.id], "rule"),
        beat("b4", "worked", "Check it on the example", "worked", "worked_example", [used.steps.id], "steps"),
        beat("b5", "explain", "A common mistake", "mistake", "common_mistake_contrast", [used.misconception.id, used.mistake.id], "note"),
        beat("b6", "check", "Your turn", "check", "check", [used.recall.id], "question"),
      ],
    },
    script,
    scenes,
    claims,
  });

  const recordSkill = Object.fromEntries(store.map((r) => [r.id, r.skillId]));
  const skills = Object.fromEntries(store.filter((r) => r.kind === "skill").map((r) => [r.skillId, { prerequisiteSkillIds: r.prerequisiteSkillIds ?? [], assumableAtLevels: r.assumableAtLevels ?? [] }]));
  const ctx: GateContext = {
    bundle,
    durationsMs: Object.fromEntries(script.map((s) => [s.id, syntheticDurationMs(s.text)])),
    skills,
    recordSkill,
    questions: { [used.recall.id]: { text: used.recall.text } },
    transitions: LOCALES["en-IN"]!.transitions,
    coreClaimMinMs: GATE_CONFIG.coreClaimMinMs,
    lessonKind: "generated",
  };
  const recordHashes = Object.fromEntries(store.map((r) => [r.id, r.hash]));
  const approvals: Approval[] = [used.root, used.mistake].map((r) => ({ recordId: r.id, recordHash: r.hash }));
  return { ctx, records, recordHashes, approvals };
}
