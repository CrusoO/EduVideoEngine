import { describe, expect, it } from "vitest";
import { migrateToV2, named, num, eq, sym, quadraticRootsV1 as legacy, seal, validateBundle, type LessonBundle, type MigrationInput } from "../src";

/**
 * Every message validateBundle can give, word for word and path for path, one deliberately broken bundle per rule. A reader sees these strings when a
 * lesson is rejected, so a change to one is a change to the product and must show up here.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
type Any = any;
const claimOf: Record<string, string> = { "s2.1": "c.vieta", "s2.2": "c.vieta", "s2.3": "c.vieta", "s3.1": "c.factored", "s3.2": "c.sum", "s3.3": "c.sum-rule", "s5.1": "c.answer", "s5.2": "c.answer" };
const input: MigrationInput = {
  subjectId: "maths",
  arcId: "problem_first",
  level: "class-10",
  prerequisites: [{ skillId: "MATH.ALG.QUAD.FACTORISE", status: "assumed" }],
  beats: {
    b1: { slotId: "hook", learningGoal: "What do the two roots of a quadratic add up to?" },
    b2: { slotId: "concept", learningGoal: "Why does the first two coefficients give the sum?" },
    b3: { slotId: "worked_example", learningGoal: "Does the shortcut agree with solving the long way?" },
    b4: { beatKind: "concept", slotId: "concept", learningGoal: "Where do the roots sit on the graph?" },
    b5: { slotId: "check", learningGoal: "Can you find the sum of roots yourself?" },
  },
  sentences: Object.fromEntries(legacy.script.map((s) => [s.id, claimOf[s.id] ? { role: "claim" as const, claimId: claimOf[s.id] } : { role: "transition" as const }])),
};
const v2 = (): LessonBundle => migrateToV2(structuredClone(legacy), input);

/** Edit a copy, seal it again (so only the targeted rule can fail), and list "path: message" for every issue. */
const run = (from: () => LessonBundle, edit: (b: Any) => void, resealIt = true): string[] => {
  const b: Any = structuredClone(from());
  edit(b);
  const { hashes, ...rest } = b;
  const v = validateBundle(resealIt ? seal(rest) : { ...rest, hashes });
  return v.ok ? [] : v.issues.map((i) => `${i.path}: ${i.message}`);
};
const words = (n: number) => Array.from({ length: n }, (_, i) => "w" + "abcdefghijklmnopqrstuvwxyz"[i]).join(" ");
const one = (edit: (b: Any) => void, resealIt = true) => run(() => legacy, edit, resealIt);
const two = (edit: (b: Any) => void, resealIt = true) => run(v2, edit, resealIt);

describe("the clean bundles", () => {
  it("are valid and carry no warnings", () => {
    expect(validateBundle(legacy)).toMatchObject({ ok: true, issues: [], warnings: [] });
    expect(validateBundle(v2())).toMatchObject({ ok: true, issues: [], warnings: [] });
  });
});

