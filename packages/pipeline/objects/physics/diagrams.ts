import type { DrawResult } from "../registry";
import { DEFAULT_FORCE_DEG, angOf, buoyancy, centreOfMass, circular, collision, gaugePressure, hydraulic, incline, lever, magOf, momentOfInertia, netForce, polar, rad, torque, vectorSum, wrap360, deg, ATM_PA } from "./compute";
import { kindDrawer, physicsDrawer } from "./define";
import {
  arrowBy, drawScaleBar, fitScale, niceCeil, parseReadouts, pointsOf, r1, readScale, shapeBy, vectorOf, type Readout, type Sketch,
} from "./kit";

/**
 * The figures of mechanics that are diagrams, not graphs (ADR 0108): vectors, the free-body diagram, the inclined plane, circular motion, levers, torque and centre of mass, collisions,
 * fluid pressure, the measuring instruments, and a calorimeter. Arrows are drawn to a scale that is itself drawn (a bar with its value), so the length of an arrow can be read back
 * as a force. A figure never types a number: each one comes from compute.ts and is printed once.
 */
const near = (a: number, b: number, tol: number): boolean => Math.abs(a - b) <= tol;
const angDiff = (a: number, b: number): number => Math.abs(((a - b + 540) % 360) - 180);
type Pt = { x: number; y: number };

/** Draws a vector (physical, y up) from a stage point as an arrow and returns the stage tip. */
function vec(sk: Sketch, id: string, o: Pt, v: Pt, perUnit: number, opts: { dash?: boolean; width?: number } = {}): Pt {
  const tip = { x: o.x + v.x / perUnit, y: o.y - v.y / perUnit };
  sk.arrow(id, o.x, o.y, tip.x, tip.y, opts);
  return tip;
}
/** Where to put a short label beyond the tip of an arrow that points from `o` to `tip`. */
function labelAt(sk: Sketch, id: string, o: Pt, tip: Pt, text: string): void {
  const dx = tip.x - o.x;
  const dy = tip.y - o.y;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  const gap = len < 6 ? 3.4 : 1.6; // a short arrow keeps its label clear of the body it starts from
  sk.text(id, tip.x + ux * gap, tip.y + uy * gap + (uy > 0.5 ? 0.6 : uy < -0.5 ? -0.6 : 0), text, { anchor: ux > 0.35 ? "start" : ux < -0.35 ? "end" : "middle" });
}
/** A short label at the middle of an arrow, set to one side of it (the side where the stage has more room: below a flat arrow, right of an upright one). */
function labelBeside(sk: Sketch, id: string, o: Pt, tip: Pt, text: string): void {
  const dx = tip.x - o.x;
  const dy = tip.y - o.y;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;
  const side = ny >= 0 ? 1 : -1; // towards the bottom of the stage
  sk.text(id, (o.x + tip.x) / 2 + nx * side * 2.6, (o.y + tip.y) / 2 + ny * side * 2.6, text, { anchor: nx * side > 0.35 ? "start" : nx * side < -0.35 ? "end" : "middle" });
}
/** The vector an arrow of the drawing shows, from the scale bar; undefined when the arrow or the bar is missing. */
function drawnVector(r: DrawResult, id: string): Pt | undefined {
  const a = arrowBy(r, id);
  const s = readScale(r);
  return a && s !== undefined ? vectorOf(a, s) : undefined;
}
function checkVector(r: DrawResult, id: string, want: Pt, name: string, perUnit: number): string[] {
  const v = drawnVector(r, id);
  if (!v) return [`${name}: the arrow or the scale bar is missing`];
  const tol = 0.02 * perUnit + 1e-9 * Math.max(1, Math.hypot(want.x, want.y));
  return near(v.x, want.x, tol) && near(v.y, want.y, tol) ? [] : [`${name}: the arrow shows (${v.x.toFixed(3)}, ${v.y.toFixed(3)}) and the inputs give (${want.x.toFixed(3)}, ${want.y.toFixed(3)})`];
}
const scaleOf = (r: DrawResult): number => readScale(r) ?? NaN;

// ---- vector addition -------------------------------------------------------------------------------------------------------------------------------------------------------------
export const vectorArrows = physicsDrawer("p_vector", "vector_arrows", {
  covers: ["Force and velocity vectors, parallelogram addition"],
  readouts(p) {
    const v = vectorSum(p);
    const bk = p.op === "subtract" ? "B rev" : "B";
    const out: Readout[] = [
      { key: "A", value: p.a_mag, unit: p.unit }, { key: "A angle", value: wrap360(p.a_deg), unit: "deg" },
      { key: bk, value: p.b_mag, unit: p.unit }, { key: `${bk} angle`, value: angOf(v.b), unit: "deg" },
      { key: "R", value: v.mag, unit: p.unit }, { key: "R angle", value: v.ang, unit: "deg" },
    ];
    if (p.components) out.push({ key: "Rx", value: v.r.x, unit: p.unit }, { key: "Ry", value: v.r.y, unit: p.unit });
    return out;
  },
  draw(sk, p) {
    const v = vectorSum(p);
    const pts = [{ x: 0, y: 0 }, v.a, v.b, v.r];
    const xs = pts.map((q) => q.x);
    const ys = pts.map((q) => q.y);
    const [minX, maxX, minY, maxY] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
    const w = sk.L.pic.w - 10;
    const h = sk.L.pic.h - 11;
    const pu = fitScale(maxX - minX, maxY - minY, w, h);
    const o = { x: sk.L.pic.x + 5 + (w - (maxX - minX) / pu) / 2 - minX / pu, y: sk.L.pic.y + 4 + (h - (maxY - minY) / pu) / 2 + maxY / pu };
    const to = (q: Pt): Pt => ({ x: o.x + q.x / pu, y: o.y - q.y / pu });
    const a = to(v.a);
    const rr = to(v.r);
    const b = to(v.b);
    sk.path("pg", `M${r1(a.x)} ${r1(a.y)}L${r1(rr.x)} ${r1(rr.y)}M${r1(b.x)} ${r1(b.y)}L${r1(rr.x)} ${r1(rr.y)}`, { color: "soft", width: 0.2, dash: true, how: "fade" });
    labelAt(sk, "ta", o, vec(sk, "va", o, v.a, pu), "A");
    labelAt(sk, "tb", o, vec(sk, "vb", o, v.b, pu), p.op === "subtract" ? "B rev" : "B");
    labelAt(sk, "tr", o, vec(sk, "vr", o, v.r, pu, { width: 0.6 }), "R");
    if (p.components) {
      vec(sk, "cx", o, { x: v.r.x, y: 0 }, pu, { dash: true, width: 0.3 });
      vec(sk, "cy", { x: o.x + v.r.x / pu, y: o.y }, { x: 0, y: v.r.y }, pu, { dash: true, width: 0.3 });
    }
    drawScaleBar(sk, sk.L.pic.x + 1, sk.L.pic.y + sk.L.pic.h - 1.6, pu, p.unit);
  },
  check(r, p) {
    const v = vectorSum(p);
    const pu = scaleOf(r);
    const out = [...checkVector(r, "va", v.a, "A", pu), ...checkVector(r, "vb", v.b, "B", pu), ...checkVector(r, "vr", v.r, "R", pu)];
    const [a, b, s] = [arrowBy(r, "va"), arrowBy(r, "vb"), arrowBy(r, "vr")];
    if (a && b && s && (!near(a.x1, b.x1, 0.01) || !near(a.y1, b.y1, 0.01) || !near(a.x1, s.x1, 0.01) || !near(a.y1, s.y1, 0.01))) out.push("the arrows do not start at one point");
    const dr = drawnVector(r, "vr");
    const da = drawnVector(r, "va");
    const db = drawnVector(r, "vb");
    if (da && db && dr && (!near(da.x + db.x, dr.x, 0.03 * pu) || !near(da.y + db.y, dr.y, 0.03 * pu))) out.push("the drawn resultant is not the sum of the drawn arrows");
    if (p.components) out.push(...checkVector(r, "cx", { x: v.r.x, y: 0 }, "Rx", pu), ...checkVector(r, "cy", { x: 0, y: v.r.y }, "Ry", pu));
    return out;
  },
});

