import { z } from "zod";
import { css, objectStateAt, partStateAt } from "./state";
import { applyState } from "./text";
import type { ComponentModule, ObjectState } from "./types";

/**
 * A bar magnet and a coil joined to a meter (ADR 0083): the picture of electromagnetic induction. The magnet moves towards the coil, rests, moves away, rests, and again; the needle
 * of the meter swings one way while the magnet approaches and the other way while it retreats, and rests when the magnet is still, because the emf follows the change of flux and
 * not the flux. Everything is a function of the lesson time, counted from the cue on the part `motion` (from time zero if there is none), so a seek, a pause and a video frame agree
 * (ADR 0009). With reduced motion the magnet stays near the coil and the needle rests. The wires wobble from fixed seeds. Parts a cue may address: `magnet`, `coil`, `meter`
 * (reveal, pop, highlight, dim) and `motion` (the time the magnet starts moving).
 */
export const MAGNET_VIEW_W = 320;
export const MAGNET_VIEW_H = 210;
export const MagnetCoilProps = z.object({ turns: z.number().int().min(2).max(6) }).strict();
export type MagnetCoilProps = z.infer<typeof MagnetCoilProps>;

const NS = "http://www.w3.org/2000/svg";
const node = (tag: string, attrs: Record<string, string>, text?: string) => {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (text !== undefined) e.textContent = text;
  return e;
};

// the picture: the magnet runs on y = MAG_Y between FAR and NEAR; the coil is on the right; the meter below it
const MAG_Y = 78;
const MAG_W = 92;
const MAG_H = 34;
const FAR = 18;
const NEAR = 100;
const COIL_X = 205;
const COIL_W = 62;
const COIL_H = 74;
const DIAL = { cx: 236, cy: 188, r: 34 };
/** The movement repeats every CYCLE_MS: approach, rest, retreat, rest. */
const PHASE_MS = 1800;
const REST_MS = 900;
const CYCLE_MS = 2 * (PHASE_MS + REST_MS);
const MAX_SWING_DEG = 55;

const smooth = (u: number): number => u * u * (3 - 2 * u);
/** The magnet's place (a fraction from far to near) and its rate of change (fractions per phase, from -1.5 to 1.5) at time tau into the motion. */
export function magnetAt(tau: number): { place: number; rate: number } {
  if (tau <= 0) return { place: 0, rate: 0 };
  const c = tau % CYCLE_MS;
  if (c < PHASE_MS) {
    const u = c / PHASE_MS;
    return { place: smooth(u), rate: 6 * u * (1 - u) };
  }
  if (c < PHASE_MS + REST_MS) return { place: 1, rate: 0 };
  if (c < 2 * PHASE_MS + REST_MS) {
    const u = (c - PHASE_MS - REST_MS) / PHASE_MS;
    return { place: 1 - smooth(u), rate: -6 * u * (1 - u) };
  }
  return { place: 0, rate: 0 };
}

/** A line broken into short pieces that wander a little off the straight: hand-drawn, and the same on every draw. */
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

const PARTS = ["magnet", "coil", "meter", "motion"] as const;

