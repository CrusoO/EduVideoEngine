import { arrowBy, drawGraph, polyD, r2, readGraph, shapeBy, type Box, type Readout, type ReadGraph } from "../physics/kit";
import {
  AXES, angleBetween, applyTf, clipLine, cross2, deg, direction, dist, dot2, magnitude, midpoint, rad, signedArea, sub2, type MirrorAxis, type Pt, type TfSpec,
} from "./compute";
import { checkVertexLabels, close, closeDeg, dotAt, gx, gy, lineEnds, mathsFigure, polyOf, readDot, sigs as sig, squareWindow, textAt, vertexLabels, tidy } from "./mkit";
import type { MathsParams } from "./params";

/**
 * The figures that move or add things on the plane (ADR 0112): a reflection, turn, translation or dilation of a triangle, and 2-D vectors (a sum, components, a dot product). Both stand on
 * axes and are read back through them. A transformation is read back by recomputing it from the drawn triangle: the image must be what the rule gives for the triangle that is drawn, not only
 * for the one the inputs name, and the mirror line, the centre of the turn or the arrow of the translation must be where the drawn points say it is.
 */
const word = (key: string, w: string): Readout => ({ key, word: w });
const num = (key: string, value: number, unit = ""): Readout => ({ key, value: tidy(value), unit });
const pt = (p: Pt): string => `(${sig(p[0])}, ${sig(p[1])})`;

