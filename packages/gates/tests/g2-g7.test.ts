import { describe, expect, it } from "vitest";
import { LOCALES } from "@eve/schema";
import { g2Delivery, g3ActiveVisual, g4Arc, g5Role, g6Prerequisites, g7Coverage, TRANSITION_MAX_WORDS, type GateContext } from "../src";
import { beat, claim, codes, ctxWith, dur, fresh, scene, sentence } from "./helpers";

const only = (ctx: GateContext, f: (c: GateContext) => { code: string }[]) => f(ctx).map((x) => x.code);

describe("G2 delivery", () => {
  const vieta = ["s3.3", "s3.5", "s3.6"]; // the claim sentences of the core claim claim.vieta
  const withTotal = (ms: number, kind: GateContext["lessonKind"] = "reference") =>
    ctxWith((c) => {
      c.lessonKind = kind;
      c.coreClaimMinMs = 8000;
      vieta.forEach((id, i) => (dur(c)[id] = i === 0 ? ms : 0));
    });

  it("passes the clean fixture", () => expect(g2Delivery(fresh().ctx)).toEqual([]));
  it("exactly the floor passes; one millisecond less fails", () => {
    expect(g2Delivery(withTotal(8000))).toEqual([]);
    const [f] = g2Delivery(withTotal(7999));
    expect(f).toMatchObject({ gate: "G2", code: "core-claim-too-short", ids: ["claim.vieta"], level: "fail" });
    expect(f!.message).toContain("7999 ms");
  });
  it("is a failure for a reference lesson and a warning for a generated one", () => {
    expect(g2Delivery(withTotal(100, "reference")).map((f) => f.level)).toEqual(["fail"]);
    expect(g2Delivery(withTotal(100, "generated")).map((f) => f.level)).toEqual(["warn"]);
  });
  it("adds up the claim sentences of one claim", () => {
    const ctx = ctxWith((c) => vieta.forEach((id) => (dur(c)[id] = 2700)));
    expect(g2Delivery(ctx)).toEqual([]); // 8100
    const short = ctxWith((c) => vieta.forEach((id) => (dur(c)[id] = 2600)));
    expect(codes(g2Delivery(short))).toEqual(["core-claim-too-short"]); // 7800
  });
  it("does not count goal, transition or link sentences, or sentences of another claim", () => {
    const ctx = withTotal(1000);
    for (const id of ["s3.1", "s3.4", "s1.2", "s3.2"]) dur(ctx)[id] = 60_000;
    expect(codes(g2Delivery(ctx))).toEqual(["core-claim-too-short"]);
  });
  it("ignores claims that are not core, and core claims that no sentence narrates (G7's finding)", () => {
    const ctx = withTotal(8000);
    claim(ctx, "claim.factorise").importance = "support";
    dur(ctx)["s2.2"] = 1;
    expect(g2Delivery(ctx)).toEqual([]);
    ctx.bundle.claims!.push({ id: "claim.unspoken", beatId: "b6", kind: "statement", importance: "core", claimMode: "grounded" });
    expect(g2Delivery(ctx)).toEqual([]);
  });
  it("a sentence with no duration is a failure, even in a generated lesson", () => {
    const ctx = ctxWith((c) => {
      c.lessonKind = "generated";
      delete dur(c)["s3.5"];
    });
    const [f] = g2Delivery(ctx);
    expect(f).toMatchObject({ code: "no-duration", level: "fail", ids: ["s3.5"] });
  });
});

