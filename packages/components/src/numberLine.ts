import { z } from "zod";
import { COLOR_NAMES, evaluate, type Expr } from "@eve/schema";
import { formulaLatex } from "./latex";
import { partStateAt, objectStateAt, css } from "./state";
import { applyState } from "./text";
import type { ComponentModule, ObjectState, RenderContext } from "./types";

const Color = z.enum(COLOR_NAMES);

/**
 * A number line with hops and brackets. Every position comes from an expression: a hop or a bracket names expression ids and the
 * component evaluates them (exact rationals), so nothing is a typed coordinate. Parts a cue may address: `line`, `hop0`, `hop1`, ...
 * (draw-on), `bracket0`, ... (draw-on, its label appears when it is complete).
 *  - hops: each from -> to, continuing where the last one ended; the length is written above its arc ("+2").
 *  - brackets: `span: "hops"` runs from the start of the first hop to the end of the last; `label` is an expression id typeset below it.
 */
export const NumberLineProps = z
  .object({
    min: z.number(),
    max: z.number(),
    step: z.number().positive().optional(),
    hops: z.array(z.object({ from: z.string(), to: z.string(), color: Color.optional() }).strict()).max(4).optional(),
    brackets: z.array(z.object({ span: z.literal("hops"), label: z.string().optional(), color: Color.optional() }).strict()).max(2).optional(),
  })
  .strict()
  .refine((p) => p.min < p.max, "the line must have min < max");
export type NumberLineProps = z.infer<typeof NumberLineProps>;

export const NL_W = 400;
export const NL_H = 200;
const PAD = 24;
const LINE_Y = 110;
const NS = "http://www.w3.org/2000/svg";

const node = (tag: string, attrs: Record<string, string>, text?: string) => {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (text !== undefined) e.textContent = text;
  return e;
};

const valueOf = (expressions: Record<string, Expr>, id: string): number | null => {
  const e = expressions[id];
  const r = e ? evaluate(e) : null;
  return r === null ? null : Number(r.n) / Number(r.d);
};
const fmt = (v: number) => String(Math.round(v * 100) / 100);

type Resolved = { hops: Array<{ from: number; to: number; color: string }>; spans: Array<{ from: number; to: number; label?: string; color: string }> };
function resolveLine(p: NumberLineProps, expressions: Record<string, Expr>): Resolved {
  const hops = (p.hops ?? []).map((h) => {
    const from = valueOf(expressions, h.from);
    const to = valueOf(expressions, h.to);
    if (from === null || to === null) throw new Error(`number line: ${h.from} or ${h.to} is not a number`);
    return { from, to, color: h.color ?? "blue" };
  });
  const spans = (p.brackets ?? []).map((b) => ({ from: hops[0]?.from ?? NaN, to: hops.at(-1)?.to ?? NaN, label: b.label, color: b.color ?? "yellow" }));
  return { hops, spans };
}

function setPart(el: Element | null, s: ObjectState) {
  if (!el) return;
  const st = (el as SVGElement).style;
  st.visibility = s.visible ? "visible" : "hidden";
  st.setProperty("--eve-draw", css(s.draw));
}
/** What appears only when its stroke is complete: the end dot, the length of a hop, the label of a bracket. */
const setFinish = (el: Element | null, s: ObjectState) => {
  if (!el) return;
  (el as HTMLElement | SVGElement).style.opacity = s.visible && s.draw >= 1 ? "1" : "0";
};