// ---- transformations ----------------------------------------------------------------------------------------------------------------------------------------------------------------------
type TfP = MathsParams<"m_transform">;
const preOf = (p: TfP): Pt[] => [[p.ax, p.ay], [p.bx, p.by], [p.cx, p.cy]];
const tfOf = (p: TfP): TfSpec => {
  switch (p.kind) {
    case "reflect": return { kind: "reflect", axis: p.axis, k: p.k };
    case "rotate": return { kind: "rotate", angle: p.angle, o: [p.ox, p.oy] };
    case "translate": return { kind: "translate", d: [p.dx, p.dy] };
    case "dilate": return { kind: "dilate", k: p.k, o: [p.ox, p.oy] };
  }
};
const AXIS_WORD: Record<MirrorAxis, string> = { x_axis: "reflect in the x axis", y_axis: "reflect in the y axis", y_eq_x: "reflect in the line y = x", y_eq_neg_x: "reflect in the line y = -x", x_eq_k: "reflect in x equal to ", y_eq_k: "reflect in y equal to " };
const ruleWord = (t: TfSpec): string => {
  switch (t.kind) {
    case "reflect": return t.axis === "x_eq_k" || t.axis === "y_eq_k" ? `${AXIS_WORD[t.axis]}${sig(t.k)}` : AXIS_WORD[t.axis];
    case "rotate": return `turn ${sig(t.angle)} deg about ${pt(t.o)}`;
    case "translate": return `translate by ${pt(t.d)}`;
    case "dilate": return `scale ${sig(t.k)} about ${pt(t.o)}`;
  }
};
/** The line of a reflection as two end points inside a window w (for the picture and for the read-back). */
const mirrorEnds = (axis: MirrorAxis, k: number, w: { lo: number; hi: number }): [Pt, Pt] => {
  const box = { x0: w.lo, x1: w.hi, y0: w.lo, y1: w.hi };
  switch (axis) {
    case "x_axis": return [[w.lo, 0], [w.hi, 0]];
    case "y_axis": return [[0, w.lo], [0, w.hi]];
    case "x_eq_k": return [[k, w.lo], [k, w.hi]];
    case "y_eq_k": return [[w.lo, k], [w.hi, k]];
    case "y_eq_x": return clipLine(1, 0, box)!;
    case "y_eq_neg_x": return clipLine(-1, 0, box)!;
  }
};
const tfWindow = (p: TfP): { lo: number; hi: number } => {
  const t = tfOf(p);
  const pre = preOf(p);
  const img = pre.map((q) => applyTf(q, t));
  const extra: Pt[] = t.kind === "rotate" || t.kind === "dilate" ? [t.o] : t.kind === "reflect" && t.axis === "x_eq_k" ? [[t.k, 0]] : t.kind === "reflect" && t.axis === "y_eq_k" ? [[0, t.k]] : [];
  const all = [...pre, ...img, ...extra];
  const w = squareWindow(all.map((q) => q[0]), all.map((q) => q[1]));
  return { lo: w.x[0], hi: w.x[1] };
};
const centroidOf = (pts: Pt[]): Pt => [pts.reduce((s, q) => s + q[0], 0) / pts.length, pts.reduce((s, q) => s + q[1], 0) / pts.length];
export const transformFigure = mathsFigure("m_transform", "transformation", {
  covers: ["Reflection, rotation, translation, dilation, symmetry"],
  readouts(p) {
    const t = tfOf(p);
    const pre = preOf(p);
    const img = pre.map((q) => applyTf(q, t));
    const k = t.kind === "dilate" ? Math.abs(t.k) : 1;
    return [
      ...["A'", "B'", "C'"].map((n, i) => word(n, pt(img[i]!))), word("Rule", ruleWord(t)), num("Area ratio", k * k),
      word("Lengths", k === 1 ? "unchanged" : `times ${sig(k)}`), word("Orientation", Math.sign(signedArea(img)) === Math.sign(signedArea(pre)) ? "kept" : "reversed"),
    ];
  },
  draw(sk, p) {
    const t = tfOf(p);
    const pre = preOf(p);
    const img = pre.map((q) => applyTf(q, t));
    const w = tfWindow(p);
    const f = drawGraph(sk, { xName: "x", xUnit: "", yName: "y", yUnit: "", xwin: [w.lo, w.hi], ywin: [w.lo, w.hi], series: [], equalScale: true });
    const S = (q: Pt): Pt => [f.X(q[0]), f.Y(q[1])];
    if (t.kind === "reflect") sk.line("mr", ...mirrorEnds(t.axis, t.k, w).flatMap((q) => S(q)) as [number, number, number, number], { color: "soft", dash: true, width: 0.3 });
    sk.polygon("pre", pre.map(S), { color: "ink", fill: "ink", fillOpacity: 0.12, width: 0.4 });
    sk.polygon("img", img.map(S), { color: "purple", fill: "purple", fillOpacity: 0.2, width: 0.4, dash: true });
    if (t.kind === "rotate" || t.kind === "dilate") dotAt(sk, "oc", f.X, f.Y, t.o[0], t.o[1], { fill: "red", color: "red", r: 0.7 });
    if (t.kind === "translate") sk.arrow("tv", ...S(pre[0]!), ...S(img[0]!), { color: "red", width: 0.4 });
    if (t.kind === "dilate") sk.path("rays", pre.map((q, i) => `M${r2(S(t.o)[0])} ${r2(S(t.o)[1])}L${r2(S(img[i]!)[0])} ${r2(S(img[i]!)[1])}`).join(""), { color: "soft", dash: true, width: 0.2 });
    const taken: Box[] = [];
    const bounds: Box = { x: f.l + 0.2, y: f.t + 0.8, w: f.r - f.l - 0.4, h: f.b - f.t - 1.6 };
    vertexLabels(sk, pre.map(S), ["A", "B", "C"], centroidOf(pre.map(S)), "la", taken, bounds);
    vertexLabels(sk, img.map(S), ["A'", "B'", "C'"], centroidOf(img.map(S)), "lb", taken, bounds);
  },
  check(r, p) {
    const g = readGraph(r);
    if (!g.ok) return [g.why];
    const out: string[] = [];
    const t = tfOf(p);
    const w = tfWindow(p);
    if (g.xwin[0] !== w.lo || g.xwin[1] !== w.hi || g.ywin[0] !== w.lo || g.ywin[1] !== w.hi) out.push("the printed window of the axes is not the one the figure needs");
    const phys = (id: string): Pt[] | null => polyOf(r, id)?.map(([x, y]) => [g.toX(x), g.toY(y)] as Pt) ?? null;
    const stage = (id: string): Pt[] => polyOf(r, id) ?? [];
    const pre = phys("pre");
    const img = phys("img");
    if (!pre || !img || pre.length !== 3 || img.length !== 3) return [...out, "the triangle or its image is not drawn"];
    const want = preOf(p);
    const tol = Math.max(gx(g, 0.3), gy(g, 0.3));
    if (pre.some((q, i) => dist(q, want[i]!) > tol * 1.5)) out.push("the triangle drawn is not the one the inputs give");
    // the image must be the rule applied to the triangle that is drawn
    const expect = pre.map((q) => applyTf(q, t));
    if (img.some((q, i) => dist(q, expect[i]!) > tol * 2)) out.push("the image drawn is not what the rule gives for the triangle drawn");
    if (t.kind === "reflect") {
      const m = lineEnds(r, "mr");
      if (!m) out.push("the mirror line is missing");
      else {
        const [m0, m1] = m.map(([x, y]) => [g.toX(x), g.toY(y)] as Pt) as [Pt, Pt];
        const d = sub2(m1, m0);
        const len = magnitude(d);
        pre.forEach((q, i) => {
          const mid = midpoint(q, img[i]!);
          if (Math.abs(cross2(d, sub2(mid, m0))) / len > tol * 2) out.push(`the mirror line does not pass through the middle of ${"ABC"[i]} and its image`);
          if (dist(q, img[i]!) > 1e-9 && Math.abs(dot2(d, sub2(img[i]!, q))) / (len * dist(q, img[i]!)) > 0.02) out.push(`the line from ${"ABC"[i]} to its image is not at right angles to the mirror`);
        });
      }
    }
    if (t.kind === "rotate" || t.kind === "dilate") {
      const o = readDot(r, g, "oc");
      if (!o || dist([o.x, o.y], t.o) > tol * 1.5) out.push("the centre is not marked where the inputs put it");
      else {
        const O: Pt = [o.x, o.y];
        pre.forEach((q, i) => {
          if (t.kind === "rotate") {
            if (!close(dist(O, q), dist(O, img[i]!), 0.02, tol * 2)) out.push(`${"ABC"[i]} and its image are not the same distance from the centre`);
            const a = angleBetween(sub2(q, O), sub2(img[i]!, O));
            const wantA = Math.abs(((t.angle % 360) + 540) % 360 - 180);
            if (dist(O, q) > 1e-6 && !closeDeg(a, wantA, 1.2)) out.push(`${"ABC"[i]} is turned through ${sig(a)} degrees about the centre and the rule says ${sig(wantA)}`);
          } else if (dist(sub2(img[i]!, O), [t.k * (q[0] - O[0]), t.k * (q[1] - O[1])]) > tol * 2.5) out.push(`${"ABC"[i]}' is not ${sig(t.k)} times as far from the centre as ${"ABC"[i]}`);
        });
      }
    }
    if (t.kind === "translate") {
      const a = arrowBy(r, "tv");
      if (!a) out.push("the arrow of the translation is missing");
      else {
        const v: Pt = [g.toX(a.x2) - g.toX(a.x1), g.toY(a.y2) - g.toY(a.y1)];
        if (dist(v, t.d) > tol * 2) out.push(`the arrow shows a translation by ${pt(v)} and the rule says ${pt(t.d)}`);
      }
    }
    // reflections reverse the orientation, the others keep it; lengths scale by |k|
    const k = t.kind === "dilate" ? Math.abs(t.k) : 1;
    if (!close(dist(img[0]!, img[1]!), k * dist(pre[0]!, pre[1]!), 0.02, tol * 2)) out.push("a side of the image is not the right multiple of the side of the triangle");
    out.push(...checkVertexLabels(r, stage("pre"), ["A", "B", "C"], "la"), ...checkVertexLabels(r, stage("img"), ["A'", "B'", "C'"], "lb"));
    return out;
  },
});

