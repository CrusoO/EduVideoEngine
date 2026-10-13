import { z } from "zod";
import { symbols, type Expr } from "@eve/schema";
import { toPlain } from "./latex";
import { samplePoints, type Window } from "./sample";
import { findRoots, formatRoot } from "./roots";
import { objectStateAt, partStateAt, css } from "./state";
import { applyState } from "./text";
import type { ComponentModule, ObjectState } from "./types";

/**
 * A graph of y = f(x). `roots: true` marks the roots of the expression, computed from it (never typed coordinates). Parts a cue may
 * address: `curve` (draw-on) and `root0`, `root1`, ... (pop in, labelled with their value), in increasing x.
 */
export const GraphProps = z
  .object({ xMin: z.number(), xMax: z.number(), yMin: z.number(), yMax: z.number(), roots: z.boolean().optional() })
  .strict()
  .refine((p) => p.xMin < p.xMax && p.yMin < p.yMax, "the window must have xMin < xMax and yMin < yMax");
export type GraphProps = z.infer<typeof GraphProps>;

/** The drawing is 400 x 260 units. Axis numbers are 15 units: 12 px on a 360 px phone (ADR 0017). */
export const GRAPH_W = 400;
export const GRAPH_H = 260;
const W = GRAPH_W;
const H = GRAPH_H;
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

const rootsOf = (p: GraphProps, f: Expr | undefined) => (p.roots && f ? findRoots(f, p as Window) : []);

/** Shows or hides one part and writes its draw progress and size. */
function setPart(el: Element | null, s: ObjectState) {
  if (!el) return;
  const st = (el as SVGElement).style;
  st.visibility = s.visible ? "visible" : "hidden";
  st.opacity = css(s.opacity);
  st.setProperty("--eve-draw", css(s.draw));
  st.transformBox = "fill-box";
  st.transformOrigin = "center";
  if (s.scale === 1) st.removeProperty("transform");
  else st.transform = `scale(${css(s.scale)})`;
}

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
      svg.append(node("path", { d, class: "eve-curve", fill: "none", pathLength: "1", "data-part": "curve" }));
      rootsOf(p, f).forEach((r, i) => {
        const g = node("g", { class: "eve-root", "data-part": `root${i}` });
        g.append(node("circle", { cx: String(sx(r.x)), cy: String(sy(0)), r: "4.5", class: "eve-marker" }));
        // the label sits above the axis, inside the drawing, and flips to the left of a root near the right edge
        const right = sx(r.x) > W - 70;
        g.append(node("text", { x: String(sx(r.x) + (right ? -9 : 9)), y: String(sy(0) - 9), class: "eve-root-label", "text-anchor": right ? "end" : "start" }, `x = ${formatRoot(r)}`));
        svg.append(g);
      });
      host.append(svg);
    }
    const reduce = ctx.reduceMotion;
    setPart(host.querySelector('[data-part="curve"]'), partStateAt(ctx.events, "curve", t, reduce));
    host.querySelectorAll('[class~="eve-root"]').forEach((g) => setPart(g, partStateAt(ctx.events, g.getAttribute("data-part")!, t, reduce)));
    applyState(host, objectStateAt(ctx.events, t, reduce));
  },
  cueTargets: (props, ctx) => ["whole", "curve", ...rootsOf(props, ctx?.exprRef ? ctx.expressions[ctx.exprRef] : undefined).map((_r, i) => `root${i}`)],
  altText: (props, ctx) => {
    const f = ctx.exprRef ? ctx.expressions[ctx.exprRef] : undefined;
    const roots = rootsOf(props, f);
    const marked = roots.length ? `, with the roots marked at x = ${roots.map(formatRoot).join(" and ")}` : "";
    return `Graph of y = ${f ? toPlain(f) : "?"} for x from ${props.xMin} to ${props.xMax}${marked}`;
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
    if (props.roots && free.length === 0 && f.op !== "eq" && findRoots(f, props).length === 0) problems.push("roots are asked for but the expression has none in the window");
    const known = new Set(functionGraph.cueTargets(props, { expressions: ctx.expressions, exprRef: ctx.exprRef }));
    for (const part of ctx.cueParts ?? []) if (!known.has(part)) problems.push(`a cue targets the part ${part}, which this graph does not have (it has ${[...known].join(", ")})`);
    return problems;
  },
};
