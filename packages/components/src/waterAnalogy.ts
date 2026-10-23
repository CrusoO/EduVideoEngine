import { z } from "zod";
import { evaluate, type Expr } from "@eve/schema";
import { Sweep, sweepFactorAt } from "./sweep";
import { css, objectStateAt, partStateAt } from "./state";
import { applyState } from "./text";
import type { ComponentModule, ObjectState } from "./types";

/**
 * Water in a pipe, the first picture of electric current (ADR 0085): a tank whose water level is the push of the battery (potential difference), a pipe with a narrow part that is
 * the resistance, and drops that run along the pipe at a speed that follows the push divided by the narrowness, which is the current. It is an analogy and says so: the tank, the
 * pipe and the drops are parts a cue may address (`tank`, `pipe`, `flow`, `reading`), and the lesson that uses it names where the analogy stops. Every number is an expression of the
 * lesson that is a number, so the labels are evaluated, never typed. With a `sweep` the level is multiplied by a factor that a `morph` cue moves and that the student can drag while
 * the lesson is paused, and the reading follows (push divided by narrowness). Everything is a function of the lesson time and the factor alone (ADR 0009).
 */
export const WATER_VIEW_W = 320;
export const WATER_VIEW_H = 210;
const Unit = z.string().min(1).max(3);
export const WaterProps = z
  .object({
    /** The push: the expression of the tank's level, and the unit written on it. */
    height: z.object({ value: z.string().min(1), unit: Unit }).strict(),
    /** The narrowness of the pipe: the expression of the resistance, and its unit. A bigger number is a narrower throat. */
    narrow: z.object({ value: z.string().min(1), unit: Unit }).strict(),
    /** The reading at the end of the pipe: push divided by narrowness, with its unit; `hidden` shows a question mark. */
    flow: z.object({ unit: Unit, hidden: z.boolean().optional() }).strict().optional(),
    /** The level at which the tank is full, in the unit of the push. */
    full: z.number().positive().default(24),
    sweep: Sweep.optional(),
  })
  .strict();
export type WaterProps = z.infer<typeof WaterProps>;

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
const show = (v: number): string => String(Math.round(v * 100) / 100).replace("-", "−");

function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function rough(points: ReadonlyArray<readonly [number, number]>, seed: number, amount = 1): string {
  const rnd = seeded(seed);
  let d = "";
  points.forEach((p, i) => {
    if (i === 0) {
      d += `M${p[0].toFixed(1)} ${p[1].toFixed(1)}`;
      return;
    }
    const q = points[i - 1]!;
    const pieces = Math.max(1, Math.round(Math.hypot(p[0] - q[0], p[1] - q[1]) / 26));
    for (let k = 1; k <= pieces; k++) {
      const u = k / pieces;
      d += `L${(q[0] + (p[0] - q[0]) * u + (k === pieces ? 0 : (rnd() - 0.5) * 2 * amount)).toFixed(1)} ${(q[1] + (p[1] - q[1]) * u + (k === pieces ? 0 : (rnd() - 0.5) * 2 * amount)).toFixed(1)}`;
    }
  });
  return d;
}

function setPart(el: Element | null, s: ObjectState) {
  if (!el) return;
  const st = (el as SVGElement).style;
  st.visibility = s.visible ? "visible" : "hidden";
  st.opacity = css(s.dimmed ? Math.min(s.opacity, 0.35) : s.opacity);
  st.setProperty("--eve-hl", css(s.highlight));
  st.transformBox = "fill-box";
  st.transformOrigin = "center";
  if (s.scale === 1) st.removeProperty("transform");
  else st.transform = `scale(${css(s.scale)})`;
}

// the picture: a tank on the left, a pipe to the right with a narrow part in the middle
const TANK = { x0: 24, x1: 96, y0: 26, y1: 158 };
const PIPE_Y = 146;
const PIPE_HALF = 16;
const PIPE_X0 = 96;
const PIPE_X1 = 300;
const THROAT_X0 = 168;
const THROAT_X1 = 232;
const DOTS = 10;
const loopsPerSecond = (current: number): number => Math.min(0.6, Math.max(0.05, Math.abs(current) * 0.06));
/** The opening of the narrow part in pixels for a resistance: 11 px at 4 ohms, wider for less, never closed. */
export const throatGap = (resistance: number): number => Math.max(5, (2 * PIPE_HALF) / (1 + Math.max(0, resistance) / 4));

