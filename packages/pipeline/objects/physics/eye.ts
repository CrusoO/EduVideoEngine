import { EYE_LENGTH, NEAR_POINT, hypermetropia, myopia, telescope } from "./compute";
import { physicsDrawer } from "./define";
import { numbersIn, readScale, shapeBy, type Readout } from "./kit";
import { clipRay, drawScaleBar2, inset, len, lensSymbol, lineCross, near, poly, ptsOf, r2, seg, sub, unit, type P } from "./kit-b";

/**
 * The human eye (short sight and long sight, with and without the correcting lens) and the astronomical telescope (ADR 0109). The eye is a model eye 22.7 mm long with one lens; the
 * correcting lens is a thin lens in contact with it, so the powers add. The rays are drawn from the powers, and the read-back finds where the drawn rays meet and compares that with
 * the focus the powers give: in front of the retina for a short-sighted eye, behind it for a long-sighted eye, on it once corrected.
 */
/** The power of the whole eye (dioptres) with or without its correcting lens, and the distance of the object it looks at (Infinity for short sight, the near point of 0.25 m for long sight). */
function eyeModel(p: { mode: "myopia"; far_point: number; corrected: boolean } | { mode: "hypermetropia"; near_point: number; corrected: boolean }) {
  const m = p.mode === "myopia" ? myopia(p.far_point) : hypermetropia(p.near_point);
  const power = m.eyePower + (p.corrected ? m.lensPower : 0);
  const objectInv = p.mode === "myopia" ? 0 : 1 / NEAR_POINT; // 1/u in 1/m
  return { m, power, objectInv, focus: 1 / (power - objectInv), want: p.corrected ? m.corrected : m.focus };
}
export const eyeFigure = physicsDrawer("p_eye", "eye_and_telescope", {
  covers: ["Human eye, microscope, telescope ray paths"],
  readouts(p) {
    if (p.mode === "telescope") {
      const t = telescope(p.f_objective, p.f_eyepiece);
      return [{ key: "fo", value: p.f_objective, unit: "m" }, { key: "fe", value: p.f_eyepiece, unit: "m" }, { key: "Length", value: t.length, unit: "m" }, { key: "M", value: t.magnification, unit: "" }, { key: "Final image", word: "inverted" }];
    }
    const e = eyeModel(p);
    const out: Readout[] = [{ key: p.mode === "myopia" ? "Far point" : "Near point", value: p.mode === "myopia" ? p.far_point : p.near_point, unit: "m" }, { key: "Eye power", value: e.m.eyePower, unit: "D" }, { key: "Retina", value: EYE_LENGTH, unit: "m" }, { key: "Focus", value: e.want, unit: "m" }];
    out.push({ key: "Lens power", value: e.m.lensPower, unit: "D" }, { key: "Lens", word: p.mode === "myopia" ? "concave" : "convex" }, { key: "Corrected", word: p.corrected ? "yes" : "no" });
    return out;
  },
  draw(sk, p) {
    const pic = sk.L.pic;
    const y0 = pic.y + (pic.h - 2.5) / 2;
    if (p.mode === "telescope") {
      const t = telescope(p.f_objective, p.f_eyepiece);
      const s = (pic.w - 12) / t.length; // stage units per metre, on both axes
      const xo = pic.x + 6;
      const xe = xo + t.length * s;
      const aper = Math.min(5.5, (pic.h - 8) / 2);
      const a = 0.35 * aper; // the height at which the ray we follow meets the objective
      const tan = (0.45 * aper) / (t.length * s); // slope of the incoming light on the stage (down the page), small enough that the ray still meets the eyepiece
      sk.path("lo", lensSymbol(xo, y0, aper, true), { width: 0.45, how: "fade" });
      sk.path("le", lensSymbol(xe, y0, aper, true), { width: 0.45, how: "fade" });
      sk.path("ax", seg([pic.x + 0.5, y0], [pic.x + pic.w - 0.5, y0]), { color: "soft", width: 0.25, how: "fade" });
      const q: P = [xo + p.f_objective * s, y0 + p.f_objective * s * tan]; // the intermediate image, one focal length behind the objective
      const hitA: P = [xo, y0 - a];
      sk.arrow("ri", xo - 9, y0 - a - 9 * tan, hitA[0], hitA[1], { width: 0.4 });
      const slope = (q[1] - hitA[1]) / (q[0] - hitA[0]);
      const hitE: P = [xe, hitA[1] + slope * (xe - xo)];
      sk.path("ra", poly([hitA, q, hitE]), { width: 0.35 });
      sk.path("rc", poly([[xo - 5, y0 - 5 * tan], [xo, y0], [xe, y0 + t.length * s * tan]]), { width: 0.3, dash: true });
      // out of the eyepiece the light runs parallel to the line from the intermediate image through the centre of the eyepiece
      const dE = unit([xe - q[0], y0 - q[1]]);
      const room = clipRay(hitE, dE, inset({ x: pic.x, y: pic.y, w: pic.w, h: pic.h - 3.2 }, 0.5));
      const L = Math.min(11, len(sub(room, hitE)));
      sk.arrow("re", hitE[0], hitE[1], hitE[0] + dE[0] * L, hitE[1] + dE[1] * L, { width: 0.4 });
      drawScaleBar2(sk, pic.x + 1, pic.y + pic.h - 1.6, 1 / s, "m");
      return;
    }
    const far = p.mode === "myopia";
    const e = eyeModel(p);
    const s = 14 / EYE_LENGTH;
    const xl = pic.x + pic.w * 0.42;
    const R = (EYE_LENGTH * s) / 2;
    const xr = xl + EYE_LENGTH * s;
    sk.circle("gl", xl + R, y0, R, { color: "soft", width: 0.3 });
    const cr = Math.cos(0.96) * R; // the retina lines the back of the eyeball: an arc of the same circle, from 55 degrees above the axis to 55 degrees below
    const sr = Math.sin(0.96) * R;
    sk.path("rt", `M${r2(xl + R + cr)} ${r2(y0 - sr)}A${r2(R)} ${r2(R)} 0 0 1 ${r2(xl + R + cr)} ${r2(y0 + sr)}`, { width: 0.6, how: "fade" });
    sk.path("ax", seg([pic.x + 0.5, y0], [pic.x + pic.w - 0.5, y0]), { color: "soft", width: 0.2, how: "fade" });
    sk.path("el", lensSymbol(xl, y0, 3.4, true), { width: 0.4, how: "fade" });
    if (p.corrected) sk.path("cl", lensSymbol(xl - 5, y0, 4.2, !far), { width: 0.4, how: "fade" });
    const h = 3;
    for (const [id, sg] of [["ra", -1], ["rb", 1]] as const) {
      const hit: P = [xl, y0 + sg * h];
      const slopeIn = far ? 0 : (-sg * h) / (NEAR_POINT * s); // the ray points at the object on the axis, a quarter of a metre away
      const start: P = [xl - 9, hit[1] - slopeIn * 9];
      const slopeOut = (-sg * h) / (e.focus * s); // towards the point where the rays meet
      sk.path(id, poly([start, hit, [xr, hit[1] + slopeOut * (xr - xl)]]), { width: 0.4 });
    }
    drawScaleBar2(sk, pic.x + 1, pic.y + pic.h - 1.6, 1 / s, "m");
  },
  check(r, p) {
    const out: string[] = [];
    if (p.mode === "telescope") {
      const t = telescope(p.f_objective, p.f_eyepiece);
      const [lo, le, ra, ps] = [ptsOf(r, "lo"), ptsOf(r, "le"), ptsOf(r, "ra"), readScale(r)];
      const ri = shapeBy(r, "ri");
      const re = shapeBy(r, "re");
      if (lo.length < 2 || le.length < 2 || ra.length !== 3 || !ri || !re || ps === undefined) return ["a lens, a ray, an arrow or the scale bar is missing"];
      const sep = (le[0]![0] - lo[0]![0]) * ps;
      if (!near(sep, t.length, 0.006 * t.length)) out.push(`the lenses are ${sep.toPrecision(3)} m apart and the focal lengths give ${t.length.toPrecision(3)}`);
      const [fo, fe] = [(ra[1]![0] - lo[0]![0]) * ps, (le[0]![0] - ra[1]![0]) * ps];
      if (!near(fo, p.f_objective, 0.006 * p.f_objective) || !near(fe, p.f_eyepiece, 0.006 * p.f_eyepiece + 0.0005)) out.push("the intermediate image is not one focal length from each lens");
      const dI: P = [Number(ri.x2) - Number(ri.x1), Number(ri.y2) - Number(ri.y1)];
      const dO: P = [Number(re.x2) - Number(re.x1), Number(re.y2) - Number(re.y1)];
      if (dI[1] * dO[1] >= 0) out.push("the final image of an astronomical telescope is inverted: the emergent ray slopes the other way");
      const M = Math.abs(dO[1] / dO[0]) / Math.abs(dI[1] / dI[0]);
      if (!near(M, t.magnification, 0.02 * t.magnification + 0.01)) out.push(`the drawn rays give a magnification of ${M.toPrecision(3)} and the focal lengths give ${t.magnification.toPrecision(3)}`);
      return out;
    }
    const ps = readScale(r);
    const rt = shapeBy(r, "rt");
    const gl = shapeBy(r, "gl");
    const el = ptsOf(r, "el");
    const [ra, rb] = [ptsOf(r, "ra"), ptsOf(r, "rb")];
    if (ps === undefined || !rt || !gl || el.length < 2 || ra.length !== 3 || rb.length !== 3) return ["the retina, the lens, a ray or the scale bar is missing"];
    const xl = el[0]![0];
    if (!near((Number(gl.cx) + Number(gl.r) - xl) * ps, EYE_LENGTH, 0.01 * EYE_LENGTH)) out.push("the back of the eye is not at the length of the eye");
    const nn = numbersIn(String(rt.d));
    const rp: P[] = nn.length === 9 ? [[nn[0]!, nn[1]!], [nn[7]!, nn[8]!]] : [];
    if (rp.length !== 2 || rp.some(([x, y]) => !near(Math.hypot(x - Number(gl.cx), y - Number(gl.cy)), Number(gl.r), 0.1))) out.push("the retina is not on the back of the eyeball");
    // where the two rays meet after the lens, measured on the drawing; the powers decide where it should be
    const e = eyeModel(p);
    const x = lineCross(ra[1]!, sub(ra[2]!, ra[1]!), rb[1]!, sub(rb[2]!, rb[1]!));
    if (!x) out.push("the two rays are parallel after the lens");
    else if (!near((x[0] - xl) * ps, e.want, 0.012 * e.want + 0.0004)) out.push(`the drawn rays meet ${((x[0] - xl) * ps).toPrecision(3)} m behind the lens and the powers give ${e.want.toPrecision(3)}`);
    const cl = ptsOf(r, "cl");
    if (p.corrected !== cl.length > 0) out.push("the correcting lens is drawn exactly when the eye is corrected");
    else if (p.corrected && cl[0]![0] >= xl) out.push("the correcting lens is in front of the eye");
    const side = (e.want - EYE_LENGTH) / EYE_LENGTH;
    if (p.corrected && Math.abs(side) > 0.01) out.push("a corrected eye focuses on the retina");
    if (!p.corrected && (p.mode === "myopia" ? side >= 0 : side <= 0)) out.push(p.mode === "myopia" ? "a short-sighted eye focuses in front of the retina" : "a long-sighted eye focuses behind the retina");
    return out;
  },
});
