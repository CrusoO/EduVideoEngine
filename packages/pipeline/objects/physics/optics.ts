import type { DrawResult } from "../registry";
import { fringeWidth, doubleSlitIntensity, singleSlitIntensity, singleSlitMinimum, imageOf, imageWords, prism as prismTrace, refractVec, slabShift, snell, deg, rad } from "./compute";
import { physicsDrawer } from "./define";
import { checkCurve, drawGraph, niceWindow, readGraph, readScale, shapeBy, type Readout, type Sketch } from "./kit";
import { add, clipRay, dot, drawScaleBar2, inset, len, lensSymbol, lineCross, mul, near, poly, ptsOf, seg, sub, unit, type P } from "./kit-b";

/**
 * The optics figures of wave 2 (ADR 0109): mirrors and lenses, refraction and total internal reflection, the prism, the eye and the telescope, and the interference patterns. A ray
 * diagram is drawn from the thin-lens and mirror formula in the paraxial picture (the device is a line, rays bend at it), to ONE scale on both axes and a drawn scale bar. The
 * read-back never trusts the formula alone: it measures the object, the image and the rays off the drawing, and checks that the drawn rays really cross at the drawn image.
 */

// ---- mirrors and lenses ---------------------------------------------------------------------------------------------------------------------------------------------------------------
type Optic = { kind: "mirror" | "lens"; shape: string; fs: number | null; fa: number; u: number; ho: number; v: number; m: number; hi: number; xImg: number; real: boolean; words: ReturnType<typeof imageWords> };
const nice3 = (x: number): number => Number(x.toPrecision(3));
function opticOf(kind: "mirror" | "lens", shape: "plane" | "concave" | "convex", f: number | undefined, u: number, hIn: number | undefined): Optic {
  if (shape === "plane") {
    const ho = hIn ?? nice3(0.25 * u);
    const i = { v: -u, m: 1, hImage: ho, real: false, inverted: false, enlarged: false, same: true };
    return { kind, shape, fs: null, fa: 0, u, ho, v: -u, m: 1, hi: ho, xImg: u, real: false, words: imageWords(i) };
  }
  const fs = shape === "convex" && kind === "mirror" ? -f! : shape === "concave" && kind === "lens" ? -f! : f!;
  const i0 = imageOf(fs, u, 1);
  const ho = hIn ?? nice3((0.25 * Math.min(u, f!, Math.abs(i0.v))) / Math.max(1, Math.abs(i0.m)));
  const i = imageOf(fs, u, ho);
  return { kind, shape, fs, fa: f!, u, ho, v: i.v, m: i.m, hi: i.hImage, xImg: kind === "mirror" ? -i.v : i.v, real: i.real, words: imageWords(i) };
}
type Ray = { id: string; hit: P; dir: P };
/** The rays of the diagram in metres (y up, device at x = 0, object at x = -u): the object tip, where each ray meets the device and the direction it leaves in. */
function raysOf(o: Optic): { tip: P; rays: Ray[]; apertureM: number } {
  const tip: P = [-o.u, o.ho];
  const rays: Ray[] = [];
  const aperture = 1.3 * Math.max(o.ho, Math.abs(o.hi));
  if (o.fs === null) {
    rays.push({ id: "ra", hit: [0, 0], dir: [-o.u, -o.ho] }, { id: "rc", hit: [0, -o.ho], dir: [-o.u, -2 * o.ho] });
    return { tip, rays, apertureM: aperture };
  }
  const fs = o.fs;
  const sgn = Math.sign(fs);
  if (o.kind === "mirror") rays.push({ id: "ra", hit: [0, o.ho], dir: mul(sub([-fs, 0], [0, o.ho]), sgn) }, { id: "rc", hit: [0, 0], dir: [-o.u, -o.ho] });
  else rays.push({ id: "ra", hit: [0, o.ho], dir: mul(sub([fs, 0], [0, o.ho]), sgn) }, { id: "rc", hit: [0, 0], dir: [o.u, -o.ho] });
  const y2 = (o.ho * fs) / (fs - o.u);
  if (Math.abs(y2) <= aperture) rays.push({ id: "rb", hit: [0, y2], dir: o.kind === "mirror" ? [-1, 0] : [1, 0] });
  return { tip, rays, apertureM: aperture };
}
function opticReadouts(o: Optic): Readout[] {
  const out: Readout[] = [{ key: "u", value: o.u, unit: "m" }];
  if (o.fs !== null) out.push({ key: "f", value: o.fa, unit: "m" });
  out.push({ key: "v", value: Math.abs(o.v), unit: "m" }, { key: "m", value: o.m, unit: "" }, { key: "ho", value: o.ho, unit: "m" }, { key: "hi", value: o.hi, unit: "m" }, { key: "Nature", word: o.words.nature }, { key: "Image", word: o.words.orient }, { key: "Size", word: o.words.size });
  return out;
}
const SIDE = 0.5;
function drawOptic(sk: Sketch, o: Optic): void {
  const pic = sk.L.pic;
  const { tip, rays, apertureM } = raysOf(o);
  const img: P = [o.xImg, o.hi];
  const fx: number[] = o.fs === null ? [] : o.kind === "mirror" ? [-o.fs, -2 * o.fs] : [-o.fs, o.fs];
  const xs = [-o.u, o.xImg, 0, ...fx];
  const left = -Math.min(...xs);
  const right = Math.max(...xs);
  const usableH = pic.h - 4.8;
  const sX = (pic.w - 2 * SIDE - 1) / (left + right);
  const sY = (usableH / 2 - 0.8) / apertureM;
  const s = Math.min(sX, sY);
  const y0 = pic.y + 0.8 + usableH / 2;
  const x0 = pic.x + SIDE + (pic.w - 2 * SIDE - (left + right) * s) / 2 + left * s;
  const S = (q: P): P => [x0 + q[0] * s, y0 - q[1] * s];
  const box = inset({ x: pic.x, y: pic.y + 0.4, w: pic.w, h: usableH + 0.8 }, 0.3);
  sk.path("ax", seg([pic.x + 0.5, y0], [pic.x + pic.w - 0.5, y0]), { color: "soft", width: 0.25, how: "fade" });
  // the device: a line (the plane the rays bend at) with the marks of its kind
  const half = Math.min(apertureM * s, usableH / 2 - 0.4);
  const top: P = [x0, y0 - half];
  const bot: P = [x0, y0 + half];
  let dv = seg(top, bot);
  if (o.kind === "mirror") for (let k = 0; k <= 6; k++) dv += seg([x0, y0 - half + (k * 2 * half) / 6], [x0 + 1.1, y0 - half + (k * 2 * half) / 6 + 1.1]); // hatching on the back of the mirror
  else dv = lensSymbol(x0, y0, half, o.shape === "convex");
  sk.path("dv", dv, { width: 0.45, how: "fade" });
  sk.arrow("ob", S([-o.u, 0])[0], y0, S(tip)[0], S(tip)[1], { width: 0.5 });
  sk.arrow("im", S([o.xImg, 0])[0], y0, S(img)[0], S(img)[1], { width: 0.5, dash: !o.real });
  const virt: string[] = [];
  for (const r of rays) {
    const h = S(r.hit);
    let end: P;
    if (o.real && o.fs !== null) {
      const t = len(sub(S(img), h)) * 1.35;
      const free = clipRay(h, r.dir.map((v, k) => (k === 1 ? -v : v)) as P, box);
      end = add(h, mul(unit([r.dir[0], -r.dir[1]]), Math.min(t, len(sub(free, h)))));
    } else end = clipRay(h, [r.dir[0], -r.dir[1]], box);
    sk.path(r.id, poly([S(tip), h, end]), { width: 0.35 });
    if (!o.real) virt.push(seg(h, S(img)));
  }
  if (!o.real) sk.path("ve", virt.join(""), { color: "soft", dash: true, width: 0.25 });
  if (fx.length) {
    sk.path("fp", fx.map((q) => seg([S([q, 0])[0], y0 - 0.9], [S([q, 0])[0], y0 + 0.9])).join(""), { width: 0.35 });
    const lab = o.kind === "mirror" ? ["F", "C"] : ["F", "F"];
    const gap = Math.abs(fx[0]! - fx[1]!) * s;
    if (gap > 3.2 && Math.abs(fx[0]!) * s > 2.2) fx.forEach((q, i) => sk.text(`tf${i}`, S([q, 0])[0], y0 + 3, lab[i]!, { anchor: "middle" }));
  }
  drawScaleBar2(sk, pic.x + 1, pic.y + pic.h - 1.6, 1 / s, "m");
}
const distToLine = (p: P, a: P, d: P): number => Math.abs((p[0] - a[0]) * d[1] - (p[1] - a[1]) * d[0]) / (len(d) || 1);
function checkOptic(r: DrawResult, o: Optic): string[] {
  const ps = readScale(r);
  const ax = ptsOf(r, "ax");
  const dv = ptsOf(r, "dv");
  const ob = shapeBy(r, "ob");
  const im = shapeBy(r, "im");
  if (ps === undefined || ax.length < 2 || dv.length < 2 || !ob || !im) return ["the axis, the device, the object, the image or the scale bar is missing"];
  const out: string[] = [];
  const y0 = ax[0]![1];
  const x0 = dv[0]![0];
  const n = (k: unknown): number => Number(k);
  const tol = (v: number): number => 0.006 * Math.abs(v) + 0.03 * ps;
  const uD = (x0 - n(ob.x1)) * ps;
  const hoD = (y0 - n(ob.y2)) * ps;
  if (!near(uD, o.u, tol(o.u))) out.push(`the object is ${uD.toPrecision(3)} m from the device and the inputs give ${o.u}`);
  if (!near(hoD, o.ho, tol(o.ho)) || !near(n(ob.y1), y0, 0.05)) out.push(`the object is ${hoD.toPrecision(3)} m tall and the inputs give ${o.ho}`);
  const xiD = (n(im.x1) - x0) * ps;
  const hiD = (y0 - n(im.y2)) * ps;
  if (!near(xiD, o.xImg, tol(o.xImg))) out.push(`the image is at ${xiD.toPrecision(3)} m and the formula gives ${o.xImg.toPrecision(3)}`);
  if (!near(hiD, o.hi, tol(o.hi)) || !near(n(im.y1), y0, 0.05)) out.push(`the image is ${hiD.toPrecision(3)} m tall and the formula gives ${o.hi.toPrecision(3)}`);
  if (!near(Math.abs(hiD / hoD), Math.abs(o.m), 0.01 * Math.abs(o.m) + 0.02)) out.push("the drawn image is not the drawn object times the magnification");
  const { rays } = raysOf(o);
  const tipS: P = [n(ob.x2), n(ob.y2)];
  const imgS: P = [n(im.x2), n(im.y2)];
  const lines: Array<{ a: P; d: P }> = [];
  for (const want of rays) {
    const p = ptsOf(r, want.id);
    if (p.length !== 3) {
      out.push(`the ray ${want.id} is missing`);
      continue;
    }
    if (len(sub(p[0]!, tipS)) > 0.1) out.push(`the ray ${want.id} does not start at the top of the object`);
    if (!near(p[1]![0], x0, 0.1)) out.push(`the ray ${want.id} does not meet the device`);
    const d = sub(p[2]!, p[1]!);
    const wantD = unit([want.dir[0], -want.dir[1]]);
    if (dot(unit(d), wantD) < 0.9995) out.push(`the ray ${want.id} leaves the device in the wrong direction`);
    const hitM = (y0 - p[1]![1]) * ps;
    const wantHit = want.hit[1];
    if (!near(hitM, wantHit, tol(wantHit) + 0.002 * Math.abs(o.ho))) out.push(`the ray ${want.id} meets the device at the wrong height`);
    lines.push({ a: p[1]!, d });
    if (distToLine(imgS, p[1]!, d) > 0.3) out.push(`the ray ${want.id} does not pass through the image`);
  }
  if (lines.length >= 2) {
    const x = lineCross(lines[0]!.a, lines[0]!.d, lines[1]!.a, lines[1]!.d);
    const sinA = Math.abs(lines[0]!.d[0] * lines[1]!.d[1] - lines[0]!.d[1] * lines[1]!.d[0]) / (len(lines[0]!.d) * len(lines[1]!.d));
    if (x && sinA > 0.05 && len(sub(x, imgS)) > 0.45 / sinA) out.push("the first two rays cross somewhere other than at the image");
  }
  // the ticks at the focus (and the centre of curvature) are where the inputs put them
  if (o.fs !== null) {
    const want = (o.kind === "mirror" ? [-o.fs, -2 * o.fs] : [-o.fs, o.fs]).map((q) => x0 + q / ps).sort((a, b) => a - b);
    const got = ptsOf(r, "fp").filter((_, i) => i % 2 === 0).map((q) => q[0]).sort((a, b) => a - b);
    if (got.length !== want.length || got.some((g, i) => !near(g, want[i]!, 0.06 + 0.004 * Math.abs(want[i]! - x0)))) out.push("the marks of the focus are not where the focal length puts them");
  }
  const ve = shapeBy(r, "ve");
  if (o.real === (ve !== undefined)) out.push(o.real ? "a real image has no dashed extension" : "a virtual image is drawn with its dashed extension");
  if (o.real !== (n(shapeBy(r, "im")?.dash === true ? 1 : 0) === 0)) out.push("a real image is drawn solid and a virtual one dashed");
  return out;
}
export const rayMirror = physicsDrawer("p_ray_mirror", "mirror_ray_diagram", {
  covers: ["Ray diagrams: plane/concave/convex mirror"],
  readouts: (p) => opticReadouts(opticOf("mirror", p.mirror, p.focal_length, p.object_distance, p.object_height)),
  draw: (sk, p) => drawOptic(sk, opticOf("mirror", p.mirror, p.focal_length, p.object_distance, p.object_height)),
  check: (r, p) => checkOptic(r, opticOf("mirror", p.mirror, p.focal_length, p.object_distance, p.object_height)),
});
export const rayLens = physicsDrawer("p_ray_lens", "lens_ray_diagram", {
  covers: ["Ray diagrams: convex/concave lens, image formation"],
  readouts: (p) => opticReadouts(opticOf("lens", p.lens, p.focal_length, p.object_distance, p.object_height)),
  draw: (sk, p) => drawOptic(sk, opticOf("lens", p.lens, p.focal_length, p.object_distance, p.object_height)),
  check: (r, p) => checkOptic(r, opticOf("lens", p.lens, p.focal_length, p.object_distance, p.object_height)),
});