describe("cross-references in a bundle", () => {
  it("locale, beats, length and sources", () => {
    expect({
      locale: one((b) => void (b.locale = "xx-XX")),
      duplicateBeat: one((b) => void (b.plan.beats[1].id = "b1")),
      tooFewBeats: one((b) => void (b.plan.beats = b.plan.beats.slice(0, 3))),
      tooManyBeats: one((b) => void (b.plan.beats = [...b.plan.beats, ...b.plan.beats.map((x: Any) => ({ ...x, id: `${x.id}x` })), ...b.plan.beats.map((x: Any) => ({ ...x, id: `${x.id}y` }))])),
      unknownBeatSource: one((b) => void (b.plan.beats[0].sourceIds = ["src.nope"])),
    }).toMatchInlineSnapshot(`
      {
        "duplicateBeat": [
          "plan.beats: beat ids must be unique",
          "script.s2.1.beatId: unknown beat b2",
          "script.s2.2.beatId: unknown beat b2",
          "script.s2.3.beatId: unknown beat b2",
          "scenes.scene2.beatId: unknown beat b2",
          "claims.c.vieta: claim names unknown beat b2",
          "plan.beats.b1.cueFocus: cueFocus names no object of the beat",
        ],
        "locale": [
          "locale: locale xx-XX is not in the language registry",
        ],
        "tooFewBeats": [
          "plan.beats: a lesson has 4 to 10 beats",
          "script.s4.1.beatId: unknown beat b4",
          "script.s4.2.beatId: unknown beat b4",
          "script.s5.1.beatId: unknown beat b5",
          "script.s5.2.beatId: unknown beat b5",
          "scenes.scene4.beatId: unknown beat b4",
          "scenes.scene5.beatId: unknown beat b5",
          "claims.c.answer: claim names unknown beat b5",
        ],
        "tooManyBeats": [
          "plan.beats: a lesson has 4 to 10 beats",
          "plan.beats.b1x: every beat needs at least one scene",
          "plan.beats.b1x: every beat needs narration",
          "plan.beats.b1x.cueFocus: cueFocus names no object of the beat",
          "plan.beats.b2x: every beat needs at least one scene",
          "plan.beats.b2x: every beat needs narration",
          "plan.beats.b2x.cueFocus: cueFocus names no object of the beat",
          "plan.beats.b3x: every beat needs at least one scene",
          "plan.beats.b3x: every beat needs narration",
          "plan.beats.b3x.cueFocus: cueFocus names no object of the beat",
          "plan.beats.b3x: a worked beat must declare the claims its steps rely on (roots, sums, factorisations): add claims with this beatId",
          "plan.beats.b3x: a worked beat needs a pause-and-ask",
          "plan.beats.b4x: every beat needs at least one scene",
          "plan.beats.b4x: every beat needs narration",
          "plan.beats.b4x.cueFocus: cueFocus names no object of the beat",
          "plan.beats.b5x: every beat needs at least one scene",
          "plan.beats.b5x: every beat needs narration",
          "plan.beats.b5x.cueFocus: cueFocus names no object of the beat",
          "plan.beats.b1y: every beat needs at least one scene",
          "plan.beats.b1y: every beat needs narration",
          "plan.beats.b1y.cueFocus: cueFocus names no object of the beat",
          "plan.beats.b2y: every beat needs at least one scene",
          "plan.beats.b2y: every beat needs narration",
          "plan.beats.b2y.cueFocus: cueFocus names no object of the beat",
          "plan.beats.b3y: every beat needs at least one scene",
          "plan.beats.b3y: every beat needs narration",
          "plan.beats.b3y.cueFocus: cueFocus names no object of the beat",
          "plan.beats.b3y: a worked beat must declare the claims its steps rely on (roots, sums, factorisations): add claims with this beatId",
          "plan.beats.b3y: a worked beat needs a pause-and-ask",
          "plan.beats.b4y: every beat needs at least one scene",
          "plan.beats.b4y: every beat needs narration",
          "plan.beats.b4y.cueFocus: cueFocus names no object of the beat",
          "plan.beats.b5y: every beat needs at least one scene",
          "plan.beats.b5y: every beat needs narration",
          "plan.beats.b5y.cueFocus: cueFocus names no object of the beat",
        ],
        "unknownBeatSource": [
          "plan.beats.b1.sourceIds: unknown source src.nope",
        ],
      }
    `);
  });
  it("duration: over the target is a warning, over the hard limit fails", () => {
    const warn = (n: number) => {
      const b: Any = structuredClone(legacy);
      b.plan.targetLengthS = n;
      const { hashes: _h, ...rest } = b;
      void _h;
      const v = validateBundle(seal(rest));
      return { ok: v.ok, issues: v.issues.map((i) => `${i.path}: ${i.message}`), warnings: v.warnings.map((i) => `${i.path}: ${i.message}`) };
    };
    expect({ atTarget: warn(300), overTarget: warn(301), atHard: warn(420), overHard: warn(421) }).toMatchInlineSnapshot(`
      {
        "atHard": {
          "issues": [],
          "ok": true,
          "warnings": [
            "plan.targetLengthS: planned for 420 s: over the 300 s target",
          ],
        },
        "atTarget": {
          "issues": [],
          "ok": true,
          "warnings": [],
        },
        "overHard": {
          "issues": [
            "plan.targetLengthS: a lesson may last at most 420 s, this one is planned for 421 s",
          ],
          "ok": false,
          "warnings": [],
        },
        "overTarget": {
          "issues": [],
          "ok": true,
          "warnings": [
            "plan.targetLengthS: planned for 301 s: over the 300 s target",
          ],
        },
      }
    `);
  });
  it("sentences", () => {
    expect({
      duplicateSentence: one((b) => void (b.script[1].id = "s1.1")),
      unknownBeat: one((b) => void (b.script[0].beatId = "b99")),
      literalMaths: one((b) => void (b.script[1].text = "It is 2 + 3 here.")),
      placeholderNotListed: one((b) => void ((b.script[1].text = "See {expr:eq1} now."), (b.script[1].exprRefs = []))),
      unknownExpression: one((b) => void ((b.script[1].text = "See {expr:nope} now."), (b.script[1].exprRefs = ["nope"]))),
      listedNotUsed: one((b) => void (b.script[1].exprRefs = ["eq1"])),
      spanPastEnd: one((b) => void (b.script[1].termSpans = [{ start: 0, end: 9999, glossaryId: "g" }])),
      spanEmpty: one((b) => void (b.script[1].termSpans = [{ start: 3, end: 3, glossaryId: "g" }])),
      spanBackwards: one((b) => void (b.script[1].termSpans = [{ start: 4, end: 2, glossaryId: "g" }])),
    }).toMatchInlineSnapshot(`
      {
        "duplicateSentence": [
          "script: sentence ids must be unique",
          "scenes.scene1.cues: cue anchors to unknown sentence s1.2",
        ],
        "listedNotUsed": [
          "script.s1.2.exprRefs: expression eq1 is listed but not used in the text",
        ],
        "literalMaths": [
          "script.s1.2.text: maths must be an {expr:id} placeholder, not literal text",
        ],
        "placeholderNotListed": [
          "script.s1.2.text: placeholder eq1 is not listed in exprRefs",
        ],
        "spanBackwards": [
          "script.s1.2.termSpans: span is outside the text",
        ],
        "spanEmpty": [
          "script.s1.2.termSpans: span is outside the text",
        ],
        "spanPastEnd": [
          "script.s1.2.termSpans: span is outside the text",
        ],
        "unknownBeat": [
          "script.s1.1.beatId: unknown beat b99",
          "scenes.scene1.cues: cue anchors to s1.1, which is not in this scene's beat",
          "scenes.scene1.cues: cue anchors to s1.1, which is not in this scene's beat",
        ],
        "unknownExpression": [
          "script.s1.2.exprRefs: unknown expression nope",
        ],
      }
    `);
  });
  it("scenes, objects and layout", () => {
    expect({
      duplicateScene: one((b) => void (b.scenes[1].id = "scene1")),
      unknownBeat: one((b) => void (b.scenes[0].beatId = "b99")),
      unknownSource: one((b) => void (b.scenes[0].sourceIds = ["src.nope"])),
      duplicateObject: one((b) => void (b.scenes[0].objects[1].id = "title")),
      unknownExprRef: one((b) => void (b.scenes[0].objects[1].exprRef = "nope")),
      equationWithoutExpr: one((b) => void delete b.scenes[0].objects[1].exprRef),
      graphWithoutExpr: one((b) => void delete b.scenes[3].objects[0].exprRef),
      columnUnknown: one((b) => void (b.scenes[0].layout = [{ rule: "column", items: ["title", "ghost"] }])),
      rowUnknown: one((b) => void (b.scenes[0].layout = [{ rule: "row", items: ["ghost", "title"] }])),
      centerUnknown: one((b) => void (b.scenes[0].layout = [{ rule: "center", item: "ghost" }])),
      anchorUnknownItem: one((b) => void (b.scenes[0].layout = [{ rule: "below", item: "ghost", of: "title" }])),
      anchorUnknownOf: one((b) => void (b.scenes[0].layout = [{ rule: "below", item: "title", of: "ghost" }])),
    }).toMatchInlineSnapshot(`
      {
        "anchorUnknownItem": [
          "scenes.scene1.layout: layout names unknown object ghost",
        ],
        "anchorUnknownOf": [
          "scenes.scene1.layout: layout names unknown object ghost",
        ],
        "centerUnknown": [
          "scenes.scene1.layout: layout names unknown object ghost",
        ],
        "columnUnknown": [
          "scenes.scene1.layout: layout names unknown object ghost",
        ],
        "duplicateObject": [
          "scenes.scene1.objects: object ids must be unique within a scene",
          "scenes.scene1.layout: layout names unknown object eq1",
          "scenes.scene1.cues: cue targets unknown object eq1",
          "scenes.scene1.cues: cue targets unknown object eq1",
          "plan.beats.b1.cueFocus: cueFocus names no object of the beat",
        ],
        "duplicateScene": [
          "scenes.scene1: scene ids must be unique",
        ],
        "equationWithoutExpr": [
          "scenes.scene1.objects.eq1: equation must take its content from an exprRef",
        ],
        "graphWithoutExpr": [
          "scenes.scene4.objects.graph: functionGraph must take its content from an exprRef",
        ],
        "rowUnknown": [
          "scenes.scene1.layout: layout names unknown object ghost",
        ],
        "unknownBeat": [
          "scenes.scene1.beatId: unknown beat b99",
          "scenes.scene1.cues: cue anchors to s1.1, which is not in this scene's beat",
          "scenes.scene1.cues: cue anchors to s1.1, which is not in this scene's beat",
          "scenes.scene1.cues: cue anchors to s1.2, which is not in this scene's beat",
          "plan.beats.b1: every beat needs at least one scene",
          "plan.beats.b1.cueFocus: cueFocus names no object of the beat",
        ],
        "unknownExprRef": [
          "scenes.scene1.objects.eq1.exprRef: unknown expression nope",
        ],
        "unknownSource": [
          "scenes.scene1.sourceIds: unknown source src.nope",
        ],
      }
    `);
  });
  it("cues and interactions", () => {
    expect({
      unknownObject: one((b) => void (b.scenes[0].cues[0].targetObject = "ghost")),
      partOfAHighlight: one((b) => void (b.scenes[3].cues[1].targetObject = "roots#r1")),
      partOfAnEquation: one((b) => void (b.scenes[0].cues[0].targetObject = "eq1#lhs")),
      unknownSentence: one((b) => void (b.scenes[0].cues[0].anchor.sentenceId = "s99")),
      sentenceOfAnotherBeat: one((b) => void (b.scenes[0].cues[0].anchor.sentenceId = "s2.1")),
      wordIndexAtEnd: one((b) => void (b.scenes[0].cues[1].anchor.at = { wordIndex: 99 })),
      askAfterOtherBeat: one((b) => void (b.scenes[2].interactions[0].afterSentenceId = "s1.1")),
      askUnknownExpr: one((b) => void (b.scenes[2].interactions[0].goalExprRef = "nope")),
    }).toMatchInlineSnapshot(`
      {
        "askAfterOtherBeat": [
          "scenes.scene3.interactions.ask3: pause-and-ask must follow a sentence of this beat",
        ],
        "askUnknownExpr": [
          "scenes.scene3.interactions.ask3: unknown expression nope",
        ],
        "partOfAHighlight": [
          "scenes.scene4.cues: roots has no parts to target",
        ],
        "partOfAnEquation": [],
        "sentenceOfAnotherBeat": [
          "scenes.scene1.cues: cue anchors to s2.1, which is not in this scene's beat",
        ],
        "unknownObject": [
          "scenes.scene1.cues: cue targets unknown object ghost",
        ],
        "unknownSentence": [
          "scenes.scene1.cues: cue anchors to unknown sentence s99",
        ],
        "wordIndexAtEnd": [
          "scenes.scene1.cues: wordIndex 99 is past the end of s1.1",
        ],
      }
    `);
  });
  it("colours", () => {
    const colour = (b: Any, colours: Record<string, string>, ...terms: string[]) => {
      b.expressions.eq1 = eq(named(terms[0]!, sym("x")), named(terms[1]!, num(1)));
      b.termColors = colours;
    };
    expect({
      unknownTerm: one((b) => void (b.termColors = { ghost: "blue" })),
      sharedInOneScene: one((b) => colour(b, { a: "blue", b: "blue" }, "a", "b")),
      differentColours: one((b) => colour(b, { a: "blue", b: "red" }, "a", "b")),
      sameTermTwice: one((b) => colour(b, { a: "blue" }, "a", "a")),
    }).toMatchInlineSnapshot(`
      {
        "differentColours": [],
        "sameTermTwice": [],
        "sharedInOneScene": [
          "scenes.scene1: terms a and b share the colour blue in one scene",
        ],
        "unknownTerm": [
          "termColors.ghost: no expression has a term named ghost",
        ],
      }
    `);
  });
  it("claims, beats and hashes", () => {
    expect({
      duplicateClaim: one((b) => void (b.claims[1].id = b.claims[0].id)),
      unknownBeat: one((b) => void (b.claims[0].beatId = "b99")),
      unknownExpression: one((b) => void (b.claims[0].a = "nope")),
      notAnEquation: one((b) => void (b.claims[1].equation = "x1" in b.expressions ? "x1" : Object.keys(b.expressions).find((k) => b.expressions[k].op !== "eq"))),
      noScene: one((b) => void (b.scenes = b.scenes.filter((s: Any) => s.beatId !== "b4"))),
      noNarration: one((b) => void (b.script = b.script.filter((s: Any) => s.beatId !== "b4"))),
      cueFocusMissing: one((b) => void (b.plan.beats[0].cueFocus = "ghost")),
      workedNoClaims: one((b) => void (b.claims = b.claims.filter((c: Any) => c.beatId !== "b3"))),
      workedNoAsk: one((b) => void (b.scenes[2].interactions = [])),
      workedNoAskField: one((b) => void delete b.scenes[2].interactions),
      bundleHash: one((b) => void (b.script[1].text = "Different words here."), false),
      sceneHash: one((b) => void (b.scenes[0].objects[0].props = { ...b.scenes[0].objects[0].props, text: "Changed words" }), false),
      ghostSceneHash: one((b) => void (b.hashes = { ...b.hashes, perScene: { ...b.hashes.perScene, ghost: "0".repeat(64) } }), false),
    }).toMatchInlineSnapshot(`
      {
        "bundleHash": [
          "hashes.bundle: bundle hash does not match its content",
          "hashes.perScene.scene1: scene hash does not match its content",
        ],
        "cueFocusMissing": [
          "plan.beats.b1.cueFocus: cueFocus names no object of the beat",
        ],
        "duplicateClaim": [
          "claims.c.factored: claim ids must be unique",
        ],
        "ghostSceneHash": [
          "hashes.perScene.ghost: hash for a scene that does not exist",
        ],
        "noNarration": [
          "scenes.scene4.cues: cue anchors to unknown sentence s4.1",
          "scenes.scene4.cues: cue anchors to unknown sentence s4.2",
          "plan.beats.b4: every beat needs narration",
        ],
        "noScene": [
          "plan.beats.b4: every beat needs at least one scene",
          "plan.beats.b4.cueFocus: cueFocus names no object of the beat",
        ],
        "notAnEquation": [
          "claims.c.roots: claim needs an equation, f1 is not one",
        ],
        "sceneHash": [
          "hashes.bundle: bundle hash does not match its content",
          "hashes.perScene.scene1: scene hash does not match its content",
        ],
        "unknownBeat": [
          "claims.c.factored: claim names unknown beat b99",
        ],
        "unknownExpression": [
          "claims.c.factored: claim names unknown expression nope",
        ],
        "workedNoAsk": [
          "plan.beats.b3: a worked beat needs a pause-and-ask",
        ],
        "workedNoAskField": [
          "plan.beats.b3: a worked beat needs a pause-and-ask",
        ],
        "workedNoClaims": [
          "plan.beats.b3: a worked beat must declare the claims its steps rely on (roots, sums, factorisations): add claims with this beatId",
        ],
      }
    `);
  });
});