export const magnetCoil: ComponentModule<MagnetCoilProps> = {
  name: "magnetCoil",
  propsSchema: MagnetCoilProps as never,
  render(host, props, t, ctx) {
    const p = MagnetCoilProps.parse(props);
    host.className = "eve-obj eve-magnet";
    host.setAttribute("lang", ctx.locale);
    const sig = JSON.stringify(p);
    if (host.dataset.sig !== sig) {
      host.dataset.sig = sig;
      const svg = node("svg", { viewBox: `0 0 ${MAGNET_VIEW_W} ${MAGNET_VIEW_H}`, role: "img", "aria-label": magnetCoil.altText(p, ctx), class: "eve-magnet-svg" });

      const coil = node("g", { "data-part": "coil" });
      const cy = MAG_Y + MAG_H / 2;
      const top = cy - COIL_H / 2;
      const bottom = cy + COIL_H / 2;
      // the turns: tall ellipses side by side, seen from the side, so a magnet can go in at the left
      const gapX = COIL_W / (p.turns - 1);
      for (let i = 0; i < p.turns; i++) {
        coil.append(node("ellipse", { cx: String(COIL_X + i * gapX), cy: String(cy), rx: "9", ry: String(COIL_H / 2), class: "eve-magnet-turn" }));
      }
      // the leads of the coil go down to the meter
      coil.append(node("path", { d: rough([[COIL_X, bottom], [COIL_X - 22, bottom + 14], [COIL_X - 22, DIAL.cy], [DIAL.cx - DIAL.r, DIAL.cy]], 5, 0.8), class: "eve-magnet-wire" }));
      coil.append(node("path", { d: rough([[COIL_X + COIL_W, bottom], [COIL_X + COIL_W + 22, bottom + 14], [COIL_X + COIL_W + 22, DIAL.cy], [DIAL.cx + DIAL.r, DIAL.cy]], 7, 0.8), class: "eve-magnet-wire" }));
      void top;
      svg.append(coil);

      const meter = node("g", { "data-part": "meter" });
      meter.append(node("path", { d: `M${DIAL.cx - DIAL.r} ${DIAL.cy} A${DIAL.r} ${DIAL.r} 0 0 1 ${DIAL.cx + DIAL.r} ${DIAL.cy}`, class: "eve-magnet-dial" }));
      meter.append(node("line", { x1: String(DIAL.cx), y1: String(DIAL.cy - DIAL.r + 4), x2: String(DIAL.cx), y2: String(DIAL.cy - DIAL.r + 11), class: "eve-magnet-tick" }));
      meter.append(node("line", { x1: String(DIAL.cx), y1: String(DIAL.cy), x2: String(DIAL.cx), y2: String(DIAL.cy - DIAL.r + 6), class: "eve-magnet-needle", "data-needle": "1" }));
      meter.append(node("circle", { cx: String(DIAL.cx), cy: String(DIAL.cy), r: "4", class: "eve-magnet-pivot" }));
      meter.append(node("text", { x: String(DIAL.cx), y: String(DIAL.cy + 20), class: "eve-magnet-label", "text-anchor": "middle" }, "meter"));
      svg.append(meter);

      const magnet = node("g", { "data-part": "magnet", "data-magnet": "1" });
      magnet.append(node("rect", { x: "0", y: String(MAG_Y), width: String(MAG_W / 2), height: String(MAG_H), rx: "3", class: "eve-magnet-south" }));
      magnet.append(node("rect", { x: String(MAG_W / 2), y: String(MAG_Y), width: String(MAG_W / 2), height: String(MAG_H), rx: "3", class: "eve-magnet-north" }));
      magnet.append(node("text", { x: String(MAG_W / 4), y: String(MAG_Y + 24), class: "eve-magnet-pole", "text-anchor": "middle" }, "S"));
      magnet.append(node("text", { x: String((3 * MAG_W) / 4), y: String(MAG_Y + 24), class: "eve-magnet-pole", "text-anchor": "middle" }, "N"));
      svg.append(magnet);
      host.replaceChildren(svg);
    }
    const reduce = ctx.reduceMotion;
    const whole = objectStateAt(ctx.events, t, reduce);
    for (const part of ["magnet", "coil", "meter"]) setPart(host.querySelector(`[data-part="${part}"]`), partStateAt(ctx.events, part, t, reduce));
    // the motion starts at the time of the cue on `motion`, or at zero when the lesson has none
    const start = ctx.events.filter((e) => e.part === "motion").sort((a, b) => a.atMs - b.atMs)[0]?.atMs ?? 0;
    const { place, rate } = reduce ? { place: 1, rate: 0 } : magnetAt(t - start);
    const m = host.querySelector<SVGGElement>('[data-magnet="1"]');
    if (m) m.setAttribute("transform", `translate(${(FAR + (NEAR - FAR) * place).toFixed(2)} 0)`);
    // the magnet's N end leads: a rate towards the coil swings the needle to the right, away from it to the left
    const needle = host.querySelector<SVGLineElement>('[data-needle="1"]');
    if (needle) needle.setAttribute("transform", `rotate(${((rate / 1.5) * MAX_SWING_DEG).toFixed(2)} ${DIAL.cx} ${DIAL.cy})`);
    applyState(host, whole);
  },
  cueTargets: () => ["whole", ...PARTS],
  altText: (props) => `A bar magnet, with its north pole towards a coil of ${props.turns} turns that is joined to a meter: the needle swings while the magnet moves towards the coil or away from it, and rests while it is still`,
  verify(_props, ctx) {
    const problems: string[] = [];
    const known = new Set(["whole", ...PARTS]);
    for (const part of ctx.cueParts ?? []) if (!known.has(part)) problems.push(`a cue targets the part ${part}, which this picture does not have (it has ${[...known].join(", ")})`);
    return problems;
  },
};