describe("G3 active visual", () => {
  it("passes the clean fixture", () => expect(g3ActiveVisual(fresh().ctx)).toEqual([]));
  it("(a) an object nobody cues fails, in any beat, claims or not", () => {
    const inHook = ctxWith((c) => void (scene(c, "scene.b1").cues = []));
    expect(g3ActiveVisual(inHook).map((f) => f.message)).toEqual([expect.stringContaining("(a) object scene.b1/problem")]);
    const inWorked = ctxWith((c) => void (scene(c, "scene.b4").cues = scene(c, "scene.b4").cues.filter((q) => q.targetObject !== "total")));
    expect(codes(g3ActiveVisual(inWorked))).toEqual(["uncued-object"]);
  });
  it("(a) a cue on a part of an object (object#part) counts as a cue on the object", () => {
    const ctx = ctxWith((c) => void (scene(c, "scene.b1").cues[0]!.targetObject = "problem#lhs"));
    expect(g3ActiveVisual(ctx)).toEqual([]);
  });
  it("(a) a static object needs no cue", () => {
    const ctx = fresh().ctx;
    expect(scene(ctx, "scene.b1").objects.some((o) => o.role === "static")).toBe(true);
    expect(scene(ctx, "scene.b1").cues.some((q) => q.targetObject === "title")).toBe(false);
    expect(g3ActiveVisual(ctx)).toEqual([]);
  });
  it("a cue on a goal sentence satisfies (a) and, in a beat with no claims, nothing more is asked", () => {
    const ctx = fresh().ctx;
    expect(scene(ctx, "scene.b1").cues[0]!.anchor.sentenceId).toBe("s1.1");
    expect(sentence(ctx, "s1.1").role).toBe("goal");
    expect(g3ActiveVisual(ctx)).toEqual([]);
  });
  it("(b) in a beat with claims, a cue only on a goal or transition sentence fails", () => {
    const worked = ctxWith((c) => void (scene(c, "scene.b4").cues.find((q) => q.targetObject === "steps")!.anchor.sentenceId = "s4.1"));
    const [f] = g3ActiveVisual(worked);
    expect(f).toMatchObject({ code: "cue-not-on-claim", ids: ["scene.b4", "steps"] });
    expect(f!.message).toContain("in a worked beat");
    const concept = ctxWith((c) => void (scene(c, "scene.b3").cues.find((q) => q.targetObject === "rule")!.anchor.sentenceId = "s3.1"));
    const [g] = g3ActiveVisual(concept);
    expect(g!.message).not.toContain("in a worked beat");
    expect(g!.message).toContain("(b)");
  });
  it("(b) an object without an expression is satisfied by any claim-carrying sentence of its beat", () => {
    const ctx = fresh().ctx;
    expect(scene(ctx, "scene.b4").objects.find((o) => o.id === "steps")!.exprRef).toBeUndefined();
    expect(g3ActiveVisual(ctx)).toEqual([]);
  });
  it("(c) an object showing an expression needs a cue on a sentence whose claim uses it", () => {
    const ctx = ctxWith((c) => void (scene(c, "scene.b3").cues.find((q) => q.targetObject === "rule")!.anchor.sentenceId = "s3.2"));
    const [f] = g3ActiveVisual(ctx);
    expect(f).toMatchObject({ code: "cue-on-unrelated-claim", ids: ["scene.b3", "rule"] });
  });
  it("(c) one matching cue is enough when another cue is on an unrelated claim", () => {
    const ctx = ctxWith((c) => scene(c, "scene.b3").cues.push({ targetObject: "rule", action: "highlight", anchor: { sentenceId: "s3.2", at: "end" }, minHoldMs: 1000 }));
    expect(g3ActiveVisual(ctx)).toEqual([]);
  });
  it("a cue anchored to a link sentence matches either of its two claims", () => {
    // s3.4 is a link between claim.root (a statement: no expression) and claim.vieta (uses quad.general and quad.rule)
    const second = ctxWith((c) => {
      const cues = scene(c, "scene.b3").cues;
      cues.length = 0;
      cues.push({ targetObject: "general", action: "reveal", anchor: { sentenceId: "s3.4", at: "start" }, minHoldMs: 1 }, { targetObject: "rule", action: "reveal", anchor: { sentenceId: "s3.4", at: "start" }, minHoldMs: 1 });
    });
    expect(sentence(second, "s3.4").linkClaimIds).toEqual(["claim.root", "claim.vieta"]);
    expect(g3ActiveVisual(second)).toEqual([]); // matched through the SECOND claim of the link
    const first = ctxWith((c) => {
      sentence(c, "s3.4").linkClaimIds = ["claim.vieta", "claim.root"];
      const cues = scene(c, "scene.b3").cues;
      cues.length = 0;
      cues.push({ targetObject: "general", action: "reveal", anchor: { sentenceId: "s3.4", at: "start" }, minHoldMs: 1 }, { targetObject: "rule", action: "reveal", anchor: { sentenceId: "s3.4", at: "start" }, minHoldMs: 1 });
    });
    expect(g3ActiveVisual(first)).toEqual([]); // and through the first
    const neither = ctxWith((c) => {
      sentence(c, "s3.4").linkClaimIds = ["claim.root", "claim.mistake"];
      const cues = scene(c, "scene.b3").cues;
      cues.length = 0;
      cues.push({ targetObject: "general", action: "reveal", anchor: { sentenceId: "s3.4", at: "start" }, minHoldMs: 1 }, { targetObject: "rule", action: "reveal", anchor: { sentenceId: "s3.4", at: "start" }, minHoldMs: 1 });
    });
    expect(codes(g3ActiveVisual(neither))).toEqual(["cue-on-unrelated-claim", "cue-on-unrelated-claim"]);
  });
  it("a cue on a sentence that does not exist carries no claim", () => {
    const ctx = ctxWith((c) => void (scene(c, "scene.b4").cues.find((q) => q.targetObject === "steps")!.anchor.sentenceId = "s9.9"));
    expect(codes(g3ActiveVisual(ctx))).toEqual(["cue-not-on-claim"]);
  });
});