const PARTS = ["tank", "pipe", "flow", "reading"] as const;

export const waterAnalogy: ComponentModule<WaterProps> = {
  name: "waterAnalogy",
  propsSchema: WaterProps as never,
  render(host, props, t, ctx) {
    const p = WaterProps.parse(props);
    host.className = "eve-obj eve-water";
    host.setAttribute("lang", ctx.locale);
    const read = (id: string) => {
      const v = valueOf(ctx.expressions, id);
      if (v === null) throw new Error(`waterAnalogy ${ctx.objectId}: ${id} is not a number`);
      return v;
    };
    const base = read(p.height.value);
    const narrow = read(p.narrow.value);
    const sig = JSON.stringify([p, base, narrow]);
    if (host.dataset.sig !== sig) {
      host.dataset.sig = sig;
      const svg = node("svg", { viewBox: `0 0 ${WATER_VIEW_W} ${WATER_VIEW_H}`, role: "img", "aria-label": waterAnalogy.altText(p, ctx), class: "eve-water-svg" });
      const gap = throatGap(narrow);
      const cy = PIPE_Y;
      const top = cy - PIPE_HALF;
      const bot = cy + PIPE_HALF;
      const tank = node("g", { "data-part": "tank" });
      tank.append(node("rect", { x: String(TANK.x0), y: String(TANK.y0), width: String(TANK.x1 - TANK.x0), height: "0", class: "eve-water-level", "data-level": "1" }));
      tank.append(node("path", { d: rough([[TANK.x0, TANK.y0], [TANK.x0, TANK.y1], [TANK.x1, TANK.y1]], 3, 0.8), class: "eve-water-wall" }));
      tank.append(node("path", { d: rough([[TANK.x1, TANK.y0], [TANK.x1, top]], 5, 0.8), class: "eve-water-wall" }));
      tank.append(node("text", { x: String((TANK.x0 + TANK.x1) / 2), y: String(TANK.y0 - 8), class: "eve-water-label eve-water-label-push", "text-anchor": "middle", "data-label": "push" }, ""));
      svg.append(tank);
      const pipe = node("g", { "data-part": "pipe" });
      // the water in the pipe, and the walls with the narrow part pinched in
      pipe.append(node("path", { d: `M${PIPE_X0} ${top} L${THROAT_X0} ${top} L${THROAT_X0 + 14} ${cy - gap / 2} L${THROAT_X1 - 14} ${cy - gap / 2} L${THROAT_X1} ${top} L${PIPE_X1} ${top} L${PIPE_X1} ${bot} L${THROAT_X1} ${bot} L${THROAT_X1 - 14} ${cy + gap / 2} L${THROAT_X0 + 14} ${cy + gap / 2} L${THROAT_X0} ${bot} L${PIPE_X0} ${bot} Z`, class: "eve-water-pipe-fill", "data-fill": "1" }));
      pipe.append(node("path", { d: rough([[PIPE_X0, top], [THROAT_X0, top], [THROAT_X0 + 14, cy - gap / 2], [THROAT_X1 - 14, cy - gap / 2], [THROAT_X1, top], [PIPE_X1, top]], 7, 0.6), class: "eve-water-wall" }));
      pipe.append(node("path", { d: rough([[PIPE_X0, bot], [THROAT_X0, bot], [THROAT_X0 + 14, cy + gap / 2], [THROAT_X1 - 14, cy + gap / 2], [THROAT_X1, bot], [PIPE_X1, bot]], 9, 0.6), class: "eve-water-wall" }));
      pipe.append(node("text", { x: String((THROAT_X0 + THROAT_X1) / 2), y: String(bot + 30), class: "eve-water-label eve-water-label-narrow", "text-anchor": "middle" }, `${show(narrow)} ${p.narrow.unit}`));
      svg.append(pipe);
      const flow = node("g", { "data-part": "flow" });
      for (let i = 0; i < DOTS; i++) flow.append(node("circle", { r: "4", class: "eve-water-drop", "data-dot": String(i) }));
      svg.append(flow);
      const reading = node("g", { "data-part": "reading" });
      reading.append(node("text", { x: String(PIPE_X1 - 8), y: String(top - 14), class: "eve-water-label eve-water-label-flow", "text-anchor": "end", "data-label": "flow" }, ""));
      svg.append(reading);
      if (p.sweep) svg.append(node("text", { x: String(WATER_VIEW_W / 2), y: String(WATER_VIEW_H + 14), class: "eve-hint", "text-anchor": "middle", "data-role": "hint" }, "drag left and right to change the push"));
      host.replaceChildren(svg);
    }
    const reduce = ctx.reduceMotion;
    const whole = objectStateAt(ctx.events, t, reduce);
    for (const part of PARTS) setPart(host.querySelector(`[data-part="${part}"]`), partStateAt(ctx.events, part, t, reduce));
    const k = p.sweep ? sweepFactorAt(p.sweep, ctx.events, t, reduce, ctx.sweepOverride) : 1;
    const push = base * k;
    const level = Math.min(1, Math.max(0, push / p.full));
    const current = narrow > 0 ? push / narrow : 0;
    const tankH = TANK.y1 - TANK.y0;
    const lv = host.querySelector<SVGRectElement>('[data-level="1"]');
    if (lv) {
      lv.setAttribute("y", (TANK.y1 - tankH * level).toFixed(2));
      lv.setAttribute("height", (tankH * level).toFixed(2));
    }
    const fill = host.querySelector<SVGElement>('[data-fill="1"]');
    if (fill) fill.style.opacity = level > 0 ? "1" : "0";
    const pushLabel = host.querySelector('[data-label="push"]');
    if (pushLabel) pushLabel.textContent = `${show(push)} ${p.height.unit}`;
    const flowLabel = host.querySelector('[data-label="flow"]');
    if (flowLabel) flowLabel.textContent = p.flow ? (p.flow.hidden ? `? ${p.flow.unit}` : `${show(current)} ${p.flow.unit}`) : "";
    // the drops: a function of time and of the current, round and round the pipe (still with reduced motion)
    const phase = reduce ? 0 : (t / 1000) * loopsPerSecond(current);
    host.querySelectorAll<SVGCircleElement>("[data-dot]").forEach((c) => {
      const i = Number(c.dataset.dot);
      const u = (((phase + i / DOTS) % 1) + 1) % 1;
      const x = PIPE_X0 + 6 + u * (PIPE_X1 - PIPE_X0 - 12);
      c.setAttribute("cx", x.toFixed(1));
      c.setAttribute("cy", String(PIPE_Y));
      c.style.display = level > 0 ? "" : "none";
    });
    const hint = host.querySelector<SVGElement>('[data-role="hint"]');
    if (hint) hint.style.visibility = ctx.interactive ? "visible" : "hidden";
    host.style.cursor = p.sweep && ctx.interactive ? "ew-resize" : "";
    host.style.touchAction = p.sweep && ctx.interactive ? "none" : "";
    applyState(host, whole);
  },
  cueTargets: () => ["whole", ...PARTS],
  altText: (props, ctx) => {
    const v = valueOf(ctx.expressions, props.height.value);
    const r = valueOf(ctx.expressions, props.narrow.value);
    return `Water analogy: a tank filled to ${v === null ? "?" : show(v)} ${props.height.unit} pushes water along a pipe whose narrow part stands for ${r === null ? "?" : show(r)} ${props.narrow.unit}; the more push and the wider the narrow part, the faster the drops run`;
  },
  verify(props, ctx) {
    const problems: string[] = [];
    for (const [part, id] of [["height", props.height.value], ["narrow", props.narrow.value]] as const) {
      if (!(id in ctx.expressions)) problems.push(`${part}: unknown expression ${id}`);
      else if (valueOf(ctx.expressions, id) === null) problems.push(`${part}: ${id} is not a number`);
    }
    const r = valueOf(ctx.expressions, props.narrow.value);
    if (r !== null && r <= 0) problems.push("narrow: the resistance must be above zero");
    const known = new Set(["whole", ...PARTS]);
    for (const part of ctx.cueParts ?? []) if (!known.has(part)) problems.push(`a cue targets the part ${part}, which this picture does not have (it has ${[...known].join(", ")})`);
    return problems;
  },
};