// ---- free-body diagram ---------------------------------------------------------------------------------------------------------------------------------------------------------------
type Fbd = { body: string; forces: Array<{ key: string; kind: keyof typeof DEFAULT_FORCE_DEG; mag: number; deg: number }>; surface: number };
const FORCE_NAMES: Record<string, string> = { weight: "Weight", normal: "Normal", friction: "Friction", tension: "Tension", applied: "Applied", drag: "Drag", spring: "Spring", buoyancy: "Buoyancy" };
export const MAX_FBD_FORCES = 6;
function fbdParams(spec: { body: string; surfaceAngle?: { value: number }; forces: Array<{ kind: keyof typeof DEFAULT_FORCE_DEG; magnitude: { value: number }; angle?: { value: number } }> }): Fbd {
  const surface = spec.surfaceAngle?.value ?? 0;
  const seen: Record<string, number> = {};
  return {
    body: spec.body,
    surface,
    forces: spec.forces.map((f) => {
      const n = (seen[f.kind] = (seen[f.kind] ?? 0) + 1);
      const base = DEFAULT_FORCE_DEG[f.kind];
      const d = f.angle?.value ?? (f.kind === "normal" || f.kind === "friction" || f.kind === "applied" ? base + surface : base);
      return { key: n === 1 ? FORCE_NAMES[f.kind]! : `${FORCE_NAMES[f.kind]!} ${n}`, kind: f.kind, mag: f.magnitude.value, deg: wrap360(d) };
    }),
  };
}
const fbdNet = (p: Fbd) => netForce(p.forces.map((f) => ({ magnitude: f.mag, deg: f.deg })));
export const freeBodyDrawer = kindDrawer(
  "free_body",
  "free_body_diagram",
  (s) => s.forces.length <= MAX_FBD_FORCES && s.forces.every((f) => f.magnitude.unit === "N" && f.magnitude.value > 0 && (f.angle === undefined || f.angle.unit === "deg")) && (s.surfaceAngle === undefined || s.surfaceAngle.unit === "deg"),
  fbdParams,
  {
    covers: ["Free-body diagram with balance check"],
    readouts(p) {
      const n = fbdNet(p);
      return [
        ...p.forces.map((f): Readout => ({ key: f.key, value: f.mag, unit: "N" })),
        { key: "Net force", value: n.balanced ? 0 : n.mag, unit: "N" },
        ...(n.balanced ? [] : [{ key: "Net angle", value: n.ang, unit: "deg" } as Readout]),
        { key: "Result", word: n.balanced ? "balanced" : "unbalanced" },
      ];
    },
    inline: (p) => p.forces.map((f) => f.key),
    draw(sk, p, all) {
      const n = fbdNet(p);
      const c = { x: sk.L.pic.x + sk.L.pic.w / 2, y: sk.L.pic.y + (sk.L.pic.h - 4) / 2 };
      if (p.body === "ball" || p.body === "pendulum_bob") sk.circle("bd", c.x, c.y, 2.6, { fill: "soft", fillOpacity: 0.25 });
      else sk.rect("bd", c.x - 4, c.y - (p.body === "person" ? 4 : 2.5), 8, p.body === "person" ? 8 : 5, { fill: "soft", fillOpacity: 0.25 });
      const maxMag = Math.max(...p.forces.map((f) => f.mag), n.mag);
      const lim = Math.min(sk.L.pic.w / 2 - 19, sk.L.pic.h / 2 - 5.5);
      const pu = fitScale(maxMag, 0, lim, 1);
      // an arrow starts where its direction leaves the body, so the arrows do not pile up inside it; its length is still the force
      const half = p.body === "ball" || p.body === "pendulum_bob" ? { w: 2.6, h: 2.6, round: true } : { w: 4, h: p.body === "person" ? 4 : 2.5, round: false };
      const edge = (u: Pt): number => (half.round ? half.w : Math.min(half.w / Math.max(Math.abs(u.x), 1e-9), half.h / Math.max(Math.abs(u.y), 1e-9)));
      p.forces.forEach((f, i) => {
        const v = polar(f.mag, f.deg);
        const u = { x: Math.cos(rad(f.deg)), y: -Math.sin(rad(f.deg)) };
        const e = edge(u);
        const tail = { x: c.x + u.x * e, y: c.y + u.y * e };
        const tip = vec(sk, `f${i}`, tail, v, pu);
        const r = all[i]!;
        sk.readoutAt(i, r, tip.x + u.x * 1.6, tip.y + u.y * 1.6 + (u.y > 0.5 ? 0.6 : u.y < -0.5 ? -0.6 : 0), u.x > 0.35 ? "start" : u.x < -0.35 ? "end" : "middle");
      });
      if (!n.balanced) {
        // the net force is drawn in the widest gap between the forces, parallel to its own direction, so it is not hidden by the arrows that make it
        const dirs = [...p.forces.map((f) => f.deg)].sort((x, y) => x - y);
        let gap = { size: -1, mid: 45 };
        dirs.forEach((d0, i) => {
          const d1 = i + 1 < dirs.length ? dirs[i + 1]! : dirs[0]! + 360;
          if (d1 - d0 > gap.size) gap = { size: d1 - d0, mid: d0 + (d1 - d0) / 2 };
        });
        const tail = { x: c.x + Math.cos(rad(gap.mid)) * 9.5, y: c.y - Math.sin(rad(gap.mid)) * 9.5 };
        labelAt(sk, "tn", tail, vec(sk, "fn", tail, n.net, pu, { dash: true, width: 0.6 }), "Net");
      }
      drawScaleBar(sk, sk.L.pic.x + 1, sk.L.pic.y + sk.L.pic.h - 1.6, pu, "N");
    },
    check(r, p) {
      const n = fbdNet(p);
      const pu = scaleOf(r);
      const out = p.forces.flatMap((f, i) => checkVector(r, `f${i}`, polar(f.mag, f.deg), f.key, pu));
      // the net force is the sum of the arrows that were drawn, never a number that was typed
      const drawn = p.forces.map((_, i) => drawnVector(r, `f${i}`));
      if (drawn.every((d): d is Pt => d !== undefined)) {
        const sum = { x: drawn.reduce((s, d) => s + d.x, 0), y: drawn.reduce((s, d) => s + d.y, 0) };
        const shown = parseReadouts(r).get("Net force");
        const sumMag = magOf(sum);
        const tol = 0.03 * pu * p.forces.length + 1e-9;
        if (shown?.value !== undefined && !near(shown.value, sumMag, tol)) out.push("the printed net force is not the sum of the drawn arrows");
        const netArrow = drawnVector(r, "fn");
        if (n.balanced) {
          if (netArrow) out.push("a balanced diagram draws no net arrow");
          if (sumMag > tol) out.push("the arrows do not balance and the diagram says they do");
        } else if (!netArrow) out.push("the net arrow is missing");
        else if (!near(netArrow.x, sum.x, tol) || !near(netArrow.y, sum.y, tol)) out.push("the net arrow points the wrong way or has the wrong length");
      }
      return out;
    },
  },
);

