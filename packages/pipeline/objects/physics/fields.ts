import type { DrawResult } from "../registry";
import { K_COULOMB, MU0, coulomb, eField, fieldLine, forceOnWire, gaussFlux, generatorPeak, motionalEmf, potential, solenoidCentre, solenoidField, transformer, wireField, type Charge } from "./compute";
import { physicsDrawer } from "./define";
import { checkCurve, drawGraph, niceWindow, parseReadouts, r1, readGraph, readScale, shapeBy, type Readout, type Sketch } from "./kit";
import { angDiff, dot, drawScaleBar2, len, near, packPaths, ptsOf, seg, sub, subpaths, unit, type P } from "./kit-b";

/**
 * Electric and magnetic fields, charges, and electromagnetic induction (ADR 0109). A field line is traced from the field of the charges (or loops) by superposition and drawn as a polyline that
 * follows it; the read-back takes the DRAWN charges and the DRAWN lines, computes the field at the middle of every drawn segment from the drawn charges (by the same superposition, but at the
 * points the picture shows) and checks that each segment runs along it, the right way: out of a positive charge, into a negative one. A picture whose charges are swapped, whose lines are
 * mirrored or whose coil is reversed has lines that point the wrong way at the sample points, and fails.
 */
const NANO = 1e-9;
const LETTERS = "abcdefgh";
const pic = (sk: Sketch) => sk.L.pic;

/** Ramer-Douglas-Peucker: the fewest points of a polyline that stay within `tol` stage units of it. */
function rdp(pts: P[], tol: number): P[] {
  if (pts.length < 3) return pts;
  const a = pts[0]!;
  const b = pts[pts.length - 1]!;
  const d = unit(sub(b, a));
  let worst = 0;
  let at = 0;
  for (let i = 1; i < pts.length - 1; i++) {
    const dist = Math.abs((pts[i]![0] - a[0]) * d[1] - (pts[i]![1] - a[1]) * d[0]);
    if (dist > worst) [worst, at] = [dist, i];
  }
  if (worst <= tol) return [a, b];
  return [...rdp(pts.slice(0, at + 1), tol).slice(0, -1), ...rdp(pts.slice(at), tol)];
}
/** The polyline cut in two at its middle first, so that a line that closes on itself (its two ends meet) is not reduced to nothing, then simplified with a tolerance that grows until it has few enough points. */
const simplify = (pts: P[], maxPoints: number): P[] => {
  const m = Math.floor(pts.length / 2);
  let tol = 0.12;
  let out: P[] = [];
  for (let k = 0; k < 40; k++, tol *= 1.3) {
    out = [...rdp(pts.slice(0, m + 1), tol).slice(0, -1), ...rdp(pts.slice(m), tol)];
    if (out.length <= maxPoints) break;
  }
  return out;
};
const length = (pts: P[]): number => pts.slice(1).reduce((s, q, i) => s + len(sub(q, pts[i]!)), 0);
/** An arrowhead (three points: barb, tip, barb) in the middle of a polyline, pointing along it. */
function headOn(pts: P[], k = 0): P[] {
  const m = Math.min(pts.length - 2, Math.floor((pts.length - 1) * [0.5, 0.3, 0.7][k % 3]!));
  const a = pts[m]!;
  const b = pts[m + 1]!;
  const d = unit(sub(b, a));
  const tip: P = [(a[0] + b[0]) / 2 + d[0] * 0.8, (a[1] + b[1]) / 2 + d[1] * 0.8];
  const n: P = [-d[1], d[0]];
  return [[tip[0] - d[0] * 1.7 + n[0] * 0.9, tip[1] - d[1] * 1.7 + n[1] * 0.9], tip, [tip[0] - d[0] * 1.7 - n[0] * 0.9, tip[1] - d[1] * 1.7 - n[1] * 0.9]];
}
/** Draws polylines as the paths `l<letter>` (at most 560 characters each) and their arrowheads as `h<letter>`. */
function drawLines(sk: Sketch, lines: P[][]): void {
  packPaths(lines, r1).forEach((d, i) => sk.path(`l${LETTERS[i]}`, d, { width: 0.3 }));
  packPaths(lines.map((l, i) => headOn(l, i)), r1).forEach((d, i) => sk.path(`h${LETTERS[i]}`, d, { width: 0.3 }));
}
const readLines = (r: DrawResult, prefix: string): P[][] => LETTERS.split("").flatMap((c) => subpaths(shapeBy(r, `${prefix}${c}`)?.d));

