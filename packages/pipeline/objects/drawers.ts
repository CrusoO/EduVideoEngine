import { DrawerRegistry, type Drawer, type DrawResult, type RawShape } from "./registry";
import type { ObjectSpec, ObjectSpecOf } from "./spec";
import { findBannedPositioning } from "./qa-text";
import { loadSourceRegister, type SourceRegister } from "./sources";

/**
 * The drawers wave 0 registers (ADR 0107): the label card, and wrappers that call the engine's existing prop and shape path. None of them draws anything new. A wrapper returns a story
 * shape in the form `sanitizeStory` already reads, so what the page draws is what it drew before; the wrapper only turns a typed request into that shape.
 */
export const LABEL_CARD_PREFIX = "Diagram not available yet: ";
const DEFAULT_AREA = "C3:D4";
const placeOf = (spec: ObjectSpec): { area?: string; cell?: string } => (spec.area ? { area: spec.area } : spec.cell ? { cell: spec.cell } : { area: DEFAULT_AREA });
const cue = (spec: ObjectSpec): { s: number; off: number } => ({ s: spec.sentence, off: 0 });
const base = { OWN: ["own-drawings"], LICENCE: "owner-original" } as const;

/** The text a label card shows for a name. Never a drawing of the thing. */
export const labelCardText = (name: string): string => `${LABEL_CARD_PREFIX}${name}`;

export const labelCardDrawer: Drawer<"label_card"> = {
  name: "label_card",
  kind: "label_card",
  version: "1.0.0",
  license: base.LICENCE,
  sources: [...base.OWN],
  draw(spec, ctx): DrawResult {
    const place = placeOf(spec);
    const shapes: RawShape[] = [
      { id: `${ctx.idPrefix}_card`, kind: "rect", ...place, round: 1.2, color: "soft", fill: "none", dash: true, width: 0.25, how: "fade", in: cue(spec) },
      { id: `${ctx.idPrefix}_text`, kind: "text", ...place, text: labelCardText(spec.name), size: 2, anchor: "middle", color: "ink", how: "fade", in: cue(spec) },
    ];
    return { shapes, alt: labelCardText(spec.name) };
  },
  readBack(spec, result) {
    const text = result.shapes.find((s) => s.kind === "text")?.text;
    const mismatches: string[] = [];
    if (text !== labelCardText(spec.name)) mismatches.push("the card text is not the requested name");
    if (result.shapes.some((s) => s.kind !== "rect" && s.kind !== "text")) mismatches.push("a label card draws a rectangle and text only, never a picture");
    if (typeof text === "string" && findBannedPositioning(text).length > 0) mismatches.push("the card text uses a banned positioning phrase");
    return { ok: mismatches.length === 0, mismatches };
  },
};

export const propWrapper: Drawer<"prop"> = {
  name: "existing_prop",
  kind: "prop",
  version: "1.0.0",
  license: base.LICENCE,
  sources: [...base.OWN],
  wraps: "existing",
  draw(spec, ctx): DrawResult {
    const shapes: RawShape[] = [{ id: `${ctx.idPrefix}_prop`, kind: "prop", name: spec.prop, ...placeOf(spec), ...(spec.size !== undefined ? { size: spec.size } : {}), label: spec.name, in: cue(spec) }];
    return { shapes, alt: `A drawing of a ${spec.prop}: ${spec.name}` };
  },
  readBack(spec, result) {
    const s = result.shapes[0];
    const mismatches: string[] = [];
    if (result.shapes.length !== 1 || s?.kind !== "prop") mismatches.push("a prop wrapper draws one prop");
    else if (s.name !== spec.prop) mismatches.push("the drawn prop is not the requested one");
    return { ok: mismatches.length === 0, mismatches };
  },
};

/** The shapes the story language places by a cell alone. An arrow is placed by its end points, so it is not wrapped. */
export const WRAPPED_SHAPES = ["circle", "rect", "numberline"] as const;
export const primitiveWrapper: Drawer<"primitive"> = {
  name: "existing_primitive",
  kind: "primitive",
  version: "1.0.0",
  license: base.LICENCE,
  sources: [...base.OWN],
  wraps: "existing",
  accepts: (spec: ObjectSpecOf<"primitive">) => (WRAPPED_SHAPES as readonly string[]).includes(spec.shape),
  draw(spec, ctx): DrawResult {
    const shapes: RawShape[] = [{ id: `${ctx.idPrefix}_shape`, kind: spec.shape, ...placeOf(spec), ...(spec.color ? { color: spec.color } : {}), label: spec.name, in: cue(spec) }];
    return { shapes, alt: `A ${spec.shape}: ${spec.name}` };
  },
  readBack(spec, result) {
    const s = result.shapes[0];
    const mismatches: string[] = [];
    if (result.shapes.length !== 1 || s?.kind !== spec.shape) mismatches.push("the drawn shape is not the requested one");
    return { ok: mismatches.length === 0, mismatches };
  },
};

/** The registry wave 0 ships: the label card and the two wrappers of the existing path. Nothing else is registered until a wave adds a drawer behind its reviewer. */
export function defaultRegistry(sources: SourceRegister = loadSourceRegister()): DrawerRegistry {
  return new DrawerRegistry(sources).register(labelCardDrawer).register(propWrapper).register(primitiveWrapper);
}
