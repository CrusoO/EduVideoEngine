import { LessonBundle } from "./bundle";
import type { LessonBundle as Bundle } from "./bundle";
import { computeHashes } from "./hash";
import { LOCALES } from "./locales";

export type Issue = { path: string; message: string };
export type Validation = { ok: true; bundle: Bundle; issues: [] } | { ok: false; bundle?: undefined; issues: Issue[] };

const PLACEHOLDER = /\{expr:([A-Za-z0-9][A-Za-z0-9_.:-]*)\}/g;
/**
 * Maths must not be written as literal NOTATION in narration: an equals sign, a caret, a slash fraction, superscripts,
 * root and sum signs, LaTeX fragments, or digit-operator-digit. Plain numbers are fine ("the roots 2 and 3"): the
 * verbaliser speaks them as words at synthesis time.
 */
const LITERAL_MATH = /[=^√∑∫²³⁴⁵⁶⁷⁸⁹⁰¹½¼¾]|\\[A-Za-z]+|\$|\d\s*[+\-−×÷*/]\s*\d/;
export const BEAT_COUNT = { min: 4, max: 7 } as const;
/** Components whose appearance must come from an expression tree. */
const NEEDS_EXPR = new Set(["equation", "functionGraph"]);

export const wordsOf = (text: string): string[] => text.replace(PLACEHOLDER, "X").split(/\s+/).filter(Boolean);

/**
 * Schema first, then the cross-references no schema can express: ids resolve, cues point at real objects and real
 * sentences of the scene's own beat, sources exist, maths is never literal text, hashes match the content.
 */
export function validateBundle(input: unknown): Validation {
  const parsed = LessonBundle.safeParse(input);
  if (!parsed.success) {
    return { ok: false, issues: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })) };
  }
  const b = parsed.data;
  const issues: Issue[] = [];
  const bad = (path: string, message: string) => issues.push({ path, message });

  if (!(b.locale in LOCALES)) bad("locale", `locale ${b.locale} is not in the language registry`);
  const beats = new Map(b.plan.beats.map((x) => [x.id, x]));
  if (beats.size !== b.plan.beats.length) bad("plan.beats", "beat ids must be unique");
  if (b.plan.beats.length < BEAT_COUNT.min || b.plan.beats.length > BEAT_COUNT.max) {
    bad("plan.beats", `a lesson has ${BEAT_COUNT.min} to ${BEAT_COUNT.max} beats`);
  }
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
      if (!objects.has(cue.targetObject)) bad(`${at}.cues`, `cue targets unknown object ${cue.targetObject}`);
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

  const claimIds = new Set<string>();
  for (const claim of b.claims ?? []) {
    const at = `claims.${claim.id}`;
    if (claimIds.has(claim.id)) bad(at, "claim ids must be unique");
    claimIds.add(claim.id);
    const refs = claim.kind === "equivalent" ? [claim.a, claim.b] : claim.kind === "roots" ? [claim.equation] : [claim.equation, claim.equals];
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
    // Planner rule: a pause-and-ask follows a worked beat.
    if (beat.kind === "worked" && !scenes.some((s) => (s.interactions ?? []).length > 0)) bad(`plan.beats.${beat.id}`, "a worked beat needs a pause-and-ask");
  }

  if (issues.length === 0) {
    const want = computeHashes({ ...b, hashes: undefined } as never);
    if (want.bundle !== b.hashes.bundle) bad("hashes.bundle", "bundle hash does not match its content");
    for (const scene of b.scenes) if (want.perScene[scene.id] !== b.hashes.perScene[scene.id]) bad(`hashes.perScene.${scene.id}`, "scene hash does not match its content");
    for (const key of Object.keys(b.hashes.perScene)) if (!sceneIds.has(key)) bad(`hashes.perScene.${key}`, "hash for a scene that does not exist");
  }

  return issues.length ? { ok: false, issues } : { ok: true, bundle: b, issues: [] };
}
