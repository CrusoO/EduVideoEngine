import { describe, expect, it } from "vitest";
import { g1Coherence, g2Delivery, g3ActiveVisual, g4Arc, g5Role, g6Prerequisites, g7Coverage, findCycle, type Finding, type GateContext } from "../src";
import { beat, claim, ctxWith, dur, scene, sentence } from "./helpers";

/**
 * Every finding of every gate, word for word: its gate, level, code, message and ids. These are the strings a reader sees when a lesson is rejected, so a change
 * to one is a change to the product and must show up here. Each entry is one deliberately broken lesson.
 */
const swap = <T>(list: T[], a: number, b: number) => void ([list[a], list[b]] = [list[b]!, list[a]!]);
const run = (gate: (c: GateContext) => Finding[], edit: (c: GateContext) => void): Finding[] => gate(ctxWith(edit));

describe("exact findings", () => {
  it("G1", () => {
    expect({
      dangling: run(g1Coherence, (c) => void (claim(c, "claim.mistake").dependsOn = ["claim.nope"])),
      cycle: run(g1Coherence, (c) => void (claim(c, "claim.root").dependsOn = ["claim.vieta"])),
      beforeOtherBeat: run(g1Coherence, (c) => swap(c.bundle.plan.beats, 2, 3)),
      neverIntroduced: run(g1Coherence, (c) => void (c.bundle.script = c.bundle.script.filter((s) => s.id !== "s3.2"))),
      linkEarly: run(g1Coherence, (c) => void (sentence(c, "s3.4").linkClaimIds = ["claim.root", "claim.answer"])),
      skillOrder: run(g1Coherence, (c) => swap(c.bundle.plan.beats, 1, 2)),
    }).toMatchInlineSnapshot(`
      {
        "beforeOtherBeat": [
          {
            "code": "claim-before-dependency",
            "gate": "G1",
            "ids": [
              "c.quad.sum.steps.sum.1",
              "claim.vieta",
            ],
            "level": "fail",
            "message": "sentence s4.4 states claim c.quad.sum.steps.sum.1 before the claim it depends on, claim.vieta, is introduced",
          },
          {
            "code": "claim-before-dependency",
            "gate": "G1",
            "ids": [
              "c.quad.sum.steps.sum.1",
              "claim.vieta",
            ],
            "level": "fail",
            "message": "sentence s4.5 states claim c.quad.sum.steps.sum.1 before the claim it depends on, claim.vieta, is introduced",
          },
          {
            "code": "claim-before-dependency",
            "gate": "G1",
            "ids": [
              "c.quad.sum.steps.sum.1",
              "claim.vieta",
            ],
            "level": "fail",
            "message": "sentence s4.6 states claim c.quad.sum.steps.sum.1 before the claim it depends on, claim.vieta, is introduced",
          },
        ],
        "cycle": [
          {
            "code": "cycle",
            "gate": "G1",
            "ids": [
              "claim.root",
              "claim.vieta",
              "claim.root",
            ],
            "level": "fail",
            "message": "the claims depend on each other in a cycle: claim.root -> claim.vieta -> claim.root",
          },
          {
            "code": "claim-before-dependency",
            "gate": "G1",
            "ids": [
              "claim.root",
              "claim.vieta",
            ],
            "level": "fail",
            "message": "sentence s3.2 states claim claim.root before the claim it depends on, claim.vieta, is introduced",
          },
        ],
        "dangling": [
          {
            "code": "dangling-dependency",
            "gate": "G1",
            "ids": [
              "claim.mistake",
              "claim.nope",
            ],
            "level": "fail",
            "message": "claim claim.mistake depends on claim.nope, which is not a claim of this lesson",
          },
        ],
        "linkEarly": [
          {
            "code": "link-before-claim",
            "gate": "G1",
            "ids": [
              "s3.4",
              "claim.answer",
            ],
            "level": "fail",
            "message": "link sentence s3.4 comes before claim claim.answer is introduced",
          },
        ],
        "neverIntroduced": [
          {
            "code": "claim-before-dependency",
            "gate": "G1",
            "ids": [
              "claim.vieta",
              "claim.root",
            ],
            "level": "fail",
            "message": "sentence s3.3 states claim claim.vieta, but the claim it depends on, claim.root, is never introduced",
          },
          {
            "code": "link-before-claim",
            "gate": "G1",
            "ids": [
              "s3.4",
              "claim.root",
            ],
            "level": "fail",
            "message": "link sentence s3.4 comes before claim claim.root is introduced",
          },
          {
            "code": "claim-before-dependency",
            "gate": "G1",
            "ids": [
              "claim.vieta",
              "claim.root",
            ],
            "level": "fail",
            "message": "sentence s3.5 states claim claim.vieta, but the claim it depends on, claim.root, is never introduced",
          },
          {
            "code": "claim-before-dependency",
            "gate": "G1",
            "ids": [
              "claim.vieta",
              "claim.root",
            ],
            "level": "fail",
            "message": "sentence s3.6 states claim claim.vieta, but the claim it depends on, claim.root, is never introduced",
          },
        ],
        "skillOrder": [
          {
            "code": "prerequisite-after-dependent",
            "gate": "G1",
            "ids": [
              "b2",
              "b3",
            ],
            "level": "fail",
            "message": "beat b2 teaches MATH.ALG.QUAD.FACTORISE, a prerequisite of MATH.ALG.QUAD.SUM_OF_ROOTS, but comes after beat b3",
          },
        ],
      }
    `);
  });

  it("G2", () => {
    expect({
      short: run(g2Delivery, (c) => {
        c.lessonKind = "reference";
        for (const id of ["s3.3", "s3.5", "s3.6"]) dur(c)[id] = 100;
      }),
      warn: run(g2Delivery, (c) => {
        for (const id of ["s3.3", "s3.5", "s3.6"]) dur(c)[id] = 100;
      }),
      untimed: run(g2Delivery, (c) => void delete dur(c)["s3.5"]),
    }).toMatchInlineSnapshot(`
      {
        "short": [
          {
            "code": "core-claim-too-short",
            "gate": "G2",
            "ids": [
              "claim.vieta",
            ],
            "level": "fail",
            "message": "core claim claim.vieta is narrated for 300 ms, the floor is 8000 ms",
          },
        ],
        "untimed": [
          {
            "code": "no-duration",
            "gate": "G2",
            "ids": [
              "s3.5",
            ],
            "level": "fail",
            "message": "no audio duration for s3.5",
          },
        ],
        "warn": [
          {
            "code": "core-claim-too-short",
            "gate": "G2",
            "ids": [
              "claim.vieta",
            ],
            "level": "warn",
            "message": "core claim claim.vieta is narrated for 300 ms, the floor is 8000 ms",
          },
        ],
      }
    `);
  });

  it("G3", () => {
    expect({
      uncued: run(g3ActiveVisual, (c) => void (scene(c, "scene.b1").cues = [])),
      notOnClaimWorked: run(g3ActiveVisual, (c) => void (scene(c, "scene.b4").cues.find((q) => q.targetObject === "steps")!.anchor.sentenceId = "s4.1")),
      notOnClaimConcept: run(g3ActiveVisual, (c) => void (scene(c, "scene.b3").cues.find((q) => q.targetObject === "rule")!.anchor.sentenceId = "s3.1")),
      unrelated: run(g3ActiveVisual, (c) => void (scene(c, "scene.b3").cues.find((q) => q.targetObject === "rule")!.anchor.sentenceId = "s3.2")),
    }).toMatchInlineSnapshot(`
      {
        "notOnClaimConcept": [
          {
            "code": "cue-not-on-claim",
            "gate": "G3",
            "ids": [
              "scene.b3",
              "rule",
            ],
            "level": "fail",
            "message": "(b) object scene.b3/rule has no cue anchored to a sentence that carries a claim",
          },
        ],
        "notOnClaimWorked": [
          {
            "code": "cue-not-on-claim",
            "gate": "G3",
            "ids": [
              "scene.b4",
              "steps",
            ],
            "level": "fail",
            "message": "(b) in a worked beat object scene.b4/steps has no cue anchored to a sentence that carries a claim",
          },
        ],
        "uncued": [
          {
            "code": "uncued-object",
            "gate": "G3",
            "ids": [
              "scene.b1",
              "problem",
            ],
            "level": "fail",
            "message": "(a) object scene.b1/problem is the target of no cue",
          },
        ],
        "unrelated": [
          {
            "code": "cue-on-unrelated-claim",
            "gate": "G3",
            "ids": [
              "scene.b3",
              "rule",
            ],
            "level": "fail",
            "message": "(c) object scene.b3/rule shows quad.rule, but no cue is anchored to a sentence whose claim uses it",
          },
        ],
      }
    `);
  });

  it("G4", () => {
    expect({
      unknownArc: run(g4Arc, (c) => void (c.bundle.plan.arcId = "freestyle")),
      noGoal: run(g4Arc, (c) => void delete beat(c, "b2").learningGoal),
      badGoal: run(g4Arc, (c) => void (beat(c, "b2").learningGoal = "Find 2 roots")),
      illegalSlot: run(g4Arc, (c) => void (beat(c, "b5").slotId = "second_worked_example")),
      wrongKind: run(g4Arc, (c) => void (beat(c, "b3").beatKind = "worked")),
      twice: run(g4Arc, (c) => {
        beat(c, "b5").slotId = "concept";
        beat(c, "b5").beatKind = "concept";
      }),
      outOfOrder: run(g4Arc, (c) => swap(c.bundle.plan.beats, 2, 3)),
      missing: run(g4Arc, (c) => void (c.bundle.plan.beats = c.bundle.plan.beats.filter((b) => b.id !== "b6"))),
    }).toMatchInlineSnapshot(`
      {
        "badGoal": [
          {
            "code": "bad-learning-goal",
            "gate": "G4",
            "ids": [
              "b2",
            ],
            "level": "fail",
            "message": "beat b2: a learning goal has no digits",
          },
        ],
        "illegalSlot": [
          {
            "code": "illegal-slot",
            "gate": "G4",
            "ids": [
              "b5",
            ],
            "level": "fail",
            "message": "beat b5 fills slot second_worked_example, which arc problem_first does not have",
          },
          {
            "code": "missing-slot",
            "gate": "G4",
            "ids": [
              "common_mistake_contrast",
            ],
            "level": "fail",
            "message": "arc problem_first needs a beat for slot common_mistake_contrast",
          },
        ],
        "missing": [
          {
            "code": "missing-slot",
            "gate": "G4",
            "ids": [
              "check",
            ],
            "level": "fail",
            "message": "arc problem_first needs a beat for slot check",
          },
        ],
        "noGoal": [
          {
            "code": "no-learning-goal",
            "gate": "G4",
            "ids": [
              "b2",
            ],
            "level": "fail",
            "message": "beat b2 has no learning goal",
          },
        ],
        "outOfOrder": [
          {
            "code": "slot-out-of-order",
            "gate": "G4",
            "ids": [
              "b3",
            ],
            "level": "fail",
            "message": "beat b3 fills slot concept, which comes earlier in arc problem_first than the beat before it",
          },
        ],
        "twice": [
          {
            "code": "slot-filled-twice",
            "gate": "G4",
            "ids": [
              "b3",
              "b5",
            ],
            "level": "fail",
            "message": "slot concept is filled by both b3 and b5",
          },
          {
            "code": "slot-out-of-order",
            "gate": "G4",
            "ids": [
              "b5",
            ],
            "level": "fail",
            "message": "beat b5 fills slot concept, which comes earlier in arc problem_first than the beat before it",
          },
          {
            "code": "missing-slot",
            "gate": "G4",
            "ids": [
              "common_mistake_contrast",
            ],
            "level": "fail",
            "message": "arc problem_first needs a beat for slot common_mistake_contrast",
          },
        ],
        "unknownArc": [
          {
            "code": "unknown-arc",
            "gate": "G4",
            "ids": [
              "freestyle",
            ],
            "level": "fail",
            "message": "arc freestyle is not in the arc registry",
          },
        ],
        "wrongKind": [
          {
            "code": "wrong-beat-kind",
            "gate": "G4",
            "ids": [
              "b3",
            ],
            "level": "fail",
            "message": "beat b3 fills slot concept so it is a concept beat, not worked",
          },
        ],
      }
    `);
  });

  it("G5", () => {
    expect({
      notGoal: run(g5Role, (c) => void (sentence(c, "s2.1").role = "transition")),
      goalDiffers: run(g5Role, (c) => void (sentence(c, "s2.1").text = "What is factorising?")),
      goalNotFirst: run(g5Role, (c) => void (sentence(c, "s2.2").role = "goal")),
      digit: run(g5Role, (c) => {
        sentence(c, "s1.2").text = "Now look at idea 2.";
      }),
      placeholder: run(g5Role, (c) => {
        sentence(c, "s1.2").text = "See {expr:quad.eq}.";
        sentence(c, "s1.2").exprRefs = ["quad.eq"];
      }),
      tooLong: run(g5Role, (c) => {
        const nine = "one two three four five six seven eight nine";
        c.transitions = [...c.transitions, nine];
        sentence(c, "s1.2").text = nine;
      }),
      offList: run(g5Role, (c) => void (sentence(c, "s1.2").text = "Moving swiftly onwards.")),
      unknownClaim: run(g5Role, (c) => void (sentence(c, "s3.2").claimId = "claim.nope")),
      otherBeat: run(g5Role, (c) => void (sentence(c, "s3.2").claimId = "claim.answer")),
      foreign: run(g5Role, (c) => {
        sentence(c, "s2.2").text = "Factorising {expr:quad.fac.start} gives {expr:quad.rule}.";
        sentence(c, "s2.2").exprRefs = ["quad.fac.start", "quad.rule"];
      }),
      linkUnknown: run(g5Role, (c) => void (sentence(c, "s3.4").linkClaimIds = ["claim.root", "claim.nope"])),
      linkNoEdge: run(g5Role, (c) => void (sentence(c, "s3.4").linkClaimIds = ["claim.factorise", "claim.root"])),
      questionUnknown: run(g5Role, (c) => void (sentence(c, "s6.2").questionId = "q.nope")),
      questionText: run(g5Role, (c) => void (sentence(c, "s6.2").text = "What is the sum?")),
    }).toMatchInlineSnapshot(`
      {
        "digit": [
          {
            "code": "new-number",
            "gate": "G5",
            "ids": [
              "s1.2",
            ],
            "level": "fail",
            "message": "transition sentence s1.2 has a digit: it may introduce no number",
          },
          {
            "code": "transition-off-list",
            "gate": "G5",
            "ids": [
              "s1.2",
            ],
            "level": "fail",
            "message": "transition s1.2 is not on the closed list of the language",
          },
        ],
        "foreign": [
          {
            "code": "foreign-placeholder",
            "gate": "G5",
            "ids": [
              "s2.2",
              "claim.factorise",
            ],
            "level": "fail",
            "message": "claim sentence s2.2 uses quad.rule, which is not an expression of claim claim.factorise",
          },
        ],
        "goalDiffers": [
          {
            "code": "goal-text-differs",
            "gate": "G5",
            "ids": [
              "s2.1",
              "b2",
            ],
            "level": "fail",
            "message": "the goal sentence s2.1 must be the learning goal of beat b2 word for word",
          },
        ],
        "goalNotFirst": [
          {
            "code": "goal-not-first",
            "gate": "G5",
            "ids": [
              "s2.2",
            ],
            "level": "fail",
            "message": "sentence s2.2 has role goal but is not the first sentence of beat b2",
          },
          {
            "code": "new-placeholder",
            "gate": "G5",
            "ids": [
              "s2.2",
            ],
            "level": "fail",
            "message": "goal sentence s2.2 has an expression placeholder: it may introduce no expression",
          },
        ],
        "linkNoEdge": [
          {
            "code": "link-without-edge",
            "gate": "G5",
            "ids": [
              "s3.4",
              "claim.factorise",
              "claim.root",
            ],
            "level": "fail",
            "message": "link sentence s3.4 joins claim.factorise and claim.root, but neither depends on the other",
          },
        ],
        "linkUnknown": [
          {
            "code": "link-unknown-claim",
            "gate": "G5",
            "ids": [
              "s3.4",
            ],
            "level": "fail",
            "message": "link sentence s3.4 must cite two claims of this lesson",
          },
        ],
        "notGoal": [
          {
            "code": "first-sentence-not-goal",
            "gate": "G5",
            "ids": [
              "b2",
            ],
            "level": "fail",
            "message": "the first sentence of beat b2 must have role goal",
          },
          {
            "code": "transition-off-list",
            "gate": "G5",
            "ids": [
              "s2.1",
            ],
            "level": "fail",
            "message": "transition s2.1 is not on the closed list of the language",
          },
        ],
        "offList": [
          {
            "code": "transition-off-list",
            "gate": "G5",
            "ids": [
              "s1.2",
            ],
            "level": "fail",
            "message": "transition s1.2 is not on the closed list of the language",
          },
        ],
        "otherBeat": [
          {
            "code": "claim-of-another-beat",
            "gate": "G5",
            "ids": [
              "s3.2",
              "claim.answer",
            ],
            "level": "fail",
            "message": "claim sentence s3.2 states claim claim.answer, which belongs to beat b6",
          },
        ],
        "placeholder": [
          {
            "code": "new-placeholder",
            "gate": "G5",
            "ids": [
              "s1.2",
            ],
            "level": "fail",
            "message": "transition sentence s1.2 has an expression placeholder: it may introduce no expression",
          },
          {
            "code": "transition-off-list",
            "gate": "G5",
            "ids": [
              "s1.2",
            ],
            "level": "fail",
            "message": "transition s1.2 is not on the closed list of the language",
          },
        ],
        "questionText": [
          {
            "code": "question-text-differs",
            "gate": "G5",
            "ids": [
              "s6.2",
            ],
            "level": "fail",
            "message": "question sentence s6.2 must carry the text of practice question quad.sum.q.recall",
          },
        ],
        "questionUnknown": [
          {
            "code": "unknown-question",
            "gate": "G5",
            "ids": [
              "s6.2",
            ],
            "level": "fail",
            "message": "question sentence s6.2 cites no practice question",
          },
        ],
        "tooLong": [
          {
            "code": "transition-too-long",
            "gate": "G5",
            "ids": [
              "s1.2",
            ],
            "level": "fail",
            "message": "transition s1.2 has 9 words, at most 8",
          },
        ],
        "unknownClaim": [
          {
            "code": "unknown-claim",
            "gate": "G5",
            "ids": [
              "s3.2",
            ],
            "level": "fail",
            "message": "claim sentence s3.2 names no claim of this lesson",
          },
        ],
      }
    `);
  });

  it("G6", () => {
    expect({
      undeclared: run(g6Prerequisites, (c) => void delete c.bundle.plan.prerequisites),
      recap: run(g6Prerequisites, (c) => void (c.bundle.plan.beats = c.bundle.plan.beats.filter((b) => b.id !== "b2"))),
      link: run(g6Prerequisites, (c) => {
        c.bundle.plan.prerequisites = [{ skillId: "MATH.ALG.QUAD.FACTORISE", status: "linked" }];
        delete (c.skills as Record<string, unknown>)["MATH.ALG.QUAD.FACTORISE"];
      }),
      assumed: run(g6Prerequisites, (c) => {
        c.bundle.plan.prerequisites = [{ skillId: "MATH.ALG.QUAD.FACTORISE", status: "assumed" }];
        c.bundle.plan.level = "class-6";
      }),
    }).toMatchInlineSnapshot(`
      {
        "assumed": [
          {
            "code": "assumed-at-unlisted-level",
            "gate": "G6",
            "ids": [
              "MATH.ALG.QUAD.FACTORISE",
            ],
            "level": "fail",
            "message": "prerequisite MATH.ALG.QUAD.FACTORISE is declared assumed, but its skill is not assumable at level class-6",
          },
        ],
        "link": [
          {
            "code": "link-target-missing",
            "gate": "G6",
            "ids": [
              "MATH.ALG.QUAD.FACTORISE",
            ],
            "level": "fail",
            "message": "prerequisite MATH.ALG.QUAD.FACTORISE is declared linked, but no skill record for it exists in the content store",
          },
        ],
        "recap": [
          {
            "code": "recap-without-beat",
            "gate": "G6",
            "ids": [
              "MATH.ALG.QUAD.FACTORISE",
            ],
            "level": "fail",
            "message": "prerequisite MATH.ALG.QUAD.FACTORISE is declared recapped, but no prerequisite beat has sources from that skill",
          },
        ],
        "undeclared": [
          {
            "code": "undeclared-prerequisite",
            "gate": "G6",
            "ids": [
              "MATH.ALG.QUAD.FACTORISE",
            ],
            "level": "fail",
            "message": "prerequisite skill MATH.ALG.QUAD.FACTORISE is not declared as recapped, linked or assumed",
          },
        ],
      }
    `);
  });

  it("G7", () => {
    expect({
      unspoken: run(g7Coverage, (c) => void c.bundle.claims!.push({ id: "claim.unspoken", beatId: "b6", kind: "statement", claimMode: "grounded", importance: "core" })),
    }).toMatchInlineSnapshot(`
      {
        "unspoken": [
          {
            "code": "core-claim-not-narrated",
            "gate": "G7",
            "ids": [
              "claim.unspoken",
            ],
            "level": "fail",
            "message": "core claim claim.unspoken has no claim sentence",
          },
        ],
      }
    `);
  });
});

