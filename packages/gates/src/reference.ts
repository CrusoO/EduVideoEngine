import { resolve } from "node:path";
import { deriveClaimGraph, loadStore, retrieve, type ContentRecord } from "@eve/content";
import { instantiate } from "@eve/patterns";
import { LOCALES, seal, type Claim, type Cue, type Expr, type LessonBundle, type NarrationSentence, type SceneSpec } from "@eve/schema";
import type { Approval } from "./approvals";
import { GATE_CONFIG } from "./config";
import { syntheticDurationMs, type Fixture } from "./fixture";
import type { GateContext } from "./types";

/**
 * The reference lesson (WP3): "the sum of the roots of a quadratic", written natively in spec 2.0.0 on the `problem_first` arc. It replaces the hand-written
 * four-scene lesson of Phase 0. Six beats, one per slot: a guess (hook), a recap of factorising (prerequisite), the curve and its roots with the rule for the
 * sum (concept), the roots added by hops (worked), a common mistake, and a question (check).
 *
 * Everything on screen comes from stored records through the pattern library; the claims of the worked beat are DERIVED from the stored solution; the sentences
 * are written here with their roles, because the scriptwriter is not built yet (WP5). Titles are static objects. The rule for the sum is narrated, not drawn: with it the concept scene (equation, curve, rule) costs 430 px of the 456 px phone stage, and the budget keeps 40 px for the unmeasured sheet chrome. The beat of the mistake is a plain scene:
 * the pattern for it shows two equations, and a grounded claim names no expression for the gate to tie them to.
 *
 * The result is a Fixture, so the gates, the validators and the compile check judge it exactly as they judge the synthetic one, with `lessonKind: "reference"`
 * (the delivery gate G2 fails instead of warning). Audio durations are passed in: the real ones come from the pinned Piper files.
 */
const SUM = "MATH.ALG.QUAD.SUM_OF_ROOTS";
const FACTORISE = "MATH.ALG.QUAD.FACTORISE";
const contentRoot = resolve(__dirname, "..", "..", "..", "content");

export const REFERENCE_BUNDLE_ID = "bundle.reference.sum-of-roots.en-IN";

/** Learning goals: one speakable question per beat, copied as the first sentence of the beat. */
export const REFERENCE_GOALS = {
  b1: "Can you guess what the two roots of this equation add up to?",
  b2: "What does it mean to factorise a quadratic?",
  b3: "Why does the sum of the roots depend only on the first two coefficients?",
  b4: "Does the shortcut agree with solving the long way?",
  b5: "What goes wrong when we add the numbers in the equation?",
  b6: "Can you find the sum of the roots yourself?",
} as const;

