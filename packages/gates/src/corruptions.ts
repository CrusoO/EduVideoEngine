import { sealRecord } from "@eve/content";
import { seal, type LessonBundle } from "@eve/schema";
import type { Fixture } from "./fixture";

/**
 * The corruption catalogue as DATA (AM-15, CO-2 section 7): each entry derives a corrupted copy of the clean lesson with a small function, and names the check
 * that must reject it. A gate with no failing corruption is not built. The seven maths corruptions of the Phase 0 gate (`MATHS_CORRUPTIONS` in
 * scripts/verify-gate.ts) work on the reference lesson and the SymPy verifier; they are listed here so `--list` shows all 28 (the 27 of AM-15 and C21 of ADR 0049).
 */
export type Target = "G1" | "G2" | "G3" | "G4" | "G5" | "G6" | "G7" | "Validator" | "Compile" | "Verifier";
export type Corruption = {
  id: string;
  what: string;
  target: Target;
  /** What the rejection must say: a copy rejected for another reason by the same check does not count. */
  reason: RegExp;
  corrupt: (clean: Fixture) => Fixture;
};

const clone = (f: Fixture): Fixture => structuredClone(f);

/** Edit the bundle of a copy and seal it again, so the hash is never the reason a copy is rejected. */
function editBundle(clean: Fixture, edit: (bundle: LessonBundle, copy: Fixture) => void): Fixture {
  const copy = clone(clean);
  edit(copy.ctx.bundle, copy);
  const { hashes: _old, ...rest } = copy.ctx.bundle;
  void _old;
  copy.ctx = { ...copy.ctx, bundle: seal(rest) };
  return copy;
}
const sentence = (b: LessonBundle, id: string) => b.script.find((s) => s.id === id)!;
const claim = (b: LessonBundle, id: string) => b.claims!.find((c) => c.id === id)!;
const scene = (b: LessonBundle, id: string) => b.scenes.find((s) => s.id === id)!;
const beat = (b: LessonBundle, id: string) => b.plan.beats.find((x) => x.id === id)!;