describe("edges that must not break a gate", () => {
  it("G1 ignores a claim sentence that names no known claim, and a goal sentence that carries a claim id", () => {
    const unknown = ctxWith((c) => void (sentence(c, "s3.2").claimId = "claim.nope"));
    expect(g1Coherence(unknown).map((f) => f.message).filter((m) => m.includes("s3.2"))).toEqual([]);
    const goalWithId = ctxWith((c) => {
      sentence(c, "s3.1").claimId = "claim.vieta"; // a goal sentence is not a claim sentence, whatever it carries
      c.bundle.script = c.bundle.script.filter((s) => s.id !== "s3.2");
    });
    expect(g1Coherence(goalWithId).map((f) => f.message).filter((m) => m.includes("s3.1"))).toEqual([]);
  });
  it("only a link sentence is held to the link rule", () => {
    const stray = ctxWith((c) => void (sentence(c, "s3.3").linkClaimIds = ["claim.answer", "claim.root"]));
    expect(g1Coherence(stray).filter((f) => f.code === "link-before-claim")).toEqual([]);
    const notLink = ctxWith((c) => void (sentence(c, "s3.4").role = "transition"));
    expect(g1Coherence(notLink).filter((f) => f.code === "link-before-claim")).toEqual([]);
    const noIds = ctxWith((c) => void delete sentence(c, "s3.4").linkClaimIds);
    expect(g1Coherence(noIds).filter((f) => f.code === "link-before-claim")).toEqual([]);
  });
  it("a claim that depends on itself is stated before itself, and is a cycle", () => {
    const ctx = ctxWith((c) => void (claim(c, "claim.vieta").dependsOn = [...(claim(c, "claim.vieta").dependsOn ?? []), "claim.vieta"]));
    expect(g1Coherence(ctx).map((f) => f.code).sort()).toEqual(["claim-before-dependency", "cycle"]);
  });
  it("a cycle with a tail reports only the ring", () => {
    expect(findCycle(new Map([["a", ["b"]], ["b", ["c"]], ["c", ["b"]]]))).toEqual(["b", "c", "b"]);
  });
  it("a beat whose source belongs to no known skill, or to a skill with no facts, is skipped", () => {
    const unknownSource = ctxWith((c) => void (beat(c, "b3").sourceIds = ["no.such.record"]));
    expect(g1Coherence(unknownSource)).toEqual([]);
    const noFacts = ctxWith((c) => void (c.skills = {}));
    expect(g1Coherence(noFacts)).toEqual([]);
  });
  it("a beat that teaches both skills is not out of order with itself, and a later beat of the same skill is fine", () => {
    const both = ctxWith((c) => {
      beat(c, "b4").sourceIds = ["quad.sum.steps", "quad.factorise.claim"];
    });
    expect(g1Coherence(both).filter((f) => f.code === "prerequisite-after-dependent")).toEqual([]);
    const later = ctxWith((c) => {
      beat(c, "b5").sourceIds = ["quad.factorise.claim"]; // factorising is taught after the concept and worked beats that need it: b5 is out of order with b3 and b4
    });
    expect(g1Coherence(later).filter((f) => f.code === "prerequisite-after-dependent").map((f) => f.ids)).toEqual([["b5", "b3"], ["b5", "b4"]]);
  });
  it("a name inherited from Object is not an arc", () => {
    for (const name of ["toString", "constructor", "__proto__", "hasOwnProperty"]) {
      const ctx = ctxWith((c) => void (c.bundle.plan.arcId = name));
      expect(g4Arc(ctx).map((f) => f.code), name).toEqual(["unknown-arc"]);
    }
  });
  it("the same slot twice is reported as twice; it is also out of order because the second beat follows the worked beat", () => {
    const ctx = ctxWith((c) => {
      beat(c, "b5").slotId = "concept";
      beat(c, "b5").beatKind = "concept";
    });
    expect(g4Arc(ctx).map((f) => f.code)).toEqual(["slot-filled-twice", "slot-out-of-order", "missing-slot"]);
    // two neighbouring beats on one slot are twice and nothing else
    const next = ctxWith((c) => {
      beat(c, "b4").slotId = "concept";
      beat(c, "b4").beatKind = "concept";
    });
    expect(g4Arc(next).map((f) => f.code)).toEqual(["slot-filled-twice", "missing-slot"]);
  });
});
