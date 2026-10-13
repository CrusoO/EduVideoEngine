import { LessonBundle, LEGACY_SPEC_VERSION, SPEC_VERSION } from "./bundle";
import type { LessonBundle as Bundle } from "./bundle";
import { termIds } from "./expr";
import { computeHashes } from "./hash";
import { LIMITS } from "./limits";
import { LOCALES } from "./locales";

export type Issue = { path: string; message: string };
/** `warnings` are things worth a look that do not fail the lesson (a lesson target over the warning length). */
export type Validation = { ok: true; bundle: Bundle; issues: []; warnings: Issue[] } | { ok: false; bundle?: undefined; issues: Issue[]; warnings: Issue[] };

const PLACEHOLDER = /\{expr:([A-Za-z0-9][A-Za-z0-9_.:-]*)\}/g;
/**
 * Maths must not be written as literal NOTATION in narration: an equals sign, a caret, a slash fraction, superscripts,
 * root and sum signs, LaTeX fragments, or digit-operator-digit. Plain numbers are fine ("the roots 2 and 3"): the
 * verbaliser speaks them as words at synthesis time.
 */
const LITERAL_MATH = /[=^√∑∫²³⁴⁵⁶⁷⁸⁹⁰¹½¼¾]|\\[A-Za-z]+|\$|\d\s*[+\-−×÷*/]\s*\d/;
/** 4 to 10 beats (ADR 0018): the ceiling is raised from 7 so a beat that does not fit a phone stage can be split in two. */
export const BEAT_COUNT = LIMITS.beats;
/** Components whose appearance must come from an expression tree. */
const NEEDS_EXPR = new Set(["equation", "functionGraph"]);

/** True when a text writes maths as notation (an equals sign, a caret, LaTeX, digit-operator-digit): such text must use {expr:id} placeholders instead. */
export const containsLiteralMath = (text: string): boolean => LITERAL_MATH.test(text.replace(PLACEHOLDER, ""));

export const wordsOf = (text: string): string[] => text.replace(PLACEHOLDER, "X").split(/\s+/).filter(Boolean);

/** The longest speakable learning goal, in words (ADR 0029). */
export const GOAL_MAX_WORDS = 18;

/** Words that may stand alone as a goal check: no digits, no notation, no placeholders. Exported for the gates (WP2b). */
export const goalProblems = (text: string): string[] => {
  const out: string[] = [];
  const words = text.split(/\s+/).filter(Boolean).length;
  if (words > GOAL_MAX_WORDS) out.push(`a learning goal has at most ${GOAL_MAX_WORDS} words, this has ${words}`);
  if (/\d/.test(text)) out.push("a learning goal has no digits");
  if (/[{}=^+*/<>\$]/.test(text) || containsLiteralMath(text)) out.push("a learning goal has no notation or placeholders");
  return out;
};

type Bad = (path: string, message: string) => void;

/**
 * The rules that depend on the spec version (ADR 0030). A 1.0.0 bundle may not carry any 2.0.0 field, so the pinned legacy fixture keeps validating
 * under its old rules and a half-migrated bundle cannot slip through. A 2.0.0 bundle must carry every new field explicitly: no defaults at parse time.
 * Optional fields are omitted when absent, never empty.
 */