// ---- refraction ----------------------------------------------------------------------------------------------------------------------------------------------------------------------
const RAY_LEN = 15;
/** The angle in degrees between a drawn direction and the vertical (the normal of a horizontal boundary). */
const fromNormal = (d: P): number => deg(Math.atan2(Math.abs(d[0]), Math.abs(d[1])));
export const refractionFigure = physicsDrawer("p_refraction", "refraction", {
  covers: ["Refraction, Snell, total internal reflection"],
  readouts(p) {
    if (p.mode === "interface") {
      const s = snell(p.n1, p.n2, p.angle_deg);
      const out: Readout[] = [{ key: "n1", value: p.n1, unit: "" }, { key: "n2", value: p.n2, unit: "" }, { key: "i", value: p.angle_deg, unit: "deg" }];
      if (s.tir) out.push({ key: "Result", word: "total internal reflection" }, { key: "r", value: p.angle_deg, unit: "deg" });
      else out.push({ key: "r", value: s.refractedDeg!, unit: "deg" }, { key: "Bends", word: p.n2 > p.n1 ? "towards normal" : "away from normal" });
      if (s.criticalDeg !== undefined) out.push({ key: "Critical", value: s.criticalDeg, unit: "deg" });
      return out;
    }
    const w = slabShift(p.n, p.angle_deg, p.thickness);
    return [{ key: "n", value: p.n, unit: "" }, { key: "i", value: p.angle_deg, unit: "deg" }, { key: "r", value: w.refractedDeg, unit: "deg" }, { key: "t", value: p.thickness, unit: "m" }, { key: "Shift", value: w.shift, unit: "m" }, { key: "Emerges", word: "parallel to incident" }];
  },
  draw(sk, p) {
    const pic = sk.L.pic;
    const cx = pic.x + pic.w / 2;
    if (p.mode === "interface") {
      const y0 = pic.y + (pic.h - 1.5) / 2;
      const th = rad(p.angle_deg);
      const s = snell(p.n1, p.n2, p.angle_deg);
      const L = Math.min(RAY_LEN, pic.w / 2 - 1, y0 - pic.y - 1.5);
      sk.path("bd", seg([pic.x + 0.5, y0], [pic.x + pic.w - 0.5, y0]), { width: 0.4, how: "fade" });
      sk.path("nm", seg([cx, y0 - L - 1], [cx, y0 + L + 1]), { color: "soft", dash: true, width: 0.25, how: "fade" });
      sk.arrow("ri", cx - L * Math.sin(th), y0 - L * Math.cos(th), cx, y0, { width: 0.5 });
      sk.arrow("rf", cx, y0, cx + L * Math.sin(th), y0 - L * Math.cos(th), { width: s.tir ? 0.5 : 0.25, dash: !s.tir });
      if (!s.tir) {
        const r = rad(s.refractedDeg!);
        sk.arrow("rr", cx, y0, cx + L * Math.sin(r), y0 + L * Math.cos(r), { width: 0.5 });
      }
      sk.text("m1", pic.x + 1, y0 - 2, "n1");
      sk.text("m2", pic.x + 1, y0 + 2.6, "n2");
    } else {
      const sh = slabShift(p.n, p.angle_deg, p.thickness);
      const top = pic.y + (pic.h - 1.5) * 0.3;
      const th = Math.min(pic.h * 0.4, 12);
      const bot = top + th;
      const x1 = cx - 4;
      const ri = rad(p.angle_deg);
      const rr = rad(sh.refractedDeg);
      const Lr = 9;
      sk.rect("sl", pic.x + 2, top, pic.w - 4, th, { fill: "soft", fillOpacity: 0.2, width: 0.4 });
      const x2 = x1 + th * Math.tan(rr);
      sk.arrow("ri", x1 - Lr * Math.sin(ri), top - Lr * Math.cos(ri), x1, top, { width: 0.5 });
      sk.path("in", seg([x1, top], [x2, bot]), { width: 0.5 });
      sk.arrow("re", x2, bot, x2 + Lr * Math.sin(ri), bot + Lr * Math.cos(ri), { width: 0.5 });
      sk.path("ex", seg([x1, top], [x1 + (th + Lr) * Math.tan(ri), top + th + Lr]), { color: "soft", dash: true, width: 0.25 });
      sk.path("nm", seg([x1, top - 3], [x1, bot + 3]), { color: "soft", dash: true, width: 0.25, how: "fade" });
      // the scale: the slab is t metres thick, so one stage unit is t / (drawn thickness) metres
      drawScaleBar2(sk, pic.x + 1, pic.y + pic.h - 1.6, p.thickness / th, "m");
    }
  },
  check(r, p) {
    const out: string[] = [];
    const a = (id: string) => {
      const s = shapeBy(r, id);
      return s && s.kind === "arrow" ? ([[Number(s.x1), Number(s.y1)], [Number(s.x2), Number(s.y2)]] as [P, P]) : null;
    };
    const ri = a("ri");
    if (!ri) return ["the incident ray is missing"];
    const dI = sub(ri[1], ri[0]);
    if (p.mode === "interface") {
      const s = snell(p.n1, p.n2, p.angle_deg);
      const bd = ptsOf(r, "bd");
      if (bd.length < 2 || !near(ri[1][1], bd[0]![1], 0.06)) out.push("the incident ray does not end on the boundary");
      if (dI[1] <= 0 || dI[0] <= 0) out.push("the incident ray does not run down to the boundary from the left");
      if (!near(fromNormal(dI), p.angle_deg, 0.25)) out.push(`the incident ray makes ${fromNormal(dI).toFixed(2)} degrees with the normal and the inputs give ${p.angle_deg}`);
      const rf = a("rf");
      if (!rf || sub(rf[1], rf[0])[1] >= 0 || sub(rf[1], rf[0])[0] <= 0 || !near(fromNormal(sub(rf[1], rf[0])), p.angle_deg, 0.25)) out.push("the reflected ray is not at the angle of incidence on the other side of the normal");
      const rr = a("rr");
      if (s.tir) {
        if (rr) out.push("beyond the critical angle there is no refracted ray, only reflection");
        if (shapeBy(r, "rf")?.dash === true) out.push("total internal reflection is drawn with a full-strength reflected ray");
      } else {
        if (!rr) return [...out, "the refracted ray is missing"];
        const dR = sub(rr[1], rr[0]);
        if (dR[1] <= 0 || dR[0] <= 0) out.push("the refracted ray does not continue into the second medium on the far side of the normal");
        const rD = fromNormal(dR);
        // Snell's law from the angles that were drawn, with the indices of the inputs
        if (!near(p.n1 * Math.sin(rad(fromNormal(dI))), p.n2 * Math.sin(rad(rD)), 0.004)) out.push(`the drawn angles break Snell's law: n1 sin i = ${(p.n1 * Math.sin(rad(fromNormal(dI)))).toFixed(4)} and n2 sin r = ${(p.n2 * Math.sin(rad(rD))).toFixed(4)}`);
        if (!near(rD, s.refractedDeg!, 0.25)) out.push(`the refracted ray makes ${rD.toFixed(2)} degrees and the inputs give ${s.refractedDeg!.toFixed(2)}`);
        if (shapeBy(r, "rf")?.dash !== true) out.push("a partly reflected ray is drawn lighter than the refracted one");
      }
    } else {
      const sh = slabShift(p.n, p.angle_deg, p.thickness);
      const ps = readScale(r);
      const inn = ptsOf(r, "in");
      const re = a("re");
      const sl = shapeBy(r, "sl");
      if (ps === undefined || inn.length !== 2 || !re || !sl) return ["the slab, the ray inside it or the scale bar is missing"];
      const thick = Number(sl.h);
      if (!near(thick * ps, p.thickness, 0.01 * p.thickness)) out.push("the drawn slab is not as thick as the inputs say");
      const dIn = sub(inn[1]!, inn[0]!);
      if (!near(fromNormal(dI), p.angle_deg, 0.25)) out.push(`the incident ray makes ${fromNormal(dI).toFixed(2)} degrees with the normal and the inputs give ${p.angle_deg}`);
      if (!near(p.n * Math.sin(rad(fromNormal(dIn))), Math.sin(rad(fromNormal(dI))), 0.004)) out.push("the ray inside the slab breaks Snell's law");
      const dE = sub(re[1], re[0]);
      if (dot(unit(dE), unit(dI)) < 0.99995) out.push("the emergent ray is not parallel to the incident ray");
      // sideways distance between the emergent ray and the path the incident ray would have taken straight on
      const ex = ptsOf(r, "ex");
      if (ex.length !== 2) return [...out, "the undeviated path is missing"];
      const dx = unit(sub(ex[1]!, ex[0]!));
      const shift = Math.abs((re[0][0] - ex[0]![0]) * dx[1] - (re[0][1] - ex[0]![1]) * dx[0]) * ps;
      if (!near(shift, sh.shift, 0.02 * sh.shift + 0.002 * p.thickness)) out.push(`the drawn sideways shift is ${shift.toPrecision(3)} m and the formula gives ${sh.shift.toPrecision(3)}`);
    }
    return out;
  },
});

