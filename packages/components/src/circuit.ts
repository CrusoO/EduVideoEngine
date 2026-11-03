import { z } from "zod";
import { evaluate, type Expr } from "@eve/schema";
import { Sweep, sweepFactorAt } from "./sweep";
import { css, objectStateAt, partStateAt } from "./state";
import { applyState } from "./text";
import type { ComponentModule, ObjectState } from "./types";

/**
 * A one-loop electric circuit (ADR 0082): a battery, a resistor and, optionally, a meter. Each part names an expression of the lesson that is a number, so every value on screen
 * is evaluated (exact rationals), never typed; the unit is a short symbol (V, A, an ohm sign). Current is drawn as dots that travel round the loop in the conventional direction (out of
 * the positive plate, through the resistor, back to the negative plate); their speed follows the meter's value (or the resistor's, without a meter) and their place is a function of the
 * lesson time alone, so a seek, a pause and a video frame agree (ADR 0009). The wires wobble a little, from a fixed seed, so the drawing looks made by hand and never changes between frames.
 * ADR 0083 adds a `resistor2` (a second branch: a parallel circuit) and a `voltmeter` (joined across the resistor; its reading may be hidden like the meter's).
 * Parts a cue may address: `wires` (drawn on), `battery`, `resistor`, `resistor2`, `meter`, `voltmeter`, `flow` (the moving dots), each with reveal, pop, highlight and dim.
 */
export const CIRCUIT_VIEW_W = 320;
export const CIRCUIT_VIEW_H = 200;
const PartProps = z.object({ value: z.string().min(1), unit: z.string().min(1).max(3) }).strict();
/** `hidden` on the meter shows a question mark where its reading goes, for a lesson that asks what the meter will show. */
const MeterProps = PartProps.extend({ hidden: z.boolean().optional() }).strict();
/** `sweep` (ADR 0085): the battery is multiplied by a factor that a `morph` cue moves and the student can drag while the lesson is paused; the meter then reads battery divided by resistor. */
export const CircuitProps = z.object({ battery: PartProps, resistor: PartProps, resistor2: PartProps.optional(), meter: MeterProps.optional(), voltmeter: MeterProps.optional(), sweep: Sweep.optional() }).strict();
export type CircuitProps = z.infer<typeof CircuitProps>;

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

/** A small deterministic generator (mulberry32): the wobble of the wires is the same on every draw. */
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
/** A polyline through the points, each broken into short pieces that wander a little off the straight line: hand-drawn, never random between frames. */
function rough(points: ReadonlyArray<readonly [number, number]>, seed: number, amount = 1.1): string {
  const rnd = seeded(seed);
  let d = "";
  points.forEach((p, i) => {
    if (i === 0) {
      d += `M${p[0].toFixed(1)} ${p[1].toFixed(1)}`;
      return;
    }
    const q = points[i - 1]!;
    const len = Math.hypot(p[0] - q[0], p[1] - q[1]);
    const pieces = Math.max(1, Math.round(len / 28));
    for (let k = 1; k <= pieces; k++) {
      const u = k / pieces;
      const x = q[0] + (p[0] - q[0]) * u + (k === pieces ? 0 : (rnd() - 0.5) * 2 * amount);
      const y = q[1] + (p[1] - q[1]) * u + (k === pieces ? 0 : (rnd() - 0.5) * 2 * amount);
      d += `L${x.toFixed(1)} ${y.toFixed(1)}`;
    }
  });
  return d;
}

// the loop: left x, right x, top y, bottom y; the battery sits on the left wire. In a series circuit the resistor is on the top and the meter on the bottom;
// in a parallel circuit (a second resistor) two branches join the top and the bottom wire (ADR 0083).
const L = 48;
const R = 272;
const T = 46;
const B = 150;
const MID = (T + B) / 2;
const RES_X0 = 118;
const RES_X1 = 202;
const METER_R = 17;
const DOTS = 12;
/** The branches of a parallel circuit, the right wire being the second one, and the meter between the battery and the first branch. */
const PAR_R = 250;
const PAR_X1 = 165;
const PAR_METER_X = 105;
/** The voltmeter sits inside a series loop, below the resistor, with a lead from each end of the resistor. */
const VOLT_X = 160;
const VOLT_Y = 86;
const VOLT_R = 15;