describe("G4 arc", () => {
  it("passes the clean fixture", () => expect(g4Arc(fresh().ctx)).toEqual([]));
  it("rejects an arc that is not in the registry", () => {
    const ctx = ctxWith((c) => void (c.bundle.plan.arcId = "freestyle"));
    expect(g4Arc(ctx).map((f) => f.code)).toEqual(["unknown-arc"]);
    const none = ctxWith((c) => void delete c.bundle.plan.arcId);
    expect(codes(g4Arc(none))).toContain("unknown-arc");
  });
  it("rejects a slot the arc does not have, or none", () => {
    const ctx = ctxWith((c) => void (beat(c, "b5").slotId = "second_worked_example"));
    expect(g4Arc(ctx).find((f) => f.code === "illegal-slot")!.ids).toEqual(["b5"]);
    const none = ctxWith((c) => void delete beat(c, "b5").slotId);
    expect(codes(g4Arc(none))).toContain("illegal-slot");
  });
  it("rejects a beat kind that does not match its slot", () => {
    const ctx = ctxWith((c) => void (beat(c, "b3").beatKind = "worked"));
    expect(g4Arc(ctx).find((f) => f.code === "wrong-beat-kind")!.message).toContain("is a concept beat, not worked");
  });
  it("rejects a slot filled twice, and a slot out of order", () => {
    const twice = ctxWith((c) => {
      beat(c, "b5").slotId = "concept";
      beat(c, "b5").beatKind = "concept";
    });
    expect(g4Arc(twice).find((f) => f.code === "slot-filled-twice")!.ids).toEqual(["b3", "b5"]);
    const order = ctxWith((c) => {
      const [i, j] = [2, 3];
      [c.bundle.plan.beats[i], c.bundle.plan.beats[j]] = [c.bundle.plan.beats[j]!, c.bundle.plan.beats[i]!];
    });
    expect(g4Arc(order).find((f) => f.code === "slot-out-of-order")!.ids).toEqual(["b3"]);
  });
  it("rejects a missing required slot, and the prerequisite slot only when the skill has prerequisites", () => {
    const noCheck = ctxWith((c) => void (c.bundle.plan.beats = c.bundle.plan.beats.filter((b) => b.id !== "b6")));
    expect(g4Arc(noCheck).find((f) => f.code === "missing-slot")!.ids).toEqual(["check"]);
    const noPrereq = ctxWith((c) => void (c.bundle.plan.beats = c.bundle.plan.beats.filter((b) => b.id !== "b2")));
    expect(g4Arc(noPrereq).find((f) => f.code === "missing-slot")!.ids).toEqual(["prerequisite_activation"]);
    const skillWithout = ctxWith((c) => {
      c.bundle.plan.beats = c.bundle.plan.beats.filter((b) => b.id !== "b2");
      c.skills = { ...c.skills, [c.bundle.skillId]: { prerequisiteSkillIds: [], assumableAtLevels: [] } };
    });
    expect(g4Arc(skillWithout)).toEqual([]);
  });
  it("checks the learning goal of every beat: present, 18 words or fewer, no digits, no notation", () => {
    const goal = (text: string | undefined) => ctxWith((c) => (text === undefined ? void delete beat(c, "b2").learningGoal : void (beat(c, "b2").learningGoal = text)));
    expect(codes(g4Arc(goal(undefined)))).toEqual(["no-learning-goal"]);
    expect(codes(g4Arc(goal("   ")))).toEqual(["no-learning-goal"]);
    expect(g4Arc(goal("Why"))).toEqual([]); // one word
    expect(g4Arc(goal(Array.from({ length: 18 }, () => "word").join(" ")))).toEqual([]); // exactly 18
    expect(codes(g4Arc(goal(Array.from({ length: 19 }, () => "word").join(" "))))).toEqual(["bad-learning-goal"]);
    expect(g4Arc(goal("Find 2 roots")).map((f) => f.message)).toEqual([expect.stringContaining("no digits")]);
    expect(g4Arc(goal("Solve x = y")).map((f) => f.message)).toEqual([expect.stringContaining("no notation")]);
  });
});