// ---- inclined plane ----------------------------------------------------------------------------------------------------------------------------------------------------------------
export const inclinedPlane = physicsDrawer("p_incline", "inclined_plane", {
  covers: ["Inclined plane with force components"],
  readouts(p) {
    const f = incline(p);
    return [
      { key: "Mass", value: p.mass_kg, unit: "kg" }, { key: "Angle", value: p.angle_deg, unit: "deg" }, ...(p.mu > 0 ? [{ key: "mu", value: p.mu, unit: "" } as Readout] : []), { key: "Weight", value: f.w, unit: "N" }, { key: "Along slope", value: f.along, unit: "N" },
      { key: "Normal", value: f.normal, unit: "N" }, ...(p.mu > 0 ? [{ key: "Friction", value: f.friction, unit: "N" } as Readout] : []),
      { key: "Net force", value: f.net, unit: "N" }, { key: "a", value: f.a, unit: "m/s^2" },
    ];
  },
  draw(sk, p) {
    const f = incline(p);
    const th = rad(p.angle_deg);
    const pic = sk.L.pic;
    const lb = Math.min(pic.w * 0.7, (pic.h - 11) / Math.tan(th));
    const yb = pic.y + pic.h - 3.5;
    const x0 = pic.x + 1;
    const [p0, p1, p2] = [{ x: x0, y: yb }, { x: x0 + lb, y: yb }, { x: x0 + lb, y: yb - lb * Math.tan(th) }];
    sk.polygon("tr", [[p0.x, p0.y], [p1.x, p1.y], [p2.x, p2.y]], { fill: "soft", fillOpacity: 0.15, width: 0.4 });
    const s = { x: Math.cos(th), y: -Math.sin(th) }; // up the slope, on the stage
    const n = { x: -Math.sin(th), y: -Math.cos(th) }; // out of the slope
    const d = (0.55 * lb) / Math.cos(th);
    const c = { x: p0.x + s.x * d + n.x * 2, y: p0.y + s.y * d + n.y * 2 };
    const corner = (a: number, b: number): [number, number] => [c.x + s.x * a + n.x * b, c.y + s.y * a + n.y * b];
    sk.polygon("bl", [corner(-3, -2), corner(3, -2), corner(3, 2), corner(-3, 2)], { fill: "soft", fillOpacity: 0.3, width: 0.4 });
    const pu = fitScale(f.w, 0, 11, 1);
    const up = { x: Math.cos(th), y: Math.sin(th) }; // up the slope, physical
    const out = { x: -Math.sin(th), y: Math.cos(th) };
    vec(sk, "aw", c, { x: 0, y: -f.w }, pu);
    sk.text("tw", c.x - 1.2, c.y + f.w / pu + 1.4, "W", { anchor: "end" });
    labelAt(sk, "tn", c, vec(sk, "an", c, { x: out.x * f.normal, y: out.y * f.normal }, pu), "N");
    if (p.mu > 0) labelAt(sk, "tf", c, vec(sk, "af", c, { x: up.x * f.friction, y: up.y * f.friction }, pu), "f");
    labelAt(sk, "tp", c, vec(sk, "ap", c, { x: -up.x * f.along, y: -up.y * f.along }, pu, { dash: true, width: 0.3 }), "W_par");
    labelAt(sk, "tq", c, vec(sk, "aq", c, { x: -out.x * f.perp, y: -out.y * f.perp }, pu, { dash: true, width: 0.3 }), "W_perp");
    drawScaleBar(sk, pic.x + 1, pic.y + 1.6, pu, "N");
  },
  check(r, p) {
    const f = incline(p);
    const th = rad(p.angle_deg);
    const pu = scaleOf(r);
    const out: string[] = [];
    const tri = (shapeBy(r, "tr")?.points ?? []) as Array<[number, number]>;
    if (tri.length !== 3) return ["the slope is missing"];
    const slope = deg(Math.atan2(tri[1]![1] - tri[2]![1], tri[1]![0] - tri[0]![0]));
    if (!near(slope, p.angle_deg, 0.35)) out.push(`the drawn slope is ${slope.toFixed(2)} degrees and the inputs give ${p.angle_deg}`);
    const up = { x: Math.cos(th), y: Math.sin(th) };
    const out_ = { x: -Math.sin(th), y: Math.cos(th) };
    out.push(...checkVector(r, "aw", { x: 0, y: -f.w }, "Weight", pu), ...checkVector(r, "an", { x: out_.x * f.normal, y: out_.y * f.normal }, "Normal", pu));
    out.push(...checkVector(r, "ap", { x: -up.x * f.along, y: -up.y * f.along }, "W_par", pu), ...checkVector(r, "aq", { x: -out_.x * f.perp, y: -out_.y * f.perp }, "W_perp", pu));
    if (p.mu > 0) out.push(...checkVector(r, "af", { x: up.x * f.friction, y: up.y * f.friction }, "friction", pu));
    const [w, a, b] = [drawnVector(r, "aw"), drawnVector(r, "ap"), drawnVector(r, "aq")];
    if (w && a && b && (!near(a.x + b.x, w.x, 0.03 * pu) || !near(a.y + b.y, w.y, 0.03 * pu))) out.push("the two components do not add up to the weight");
    return out;
  },
});