describe("the rules of 1.0.0 and 2.0.0", () => {
  it("a 1.0.0 bundle may carry no field of 2.0.0", () => {
    expect({
      subjectId: one((b) => void (b.subjectId = "maths")),
      facts: one((b) => void (b.facts = [{ id: "f", text: "A fact", sourceIds: ["src.quad.roots.001"] }])),
      arcId: one((b) => void (b.plan.arcId = "problem_first")),
      prerequisites: one((b) => void (b.plan.prerequisites = [{ skillId: "S", status: "assumed" }])),
      level: one((b) => void (b.plan.level = "class-10")),
      beatKind: one((b) => void (b.plan.beats[0].beatKind = "hook")),
      slotId: one((b) => void (b.plan.beats[0].slotId = "hook")),
      learningGoal: one((b) => void (b.plan.beats[0].learningGoal = "Goal")),
      role: one((b) => void (b.script[0].role = "goal")),
      claimId: one((b) => void (b.script[0].claimId = "c.sum")),
      linkClaimIds: one((b) => void (b.script[0].linkClaimIds = ["c.sum", "c.roots"])),
      questionId: one((b) => void (b.script[0].questionId = "q")),
      approved: one((b) => void (b.script[0].status = "approved")),
      objectRole: one((b) => void (b.scenes[0].objects[0].role = "static")),
      textRole: one((b) => void (b.scenes[0].objects[0].textRole = "title")),
      claimSources: one((b) => void (b.claims[0].sourceIds = ["src.quad.roots.001"])),
      claimMode: one((b) => void (b.claims[0].claimMode = "computed")),
      claimDepends: one((b) => void (b.claims[1].dependsOn = [b.claims[0].id])),
      claimImportance: one((b) => void (b.claims[0].importance = "core")),
      claimUsesStep: one((b) => void (b.claims[0].usesStep = b.claims[1].id)),
      claimStepKind: one((b) => void (b.claims[0].stepKind = "rearrange")),
      claimIdentity: one((b) => void (b.claims[0].identity = "vieta_sum")),
      statementClaim: one((b) => void (b.claims = [...b.claims, { id: "c.st", beatId: "b2", kind: "statement" }])),
      reviewedStillFine: one((b) => void (b.script[0].status = "reviewed")),
    }).toMatchInlineSnapshot(`
      {
        "approved": [
          "script.s1.1: a 1.0.0 bundle may not carry fields of 2.0.0",
        ],
        "arcId": [
          "plan.arcId: a 1.0.0 bundle may not carry fields of 2.0.0",
        ],
        "beatKind": [
          "plan.beats.b1: a 1.0.0 bundle may not carry fields of 2.0.0",
        ],
        "claimDepends": [
          "claims.c.roots: a 1.0.0 bundle may not carry fields of 2.0.0",
        ],
        "claimId": [
          "script.s1.1: a 1.0.0 bundle may not carry fields of 2.0.0",
        ],
        "claimIdentity": [
          "claims.c.factored: a 1.0.0 bundle may not carry fields of 2.0.0",
        ],
        "claimImportance": [
          "claims.c.factored: a 1.0.0 bundle may not carry fields of 2.0.0",
        ],
        "claimMode": [
          "claims.c.factored: a 1.0.0 bundle may not carry fields of 2.0.0",
        ],
        "claimSources": [
          "claims.c.factored: a 1.0.0 bundle may not carry fields of 2.0.0",
        ],
        "claimStepKind": [
          "claims.c.factored: a 1.0.0 bundle may not carry fields of 2.0.0",
        ],
        "claimUsesStep": [
          "claims.c.factored: a 1.0.0 bundle may not carry fields of 2.0.0",
        ],
        "facts": [
          "facts: a 1.0.0 bundle may not carry fields of 2.0.0",
        ],
        "learningGoal": [
          "plan.beats.b1: a 1.0.0 bundle may not carry fields of 2.0.0",
        ],
        "level": [
          "plan.level: a 1.0.0 bundle may not carry fields of 2.0.0",
        ],
        "linkClaimIds": [
          "script.s1.1: a 1.0.0 bundle may not carry fields of 2.0.0",
        ],
        "objectRole": [
          "scenes.scene1.objects.title: a 1.0.0 bundle may not carry fields of 2.0.0",
        ],
        "prerequisites": [
          "plan.prerequisites: a 1.0.0 bundle may not carry fields of 2.0.0",
        ],
        "questionId": [
          "script.s1.1: a 1.0.0 bundle may not carry fields of 2.0.0",
        ],
        "reviewedStillFine": [],
        "role": [
          "script.s1.1: a 1.0.0 bundle may not carry fields of 2.0.0",
        ],
        "slotId": [
          "plan.beats.b1: a 1.0.0 bundle may not carry fields of 2.0.0",
        ],
        "statementClaim": [
          "claims.c.st: a 1.0.0 bundle may not carry fields of 2.0.0",
        ],
        "subjectId": [
          "subjectId: a 1.0.0 bundle may not carry fields of 2.0.0",
        ],
        "textRole": [
          "scenes.scene1.objects.title: a 1.0.0 bundle may not carry fields of 2.0.0",
        ],
      }
    `);
  });
  it("a 2.0.0 bundle sets the plan fields, writes no empty list and carries a complete beat", () => {
    expect({
      noSubject: two((b) => void delete b.subjectId),
      noArc: two((b) => void delete b.plan.arcId),
      noLevel: two((b) => void delete b.plan.level),
      emptyPrerequisites: two((b) => void (b.plan.prerequisites = [])),
      emptyFacts: two((b) => void (b.facts = [])),
      emptyTermColors: two((b) => void (b.termColors = {})),
      noBeatKind: two((b) => void delete b.plan.beats[0].beatKind),
      noSlot: two((b) => void delete b.plan.beats[0].slotId),
      noGoal: two((b) => void delete b.plan.beats[0].learningGoal),
      goalNineteenWords: two((b) => void (b.plan.beats[0].learningGoal = words(19))),
      goalEighteenWords: two((b) => void (b.plan.beats[0].learningGoal = words(18))),
      goalDigit: two((b) => void (b.plan.beats[0].learningGoal = "Why is it 2")),
      goalBrace: two((b) => void (b.plan.beats[0].learningGoal = "Why is {it} so")),
      goalPlus: two((b) => void (b.plan.beats[0].learningGoal = "Why a+b")),
      goalCaret: two((b) => void (b.plan.beats[0].learningGoal = "Why a^b")),
      goalDollar: two((b) => void (b.plan.beats[0].learningGoal = "Why $ so")),
      goalSlash: two((b) => void (b.plan.beats[0].learningGoal = "Why a/b")),
      goalLessThan: two((b) => void (b.plan.beats[0].learningGoal = "Why a<b")),
      goalSuperscript: two((b) => void (b.plan.beats[0].learningGoal = "Why a² so")),
    }).toMatchInlineSnapshot(`
      {
        "emptyFacts": [
          "facts: omit an optional list when it is empty, never write it empty",
        ],
        "emptyPrerequisites": [
          "plan.prerequisites: omit an optional list when it is empty, never write it empty",
        ],
        "emptyTermColors": [
          "termColors: omit an optional list when it is empty, never write it empty",
        ],
        "goalBrace": [
          "plan.beats.b1.learningGoal: a learning goal has no notation or placeholders",
        ],
        "goalCaret": [
          "plan.beats.b1.learningGoal: a learning goal has no notation or placeholders",
        ],
        "goalDigit": [
          "plan.beats.b1.learningGoal: a learning goal has no digits",
        ],
        "goalDollar": [
          "plan.beats.b1.learningGoal: a learning goal has no notation or placeholders",
        ],
        "goalEighteenWords": [],
        "goalLessThan": [
          "plan.beats.b1.learningGoal: a learning goal has no notation or placeholders",
        ],
        "goalNineteenWords": [
          "plan.beats.b1.learningGoal: a learning goal has at most 18 words, this has 19",
        ],
        "goalPlus": [
          "plan.beats.b1.learningGoal: a learning goal has no notation or placeholders",
        ],
        "goalSlash": [
          "plan.beats.b1.learningGoal: a learning goal has no notation or placeholders",
        ],
        "goalSuperscript": [
          "plan.beats.b1.learningGoal: a learning goal has no notation or placeholders",
        ],
        "noArc": [
          "plan.arcId: a 2.0.0 bundle must set arcId",
        ],
        "noBeatKind": [
          "plan.beats.b1: a 2.0.0 bundle must set beatKind, slotId and learningGoal",
        ],
        "noGoal": [
          "plan.beats.b1: a 2.0.0 bundle must set beatKind, slotId and learningGoal",
        ],
        "noLevel": [
          "plan.level: a 2.0.0 bundle must set level",
        ],
        "noSlot": [
          "plan.beats.b1: a 2.0.0 bundle must set beatKind, slotId and learningGoal",
        ],
        "noSubject": [
          "subjectId: a 2.0.0 bundle must set subjectId",
        ],
      }
    `);
  });
  it("sentences of 2.0.0: role and the ids each role carries", () => {
    expect({
      reviewed: two((b) => void (b.script[0].status = "reviewed")),
      noRole: two((b) => void delete b.script[0].role),
      claimNoId: two((b) => void delete b.script[3].claimId),
      claimUnknown: two((b) => void (b.script[3].claimId = "c.ghost")),
      goalWithClaimId: two((b) => void (b.script[0].claimId = "c.sum")),
      linkNoIds: two((b) => void ((b.script[0].role = "link"), delete b.script[0].claimId)),
      linkUnknown: two((b) => void ((b.script[0].role = "link"), (b.script[0].linkClaimIds = ["c.sum", "c.ghost"]))),
      linkSame: two((b) => void ((b.script[0].role = "link"), (b.script[0].linkClaimIds = ["c.sum", "c.sum"]))),
      linkFine: two((b) => void ((b.script[0].role = "link"), (b.script[0].linkClaimIds = ["c.sum", "c.roots"]))),
      goalWithLinkIds: two((b) => void (b.script[0].linkClaimIds = ["c.sum", "c.roots"])),
      questionNoId: two((b) => void (b.script[0].role = "question")),
      questionFine: two((b) => void ((b.script[0].role = "question"), (b.script[0].questionId = "q.one"))),
      goalWithQuestionId: two((b) => void (b.script[0].questionId = "q.one")),
    }).toMatchInlineSnapshot(`
      {
        "claimNoId": [
          "script.s2.2.claimId: a claim sentence names a claim of this bundle",
        ],
        "claimUnknown": [
          "script.s2.2.claimId: a claim sentence names a claim of this bundle",
        ],
        "goalWithClaimId": [
          "script.s1.1.claimId: a transition sentence carries no claimId",
        ],
        "goalWithLinkIds": [
          "script.s1.1.linkClaimIds: a transition sentence carries no linkClaimIds",
        ],
        "goalWithQuestionId": [
          "script.s1.1.questionId: a transition sentence carries no questionId",
        ],
        "linkFine": [],
        "linkNoIds": [
          "script.s1.1.linkClaimIds: a link sentence names two claims of this bundle",
        ],
        "linkSame": [
          "script.s1.1.linkClaimIds: a link sentence joins two different claims",
        ],
        "linkUnknown": [
          "script.s1.1.linkClaimIds: a link sentence names two claims of this bundle",
        ],
        "noRole": [
          "script.s1.1: a 2.0.0 sentence must set role",
        ],
        "questionFine": [],
        "questionNoId": [
          "script.s1.1.questionId: a question sentence names a practice question",
        ],
        "reviewed": [
          "script.s1.1.status: the word "reviewed" is not used from 2.0.0; use "approved" (ADR 0031)",
        ],
      }
    `);
  });
  it("claims of 2.0.0", () => {
    expect({
      noMode: two((b) => void delete b.claims[0].claimMode),
      noImportance: two((b) => void delete b.claims[0].importance),
      noSources: two((b) => void delete b.claims[0].sourceIds),
      statementNotGrounded: two((b) => void (b.claims = [...b.claims, { id: "c.st", beatId: "b2", kind: "statement", claimMode: "computed", importance: "core", sourceIds: ["src.quad.vieta.002"] }])),
      groundedNotStatement: two((b) => void (b.claims[0].claimMode = "grounded")),
      unknownSource: two((b) => void (b.claims[0].sourceIds = ["src.nope"])),
      unknownDependency: two((b) => void (b.claims[0].dependsOn = ["c.ghost"])),
      emptyDependsOn: two((b) => void (b.claims[0].dependsOn = [])),
      kindNoUses: two((b) => void (b.claims[0].stepKind = "rearrange")),
      usesNoKind: two((b) => void ((b.claims[0].usesStep = "c.roots"), (b.claims[0].dependsOn = ["c.roots"]))),
      usesUnknown: two((b) => void ((b.claims[0].usesStep = "c.ghost"), (b.claims[0].stepKind = "rearrange"))),
      usesItself: two((b) => void ((b.claims[0].usesStep = b.claims[0].id), (b.claims[0].stepKind = "rearrange"))),
      usesNotInDepends: two((b) => void ((b.claims[0].usesStep = "c.roots"), (b.claims[0].stepKind = "rearrange"))),
      usesFine: two((b) => void ((b.claims[0].usesStep = "c.roots"), (b.claims[0].stepKind = "rearrange"), (b.claims[0].dependsOn = ["c.roots"]))),
      identityMissing: two((b) => void ((b.claims[0].usesStep = "c.roots"), (b.claims[0].stepKind = "apply_identity"), (b.claims[0].dependsOn = ["c.roots"]))),
      identityElsewhere: two((b) => void ((b.claims[0].usesStep = "c.roots"), (b.claims[0].stepKind = "rearrange"), (b.claims[0].dependsOn = ["c.roots"]), (b.claims[0].identity = "vieta_sum"))),
    }).toMatchInlineSnapshot(`
      {
        "emptyDependsOn": [
          "claims.c.factored.dependsOn: omit dependsOn when the claim depends on nothing, never write it empty",
        ],
        "groundedNotStatement": [
          "claims.c.factored: a grounded claim is a statement claim: the verifier proves the other kinds, so they are computed",
        ],
        "identityElsewhere": [
          "claims.c.factored: identity belongs to apply_identity steps only",
        ],
        "identityMissing": [
          "claims.c.factored: apply_identity names its identity from the closed list",
        ],
        "kindNoUses": [
          "claims.c.factored: stepKind needs usesStep",
        ],
        "noImportance": [
          "claims.c.factored: a 2.0.0 bundle must set claimMode and importance",
        ],
        "noMode": [
          "claims.c.factored: a 2.0.0 bundle must set claimMode and importance",
        ],
        "noSources": [
          "claims.c.factored: a 2.0.0 bundle must set sourceIds",
        ],
        "statementNotGrounded": [
          "claims.c.st: a statement claim is prose: its claimMode is grounded",
        ],
        "unknownDependency": [
          "claims.c.factored.dependsOn: depends on unknown claim c.ghost",
        ],
        "unknownSource": [
          "claims.c.factored.sourceIds: unknown source src.nope",
        ],
        "usesFine": [],
        "usesItself": [
          "claims.c.factored.usesStep: a claim cannot use itself",
        ],
        "usesNoKind": [
          "claims.c.factored: usesStep needs a stepKind",
        ],
        "usesNotInDepends": [
          "claims.c.factored.dependsOn: a claim that uses c.roots depends on it",
        ],
        "usesUnknown": [
          "claims.c.factored.usesStep: uses unknown claim c.ghost",
        ],
      }
    `);
  });
  it("static objects of 2.0.0", () => {
    const stat = (o: Any, text = "A title") => Object.assign(o, { role: "static", component: "text", textRole: "title", props: { text }, ...{} });
    expect({
      threeStatics: two((b) => void b.scenes[0].objects.push(...["x1", "x2", "x3"].map((id) => stat({ id })))),
      twoStaticsFine: two((b) => void b.scenes[0].objects.push(...["x1", "x2"].map((id) => stat({ id })))),
      textRoleOnLive: two((b) => void (b.scenes[0].objects[0].textRole = "title")),
      staticNotText: two((b) => void Object.assign(b.scenes[0].objects[1], { role: "static", textRole: "title" })),
      staticNoTextRole: two((b) => void b.scenes[0].objects.push((() => { const o = stat({ id: "x1" }); delete o.textRole; return o; })())),
      staticDigit: two((b) => void b.scenes[0].objects.push(stat({ id: "x1" }, "Part 2"))),
      staticBrace: two((b) => void b.scenes[0].objects.push(stat({ id: "x1" }, "A {thing}"))),
      staticCloseBrace: two((b) => void b.scenes[0].objects.push(stat({ id: "x1" }, "A thing}"))),
      staticExpr: two((b) => void b.scenes[0].objects.push(Object.assign(stat({ id: "x1" }), { exprRef: "eq1" }))),
      staticNoText: two((b) => void b.scenes[0].objects.push(Object.assign(stat({ id: "x1" }), { props: {} }))),
    }).toMatchInlineSnapshot(`
      {
        "staticBrace": [
          "scenes.scene1.objects.x1: a static object has no digits, placeholders or expression",
        ],
        "staticCloseBrace": [
          "scenes.scene1.objects.x1: a static object has no digits, placeholders or expression",
        ],
        "staticDigit": [
          "scenes.scene1.objects.x1: a static object has no digits, placeholders or expression",
        ],
        "staticExpr": [
          "scenes.scene1.objects.x1: a static object has no digits, placeholders or expression",
        ],
        "staticNoText": [],
        "staticNoTextRole": [
          "scenes.scene1.objects.x1: a static object sets textRole: title or caption",
        ],
        "staticNotText": [
          "scenes.scene1.objects.eq1: a static object is a text object (an axis is part of its functionGraph)",
          "scenes.scene1.objects.eq1: a static object has no digits, placeholders or expression",
        ],
        "textRoleOnLive": [
          "scenes.scene1.objects.title: textRole belongs to static objects only",
        ],
        "threeStatics": [
          "scenes.scene1: at most 2 static objects per scene",
        ],
        "twoStaticsFine": [],
      }
    `);
  });
});
