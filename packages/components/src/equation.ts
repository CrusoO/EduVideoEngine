import { z } from "zod";
import { symbols } from "@eve/schema";
import { termIds, type Expr } from "@eve/schema";
import { formulaLatex, toLatex } from "./latex";
import { spokenLabel } from "./spoken";
import { objectStateAt, partStateAt } from "./state";
import { applyState } from "./text";
import type { ComponentModule } from "./types";

/** `focus`: the names of the terms that keep their colour; every other part of the formula is dimmed. */
/** Every combination of dimmed terms is typeset ahead of time (the player ships no KaTeX), so the named terms of an equation that is cued per term are limited. */
export const MAX_TERMS_PER_EQUATION = 5;

export const EquationProps = z.object({ display: z.boolean().optional(), size: z.enum(["m", "l"]).optional(), focus: z.array(z.string()).min(1).optional() }).strict();
export type EquationProps = z.infer<typeof EquationProps>;

/** The named terms of an expression, in a stable order: the parts a cue may dim or highlight. */
const termsOf = (expr: Expr | undefined): string[] => (expr ? [...termIds(expr)].sort() : []);

/** Terms a cue has dimmed by time t, and, while a term is highlighted, every other named term (that is the focus). */
export function dimmedTerms(terms: readonly string[], events: Parameters<typeof partStateAt>[0], t: number, reduceMotion?: boolean): Set<string> {
  const dimmed = new Set<string>();
  const focused = new Set<string>();
  for (const term of terms) {
    const s = partStateAt(events, term, t, reduceMotion);
    if (s.dimmed) dimmed.add(term);
    if (s.highlight > 0) focused.add(term);
  }
  if (focused.size > 0) for (const term of terms) if (!focused.has(term)) dimmed.add(term);
  return dimmed;
}

export const equation: ComponentModule<EquationProps> = {
  name: "equation",
  propsSchema: EquationProps as never,
  render(el, props, t, ctx) {
    const p = EquationProps.parse(props);
    const expr = ctx.exprRef ? ctx.expressions[ctx.exprRef] : undefined;
    if (!expr) throw new Error(`equation ${ctx.objectId}: unknown exprRef ${ctx.exprRef}`);
    el.className = `eve-obj eve-equation eve-size-${p.size ?? "m"}`;
    const latex = formulaLatex(expr, ctx.colors, p.focus, dimmedTerms(termsOf(expr), ctx.events, t, ctx.reduceMotion));
    // Same input, same DOM: only re-typeset when the formula changes, never on a time change.
    if (el.dataset.latex !== latex) {
      el.innerHTML = ctx.math(latex, p.display ?? true);
      el.dataset.latex = latex;
    }
    // The label a screen reader speaks is the verbalised tree (same source as the voice); KaTeX's MathML stays inside for tools that read it.
    el.setAttribute("role", "img");
    el.setAttribute("aria-label", spokenLabel(expr, ctx.locale));
    applyState(el, objectStateAt(ctx.events, t, ctx.reduceMotion));
  },
  cueTargets: (_props, ctx) => ["whole", ...termsOf(ctx?.exprRef ? ctx.expressions[ctx.exprRef] : undefined)],
  altText: (_props, ctx) => (ctx.exprRef && ctx.expressions[ctx.exprRef] ? `Equation: ${spokenLabel(ctx.expressions[ctx.exprRef]!, ctx.locale)}` : "Equation"),
  verify(props, ctx) {
    const expr = ctx.exprRef ? ctx.expressions[ctx.exprRef] : undefined;
    if (!expr) return [`unknown exprRef ${ctx.exprRef}`];
    const problems: string[] = [];
    for (const f of props.focus ?? []) if (!termIds(expr).has(f)) problems.push(`focus names the term ${f}, which the expression does not have`);
    if (ctx.math) {
      try {
        ctx.math(toLatex(expr), props.display ?? true);
      } catch (e) {
        problems.push(`KaTeX cannot render ${toLatex(expr)}: ${(e as Error).message}`);
      }
    }
    const known = new Set(termsOf(expr));
    for (const part of ctx.cueParts ?? []) if (!known.has(part)) problems.push(`a cue targets the part ${part}, which this equation does not have as a named term (${known.size ? [...known].join(", ") : "it has none"})`);
    for (const { part, action } of ctx.cueActions ?? []) if (known.has(part) && action !== "dim" && action !== "highlight") problems.push(`a named term can only be dimmed or highlighted, not ${action} (term ${part})`);
    if (known.size > MAX_TERMS_PER_EQUATION && (ctx.cueParts ?? []).length > 0) problems.push(`an equation with cues on its terms may name at most ${MAX_TERMS_PER_EQUATION} terms (it has ${known.size}): every combination is pre-rendered`);
    for (const name of symbols(expr)) if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(name)) problems.push(`symbol ${name} is not ASCII`);
    return problems;
  },
};