// ---- circular motion --------------------------------------------------------------------------------------------------------------------------------------------------------------
export const circularMotion = physicsDrawer("p_circular", "circular_motion", {
  covers: ["Circular motion, centripetal vector"],
  readouts(p) {
    const c = circular(p);
    return [
      { key: "Mass", value: p.mass_kg, unit: "kg" }, { key: "r", value: p.radius, unit: "m" }, { key: "v", value: p.speed, unit: "m/s" }, { key: "omega", value: c.omega, unit: "rad/s" },
      { key: "T", value: c.T, unit: "s" }, { key: "ac", value: c.ac, unit: "m/s^2" }, { key: "Fc", value: c.Fc, unit: "N" }, { key: "Arrows", word: "direction only" },
    ];
  },
  draw(sk, p) {
    const pic = sk.L.pic;
    const c = { x: pic.x + pic.w / 2, y: pic.y + pic.h / 2 + 0.5 };
    const R = Math.min(pic.w - 20, pic.h - 11) * 0.5;
    const a = rad(p.at_deg);
    const body = { x: c.x + R * Math.cos(a), y: c.y - R * Math.sin(a) };
    sk.circle("ci", c.x, c.y, R, { width: 0.35 });
    sk.circle("cd", c.x, c.y, 0.5, { fill: "ink" });
    sk.path("rl", `M${r1(c.x)} ${r1(c.y)}L${r1(body.x)} ${r1(body.y)}`, { color: "soft", dash: true, width: 0.25 });
    sk.text("tr", (c.x + body.x) / 2 - Math.sin(a) * 1.6 * -1, (c.y + body.y) / 2 + Math.cos(a) * 1.6, "r", { anchor: "middle" });
    sk.circle("bd", body.x, body.y, 1.3, { fill: "purple", fillOpacity: 0.7 });
    const tv = { x: -Math.sin(a), y: -Math.cos(a) };
    const tc = { x: -Math.cos(a), y: Math.sin(a) };
    const vt = { x: body.x + tv.x * 8, y: body.y + tv.y * 8 };
    const ct = { x: body.x + tc.x * 6, y: body.y + tc.y * 6 };
    sk.arrow("av", body.x, body.y, vt.x, vt.y, { width: 0.5 });
    labelAt(sk, "tv", body, vt, "v");
    sk.arrow("ac", body.x, body.y, ct.x, ct.y, { width: 0.5, dash: true });
    labelAt(sk, "tc", body, ct, "ac");
  },
  check(r, p) {
    const out: string[] = [];
    const ci = shapeBy(r, "ci");
    const bd = shapeBy(r, "bd");
    const av = arrowBy(r, "av");
    const ac = arrowBy(r, "ac");
    if (!ci || !bd || !av || !ac) return ["the circle, the body or an arrow is missing"];
    const c = { x: Number(ci.cx), y: Number(ci.cy) };
    const b = { x: Number(bd.cx), y: Number(bd.cy) };
    const at = wrap360(deg(Math.atan2(-(b.y - c.y), b.x - c.x)));
    if (angDiff(at, p.at_deg) > 0.6) out.push(`the body is at ${at.toFixed(1)} degrees and the inputs give ${p.at_deg}`);
    if (!near(Math.hypot(b.x - c.x, b.y - c.y), Number(ci.r), 0.05)) out.push("the body is not on the circle");
    const toCentre = angOfStage(c.x - b.x, c.y - b.y);
    if (angDiff(angOfStage(ac.x2 - ac.x1, ac.y2 - ac.y1), toCentre) > 1) out.push("the centripetal arrow does not point to the centre");
    const rad_ = { x: b.x - c.x, y: b.y - c.y };
    const vdir = { x: av.x2 - av.x1, y: av.y2 - av.y1 };
    if (Math.abs(rad_.x * vdir.x + rad_.y * vdir.y) > 0.02 * Math.hypot(rad_.x, rad_.y) * Math.hypot(vdir.x, vdir.y)) out.push("the velocity arrow is not along the tangent");
    if (rad_.x * vdir.y - rad_.y * vdir.x > 0) out.push("the velocity arrow goes round the wrong way");
    return out;
  },
});
const angOfStage = (dx: number, dy: number): number => wrap360(deg(Math.atan2(-dy, dx)));