export const CORRUPTIONS: readonly Corruption[] = [
  {
    id: "C1",
    reason: /dangling-dependency|never introduced/,
    what: "delete the concept beat that introduces the claim a later claim depends on",
    target: "G1",
    corrupt: (c) =>
      editBundle(c, (b) => {
        b.plan.beats = b.plan.beats.filter((x) => x.id !== "b3");
        b.scenes = b.scenes.filter((s) => s.beatId !== "b3");
        b.script = b.script.filter((s) => s.beatId !== "b3");
        b.claims = b.claims!.filter((x) => x.beatId !== "b3");
      }),
  },
  {
    id: "C2",
    reason: /before the claim it depends on/,
    what: "swap the concept and the worked beat so a claim comes before the claim it depends on",
    target: "G1",
    corrupt: (c) =>
      editBundle(c, (b) => {
        const [concept, worked] = [b.plan.beats.findIndex((x) => x.id === "b3"), b.plan.beats.findIndex((x) => x.id === "b4")];
        [b.plan.beats[concept], b.plan.beats[worked]] = [b.plan.beats[worked]!, b.plan.beats[concept]!];
      }),
  },
  {
    id: "C3",
    reason: /core-claim-too-short/,
    what: "shorten the audio of a core claim below the floor (a reference lesson)",
    target: "G2",
    corrupt: (c) => {
      const copy = clone(c);
      copy.ctx = { ...copy.ctx, lessonKind: "reference", durationsMs: { ...copy.ctx.durationsMs, "s3.3": 1000, "s3.5": 1000, "s3.6": 1000 } };
      return copy;
    },
  },
  {
    id: "C4",
    reason: /\(b\)/,
    what: "re-anchor a cue of a worked beat to a sentence that carries no claim",
    target: "G3",
    corrupt: (c) =>
      editBundle(c, (b) => {
        scene(b, "scene.b4").cues.find((q) => q.targetObject === "steps")!.anchor.sentenceId = "s4.1";
      }),
  },
  {
    id: "C5",
    reason: /\(a\)/,
    what: "add a function graph that no cue targets",
    target: "G3",
    corrupt: (c) =>
      editBundle(c, (b) => {
        scene(b, "scene.b1").objects.push({ id: "graph", component: "functionGraph", props: { xMin: 0, xMax: 5, yMin: -1, yMax: 7 }, exprRef: "quad.eq" });
      }),
  },
  {
    id: "C6",
    reason: /at most 5 objects/,
    what: "put more than 5 objects in a scene",
    target: "Validator",
    corrupt: (c) =>
      editBundle(c, (b) => {
        const s = scene(b, "scene.b4");
        for (const i of [1, 2, 3]) s.objects.push({ id: `extra${i}`, component: "equation", props: { size: "m" }, exprRef: "quad.eq" });
      }),
  },
  {
    id: "C7",
    reason: /no-learning-goal/,
    what: "remove the learning goal of a beat",
    target: "G4",
    corrupt: (c) =>
      editBundle(c, (b) => {
        delete beat(b, "b2").learningGoal;
      }),
  },
  {
    id: "C8",
    reason: /link-without-edge/,
    what: "a link sentence that cites two claims with no dependsOn edge between them",
    target: "G5",
    corrupt: (c) =>
      editBundle(c, (b) => {
        sentence(b, "s3.4").linkClaimIds = ["claim.factorise", "claim.root"];
      }),
  },
  {
    id: "C9",
    reason: /new-number/,
    what: "a goal sentence that introduces a new number",
    target: "G5",
    corrupt: (c) =>
      editBundle(c, (b) => {
        const text = "Can you guess what the 2 roots of this equation add up to?";
        sentence(b, "s1.1").text = text;
        beat(b, "b1").learningGoal = text;
      }),
  },
  {
    id: "C10",
    reason: /undeclared-prerequisite/,
    what: "remove the declaration of a prerequisite",
    target: "G6",
    corrupt: (c) =>
      editBundle(c, (b) => {
        delete b.plan.prerequisites;
      }),
  },
  {
    id: "C11",
    reason: /\(c\)/,
    what: "re-anchor a cue to the sentence of an unrelated claim",
    target: "G3",
    corrupt: (c) =>
      editBundle(c, (b) => {
        scene(b, "scene.b3").cues.find((q) => q.targetObject === "rule")!.anchor.sentenceId = "s3.2";
      }),
  },
  {
    id: "C12",
    reason: /core-claim-not-narrated/,
    what: "a core claim that no sentence narrates",
    target: "G7",
    corrupt: (c) =>
      editBundle(c, (b) => {
        b.claims!.push({ id: "claim.unspoken", beatId: "b6", kind: "sum-of-roots", equation: "quad.q.eq", equals: "quad.q.answer", sourceIds: ["quad.sum.q.recall"], claimMode: "computed", importance: "core" });
      }),
  },
  {
    id: "C13",
    reason: /cycle/,
    what: "a cycle in dependsOn",
    target: "G1",
    corrupt: (c) =>
      editBundle(c, (b) => {
        claim(b, "claim.root").dependsOn = ["claim.vieta"];
      }),
  },
  {
    id: "C14",
    reason: /transition-off-list/,
    what: "a transition with a digit and a phrase that is not on the list",
    target: "G5",
    corrupt: (c) =>
      editBundle(c, (b) => {
        sentence(b, "s1.2").text = "Now look at idea 2.";
      }),
  },
  {
    id: "C15",
    reason: /grounded-claim-not-approved/,
    what: "a grounded claim whose record has no matching approval",
    target: "Compile",
    corrupt: (c) => {
      const copy = clone(c);
      copy.approvals = copy.approvals.filter((a) => a.recordId !== "quad.sum.claim.root");
      return copy;
    },
  },
  {
    id: "C16",
    reason: /assumed-at-unlisted-level/,
    what: "a prerequisite assumed at a level its skill does not list",
    target: "G6",
    corrupt: (c) =>
      editBundle(c, (b) => {
        b.plan.prerequisites = [{ skillId: "MATH.ALG.QUAD.FACTORISE", status: "assumed" }];
        b.plan.level = "class-6";
      }),
  },
  {
    id: "C17",
    reason: /static object has no digits/,
    what: "a static object with a digit in its text",
    target: "Validator",
    corrupt: (c) =>
      editBundle(c, (b) => {
        (scene(b, "scene.b1").objects.find((o) => o.id === "title")!.props as { text: string }).text = "Guess the sum of 2 roots";
      }),
  },
  {
    id: "C18",
    reason: /stepKind/,
    what: "a solution step of an unknown step kind",
    target: "Validator",
    corrupt: (c) =>
      editBundle(c, (b) => {
        const worked = b.claims!.find((x) => x.beatId === "b4" && x.usesStep !== undefined)!;
        (worked as { stepKind: string }).stepKind = "guess";
      }),
  },
  {
    id: "C19",
    reason: /names at least one claim/,
    what: "a reasoning question with no rationale claim ids",
    target: "Validator",
    corrupt: (c) => {
      const copy = clone(c);
      const { hash: _h, rationaleClaimIds: _r, ...rest } = copy.records["quad.sum.q.reasoning"]!;
      void _h;
      void _r;
      copy.records["quad.sum.q.reasoning"] = sealRecord(rest); // sealed again, so the hash is not the reason it is rejected
      return copy;
    },
  },
  {
    id: "C20",
    reason: /goal-text-differs/,
    what: "a goal sentence whose text differs from the learning goal",
    target: "G5",
    corrupt: (c) =>
      editBundle(c, (b) => {
        sentence(b, "s1.1").text = "Can you guess what the roots add up to?";
      }),
  },
  {
    id: "C21",
    reason: /\(c\)/,
    what: "a function graph cued to a claim whose equation does not have that function as a side (ADR 0049)",
    target: "G3",
    corrupt: (c) =>
      editBundle(c, (b) => {
        (b.expressions as Record<string, unknown>)["quad.other"] = { op: "sub", a: { op: "pow", a: { op: "sym", name: "x" }, b: { op: "num", n: 2 } }, b: { op: "num", n: 4 } };
        const s = scene(b, "scene.b4");
        s.objects.push({ id: "graph", component: "functionGraph", props: { xMin: 0, xMax: 5, yMin: -1, yMax: 7 }, exprRef: "quad.other" });
        s.layout = [{ rule: "column", items: s.objects.map((o) => o.id) }];
        s.cues.push({ targetObject: "graph", action: "reveal", anchor: { sentenceId: "s4.4", at: "start" }, minHoldMs: 1500 });
      }),
  },
];

