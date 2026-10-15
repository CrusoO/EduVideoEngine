import { sha256 } from "@noble/hashes/sha256";
import { bytesToHex, utf8ToBytes } from "@noble/hashes/utils";
import { SPEC_VERSION, SPEC_VERSION_2_1, type LessonBundle, type SceneSpec } from "./bundle";
import { termIds } from "./expr";

/**
 * The canonical serialization every hash is computed over (ADR 0004): UTF-8, strings and keys NFC-normalised, keys
 * sorted, no whitespace, no undefined, -0 written as 0, NaN and Infinity refused. Never the output of whatever a
 * parser happens to emit, so a second writer in another language produces the same bytes for the same bundle.
 * Exact quantities are rationals (num with n and d), never floats; props may hold plain numbers.
 */
export function canonicalJson(value: unknown): string {
  if (typeof value === "string") return JSON.stringify(value.normalize("NFC"));
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("canonicalJson: NaN and Infinity cannot be hashed");
    return JSON.stringify(Object.is(value, -0) ? 0 : value);
  }
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const keys = Object.keys(value as object)
    .map((k) => k.normalize("NFC"))
    .sort();
  const source = Object.fromEntries(Object.entries(value as object).map(([k, v]) => [k.normalize("NFC"), v]));
  return `{${keys
    .filter((k) => source[k] !== undefined)
    .map((k) => `${JSON.stringify(k)}:${canonicalJson(source[k])}`)
    .join(",")}}`;
}

export const sha256Hex = (text: string): string => bytesToHex(sha256(utf8ToBytes(text)));
export const hashOf = (value: unknown): string => sha256Hex(canonicalJson(value));

/**
 * A scene's hash covers the scene AND everything it depends on: the sentences of its beat and the expression trees
 * it references. Editing one scene (or a sentence it uses) changes only that scene's hash, so caches, reviews and
 * analytics reopen exactly the affected scene.
 */
export function sceneHash(
  bundle: Pick<LessonBundle, "script" | "expressions"> & { termColors?: LessonBundle["termColors"]; specVersion?: LessonBundle["specVersion"]; plan?: Pick<LessonBundle["plan"], "beats"> },
  scene: SceneSpec,
): string {
  const sentences = bundle.script.filter((s) => s.beatId === scene.beatId);
  const refs = new Set<string>([...sentences.flatMap((s) => s.exprRefs), ...scene.objects.flatMap((o) => (o.exprRef ? [o.exprRef] : []))]);
  const expressions = Object.fromEntries([...refs].sort().map((r) => [r, bundle.expressions[r] ?? null]));
  // The colours of the terms this scene shows are part of what it looks like; the key is absent when there are none, so uncoloured scenes hash as before.
  const used = new Set<string>();
  for (const e of Object.values(expressions)) if (e) termIds(e, used);
  const colors = Object.fromEntries([...used].sort().flatMap((t) => (bundle.termColors?.[t] ? [[t, bundle.termColors[t]]] : [])));
  const parts: Record<string, unknown> = { scene, sentences, expressions };
  if (Object.keys(colors).length > 0) parts.termColors = colors;
  // Spec 2.0.0 (ADR 0030): the beat's own fields (beatKind, slotId, learningGoal) belong to its scene. Legacy bundles hash exactly as before.
  if (bundle.specVersion === SPEC_VERSION || bundle.specVersion === SPEC_VERSION_2_1) {
    const { beatKind, slotId, learningGoal } = bundle.plan?.beats.find((b) => b.id === scene.beatId) ?? {};
    parts.beat = { beatKind, slotId, learningGoal }; // undefined members are dropped by canonicalJson
  }
  return hashOf(parts);
}

/** Recompute every hash of a bundle (the bundle hash covers all content except the hashes themselves). */
export function computeHashes(bundle: Omit<LessonBundle, "hashes">): LessonBundle["hashes"] {
  const perScene = Object.fromEntries(bundle.scenes.map((s) => [s.id, sceneHash(bundle, s)]));
  return { bundle: hashOf({ ...bundle, perScene }), perScene };
}

/** Return the bundle with its hashes filled in. */
export function seal(bundle: Omit<LessonBundle, "hashes">): LessonBundle {
  return { ...bundle, hashes: computeHashes(bundle) };
}

/** SHA-256 of raw bytes (voice files), hex. */
export const sha256Bytes = (bytes: Uint8Array): string => bytesToHex(sha256(bytes));
