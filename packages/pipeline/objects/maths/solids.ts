import { pointsOf, r2, shapeBy, type Box, type Readout } from "../physics/kit";
import type { DrawResult } from "../registry";
import {
  SKEW, coneNetAngle, coneSlice, cuboidNetArea, deg, directionCosines, dist, dist3, norm3, project3, rad, sphereSlice, slant, solidFacts, type P3, type Pt,
} from "./compute";
import { circleOf, close, closeDeg, drawBar, ellipseD, fitFrame, halfEllipseD, labelSpot, lineEnds, mathsFigure, polyOf, readEllipse, readHalfEllipse, readUnit, sigs as sig, textAt, type Frame, tidy } from "./mkit";
import type { MathsParams } from "./params";

/**
 * Solids and space (ADR 0112): the six solids of mensuration with their dimensions, the nets of a cuboid, a cylinder and a cone, the cross-section of a sphere, a cone and a cylinder, and a point
 * or a pair of points in three dimensions with the direction cosines. Solids are drawn in oblique projection (a cuboid) or in elevation with an ellipse for each circle (the others); hidden edges are
 * dashed. They are read back from the dimensions they show: the radius from an ellipse, the height from the distance between two ellipses, the three edges of a cuboid from the front face and the
 * depth edge, and the volume and the surface area are then recomputed from those drawn dimensions and compared with the printed ones.
 */
const word = (key: string, w: string): Readout => ({ key, word: w });
const num = (key: string, value: number, unit = ""): Readout => ({ key, value: tidy(value), unit });
const S = (f: Frame) => (q: Pt): Pt => f.at(q);
const TILT = 0.3; // the height of the ellipse of a circle seen from slightly above, as a fraction of its width
const DEPTH = 0.5; // a depth edge of a cuboid is drawn half as long, at 45 degrees (the cabinet projection)
const tol = (k: number): number => 0.06 * k + 1e-9;
const need = (k: number | null): string[] => (k === null ? ["the scale bar is missing or unreadable"] : []);