// ---- levers -------------------------------------------------------------------------------------------------------------------------------------------------------------------------
export const leverFigure = physicsDrawer("p_lever", "lever", {
  covers: ["Levers, pulleys, simple machines"],
  readouts(p) {
    const l = lever(p);
    return [
      { key: "Class", value: p.lever_class, unit: "" }, { key: "Load", value: p.load, unit: "N" }, { key: "Load arm", value: p.load_arm, unit: "m" }, { key: "Effort arm", value: p.effort_arm, unit: "m" },
      { key: "Effort", value: l.effort, unit: "N" }, { key: "MA", value: l.ma, unit: "" },
    ];
  },
  draw(sk, p) {
    const l = lever(p);
    const pic = sk.L.pic;
    const span = p.lever_class === 1 ? p.load_arm + p.effort_arm : Math.max(p.load_arm, p.effort_arm);
    const sc = (pic.w - 8) / span; // stage units per metre
    const y = pic.y + pic.h * 0.55;
    const fx = p.lever_class === 1 ? pic.x + 4 + p.load_arm * sc : pic.x + 4;
    const loadX = p.lever_class === 1 ? fx - p.load_arm * sc : fx + p.load_arm * sc;
    const effX = p.lever_class === 1 ? fx + p.effort_arm * sc : fx + p.effort_arm * sc;
    const xs = [fx, loadX, effX];
    sk.path("bm", `M${r1(Math.min(...xs) - 0.5)} ${r1(y)}L${r1(Math.max(...xs) + 0.5)} ${r1(y)}`, { width: 0.8 });
    sk.polygon("fu", [[fx, y + 0.4], [fx - 2, y + 4.4], [fx + 2, y + 4.4]], { fill: "soft", fillOpacity: 0.3 });
    const pu = fitScale(Math.max(p.load, l.effort), 0, 9, 1);
    labelAt(sk, "tl", { x: loadX, y }, vec(sk, "al", { x: loadX, y }, { x: 0, y: -p.load }, pu), "Load");
    const up = p.lever_class === 1 ? -1 : 1;
    labelAt(sk, "te", { x: effX, y }, vec(sk, "ae", { x: effX, y }, { x: 0, y: up * l.effort }, pu), "Effort");
    drawScaleBar(sk, pic.x + 1, pic.y + pic.h - 1.6, pu, "N");
  },
  check(r, p) {
    const l = lever(p);
    const out: string[] = [];
    const bm = pointsOf(shapeBy(r, "bm")?.d);
    const fu = shapeBy(r, "fu")?.points as Array<[number, number]> | undefined;
    const al = arrowBy(r, "al");
    const ae = arrowBy(r, "ae");
    const pu = scaleOf(r);
    if (bm.length !== 2 || !fu || !al || !ae) return ["the beam, the fulcrum or an arrow is missing"];
    const fx = fu[0]![0];
    const armLoad = Math.abs(al.x1 - fx);
    const armEffort = Math.abs(ae.x1 - fx);
    if (!near(armLoad / armEffort, p.load_arm / p.effort_arm, 0.01 * (p.load_arm / p.effort_arm) + 0.02)) out.push("the drawn arms are not in the ratio of the inputs");
    const fl = Math.abs(al.y2 - al.y1) * pu;
    const fe = Math.abs(ae.y2 - ae.y1) * pu;
    if (!near(fl, p.load, 0.03 * pu)) out.push("the load arrow is not the load");
    if (!near(fe, l.effort, 0.03 * pu)) out.push("the effort arrow is not the effort that balances the load");
    // the drawn moments balance: load x its arm = effort x its arm
    if (!near(fl * armLoad, fe * armEffort, 0.03 * pu * Math.max(armLoad, armEffort) + 1e-9)) out.push("the drawn moments about the fulcrum do not balance");
    const downLoad = al.y2 > al.y1;
    const effUp = ae.y2 < ae.y1;
    if (!downLoad) out.push("the load arrow must point down");
    if ((p.lever_class === 1 && effUp) || (p.lever_class !== 1 && !effUp)) out.push("the effort arrow points the wrong way for this class of lever");
    return out;
  },
});