// ---- vectors -----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
type VecP = MathsParams<"m_vector">;
const vecs = (p: VecP): { a: Pt; b: Pt } => (p.mode === "components" ? { a: [p.mag * Math.cos(rad(p.angle)), p.mag * Math.sin(rad(p.angle))] as Pt, b: [0, 0] as Pt } : { a: [p.ax, p.ay] as Pt, b: [p.bx, p.by] as Pt });
const clean = (q: Pt): Pt => [Math.abs(q[0]) < 1e-12 ? 0 : q[0], Math.abs(q[1]) < 1e-12 ? 0 : q[1]];
const vecWindow = (p: VecP): { lo: number; hi: number } => {
  const { a, b } = vecs(p);
  const pts: Pt[] = p.mode === "add" ? [[0, 0], a, b, [a[0] + b[0], a[1] + b[1]]] : p.mode === "components" ? [[0, 0], clean(a), [clean(a)[0], 0]] : [[0, 0], a, b];
  const w = squareWindow(pts.map((q) => q[0]), pts.map((q) => q[1]));
  return { lo: w.x[0], hi: w.x[1] };
};
const relationWord = (a: Pt, b: Pt): string => (Math.abs(dot2(a, b)) < 1e-9 ? "perpendicular" : Math.abs(cross2(a, b)) < 1e-9 ? "parallel" : "neither");
export const vectorFigure = mathsFigure("m_vector", "vectors_2d", {
  covers: ["2D/3D vectors: addition, components, dot and cross product"],
  readouts(p) {
    const { a, b } = vecs(p);
    if (p.mode === "add") return [word("a", pt(a)), word("b", pt(b)), word("a + b", pt([a[0] + b[0], a[1] + b[1]])), num("Length of a", magnitude(a)), num("Length of b", magnitude(b)), num("Length of a + b", magnitude([a[0] + b[0], a[1] + b[1]])), num("Direction of a + b", direction([a[0] + b[0], a[1] + b[1]]), "deg")];
    if (p.mode === "components") {
      const v = clean(a);
      return [num("Magnitude", p.mag), num("Angle", p.angle, "deg"), num("x component", v[0]), num("y component", v[1]), num("x^2 + y^2", v[0] * v[0] + v[1] * v[1])];
    }
    return [num("Length of a", magnitude(a)), num("Length of b", magnitude(b)), num("a . b", dot2(a, b)), num("Angle between", angleBetween(a, b), "deg"), num("a x b (z)", cross2(a, b)), word("Relation", relationWord(a, b))];
  },
  draw(sk, p) {
    const { a, b } = vecs(p);
    const w = vecWindow(p);
    const f = drawGraph(sk, { xName: "x", xUnit: "", yName: "y", yUnit: "", xwin: [w.lo, w.hi], ywin: [w.lo, w.hi], series: [], equalScale: true });
    const S = (q: Pt): Pt => [f.X(q[0]), f.Y(q[1])];
    const label = (id: string, from: Pt, to: Pt, text: string): void => {
      const [x1, y1] = S(from);
      const [x2, y2] = S(to);
      const d = Math.hypot(x2 - x1, y2 - y1) || 1;
      sk.text(id, (x1 + x2) / 2 + ((y2 - y1) / d) * 2, (y1 + y2) / 2 - ((x2 - x1) / d) * 2 + 0.9, text, { anchor: "middle" });
    };
    if (p.mode === "add") {
      const r: Pt = [a[0] + b[0], a[1] + b[1]];
      sk.path("pl", `M${r2(S([0, 0])[0])} ${r2(S([0, 0])[1])}L${r2(S(b)[0])} ${r2(S(b)[1])}L${r2(S(r)[0])} ${r2(S(r)[1])}`, { color: "soft", dash: true, width: 0.25 });
      sk.arrow("va", ...S([0, 0]), ...S(a), { color: "ink", width: 0.45 });
      sk.arrow("vb", ...S(a), ...S(r), { color: "purple", width: 0.45 });
      sk.arrow("vr", ...S([0, 0]), ...S(r), { color: "red", width: 0.5 });
      label("la", [0, 0], a, "a");
      label("lb", a, r, "b");
      label("lr", [0, 0], r, "a + b");
    } else if (p.mode === "components") {
      const v = clean(a);
      sk.arrow("cx", ...S([0, 0]), ...S([v[0], 0]), { color: "red", width: 0.45 });
      sk.arrow("cy", ...S([v[0], 0]), ...S(v), { color: "purple", width: 0.45 });
      sk.arrow("vv", ...S([0, 0]), ...S(v), { color: "ink", width: 0.5 });
      label("lv", [0, 0], v, "v");
    } else {
      sk.arrow("va", ...S([0, 0]), ...S(a), { color: "ink", width: 0.45 });
      sk.arrow("vb", ...S([0, 0]), ...S(b), { color: "purple", width: 0.45 });
      const ua: Pt = [a[0] / magnitude(a), a[1] / magnitude(a)];
      const ub: Pt = [b[0] / magnitude(b), b[1] / magnitude(b)];
      const mid: Pt = [ua[0] + ub[0], ua[1] + ub[1]];
      const mm = magnitude(mid);
      const rho = 1.2;
      const wedge: Pt[] = [S([0, 0]), S([ua[0] * rho, ua[1] * rho]), ...(mm > 1e-9 ? [S([(mid[0] / mm) * rho, (mid[1] / mm) * rho])] : []), S([ub[0] * rho, ub[1] * rho])];
      if (wedge.length >= 3) sk.polygon("wg", wedge, { color: "ink", fill: "red", fillOpacity: 0.25, width: 0.2 });
      label("la", [0, 0], a, "a");
      label("lb", [0, 0], b, "b");
    }
  },
  check(r, p) {
    const g = readGraph(r);
    if (!g.ok) return [g.why];
    const out: string[] = [];
    const w = vecWindow(p);
    if (g.xwin[0] !== w.lo || g.xwin[1] !== w.hi || g.ywin[0] !== w.lo || g.ywin[1] !== w.hi) out.push("the printed window of the axes is not the one the vectors need");
    const tol = Math.max(gx(g, 0.3), gy(g, 0.3)) * 2;
    const arrow = (id: string): { tail: Pt; head: Pt } | null => {
      const a = arrowBy(r, id);
      return a ? { tail: [g.toX(a.x1), g.toY(a.y1)], head: [g.toX(a.x2), g.toY(a.y2)] } : null;
    };
    const { a, b } = vecs(p);
    const v = (x: { tail: Pt; head: Pt }): Pt => sub2(x.head, x.tail);
    // each label is the right text and stands next to its own arrow, not another
    const labelOf = (id: string, text: string, arrowId: string): void => {
      const t = textAt(r, id);
      const ar = arrowBy(r, arrowId);
      if (!t || t.text !== text) return void out.push(`the label ${text} is missing or changed`);
      if (ar) {
        const mid: Pt = [(ar.x1 + ar.x2) / 2, (ar.y1 + ar.y2) / 2];
        const others = ["va", "vb", "vr", "vv", "cx", "cy"].filter((o) => o !== arrowId).map((o) => arrowBy(r, o)).filter((q) => q !== undefined).map((q) => [(q!.x1 + q!.x2) / 2, (q!.y1 + q!.y2) / 2] as Pt);
        if (dist(t.at, mid) > 4.5 || others.some((o) => dist(t.at, o) < dist(t.at, mid) - 0.01)) out.push(`the label ${text} does not stand next to its arrow`);
      }
    };
    if (p.mode === "add") {
      const [va, vb, vr] = [arrow("va"), arrow("vb"), arrow("vr")];
      if (!va || !vb || !vr) return [...out, "an arrow of the sum is missing"];
      if (dist(va.tail, [0, 0]) > tol || dist(v(va), a) > tol) out.push("the arrow a is not the vector a from the origin");
      if (dist(vb.tail, va.head) > tol) out.push("the arrow b does not start where the arrow a ends (the triangle law)");
      if (dist(v(vb), b) > tol) out.push("the arrow b is not the vector b");
      const sum: Pt = [v(va)[0] + v(vb)[0], v(va)[1] + v(vb)[1]];
      if (dist(vr.tail, [0, 0]) > tol || dist(v(vr), sum) > tol * 1.5) out.push("the red arrow is not the sum of the two arrows drawn");
      if (dist(v(vr), [a[0] + b[0], a[1] + b[1]]) > tol * 1.5) out.push("the red arrow is not the sum a + b that the inputs give");
      labelOf("la", "a", "va");
      labelOf("lb", "b", "vb");
      labelOf("lr", "a + b", "vr");
    } else if (p.mode === "components") {
      const [cx, cy, vv] = [arrow("cx"), arrow("cy"), arrow("vv")];
      if (!cx || !cy || !vv) return [...out, "an arrow of the components is missing"];
      const want = clean(a);
      if (dist(v(vv), want) > tol) out.push("the vector drawn is not the one the magnitude and the angle give");
      const sum: Pt = [v(cx)[0] + v(cy)[0], v(cx)[1] + v(cy)[1]];
      if (dist(sum, v(vv)) > tol * 1.5) out.push("the two components drawn do not add up to the vector drawn");
      if (Math.abs(v(cx)[1]) > tol || Math.abs(v(cy)[0]) > tol) out.push("a component is not along its axis");
      if (!close(Math.hypot(v(cx)[0], v(cy)[1]), p.mag, 0.03, tol * 2)) out.push("the components drawn do not give the magnitude (x^2 + y^2 is not the square of it)");
      labelOf("lv", "v", "vv");
    } else {
      const [va, vb] = [arrow("va"), arrow("vb")];
      if (!va || !vb) return [...out, "an arrow of the pair is missing"];
      if (dist(v(va), a) > tol || dist(v(vb), b) > tol) out.push("an arrow drawn is not its vector");
      const ang = angleBetween(v(va), v(vb));
      if (!closeDeg(ang, angleBetween(a, b), 1.5)) out.push(`the angle between the arrows drawn is ${sig(ang)} and the vectors give ${sig(angleBetween(a, b))}`);
      const d = dot2(v(va), v(vb));
      if (!close(d, dot2(a, b), 0.05, tol * 12)) out.push("the dot product of the arrows drawn is not the one the vectors give");
      labelOf("la", "a", "va");
      labelOf("lb", "b", "vb");
      const wg = polyOf(r, "wg");
      if (wg && wg.length >= 3) {
        const wa = angleBetween(sub2(wg[1]!, wg[0]!), sub2(wg[wg.length - 1]!, wg[0]!));
        if (!closeDeg(wa, angleBetween(a, b), 2)) out.push(`the wedge shows ${sig(wa)} degrees and the angle between the vectors is ${sig(angleBetween(a, b))}`);
      } else if (relationWord(a, b) !== "parallel") out.push("the angle wedge is missing");
      if (relationWord(v(va), v(vb)) !== relationWord(a, b) && Math.abs(dot2(a, b)) > 1e-9 && Math.abs(cross2(a, b)) > 1e-9) out.push("the arrows drawn are perpendicular or parallel when the vectors are neither");
    }
    return out;
  },
});
void AXES;
void deg;
void direction;
void shapeBy;
void polyD;
void (null as unknown as ReadGraph);