/**
 * The seven maths corruptions (the Phase 0 gate list): a wrong sum, a ringed non-root, a wrong factorisation, a lost minus sign, a wrong practice answer, an
 * expression nobody can verify, and a hop that lands on the wrong total. The SymPy verifier must reject each. Six derive from the clean fixture; the hop needs a
 * number line, which the text-only fixture does not have, so it derives from the reference lesson.
 */
export type MathsCorruption = { id: string; what: string; base: "fixture" | "reference"; corrupt: (bundle: LessonBundle) => void };
const expr = (b: LessonBundle, _id: string) => b.expressions as Record<string, unknown>;

export const MATHS_CORRUPTIONS: readonly MathsCorruption[] = [
  { id: "M1", what: "a wrong sum: the roots are added to 6", base: "fixture", corrupt: (b) => void ((expr(b, "quad.total")["quad.total"] as { b: unknown }).b = { op: "num", n: 6 }) },
  {
    id: "M2",
    what: "a ringed non-root: a graph rings x = 4",
    base: "fixture",
    corrupt: (b) => {
      b.scenes[0]!.objects.push({ id: "ring", component: "functionGraph", props: { xMin: 0, xMax: 5, yMin: -1, yMax: 7, points: [2, 4] }, exprRef: "quad.eq" });
    },
  },
  {
    id: "M3",
    what: "a wrong factorisation: (x - 2)(x - 4) = 0",
    base: "fixture",
    corrupt: (b) => {
      const f = b.expressions["quad.factored"] as { a: { b: { b: unknown } } };
      f.a.b.b = { op: "num", n: 4 };
    },
  },
  {
    id: "M4",
    what: "a lost minus sign: the rule reads S = b over a",
    base: "fixture",
    corrupt: (b) => {
      const rule = b.expressions["quad.rule"] as { b: { op: string; a?: unknown } };
      (b.expressions as Record<string, unknown>)["quad.rule"] = { ...rule, b: rule.b.a };
    },
  },
  { id: "M5", what: "a wrong practice answer: the answer is S = 8", base: "fixture", corrupt: (b) => void ((b.expressions["quad.q.answer"] as { b: unknown }).b = { op: "num", n: 8 }) },
  { id: "M6", what: "an expression with a node type nobody can verify (sqrt)", base: "fixture", corrupt: (b) => void ((b.expressions as Record<string, unknown>)["quad.total"] = { op: "sqrt", a: { op: "num", n: 4 } }) },
  { id: "M7", what: "a hop that lands on the wrong total (the second hop ends at 6)", base: "reference", corrupt: (b) => void (b.expressions["scene.b4.stop.2"] = { op: "num", n: 6 }) },
];
