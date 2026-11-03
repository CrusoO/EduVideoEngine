import { z } from "zod";
import { toLatex } from "./latex";
import { spokenLabel } from "./spoken";
import { objectStateAt } from "./state";
import { applyState } from "./text";
import type { ComponentModule } from "./types";

const NS = "http://www.w3.org/2000/svg";

/** A horizontal balance beam (ADR 0094): shows a linear equation as a balance scale, LHS in the left pan and RHS in the right. */
export const BalanceScaleProps = z.object({}).strict();
export type BalanceScaleProps = z.infer<typeof BalanceScaleProps>;

function makeBeamSvg(): SVGSVGElement {
  const svg = document.createElementNS(NS, "svg");
  svg.setAttribute("viewBox", "0 0 280 52");
  svg.setAttribute("class", "eve-balance-beam-svg");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("focusable", "false");

  const fulcrum = document.createElementNS(NS, "polygon");
  fulcrum.setAttribute("points", "140,50 124,52 156,52");
  fulcrum.setAttribute("fill", "currentColor");
  svg.appendChild(fulcrum);

  const post = document.createElementNS(NS, "line");
  post.setAttribute("x1", "140");
  post.setAttribute("y1", "20");
  post.setAttribute("x2", "140");
  post.setAttribute("y2", "50");
  post.setAttribute("stroke", "currentColor");
  post.setAttribute("stroke-width", "3");
  post.setAttribute("stroke-linecap", "round");
  svg.appendChild(post);

  const beam = document.createElementNS(NS, "rect");
  beam.setAttribute("x", "10");
  beam.setAttribute("y", "18");
  beam.setAttribute("width", "260");
  beam.setAttribute("height", "4");
  beam.setAttribute("rx", "2");
  beam.setAttribute("fill", "currentColor");
  svg.appendChild(beam);

  for (const cx of [40, 240]) {
    const chain = document.createElementNS(NS, "line");
    chain.setAttribute("x1", String(cx));
    chain.setAttribute("y1", "18");
    chain.setAttribute("x2", String(cx));
    chain.setAttribute("y2", "0");
    chain.setAttribute("stroke", "currentColor");
    chain.setAttribute("stroke-width", "2");
    svg.appendChild(chain);
  }

  return svg;
}

export const balanceScale: ComponentModule<BalanceScaleProps> = {
  name: "balanceScale",
  propsSchema: BalanceScaleProps as never,
  render(el, _props, t, ctx) {
    el.className = "eve-obj eve-balance-scale";

    const expr = ctx.exprRef ? ctx.expressions[ctx.exprRef] : undefined;
    if (!expr) throw new Error(`balanceScale ${ctx.objectId}: no exprRef`);
    if (expr.op !== "eq") throw new Error(`balanceScale ${ctx.objectId}: exprRef ${ctx.exprRef} must be an equation (op "eq")`);

    const lhsLatex = toLatex(expr.a, ctx.colors?.of);
    const rhsLatex = toLatex(expr.b, ctx.colors?.of);
    const sig = `${ctx.exprRef}|${lhsLatex}|${rhsLatex}`;

    if (el.dataset.sig !== sig) {
      el.dataset.sig = sig;

      const lhsPan = document.createElement("div");
      lhsPan.className = "eve-balance-pan";
      lhsPan.innerHTML = ctx.math(lhsLatex, false);

      const rhsPan = document.createElement("div");
      rhsPan.className = "eve-balance-pan";
      rhsPan.innerHTML = ctx.math(rhsLatex, false);

      const row = document.createElement("div");
      row.className = "eve-balance-pans";
      row.appendChild(lhsPan);
      row.appendChild(rhsPan);

      el.replaceChildren(row, makeBeamSvg());
    }

    applyState(el, objectStateAt(ctx.events, t, ctx.reduceMotion));
  },
  cueTargets: () => ["whole"],
  altText(_props, ctx) {
    const eq = ctx.exprRef ? ctx.expressions[ctx.exprRef] : undefined;
    if (!eq || eq.op !== "eq") return "balance scale";
    return `Balance scale: ${spokenLabel(eq.a, ctx.locale)} equals ${spokenLabel(eq.b, ctx.locale)}`;
  },
  verify(_props, ctx) {
    const problems: string[] = [];
    const expr = ctx.exprRef ? ctx.expressions[ctx.exprRef] : undefined;
    if (!expr) {
      problems.push("no exprRef: a balance scale needs an equation expression");
    } else if (expr.op !== "eq") {
      problems.push(`expression ${ctx.exprRef} must be an equation (op "eq", got "${expr.op}")`);
    }
    return problems;
  },
};
