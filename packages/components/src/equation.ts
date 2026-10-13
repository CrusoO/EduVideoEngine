import { z } from "zod";
import { symbols } from "@eve/schema";
import { termIds } from "@eve/schema";
import { formulaLatex, toLatex } from "./latex";
import { spokenLabel } from "./spoken";
import { objectStateAt } from "./state";
import { applyState } from "./text";
import type { ComponentModule } from "./types";

/** `focus`: the names of the terms that keep their colour; every other part of the formula is dimmed. */
export const EquationProps = z.object({ display: z.boolean().optional(), size: z.enum(["m", "l"]).optional(), focus: z.array(z.string()).min(1).optional() }).strict();
export type EquationProps = z.infer<typeof EquationProps>;

export const equation: ComponentModule<EquationProps> = {
  name: "equation",
  propsSchema: EquationProps as never,
  render(el, props, t, ctx) {
    const p = EquationProps.parse(props);
    const expr = ctx.exprRef ? ctx.expressions[ctx.exprRef] : undefined;
    if (!expr) throw new Error(`equation ${ctx.objectId}: unknown exprRef ${ctx.exprRef}`);
    el.className = `eve-obj eve-equation eve-size-${p.size ?? "m"}`;
    const latex = formulaLatex(expr, ctx.colors, p.focus);
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
  cueTargets: () => ["whole"],
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
    for (const name of symbols(expr)) if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(name)) problems.push(`symbol ${name} is not ASCII`);
    return problems;
  },
};
