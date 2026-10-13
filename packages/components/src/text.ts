import { z } from "zod";
import { css, objectStateAt } from "./state";
import type { ComponentModule, ObjectState } from "./types";

export const TextProps = z.object({ text: z.string().min(1), role: z.enum(["title", "label", "body"]).default("body") }).strict();
export type TextProps = z.infer<typeof TextProps>;

/** Word budgets per role: a screen is read, not studied (narration lives in the captions, never printed here). */
export const WORD_BUDGET = { title: 8, label: 10, body: 30 } as const;

/** The state every component shares: reveal fade, dimming and the highlight strength variable. */
export function applyState(el: HTMLElement, s: ObjectState) {
  el.style.opacity = css(s.dimmed ? Math.min(s.opacity, 0.35) : s.opacity);
  el.style.visibility = s.visible ? "visible" : "hidden";
  el.style.setProperty("--eve-hl", css(s.highlight));
}

export const text: ComponentModule<TextProps> = {
  name: "text",
  propsSchema: TextProps as never,
  render(el, props, t, ctx) {
    const p = TextProps.parse(props);
    // Real browser text: the browser shapes Devanagari. `lang` selects the right shaping and font.
    el.className = `eve-obj eve-text eve-text-${p.role}`;
    el.setAttribute("lang", ctx.locale);
    if (el.textContent !== p.text) el.textContent = p.text;
    applyState(el, objectStateAt(ctx.events, t));
  },
  cueTargets: () => ["whole"],
  altText: (props) => props.text,
  verify(props) {
    const p = TextProps.parse(props);
    const words = p.text.trim().split(/\s+/).length;
    const problems: string[] = [];
    if (words > WORD_BUDGET[p.role]) problems.push(`text has ${words} words; a ${p.role} may have ${WORD_BUDGET[p.role]}`);
    if (/[=^]|\\[A-Za-z]+/.test(p.text)) problems.push("maths belongs in an equation component, not in text");
    return problems;
  },
};