export function buildReferenceLesson(durationsMs?: Readonly<Record<string, number>>): Fixture {
  const store = loadStore(contentRoot).records;
  const rec = (id: string): ContentRecord => {
    const r = store.find((x) => x.id === id);
    if (!r) throw new Error(`the reference lesson needs the record ${id}`);
    return r;
  };
  const sumRetrieval = retrieve(store, SUM, "en-IN");
  const factoriseRetrieval = retrieve(store, FACTORISE, "en-IN");
  const used = {
    problem: rec("quad.sum.problem"),
    graph: rec("quad.sum.graph"),
    steps: rec("quad.sum.steps"),
    misconception: rec("quad.sum.misconception"),
    root: rec("quad.sum.claim.root"),
    roots: rec("quad.sum.claim.roots"),
    vieta: rec("quad.sum.claim.vieta"),
    mistake: rec("quad.sum.claim.mistake"),
    factorise: rec("quad.factorise.claim"),
    recall: rec("quad.sum.q.recall"),
  };
  const records = Object.fromEntries([...Object.values(used), rec("quad.sum.q.reasoning")].map((r) => [r.id, r]));
  const expressions: Record<string, Expr> = Object.assign({}, ...Object.values(used).map((r) => r.expressions));

  // ---- claims ---------------------------------------------------------------------------------------------------------------------------------------
  const cRoot: Claim = { id: "claim.root", beatId: "b3", kind: "statement", sourceIds: [used.root.id], claimMode: "grounded", importance: "support" };
  const cRoots: Claim = { id: "claim.roots", beatId: "b3", ...(used.roots.claim as object), sourceIds: [used.roots.id], claimMode: "computed", importance: "support" } as Claim;
  const cVieta: Claim = { id: "claim.vieta", beatId: "b3", kind: "sum-of-roots", equation: "quad.general", equals: "quad.rule", sourceIds: [used.vieta.id], claimMode: "computed", importance: "core", dependsOn: [cRoot.id] };
  const worked = deriveClaimGraph(used.steps, "b4");
  const cEquivalent = worked.find((c) => c.kind === "equivalent")!;
  const cWorkedRoots = worked.find((c) => c.kind === "roots")!;
  const cSum = worked.find((c) => c.kind === "sum-of-roots")!;
  // the end of the worked chain also rests on the rule of the concept beat: an author override of the derived edges
  const workedClaims = worked.map((c) => (c.id === cSum.id ? { ...c, dependsOn: [...(c.dependsOn ?? []), cVieta.id] } : c));
  const cMistake: Claim = { id: "claim.mistake", beatId: "b5", kind: "statement", sourceIds: [used.mistake.id], claimMode: "grounded", importance: "support", dependsOn: [cVieta.id] };

  // ---- sentences ------------------------------------------------------------------------------------------------------------------------------------
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
  const G = REFERENCE_GOALS;
  const cFactorise = (): Claim => factoriseClaim;
  // The recap card brings the claim of the prerequisite skill's record to the bundle; its id carries the beat.
  const recap = instantiate("recap-card", factoriseRetrieval, { sceneId: "scene.b2", beatId: "b2", sentenceIds: ["s2.2", "s2.3"], text: { title: "Factorising", altText: "The title Factorising, and a quadratic written as a product of two brackets." } });
  const factoriseClaim = recap.claims[0]!;
  const script: NarrationSentence[] = [
    S("s1.1", "b1", "goal", G.b1),
    S("s1.2", "b1", "transition", "Let us see why."),
    S("s2.1", "b2", "goal", G.b2),
    S("s2.2", "b2", "claim", "Factorising {expr:quad.fac.start} gives {expr:quad.fac.done}.", { claimId: cFactorise().id }),
    S("s2.3", "b2", "claim", "The two brackets multiplied together make the same quadratic again.", { claimId: cFactorise().id }),
    S("s3.1", "b3", "goal", G.b3),
    S("s3.2", "b3", "claim", "A root is a value of the unknown that makes the equation true.", { claimId: cRoot.id }),
    S("s3.3", "b3", "claim", "Here is our equation {expr:quad.eq}, drawn as a curve.", { claimId: cRoots.id }),
    S("s3.4", "b3", "claim", "The curve crosses the axis at the first root, which is two.", { claimId: cRoots.id }),
    S("s3.5", "b3", "claim", "It crosses again at the second root, which is three.", { claimId: cRoots.id }),
    S("s3.6", "b3", "claim", "Now notice something. For any quadratic {expr:quad.general}, the sum of the roots is {expr:quad.rule}.", { claimId: cVieta.id }),
    S("s3.7", "b3", "link", "So the roots themselves decide the sum.", { linkClaimIds: [cRoot.id, cVieta.id] }),
    S("s3.8", "b3", "claim", "Only the first two coefficients matter, and the last one does not.", { claimId: cVieta.id }),
    S("s3.9", "b3", "claim", "Remember the rule: the sum is {expr:quad.rule}, whatever the constant term is.", { claimId: cVieta.id }),
    S("s4.1", "b4", "goal", G.b4),
    S("s4.2", "b4", "claim", "First factorise the equation to get {expr:quad.factored}.", { claimId: cEquivalent.id }),
    S("s4.3", "b4", "claim", "Start at zero. The first root is two, so hop to two.", { claimId: cWorkedRoots.id }),
    S("s4.4", "b4", "claim", "The second root is three, so hop three more and land on five.", { claimId: cWorkedRoots.id }),
    S("s4.5", "b4", "claim", "The two roots add up to {expr:quad.total}.", { claimId: cSum.id }),
    S("s4.6", "b4", "link", "So adding the roots gives the sum.", { linkClaimIds: [cWorkedRoots.id, cSum.id] }),
    S("s4.7", "b4", "claim", "Look at the minus five x term. The sum is five, the same number with its sign flipped.", { claimId: cSum.id }),
    S("s4.8", "b4", "claim", "This matches what the rule told us in the last beat, so the shortcut works.", { claimId: cSum.id }),
    S("s5.1", "b5", "goal", G.b5),
    S("s5.2", "b5", "claim", "Adding the numbers written in the equation does not give the sum of the roots.", { claimId: cMistake.id }),
    S("s5.3", "b5", "transition", "Now try one yourself."),
    S("s6.1", "b6", "goal", G.b6),
    S("s6.2", "b6", "question", used.recall.text, { questionId: used.recall.id }),
    S("s6.3", "b6", "claim", "The roots add up to {expr:quad.q.answer}.", { claimId: "quad.sum.q.recall.answer.b6" }),
    S("s6.4", "b6", "claim", "Check it with the rule: the sum is minus the second coefficient over the first.", { claimId: "quad.sum.q.recall.answer.b6" }),
    S("s6.5", "b6", "claim", "Each root is a value that makes the equation true, so you can test your answer.", { claimId: "quad.sum.q.recall.answer.b6" }),
  ];

  // ---- scenes ---------------------------------------------------------------------------------------------------------------------------------------
  const asTitleStatic = (s: SceneSpec): SceneSpec => ({ ...s, objects: s.objects.map((o) => (o.id === "title" ? { ...o, role: "static" as const, textRole: "title" as const } : o)) });
  const cue = (targetObject: string, sentenceId: string, action: Cue["action"], minHoldMs: number, at: "start" | "end" = "start"): Cue => ({ targetObject, action, anchor: { sentenceId, at }, minHoldMs });

  const hook = instantiate("predict-then-reveal", sumRetrieval, {
    sceneId: "scene.b1",
    beatId: "b1",
    sentenceIds: ["s1.1", "s1.2"],
    text: { title: "Guess the sum", prompt: "What do the two roots add up to?", altText: "The title Guess the sum, a quadratic equation, and after a pause the sum of its roots." },
  });
  const concept = instantiate("plot-and-mark-roots", sumRetrieval, {
    sceneId: "scene.b3",
    beatId: "b3",
    sentenceIds: ["s3.3", "s3.4", "s3.5"],
    text: { altText: "The equation and its curve, drawn on; the two places where the curve crosses the axis pop in as roots." },
  });
  // the pattern gives the equation no cue; every object that is not static needs one (G3 a), on a sentence of a claim that uses it (b, c)
  const conceptScene: SceneSpec = { ...concept.scene, cues: [cue("eq", "s3.3", "reveal", 800), ...concept.scene.cues] };
  const hops = instantiate("hops-on-number-line", sumRetrieval, {
    sceneId: "scene.b4",
    beatId: "b4",
    sentenceIds: ["s4.3", "s4.4", "s4.5"],
    text: { prompt: "How is the sum related to the minus five x term?", altText: "The equation; when the hops begin, all its terms but minus five x fade. A number line: a hop from zero to two, a hop from two to five, and a bracket labelled with the sum." },
  });
  const mistakeScene: SceneSpec = {
    id: "scene.b5",
    beatId: "b5",
    sourceIds: [used.misconception.id, used.mistake.id],
    objects: [
      { id: "title", component: "text", props: { text: "A common mistake", role: "title" }, role: "static", textRole: "title" },
      { id: "note", component: "text", props: { text: "Add the roots, not the numbers", role: "label" } },
    ],
    layout: [{ rule: "column", items: ["title", "note"] }, { rule: "center", item: "title" }, { rule: "center", item: "note" }],
    cues: [cue("note", "s5.2", "reveal", 1500)],
    a11y: { altText: "The title A common mistake, and a note: add the roots, not the numbers." },
  };
  const check = instantiate("check-question", sumRetrieval, {
    sceneId: "scene.b6",
    beatId: "b6",
    sentenceIds: ["s6.2", "s6.3"],
    text: { title: "Your turn", prompt: "What do the roots add up to?", altText: "The title Your turn, a quadratic equation, and after a pause the sum of its roots." },
  });
  const checkScene: SceneSpec = { ...check.scene, cues: [...check.scene.cues, cue("problem", "s6.3", "highlight", 800)] };

  const scenes: SceneSpec[] = [asTitleStatic(hook.scene), asTitleStatic(recap.scene), conceptScene, hops.scene, mistakeScene, asTitleStatic(checkScene)];
  for (const inst of [hook, recap, concept, hops, check]) Object.assign(expressions, inst.expressions);

  // ---- the bundle -----------------------------------------------------------------------------------------------------------------------------------
  const claims: Claim[] = [factoriseClaim, cRoot, cRoots, cVieta, ...workedClaims, cMistake, ...check.claims];
  const beat = (id: keyof typeof G, kind: LessonBundle["plan"]["beats"][number]["kind"], title: string, beatKind: NonNullable<LessonBundle["plan"]["beats"][number]["beatKind"]>, slotId: string, focus: string) => ({
    id,
    kind,
    title,
    animate: kind !== "predict",
    sourceIds: scenes.find((s) => s.beatId === id)!.sourceIds,
    cueFocus: focus,
    beatKind,
    slotId,
    learningGoal: G[id],
  });
  const bundle: LessonBundle = seal({
    bundleId: REFERENCE_BUNDLE_ID,
    specVersion: "2.0.0",
    skillId: SUM,
    locale: "en-IN",
    subjectId: "maths",
    sourceIds: Object.values(used).map((r) => r.id),
    expressions,
    termColors: sumRetrieval.termColors,
    plan: {
      template: "problem-first",
      targetLengthS: 140, // measured with the Piper files: 138.1 s of lesson, three pauses not counted
      arcId: "problem_first",
      level: "class-10",
      prerequisites: [{ skillId: FACTORISE, status: "recapped" }],
      beats: [
        beat("b1", "predict", "Guess the sum", "hook", "hook", "problem"),
        beat("b2", "explain", "Factorising", "prerequisite", "prerequisite_activation", "fact"),
        beat("b3", "explore", "Where the curve crosses", "concept", "concept", "graph"),
        beat("b4", "worked", "Add the roots with hops", "worked", "worked_example", "line"),
        beat("b5", "explain", "A common mistake", "mistake", "common_mistake_contrast", "note"),
        beat("b6", "check", "Your turn", "check", "check", "problem"),
      ],
    },
    script,
    scenes,
    claims,
  });

  // ---- what the gates need --------------------------------------------------------------------------------------------------------------------------
  const recordSkill = Object.fromEntries(store.map((r) => [r.id, r.skillId]));
  const skills = Object.fromEntries(store.filter((r) => r.kind === "skill").map((r) => [r.skillId, { prerequisiteSkillIds: r.prerequisiteSkillIds ?? [], assumableAtLevels: r.assumableAtLevels ?? [] }]));
  const ctx: GateContext = {
    bundle,
    durationsMs: durationsMs ?? Object.fromEntries(script.map((s) => [s.id, syntheticDurationMs(s.text)])),
    skills,
    recordSkill,
    questions: { [used.recall.id]: { text: used.recall.text } },
    transitions: LOCALES["en-IN"]!.transitions,
    coreClaimMinMs: GATE_CONFIG.coreClaimMinMs,
    lessonKind: "reference",
  };
  const recordHashes = Object.fromEntries(store.map((r) => [r.id, r.hash]));
  const approvals: Approval[] = [used.root, used.mistake].map((r) => ({ recordId: r.id, recordHash: r.hash }));
  return { ctx, records, recordHashes, approvals };
}