// ---- electric field lines ---------------------------------------------------------------------------------------------------------------------------------------------------------------
type LinesP = { mode: "lines"; q1_nc: number; x1: number; y1: number; q2_nc: number; x2: number; y2: number; q3_nc?: number; x3?: number; y3?: number };
const chargesOf = (p: LinesP): Charge[] => [{ q: p.q1_nc * NANO, x: p.x1, y: p.y1 }, { q: p.q2_nc * NANO, x: p.x2, y: p.y2 }, ...(p.q3_nc !== undefined ? [{ q: p.q3_nc * NANO, x: p.x3!, y: p.y3! }] : [])];
function efFrame(chs: Charge[], pc: { x: number; y: number; w: number; h: number }) {
  const xs = chs.map((c) => c.x);
  const ys = chs.map((c) => c.y);
  const ext = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys), 0.4);
  const hx = (Math.max(...xs) - Math.min(...xs)) / 2 + 0.9 * ext;
  const hy = (Math.max(...ys) - Math.min(...ys)) / 2 + 0.9 * ext;
  const W = pc.w - 1;
  const H = pc.h - 4.8;
  const s = Math.min(W / (2 * hx), H / (2 * hy));
  const mx = (Math.max(...xs) + Math.min(...xs)) / 2;
  const my = (Math.max(...ys) + Math.min(...ys)) / 2;
  const cx = pc.x + 0.5 + W / 2;
  const cy = pc.y + 0.8 + H / 2;
  return { s, cx, cy, mx, my, X: (x: number): number => cx + (x - mx) * s, Y: (y: number): number => cy - (y - my) * s, box: { x: pc.x + 0.5, y: pc.y + 0.8, w: W, h: H } };
}
type EF = ReturnType<typeof efFrame>;
const MAX_LINES = 6;
function efLines(chs: Charge[], f: EF): P[][] {
  const qmax = Math.max(...chs.map((c) => Math.abs(c.q)));
  const hasPos = chs.some((c) => c.q > 0);
  const box = { x0: f.mx + (f.box.x - f.cx) / f.s, x1: f.mx + (f.box.x + f.box.w - f.cx) / f.s, y0: f.my - (f.box.y + f.box.h - f.cy) / f.s, y1: f.my - (f.box.y - f.cy) / f.s };
  const stopR = 2.1 / f.s;
  const out: P[][] = [];
  for (const c of chs) {
    const sign: 1 | -1 = c.q > 0 ? 1 : -1;
    const n = Math.max(3, Math.round((MAX_LINES * Math.abs(c.q)) / qmax));
    for (let k = 0; k < n; k++) {
      const a = (2 * Math.PI * k) / n + Math.PI / n;
      const seed = { x: c.x + (2.4 / f.s) * Math.cos(a), y: c.y + (2.4 / f.s) * Math.sin(a) };
      const dense = fieldLine(chs, seed, sign, 0.45 / f.s, 600, box, stopR);
      const endsOnPositive = sign === -1 && hasPos && chs.some((o) => o.q > 0 && Math.hypot(dense[dense.length - 1]!.x - o.x, dense[dense.length - 1]!.y - o.y) < stopR * 1.2);
      if (endsOnPositive) continue; // the same line is traced from the positive charge
      const st: P[] = dense.map((q) => [f.X(q.x), f.Y(q.y)]);
      const pts = sign === 1 ? st : st.reverse();
      if (length(pts) < 4) continue;
      out.push(simplify(pts, 22));
    }
  }
  return out;
}
/** The sign of a charge is drawn as a short path (a label may not start with + or -): a plus is two strokes and a minus is one. */
const signD = (q: number, x: number, y: number): string => seg([x - 0.9, y], [x + 0.9, y], r1) + (q > 0 ? seg([x, y - 0.9], [x, y + 0.9], r1) : "");
const signAt = (sk: Sketch, id: string, q: number, x: number, y: number): void => sk.path(id, signD(q, x, y), { width: 0.45, how: "fade" });
const signRead = (r: DrawResult, id: string): "+" | "-" | undefined => {
  const n = subpaths(shapeBy(r, id)?.d).length;
  return n === 2 ? "+" : n === 1 ? "-" : undefined;
};
function drawCharges(sk: Sketch, chs: Charge[], f: EF): void {
  chs.forEach((c, i) => {
    sk.circle(`q${LETTERS[i]}`, f.X(c.x), f.Y(c.y), 1.6, { fill: c.q > 0 ? "red" : "purple", fillOpacity: 0.35, width: 0.4 });
    signAt(sk, `g${LETTERS[i]}`, c.q, f.X(c.x), f.Y(c.y));
  });
}
/** The charges as they are drawn, in metres (y up), with the signs and sizes printed beside them. */
function readCharges(r: DrawResult, count: number): { chs: Charge[]; ps: number; problems: string[] } {
  const ps = readScale(r);
  const rd = parseReadouts(r);
  const problems: string[] = [];
  const chs: Charge[] = [];
  for (let i = 0; i < count; i++) {
    const c = shapeBy(r, `q${LETTERS[i]}`);
    const q = rd.get(`q${i + 1}`)?.value;
    const t = signRead(r, `g${LETTERS[i]}`);
    if (!c || q === undefined || ps === undefined) {
      problems.push("a charge, its size or the scale bar is missing");
      continue;
    }
    if (t !== (q > 0 ? "+" : "-")) problems.push(`the sign drawn on charge ${i + 1} is not the sign of ${q} nC`);
    chs.push({ q: q * NANO, x: Number(c.cx) * ps, y: -Number(c.cy) * ps });
  }
  return { chs, ps: ps ?? NaN, problems };
}
/** Every drawn segment runs along the field at its middle, the right way, to within a few degrees plus half the bend at its ends. */
function checkAlongField(lines: P[][], ps: number, field: (x: number, y: number) => P, name: string): string[] {
  const out: string[] = [];
  let bad = 0;
  let worst = 0;
  for (const pts of lines) {
    for (let i = 0; i + 1 < pts.length; i++) {
      const a = pts[i]!;
      const b = pts[i + 1]!;
      if (len(sub(b, a)) < 0.3) continue;
      const m: P = [((a[0] + b[0]) / 2) * ps, (-(a[1] + b[1]) / 2) * ps];
      const e = field(m[0], m[1]);
      const chord: P = [b[0] - a[0], -(b[1] - a[1])];
      const turn = (j: number): number => (j >= 0 && j + 2 < pts.length ? angDiff((Math.atan2(-(pts[j + 1]![1] - pts[j]![1]), pts[j + 1]![0] - pts[j]![0]) * 180) / Math.PI, (Math.atan2(-(pts[j + 2]![1] - pts[j + 1]![1]), pts[j + 2]![0] - pts[j + 1]![0]) * 180) / Math.PI) : 0);
      const tol = 3 + 0.55 * (turn(i - 1) + turn(i));
      const ang = (Math.acos(Math.max(-1, Math.min(1, dot(unit(chord), unit(e))))) * 180) / Math.PI;
      worst = Math.max(worst, ang - tol);
      if (ang > tol) bad++;
    }
  }
  if (bad > 0) out.push(`${bad} segment${bad > 1 ? "s" : ""} of the ${name} do not run along the field (the worst is ${worst.toFixed(1)} degrees beyond the allowance)`);
  return out;
}

