import { z } from "zod";
import { css, objectStateAt } from "./state";
import type { ComponentModule } from "./types";

/** A callout ring around another object, with an optional short label. It lives on top of the stage, out of the flow. */
export const HighlightProps = z.object({ target: z.string().min(1), label: z.string().optional(), points: z.array(z.number()).optional() }).strict();
export type HighlightProps = z.infer<typeof HighlightProps>;

/** The ring colour and the stage colour it must stand out from (WCAG 1.4.11: 3:1 for graphical objects). */
export const HIGHLIGHT_COLOR = "#b45309";
export const STAGE_COLOR = "#ffffff";

export function contrast(a: string, b: string): number {
  const lum = (hex: string) => {
    const n = parseInt(hex.slice(1), 16);
    const f = (v: number) => {
      const s = v / 255;
      return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * f((n >> 16) & 255) + 0.7152 * f((n >> 8) & 255) + 0.0722 * f(n & 255);
  };
  const [x, y] = [lum(a), lum(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

export const highlight: ComponentModule<HighlightProps> = {
  name: "highlight",
  propsSchema: HighlightProps as never,
  render(el, props, t, ctx) {
    const p = HighlightProps.parse(props);
    const s = objectStateAt(ctx.events, t);
    el.className = "eve-obj eve-highlight";
    const rect = ctx.rectOf?.(p.target) ?? null;
    const label = p.label ?? (p.points && p.points.length ? `x = ${p.points.join(", ")}` : "");
    if (el.dataset.label !== label) {
      el.dataset.label = label;
      el.replaceChildren();
      if (label) {
        const chip = document.createElement("span");
        chip.className = "eve-highlight-label";
        chip.textContent = label;
        chip.setAttribute("lang", ctx.locale);
        el.append(chip);
      }
    }
    // Out of the flow, over the target. Visible only while a highlight cue holds (strength = the eased state).
    el.style.position = "absolute";
    el.style.pointerEvents = "none";
    if (rect) {
      el.style.left = `${css(rect.x - 6)}px`;
      el.style.top = `${css(rect.y - 6)}px`;
      el.style.width = `${css(rect.width + 12)}px`;
      el.style.height = `${css(rect.height + 12)}px`;
    }
    el.style.visibility = rect && s.highlight > 0 ? "visible" : "hidden";
    el.style.opacity = css(s.highlight);
    el.style.setProperty("--eve-hl", css(s.highlight));
  },
  cueTargets: () => ["whole"],
  altText: (props) => `Highlight on ${props.target}${props.label ? `: ${props.label}` : ""}`,
  verify(props, ctx) {
    const problems: string[] = [];
    if (!ctx.objectIds.includes(props.target)) problems.push(`highlight target ${props.target} is not an object of this scene`);
    const ratio = contrast(HIGHLIGHT_COLOR, STAGE_COLOR);
    if (ratio < 3) problems.push(`highlight colour has contrast ${ratio.toFixed(2)}:1; 3:1 is required`);
    return problems;
  },
};