// ---- the six solids ------------------------------------------------------------------------------------------------------------------------------------------------------------------------
type SolidP = MathsParams<"m_solid">;
const dimsOf = (p: SolidP): { l: number; b: number; h: number; r: number; r2: number } => ({
  l: "l" in p ? p.l : 0, b: "b" in p ? p.b : 0, h: "h" in p ? p.h : 0, r: "r" in p ? p.r : "r1" in p ? p.r1 : 0, r2: "r2" in p ? p.r2 : 0,
});
const SOLID_COVER = ["3-D solids: cuboid, cylinder, cone, sphere, frustum with dimensions"];
/** The model points that must fit: ellipses and edges of the solid. */
const solidPoints = (p: SolidP): Pt[] => {
  const d = dimsOf(p);
  if (p.kind === "cuboid") return [[0, 0], [d.l + DEPTH * 0.7071 * d.b, d.h + DEPTH * 0.7071 * d.b]];
  const top = p.kind === "cylinder" || p.kind === "cone" || p.kind === "frustum" ? d.h : p.kind === "hemisphere" ? d.r : d.r;
  const bottom = p.kind === "sphere" ? -d.r : -TILT * d.r;
  return [[-d.r, bottom], [d.r, top + (p.kind === "cylinder" ? TILT * d.r : p.kind === "frustum" ? TILT * d.r2 : 0)]];
};
export const solidFigure = mathsFigure("m_solid", "solid_with_dimensions", {
  covers: SOLID_COVER,
  readouts(p) {
    const d = dimsOf(p);
    const f = solidFacts(p.kind, d);
    switch (p.kind) {
      case "cuboid": return [num("Length l", d.l), num("Breadth b", d.b), num("Height h", d.h), num("Volume", f.volume), num("Lateral surface area", f.curved), num("Total surface area", f.total), num("Diagonal", f.diagonal!)];
      case "cylinder": return [num("Radius r", d.r), num("Height h", d.h), num("Volume", f.volume), num("Curved surface area", f.curved), num("Total surface area", f.total)];
      case "cone": return [num("Radius r", d.r), num("Height h", d.h), num("Slant height l", f.slant!), num("Volume", f.volume), num("Curved surface area", f.curved), num("Total surface area", f.total)];
      case "sphere": return [num("Radius r", d.r), num("Volume", f.volume), num("Surface area", f.total)];
      case "hemisphere": return [num("Radius r", d.r), num("Volume", f.volume), num("Curved surface area", f.curved), num("Total surface area", f.total)];
      case "frustum": return [num("Radius r1", p.r1), num("Radius r2", p.r2), num("Height h", p.h), num("Slant height l", f.slant!), num("Volume", f.volume), num("Curved surface area", f.curved), num("Total surface area", f.total)];
    }
  },
  draw(sk, p) {
    const d = dimsOf(p);
    const f = fitFrame(sk.L.pic, solidPoints(p));
    const s = S(f);
    const ell = (id: string, c: Pt, r: number, dash = false): void => void sk.path(id, ellipseD(...s(c), r * f.u, TILT * r * f.u), { color: "ink", width: 0.35, ...(dash ? { dash: true } : {}), how: "fade" });
    const front = (id: string, c: Pt, r: number): void => void sk.path(id, halfEllipseD(...s(c), r * f.u, TILT * r * f.u, true), { color: "ink", width: 0.4 });
    const back = (id: string, c: Pt, r: number): void => void sk.path(id, halfEllipseD(...s(c), r * f.u, TILT * r * f.u, false), { color: "ink", width: 0.3, dash: true });
    const dim = (id: string, a: Pt, b: Pt, label: string, dx: number, dy: number): void => {
      sk.line(id, ...s(a), ...s(b), { color: "purple", width: 0.3, dash: true });
      sk.text(`${id}t`, (s(a)[0] + s(b)[0]) / 2 + dx, (s(a)[1] + s(b)[1]) / 2 + dy, label, { anchor: "middle" });
    };
    if (p.kind === "cuboid") {
      const o: Pt = [DEPTH * 0.7071 * d.b, DEPTH * 0.7071 * d.b];
      const F: Pt[] = [[0, 0], [d.l, 0], [d.l, d.h], [0, d.h]];
      const B = F.map((q) => [q[0] + o[0], q[1] + o[1]] as Pt);
      sk.polygon("top", [F[3]!, F[2]!, B[2]!, B[3]!].map(s), { color: "ink", fill: "purple", fillOpacity: 0.15, width: 0.35 });
      sk.polygon("sd", [F[1]!, F[2]!, B[2]!, B[1]!].map(s), { color: "ink", fill: "purple", fillOpacity: 0.08, width: 0.35 });
      sk.rect("fr", ...s(F[3]!), d.l * f.u, d.h * f.u, { color: "ink", fill: "purple", fillOpacity: 0.12, width: 0.4 });
      sk.path("hd", `M${r2(s(B[0]!)[0])} ${r2(s(B[0]!)[1])}L${r2(s(B[1]!)[0])} ${r2(s(B[1]!)[1])}M${r2(s(B[0]!)[0])} ${r2(s(B[0]!)[1])}L${r2(s(B[3]!)[0])} ${r2(s(B[3]!)[1])}M${r2(s(B[0]!)[0])} ${r2(s(B[0]!)[1])}L${r2(s(F[0]!)[0])} ${r2(s(F[0]!)[1])}`, { color: "ink", width: 0.3, dash: true });
      sk.text("tl", s(F[0]!)[0] + (d.l * f.u) / 2, s(F[0]!)[1] + 2.2, "l", { anchor: "middle" });
      sk.text("th", s(F[0]!)[0] - 1.6, s(F[0]!)[1] - (d.h * f.u) / 2 + 0.9, "h", { anchor: "middle" });
      sk.text("tb", s(F[1]!)[0] + (o[0] * f.u) / 2 + 1.8, s(F[1]!)[1] - (o[1] * f.u) / 2 + 1, "b", { anchor: "middle" });
    } else if (p.kind === "cylinder") {
      ell("te", [0, d.h], d.r);
      front("bf", [0, 0], d.r);
      back("bb", [0, 0], d.r);
      sk.path("sd", `M${r2(s([-d.r, 0])[0])} ${r2(s([-d.r, 0])[1])}L${r2(s([-d.r, d.h])[0])} ${r2(s([-d.r, d.h])[1])}M${r2(s([d.r, 0])[0])} ${r2(s([d.r, 0])[1])}L${r2(s([d.r, d.h])[0])} ${r2(s([d.r, d.h])[1])}`, { color: "ink", width: 0.4 });
      dim("rl", [0, d.h], [d.r, d.h], "r", 0, -1.8);
      dim("hl", [0, 0], [0, d.h], "h", 1.8, 0.9);
    } else if (p.kind === "cone") {
      front("bf", [0, 0], d.r);
      back("bb", [0, 0], d.r);
      sk.path("sd", `M${r2(s([-d.r, 0])[0])} ${r2(s([-d.r, 0])[1])}L${r2(s([0, d.h])[0])} ${r2(s([0, d.h])[1])}L${r2(s([d.r, 0])[0])} ${r2(s([d.r, 0])[1])}`, { color: "ink", width: 0.4 });
      dim("rl", [0, 0], [d.r, 0], "r", 0, 2.2);
      dim("hl", [0, 0], [0, d.h], "h", 1.8, 0.9);
    } else if (p.kind === "sphere") {
      sk.circle("cr", ...s([0, 0]), d.r * f.u, { color: "ink", width: 0.4 });
      front("bf", [0, 0], d.r);
      back("bb", [0, 0], d.r);
      dim("rl", [0, 0], [d.r, 0], "r", 0, -1.8);
    } else if (p.kind === "hemisphere") {
      const a = s([-d.r, 0]);
      const b = s([d.r, 0]);
      sk.path("dm", `M${r2(a[0])} ${r2(a[1])}A${r2(d.r * f.u)} ${r2(d.r * f.u)} 0 0 1 ${r2(b[0])} ${r2(b[1])}`, { color: "ink", width: 0.4 });
      ell("te", [0, 0], d.r);
      dim("rl", [0, 0], [d.r, 0], "r", 0, 2.2);
    } else {
      ell("te", [0, d.h], p.r2);
      front("bf", [0, 0], p.r1);
      back("bb", [0, 0], p.r1);
      sk.path("sd", `M${r2(s([-p.r1, 0])[0])} ${r2(s([-p.r1, 0])[1])}L${r2(s([-p.r2, d.h])[0])} ${r2(s([-p.r2, d.h])[1])}M${r2(s([p.r1, 0])[0])} ${r2(s([p.r1, 0])[1])}L${r2(s([p.r2, d.h])[0])} ${r2(s([p.r2, d.h])[1])}`, { color: "ink", width: 0.4 });
      dim("hl", [0, 0], [0, d.h], "h", 1.8, 0.9);
    }
    drawBar(sk, f);
  },
  check(r, p) {
    const k = readUnit(r);
    if (k === null) return need(k);
    const out: string[] = [];
    const d = dimsOf(p);
    const want = solidFacts(p.kind, d);
    const c = (got: number, w: number, what: string): void => {
      if (!close(got, w, 0.015, tol(k) * 2)) out.push(`${what} is drawn ${sig(got)} and the inputs give ${sig(w)}`);
    };
    let drawn: { volume: number; curved: number; total: number } | null = null;
    if (p.kind === "cuboid") {
      const fr = shapeBy(r, "fr");
      const top = polyOf(r, "top");
      if (!fr || !top || top.length !== 4) return [...out, "the front face or the top face is missing"];
      const [l, h] = [Number(fr.w) * k, Number(fr.h) * k];
      const o: Pt = [top[2]![0] - top[1]![0], top[2]![1] - top[1]![1]];
      const b = (Math.hypot(...o) / DEPTH) * k;
      c(l, d.l, "the length");
      c(h, d.h, "the height");
      c(b, d.b, "the breadth");
      if (!closeDeg(deg(Math.atan2(-o[1], o[0])), 45, 1.5)) out.push("the depth edge is not drawn at 45 degrees");
      if (Math.abs(top[1]![0] - (Number(fr.x) + Number(fr.w))) > 0.1 || Math.abs(top[1]![1] - Number(fr.y)) > 0.1) out.push("the top face does not sit on the front face");
      drawn = solidFacts("cuboid", { l, b, h, r: 0, r2: 0 });
    } else {
      const bf = readHalfEllipse(shapeBy(r, "bf")?.d);
      const te = readEllipse(shapeBy(r, "te")?.d);
      const sd = pointsOf(shapeBy(r, "sd")?.d);
      if (p.kind === "sphere") {
        const cr = circleOf(r, "cr");
        if (!cr || !bf) return [...out, "the circle or its equator is missing"];
        const R = cr.r * k;
        c(R, d.r, "the radius");
        if (!close(bf.rx, cr.r, 0.01, 0.1) || !close(bf.ry, TILT * cr.r, 0.02, 0.1)) out.push("the equator is not an ellipse of the circle's width and the usual tilt");
        drawn = solidFacts("sphere", { l: 0, b: 0, h: 0, r: R, r2: 0 });
      } else if (p.kind === "hemisphere") {
        const m = /^M(-?[\d.]+) (-?[\d.]+)A([\d.]+) ([\d.]+) 0 0 1 (-?[\d.]+) (-?[\d.]+)$/.exec(String(shapeBy(r, "dm")?.d ?? ""));
        if (!m || !te) return [...out, "the dome or the base ellipse is missing"];
        const R = (Math.abs(Number(m[5]) - Number(m[1])) / 2) * k;
        c(R, d.r, "the radius");
        if (Number(m[3]) !== Number(m[4]) || !close(Number(m[3]) * k, d.r, 0.015, tol(k) * 2)) out.push("the dome is not a half circle of the radius");
        if (!close(te.rx * k, R, 0.015, tol(k) * 2)) out.push("the base ellipse is not as wide as the dome");
        drawn = solidFacts("hemisphere", { l: 0, b: 0, h: 0, r: R, r2: 0 });
      } else if (p.kind === "cylinder") {
        if (!te || !bf || sd.length !== 4) return [...out, "an ellipse or the sides are missing"];
        const R = te.rx * k;
        const h = (bf.c[1] - te.c[1]) * k;
        c(R, d.r, "the radius");
        c(h, d.h, "the height");
        if (!close(bf.rx, te.rx, 0.01, 0.05) || Math.abs(bf.c[0] - te.c[0]) > 0.1) out.push("the two ends of the cylinder are not the same size or not one above the other");
        if (Math.abs(sd[0]![0] - (te.c[0] - te.rx)) > 0.1 || Math.abs(sd[2]![0] - (te.c[0] + te.rx)) > 0.1) out.push("the sides do not touch the ends of the cylinder");
        drawn = solidFacts("cylinder", { l: 0, b: 0, h, r: R, r2: 0 });
      } else if (p.kind === "cone") {
        if (!bf || sd.length !== 3) return [...out, "the base or the sides are missing"];
        const R = bf.rx * k;
        const h = (bf.c[1] - sd[1]![1]) * k;
        c(R, d.r, "the radius");
        c(h, d.h, "the height");
        if (Math.abs(sd[1]![0] - bf.c[0]) > 0.1) out.push("the apex is not above the centre of the base");
        if (Math.abs(sd[0]![0] - (bf.c[0] - bf.rx)) > 0.1 || Math.abs(sd[2]![0] - (bf.c[0] + bf.rx)) > 0.1) out.push("the sides do not start at the ends of the base");
        c(dist(sd[1]!, sd[2]!) * k, slant(d.r, d.h), "the slant height");
        drawn = solidFacts("cone", { l: 0, b: 0, h, r: R, r2: 0 });
      } else if (p.kind === "frustum") {
        if (!te || !bf || sd.length !== 4) return [...out, "an ellipse or the sides are missing"];
        const R1 = bf.rx * k;
        const R2 = te.rx * k;
        const h = (bf.c[1] - te.c[1]) * k;
        c(R1, p.r1, "the larger radius");
        c(R2, p.r2, "the smaller radius");
        c(h, p.h, "the height");
        if (Math.abs(sd[0]![0] - (bf.c[0] - bf.rx)) > 0.1 || Math.abs(sd[1]![0] - (te.c[0] - te.rx)) > 0.1) out.push("the sides do not join the rims of the two ends");
        drawn = solidFacts("frustum", { l: 0, b: 0, h, r: R1, r2: R2 });
      }
    }
    if (drawn) {
      if (!close(drawn.volume, want.volume, 0.04, 0.05)) out.push(`the volume of the solid as drawn is ${sig(drawn.volume)} and the inputs give ${sig(want.volume)}`);
      if (!close(drawn.total, want.total, 0.04, 0.05)) out.push(`the total surface area of the solid as drawn is ${sig(drawn.total)} and the inputs give ${sig(want.total)}`);
    }
    return out;
  },
});

