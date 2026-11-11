import { STORY_LIMITS } from "../job/story";
import { routeObject, type Decision, type RouteContext } from "./router";

/**
 * The one seam between the object layer and the story pipeline (ADR 0107). A story scene may carry `objects`: typed object requests. With ENGINE_OBJECTS_V2 on, each is routed and
 * the shapes it resolves to are added to the scene's `visuals` in the story language, so the existing sanitiser, placement and page draw them exactly as they draw any other shape. With
 * the flag off the story is returned untouched (the same value, not a copy), so the output is byte-identical to the engine without this file. An `objects` field is dropped in
 * both cases: the sanitiser never reads it.
 */
export type ExpandResult = { story: unknown; notes: string[]; decisions: Array<{ scene: number; index: number; decision: Decision }> };

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
export const MAX_OBJECTS_PER_SCENE = 8;

export function expandStoryObjects(raw: unknown, ctx: RouteContext): ExpandResult {
  if (!ctx.enabled || !isObj(raw) || !Array.isArray(raw.scenes)) return { story: raw, notes: [], decisions: [] };
  const notes: string[] = [];
  const decisions: ExpandResult["decisions"] = [];
  const scenes = raw.scenes.map((sc, si) => {
    if (!isObj(sc) || !Array.isArray(sc.objects)) return sc;
    const { objects, ...rest } = sc;
    const drawn: Array<Record<string, unknown>> = [];
    for (const [oi, o] of (objects as unknown[]).entries()) {
      if (oi >= MAX_OBJECTS_PER_SCENE) {
        notes.push(`scene ${si + 1}: more than ${MAX_OBJECTS_PER_SCENE} objects; the rest are dropped`);
        break;
      }
      const routed = routeObject(o, ctx);
      if (!routed.active) continue;
      decisions.push({ scene: si, index: oi, decision: routed.decision });
      if (routed.refusal) notes.push(`scene ${si + 1}, object ${oi + 1} refused: ${routed.refusal.reason}${routed.refusal.path ? ` (${routed.refusal.path})` : ""}`);
      else if (routed.decision.action === "refuse") notes.push(`scene ${si + 1}, object ${oi + 1} refused (outcome ${routed.decision.outcome}, ${routed.decision.name}): ${routed.decision.reason}`);
      else if (routed.decision.action === "label_card") notes.push(`scene ${si + 1}, object ${oi + 1} is a label card (outcome ${routed.decision.outcome}, ${routed.decision.name}): ${routed.decision.reason}`);
      else if (routed.provenance?.reviewed === false) notes.push(`scene ${si + 1}, object ${oi + 1} is drawn by the unreviewed drawer ${routed.provenance.drawer}: for development only until a physics teacher's review is recorded`);
      // a figure is drawn whole or not at all: the story language keeps the first STORY_LIMITS.visuals shapes of a scene, and a figure cut in half is a wrong figure
      const have = (Array.isArray(rest.visuals) ? rest.visuals.length : 0) + drawn.length;
      if (have + routed.shapes.length > STORY_LIMITS.visuals) {
        notes.push(`scene ${si + 1}, object ${oi + 1} is not drawn: it would take the scene past ${STORY_LIMITS.visuals} shapes (${have} are there, it needs ${routed.shapes.length}); give each figure a scene of its own`);
        continue;
      }
      drawn.push(...routed.shapes);
    }
    const visuals = [...(Array.isArray(rest.visuals) ? rest.visuals : []), ...drawn];
    return { ...rest, visuals };
  });
  return { story: { ...raw, scenes }, notes, decisions };
}
