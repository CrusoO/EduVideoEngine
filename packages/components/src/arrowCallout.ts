import { z } from "zod";
import { COLOR_NAMES } from "@eve/schema";
import { objectStateAt } from "./state";
import { applyState } from "./text";
import type { ComponentModule } from "./types";

/** A few words with an arrow that points up, down, left or right: "look at the term above". One short line of text, laid out like any object. */
export const CalloutProps = z
  .object({ text: z.string().min(1), direction: z.enum(["up", "down", "left", "right"]), color: z.enum(COLOR_NAMES).optional() })
  .strict();
export type CalloutProps = z.infer<typeof CalloutProps>;

/** A callout is a hint, not a paragraph. */
export const CALLOUT_WORDS = 8;
const ROTATE = { right: 0, down: 90, left: 180, up: 270 } as const;
const NS = "http://www.w3.org/2000/svg";

export const arrowCallout: ComponentModule<CalloutProps> = {
  name: "arrowCallout",
  propsSchema: CalloutProps as never,
  render(el, props, t, ctx) {
    const p = CalloutProps.parse(props);
    el.className = `eve-obj eve-callout eve-c-${p.color ?? "yellow"}`;
    el.setAttribute("lang", ctx.locale);
    const sig = JSON.stringify(p);
    if (el.dataset.sig !== sig) {
      el.dataset.sig = sig;
      const svg = document.createElementNS(NS, "svg");
      svg.setAttribute("viewBox", "0 0 24 24");
      svg.setAttribute("class", "eve-callout-arrow");
      svg.setAttribute("aria-hidden", "true");
      const path = document.createElementNS(NS, "path");
      path.setAttribute("d", "M3 12h16m-6-7 7 7-7 7");
      path.setAttribute("fill", "none");
      svg.append(path);
      svg.style.transform = `rotate(${ROTATE[p.direction]}deg)`;
      const label = document.createElement("span");
      label.className = "eve-callout-text";
      label.textContent = p.text;
      el.replaceChildren(svg, label);
    }
    applyState(el, objectStateAt(ctx.events, t, ctx.reduceMotion));
  },
  cueTargets: () => ["whole"],
  altText: (props) => `${props.text} (an arrow pointing ${props.direction})`,
  verify(props) {
    const p = CalloutProps.parse(props);
    const problems: string[] = [];
    const words = p.text.trim().split(/\s+/).length;
    if (words > CALLOUT_WORDS) problems.push(`a callout has ${words} words; at most ${CALLOUT_WORDS}`);
    if (/[=^]|\[A-Za-z]+/.test(p.text)) problems.push("maths belongs in an equation component, not in a callout");
    return problems;
  },
};