describe("G5 role", () => {
  it("passes the clean fixture", () => expect(g5Role(fresh().ctx)).toEqual([]));
  it("the first sentence of a beat is the goal, word for word", () => {
    const notGoal = ctxWith((c) => void (sentence(c, "s2.1").role = "transition"));
    expect(codes(g5Role(notGoal))).toContain("first-sentence-not-goal");
    const differs = ctxWith((c) => void (sentence(c, "s2.1").text = "What is factorising?"));
    expect(g5Role(differs).find((f) => f.code === "goal-text-differs")!.ids).toEqual(["s2.1", "b2"]);
    const noSentence = ctxWith((c) => void (c.bundle.script = c.bundle.script.filter((s) => s.beatId !== "b2")));
    expect(codes(g5Role(noSentence))).toEqual(["first-sentence-not-goal"]);
  });
  it("a goal sentence is only ever the first", () => {
    const ctx = ctxWith((c) => void (sentence(c, "s2.2").role = "goal"));
    expect(codes(g5Role(ctx))).toContain("goal-not-first");
  });
  it("goal and transition sentences carry no digit and no placeholder", () => {
    const digit = ctxWith((c) => {
      sentence(c, "s1.1").text += " 2";
      beat(c, "b1").learningGoal += " 2";
    });
    expect(codes(g5Role(digit))).toEqual(["new-number"]);
    const placeholder = ctxWith((c) => {
      sentence(c, "s1.2").text = "See {expr:quad.eq}.";
      sentence(c, "s1.2").exprRefs = ["quad.eq"];
    });
    expect(codes(g5Role(placeholder))).toContain("new-placeholder");
    const textOnly = ctxWith((c) => void (sentence(c, "s1.2").text = "See {expr:quad.eq}."));
    expect(codes(g5Role(textOnly))).toContain("new-placeholder");
    const refsOnly = ctxWith((c) => void (sentence(c, "s1.2").exprRefs = ["quad.eq"]));
    expect(codes(g5Role(refsOnly))).toContain("new-placeholder");
  });
  it("a transition is on the closed list and has 8 words or fewer", () => {
    expect(TRANSITION_MAX_WORDS).toBe(8);
    const eight = "one two three four five six seven eight";
    const nine = `${eight} nine`;
    const ok = ctxWith((c) => {
      c.transitions = [...c.transitions, eight];
      sentence(c, "s1.2").text = eight;
    });
    expect(g5Role(ok)).toEqual([]); // exactly 8 words, on the list
    const long = ctxWith((c) => {
      c.transitions = [...c.transitions, nine];
      sentence(c, "s1.2").text = nine;
    });
    expect(codes(g5Role(long))).toEqual(["transition-too-long"]);
    const off = ctxWith((c) => void (sentence(c, "s1.2").text = "Moving swiftly onwards."));
    expect(codes(g5Role(off))).toEqual(["transition-off-list"]);
    expect(LOCALES["en-IN"]!.transitions.every((t) => t.split(/\s+/).length <= 8)).toBe(true);
  });
  it("a claim sentence names a claim of its own beat and uses only its expressions", () => {
    const unknown = ctxWith((c) => void (sentence(c, "s3.2").claimId = "claim.nope"));
    expect(codes(g5Role(unknown))).toEqual(["unknown-claim"]);
    const noId = ctxWith((c) => void delete sentence(c, "s3.2").claimId);
    expect(codes(g5Role(noId))).toEqual(["unknown-claim"]);
    const other = ctxWith((c) => void (sentence(c, "s3.2").claimId = "claim.answer"));
    expect(g5Role(other).find((f) => f.code === "claim-of-another-beat")!.ids).toEqual(["s3.2", "claim.answer"]);
    const foreign = ctxWith((c) => {
      sentence(c, "s2.2").text = "Factorising {expr:quad.fac.start} gives {expr:quad.rule}.";
      sentence(c, "s2.2").exprRefs = ["quad.fac.start", "quad.rule"];
    });
    expect(g5Role(foreign).find((f) => f.code === "foreign-placeholder")!.message).toContain("quad.rule");
  });
  it("a link sentence cites two claims of the lesson joined by an edge, in either direction", () => {
    const edgeBackwards = ctxWith((c) => void (sentence(c, "s3.4").linkClaimIds = ["claim.vieta", "claim.root"]));
    expect(g5Role(edgeBackwards)).toEqual([]);
    const noEdge = ctxWith((c) => void (sentence(c, "s3.4").linkClaimIds = ["claim.factorise", "claim.root"]));
    expect(g5Role(noEdge).find((f) => f.code === "link-without-edge")!.ids).toEqual(["s3.4", "claim.factorise", "claim.root"]);
    const unknown = ctxWith((c) => void (sentence(c, "s3.4").linkClaimIds = ["claim.root", "claim.nope"]));
    expect(codes(g5Role(unknown))).toEqual(["link-unknown-claim"]);
    const unknownFirst = ctxWith((c) => void (sentence(c, "s3.4").linkClaimIds = ["claim.nope", "claim.vieta"]));
    expect(codes(g5Role(unknownFirst))).toEqual(["link-unknown-claim"]);
    const missing = ctxWith((c) => void delete sentence(c, "s3.4").linkClaimIds);
    expect(codes(g5Role(missing))).toEqual(["link-unknown-claim"]);
  });
  it("a question sentence cites a practice question and carries its text", () => {
    const unknown = ctxWith((c) => void (sentence(c, "s6.2").questionId = "q.nope"));
    expect(codes(g5Role(unknown))).toEqual(["unknown-question"]);
    const none = ctxWith((c) => void delete sentence(c, "s6.2").questionId);
    expect(codes(g5Role(none))).toEqual(["unknown-question"]);
    const text = ctxWith((c) => void (sentence(c, "s6.2").text = "What is the sum?"));
    expect(g5Role(text).find((f) => f.code === "question-text-differs")!.ids).toEqual(["s6.2"]);
  });
});