// ---- nets ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
type NetP = MathsParams<"m_net">;
const rectsPath = (rs: Array<[number, number, number, number]>): string => rs.map(([x, y, w, h]) => `M${r2(x)} ${r2(y)}h${r2(w)}v${r2(h)}h${r2(-w)}z`).join("");
const readRects = (d: unknown): Array<[number, number, number, number]> => [...String(d ?? "").matchAll(/M(-?[\d.]+) (-?[\d.]+)h(-?[\d.]+)v(-?[\d.]+)h/g)].map((m) => [Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4])]);
const coneL = (p: Extract<NetP, { kind: "cone" }>): number => slant(p.r, p.h);
const arcPts = (c: Pt, R: number, from: number, to: number): Pt[] => {
  const n = Math.max(2, Math.ceil(Math.abs(to - from) / 15));
  return Array.from({ length: n + 1 }, (_, i) => [c[0] + R * Math.cos(rad(from + ((to - from) * i) / n)), c[1] + R * Math.sin(rad(from + ((to - from) * i) / n))] as Pt);
};
export const netFigure = mathsFigure("m_net", "net_of_solid", {
  covers: ["Nets of solids and surface area unfolding"],
  readouts(p) {
    if (p.kind === "cuboid") return [num("Length l", p.l), num("Breadth b", p.b), num("Height h", p.h), num("Faces", 6), num("Total surface area", cuboidNetArea(p.l, p.b, p.h)), num("Volume", p.l * p.b * p.h)];
    if (p.kind === "cylinder") return [num("Radius r", p.r), num("Height h", p.h), num("Rectangle width 2 pi r", 2 * Math.PI * p.r), num("Curved surface area", 2 * Math.PI * p.r * p.h), num("Area of two circles", 2 * Math.PI * p.r * p.r), num("Total surface area", 2 * Math.PI * p.r * (p.r + p.h))];
    const l = coneL(p);
    return [num("Radius r", p.r), num("Height h", p.h), num("Slant height l", l), num("Sector angle", coneNetAngle(p.r, l), "deg"), num("Curved surface area", Math.PI * p.r * l), num("Total surface area", Math.PI * p.r * (l + p.r))];
  },
  draw(sk, p) {
    if (p.kind === "cuboid") {
      const rs: Array<[number, number, number, number]> = [[0, p.b, p.l, p.h], [p.l, p.b, p.b, p.h], [p.l + p.b, p.b, p.l, p.h], [2 * p.l + p.b, p.b, p.b, p.h], [0, p.b + p.h, p.l, p.b], [0, 0, p.l, p.b]];
      const f = fitFrame(sk.L.pic, [[0, 0], [2 * (p.l + p.b), p.b * 2 + p.h]]);
      const stage = rs.map(([x, y, w, h]) => [f.at([x, y + h])[0], f.at([x, y + h])[1], w * f.u, h * f.u] as [number, number, number, number]);
      sk.path("nt", rectsPath(stage), { color: "ink", fill: "purple", fillOpacity: 0.1, width: 0.35 });
      sk.text("tl", f.at([p.l / 2, p.b])[0], f.at([p.l / 2, p.b])[1] + 2.2, "l", { anchor: "middle" });
      sk.text("tb", f.at([p.l + p.b / 2, p.b])[0], f.at([p.l + p.b / 2, p.b])[1] + 2.2, "b", { anchor: "middle" });
      sk.text("th", f.at([0, p.b + p.h / 2])[0] - 1.6, f.at([0, p.b + p.h / 2])[1] + 0.9, "h", { anchor: "middle" });
      drawBar(sk, f);
    } else if (p.kind === "cylinder") {
      const W = 2 * Math.PI * p.r;
      const f = fitFrame(sk.L.pic, [[0, -2 * p.r], [W, p.h + 2 * p.r]]);
      sk.rect("rc", ...f.at([0, p.h]), W * f.u, p.h * f.u, { color: "ink", fill: "purple", fillOpacity: 0.1, width: 0.4 });
      sk.circle("c1", ...f.at([W / 2, p.h + p.r]), p.r * f.u, { color: "ink", fill: "purple", fillOpacity: 0.1, width: 0.4 });
      sk.circle("c2", ...f.at([W / 2, -p.r]), p.r * f.u, { color: "ink", fill: "purple", fillOpacity: 0.1, width: 0.4 });
      sk.text("tw", f.at([W / 2, p.h / 2])[0], f.at([W / 2, p.h / 2])[1] + 0.9, "2 pi r", { anchor: "middle" });
      drawBar(sk, f);
    } else {
      const l = coneL(p);
      const alpha = coneNetAngle(p.r, l);
      const arc = arcPts([0, 0], l, 270 - alpha / 2, 270 + alpha / 2);
      const f = fitFrame(sk.L.pic, [...arc, [0, 0], [-p.r, -l - 2 * p.r], [p.r, -l]]);
      const s = (q: Pt): Pt => f.at(q);
      const p1 = s(arc[0]!);
      const p2 = s(arc[arc.length - 1]!);
      const R = r2(l * f.u);
      const c = s([0, 0]);
      sk.path("sh", `M${r2(c[0])} ${r2(c[1])}L${r2(p1[0])} ${r2(p1[1])}A${R} ${R} 0 ${alpha > 180 ? 1 : 0} 0 ${r2(p2[0])} ${r2(p2[1])}Z`, { color: "ink", fill: "purple", fillOpacity: 0.1, width: 0.4 });
      sk.circle("bc", ...s([0, -l - p.r]), p.r * f.u, { color: "ink", fill: "purple", fillOpacity: 0.1, width: 0.4 });
      drawBar(sk, f);
    }
  },
  check(r, p) {
    const k = readUnit(r);
    if (k === null) return need(k);
    const out: string[] = [];
    if (p.kind === "cuboid") {
      const rs = readRects(shapeBy(r, "nt")?.d);
      if (rs.length !== 6) return [...out, `the net has ${rs.length} faces and a cuboid has 6`];
      const m = rs.map(([x, y, w, h]) => [x, y, w * k, h * k] as [number, number, number, number]);
      const area = m.reduce((s, q) => s + q[2] * q[3], 0);
      if (!close(area, cuboidNetArea(p.l, p.b, p.h), 0.02, 0.05)) out.push(`the faces of the net add up to ${sig(area)} and the surface area is ${sig(cuboidNetArea(p.l, p.b, p.h))}`);
      const dims = [p.l, p.b, p.l, p.b];
      [0, 1, 2, 3].forEach((i) => {
        if (!close(m[i]![2], dims[i]!, 0.012, tol(k) * 2) || !close(m[i]![3], p.h, 0.012, tol(k) * 2)) out.push(`strip face ${i + 1} is not ${sig(dims[i]!)} by ${sig(p.h)}`);
        if (i > 0 && Math.abs(rs[i]![0] - (rs[i - 1]![0] + rs[i - 1]![2])) > 0.05) out.push(`strip face ${i + 1} does not start where face ${i} ends`);
      });
      [4, 5].forEach((i) => {
        if (!close(m[i]![2], p.l, 0.012, tol(k) * 2) || !close(m[i]![3], p.b, 0.012, tol(k) * 2)) out.push(`the ${i === 4 ? "top" : "bottom"} face is not ${sig(p.l)} by ${sig(p.b)}`);
      });
      if (Math.abs(rs[4]![0] - rs[0]![0]) > 0.05 || Math.abs(rs[4]![1] + rs[4]![3] - rs[0]![1]) > 0.1) out.push("the top face is not joined to the first face of the strip");
      if (Math.abs(rs[5]![0] - rs[0]![0]) > 0.05 || Math.abs(rs[5]![1] - (rs[0]![1] + rs[0]![3])) > 0.1) out.push("the bottom face is not joined to the first face of the strip");
    } else if (p.kind === "cylinder") {
      const rc = shapeBy(r, "rc");
      const c1 = circleOf(r, "c1");
      const c2 = circleOf(r, "c2");
      if (!rc || !c1 || !c2) return [...out, "the rectangle or a circle is missing"];
      const [w, h, R] = [Number(rc.w) * k, Number(rc.h) * k, c1.r * k];
      if (!close(R, p.r, 0.012, tol(k) * 2)) out.push(`the circles are drawn with radius ${sig(R)} and the inputs give ${sig(p.r)}`);
      if (!close(h, p.h, 0.012, tol(k) * 2)) out.push(`the rectangle is drawn ${sig(h)} high and the inputs give ${sig(p.h)}`);
      if (!close(w, 2 * Math.PI * R, 0.015, tol(k) * 2)) out.push("the rectangle is not as wide as the circumference of the circles (the net would not fold into a cylinder)");
      if (!close(c1.r, c2.r, 0.01, 0.05)) out.push("the two circles are not the same size");
      if (Math.abs(c1.c[1] + c1.r - Number(rc.y)) > 0.1 || Math.abs(c2.c[1] - c2.r - (Number(rc.y) + Number(rc.h))) > 0.1) out.push("a circle does not touch the rectangle");
      const total = w * h + 2 * Math.PI * R * R;
      if (!close(total, 2 * Math.PI * p.r * (p.r + p.h), 0.03, 0.05)) out.push("the faces of the net add up to a different area than the surface area of the cylinder");
    } else {
      const m = /^M(-?[\d.]+) (-?[\d.]+)L(-?[\d.]+) (-?[\d.]+)A([\d.]+) ([\d.]+) 0 ([01]) 0 (-?[\d.]+) (-?[\d.]+)Z$/.exec(String(shapeBy(r, "sh")?.d ?? ""));
      const bc = circleOf(r, "bc");
      if (!m || !bc) return [...out, "the sector or the base circle is missing"];
      const O: Pt = [Number(m[1]), Number(m[2])];
      const P1: Pt = [Number(m[3]), Number(m[4])];
      const P2: Pt = [Number(m[8]), Number(m[9])];
      const L = dist(O, P1);
      const half = Math.acos(Math.max(-1, Math.min(1, ((P1[0] - O[0]) * (P2[0] - O[0]) + (P1[1] - O[1]) * (P2[1] - O[1])) / (dist(O, P1) * dist(O, P2))))) * (180 / Math.PI);
      const alpha = Number(m[7]) === 1 ? 360 - half : half;
      const l = coneL(p);
      if (!close(L * k, l, 0.012, tol(k) * 2) || Math.abs(dist(O, P2) - L) > 0.1 || Math.abs(Number(m[5]) - L) > 0.1) out.push(`the sector has radius ${sig(L * k)} and the slant height is ${sig(l)}`);
      if (!close(bc.r * k, p.r, 0.012, tol(k) * 2)) out.push(`the base circle is drawn with radius ${sig(bc.r * k)} and the inputs give ${sig(p.r)}`);
      if (!closeDeg(alpha, coneNetAngle(p.r, l), 1.5)) out.push(`the sector angle is ${sig(alpha)} degrees and 360 r / l gives ${sig(coneNetAngle(p.r, l))}`);
      if (!close(rad(alpha) * L, 2 * Math.PI * bc.r, 0.025, 0.1)) out.push("the arc of the sector is not as long as the circumference of the base circle (the net would not fold into a cone)");
      if (Math.abs(bc.c[0] - O[0]) > 0.15 || Math.abs(dist(O, bc.c) - (L + bc.r)) > 0.2) out.push("the base circle does not touch the middle of the arc");
    }
    return out;
  },
});