// ---- rotation: torque, centre of mass, moment of inertia ----------------------------------------------------------------------------------------------------------
export const rotationFigure = physicsDrawer("p_rotation", "rotation", {
  covers: ["Torque, centre of mass, rolling, moment of inertia"],
  readouts(p) {
    if (p.mode === "torque") return [{ key: "F", value: p.force, unit: "N" }, { key: "r", value: p.arm, unit: "m" }, { key: "Angle", value: p.angle_deg, unit: "deg" }, { key: "F perp", value: p.force * Math.sin(rad(p.angle_deg)), unit: "N" }, { key: "Torque", value: torque(p), unit: "N.m" }];
    if (p.mode === "balance") {
      const items = [{ m: p.m1, x: p.x1 }, { m: p.m2, x: p.x2 }, ...(p.m3 > 0 ? [{ m: p.m3, x: p.x3 }] : [])];
      return [...items.flatMap((i, k): Readout[] => [{ key: `m${k + 1}`, value: i.m, unit: "kg" }, { key: `x${k + 1}`, value: i.x, unit: "m" }]), { key: "x centre", value: centreOfMass(items), unit: "m" }];
    }
    return [{ key: "Shape", word: p.shape }, { key: "Mass", value: p.mass_kg, unit: "kg" }, { key: p.shape === "rod" ? "Length" : "Radius", value: p.size, unit: "m" }, { key: "Formula", word: p.shape === "disc" ? "1/2 m r^2" : p.shape === "ring" ? "m r^2" : "1/12 m L^2" }, { key: "I", value: momentOfInertia(p.shape, p.mass_kg, p.size), unit: "kg.m^2" }];
  },
  draw(sk, p) {
    const pic = sk.L.pic;
    if (p.mode === "torque") {
      const piv = { x: pic.x + 6, y: pic.y + pic.h * 0.6 };
      const len = Math.min(pic.w * 0.5, 30);
      const end = { x: piv.x + len, y: piv.y };
      sk.path("ar", `M${r1(piv.x)} ${r1(piv.y)}L${r1(end.x)} ${r1(end.y)}`, { width: 0.9 });
      sk.circle("pv", piv.x, piv.y, 0.9, { fill: "ink" });
      const pu = fitScale(p.force, 0, 11, 1);
      const th = p.angle_deg;
      labelAt(sk, "tf", end, vec(sk, "fa", end, polar(p.force, th), pu), "F");
      vec(sk, "fp", end, { x: 0, y: p.force * Math.sin(rad(th)) }, pu, { dash: true, width: 0.3 });
      drawScaleBar(sk, pic.x + 1, pic.y + pic.h - 1.6, pu, "N");
    } else if (p.mode === "balance") {
      const items = [{ m: p.m1, x: p.x1 }, { m: p.m2, x: p.x2 }, ...(p.m3 > 0 ? [{ m: p.m3, x: p.x3 }] : [])];
      const w = pic.w - 6;
      const mpu = 10 / w; // the beam is 10 m long, drawn the full width of the picture
      const y = pic.y + pic.h * 0.5;
      const x0 = pic.x + 3;
      sk.path("bm", `M${r1(x0)} ${r1(y)}L${r1(x0 + w)} ${r1(y)}`, { width: 0.8 });
      const mmax = Math.max(...items.map((i) => i.m));
      items.forEach((i, k) => {
        const side = 5 * Math.sqrt(i.m / mmax);
        sk.rect(`m${k}`, x0 + i.x / mpu - side / 2, y - side, side, side, { fill: "soft", fillOpacity: 0.35 });
        sk.text(`n${k}`, x0 + i.x / mpu, y - 6.4, String(k + 1), { anchor: "middle" });
      });
      const xc = x0 + centreOfMass(items) / mpu;
      sk.polygon("fu", [[xc, y + 0.4], [xc - 2, y + 4.4], [xc + 2, y + 4.4]], { fill: "soft", fillOpacity: 0.3 });
      sk.path("sb", `M${r1(pic.x + 1)} ${r1(pic.y + pic.h - 1.6)}L${r1(pic.x + 1 + 2 / mpu)} ${r1(pic.y + pic.h - 1.6)}`, { width: 0.5, how: "fade" });
      sk.text("sc", pic.x + 2 / mpu + 1.8, pic.y + pic.h - 1.6, "bar = 2 m");
    } else {
      const c = { x: pic.x + pic.w * 0.42, y: pic.y + pic.h * 0.5 };
      const half = Math.min(pic.w * 0.3, pic.h * 0.35, 10);
      if (p.shape === "rod") sk.rect("sh", c.x - half, c.y - 1.2, 2 * half, 2.4, { fill: "soft", fillOpacity: 0.3 });
      else sk.circle("sh", c.x, c.y, half, p.shape === "ring" ? { width: 1.4 } : { fill: "soft", fillOpacity: 0.3 });
      sk.circle("ax", c.x, c.y, 0.7, { fill: "ink" });
      const perUnit = p.size / (p.shape === "rod" ? 2 * half : half);
      drawScaleBar(sk, pic.x + 1, pic.y + pic.h - 1.6, perUnit, "m");
    }
  },
  check(r, p) {
    const out: string[] = [];
    if (p.mode === "torque") {
      const pu = scaleOf(r);
      out.push(...checkVector(r, "fa", polar(p.force, p.angle_deg), "F", pu), ...checkVector(r, "fp", { x: 0, y: p.force * Math.sin(rad(p.angle_deg)) }, "F perp", pu));
      const ar = pointsOf(shapeBy(r, "ar")?.d);
      const fa = arrowBy(r, "fa");
      if (ar.length === 2 && fa && (!near(fa.x1, ar[1]![0], 0.06) || !near(fa.y1, ar[1]![1], 0.06))) out.push("the force does not act at the end of the lever arm");
    } else if (p.mode === "balance") {
      const items = [{ m: p.m1, x: p.x1 }, { m: p.m2, x: p.x2 }, ...(p.m3 > 0 ? [{ m: p.m3, x: p.x3 }] : [])];
      const bm = pointsOf(shapeBy(r, "bm")?.d);
      const bar = readScale(r);
      const fu = shapeBy(r, "fu")?.points as Array<[number, number]> | undefined;
      if (bm.length !== 2 || bar === undefined || !fu) return ["the beam, the scale bar or the fulcrum is missing"];
      const mpu = bar;
      const x0 = bm[0]![0];
      const rects = items.map((_, k) => shapeBy(r, `m${k}`));
      if (rects.some((q) => !q)) return ["a mass is missing"];
      const pos = rects.map((q) => (Number(q!.x) + Number(q!.w) / 2 - x0) * mpu);
      const sides = rects.map((q) => Number(q!.w));
      const mmax = Math.max(...items.map((i) => i.m));
      const sidemax = Math.max(...sides);
      items.forEach((i, k) => {
        if (!near(pos[k]!, i.x, 0.06)) out.push(`mass ${k + 1} is drawn at ${pos[k]!.toFixed(2)} m and the inputs give ${i.x}`);
        const mRead = mmax * (sides[k]! / sidemax) ** 2;
        if (!near(mRead, i.m, 0.03 * mmax + 0.02 * mmax)) out.push(`mass ${k + 1} is drawn with the wrong size`);
      });
      const xf = (fu[0]![0] - x0) * mpu;
      if (!near(xf, centreOfMass(items), 0.06)) out.push("the pivot is not at the centre of mass of the drawn masses");
    } else {
      const sh = shapeBy(r, "sh");
      if (!sh || sh.kind !== (p.shape === "rod" ? "rect" : "circle")) out.push("the drawn shape is not the one asked for");
      const bar = readScale(r);
      if (sh && bar !== undefined) {
        const size = p.shape === "rod" ? Number(sh.w) * bar : Number(sh.r) * bar;
        if (!near(size, p.size, 0.03 * p.size + 1e-9)) out.push("the drawn size is not the size in the inputs");
      }
    }
    return out;
  },
});

