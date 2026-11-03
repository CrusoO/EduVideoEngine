import type { Claim, Cue, Expr, NarrationSentence, SceneSpec } from "@eve/schema";
import { validateScene, type SceneContext } from "../scene/validate";
import { finishScene } from "./scene";

/** How long the cross-fade of a morph lasts (the resolver's own minimum for `morph` is 500 ms, ADR 0068). */
export const MORPH_HOLD_MS = 700;

/** What `applyCarry` needs to know about the beat of each scene: its scene context for validation, its narration and its claims. */
export type CarryBeat = { ctx: SceneContext; sentences: readonly NarrationSentence[]; claims: readonly Claim[] };

type Obj = SceneSpec["objects"][number];
const APPEARS = new Set(["reveal", "draw", "pop"]);
const isEquation = (o: Obj): boolean => o.component === "equation" && o.role !== "static" && o.exprRef !== undefined;

/**
 * Persistent objects (ADR 0067) and morphs (ADR 0068), decided where the lesson is assembled, because only there are two scenes seen together. An equation of
 * a scene is carried from the scene before when:
 *  - that scene shows the same expression: it stays, and moves to its new place; or
 *  - the scene's beat has an `equivalent` claim from the expression the scene before showed to the expression this one shows, and a sentence says that claim:
 *    it stays, shows the first expression, and turns into the second when the sentence is spoken (the claim is the lesson's own, proved by the verifier; the
 *    animation proves nothing).
 * A carried scene is validated again, and the scene as it was is kept if it fails: carrying never makes a scene worse. Each object of a scene is carried at most once.
 */
export function applyCarry(scenes: readonly SceneSpec[], beats: readonly CarryBeat[], expressions: Readonly<Record<string, Expr>>, locale: string): SceneSpec[] {
  const out: SceneSpec[] = [];
  scenes.forEach((scene, i) => {
    const before = out[i - 1];
    const beat = beats[i];
    out.push(before && beat ? carried(scene, before, beat, expressions, locale) : scene);
  });
  return out;
}

function carried(scene: SceneSpec, before: SceneSpec, beat: CarryBeat, expressions: Readonly<Record<string, Expr>>, locale: string): SceneSpec {
  const taken = new Set(scene.objects.flatMap((o) => (o.carryFrom ? [o.carryFrom] : [])));
  const sources = before.objects.filter(isEquation);
  const changes: Array<{ id: string; from: Obj; morph: Cue | null }> = [];
  for (const o of scene.objects.filter((x) => isEquation(x) && x.carryFrom === undefined)) {
    const same = sources.find((p) => !taken.has(p.id) && p.exprRef === o.exprRef);
    if (same) {
      taken.add(same.id);
      changes.push({ id: o.id, from: same, morph: null });
      continue;
    }
    for (const p of sources.filter((x) => !taken.has(x.id))) {
      const claim = beat.claims.find((c) => c.kind === "equivalent" && c.a === p.exprRef && c.b === o.exprRef);
      const said = claim && beat.sentences.find((s) => s.role === "claim" && s.claimId === claim.id);
      if (!said) continue;
      taken.add(p.id);
      changes.push({ id: o.id, from: p, morph: { targetObject: o.id, action: "morph", anchor: { sentenceId: said.id, at: "start" }, minHoldMs: MORPH_HOLD_MS } });
      break;
    }
  }
  if (changes.length === 0) return scene;

  const objects = scene.objects.map((o) => {
    const c = changes.find((x) => x.id === o.id);
    return c ? { ...o, carryFrom: c.from.id, ...(c.morph ? { props: { ...o.props, from: c.from.exprRef } } : {}) } : o;
  });
  const gone = new Set(changes.map((c) => c.id));
  const cues = [...scene.cues.filter((c) => !(gone.has(c.targetObject) && APPEARS.has(c.action))), ...changes.flatMap((c) => (c.morph ? [c.morph] : []))];
  const candidate = finishScene({ ...scene, objects, cues }, beat.claims, beat.sentences, expressions, locale);
  return validateScene(candidate, beat.ctx).length === 0 ? candidate : scene;
}