// ---- cross-sections --------------------------------------------------------------------------------------------------------------------------------------------------------------------
type SecP = MathsParams<"m_section">;
const secRho = (p: SecP): number => (p.kind === "sphere" ? sphereSlice(p.r, p.d) : p.kind === "cone" ? coneSlice(p.r, p.h, p.t) : sphereSlice(p.r, p.d));
const SEC_NAME = "Cross-section of a solid by a plane";
export const sectionFigure = mathsFigure("m_section", "cross_section", {
  covers: [SEC_NAME],
  readouts(p) {
    const rho = secRho(p);
    if (p.kind === "sphere") return [num("Radius r", p.r), num("Plane distance d", p.d), num("Section radius", rho), num("Section area", Math.PI * rho * rho), num("d^2 + section^2", p.d * p.d + rho * rho), num("r^2", p.r * p.r)];
    if (p.kind === "cone") return [num("Base radius r", p.r), num("Height h", p.h), num("Plane from the apex", p.t), num("Section radius", rho), num("Section area", Math.PI * rho * rho), num("t / h", p.t / p.h)];
    return [num("Radius r", p.r), num("Height h", p.h), num("Plane distance d", p.d), num("Section width", 2 * rho), num("Section area", 2 * rho * p.h), num("d^2 + half width^2", p.d * p.d + rho * rho)];
  },
  draw(sk, p) {
    const rho = secRho(p);
    const gap = 0.6 * p.r;
    if (p.kind === "sphere") {
      const f = fitFrame(sk.L.pic, [[-1.3 * p.r, -p.r], [3 * p.r + rho + gap, p.r]]);
      const s = S(f);
      sk.circle("cr", ...s([0, 0]), p.r * f.u, { color: "ink", width: 0.4 });
      sk.line("pl", ...s([-1.3 * p.r, p.d]), ...s([1.3 * p.r, p.d]), { color: "soft", dash: true, width: 0.3 });
      sk.line("ch", ...s([-rho, p.d]), ...s([rho, p.d]), { color: "purple", width: 0.6 });
      sk.circle("sx", ...s([2 * p.r + gap + rho, p.d]), rho * f.u, { color: "purple", fill: "purple", fillOpacity: 0.2, width: 0.4 });
      drawBar(sk, f);
    } else if (p.kind === "cone") {
      const f = fitFrame(sk.L.pic, [[-1.3 * p.r, 0], [3 * p.r + rho + gap, p.h]]);
      const s = S(f);
      const y = p.h - p.t;
      sk.polygon("cn", [[0, p.h], [-p.r, 0], [p.r, 0]].map((q) => s(q as Pt)), { color: "ink", fill: "purple", fillOpacity: 0.08, width: 0.4 });
      sk.line("pl", ...s([-1.3 * p.r, y]), ...s([1.3 * p.r, y]), { color: "soft", dash: true, width: 0.3 });
      sk.line("ch", ...s([-rho, y]), ...s([rho, y]), { color: "purple", width: 0.6 });
      sk.circle("sx", ...s([2 * p.r + gap + rho, y]), rho * f.u, { color: "purple", fill: "purple", fillOpacity: 0.2, width: 0.4 });
      drawBar(sk, f);
    } else {
      const f = fitFrame(sk.L.pic, [[-1.3 * p.r, Math.min(-p.r, p.d - p.h / 2)], [3 * p.r + 2 * rho + gap, Math.max(p.r, p.d + p.h / 2)]]);
      const s = S(f);
      sk.circle("cr", ...s([0, 0]), p.r * f.u, { color: "ink", width: 0.4 });
      sk.line("pl", ...s([-1.3 * p.r, p.d]), ...s([1.3 * p.r, p.d]), { color: "soft", dash: true, width: 0.3 });
      sk.line("ch", ...s([-rho, p.d]), ...s([rho, p.d]), { color: "purple", width: 0.6 });
      sk.rect("sx", ...s([2 * p.r + gap, p.d + p.h / 2]), 2 * rho * f.u, p.h * f.u, { color: "purple", fill: "purple", fillOpacity: 0.2, width: 0.4 });
      drawBar(sk, f);
    }
  },
  check(r, p) {
    const k = readUnit(r);
    if (k === null) return need(k);
    const out: string[] = [];
    const ch = lineEnds(r, "ch");
    const pl = lineEnds(r, "pl");
    if (!ch || !pl) return [...out, "the cutting plane or its chord is missing"];
    const half = (dist(ch[0], ch[1]) / 2) * k;
    const rho = secRho(p);
    if (!close(half, rho, 0.015, tol(k) * 2)) out.push(`the cut is drawn ${sig(half * 2)} wide and the inputs give ${sig(rho * 2)}`);
    if (Math.abs(ch[0][1] - pl[0][1]) > 0.1 || Math.abs(ch[1][1] - pl[0][1]) > 0.1) out.push("the chord is not on the cutting plane");
    if (p.kind === "sphere" || p.kind === "cylinder") {
      const cr = circleOf(r, "cr");
      if (!cr) return [...out, "the circle is missing"];
      if (!close(cr.r * k, p.r, 0.012, tol(k) * 2)) out.push(`the circle is drawn with radius ${sig(cr.r * k)} and the inputs give ${sig(p.r)}`);
      const d = Math.abs(cr.c[1] - ch[0][1]) * k;
      if (!close(d, p.d, 0.015, tol(k) * 2)) out.push(`the plane is drawn ${sig(d)} from the centre and the inputs give ${sig(p.d)}`);
      for (const e of ch) if (Math.abs(dist(e, cr.c) - cr.r) > 0.12) out.push("an end of the chord is not on the circle");
      if (!close(Math.hypot(d, half), p.r, 0.015, tol(k) * 2)) out.push("the distance of the plane and the half chord do not make the radius (Pythagoras)");
      if (p.kind === "sphere") {
        const sc = circleOf(r, "sx");
        if (!sc || !close(sc.r * k, half, 0.015, tol(k) * 2)) out.push("the section drawn is not a circle as wide as the cut");
      } else {
        const sc = shapeBy(r, "sx");
        if (!sc || !close((Number(sc.w) / 2) * k, half, 0.015, tol(k) * 2)) out.push("the section drawn is not a rectangle as wide as the cut");
        else if (!close(Number(sc.h) * k, p.h, 0.015, tol(k) * 2)) out.push("the section drawn is not as high as the cylinder");
      }
    } else {
      const cn = polyOf(r, "cn");
      const sc = circleOf(r, "sx");
      if (!cn || cn.length !== 3 || !sc) return [...out, "the cone or the section circle is missing"];
      const [apex, bl, br] = cn as [Pt, Pt, Pt];
      const baseW = ((br[0] - bl[0]) / 2) * k;
      const hh = (bl[1] - apex[1]) * k;
      if (!close(baseW, p.r, 0.012, tol(k) * 2) || !close(hh, p.h, 0.012, tol(k) * 2)) out.push("the cone is not drawn with the radius and the height of the inputs");
      const t = (ch[0][1] - apex[1]) * k;
      if (!close(t, p.t, 0.015, tol(k) * 2)) out.push(`the plane is drawn ${sig(t)} below the apex and the inputs give ${sig(p.t)}`);
      // the chord ends lie on the two slanted sides, and the chord is r t / h wide by similar triangles
      for (const [i, e] of ch.entries()) {
        const side = i === 0 ? bl : br;
        const along = ((e[1] - apex[1]) / (side[1] - apex[1]));
        const xs = apex[0] + along * (side[0] - apex[0]);
        if (Math.abs(xs - e[0]) > 0.15) out.push("an end of the chord is not on a side of the cone");
      }
      if (!sc || !close(sc.r * k, half, 0.015, tol(k) * 2)) out.push("the section circle is not as wide as the chord");
    }
    return out;
  },
});