// ---- collision -------------------------------------------------------------------------------------------------------------------------------------------------------------------
export const collisionFigure = physicsDrawer("p_collision", "collision_momentum", {
  covers: ["Collisions and momentum on a track"],
  readouts(p) {
    const c = collision(p);
    return [
      { key: "p1 before", value: c.pBefore[0], unit: "kg.m/s" }, { key: "p2 before", value: c.pBefore[1], unit: "kg.m/s" }, { key: "p1 after", value: c.pAfter[0], unit: "kg.m/s" }, { key: "p2 after", value: c.pAfter[1], unit: "kg.m/s" },
      { key: "p total", value: c.pTotal, unit: "kg.m/s" }, { key: "KE before", value: c.keBefore, unit: "J" }, { key: "KE after", value: c.keAfter, unit: "J" },
    ];
  },
  draw(sk, p) {
    const c = collision(p);
    const pic = sk.L.pic;
    const vals = [...c.pBefore, c.pTotal, ...c.pAfter, c.pTotal];
    const pu = fitScale(Math.max(...vals.map(Math.abs)), 0, (pic.h - 10) / 2, 1);
    const zy = r1(pic.y + 3 + (pic.h - 10) / 2 + 1);
    const half = (pic.w - 4) / 2;
    ["Before (1, 2, total)", "After (1, 2, total)"].forEach((t, side) => {
      const x0 = pic.x + 1 + side * (half + 2);
      sk.text(`h${side}`, x0, pic.y + 1.2, t);
      sk.path(`z${side}`, `M${r1(x0)} ${r1(zy)}L${r1(x0 + half - 1)} ${r1(zy)}`, { color: "soft", width: 0.3, how: "fade" });
      const v = side === 0 ? [c.pBefore[0], c.pBefore[1], c.pTotal] : [c.pAfter[0], c.pAfter[1], c.pTotal];
      v.forEach((val, i) => {
        const h = Math.abs(val) / pu;
        sk.rect(`b${side}${i}`, x0 + 2 + i * 8, val >= 0 ? zy - h : zy, 5, h, { fill: i === 0 ? "blue" : i === 1 ? "orange" : "soft", fillOpacity: 0.45, width: 0.3 });
      });
    });
    drawScaleBar(sk, pic.x + 1, pic.y + pic.h - 1.6, pu, "kg.m/s");
  },
  check(r, p) {
    const c = collision(p);
    const out: string[] = [];
    const pu = scaleOf(r);
    const read = (side: number, i: number): number | undefined => {
      const b = shapeBy(r, `b${side}${i}`);
      const z = pointsOf(shapeBy(r, `z${side}`)?.d);
      if (!b || z.length !== 2) return undefined;
      const zy = z[0]![1];
      const top = Number(b.y);
      const h = Number(b.h);
      return h < 1e-9 ? 0 : near(top + h, zy, 0.02) ? h * pu : near(top, zy, 0.02) ? -h * pu : NaN;
    };
    const want = [[c.pBefore[0], c.pBefore[1], c.pTotal], [c.pAfter[0], c.pAfter[1], c.pTotal]];
    for (let side = 0; side < 2; side++)
      for (let i = 0; i < 3; i++) {
        const got = read(side, i);
        const w = want[side]![i]!;
        if (got === undefined || Number.isNaN(got) || !near(got, w, 0.04 * pu + 1e-9)) out.push(`the ${side === 0 ? "before" : "after"} bar ${i + 1} does not show ${w.toFixed(3)}`);
      }
    const [b0, b1, bt] = [read(0, 0), read(0, 1), read(0, 2)];
    const [a0, a1, at] = [read(1, 0), read(1, 1), read(1, 2)];
    if ([b0, b1, bt, a0, a1, at].every((x): x is number => typeof x === "number" && !Number.isNaN(x))) {
      const tol = 0.1 * pu + 1e-9;
      if (!near(b0! + b1!, bt!, tol) || !near(a0! + a1!, at!, tol)) out.push("a total bar is not the sum of the two bars");
      if (!near(bt!, at!, tol)) out.push("the momentum before and after the collision differ");
    }
    return out;
  },
});

