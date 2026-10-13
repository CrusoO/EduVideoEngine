import { z } from "zod";
import { COLOR_NAMES } from "@eve/schema";
import { objectStateAt } from "./state";
import { applyState } from "./text";
import type { ComponentModule } from "./types";

/** Heights of a shape in pixels, by size. A line is always 24 px tall. */
import { SHAPE_HEIGHT, SHAPE_LABEL_WORDS, SHAPE_LINE_HEIGHT } from "./constants";
export { SHAPE_HEIGHT, SHAPE_LABEL_WORDS, SHAPE_LINE_HEIGHT };

/**
 * A plain shape: a rectangle, a circle or a rule, in one palette colour, with an optional short label. Drawn on from the left by `draw`,
 * scaled in by `pop`, faded in by `reveal`. Laid out like any object.
 */
export const ShapeProps = z
  .object({ kind: z.enum(["rect", "circle", "line"]), size: z.enum(["s", "m", "l"]), color: z.enum(COLOR_NAMES), label: z.string().min(1).optional() })
  .strict();
export type ShapeProps = z.infer<typeof ShapeProps>;

export const shape: ComponentModule<ShapeProps> = {
  name: "shape",
  propsSchema: ShapeProps as never,
  render(el, props, t, ctx) {
    const p = ShapeProps.parse(props);
    el.className = `eve-obj eve-shape eve-shape-${p.kind} eve-shape-size-${p.size} eve-c-${p.color}`;
    el.setAttribute("lang", ctx.locale);
    if (el.textContent !== (p.label ?? "")) el.textContent = p.label ?? "";
    applyState(el, objectStateAt(ctx.events, t, ctx.reduceMotion));
  },
  cueTargets: () => ["whole"],
  altText: (props) => `A ${props.color} ${props.kind === "line" ? "line" : props.kind === "rect" ? "rectangle" : "circle"}${props.label ? ` labelled ${props.label}` : ""}`,
  verify(props) {
    const p = ShapeProps.parse(props);
    const words = p.label ? p.label.trim().split(/\s+/).length : 0;
    return words > SHAPE_LABEL_WORDS ? [`a shape label has ${words} words; at most ${SHAPE_LABEL_WORDS}`] : [];
  },
};