type Pt = readonly [number, number];
/** The point at fraction u (0 to 1, wrapping) of the way along a closed route of straight pieces. */
function along(route: readonly Pt[], u: number): [number, number] {
  const lens = route.slice(1).map((p, i) => Math.hypot(p[0] - route[i]![0], p[1] - route[i]![1]));
  const total = lens.reduce((a, b) => a + b, 0);
  let s = (((u % 1) + 1) % 1) * total;
  for (let i = 0; i < lens.length; i++) {
    if (s <= lens[i]! || i === lens.length - 1) {
      const k = lens[i]! === 0 ? 0 : Math.min(1, s / lens[i]!);
      const a = route[i]!;
      const b = route[i + 1]!;
      return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k];
    }
    s -= lens[i]!;
  }
  return [route[0]![0], route[0]![1]];
}
/** Clockwise from the middle of the left wire: up, along the top, down, back along the bottom. Conventional current leaves the positive plate. */
const SERIES_ROUTE: readonly Pt[] = [[L, MID], [L, T], [R, T], [R, B], [L, B], [L, MID]];
const PAR_ROUTE_A: readonly Pt[] = [[L, MID], [L, T], [PAR_X1, T], [PAR_X1, B], [L, B], [L, MID]];
const PAR_ROUTE_B: readonly Pt[] = [[L, MID], [L, T], [PAR_R, T], [PAR_R, B], [L, B], [L, MID]];
/** Loops per second: faster for a larger current, never still and never a blur. */
const loopsPerSecond = (current: number): number => Math.min(0.5, Math.max(0.06, Math.abs(current) * 0.05));

function setPart(el: Element | null, s: ObjectState) {
  if (!el) return;
  const st = (el as SVGElement).style;
  st.visibility = s.visible ? "visible" : "hidden";
  st.opacity = css(s.dimmed ? Math.min(s.opacity, 0.35) : s.opacity);
  st.setProperty("--eve-draw", css(s.draw));
  st.setProperty("--eve-hl", css(s.highlight));
  st.transformBox = "fill-box";
  st.transformOrigin = "center";
  if (s.scale === 1) st.removeProperty("transform");
  else st.transform = `scale(${css(s.scale)})`;
}

const cueParts = (p: CircuitProps): string[] => ["wires", "battery", "resistor", ...(p.resistor2 ? ["resistor2"] : []), ...(p.meter ? ["meter"] : []), ...(p.voltmeter ? ["voltmeter"] : []), "flow"];

/** A zig-zag from a to b, `n` teeth, `amp` wide: a resistor. */
function zigzag(a: Pt, b: Pt, n: number, amp: number): Array<[number, number]> {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len = Math.hypot(dx, dy);
  const nx = -dy / len;
  const ny = dx / len;
  const pts: Array<[number, number]> = [[a[0], a[1]]];
  for (let i = 0; i < n; i++) {
    const u = (i + 0.5) / n;
    const s = i % 2 === 0 ? -amp : amp;
    pts.push([a[0] + dx * u + nx * s, a[1] + dy * u + ny * s]);
  }
  pts.push([b[0], b[1]]);
  return pts;
}