// ---- the prism ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
type PrismGeom = { apex: P; left: P; right: P; entry: P; nL: P; nR: P };
/** The prism on the stage (y down): the apex at the top, the entry point half way down the left face; `nL` and `nR` are the outward unit normals of the faces. */
function prismGeometry(pic: { x: number; y: number; w: number; h: number }, apexDeg: number): PrismGeom {
  const H = Math.min(pic.h - 7, (pic.w * 0.42) / Math.tan(rad(apexDeg / 2)));
  const cx = pic.x + pic.w * 0.5;
  const apex: P = [cx, pic.y + 2.5];
  const half = H * Math.tan(rad(apexDeg / 2));
  const left: P = [cx - half, apex[1] + H];
  const right: P = [cx + half, apex[1] + H];
  const ha = rad(apexDeg / 2);
  return { apex, left, right, entry: add(apex, mul(sub(left, apex), 0.55)), nL: [-Math.cos(ha), -Math.sin(ha)], nR: [Math.cos(ha), -Math.sin(ha)] };
}
/** Stage directions use y down, so a physics angle phi (anticlockwise from +x, y up) is (cos phi, -sin phi). */
const dirOf = (phiDeg: number): P => [Math.cos(rad(phiDeg)), -Math.sin(rad(phiDeg))];
function prismRay(g: PrismGeom, apexDeg: number, incidenceDeg: number, n: number): { inside: P; exit: P; out: P } | null {
  const dInc = dirOf(incidenceDeg - apexDeg / 2);
  const dIns = refractVec(dInc, g.nL, 1, n);
  if (!dIns) return null;
  // where the ray inside meets the right face: solve entry + t * dIns on the line through apex with normal nR
  const t = dot(sub(g.apex, g.entry), g.nR) / dot(dIns, g.nR);
  const exit = add(g.entry, mul(dIns, t));
  const dOut = refractVec(dIns, mul(g.nR, -1), n, 1);
  if (!dOut) return null;
  return { inside: dIns, exit, out: dOut };
}
export const prismFigure = physicsDrawer("p_prism", "prism_dispersion", {
  covers: ["Prism dispersion, rainbow, spectrum"],
  readouts(p) {
    const r = prismTrace(p.apex_deg, p.incidence_deg, p.n_red)!;
    const v = prismTrace(p.apex_deg, p.incidence_deg, p.n_violet)!;
    return [
      { key: "A", value: p.apex_deg, unit: "deg" }, { key: "i", value: p.incidence_deg, unit: "deg" }, { key: "n red", value: p.n_red, unit: "" }, { key: "n violet", value: p.n_violet, unit: "" },
      { key: "D red", value: r.deviationDeg, unit: "deg" }, { key: "D violet", value: v.deviationDeg, unit: "deg" }, { key: "Spread", value: v.deviationDeg - r.deviationDeg, unit: "deg" }, { key: "Bent most", word: "violet" },
    ];
  },
  draw(sk, p) {
    const pic = sk.L.pic;
    const g = prismGeometry(pic, p.apex_deg);
    const box = inset({ x: pic.x, y: pic.y + 0.5, w: pic.w, h: pic.h - 1 }, 0.4);
    sk.polygon("pr", [g.apex, g.left, g.right], { fill: "soft", fillOpacity: 0.15, width: 0.4 });
    const dInc = dirOf(p.incidence_deg - p.apex_deg / 2);
    const startI = sub(g.entry, mul(dInc, Math.min(12, (g.entry[0] - pic.x - 1) / Math.max(0.2, dInc[0]))));
    sk.arrow("ri", startI[0], startI[1], g.entry[0], g.entry[1], { width: 0.5 });
    for (const [id, n, colour, tag] of [["ra", p.n_red, "red", "R"], ["rb", p.n_violet, "purple", "V"]] as const) {
      const tr = prismRay(g, p.apex_deg, p.incidence_deg, n)!;
      const end = clipRay(tr.exit, tr.out, box);
      sk.path(id, poly([g.entry, tr.exit, end]), { color: colour, width: id === "ra" ? 0.5 : 0.4, dash: id === "rb" });
      sk.text(`t${id}`, end[0] + (end[0] > pic.x + pic.w - 4 ? -1.4 : 1.2), end[1] + (id === "ra" ? -1.6 : 1.6), tag, { anchor: "middle" });
    }
    sk.path("nm", seg(g.entry, add(g.entry, mul(g.nL, 6))), { color: "soft", dash: true, width: 0.25, how: "fade" });
  },
  check(r, p) {
    const out: string[] = [];
    const tri = (shapeBy(r, "pr")?.points ?? []) as P[];
    const ri = shapeBy(r, "ri");
    if (tri.length !== 3 || !ri) return ["the prism or the incident ray is missing"];
    const [apex, left, right] = tri as [P, P, P];
    const a = deg(Math.acos(dot(unit(sub(left, apex)), unit(sub(right, apex)))));
    if (!near(a, p.apex_deg, 0.1)) out.push(`the drawn prism has an apex angle of ${a.toFixed(2)} degrees and the inputs give ${p.apex_deg}`);
    const fl = unit(sub(left, apex));
    const fr = unit(sub(right, apex));
    const nL: P = [fl[1], -fl[0]]; // a normal of the left face; the outward one points away from the prism's centre
    const outL: P = dot(nL, sub(left, right)) > 0 ? nL : mul(nL, -1);
    const nR0: P = [fr[1], -fr[0]];
    const outR: P = dot(nR0, sub(right, left)) > 0 ? nR0 : mul(nR0, -1);
    const entry: P = [Number(ri.x2), Number(ri.y2)];
    const dI = unit(sub(entry, [Number(ri.x1), Number(ri.y1)]));
    // the entry is on the left face
    if (Math.abs(dot(sub(entry, apex), outL)) > 0.12) out.push("the ray does not enter on the left face");
    const iD = deg(Math.acos(Math.min(1, -dot(dI, outL))));
    if (!near(iD, p.incidence_deg, 0.2)) out.push(`the ray arrives at ${iD.toFixed(2)} degrees to the normal and the inputs give ${p.incidence_deg}`);
    const expect = (n: number) => {
      const t = prismTrace(p.apex_deg, p.incidence_deg, n)!;
      return t;
    };
    for (const [id, n, name] of [["ra", p.n_red, "red"], ["rb", p.n_violet, "violet"]] as const) {
      const q = ptsOf(r, id);
      if (q.length !== 3) {
        out.push(`the ${name} ray is missing`);
        continue;
      }
      if (len(sub(q[0]!, entry)) > 0.12) out.push(`the ${name} ray does not start where the light enters`);
      const dIn = unit(sub(q[1]!, q[0]!));
      const dOut = unit(sub(q[2]!, q[1]!));
      // each bend is checked against Snell's law with the index of the inputs, using the faces that were drawn
      const c1 = refractVec(dI, outL, 1, n);
      const c2 = c1 ? refractVec(dIn, mul(outR, -1), n, 1) : null;
      if (!c1 || dot(c1, dIn) < 0.9998) out.push(`the ${name} ray inside the prism does not obey Snell's law at the first face`);
      if (Math.abs(dot(sub(q[1]!, apex), outR)) > 0.12) out.push(`the ${name} ray does not leave on the right face`);
      if (!c2 || dot(c2, dOut) < 0.9998) out.push(`the ${name} ray does not obey Snell's law at the second face`);
      const dev = deg(Math.acos(Math.min(1, dot(dI, dOut))));
      if (!near(dev, expect(n).deviationDeg, 0.15)) out.push(`the ${name} ray is deviated by ${dev.toFixed(2)} degrees and the formula gives ${expect(n).deviationDeg.toFixed(2)}`);
    }
    return out;
  },
});