// ---- fluid pressure ----------------------------------------------------------------------------------------------------------------------------------------------------------------
export const pressureFigure = physicsDrawer("p_pressure", "fluid_pressure", {
  covers: ["Fluid pressure, Pascal, buoyancy, manometer"],
  readouts(p) {
    if (p.mode === "depth") {
      const g = gaugePressure(p.density, p.g, p.depth) / 1000;
      return [{ key: "Depth", value: p.depth, unit: "m" }, { key: "Density", value: p.density, unit: "kg/m^3" }, { key: "Gauge P", value: g, unit: "kPa" }, ...(p.atmosphere ? [{ key: "Total P", value: g + ATM_PA / 1000, unit: "kPa" } as Readout] : [])];
    }
    if (p.mode === "hydraulic") {
      const h = hydraulic(p);
      return [{ key: "F in", value: p.force_in, unit: "N" }, { key: "A in", value: p.area_in, unit: "m^2" }, { key: "A out", value: p.area_out, unit: "m^2" }, { key: "Pressure", value: h.pressure / 1000, unit: "kPa" }, { key: "F out", value: h.force_out, unit: "N" }, { key: "MA", value: h.ma, unit: "" }];
    }
    const b = buoyancy(p);
    return [
      { key: "Weight", value: b.weight, unit: "N" }, { key: "Buoyant force", value: b.floats ? b.weight : b.fullBuoyancy, unit: "N" }, { key: "Object density", value: b.density, unit: "kg/m^3" }, { key: "Fluid density", value: p.fluid_density, unit: "kg/m^3" },
      { key: "Result", word: b.floats ? "floats" : "sinks" }, ...(b.floats ? [{ key: "Submerged", value: b.submergedFraction * 100, unit: "%" } as Readout] : []),
    ];
  },
  draw(sk, p) {
    const pic = sk.L.pic;
    if (p.mode === "depth") {
      const tank = { x: pic.x + 8, y: pic.y + 2, w: Math.min(pic.w - 12, 34), h: pic.h - 9 };
      sk.rect("tk", tank.x, tank.y, tank.w, tank.h, { fill: "blue", fillOpacity: 0.2, width: 0.4 });
      const g = gaugePressure(p.density, p.g, p.depth) / 1000;
      const pu = niceCeil(g / 12);
      [1 / 3, 2 / 3, 1].forEach((f, i) => {
        const y = tank.y + 1 + (tank.h - 2) * f * 0.92;
        sk.arrow(`pa${i}`, tank.x - (g * f) / pu, y, tank.x, y, { width: 0.5 });
      });
      sk.arrow("dp", tank.x + tank.w - 3, tank.y, tank.x + tank.w - 3, tank.y + 1 + (tank.h - 2) * 0.92, { dash: true, width: 0.4 });
      sk.text("td", tank.x + tank.w - 4.2, tank.y + tank.h / 2, "h", { anchor: "end" });
      drawScaleBar(sk, pic.x + 1, pic.y + pic.h - 1.6, pu, "kPa");
    } else if (p.mode === "hydraulic") {
      const dIn = 6;
      const dOut = Math.min(dIn * Math.sqrt(p.area_out / p.area_in), pic.w * 0.4);
      const dIn2 = (dOut / Math.sqrt(p.area_out / p.area_in)) || dIn;
      const base = pic.y + pic.h - 4;
      const x1 = pic.x + 6;
      const x2 = pic.x + pic.w - dOut - 6;
      sk.rect("c1", x1, base - 16, dIn2, 16, { fill: "blue", fillOpacity: 0.2 });
      sk.rect("c2", x2, base - 16, dOut, 16, { fill: "blue", fillOpacity: 0.2 });
      sk.path("pipe", `M${r1(x1)} ${r1(base)}L${r1(x2 + dOut)} ${r1(base)}`, { width: 0.4 });
      const h = hydraulic(p);
      const pu = fitScale(Math.max(p.force_in, h.force_out), 0, 9, 1);
      sk.arrow("fi", x1 + dIn2 / 2, base - 16 - p.force_in / pu, x1 + dIn2 / 2, base - 16, { width: 0.5 });
      sk.arrow("fo", x2 + dOut / 2, base - 16, x2 + dOut / 2, base - 16 - h.force_out / pu, { width: 0.5 });
      drawScaleBar(sk, pic.x + 1, pic.y + 1.6, pu, "N");
    } else {
      const b = buoyancy(p);
      const tank = { x: pic.x + 4, y: pic.y + 1, w: Math.min(pic.w - 8, 36), h: pic.h - 7 };
      const water = tank.y + tank.h * 0.35;
      sk.rect("tk", tank.x, tank.y, tank.w, tank.h, { width: 0.4 });
      sk.path("wl", `M${r1(tank.x)} ${r1(water)}L${r1(tank.x + tank.w)} ${r1(water)}`, { color: "purple", width: 0.4 });
      const bh = 10;
      const bw = 8;
      const top = b.floats ? water - bh * (1 - b.submergedFraction) : tank.y + tank.h - bh - 1;
      const cx = tank.x + tank.w / 2;
      sk.rect("ob", cx - bw / 2, top, bw, bh, { fill: "soft", fillOpacity: 0.35, width: 0.4 });
      const pu = fitScale(Math.max(b.weight, b.floats ? b.weight : b.fullBuoyancy), 0, 8, 1);
      const fb = b.floats ? b.weight : b.fullBuoyancy;
      sk.arrow("aw", cx, top + bh / 2, cx, top + bh / 2 + b.weight / pu, { width: 0.5 });
      sk.arrow("ab", cx + 2, top + bh / 2, cx + 2, top + bh / 2 - fb / pu, { width: 0.5, dash: true });
      drawScaleBar(sk, pic.x + 1, pic.y + pic.h - 1.6, pu, "N");
    }
  },
  check(r, p) {
    const out: string[] = [];
    const pu = scaleOf(r);
    if (p.mode === "depth") {
      const g = gaugePressure(p.density, p.g, p.depth) / 1000;
      [1 / 3, 2 / 3, 1].forEach((f, i) => {
        const a = arrowBy(r, `pa${i}`);
        if (!a) return void out.push("a pressure arrow is missing");
        if (!near((a.x2 - a.x1) * pu, g * f, 0.03 * pu)) out.push(`the pressure arrow at depth ${(f * 100).toFixed(0)}% is not in proportion to the depth`);
      });
      // the depth marker runs down from the surface of the liquid to the level of the deepest pressure arrow
      const dp = arrowBy(r, "dp");
      const tk = shapeBy(r, "tk");
      const deepest = arrowBy(r, "pa2");
      if (!dp || !tk || !deepest) out.push("the depth marker, the tank or an arrow is missing");
      else if (!(dp.y2 > dp.y1) || !near(dp.y1, Number(tk.y), 0.02) || !near(dp.y2, deepest.y1, 0.02)) out.push("the depth marker does not run from the surface down to the deepest arrow");
    } else if (p.mode === "hydraulic") {
      const h = hydraulic(p);
      const c1 = shapeBy(r, "c1");
      const c2 = shapeBy(r, "c2");
      const fi = arrowBy(r, "fi");
      if (!c1 || !c2 || !fi) return ["a piston or an arrow is missing"];
      const ratio = (Number(c2.w) / Number(c1.w)) ** 2;
      if (!near(ratio, p.area_out / p.area_in, 0.02 * ratio)) out.push("the drawn pistons are not in the ratio of the areas");
      const fo = arrowBy(r, "fo");
      if (!near((fi.y2 - fi.y1) * pu, p.force_in, 0.03 * pu)) out.push("the input force arrow is not the input force");
      if (!fo || !near((fo.y1 - fo.y2) * pu, h.force_out, 0.03 * pu)) out.push("the output force arrow is not the output force");
    } else {
      const b = buoyancy(p);
      const ob = shapeBy(r, "ob");
      const wl = pointsOf(shapeBy(r, "wl")?.d);
      const aw = arrowBy(r, "aw");
      const ab = arrowBy(r, "ab");
      if (!ob || wl.length !== 2 || !aw || !ab) return ["the block, the water line or an arrow is missing"];
      const sub = Math.min(1, Math.max(0, (Number(ob.y) + Number(ob.h) - wl[0]![1]) / Number(ob.h)));
      if (!near(sub, b.submergedFraction, 0.02)) out.push("the block is drawn with the wrong part under the water");
      if (!near((aw.y2 - aw.y1) * pu, b.weight, 0.03 * pu)) out.push("the weight arrow is not the weight");
      if (!near((ab.y1 - ab.y2) * pu, b.floats ? b.weight : b.fullBuoyancy, 0.03 * pu)) out.push("the buoyant force arrow is not the buoyant force");
      if (b.floats && !near((aw.y2 - aw.y1), (ab.y1 - ab.y2), 0.05)) out.push("a floating block has equal weight and buoyant force");
    }
    return out;
  },
});
