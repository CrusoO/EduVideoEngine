import { z } from "zod";
import { symbols } from "@eve/schema";
import { toPlain } from "./latex";
import { samplePoints, type Window } from "./sample";
import { objectStateAt } from "./state";
import { applyState } from "./text";
import type { ComponentModule } from "./types";

export const GraphProps = z
  .object({ xMin: z.number(), xMax: z.number(), yMin: z.number(), yMax: z.number(), markers: z.array(z.number()).optional() })
  .strict()
  .refine((p) => p.xMin < p.xMax && p.yMin < p.yMax, "the window must have xMin < xMax and yMin < yMax");
export type GraphProps = z.infer<typeof GraphProps>;

const W = 400;
const H = 260;
const PAD = { l: 34, r: 12, t: 12, b: 26 };
const NS = "http://www.w3.org/2000/svg";

const node = (tag: string, attrs: Record<string, string>, text?: string) => {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (text !== undefined) e.textContent = text;
  return e;
};

/** Integer ticks on the window (at most about 8 per axis). */
const ticks = (lo: number, hi: number) => {
  const step = Math.max(1, Math.ceil((hi - lo) / 8));
  const out: number[] = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi; v += step) out.push(v);
  return out;
};

export const functionGraph: ComponentModule<GraphProps> = {
  name: "functionGraph",
  propsSchema: GraphProps as never,
  render(host, props, t, ctx) {
    const p = GraphProps.parse(props);
    const f = ctx.exprRef ? ctx.expressions[ctx.exprRef] : undefined;
    if (!f) throw new Error(`functionGraph ${ctx.objectId}: unknown exprRef ${ctx.exprRef}`);
    host.className = "eve-obj eve-graph";
    const sig = JSON.stringify([p, ctx.exprRef, f]);
    if (host.dataset.sig !== sig) {
      host.dataset.sig = sig;
      host.replaceChildren();
      const sx = (x: number) => PAD.l + ((x - p.xMin) / (p.xMax - p.xMin)) * (W - PAD.l - PAD.r);
      const sy = (y: number) => H - PAD.b - ((y - p.yMin) / (p.yMax - p.yMin)) * (H - PAD.t - PAD.b);
      const svg = node("svg", { viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": `Graph of y = ${toPlain(f)}`, class: "eve-graph-svg" });
      for (const v of ticks(p.xMin, p.xMax)) {
        svg.append(node("line", { x1: String(sx(v)), x2: String(sx(v)), y1: String(PAD.t), y2: String(H - PAD.b), class: "eve-grid" }));
        svg.append(node("text", { x: String(sx(v)), y: String(H - 8), class: "eve-tick", "text-anchor": "middle" }, String(v)));
      }
      for (const v of ticks(p.yMin, p.yMax)) {
        svg.append(node("line", { x1: String(PAD.l), x2: String(W - PAD.r), y1: String(sy(v)), y2: String(sy(v)), class: "eve-grid" }));
        svg.append(node("text", { x: String(PAD.l - 6), y: String(sy(v) + 4), class: "eve-tick", "text-anchor": "end" }, String(v)));
      }
      if (p.yMin <= 0 && p.yMax >= 0) svg.append(node("line", { x1: String(PAD.l), x2: String(W - PAD.r), y1: String(sy(0)), y2: String(sy(0)), class: "eve-axis" }));
      if (p.xMin <= 0 && p.xMax >= 0) svg.append(node("line", { x1: String(sx(0)), x2: String(sx(0)), y1: String(PAD.t), y2: String(H - PAD.b), class: "eve-axis" }));
      // The curve, broken wherever f is undefined or leaves the window.
      let d = "";
      let pen = false;
      for (const s of samplePoints(f, p as Window)) {
        if (s.y === null || s.y < p.yMin - 1e-9 || s.y > p.yMax + 1e-9) {
          pen = false;
          continue;
        }
        d += `${pen ? "L" : "M"}${sx(s.x).toFixed(2)} ${sy(s.y).toFixed(2)}`;
        pen = true;
      }
      svg.append(node("path", { d, class: "eve-curve", fill: "none" }));
      for (const m of p.markers ?? []) {
        const y = samplePoints(f, { ...p, xMin: m, xMax: m + 1 }, 1)[0]?.y;
        if (y !== null && y !== undefined) svg.append(node("circle", { cx: String(sx(m)), cy: String(sy(y)), r: "4.5", class: "eve-marker" }));
      }
      host.append(svg);
    }
    applyState(host, objectStateAt(ctx.events, t));
  },
  cueTargets: () => ["whole"],
  altText: (props, ctx) => {
    const f = ctx.exprRef ? ctx.expressions[ctx.exprRef] : undefined;
    return `Graph of y = ${f ? toPlain(f) : "?"} for x from ${props.xMin} to ${props.xMax}`;
  },
  verify(props, ctx) {
    const f = ctx.exprRef ? ctx.expressions[ctx.exprRef] : undefined;
    if (!f) return [`unknown exprRef ${ctx.exprRef}`];
    const problems: string[] = [];
    const free = [...symbols(f)].filter((s) => s !== "x");
    if (free.length) problems.push(`the graphed expression has free symbols besides x: ${free.join(", ")}`);
    if (f.op === "eq") problems.push("a graph needs an expression in x, not an equation");
    const samples = samplePoints(f, props);
    const defined = samples.filter((s) => s.y !== null);
    if (defined.length === 0) problems.push("the expression is undefined everywhere on the window");
    if (defined.length > 0 && !defined.some((s) => (s.y as number) >= props.yMin && (s.y as number) <= props.yMax)) problems.push("the curve never enters the y window");
    for (const m of props.markers ?? []) {
      const y = samplePoints(f, { ...props, xMin: m, xMax: m + 1 }, 1)[0]?.y;
      if (y === null || y === undefined) problems.push(`marker at x = ${m} is where the expression is undefined`);
    }
    return problems;
  },
};