export const numberLine: ComponentModule<NumberLineProps> = {
  name: "numberLine",
  propsSchema: NumberLineProps as never,
  render(host, props, t, ctx: RenderContext) {
    const p = NumberLineProps.parse(props);
    host.className = "eve-obj eve-numberline";
    const sig = JSON.stringify([p, ctx.exprRef, ctx.colors?.muted, p.hops?.map((h) => [ctx.expressions[h.from], ctx.expressions[h.to]]), p.brackets?.map((b) => (b.label ? ctx.expressions[b.label] : null))]);
    const { hops, spans } = resolveLine(p, ctx.expressions);
    if (host.dataset.sig !== sig) {
      host.dataset.sig = sig;
      host.replaceChildren();
      const x = (v: number) => PAD + ((v - p.min) / (p.max - p.min)) * (NL_W - 2 * PAD);
      const svg = node("svg", { viewBox: `0 0 ${NL_W} ${NL_H}`, class: "eve-nl-svg", role: "img", "aria-label": numberLine.altText(p, ctx) });
      const step = p.step ?? 1;
      svg.append(node("line", { x1: String(x(p.min)), x2: String(x(p.max)), y1: String(LINE_Y), y2: String(LINE_Y), class: "eve-axis", "data-part": "line" }));
      for (let v = Math.ceil(p.min / step) * step; v <= p.max + 1e-9; v += step) {
        svg.append(node("line", { x1: String(x(v)), x2: String(x(v)), y1: String(LINE_Y - 6), y2: String(LINE_Y + 6), class: "eve-axis" }));
        svg.append(node("text", { x: String(x(v)), y: String(LINE_Y + 26), class: "eve-tick", "text-anchor": "middle" }, fmt(v)));
      }
      hops.forEach((h, i) => {
        const x1 = x(h.from);
        const x2 = x(h.to);
        const rise = Math.min(70, Math.max(24, Math.abs(x2 - x1) * 0.45));
        const g = node("g", { class: `eve-hop eve-c-${h.color}`, "data-part": `hop${i}` });
        g.append(node("path", { d: `M${x1} ${LINE_Y}Q${(x1 + x2) / 2} ${LINE_Y - 2 * rise} ${x2} ${LINE_Y}`, class: "eve-hop-arc", fill: "none", pathLength: "1" }));
        g.append(node("circle", { cx: String(x2), cy: String(LINE_Y), r: "4.5", class: "eve-hop-end" }));
        g.append(node("text", { x: String((x1 + x2) / 2), y: String(LINE_Y - rise - 6), class: "eve-hop-label", "text-anchor": "middle" }, `${h.to >= h.from ? "+" : "-"}${fmt(Math.abs(h.to - h.from))}`));
        svg.append(g);
      });
      spans.forEach((s, i) => {
        const x1 = x(s.from);
        const x2 = x(s.to);
        const g = node("g", { class: `eve-bracket eve-c-${s.color}`, "data-part": `bracket${i}` });
        g.append(node("path", { d: `M${x1} 150v8H${x2}v-8`, class: "eve-bracket-path", fill: "none", pathLength: "1" }));
        svg.append(g);
      });
      host.append(svg);
      spans.forEach((s, i) => {
        if (!s.label) return;
        const expr = ctx.expressions[s.label];
        if (!expr) throw new Error(`number line ${ctx.objectId}: unknown label expression ${s.label}`);
        const label = document.createElement("div");
        label.className = `eve-bracket-label eve-c-${s.color}`;
        label.dataset.part = `bracket${i}`;
        label.style.left = `${(((x(s.from) + x(s.to)) / 2) / NL_W) * 100}%`;
        label.style.top = `${((150 + 8 + 8) / NL_H) * 100}%`;
        label.innerHTML = ctx.math(formulaLatex(expr, ctx.colors), false);
        host.append(label);
      });
    }
    const reduce = ctx.reduceMotion;
    hops.forEach((_h, i) => {
      const s = partStateAt(ctx.events, `hop${i}`, t, reduce);
      const g = host.querySelector(`[data-part="hop${i}"]`);
      setPart(g, s);
      setFinish(g?.querySelector(".eve-hop-end") ?? null, s);
      setFinish(g?.querySelector(".eve-hop-label") ?? null, s);
    });
    spans.forEach((_s, i) => {
      const s = partStateAt(ctx.events, `bracket${i}`, t, reduce);
      setPart(host.querySelector(`g[data-part="bracket${i}"]`), s);
      const label = host.querySelector<HTMLElement>(`div[data-part="bracket${i}"]`);
      if (label) {
        label.style.visibility = s.visible ? "visible" : "hidden";
        setFinish(label, s);
      }
    });
    applyState(host, objectStateAt(ctx.events, t, reduce));
  },
  cueTargets: (props) => ["whole", "line", ...(props.hops ?? []).map((_h, i) => `hop${i}`), ...(props.brackets ?? []).map((_b, i) => `bracket${i}`)],
  altText: (props, ctx) => {
    const { hops, spans } = (() => {
      try {
        return resolveLine(props, ctx.expressions);
      } catch {
        return { hops: [], spans: [] };
      }
    })();
    const parts = [`Number line from ${fmt(props.min)} to ${fmt(props.max)}`];
    hops.forEach((h) => parts.push(`a hop from ${fmt(h.from)} to ${fmt(h.to)}`));
    spans.forEach((s) => parts.push(`a bracket under ${fmt(s.from)} to ${fmt(s.to)}`));
    return parts.join(", ");
  },
  verify(props, ctx) {
    const problems: string[] = [];
    const num = (id: string, what: string): number | null => {
      if (!(id in ctx.expressions)) {
        problems.push(`${what}: unknown expression ${id}`);
        return null;
      }
      const v = valueOf(ctx.expressions, id);
      if (v === null) problems.push(`${what}: ${id} is not a number`);
      return v;
    };
    const hops = (props.hops ?? []).map((h, i) => ({ from: num(h.from, `hop ${i} from`), to: num(h.to, `hop ${i} to`) }));
    hops.forEach((h, i) => {
      if (h.from === null || h.to === null) return;
      if (h.from === h.to) problems.push(`hop ${i} has no length`);
      for (const [v, w] of [[h.from, "from"], [h.to, "to"]] as const) if (v < props.min || v > props.max) problems.push(`hop ${i} ${w} ${fmt(v)} is outside the line (${fmt(props.min)} to ${fmt(props.max)})`);
      const next = hops[i + 1];
      if (next && next.from !== null && next.from !== h.to) problems.push(`hop ${i + 1} must start where hop ${i} ended (${fmt(h.to)}), not at ${fmt(next.from)}`);
    });
    const first = hops[0]?.from ?? null;
    const last = hops.at(-1)?.to ?? null;
    (props.brackets ?? []).forEach((b, i) => {
      if (hops.length === 0 || first === null || last === null) {
        problems.push(`bracket ${i} spans the hops but there are none`);
        return;
      }
      if (!b.label) return;
      const e = ctx.expressions[b.label];
      if (!e) {
        problems.push(`bracket ${i}: unknown label expression ${b.label}`);
        return;
      }
      // A label that states a total (2 + 3 = 5) must state the length the bracket really spans, and the sum of the hops.
      if (e.op === "eq") {
        const total = evaluate(e.b);
        if (total !== null && Number(total.n) / Number(total.d) !== last - first) problems.push(`bracket ${i} spans ${fmt(last - first)} but its label says ${fmt(Number(total.n) / Number(total.d))}`);
      }
    });
    const known = new Set(numberLine.cueTargets(props));
    for (const part of ctx.cueParts ?? []) if (!known.has(part)) problems.push(`a cue targets the part ${part}, which this number line does not have (it has ${[...known].join(", ")})`);
    return problems;
  },
};