// ---- interference and diffraction -----------------------------------------------------------------------------------------------------------------------------------------------------
const N_FRINGE = 56;
export const interferenceFigure = physicsDrawer("p_interference", "interference_pattern", {
  covers: ["Double slit, diffraction, intensity pattern"],
  readouts(p) {
    if (p.mode === "double_slit") {
      const out: Readout[] = [{ key: "lambda", value: p.wavelength, unit: "m" }, { key: "d", value: p.separation, unit: "m" }, { key: "D", value: p.distance, unit: "m" }, { key: "Fringe width", value: fringeWidth(p.wavelength, p.distance, p.separation), unit: "m" }];
      if (p.slit_width > 0) out.push({ key: "a", value: p.slit_width, unit: "m" }, { key: "First dark", value: singleSlitMinimum(p.wavelength, p.distance, p.slit_width), unit: "m" });
      return out;
    }
    return [{ key: "lambda", value: p.wavelength, unit: "m" }, { key: "a", value: p.slit_width, unit: "m" }, { key: "D", value: p.distance, unit: "m" }, { key: "First dark", value: singleSlitMinimum(p.wavelength, p.distance, p.slit_width), unit: "m" }, { key: "Central width", value: 2 * singleSlitMinimum(p.wavelength, p.distance, p.slit_width), unit: "m" }];
  },
  draw(sk, p) {
    const w = windowOf(p);
    drawGraph(sk, { xName: "y", xUnit: "m", yName: "I/I0", yUnit: "", xwin: [-w, w], ywin: [0, 1], series: [{ id: "c0", pts: curveOf(p, w), width: 0.5 }] });
  },
  check(r, p) {
    const g = readGraph(r);
    if (!g.ok) return [g.why];
    const w = windowOf(p);
    const out: string[] = [];
    if (!near(g.xwin[1], w, 1e-9 * w) || !near(g.xwin[0], -w, 1e-9 * w)) out.push("the window of the screen is not the one the inputs give");
    const I = (y: number): number => (p.mode === "double_slit" ? doubleSlitIntensity(y, p.wavelength, p.distance, p.separation, p.slit_width) : singleSlitIntensity(y, p.wavelength, p.distance, p.slit_width));
    out.push(...checkCurve(g, "c0", I, "intensity", N_FRINGE + 1, (i) => -w + (2 * w * i) / N_FRINGE, 0.12));
    // the centre of the screen is a maximum: the point on the axis is drawn at the top of the plot
    const mid = g.curve("c0")[N_FRINGE / 2]!;
    if (!near(mid[0], 0, 1e-9 + ((g.xwin[1] - g.xwin[0]) / (g.frame.r - g.frame.l)) * 0.1) || !near(mid[1], 1, ((g.ywin[1] - g.ywin[0]) / (g.frame.b - g.frame.t)) * 0.1)) out.push("the point on the axis of the screen is not the brightest");
    return out;
  },
});
type Interf = { mode: "double_slit"; wavelength: number; separation: number; distance: number; slit_width: number; window?: number } | { mode: "single_slit"; wavelength: number; slit_width: number; distance: number; window?: number };
/** The half-width of the screen shown, m: the window of the inputs, or (when none is given) 4.5 fringe widths for two slits and 3.5 times the first dark position for one. A nice number, so it can be printed exactly. */
function windowOf(p: Interf): number {
  if (p.window !== undefined) return p.window;
  const raw = p.mode === "double_slit" ? 4.5 * fringeWidth(p.wavelength, p.distance, p.separation) : 3.5 * singleSlitMinimum(p.wavelength, p.distance, p.slit_width);
  return niceWindow(0, raw)[1];
}
function curveOf(p: Interf, w: number): Array<[number, number]> {
  return Array.from({ length: N_FRINGE + 1 }, (_, i) => {
    const y = -w + (2 * w * i) / N_FRINGE;
    return [y, p.mode === "double_slit" ? doubleSlitIntensity(y, p.wavelength, p.distance, p.separation, p.slit_width) : singleSlitIntensity(y, p.wavelength, p.distance, p.slit_width)] as [number, number];
  });
}