// ---- points in space ----------------------------------------------------------------------------------------------------------------------------------------------------------------------
type SpaceP = MathsParams<"m_space">;
const spaceEnds = (p: SpaceP): P3[] => (p.mode === "point" ? [[0, 0, 0], [p.x, p.y, p.z]] : [[p.x1, p.y1, p.z1], [p.x2, p.y2, p.z2]]);
const axisExtent = (p: SpaceP): number => Math.max(3, ...spaceEnds(p).flatMap((q) => q.map((v) => Math.abs(v)))) + 1;
const p3word = (q: P3): string => `(${sig(q[0])}, ${sig(q[1])}, ${sig(q[2])})`;
export const spaceFigure = mathsFigure("m_space", "points_in_space", {
  covers: ["Lines and planes in 3D, direction cosines"],
  readouts(p) {
    if (p.mode === "point") {
      const q: P3 = [p.x, p.y, p.z];
      const dc = directionCosines(q);
      return [num("x", p.x), num("y", p.y), num("z", p.z), num("OP", norm3(q)), num("l", dc[0]), num("m", dc[1]), num("n", dc[2]), num("l^2 + m^2 + n^2", dc[0] ** 2 + dc[1] ** 2 + dc[2] ** 2)];
    }
    const [a, b] = spaceEnds(p) as [P3, P3];
    const dd: P3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    return [word("P1", p3word(a)), word("P2", p3word(b)), num("x2 - x1", dd[0]), num("y2 - y1", dd[1]), num("z2 - z1", dd[2]), num("P1P2", dist3(a, b)), num("Sum of squares", dd[0] ** 2 + dd[1] ** 2 + dd[2] ** 2)];
  },
  draw(sk, p) {
    const e = axisExtent(p);
    const ends = spaceEnds(p);
    const proj = (q: P3): Pt => project3(q);
    const ptsFit: Pt[] = [proj([e, 0, 0]), proj([-e, 0, 0]), proj([0, e, 0]), proj([0, -e, 0]), proj([0, 0, e]), proj([0, 0, -e]), ...ends.map(proj)];
    const f = fitFrame(sk.L.pic, ptsFit, 3.2);
    const s = (q: P3): Pt => f.at(proj(q));
    for (const [id, a, b, name] of [["ax", [-e, 0, 0], [e, 0, 0], "x"], ["ay", [0, -e, 0], [0, e, 0], "y"], ["az", [0, 0, -e], [0, 0, e], "z"]] as Array<[string, P3, P3, string]>) {
      sk.line(id, ...s(a), ...s(b), { color: "soft", width: 0.3 });
      sk.text(`n${name}`, s(b)[0] + (name === "y" ? 1.4 : name === "x" ? -1.6 : 1.4), s(b)[1] + (name === "z" ? -1.2 : name === "x" ? 1.6 : 0.9), name, { anchor: "middle" });
    }
    const [a, b] = ends as [P3, P3];
    const step: P3[] = [a, [b[0], a[1], a[2]], [b[0], b[1], a[2]], b];
    sk.path("bx", step.map((q, i) => `${i === 0 ? "M" : "L"}${r2(s(q)[0])} ${r2(s(q)[1])}`).join(""), { color: "purple", dash: true, width: 0.35 });
    sk.line("op", ...s(a), ...s(b), { color: "red", width: 0.5 });
    if (p.mode === "point") {
      sk.circle("pt", ...s(b), 0.7, { color: "ink", fill: "ink", width: 0.3, how: "pop" });
      const text = `P(${sig(p.x)},${sig(p.y)},${sig(p.z)})`;
      const sp = labelSpot([], sk.L.pic, s(b), text, [1, -1], 1.4);
      sk.text("lp", sp.x, sp.y, text, { anchor: sp.anchor });
    } else {
      sk.circle("pt", ...s(a), 0.7, { color: "ink", fill: "ink", width: 0.3, how: "pop" });
      sk.circle("pu", ...s(b), 0.7, { color: "ink", fill: "ink", width: 0.3, how: "pop" });
      sk.text("lp", s(a)[0] - 1.4, s(a)[1] - 1.4, "P1", { anchor: "end" });
      sk.text("lu", s(b)[0] + 1.4, s(b)[1] - 1.4, "P2", { anchor: "start" });
    }
    drawBar(sk, f);
  },
  check(r, p) {
    const k = readUnit(r);
    if (k === null) return need(k);
    const out: string[] = [];
    const [ax, ay, az] = [lineEnds(r, "ax"), lineEnds(r, "ay"), lineEnds(r, "az")];
    const bx = pointsOf(shapeBy(r, "bx")?.d);
    const op = lineEnds(r, "op");
    if (!ax || !ay || !az || bx.length !== 4 || !op) return [...out, "an axis, the staircase or the line is missing"];
    const dirOk = (line: [Pt, Pt], want: Pt, name: string): void => {
      const d: Pt = [line[1][0] - line[0][0], line[1][1] - line[0][1]];
      const w: Pt = [want[0], -want[1]]; // the stage's y runs down
      if (Math.abs(d[0] * w[1] - d[1] * w[0]) / (Math.hypot(...d) * Math.hypot(...w)) > 0.012) out.push(`the ${name} axis is not drawn in the direction of the projection`);
    };
    dirOk(ax, project3([1, 0, 0]), "x");
    dirOk(ay, project3([0, 1, 0]), "y");
    dirOk(az, project3([0, 0, 1]), "z");
    // the origin: the three axes cross there
    const cross = (a: [Pt, Pt], b: [Pt, Pt]): Pt => {
      const d1: Pt = [a[1][0] - a[0][0], a[1][1] - a[0][1]];
      const d2: Pt = [b[1][0] - b[0][0], b[1][1] - b[0][1]];
      const t = ((b[0][0] - a[0][0]) * d2[1] - (b[0][1] - a[0][1]) * d2[0]) / (d1[0] * d2[1] - d1[1] * d2[0]);
      return [a[0][0] + t * d1[0], a[0][1] + t * d1[1]];
    };
    const O = cross(ay, az);
    if (dist(cross(ax, az), O) > 0.15 || dist(cross(ax, ay), O) > 0.15) out.push("the three axes do not cross at one point");
    // the staircase from the first point: x along its axis, then y, then z
    const d1: Pt = [bx[1]![0] - bx[0]![0], bx[1]![1] - bx[0]![1]];
    const d2: Pt = [bx[2]![0] - bx[1]![0], bx[2]![1] - bx[1]![1]];
    const d3: Pt = [bx[3]![0] - bx[2]![0], bx[3]![1] - bx[2]![1]];
    const [dx, dy, dz] = [(-d1[0] * k) / SKEW, d2[0] * k, -d3[1] * k];
    if (Math.abs(d1[1] * k / SKEW - dx) > 0.05 + 0.02 * Math.abs(dx)) out.push("the x step of the staircase is not drawn along the x axis");
    if (Math.abs(d2[1]) > 0.1 || Math.abs(d3[0]) > 0.1) out.push("the y step is not level or the z step is not upright");
    const [a, b] = spaceEnds(p) as [P3, P3];
    const want: P3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const bad = (got: number, w: number): boolean => !close(got, w, 0.02, tol(k) * 2 + 0.02);
    if (bad(dx, want[0]) || bad(dy, want[1]) || bad(dz, want[2])) out.push(`the staircase shows steps of ${sig(dx)}, ${sig(dy)}, ${sig(dz)} and the inputs give ${sig(want[0])}, ${sig(want[1])}, ${sig(want[2])}`);
    const proj = (q: P3): Pt => [O[0] + (project3(q)[0] * 1) / k, O[1] - (project3(q)[1] * 1) / k];
    if (dist(bx[0]!, proj(a)) > 0.2) out.push("the first point is not where its coordinates put it");
    if (dist(bx[3]!, proj(b)) > 0.2) out.push("the second point is not where its coordinates put it");
    if (dist(op[0], bx[0]!) > 0.1 || dist(op[1], bx[3]!) > 0.1) out.push("the red line does not join the two points of the staircase");
    const [c1, c2] = [circleOf(r, "pt"), circleOf(r, "pu")];
    if (!c1 || dist(c1.c, p.mode === "point" ? bx[3]! : bx[0]!) > 0.15) out.push("the dot of the first point is not at its end of the staircase");
    if (p.mode === "distance" && (!c2 || dist(c2.c, bx[3]!) > 0.15)) out.push("the dot of the second point is not at its end of the staircase");
    const distDrawn = Math.hypot(dx, dy, dz);
    if (!close(distDrawn, dist3(a, b), 0.02, 0.05)) out.push(`the distance of the points as drawn is ${sig(distDrawn)} and the inputs give ${sig(dist3(a, b))}`);
    if (p.mode === "point") {
      const l = textAt(r, "lp");
      if (!l || l.text !== `P(${sig(p.x)},${sig(p.y)},${sig(p.z)})`) out.push("the label does not give the coordinates of P");    } else if (textAt(r, "lp")?.text !== "P1" || textAt(r, "lu")?.text !== "P2") out.push("the label P1 or P2 is missing or changed");
    return out;
  },
});
void (null as unknown as DrawResult);