export const circuit: ComponentModule<CircuitProps> = {
  name: "circuit",
  propsSchema: CircuitProps as never,
  render(host, props, t, ctx) {
    const p = CircuitProps.parse(props);
    host.className = "eve-obj eve-circuit";
    host.setAttribute("lang", ctx.locale);
    const read = (id: string) => {
      const v = valueOf(ctx.expressions, id);
      if (v === null) throw new Error(`circuit ${ctx.objectId}: ${id} is not a number`);
      return v;
    };
    const vals = {
      battery: read(p.battery.value),
      resistor: read(p.resistor.value),
      resistor2: p.resistor2 ? read(p.resistor2.value) : null,
      meter: p.meter ? read(p.meter.value) : null,
      voltmeter: p.voltmeter ? read(p.voltmeter.value) : null,
    };
    const parallel = p.resistor2 !== undefined;
    const sig = JSON.stringify([p, vals]);
    if (host.dataset.sig !== sig) {
      host.dataset.sig = sig;
      const svg = node("svg", { viewBox: `0 0 ${CIRCUIT_VIEW_W} ${CIRCUIT_VIEW_H}`, role: "img", "aria-label": circuit.altText(p, ctx), class: "eve-circuit-svg" });
      const wire = (d: string, cls = "eve-circuit-wire") => node("path", { d, class: cls, pathLength: "1" });
      const gap = 14;
      const wires = node("g", { "data-part": "wires" });
      // the meter of a series loop moves along the bottom wire to make room for a voltmeter
      const meterX = parallel ? PAR_METER_X : p.voltmeter ? 235 : 160;
      const right = parallel ? PAR_R : R;
      const meterHalf = p.meter ? METER_R : 0;
      if (parallel) {
        wires.append(wire(rough([[L, MID - gap], [L, T], [right, T]], 11)));
        wires.append(wire(rough([[right, B], [meterX + meterHalf, B]], 23)));
        wires.append(wire(rough([[meterX - meterHalf, B], [L, B], [L, MID + gap]], 37)));
        wires.append(wire(rough([[PAR_X1, T], [PAR_X1, MID - 26]], 61)));
        wires.append(wire(rough([[PAR_X1, MID + 26], [PAR_X1, B]], 63)));
        wires.append(wire(rough([[right, T], [right, MID - 26]], 65)));
        wires.append(wire(rough([[right, MID + 26], [right, B]], 67)));
        // the two nodes where the first branch meets the wires
        for (const [x, y] of [[PAR_X1, T], [PAR_X1, B]] as const) wires.append(node("circle", { cx: String(x), cy: String(y), r: "4.5", class: "eve-circuit-node" }));
      } else {
        wires.append(wire(rough([[L, MID - gap], [L, T], [RES_X0, T]], 11)));
        wires.append(wire(rough([[RES_X1, T], [right, T], [right, B], [meterX + meterHalf, B]], 23)));
        wires.append(wire(rough([[meterX - meterHalf, B], [L, B], [L, MID + gap]], 37)));
      }
      svg.append(wires);
      // the dots go under the parts, so a meter or a battery is never drawn over by them
      const flow = node("g", { "data-part": "flow" });
      for (let i = 0; i < DOTS; i++) flow.append(node("circle", { r: "4", class: "eve-circuit-dot", "data-dot": String(i) }));
      svg.append(flow);

      const battery = node("g", { "data-part": "battery" });
      battery.append(node("path", { d: rough([[L - 20, MID - gap], [L + 20, MID - gap]], 41, 0.6), class: "eve-circuit-plate eve-circuit-plate-long" }));
      battery.append(node("path", { d: rough([[L - 11, MID + gap], [L + 11, MID + gap]], 43, 0.6), class: "eve-circuit-plate eve-circuit-plate-short" }));
      battery.append(node("text", { x: String(L - 30), y: String(MID - gap - 2), class: "eve-circuit-sign", "text-anchor": "middle" }, "+"));
      battery.append(node("text", { x: String(L + 28), y: String(MID + 5), class: "eve-circuit-value eve-circuit-value-battery", "text-anchor": "start", "data-label": "battery" }, `${show(vals.battery)} ${p.battery.unit}`));
      svg.append(battery);

      const resistor = node("g", { "data-part": "resistor" });
      if (parallel) {
        resistor.append(node("path", { d: rough(zigzag([PAR_X1, MID - 26], [PAR_X1, MID + 26], 6, 9), 53, 0.5), class: "eve-circuit-part" }));
        resistor.append(node("text", { x: String(PAR_X1 - 14), y: String(MID + 5), class: "eve-circuit-value eve-circuit-value-resistor", "text-anchor": "end" }, `${show(vals.resistor)} ${p.resistor.unit}`));
      } else {
        resistor.append(node("path", { d: rough(zigzag([RES_X0, T], [RES_X1, T], 6, 11), 53, 0.5), class: "eve-circuit-part" }));
        resistor.append(node("text", { x: String((RES_X0 + RES_X1) / 2), y: String(T - 22), class: "eve-circuit-value eve-circuit-value-resistor", "text-anchor": "middle" }, `${show(vals.resistor)} ${p.resistor.unit}`));
      }
      svg.append(resistor);

      if (p.resistor2 && vals.resistor2 !== null) {
        const r2 = node("g", { "data-part": "resistor2" });
        r2.append(node("path", { d: rough(zigzag([right, MID - 26], [right, MID + 26], 6, 9), 71, 0.5), class: "eve-circuit-part" }));
        r2.append(node("text", { x: String(right + 16), y: String(MID + 5), class: "eve-circuit-value eve-circuit-value-resistor", "text-anchor": "start" }, `${show(vals.resistor2)} ${p.resistor2.unit}`));
        svg.append(r2);
      }

      if (p.meter && vals.meter !== null) {
        const meter = node("g", { "data-part": "meter" });
        meter.append(node("circle", { cx: String(meterX), cy: String(B), r: String(METER_R), class: "eve-circuit-meter" }));
        meter.append(node("text", { x: String(meterX), y: String(B + 6), class: "eve-circuit-sign", "text-anchor": "middle" }, p.meter.unit));
        meter.append(node("text", { x: String(meterX), y: String(B + 40), class: "eve-circuit-value eve-circuit-value-meter", "text-anchor": "middle", "data-label": "meter" }, p.meter.hidden ? `? ${p.meter.unit}` : `${show(vals.meter)} ${p.meter.unit}`));
        svg.append(meter);
      }

      if (p.voltmeter && vals.voltmeter !== null) {
        // a voltmeter is joined across the part it measures: a lead from each end of it to a dial of its own
        const volt = node("g", { "data-part": "voltmeter" });
        const label = p.voltmeter.hidden ? `? ${p.voltmeter.unit}` : `${show(vals.voltmeter)} ${p.voltmeter.unit}`;
        if (!parallel) {
          volt.append(node("path", { d: rough([[RES_X0, T], [RES_X0, VOLT_Y], [VOLT_X - VOLT_R, VOLT_Y]], 81, 0.6), class: "eve-circuit-lead" }));
          volt.append(node("path", { d: rough([[RES_X1, T], [RES_X1, VOLT_Y], [VOLT_X + VOLT_R, VOLT_Y]], 83, 0.6), class: "eve-circuit-lead" }));
          volt.append(node("circle", { cx: String(VOLT_X), cy: String(VOLT_Y), r: String(VOLT_R), class: "eve-circuit-voltmeter" }));
          volt.append(node("text", { x: String(VOLT_X), y: String(VOLT_Y + 6), class: "eve-circuit-sign", "text-anchor": "middle" }, p.voltmeter.unit));
          volt.append(node("text", { x: String(VOLT_X), y: String(VOLT_Y + 36), class: "eve-circuit-value eve-circuit-value-voltmeter", "text-anchor": "middle" }, label));
        } else {
          // across both branches of a parallel pair: from the top node to the bottom node through a dial between the branches
          const vx = (PAR_X1 + PAR_R) / 2;
          volt.append(node("path", { d: rough([[PAR_X1, T], [vx, T + 6], [vx, VOLT_Y - VOLT_R]], 81, 0.6), class: "eve-circuit-lead" }));
          volt.append(node("circle", { cx: String(vx), cy: String(VOLT_Y), r: String(VOLT_R), class: "eve-circuit-voltmeter" }));
          volt.append(node("text", { x: String(vx), y: String(VOLT_Y + 6), class: "eve-circuit-sign", "text-anchor": "middle" }, p.voltmeter.unit));
          volt.append(node("path", { d: rough([[vx, VOLT_Y + VOLT_R], [vx, B - 6], [PAR_X1, B]], 83, 0.6), class: "eve-circuit-lead" }));
          volt.append(node("text", { x: String(vx), y: String(T - 12), class: "eve-circuit-value eve-circuit-value-voltmeter", "text-anchor": "middle" }, label));
        }
        svg.append(volt);
      }

      if (p.sweep) svg.append(node("text", { x: String(CIRCUIT_VIEW_W / 2), y: String(CIRCUIT_VIEW_H + 14), class: "eve-hint", "text-anchor": "middle", "data-role": "hint" }, "drag left and right to change the battery"));
      host.replaceChildren(svg);
    }
    const reduce = ctx.reduceMotion;
    const whole = objectStateAt(ctx.events, t, reduce);
    for (const part of cueParts(p)) setPart(host.querySelector(`[data-part="${part}"]`), partStateAt(ctx.events, part, t, reduce));
    // the dots: a pure function of t, going round at a speed that follows the current (a still picture with reduced motion); in a parallel circuit half take each branch
    const k = p.sweep ? sweepFactorAt(p.sweep, ctx.events, t, reduce, ctx.sweepOverride) : 1;
    const push = vals.battery * k;
    // with a sweep the meter follows the battery: it reads the battery divided by the resistor
    const reading = p.sweep && p.meter && vals.resistor > 0 ? push / vals.resistor : vals.meter;
    if (p.sweep) {
      const bl = host.querySelector('[data-label="battery"]');
      if (bl) bl.textContent = `${show(push)} ${p.battery.unit}`;
      const ml = host.querySelector('[data-label="meter"]');
      if (ml && p.meter && reading !== null && !p.meter.hidden) ml.textContent = `${show(reading)} ${p.meter.unit}`;
      const hint = host.querySelector<SVGElement>('[data-role="hint"]');
      if (hint) hint.style.visibility = ctx.interactive ? "visible" : "hidden";
      host.style.cursor = ctx.interactive ? "ew-resize" : "";
      host.style.touchAction = ctx.interactive ? "none" : "";
    }
    const current = reading ?? vals.resistor;
    const phase = reduce ? 0 : (t / 1000) * loopsPerSecond(current);
    host.querySelectorAll<SVGCircleElement>("[data-dot]").forEach((c) => {
      const i = Number(c.dataset.dot);
      const route = parallel ? (i % 2 === 0 ? PAR_ROUTE_A : PAR_ROUTE_B) : SERIES_ROUTE;
      const k = parallel ? Math.floor(i / 2) / (DOTS / 2) : i / DOTS;
      const [x, y] = along(route, phase + k);
      c.setAttribute("cx", x.toFixed(1));
      c.setAttribute("cy", y.toFixed(1));
      // no dot in the gap between the battery plates
      c.style.display = x === L && Math.abs(y - MID) < 17 ? "none" : "";
    });
    applyState(host, whole);
  },
  cueTargets: (props) => ["whole", ...cueParts(props)],
  altText: (props, ctx) => {
    const read = (id: string) => {
      const v = valueOf(ctx.expressions, id);
      return v === null ? "?" : show(v);
    };
    const meter = props.meter ? (props.meter.hidden ? " and a meter whose reading is not yet shown" : ` and a meter that reads ${read(props.meter.value)} ${props.meter.unit}`) : "";
    const volt = props.voltmeter ? (props.voltmeter.hidden ? ", with a voltmeter whose reading is not yet shown" : `, with a voltmeter that reads ${read(props.voltmeter.value)} ${props.voltmeter.unit}`) : "";
    const second = props.resistor2 ? ` and a second resistor of ${read(props.resistor2.value)} ${props.resistor2.unit} in parallel with it` : "";
    return `A circuit${props.resistor2 ? " with two branches" : " in one loop"}: a battery of ${read(props.battery.value)} ${props.battery.unit}, a resistor of ${read(props.resistor.value)} ${props.resistor.unit}${second}${meter}${volt}, with dots showing current going round`;
  },
  verify(props, ctx) {
    const problems: string[] = [];
    const specs = { battery: props.battery, resistor: props.resistor, ...(props.resistor2 ? { resistor2: props.resistor2 } : {}), ...(props.meter ? { meter: props.meter } : {}), ...(props.voltmeter ? { voltmeter: props.voltmeter } : {}) };
    for (const [part, spec] of Object.entries(specs)) {
      if (!(spec.value in ctx.expressions)) problems.push(`${part}: unknown expression ${spec.value}`);
      else if (valueOf(ctx.expressions, spec.value) === null) problems.push(`${part}: ${spec.value} is not a number`);
    }
    const known = new Set(["whole", ...cueParts(props)]);
    for (const part of ctx.cueParts ?? []) if (!known.has(part)) problems.push(`a cue targets the part ${part}, which this circuit does not have (it has ${[...known].join(", ")})`);
    return problems;
  },
};