function checkSpecVersion(b: Bundle, bad: Bad): void {
  if (b.specVersion === LEGACY_SPEC_VERSION) {
    const v2: Array<[string, boolean]> = [
      ["subjectId", b.subjectId !== undefined],
      ["facts", b.facts !== undefined],
      ["plan.arcId", b.plan.arcId !== undefined],
      ["plan.prerequisites", b.plan.prerequisites !== undefined],
      ["plan.level", b.plan.level !== undefined],
    ];
    for (const beat of b.plan.beats) v2.push([`plan.beats.${beat.id}`, beat.beatKind !== undefined || beat.slotId !== undefined || beat.learningGoal !== undefined]);
    for (const s of b.script) v2.push([`script.${s.id}`, s.role !== undefined || s.claimId !== undefined || s.linkClaimIds !== undefined || s.questionId !== undefined || s.status === "approved"]);
    for (const sc of b.scenes) for (const o of sc.objects) v2.push([`scenes.${sc.id}.objects.${o.id}`, o.role !== undefined || o.textRole !== undefined]);
    for (const c of b.claims ?? []) v2.push([`claims.${c.id}`, c.claimMode !== undefined || c.dependsOn !== undefined || c.importance !== undefined || c.usesStep !== undefined || c.stepKind !== undefined]);
    for (const [path, present] of v2) if (present) bad(path, `a ${LEGACY_SPEC_VERSION} bundle may not carry fields of ${SPEC_VERSION}`);
    return;
  }

  const need = (path: string, present: boolean, what: string) => {
    if (!present) bad(path, `a ${SPEC_VERSION} bundle must set ${what}`);
  };
  need("subjectId", b.subjectId !== undefined, "subjectId");
  need("plan.arcId", b.plan.arcId !== undefined, "arcId");
  need("plan.level", b.plan.level !== undefined, "level");
  for (const [name, list] of [["plan.prerequisites", b.plan.prerequisites], ["facts", b.facts], ["termColors", b.termColors && Object.keys(b.termColors)]] as const) {
    if (list !== undefined && list.length === 0) bad(name, "omit an optional list when it is empty, never write it empty");
  }
  const claimIds = new Set((b.claims ?? []).map((c) => c.id));
  for (const beat of b.plan.beats) {
    const at = `plan.beats.${beat.id}`;
    need(at, beat.beatKind !== undefined && beat.slotId !== undefined && beat.learningGoal !== undefined, "beatKind, slotId and learningGoal");
    if (beat.learningGoal !== undefined) for (const m of goalProblems(beat.learningGoal)) bad(`${at}.learningGoal`, m);
  }
  const questionOk = (id: string | undefined) => id !== undefined;
  for (const s of b.script) {
    const at = `script.${s.id}`;
    if (s.status === "reviewed") bad(`${at}.status`, 'the word "reviewed" is not used from 2.0.0; use "approved" (ADR 0031)');
    if (s.role === undefined) {
      bad(at, `a ${SPEC_VERSION} sentence must set role`);
      continue;
    }
    if (s.role === "claim") {
      if (!s.claimId || !claimIds.has(s.claimId)) bad(`${at}.claimId`, "a claim sentence names a claim of this bundle");
    } else if (s.claimId !== undefined) bad(`${at}.claimId`, `a ${s.role} sentence carries no claimId`);
    if (s.role === "link") {
      if (!s.linkClaimIds || s.linkClaimIds.some((c) => !claimIds.has(c))) bad(`${at}.linkClaimIds`, "a link sentence names two claims of this bundle");
      else if (s.linkClaimIds[0] === s.linkClaimIds[1]) bad(`${at}.linkClaimIds`, "a link sentence joins two different claims");
    } else if (s.linkClaimIds !== undefined) bad(`${at}.linkClaimIds`, `a ${s.role} sentence carries no linkClaimIds`);
    if (s.role === "question") {
      if (!questionOk(s.questionId)) bad(`${at}.questionId`, "a question sentence names a practice question");
    } else if (s.questionId !== undefined) bad(`${at}.questionId`, `a ${s.role} sentence carries no questionId`);
  }
  for (const c of b.claims ?? []) {
    const at = `claims.${c.id}`;
    need(at, c.claimMode !== undefined && c.importance !== undefined, "claimMode and importance");
    for (const d of c.dependsOn ?? []) if (!claimIds.has(d)) bad(`${at}.dependsOn`, `depends on unknown claim ${d}`);
    if (c.dependsOn?.length === 0) bad(`${at}.dependsOn`, "omit dependsOn when the claim depends on nothing, never write it empty");
    if (c.stepKind !== undefined && c.usesStep === undefined) bad(at, "stepKind needs usesStep");
    if (c.usesStep !== undefined && c.stepKind === undefined) bad(at, "usesStep needs a stepKind");
  }
  for (const sc of b.scenes) {
    const statics = sc.objects.filter((o) => o.role === "static");
    if (statics.length > 2) bad(`scenes.${sc.id}`, "at most 2 static objects per scene");
    for (const o of sc.objects) {
      const at = `scenes.${sc.id}.objects.${o.id}`;
      if (o.role !== "static") {
        if (o.textRole !== undefined) bad(at, "textRole belongs to static objects only");
        continue;
      }
      if (o.component !== "text") bad(at, "a static object is a text object (an axis is part of its functionGraph)");
      if (o.textRole === undefined) bad(at, "a static object sets textRole: title or caption");
      const text = typeof (o.props as { text?: unknown }).text === "string" ? ((o.props as { text: string }).text) : "";
      if (/\d/.test(text) || /[{}]/.test(text) || o.exprRef !== undefined) bad(at, "a static object has no digits, placeholders or expression");
    }
  }
}

/**
 * Schema first, then the cross-references no schema can express: ids resolve, cues point at real objects and real
 * sentences of the scene's own beat, sources exist, maths is never literal text, hashes match the content.
 */