const efReadouts = (p: LinesP): Readout[] => {
  const chs = chargesOf(p);
  const out: Readout[] = chs.map((c, i) => ({ key: `q${i + 1}`, value: c.q / NANO, unit: "nC" }));
  out.push({ key: "Net", value: chs.reduce((s, c) => s + c.q, 0) / NANO, unit: "nC" }, { key: "d12", value: Math.hypot(chs[0]!.x - chs[1]!.x, chs[0]!.y - chs[1]!.y), unit: "m" }, { key: "Lines", word: "out of +, into -" });
  return out;
};
export const electricFieldFigure = physicsDrawer("p_electric_field", "electric_field", {
  covers: ["Electric field lines, equipotentials, Gauss surface"],
  readouts(p) {
    if (p.mode === "lines") return efReadouts(p);
    if (p.mode === "equipotential") {
      const q = p.q_nc * NANO;
      const rr = [p.v1, p.v2, p.v3].map((v) => (K_COULOMB * q) / v);
      return [{ key: "q", value: p.q_nc, unit: "nC" }, ...[p.v1, p.v2, p.v3].map((v, i): Readout => ({ key: `V${i + 1}`, value: v, unit: "V" })), ...rr.map((x, i): Readout => ({ key: `r${i + 1}`, value: x, unit: "m" }))];
    }
    const enclosed = p.q_in_nc * NANO;
    return [{ key: "q in", value: p.q_in_nc, unit: "nC" }, { key: "q out", value: p.q_out_nc, unit: "nC" }, { key: "R", value: p.radius, unit: "m" }, { key: "Flux", value: gaussFlux(enclosed), unit: "N.m^2/C" }, { key: "E at R", value: (K_COULOMB * Math.abs(enclosed)) / (p.radius * p.radius), unit: "N/C" }, { key: "Outside", word: "adds no flux" }];
  },
  draw(sk, p) {
    const pc = pic(sk);
    if (p.mode === "lines") {
      const chs = chargesOf(p);
      const f = efFrame(chs, pc);
      drawLines(sk, efLines(chs, f));
      drawCharges(sk, chs, f);
      drawScaleBar2(sk, pc.x + 1, pc.y + pc.h - 1.6, 1 / f.s, "m");
      return;
    }
    const cx = pc.x + pc.w / 2;
    const cy = pc.y + (pc.h - 2.5) / 2;
    if (p.mode === "equipotential") {
      const q = p.q_nc * NANO;
      const radii = [p.v1, p.v2, p.v3].map((v) => (K_COULOMB * q) / v);
      const s = (Math.min(pc.w, pc.h - 3) / 2 - 1.5) / Math.max(...radii);
      radii.forEach((rr, i) => {
        sk.circle(`e${LETTERS[i]}`, cx, cy, rr * s, { dash: i > 0, width: i === 0 ? 0.4 : 0.3 });
        sk.text(`t${LETTERS[i]}`, cx + rr * s * 0.7071 + 0.6, cy - rr * s * 0.7071 - 0.8, String(i + 1), { anchor: "start" });
      });
      // eight radial lines of the field, drawn outward from a positive charge and inward for a negative one
      const R = Math.max(...radii) * s;
      const rays: P[][] = Array.from({ length: 8 }, (_, k) => [[cx + 2.2 * Math.cos((k * Math.PI) / 4), cy - 2.2 * Math.sin((k * Math.PI) / 4)], [cx + R * Math.cos((k * Math.PI) / 4), cy - R * Math.sin((k * Math.PI) / 4)]] as P[]);
      sk.path("ry", rays.map((l) => seg(l[0]!, l[1]!, r1)).join(""), { color: "soft", width: 0.2, how: "fade" });
      sk.circle("qa", cx, cy, 1.6, { fill: q > 0 ? "red" : "purple", fillOpacity: 0.35, width: 0.4 });
      signAt(sk, "ga", q, cx, cy);
      drawScaleBar2(sk, pc.x + 1, pc.y + pc.h - 1.6, 1 / s, "m");
      return;
    }
    // Gauss: the surface is a circle of radius R round the charge inside; the charge outside is drawn too, and adds no flux
    const s = Math.min((pc.w - 6) / (2 * 2.6 * p.radius), (pc.h - 4.5) / (2 * 1.3 * p.radius));
    const cxg = pc.x + 3 + p.radius * 1.3 * s;
    sk.circle("gs", cxg, cy, p.radius * s, { dash: true, width: 0.4 });
    sk.text("ts", cxg, cy - p.radius * s - 1.6, "S", { anchor: "middle" });
    const out: P = [cxg + 2.2 * p.radius * s, cy];
    for (const [id, qn, at] of [["qa", p.q_in_nc, [cxg, cy] as P], ["qb", p.q_out_nc, out]] as const) {
      sk.circle(id, at[0], at[1], 1.6, { fill: qn > 0 ? "red" : "purple", fillOpacity: 0.35, width: 0.4 });
      signAt(sk, `g${id[1]}`, qn, at[0], at[1]);
    }
    drawScaleBar2(sk, pc.x + 1, pc.y + pc.h - 1.6, 1 / s, "m");
  },
  check(r, p) {
    const out: string[] = [];
    const rd = parseReadouts(r);
    const ps = readScale(r);
    if (p.mode === "lines") {
      const count = p.q3_nc !== undefined ? 3 : 2;
      const { chs, ps: scale, problems } = readCharges(r, count);
      if (problems.length) return problems;
      const lines = readLines(r, "l");
      if (lines.length < 3) return ["the field lines are missing"];
      out.push(...checkAlongField(lines, scale, (x, y) => {
        const e = eField(chs, x, y);
        return [e.x, e.y];
      }, "field lines"));
      const d12 = Math.hypot(chs[0]!.x - chs[1]!.x, chs[0]!.y - chs[1]!.y);
      const want = Math.hypot(p.x1 - p.x2, p.y1 - p.y2);
      if (!near(d12, want, 0.006 * want + 0.03 * scale)) out.push(`the first two charges are ${d12.toPrecision(3)} m apart in the drawing and the inputs give ${want.toPrecision(3)}`);
      // the arrowheads point the way the field does
      const heads = readLines(r, "h");
      if (heads.length !== lines.length) out.push("every line has one arrowhead");
      for (const h of heads) {
        if (h.length !== 3) continue;
        const tip = h[1]!;
        const back: P = [(h[0]![0] + h[2]![0]) / 2, (h[0]![1] + h[2]![1]) / 2];
        const e = eField(chs, tip[0] * scale, -tip[1] * scale);
        if (dot(unit([tip[0] - back[0], -(tip[1] - back[1])]), unit([e.x, e.y])) < 0.5) {
          out.push("an arrowhead points against the field");
          break;
        }
      }
      // more charge, more lines: the number of lines that start or end at a charge follows its size
      const touching = (c: Charge): number => lines.filter((l) => [l[0]!, l[l.length - 1]!].some((e) => Math.hypot(e[0] * scale - c.x, -e[1] * scale - c.y) < 3.2 * scale)).length;
      const counts = chs.map(touching);
      for (let i = 0; i < chs.length; i++) for (let j = 0; j < chs.length; j++) if (Math.abs(chs[i]!.q) > 1.2 * Math.abs(chs[j]!.q) && counts[i]! < counts[j]!) out.push("a larger charge has fewer lines than a smaller one");
      return out;
    }
    if (p.mode === "equipotential") {
      if (ps === undefined) return ["the scale bar is missing"];
      const q = p.q_nc * NANO;
      const c0 = shapeBy(r, "qa");
      if (!c0) return ["the charge is missing"];
      for (const [i, v] of [p.v1, p.v2, p.v3].entries()) {
        const c = shapeBy(r, `e${LETTERS[i]}`);
        if (!c) {
          out.push(`the equipotential ${i + 1} is missing`);
          continue;
        }
        const rr = Number(c.r) * ps;
        const want = (K_COULOMB * q) / v;
        if (!near(rr, want, 0.006 * want + 0.04 * ps)) out.push(`the circle for ${v} V has radius ${rr.toPrecision(3)} m and V = kq/r gives ${want.toPrecision(3)}`);
        const vAt = potential([{ q, x: 0, y: 0 }], rr, 0);
        if (!near(vAt, v, 0.01 * Math.abs(v) + 0.5)) out.push("the potential on a drawn circle is not the one printed");
      }
      const rays = ptsOf(r, "ry");
      if (rays.length !== 16) out.push("eight radial field lines are drawn");
      return out;
    }
    // gauss
    const [a, b, g] = [shapeBy(r, "qa"), shapeBy(r, "qb"), shapeBy(r, "gs")];
    if (!a || !b || !g || ps === undefined) return ["a charge, the surface or the scale bar is missing"];
    const R = Number(g.r) * ps;
    if (!near(R, p.radius, 0.006 * p.radius + 0.03 * ps)) out.push("the drawn surface is not the radius of the inputs");
    const inside = (c: Record<string, unknown>): boolean => Math.hypot(Number(c.cx) - Number(g.cx), Number(c.cy) - Number(g.cy)) < Number(g.r);
    const qs = [[a, p.q_in_nc], [b, p.q_out_nc]] as const;
    const enclosed = qs.filter(([c]) => inside(c)).reduce((s, [, q]) => s + q * NANO, 0);
    const flux = rd.get("Flux")?.value;
    const want = gaussFlux(enclosed);
    if (flux === undefined || Math.abs(flux - want) > 0.006 * Math.abs(want) + 1e-9) out.push(`the flux printed is ${flux ?? "missing"} and the charge inside the drawn surface gives ${want.toPrecision(3)}`);
    if (!inside(a) || inside(b)) out.push("the first charge is inside the surface and the second is outside");
    return out;
  },
});

