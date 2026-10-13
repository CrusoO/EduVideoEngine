import { z } from "zod";
import { symbols } from "@eve/schema";
import { toLatex, toPlain } from "./latex";
import { objectStateAt } from "./state";
import { applyState } from "./text";
import type { ComponentModule } from "./types";

export const EquationProps = z.object({ display: z.boolean().optional(), size: z.enum(["m", "l"]).optional() }).strict();
export type EquationProps = z.infer<typeof EquationProps>;

export const equation: ComponentModule<EquationProps> = {
  name: "equation",
  propsSchema: EquationProps as never,
  render(el, props, t, ctx) {
    const p = EquationProps.parse(props);
    const expr = ctx.exprRef ? ctx.expressions[ctx.exprRef] : undefined;
    if (!expr) throw new Error(`equation ${ctx.objectId}: unknown exprRef ${ctx.exprRef}`);
    el.className = `eve-obj eve-equation eve-size-${p.size ?? "m"}`;
    const latex = toLatex(expr);
    // Same input, same DOM: only re-typeset when the formula changes, never on a time change.
    if (el.dataset.latex !== latex) {
      el.innerHTML = ctx.math(latex, p.display ?? true);
      el.dataset.latex = latex;
    }
    applyState(el, objectStateAt(ctx.events, t));
  },
  cueTargets: () => ["whole"],
  altText: (_props, ctx) => (ctx.exprRef && ctx.expressions[ctx.exprRef] ? `Equation: ${toPlain(ctx.expressions[ctx.exprRef]!)}` : "Equation"),
  verify(props, ctx) {
    const expr = ctx.exprRef ? ctx.expressions[ctx.exprRef] : undefined;
    if (!expr) return [`unknown exprRef ${ctx.exprRef}`];
    const problems: string[] = [];
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