describe("G6 prerequisites", () => {
  it("passes the clean fixture, where the prerequisite is recapped by a prerequisite beat", () => {
    const ctx = fresh().ctx;
    expect(ctx.bundle.plan.prerequisites).toEqual([{ skillId: "MATH.ALG.QUAD.FACTORISE", status: "recapped" }]);
    expect(g6Prerequisites(ctx)).toEqual([]);
  });
  it("an undeclared prerequisite fails", () => {
    const ctx = ctxWith((c) => void delete c.bundle.plan.prerequisites);
    expect(g6Prerequisites(ctx)).toEqual([expect.objectContaining({ code: "undeclared-prerequisite", ids: ["MATH.ALG.QUAD.FACTORISE"] })]);
  });
  it("recapped needs a prerequisite beat with sources from that skill", () => {
    const noBeat = ctxWith((c) => void (c.bundle.plan.beats = c.bundle.plan.beats.filter((b) => b.id !== "b2")));
    expect(codes(g6Prerequisites(noBeat))).toEqual(["recap-without-beat"]);
    const wrongKind = ctxWith((c) => void (beat(c, "b2").beatKind = "concept"));
    expect(codes(g6Prerequisites(wrongKind))).toEqual(["recap-without-beat"]);
    const otherSkill = ctxWith((c) => void (beat(c, "b2").sourceIds = ["quad.sum.problem"]));
    expect(codes(g6Prerequisites(otherSkill))).toEqual(["recap-without-beat"]);
  });
  it("linked needs the skill to exist in the content store", () => {
    const ok = ctxWith((c) => void (c.bundle.plan.prerequisites = [{ skillId: "MATH.ALG.QUAD.FACTORISE", status: "linked" }]));
    expect(g6Prerequisites(ok)).toEqual([]);
    const missing = ctxWith((c) => {
      c.bundle.plan.prerequisites = [{ skillId: "MATH.ALG.QUAD.FACTORISE", status: "linked" }];
      delete (c.skills as Record<string, unknown>)["MATH.ALG.QUAD.FACTORISE"];
    });
    expect(codes(g6Prerequisites(missing))).toEqual(["link-target-missing"]);
  });
  it("assumed needs the lesson level to be one the skill lists", () => {
    const assumed = (level: string | undefined) =>
      ctxWith((c) => {
        c.bundle.plan.prerequisites = [{ skillId: "MATH.ALG.QUAD.FACTORISE", status: "assumed" }];
        if (level === undefined) delete c.bundle.plan.level;
        else c.bundle.plan.level = level;
      });
    expect(g6Prerequisites(assumed("class-10"))).toEqual([]);
    expect(codes(g6Prerequisites(assumed("class-6")))).toEqual(["assumed-at-unlisted-level"]);
    expect(codes(g6Prerequisites(assumed(undefined)))).toEqual(["assumed-at-unlisted-level"]);
  });
  it("checks the direct prerequisites of the skills the beats teach, not only the lesson skill", () => {
    const ctx = ctxWith((c) => {
      c.skills = { ...c.skills, "MATH.ALG.QUAD.FACTORISE": { prerequisiteSkillIds: ["MATH.ALG.EXPAND"], assumableAtLevels: ["class-10"] } };
      beat(c, "b4").sourceIds = ["quad.sum.steps", "quad.factorise.claim"]; // a non-prerequisite beat now teaches FACTORISE too
    });
    expect(g6Prerequisites(ctx)).toEqual([expect.objectContaining({ code: "undeclared-prerequisite", ids: ["MATH.ALG.EXPAND"] })]);
  });
  it("does not go down the chain: a prerequisite of a recapped prerequisite is not required", () => {
    const ctx = ctxWith((c) => void (c.skills = { ...c.skills, "MATH.ALG.QUAD.FACTORISE": { prerequisiteSkillIds: ["MATH.ALG.EXPAND"], assumableAtLevels: ["class-10"] } }));
    expect(g6Prerequisites(ctx)).toEqual([]); // only a prerequisite beat teaches FACTORISE, so its own prerequisites are not checked (ADR 0035)
  });
  it("a skill with no skill facts has no prerequisites to check", () => {
    const ctx = ctxWith((c) => void (c.skills = {}));
    expect(g6Prerequisites(ctx)).toEqual([]);
  });
});