// ---- Coulomb's law and the dipole --------------------------------------------------------------------------------------------------------------------------------------------------------
export const chargeFigure = physicsDrawer("p_charge", "charges_and_dipole", {
  covers: ["Charges, dipole, induction, electroscope"],
  readouts(p) {
    if (p.mode === "coulomb") {
      const c = coulomb(p.q1_nc * NANO, p.q2_nc * NANO, p.r);
      return [{ key: "q1", value: p.q1_nc, unit: "nC" }, { key: "q2", value: p.q2_nc, unit: "nC" }, { key: "r", value: p.r, unit: "m" }, { key: "F", value: c.force, unit: "N" }, { key: "Force", word: c.attracts ? "attractive" : "repulsive" }, { key: "Arrows", word: "equal pair" }];
    }
    const a = p.separation / 2;
    const q = p.q_nc * NANO;
    const axial = K_COULOMB * q * (1 / (p.r - a) ** 2 - 1 / (p.r + a) ** 2);
    const equatorial = (2 * K_COULOMB * q * a) / (p.r * p.r + a * a) ** 1.5;
    return [{ key: "q", value: p.q_nc, unit: "nC" }, { key: "d", value: p.separation, unit: "m" }, { key: "p", value: q * p.separation, unit: "C.m" }, { key: "r", value: p.r, unit: "m" }, { key: "E axial", value: axial, unit: "N/C" }, { key: "E equator", value: equatorial, unit: "N/C" }];
  },
  draw(sk, p) {
    const pc = pic(sk);
    const cy = pc.y + (pc.h - 2.5) / 2;
    if (p.mode === "coulomb") {
      const s = (pc.w * 0.6) / p.r;
      const x0 = pc.x + pc.w / 2 - (p.r * s) / 2;
      const attract = p.q1_nc * p.q2_nc < 0;
      for (const [i, [q, x]] of ([[p.q1_nc, x0], [p.q2_nc, x0 + p.r * s]] as const).entries()) {
        sk.circle(`q${LETTERS[i]}`, x, cy, 1.6, { fill: q > 0 ? "red" : "purple", fillOpacity: 0.35, width: 0.4 });
        signAt(sk, `g${LETTERS[i]}`, q, x, cy);
        const toward = i === 0 ? 1 : -1;
        const dir = attract ? toward : -toward;
        sk.arrow(`f${LETTERS[i]}`, x + dir * 2.6, cy - 4.5, x + dir * 10.6, cy - 4.5, { width: 0.5 });
      }
      sk.path("dm", seg([x0, cy + 4], [x0 + p.r * s, cy + 4]), { color: "soft", dash: true, width: 0.25 });
      drawScaleBar2(sk, pc.x + 1, pc.y + pc.h - 1.6, 1 / s, "m");
      return;
    }
    const s = Math.min((pc.w * 0.34) / p.r, (pc.h - 9) / 2 / p.r);
    const cx = pc.x + 8;
    const a = (p.separation / 2) * s;
    for (const [i, sg] of ([-1, 1] as const).entries()) {
      sk.circle(`q${LETTERS[i]}`, cx + sg * a, cy, 1.6, { fill: sg > 0 ? "red" : "purple", fillOpacity: 0.35, width: 0.4 });
      signAt(sk, `g${LETTERS[i]}`, sg, cx + sg * a, cy);
    }
    sk.path("ax", seg([cx - a - 3, cy], [cx + p.r * s + 4, cy]), { color: "soft", width: 0.2, how: "fade" });
    sk.arrow("pm", cx - a, cy + 4.5, cx + a, cy + 4.5, { width: 0.5 });
    sk.circle("pa", cx + p.r * s, cy, 0.6, { fill: "ink" });
    sk.text("ta", cx + p.r * s, cy - 2.2, "A", { anchor: "middle" });
    sk.circle("pe", cx, cy - p.r * s, 0.6, { fill: "ink" });
    sk.text("tb", cx + 1.6, cy - p.r * s, "B", { anchor: "start" });
    drawScaleBar2(sk, pc.x + 1, pc.y + pc.h - 1.6, 1 / s, "m");
  },
  check(r, p) {
    const out: string[] = [];
    const ps = readScale(r);
    if (ps === undefined) return ["the scale bar is missing"];
    if (p.mode === "coulomb") {
      const { chs, problems } = readCharges(r, 2);
      if (problems.length) return problems;
      const d = Math.hypot(chs[0]!.x - chs[1]!.x, chs[0]!.y - chs[1]!.y);
      if (!near(d, p.r, 0.006 * p.r + 0.03 * ps)) out.push(`the charges are ${d.toPrecision(3)} m apart in the drawing and the inputs give ${p.r}`);
      const [fa, fb] = ["fa", "fb"].map((id) => shapeBy(r, id));
      if (!fa || !fb || fa.kind !== "arrow" || fb.kind !== "arrow") return [...out, "a force arrow is missing"];
      const dirA = Math.sign(Number(fa.x2) - Number(fa.x1)); // + means towards the other charge (charge a is on the left)
      const dirB = Math.sign(Number(fb.x2) - Number(fb.x1));
      const attract = p.q1_nc * p.q2_nc < 0;
      if (dirA !== (attract ? 1 : -1) || dirB !== (attract ? -1 : 1)) out.push(attract ? "unlike charges attract: each arrow points towards the other charge" : "like charges repel: each arrow points away from the other charge");
      if (!near(len([Number(fa.x2) - Number(fa.x1), Number(fa.y2) - Number(fa.y1)]), len([Number(fb.x2) - Number(fb.x1), Number(fb.y2) - Number(fb.y1)]), 0.02)) out.push("the two forces are equal and opposite, so the arrows are as long as each other");
      return out;
    }
    const [qa, qb, pa, pe, pm, ax] = [shapeBy(r, "qa"), shapeBy(r, "qb"), shapeBy(r, "pa"), shapeBy(r, "pe"), shapeBy(r, "pm"), ptsOf(r, "ax")];
    if (!qa || !qb || !pa || !pe || !pm || ax.length < 2) return ["a charge, a probe point, the moment arrow or the axis is missing"];
    const sep = (Number(qb.cx) - Number(qa.cx)) * ps;
    if (!near(sep, p.separation, 0.006 * p.separation + 0.03 * ps)) out.push(`the charges are ${sep.toPrecision(3)} m apart in the drawing and the inputs give ${p.separation}`);
    const centre = (Number(qa.cx) + Number(qb.cx)) / 2;
    if (!near((Number(pa.cx) - centre) * ps, p.r, 0.006 * p.r + 0.03 * ps)) out.push("the axial point is not r from the centre of the dipole");
    if (!near((Number(qa.cy) - Number(pe.cy)) * ps, p.r, 0.006 * p.r + 0.03 * ps)) out.push("the equatorial point is not r from the centre of the dipole");
    if (signRead(r, "ga") !== "-" || signRead(r, "gb") !== "+") out.push("the negative charge is on the left and the positive one on the right");
    // the moment points from the negative charge to the positive one
    if (!(Number(pm.x2) > Number(pm.x1)) || !near(Number(pm.x1), Number(qa.cx), 0.06) || !near(Number(pm.x2), Number(qb.cx), 0.06)) out.push("the dipole moment points from the negative charge to the positive one");
    return out;
  },
});