export function validateBundle(input: unknown): Validation {
  const parsed = LessonBundle.safeParse(input);
  if (!parsed.success) {
    return { ok: false, issues: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })), warnings: [] };
  }
  const b = parsed.data;
  const issues: Issue[] = [];
  const bad = (path: string, message: string) => issues.push({ path, message });

  checkSpecVersion(b, bad);
  if (!(b.locale in LOCALES)) bad("locale", `locale ${b.locale} is not in the language registry`);
  const beats = new Map(b.plan.beats.map((x) => [x.id, x]));
  if (beats.size !== b.plan.beats.length) bad("plan.beats", "beat ids must be unique");
  if (b.plan.beats.length < BEAT_COUNT.min || b.plan.beats.length > BEAT_COUNT.max) {
    bad("plan.beats", `a lesson has ${BEAT_COUNT.min} to ${BEAT_COUNT.max} beats`);
  }
  // Duration (ADR 0018): the planner's target length for the lesson. Over the target is a warning, over the hard limit fails. The resolved length is checked again once the voice exists.
  const warnings: Issue[] = [];
  if (b.plan.targetLengthS > LIMITS.durationS.lessonHardMax) bad("plan.targetLengthS", `a lesson may last at most ${LIMITS.durationS.lessonHardMax} s, this one is planned for ${b.plan.targetLengthS} s`);
  else if (b.plan.targetLengthS > LIMITS.durationS.lessonTargetWarn) warnings.push({ path: "plan.targetLengthS", message: `planned for ${b.plan.targetLengthS} s: over the ${LIMITS.durationS.lessonTargetWarn} s target` });
  const bundleSources = new Set(b.sourceIds);
  for (const beat of b.plan.beats) {
    for (const s of beat.sourceIds) if (!bundleSources.has(s)) bad(`plan.beats.${beat.id}.sourceIds`, `unknown source ${s}`);
  }

  const sentences = new Map(b.script.map((s) => [s.id, s]));
  if (sentences.size !== b.script.length) bad("script", "sentence ids must be unique");
  for (const s of b.script) {
    const at = `script.${s.id}`;
    if (!beats.has(s.beatId)) bad(`${at}.beatId`, `unknown beat ${s.beatId}`);
    if (LITERAL_MATH.test(s.text.replace(PLACEHOLDER, ""))) bad(`${at}.text`, "maths must be an {expr:id} placeholder, not literal text");
    const used = [...s.text.matchAll(PLACEHOLDER)].map((m) => m[1]!);
    for (const u of used) if (!s.exprRefs.includes(u)) bad(`${at}.text`, `placeholder ${u} is not listed in exprRefs`);
    for (const r of s.exprRefs) {
      if (!(r in b.expressions)) bad(`${at}.exprRefs`, `unknown expression ${r}`);
      if (!used.includes(r)) bad(`${at}.exprRefs`, `expression ${r} is listed but not used in the text`);
    }
    for (const t of s.termSpans) if (t.end > s.text.length || t.start >= t.end) bad(`${at}.termSpans`, "span is outside the text");
  }

  const sceneIds = new Set<string>();
  for (const scene of b.scenes) {
    const at = `scenes.${scene.id}`;
    if (sceneIds.has(scene.id)) bad(at, "scene ids must be unique");
    sceneIds.add(scene.id);
    if (!beats.has(scene.beatId)) bad(`${at}.beatId`, `unknown beat ${scene.beatId}`);
    for (const s of scene.sourceIds) if (!bundleSources.has(s)) bad(`${at}.sourceIds`, `unknown source ${s}`);

    const objects = new Map(scene.objects.map((o) => [o.id, o]));
    if (objects.size !== scene.objects.length) bad(`${at}.objects`, "object ids must be unique within a scene");
    for (const o of scene.objects) {
      if (o.exprRef && !(o.exprRef in b.expressions)) bad(`${at}.objects.${o.id}.exprRef`, `unknown expression ${o.exprRef}`);
      if (NEEDS_EXPR.has(o.component) && !o.exprRef) bad(`${at}.objects.${o.id}`, `${o.component} must take its content from an exprRef`);
    }
    for (const rule of scene.layout) {
      const named = rule.rule === "column" || rule.rule === "row" ? rule.items : rule.rule === "center" ? [rule.item] : [rule.item, rule.of];
      for (const n of named) if (!objects.has(n)) bad(`${at}.layout`, `layout names unknown object ${n}`);
    }

    const beatSentences = new Set(b.script.filter((s) => s.beatId === scene.beatId).map((s) => s.id));
    for (const cue of scene.cues) {
      const [targetId, targetPart] = cue.targetObject.split("#") as [string, string | undefined];
      if (!objects.has(targetId)) bad(`${at}.cues`, `cue targets unknown object ${targetId}`);
      else if (targetPart !== undefined && objects.get(targetId)!.component === "highlight") bad(`${at}.cues`, `${targetId} has no parts to target`);
      const sentence = sentences.get(cue.anchor.sentenceId);
      if (!sentence) bad(`${at}.cues`, `cue anchors to unknown sentence ${cue.anchor.sentenceId}`);
      else if (!beatSentences.has(sentence.id)) bad(`${at}.cues`, `cue anchors to ${sentence.id}, which is not in this scene's beat`);
      else if (typeof cue.anchor.at === "object" && cue.anchor.at.wordIndex >= wordsOf(sentence.text).length) {
        bad(`${at}.cues`, `wordIndex ${cue.anchor.at.wordIndex} is past the end of ${sentence.id}`);
      }
    }
    for (const ask of scene.interactions ?? []) {
      if (!beatSentences.has(ask.afterSentenceId)) bad(`${at}.interactions.${ask.id}`, "pause-and-ask must follow a sentence of this beat");
      if (ask.goalExprRef && !(ask.goalExprRef in b.expressions)) bad(`${at}.interactions.${ask.id}`, `unknown expression ${ask.goalExprRef}`);
    }
  }

  // Colours (ADR 0019): a coloured term must exist; inside one scene two different terms may not share a colour. The same term has one
  // colour everywhere because the colour belongs to the term name, not to the scene.
  const allTerms = new Set<string>();
  for (const e of Object.values(b.expressions)) termIds(e, allTerms);
  for (const t of Object.keys(b.termColors ?? {})) if (!allTerms.has(t)) bad(`termColors.${t}`, `no expression has a term named ${t}`);
  for (const scene of b.scenes) {
    const refs = scene.objects.flatMap((o) => [...(o.exprRef ? [o.exprRef] : []), ...(Array.isArray((o.props as { steps?: unknown }).steps) ? ((o.props as { steps: string[] }).steps) : [])]);
    const byColor = new Map<string, Set<string>>();
    for (const r of refs) {
      const e = b.expressions[r];
      if (!e) continue;
      for (const t of termIds(e)) {
        const c = b.termColors?.[t];
        if (c) byColor.set(c, (byColor.get(c) ?? new Set()).add(t));
      }
    }
    for (const [c, terms] of byColor) if (terms.size > 1) bad(`scenes.${scene.id}`, `terms ${[...terms].sort().join(" and ")} share the colour ${c} in one scene`);
  }

  const claimIds = new Set<string>();
  for (const claim of b.claims ?? []) {
    const at = `claims.${claim.id}`;
    if (claimIds.has(claim.id)) bad(at, "claim ids must be unique");
    claimIds.add(claim.id);
    const refs = claim.kind === "equivalent" ? [claim.a, claim.b] : claim.kind === "roots" ? [claim.equation] : [claim.equation, claim.equals];
    if (!b.plan.beats.some((beat) => beat.id === claim.beatId)) bad(at, `claim names unknown beat ${claim.beatId}`);
    for (const r of refs) {
      const e = b.expressions[r];
      if (!e) bad(at, `claim names unknown expression ${r}`);
      else if (e.op !== "eq") bad(at, `claim needs an equation, ${r} is not one`);
    }
  }

  for (const beat of b.plan.beats) {
    const scenes = b.scenes.filter((s) => s.beatId === beat.id);
    if (scenes.length === 0) bad(`plan.beats.${beat.id}`, "every beat needs at least one scene");
    if (b.script.every((s) => s.beatId !== beat.id)) bad(`plan.beats.${beat.id}`, "every beat needs narration");
    if (beat.cueFocus && !scenes.some((s) => s.objects.some((o) => o.id === beat.cueFocus))) bad(`plan.beats.${beat.id}.cueFocus`, "cueFocus names no object of the beat");
    // A worked beat shows steps that a student will copy: it must declare the claims those steps rely on, so the verifier can prove them.
    if (beat.kind === "worked" && !(b.claims ?? []).some((c) => c.beatId === beat.id)) {
      bad(`plan.beats.${beat.id}`, "a worked beat must declare the claims its steps rely on (roots, sums, factorisations): add claims with this beatId");
    }
    // Planner rule: a pause-and-ask follows a worked beat.
    if (beat.kind === "worked" && !scenes.some((s) => (s.interactions ?? []).length > 0)) bad(`plan.beats.${beat.id}`, "a worked beat needs a pause-and-ask");
  }

  if (issues.length === 0) {
    const want = computeHashes({ ...b, hashes: undefined } as never);
    if (want.bundle !== b.hashes.bundle) bad("hashes.bundle", "bundle hash does not match its content");
    for (const scene of b.scenes) if (want.perScene[scene.id] !== b.hashes.perScene[scene.id]) bad(`hashes.perScene.${scene.id}`, "scene hash does not match its content");
    for (const key of Object.keys(b.hashes.perScene)) if (!sceneIds.has(key)) bad(`hashes.perScene.${key}`, "hash for a scene that does not exist");
  }

  return issues.length ? { ok: false, issues, warnings } : { ok: true, bundle: b, issues: [], warnings };
}
