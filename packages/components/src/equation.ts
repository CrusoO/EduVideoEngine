import { z } from "zod";
import { symbols } from "@eve/schema";
import { termIds, type Expr } from "@eve/schema";
import { formulaLatex, toLatex } from "./latex";
import { spokenLabel } from "./spoken";
import { css, objectStateAt, partStateAt } from "./state";
import { applyState } from "./text";
import type { ComponentModule } from "./types";

/** `focus`: the names of the terms that keep their colour; every other part of the formula is dimmed. */
/** Every combination of dimmed terms is typeset ahead of time (the player ships no KaTeX), so the named terms of an equation that is cued per term are limited. */
export const MAX_TERMS_PER_EQUATION = 5;

/** `from`: the expression this equation shows before its `morph` cue, which turns it into the object's own expression (ADR 0068). */
export const EquationProps = z.object({ display: z.boolean().optional(), size: z.enum(["m", "l"]).optional(), focus: z.array(z.string()).min(1).optional(), from: z.string().optional() }).strict();
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

/** How far a morph has gone at time t: 0 before it, 1 after it (and, with reduced motion, from its start on), linear in between. 1 when the object has no morph. */
export function morphProgress(morph: { atMs: number; holdUntilMs: number } | undefined, t: number, reduceMotion?: boolean): number {
  if (!morph) return 1;
  if (reduceMotion) return t >= morph.atMs ? 1 : 0;
  return Math.min(1, Math.max(0, (t - morph.atMs) / Math.max(1, morph.holdUntilMs - morph.atMs)));
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
    const display = p.display ?? true;
    const fromExpr = p.from !== undefined ? ctx.expressions[p.from] : undefined;
    const morph = fromExpr ? ctx.events.find((e) => e.part === undefined && e.action === "morph") : undefined;
    const k = morphProgress(morph, t, ctx.reduceMotion);
    if (fromExpr && morph && k < 1) {
      // Before the cue the first formula alone; during it both, one fading out as the other fades in (ADR 0068).
      const fromLatex = formulaLatex(fromExpr, ctx.colors);
      const key = `morph:${fromLatex}|${latex}`;
      if (el.dataset.latex !== key) {
        el.innerHTML = `<div class="eve-morph-from">${ctx.math(fromLatex, display)}</div><div class="eve-morph-to" style="position:absolute;left:0;top:0;width:100%">${ctx.math(latex, display)}</div>`;
        el.dataset.latex = key;
      }
      const [first, second] = [el.children[0] as HTMLElement, el.children[1] as HTMLElement];
      first.style.opacity = String(css(1 - k));
      second.style.opacity = String(css(k));
    } else if (el.dataset.latex !== latex) {
      // Same input, same DOM: only re-typeset when the formula changes, never on a time change.
      el.innerHTML = ctx.math(latex, display);
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
    if (props.from !== undefined) {
      const fromExpr = ctx.expressions[props.from];
      if (!fromExpr) problems.push(`from names ${props.from}, which is not an expression of the lesson`);
      else if (props.from === ctx.exprRef) problems.push("from is the expression the equation already shows: there is nothing to morph");
      else if (fromExpr.op !== "eq" || expr.op !== "eq") problems.push("a morph goes from one equation to another");
      if (!(ctx.wholeActions ?? []).includes("morph")) problems.push("an equation with from needs a morph cue on the whole object");
      if (ctx.math && fromExpr) {
        try {
          ctx.math(toLatex(fromExpr), props.display ?? true);
        } catch (e) {
          problems.push(`KaTeX cannot render ${toLatex(fromExpr)}: ${(e as Error).message}`);
        }
      }
    } else if ((ctx.wholeActions ?? []).includes("morph")) problems.push("a morph cue needs the equation to set from");
    if ((ctx.wholeActions ?? []).filter((a) => a === "morph").length > 1) problems.push("an equation morphs once per scene");
    const known = new Set(termsOf(expr));
    for (const part of ctx.cueParts ?? []) if (!known.has(part)) problems.push(`a cue targets the part ${part}, which this equation does not have as a named term (${known.size ? [...known].join(", ") : "it has none"})`);
    for (const { part, action } of ctx.cueActions ?? []) if (action === "morph") problems.push(`morph acts on the whole equation, not on the part ${part}`);
    for (const { part, action } of ctx.cueActions ?? []) if (known.has(part) && action !== "dim" && action !== "highlight" && action !== "morph") problems.push(`a named term can only be dimmed or highlighted, not ${action} (term ${part})`);
    if (known.size > MAX_TERMS_PER_EQUATION && (ctx.cueParts ?? []).length > 0) problems.push(`an equation with cues on its terms may name at most ${MAX_TERMS_PER_EQUATION} terms (it has ${known.size}): every combination is pre-rendered`);
    for (const name of symbols(expr)) if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(name)) problems.push(`symbol ${name} is not ASCII`);
    return problems;
  },
};