describe("G7 core coverage", () => {
  it("passes the clean fixture", () => expect(g7Coverage(fresh().ctx)).toEqual([]));
  it("a core claim with no claim sentence fails, for every lesson", () => {
    for (const kind of ["reference", "generated"] as const) {
      const ctx = ctxWith((c) => {
        c.lessonKind = kind;
        c.bundle.claims!.push({ id: "claim.unspoken", beatId: "b6", kind: "statement", claimMode: "grounded", importance: "core" });
      });
      expect(g7Coverage(ctx)).toEqual([expect.objectContaining({ gate: "G7", level: "fail", code: "core-claim-not-narrated", ids: ["claim.unspoken"] })]);
    }
  });
  it("a support claim needs no sentence", () => {
    const ctx = ctxWith((c) => c.bundle.claims!.push({ id: "claim.quiet", beatId: "b6", kind: "statement", claimMode: "grounded", importance: "support" }));
    expect(g7Coverage(ctx)).toEqual([]);
  });
  it("a link sentence, a goal or a question about a claim does not narrate it", () => {
    const ctx = ctxWith((c) => {
      c.bundle.script = c.bundle.script.filter((s) => !(s.role === "claim" && s.claimId === "claim.answer"));
      sentence(c, "s6.1").claimId = "claim.answer";
    });
    expect(only(ctx, g7Coverage)).toEqual(["core-claim-not-narrated"]);
    const link = ctxWith((c) => {
      c.bundle.script = c.bundle.script.filter((s) => !(s.role === "claim" && s.claimId === "claim.vieta"));
    });
    expect(only(link, g7Coverage)).toEqual(["core-claim-not-narrated"]); // s3.4 still links it
    expect(sentence(link, "s3.4").linkClaimIds).toContain("claim.vieta");
  });
  it("a claim sentence with no claim id narrates nothing", () => {
    const ctx = ctxWith((c) => {
      for (const s of c.bundle.script) if (s.claimId === "claim.answer") delete s.claimId;
    });
    expect(only(ctx, g7Coverage)).toEqual(["core-claim-not-narrated"]);
  });
});