// ---- magnets, wires and solenoids ---------------------------------------------------------------------------------------------------------------------------------------------------
const N_TRACE = 700;
type Sol = { turns: number; current: number; radius: number; length: number };
function solenoidLines(s: Sol, scale: number, cx: number, cy: number, hz: number, hr: number): P[][] {
  const f = (z: number, rho: number): P => {
    const b = solenoidField(s.turns, s.current, s.radius, s.length, z, Math.max(rho, 1e-6));
    return [b.bz, b.br];
  };
  const dirAt = (z: number, rho: number, sg: 1 | -1): P => {
    const b = f(z, rho);
    const m = Math.hypot(b[0], b[1]) || 1;
    return [(sg * b[0]) / m, (sg * b[1]) / m];
  };
  const seeds = [0.3 * s.radius, 0.6 * s.radius, 0.6 * s.length]; // two inside the coil, one outside that goes round the whole magnet (a line hugging the winding is not traced: the field changes sign across it)
  const step = 0.3 / scale;
  const lines: P[][] = [];
  const trace = (rho0: number, sg: 1 | -1): P[] => {
    const pts: P[] = [[0, rho0]];
    let [z, rho] = [0, rho0];
    for (let i = 0; i < N_TRACE; i++) {
      const d1 = dirAt(z, rho, sg);
      const d2 = dirAt(z + (d1[0] * step) / 2, Math.max(rho + (d1[1] * step) / 2, 1e-6), sg);
      [z, rho] = [z + d2[0] * step, rho + d2[1] * step];
      if (rho < 0 || Math.abs(z) > hz || rho > hr) break;
      pts.push([z, rho]);
      if (i > 40 && Math.hypot(z, rho - rho0) < step * 1.2) break; // the line has closed on itself
    }
    return pts;
  };
  for (const rho0 of seeds) {
    const fwd = trace(rho0, 1);
    const back = trace(rho0, -1).reverse();
    const whole = [...back.slice(0, -1), ...fwd];
    for (const half of [1, -1]) {
      const stage = whole.map(([z, rho]): P => [cx + z * scale, cy - half * rho * scale]);
      if (stage.length >= 3 && length(stage) > 4) lines.push(simplify(stage, 30));
    }
  }
  return lines;
}
const solenoidP = (p: { turns: number; current: number; radius: number; length: number }): Sol => ({ turns: p.turns, current: p.current, radius: p.radius, length: p.length });
export const magnetFigure = physicsDrawer("p_magnet", "magnetic_field", {
  covers: ["Magnetic field lines: magnet, wire, solenoid"],
  readouts(p) {
    if (p.mode === "wire") {
      return [{ key: "I", value: p.current, unit: "A" }, ...[p.r1, p.r2, p.r3].map((x, i): Readout => ({ key: `r${i + 1}`, value: x, unit: "m" })), ...[p.r1, p.r2, p.r3].map((x, i): Readout => ({ key: `B${i + 1}`, value: wireField(p.current, x), unit: "T" })), { key: "Current", word: p.direction === "out" ? "towards you" : "away from you" }];
    }
    const out: Readout[] = [{ key: "N", value: p.turns, unit: "" }, { key: "I", value: p.current, unit: "A" }, { key: "L", value: p.length, unit: "m" }, { key: "a", value: p.radius, unit: "m" }, { key: "B centre", value: solenoidCentre(p.turns, p.current, p.radius, p.length), unit: "T" }];
    out.push(p.mode === "bar" ? { key: "Model", word: "solenoid" } : { key: "B long", value: (MU0 * (p.turns / p.length) * p.current), unit: "T" });
    return out;
  },
  draw(sk, p) {
    const pc = pic(sk);
    const cy = pc.y + 0.8 + (pc.h - 4.8) / 2;
    if (p.mode === "wire") {
      const cx = pc.x + pc.w / 2;
      const s = (Math.min(pc.w, pc.h - 4) / 2 - 1.5) / p.r3;
      [p.r1, p.r2, p.r3].forEach((rr, i) => {
        sk.circle(`w${LETTERS[i]}`, cx, cy, rr * s, { width: 0.3, dash: i > 0 });
        // an arrow at the top of each circle: the field runs anticlockwise for a current towards you and clockwise for one away from you
        const dir = p.direction === "out" ? -1 : 1;
        sk.arrow(`a${LETTERS[i]}`, cx - dir * 1.6, cy - rr * s, cx + dir * 1.6, cy - rr * s, { width: 0.5 });
      });
      sk.circle("wr", cx, cy, 1.2, { width: 0.4 });
      if (p.direction === "out") sk.circle("wd", cx, cy, 0.35, { fill: "ink" });
      else sk.path("wx", seg([cx - 0.7, cy - 0.7], [cx + 0.7, cy + 0.7], r1) + seg([cx - 0.7, cy + 0.7], [cx + 0.7, cy - 0.7], r1), { width: 0.35 });
      drawScaleBar2(sk, pc.x + 1, pc.y + pc.h - 1.6, 1 / s, "m");
      return;
    }
    const sol = solenoidP(p);
    const hz = p.length * 1.1;
    const hr = (hz * (pc.h - 4.8)) / (pc.w - 1);
    const s = (pc.w - 1) / (2 * hz);
    const cx = pc.x + pc.w / 2;
    sk.rect("bd", cx - (p.length / 2) * s, cy - p.radius * s, p.length * s, 2 * p.radius * s, { width: 0.4, fill: "soft", fillOpacity: p.mode === "bar" ? 0.25 : 0.1 });
    if (p.mode === "solenoid") {
      const ticks = Array.from({ length: p.turns }, (_, k) => {
        const x = cx - (p.length / 2) * s + (p.length * s * (k + 0.5)) / p.turns;
        return seg([x, cy - p.radius * s], [x, cy + p.radius * s], r1);
      }).join("");
      sk.path("tk", ticks, { width: 0.3, how: "fade" });
    } else {
      sk.text("tsp", cx - (p.length / 4) * s, cy, "S", { anchor: "middle", bold: true });
      sk.text("tnp", cx + (p.length / 4) * s, cy, "N", { anchor: "middle", bold: true });
    }
    sk.path("ax", seg([pc.x + 0.8, cy], [pc.x + pc.w - 0.8, cy], r1), { color: "soft", width: 0.2, how: "fade" });
    drawLines(sk, solenoidLines(sol, s, cx, cy, hz, hr));
    drawScaleBar2(sk, pc.x + 1, pc.y + pc.h - 1.6, 1 / s, "m");
  },
  check(r, p) {
    const out: string[] = [];
    const ps = readScale(r);
    if (ps === undefined) return ["the scale bar is missing"];
    if (p.mode === "wire") {
      const dir = p.direction === "out" ? -1 : 1;
      for (const [i, rr] of [p.r1, p.r2, p.r3].entries()) {
        const c = shapeBy(r, `w${LETTERS[i]}`);
        const a = shapeBy(r, `a${LETTERS[i]}`);
        if (!c || !a || a.kind !== "arrow") {
          out.push(`circle ${i + 1} or its arrow is missing`);
          continue;
        }
        if (!near(Number(c.r) * ps, rr, 0.006 * rr + 0.03 * ps)) out.push(`circle ${i + 1} is not at the distance of the inputs`);
        if (Math.sign(Number(a.x2) - Number(a.x1)) !== dir || !near(Number(a.y1), Number(c.cy) - Number(c.r), 0.06)) out.push(`the arrow on circle ${i + 1} does not run the way the right-hand rule says`);
      }
      const marker = p.direction === "out" ? shapeBy(r, "wd") : shapeBy(r, "wx");
      if (!marker) out.push(p.direction === "out" ? "a current towards you is drawn with a dot" : "a current away from you is drawn with a cross");
      // B falls as 1 / r: the printed fields agree with the drawn radii
      const rd = parseReadouts(r);
      const radii = [0, 1, 2].map((i) => Number(shapeBy(r, `w${LETTERS[i]}`)?.r) * ps);
      const b = [1, 2, 3].map((i) => rd.get(`B${i}`)?.value ?? NaN);
      const I = rd.get("I")?.value ?? NaN;
      radii.forEach((x, i) => {
        if (!near(b[i]!, wireField(I, x), 0.012 * b[i]! + 1e-15)) out.push(`B${i + 1} is not mu0 I / (2 pi r) for the drawn circle`);
      });
      return out;
    }
    const bd = shapeBy(r, "bd");
    const rd = parseReadouts(r);
    if (!bd) return ["the body of the magnet is missing"];
    const L = Number(bd.w) * ps;
    const a = (Number(bd.h) / 2) * ps;
    if (!near(L, p.length, 0.006 * p.length + 0.03 * ps) || !near(a, p.radius, 0.006 * p.radius + 0.03 * ps)) out.push("the drawn body is not the size of the inputs");
    const turns = p.mode === "solenoid" ? subpaths(shapeBy(r, "tk")?.d).length : p.turns;
    if (turns !== p.turns) out.push(`${turns} turns are drawn and the inputs give ${p.turns}`);
    const cx = Number(bd.x) + Number(bd.w) / 2;
    const cy = Number(bd.y) + Number(bd.h) / 2;
    const lines = readLines(r, "l");
    if (lines.length < 4) return [...out, "the field lines are missing"];
    const I = rd.get("I")?.value ?? p.current;
    const field = (x: number, y: number): P => {
      const b = solenoidField(turns, I, a, L, x - cx * ps, Math.max(Math.abs(y + cy * ps), 1e-6));
      return [b.bz, b.br * Math.sign(y + cy * ps || 1)];
    };
    out.push(...checkAlongField(lines, ps, field, "field lines"));
    // inside the coil the field runs left to right (the right-hand end is the north pole), and the heads agree
    if (p.mode === "bar") {
      const n = shapeBy(r, "tnp");
      const s = shapeBy(r, "tsp");
      if (!n || !s || Number(n.x) <= Number(s.x)) out.push("the north pole is the end the lines leave from: the right-hand end");
    }
    const heads = readLines(r, "h");
    if (heads.length !== lines.length) out.push("every line has one arrowhead");
    for (const h of heads) {
      if (h.length !== 3) continue;
      const back: P = [(h[0]![0] + h[2]![0]) / 2, (h[0]![1] + h[2]![1]) / 2];
      const e = field(h[1]![0] * ps, -h[1]![1] * ps);
      if (dot(unit([h[1]![0] - back[0], -(h[1]![1] - back[1])]), unit(e)) < 0.5) {
        out.push("an arrowhead points against the field");
        break;
      }
    }
    return out;
  },
});

// ---- electromagnetic induction -----------------------------------------------------------------------------------------------------------------------------------------------------------
const N_GEN = 48;
function coilPath(x: number, y0: number, y1: number, turns: number, side: 1 | -1): string {
  const h = (y1 - y0) / turns;
  let d = `M${r1(x)} ${r1(y0)}`;
  for (let i = 0; i < turns; i++) d += `A${r1(h / 2)} ${r1(h / 2)} 0 0 ${side === 1 ? 1 : 0} ${r1(x)} ${r1(y0 + (i + 1) * h)}`;
  return d;
}
const drawnTurns = (np: number, ns: number): [number, number] => {
  const m = Math.max(np, ns);
  return [Math.max(2, Math.round((8 * np) / m)), Math.max(2, Math.round((8 * ns) / m))];
};
export const inductionFigure = physicsDrawer("p_em_induction", "induction_and_machines", {
  covers: ["Induction, generator, motor, transformer"],
  readouts(p) {
    if (p.mode === "rod") {
      const e = motionalEmf(p.b, p.length, p.speed);
      const i = e / p.resistance;
      return [{ key: "B", value: p.b, unit: "T" }, { key: "l", value: p.length, unit: "m" }, { key: "v", value: p.speed, unit: "m/s" }, { key: "EMF", value: e, unit: "V" }, { key: "R", value: p.resistance, unit: "ohm" }, { key: "I", value: i, unit: "A" }, { key: "Force", value: forceOnWire(p.b, i, p.length), unit: "N" }, { key: "Loop", word: "anticlockwise" }];
    }
    if (p.mode === "transformer") {
      const t = transformer(p);
      return [{ key: "Vp", value: p.vp, unit: "V" }, { key: "Np", value: p.np, unit: "" }, { key: "Ns", value: p.ns, unit: "" }, { key: "Vs", value: t.vs, unit: "V" }, { key: "Ip", value: p.ip, unit: "A" }, { key: "Is", value: t.is, unit: "A" }, { key: "Power", value: t.powerIn, unit: "W" }, { key: "Type", word: t.kind }];
    }
    if (p.mode === "motor") return [{ key: "B", value: p.b, unit: "T" }, { key: "I", value: p.current, unit: "A" }, { key: "L", value: p.length, unit: "m" }, { key: "Angle", value: p.angle_deg, unit: "deg" }, { key: "F", value: forceOnWire(p.b, p.current, p.length, p.angle_deg), unit: "N" }, { key: "Force", word: "downwards" }];
    const peak = generatorPeak(p.turns, p.b, p.area, p.frequency);
    return [{ key: "N", value: p.turns, unit: "" }, { key: "B", value: p.b, unit: "T" }, { key: "A", value: p.area, unit: "m^2" }, { key: "f", value: p.frequency, unit: "Hz" }, { key: "Peak", value: peak, unit: "V" }, { key: "RMS", value: peak / Math.SQRT2, unit: "V" }, { key: "T", value: 1 / p.frequency, unit: "s" }];
  },
  draw(sk, p) {
    const pc = pic(sk);
    if (p.mode === "generator") {
      const peak = generatorPeak(p.turns, p.b, p.area, p.frequency);
      const T = p.cycles / p.frequency;
      const k = 2 * Math.PI * p.frequency;
      drawGraph(sk, { xName: "t", xUnit: "s", yName: "emf", yUnit: "V", xwin: [0, Number(T.toPrecision(6))], ywin: niceWindow(-peak, peak), series: [{ id: "c0", pts: Array.from({ length: N_GEN + 1 }, (_, i) => [(Number(T.toPrecision(6)) * i) / N_GEN, peak * Math.sin((k * Number(T.toPrecision(6)) * i) / N_GEN)] as [number, number]) }] });
      return;
    }
    const cy = pc.y + (pc.h - 2) / 2;
    if (p.mode === "rod") {
      const [x0, x1, yt, yb] = [pc.x + 3, pc.x + pc.w - 9, pc.y + 4, pc.y + pc.h - 5];
      sk.path("ra", `M${r1(x1 + 5)} ${r1(yt)}L${r1(x0)} ${r1(yt)}L${r1(x0)} ${r1(yb)}L${r1(x1 + 5)} ${r1(yb)}`, { width: 0.4 });
      sk.path("rd", seg([x1, yt], [x1, yb], r1), { width: 0.8, how: "fade" });
      const crosses: string[] = [];
      for (let i = 0; i < 4; i++) for (let j = 0; j < 2; j++) {
        const [x, y] = [x0 + 4 + (i * (x1 - x0 - 8)) / 3, yt + 4 + (j * (yb - yt - 8)) / 1];
        crosses.push(seg([x - 0.7, y - 0.7], [x + 0.7, y + 0.7], r1) + seg([x - 0.7, y + 0.7], [x + 0.7, y - 0.7], r1));
      }
      sk.path("bx", crosses.join(""), { color: "soft", width: 0.25, how: "fade" });
      sk.arrow("av", x1 + 0.5, cy, x1 + 6.5, cy, { width: 0.5 });
      // the induced current in the rod runs up (anticlockwise round the loop), because the flux into the page is growing
      sk.arrow("ai", x1 - 2.5, cy + 4, x1 - 2.5, cy - 4, { width: 0.5 });
      return;
    }
    if (p.mode === "transformer") {
      const [x0, x1, yt, yb] = [pc.x + 12, pc.x + pc.w - 12, pc.y + 4, pc.y + pc.h - 5];
      sk.path("co", `M${r1(x0)} ${r1(yt)}L${r1(x1)} ${r1(yt)}L${r1(x1)} ${r1(yb)}L${r1(x0)} ${r1(yb)}ZM${r1(x0 + 3)} ${r1(yt + 3)}L${r1(x1 - 3)} ${r1(yt + 3)}L${r1(x1 - 3)} ${r1(yb - 3)}L${r1(x0 + 3)} ${r1(yb - 3)}Z`, { width: 0.4, how: "fade" });
      const [dp, ds] = drawnTurns(p.np, p.ns);
      sk.path("cp", coilPath(x0 + 1.5, yt + 5, yb - 5, dp, -1), { width: 0.4 });
      sk.path("cs", coilPath(x1 - 1.5, yt + 5, yb - 5, ds, 1), { width: 0.4 });
      sk.text("tp", x0 + 2, pc.y + 1.8, "Primary", { anchor: "middle" });
      sk.text("tz", x1 - 2, pc.y + 1.8, "Secondary", { anchor: "middle" });
      return;
    }
    // motor: a wire between the poles, the field running from N to S, the force from the left-hand rule
    const [xn, xs] = [pc.x + 3, pc.x + pc.w - 8];
    sk.rect("pn", xn, pc.y + 4, 4, pc.h - 9, { fill: "soft", fillOpacity: 0.3, width: 0.4 });
    sk.rect("ps", xs, pc.y + 4, 4, pc.h - 9, { fill: "soft", fillOpacity: 0.3, width: 0.4 });
    sk.text("tn", xn + 2, pc.y + 2.2, "N", { anchor: "middle" });
    sk.text("ts", xs + 2, pc.y + 2.2, "S", { anchor: "middle" });
    [-7, 0, 7].forEach((dy, i) => sk.arrow(`b${LETTERS[i]}`, xn + 5, cy + dy, xs - 1, cy + dy, { color: "soft", width: 0.3 }));
    const wx = (xn + xs + 4) / 2;
    sk.circle("wr", wx, cy, 1.6, { width: 0.4 });
    sk.path("wx", seg([wx - 0.9, cy - 0.9], [wx + 0.9, cy + 0.9], r1) + seg([wx - 0.9, cy + 0.9], [wx + 0.9, cy - 0.9], r1), { width: 0.4 });
    sk.arrow("af", wx, cy + 2.4, wx, cy + 9.4, { width: 0.6 });
  },
  check(r, p) {
    const out: string[] = [];
    const rd = parseReadouts(r);
    const v = (k: string): number => rd.get(k)?.value ?? NaN;
    const arrow = (id: string): [P, P] | null => {
      const s = shapeBy(r, id);
      return s && s.kind === "arrow" ? [[Number(s.x1), Number(s.y1)], [Number(s.x2), Number(s.y2)]] : null;
    };
    if (p.mode === "rod") {
      const [av, ai] = [arrow("av"), arrow("ai")];
      if (!av || !ai) return ["the velocity arrow or the current arrow is missing"];
      if (!(av[1][0] > av[0][0])) out.push("the rod moves to the right, so the velocity arrow points right");
      // v x B for B into the page and v to the right is up the page: the induced current in the rod runs up
      if (!(ai[1][1] < ai[0][1])) out.push("the induced current in the rod runs up the page (Lenz: it opposes the growing flux into the page)");
      if (!near(v("EMF"), v("B") * v("l") * v("v"), 0.012 * v("EMF"))) out.push("EMF is not B l v for the printed values");
      if (!near(v("I"), v("EMF") / v("R"), 0.012 * v("I"))) out.push("I is not EMF / R for the printed values");
      if (!near(v("Force"), v("B") * v("I") * v("l"), 0.012 * v("Force") + 1e-12)) out.push("the force on the rod is not B I l");
      if (ptsOf(r, "bx").length !== 32) out.push("the field into the page is drawn with eight crosses");
      return out;
    }
    if (p.mode === "transformer") {
      const [dp, ds] = ["cp", "cs"].map((id) => (String(shapeBy(r, id)?.d ?? "").match(/A/g) ?? []).length);
      if (dp === undefined || ds === undefined || dp === 0 || ds === 0) return ["a coil is missing"];
      if (Math.sign(ds - dp) !== Math.sign(p.ns - p.np)) out.push("the coil with more turns is drawn with more loops");
      if (!near(v("Vs"), (v("Vp") * v("Ns")) / v("Np"), 0.012 * v("Vs"))) out.push("Vs is not Vp Ns / Np for the printed values");
      if (!near(v("Is"), (v("Ip") * v("Np")) / v("Ns"), 0.012 * v("Is"))) out.push("Is is not Ip Np / Ns for the printed values");
      if (!near(v("Power"), v("Vp") * v("Ip"), 0.012 * v("Power"))) out.push("an ideal transformer passes on the power it takes in");
      const kind = rd.get("Type")?.word;
      if (kind !== (p.ns > p.np ? "step-up" : "step-down")) out.push("a coil with more turns on the secondary steps the voltage up");
      return out;
    }
    if (p.mode === "motor") {
      const [fields, af] = [["ba", "bb", "bc"].map(arrow), arrow("af")];
      if (fields.some((q) => !q) || !af) return ["a field arrow or the force arrow is missing"];
      if (fields.some((q) => !(q![1][0] > q![0][0]))) out.push("the field runs from the north pole to the south pole, so left to right");
      if (!(af[1][1] > af[0][1])) out.push("current into the page in a field to the right gives a force down the page (F = I L x B)");
      if (!near(v("F"), forceOnWire(v("B"), v("I"), v("L"), v("Angle")), 0.012 * v("F") + 1e-12)) out.push("F is not B I L sin(angle) for the printed values");
      return out;
    }
    const g = readGraph(r);
    if (!g.ok) return [g.why];
    const T = Number((p.cycles / p.frequency).toPrecision(6));
    const peak = generatorPeak(p.turns, p.b, p.area, p.frequency);
    const k = 2 * Math.PI * p.frequency;
    out.push(...checkCurve(g, "c0", (t) => peak * Math.sin(k * t), "emf", N_GEN + 1, (i) => (T * i) / N_GEN));
    if (!near(v("RMS"), v("Peak") / Math.SQRT2, 0.012 * v("RMS"))) out.push("the rms value is the peak over root 2");
    return out;
  },
});
