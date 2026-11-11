import type { DrawResult } from "../registry";
import { AXIAL_TILT, R_EARTH, R_MOON, SYNODIC_MONTH, dayLength, declination, earthShadow, elongationDeg, litFraction, lunarKind, moonUmbraLength, phaseName, solarKind } from "./compute";
import { physicsDrawer } from "./define";
import { checkCurve, drawGraph, numbersIn, parseReadouts, r1, readGraph, readScale, shapeBy, textBy } from "./kit";
import { angDiff, drawScaleBar2, near, ptsOf, seg, subpaths, type P } from "./kit-b";

/**
 * Earth and sky (ADR 0109): the phases of the Moon, the seasons, the length of the day, and solar and lunar eclipses. The geometry of every figure comes from a function of compute.ts and
 * the read-back measures it again off the drawing: the angle of the Moon round the Earth against the Sun, the shape of the lit part of the disc, the tilt of the axis at the four places of
 * the orbit, the shadow cone against the ground, the circles of a lunar eclipse against their scale. Sizes in the sun-moon-earth line cannot be to scale (the Sun would hide the page), and
 * the figure says so; what it keeps true is the relation the figure is about (does the umbra reach the Earth?).
 */
const rad = (d: number): number => (d * Math.PI) / 180;
const deg = (r: number): number => (r * 180) / Math.PI;
const six = (x: number): number => Number(x.toPrecision(6));
const val = (r: DrawResult, k: string): number => parseReadouts(r).get(k)?.value ?? NaN;
const word = (r: DrawResult, k: string): string | undefined => parseReadouts(r).get(k)?.word;
const N = 48;
const DAYS = { "Mar 21": 80, "Jun 21": 172, "Sep 23": 266, "Dec 22": 356 } as const;

/** The lit part of a disc seen from the Earth: its outline as a path (the lit limb and the terminator), for an elongation e of the Moon from the Sun. */
function litPath(cx: number, cy: number, R: number, eDeg: number): string {
  const waxing = eDeg <= 180;
  const ep = waxing ? eDeg : 360 - eDeg;
  const m = waxing ? 1 : -1;
  const xt = cx + m * R * Math.cos(rad(ep));
  const rx = Math.max(0.05, Math.abs(xt - cx));
  return `M${r1(cx)} ${r1(cy - R)}A${r1(R)} ${r1(R)} 0 0 ${m === 1 ? 1 : 0} ${r1(cx)} ${r1(cy + R)}A${r1(rx)} ${r1(R)} 0 0 ${xt > cx ? 0 : 1} ${r1(cx)} ${r1(cy - R)}Z`;
}
/** The elongation a drawn lit path shows, from its numbers (the limb side and where the terminator crosses the equator). */
function elongationOfLit(d: unknown): number | undefined {
  const n = numbersIn(String(d ?? ""));
  if (n.length < 16) return undefined;
  const [cx, , R, , , , s1, , , rx, , , , s2] = n as [number, number, number, number, number, number, number, number, number, number, number, number, number, number];
  const m = s1 === 1 ? 1 : -1;
  const xt = cx + (s2 === 0 ? rx : -rx);
  const cosE = Math.max(-1, Math.min(1, (m * (xt - cx)) / R));
  const ep = deg(Math.acos(cosE));
  return m === 1 ? ep : 360 - ep;
}
const MARCH_ORDER = [["tj", "Jun", 0], ["ts", "Sep", 90], ["td", "Dec", 180], ["tm", "Mar", 270]] as const;

export const skyFigure = physicsDrawer("p_earth_sky", "earth_and_sky", {
  covers: ["Moon phases, seasons, day-night, sun path, eclipse"],
  readouts(p) {
    if (p.mode === "phases") return [{ key: "Age", value: p.age_days, unit: "d" }, { key: "Elongation", value: elongationDeg(p.age_days), unit: "deg" }, { key: "Lit", value: litFraction(p.age_days) * 100, unit: "%" }, { key: "Phase", word: phaseName(p.age_days) }];
    if (p.mode === "seasons") return [{ key: "Tilt", value: AXIAL_TILT, unit: "deg" }, { key: "Lat", value: p.latitude_deg, unit: "deg" }, ...(Object.entries(DAYS).map(([k, d]): { key: string; value: number; unit: string } => ({ key: k, value: dayLength(p.latitude_deg, d), unit: "h" })))];
    if (p.mode === "day_length") {
      const lens = Array.from({ length: 365 }, (_, i) => dayLength(p.latitude_deg, i + 1));
      return [{ key: "Lat", value: p.latitude_deg, unit: "deg" }, { key: "Day", value: p.day_of_year, unit: "" }, { key: "Length", value: dayLength(p.latitude_deg, p.day_of_year), unit: "h" }, { key: "Declination", value: declination(p.day_of_year), unit: "deg" }, { key: "Longest", value: Math.max(...lens), unit: "h" }, { key: "Shortest", value: Math.min(...lens), unit: "h" }];
    }
    if (p.mode === "eclipse_solar") return [{ key: "Moon", value: p.moon_distance, unit: "m" }, { key: "Umbra", value: moonUmbraLength(), unit: "m" }, { key: "Result", word: solarKind(p.moon_distance) }, { key: "Sizes", word: "not to scale" }];
    const s = earthShadow(p.moon_distance);
    return [{ key: "Moon", value: p.moon_distance, unit: "m" }, { key: "Umbra", value: s.umbra, unit: "m" }, { key: "Penumbra", value: s.penumbra, unit: "m" }, { key: "Offset", value: p.offset, unit: "m" }, { key: "Result", word: lunarKind(p.moon_distance, p.offset) }];
  },
  draw(sk, p) {
    const pic = sk.L.pic;
    const cy = pic.y + (pic.h - 2) / 2;
    if (p.mode === "phases") {
      const e = elongationDeg(p.age_days);
      const E: P = [pic.x + pic.w * 0.36, cy];
      const Ro = Math.min(pic.w * 0.2, (pic.h - 8) / 2);
      const S: P = [pic.x + 3.5, cy];
      sk.circle("su", S[0], S[1], 2.4, { fill: "yellow", fillOpacity: 0.4, width: 0.4 });
      sk.text("ts", S[0], cy + 4.6, "Sun", { anchor: "middle" });
      sk.circle("ob", E[0], E[1], Ro, { dash: true, color: "soft", width: 0.25 });
      sk.circle("eh", E[0], E[1], 1.6, { fill: "soft", fillOpacity: 0.3, width: 0.4 });
      const a = rad(180 + e);
      const M: P = [E[0] + Ro * Math.cos(a), E[1] - Ro * Math.sin(a)];
      sk.circle("mn", M[0], M[1], 1.5, { width: 0.4 });
      // the half that faces the Sun is lit: sunlight comes from the left
      sk.path("mh", `M${r1(M[0])} ${r1(M[1] - 1.5)}A1.5 1.5 0 0 0 ${r1(M[0])} ${r1(M[1] + 1.5)}Z`, { fill: "soft", fillOpacity: 0.5, color: "none", how: "fade" });
      const D: P = [pic.x + pic.w * 0.84, cy];
      const Rd = Math.min(8, (pic.h - 6) / 2, pic.w * 0.12);
      sk.circle("dk", D[0], D[1], Rd, { width: 0.4 });
      sk.path("lt", litPath(D[0], D[1], Rd, e), { fill: "ink", fillOpacity: 0.45, color: "none", how: "fade" });
      return;
    }
    if (p.mode === "seasons") {
      const C: P = [pic.x + pic.w * 0.5, cy];
      const Ro = Math.min(pic.w * 0.28, (pic.h - 2) / 2 - 6.4);
      sk.circle("su", C[0], C[1], 2.6, { fill: "yellow", fillOpacity: 0.4, width: 0.4 });
      sk.circle("ob", C[0], C[1], Ro, { dash: true, color: "soft", width: 0.25 });
      const u: P = [-Math.sin(rad(AXIAL_TILT)), -Math.cos(rad(AXIAL_TILT))]; // the axis, north end up, tilted towards the left (stage axes)
      const axes: string[] = [];
      MARCH_ORDER.forEach(([id, name, ang], i) => {
        const E: P = [C[0] + Ro * Math.cos(rad(ang)), C[1] - Ro * Math.sin(rad(ang))];
        sk.circle(`e${"abcd"[i]}`, E[0], E[1], 1.6, { fill: "soft", fillOpacity: 0.3, width: 0.4 });
        axes.push(seg([E[0] - u[0] * 3.6, E[1] - u[1] * 3.6], [E[0] + u[0] * 3.6, E[1] + u[1] * 3.6]));
        const out: P = [Math.cos(rad(ang)), -Math.sin(rad(ang))];
        sk.text(id, E[0] + out[0] * (ang % 180 === 0 ? 4.6 : 0), E[1] + out[1] * (ang % 180 === 0 ? 0 : 5), name, { anchor: ang === 0 ? "start" : ang === 180 ? "end" : "middle" });
      });
      sk.path("ax", axes.join(""), { width: 0.4 });
      return;
    }
    if (p.mode === "day_length") {
      const days = (i: number): number => (365 * i) / N;
      const f = drawGraph(sk, { xName: "day", xUnit: "", yName: "daylight", yUnit: "h", xwin: [0, 365], ywin: [0, 24], series: [{ id: "c0", pts: Array.from({ length: N + 1 }, (_, i) => [days(i), dayLength(p.latitude_deg, Math.max(days(i), 1))] as [number, number]) }] });
      const y = dayLength(p.latitude_deg, p.day_of_year);
      sk.path("mk", `M${r1(f.X(p.day_of_year))} ${r1(f.Y(0))}L${r1(f.X(p.day_of_year))} ${r1(f.Y(y))}L${r1(f.l)} ${r1(f.Y(y))}`, { color: "soft", dash: true, width: 0.25 });
      return;
    }
    if (p.mode === "eclipse_solar") {
      const u = Math.min(1, (pic.w - 6) / 52);
      const Rs = 7 * u;
      const Rm = 1.3 * u;
      const xs = pic.x + 2 + Rs;
      const xm = xs + 24 * u;
      const apexOff = (24 * u * Rm) / (Rs - Rm);
      const kappa = apexOff / moonUmbraLength();
      const edge = xm + kappa * (p.moon_distance - R_EARTH);
      const Re = 2.6 * u;
      sk.circle("su", xs, cy, Rs, { fill: "yellow", fillOpacity: 0.4, width: 0.4 });
      sk.circle("mn", xm, cy, Rm, { fill: "soft", fillOpacity: 0.5, width: 0.4 });
      sk.circle("eh", edge + Re, cy, Re, { fill: "soft", fillOpacity: 0.3, width: 0.4 });
      sk.polygon("um", [[xm, cy - Rm], [xm, cy + Rm], [xm + apexOff, cy]], { fill: "ink", fillOpacity: 0.4, width: 0.3 });
      const xEnd = pic.x + pic.w - 1.5;
      const slope = (Rs + Rm) / (xm - xs);
      sk.path("pn", seg([xm, cy - Rm], [xEnd, cy - Rm - slope * (xEnd - xm)]) + seg([xm, cy + Rm], [xEnd, cy + Rm + slope * (xEnd - xm)]), { color: "soft", dash: true, width: 0.25 });
      sk.text("t1", xs, cy + Rs + 2.6, "Sun", { anchor: "middle" });
      sk.text("t2", xm, cy + 8.6, "Moon", { anchor: "middle" });
      sk.text("t3", edge + Re, cy + 8.6, "Earth", { anchor: "middle" });
      return;
    }
    // a lunar eclipse: the shadow of the Earth where the Moon crosses it, to scale
    const sh = earthShadow(p.moon_distance);
    const s = Math.min((pic.w - 6) / (2 * Math.max(sh.penumbra, p.offset + R_MOON)), (pic.h - 7) / (2 * sh.penumbra));
    const C: P = [pic.x + pic.w / 2, cy];
    sk.circle("pn", C[0], C[1], sh.penumbra * s, { dash: true, color: "soft", width: 0.3 });
    sk.circle("um", C[0], C[1], sh.umbra * s, { fill: "ink", fillOpacity: 0.3, width: 0.4 });
    sk.circle("mn", C[0] + p.offset * s, C[1], R_MOON * s, { fill: "yellow", fillOpacity: 0.4, width: 0.4 });
    sk.circle("ax", C[0], C[1], 0.4, { fill: "ink" });
    drawScaleBar2(sk, pic.x + 1, pic.y + pic.h - 1.6, 1 / s, "m");
  },
  check(r, p) {
    const out: string[] = [];
    if (p.mode === "phases") {
      const [su, eh, mn, mh, lt] = [shapeBy(r, "su"), shapeBy(r, "eh"), shapeBy(r, "mn"), shapeBy(r, "mh"), shapeBy(r, "lt")];
      if (!su || !eh || !mn || !mh || !lt) return ["the Sun, the Earth, the Moon or the lit disc is missing"];
      const ang = (a: Record<string, unknown>): number => deg(Math.atan2(-(Number(a.cy) - Number(eh.cy)), Number(a.cx) - Number(eh.cx)));
      const e = (((ang(mn) - ang(su)) % 360) + 360) % 360;
      const want = elongationDeg(p.age_days);
      if (angDiff(e, want) > 0.5) out.push(`the Moon is ${e.toFixed(1)} degrees from the Sun in the drawing and the age gives ${want.toFixed(1)}`);
      if (Math.abs(Math.hypot(Number(mn.cx) - Number(eh.cx), Number(mn.cy) - Number(eh.cy)) - Number(shapeBy(r, "ob")?.r)) > 0.1) out.push("the Moon is not on its orbit");
      const seen = elongationOfLit(lt.d);
      if (seen === undefined || angDiff(seen, want) > 0.8) out.push(`the lit part of the disc shows an elongation of ${seen?.toFixed(1) ?? "nothing"} degrees and the Moon is ${want.toFixed(1)} degrees from the Sun`);
      else {
        const lit = ((1 - Math.cos(rad(seen))) / 2) * 100;
        if (!near(val(r, "Lit"), lit, 0.012 * lit + 0.4)) out.push("the percentage lit is not what the drawn disc shows");
      }
      if (!/A1\.5 1\.5 0 0 0/.test(String(mh.d))) out.push("the half of the Moon that faces the Sun is lit");
      if (word(r, "Phase") !== phaseName((((want / 360) * SYNODIC_MONTH) % SYNODIC_MONTH + SYNODIC_MONTH) % SYNODIC_MONTH)) out.push("the phase named is not the phase of the drawn Moon");
      return out;
    }
    if (p.mode === "seasons") {
      const sun = shapeBy(r, "su");
      const ax = subpaths(shapeBy(r, "ax")?.d);
      const earths = ["a", "b", "c", "d"].map((c) => shapeBy(r, `e${c}`));
      if (!sun || ax.length !== 4 || earths.some((e) => !e)) return ["the Sun, an Earth or an axis is missing"];
      ax.forEach((a, i) => {
        // the axis is the same direction everywhere, 23.44 degrees from the vertical
        const d: P = [a[1]![0] - a[0]![0], a[1]![1] - a[0]![1]];
        const tilt = deg(Math.atan2(Math.abs(d[0]), Math.abs(d[1])));
        if (!near(tilt, AXIAL_TILT, 0.35)) out.push(`the axis at ${MARCH_ORDER[i]![1]} is tilted ${tilt.toFixed(1)} degrees and the tilt is ${AXIAL_TILT}`);
        if (Math.sign(d[0]) !== Math.sign(d[1])) out.push("the axis leans the same way at every place of the orbit");
        const e = earths[i]!;
        const aang = ((deg(Math.atan2(-(Number(e.cy) - Number(sun.cy)), Number(e.cx) - Number(sun.cx))) % 360) + 360) % 360;
        if (angDiff(aang, MARCH_ORDER[i]![2]) > 0.5) out.push(`the Earth of ${MARCH_ORDER[i]![1]} is at ${aang.toFixed(0)} degrees round the Sun and the orbit puts it at ${MARCH_ORDER[i]![2]}`);
        if (textBy(r, MARCH_ORDER[i]![0]) !== MARCH_ORDER[i]![1]) out.push(`the place ${i + 1} is not labelled ${MARCH_ORDER[i]![1]}`);
      });
      const lat = val(r, "Lat");
      for (const [k, d] of Object.entries(DAYS)) if (!near(val(r, k), dayLength(lat, d), 0.012 * dayLength(lat, d) + 0.03)) out.push(`the day length printed for ${k} is not the one the latitude gives`);
      return out;
    }
    if (p.mode === "day_length") {
      const g = readGraph(r);
      if (!g.ok) return [g.why];
      out.push(...checkCurve(g, "c0", (d) => dayLength(p.latitude_deg, Math.max(d, 1)), "day length", N + 1, (i) => (365 * i) / N));
      const mk = ptsOf(r, "mk");
      const y = dayLength(p.latitude_deg, p.day_of_year);
      if (mk.length !== 3 || !near(g.toX(mk[0]![0]), p.day_of_year, ((g.xwin[1] - g.xwin[0]) / (g.frame.r - g.frame.l)) * 0.15) || !near(g.toY(mk[1]![1]), y, ((g.ywin[1] - g.ywin[0]) / (g.frame.b - g.frame.t)) * 0.15)) out.push("the marker is not on the curve at the chosen day");
      return out;
    }
    if (p.mode === "eclipse_solar") {
      const [su, mn, eh, um] = [shapeBy(r, "su"), shapeBy(r, "mn"), shapeBy(r, "eh"), shapeBy(r, "um")];
      const tri = (um?.points ?? []) as P[];
      if (!su || !mn || !eh || tri.length !== 3) return ["the Sun, the Moon, the Earth or the shadow is missing"];
      const [Rs, Rm, xm, xs] = [Number(su.r), Number(mn.r), Number(mn.cx), Number(su.cx)];
      const apex = tri[2]![0] - xm;
      // similar triangles: the umbra comes to a point at (distance sun-moon) Rm / (Rs - Rm) behind the Moon
      if (!near(apex, ((xm - xs) * Rm) / (Rs - Rm), 0.1)) out.push("the umbra does not end where the Sun and Moon radii put its point");
      // the figure keeps the one proportion the physics is about: how far the Earth is, against how long the umbra is
      const edge = Number(eh.cx) - Number(eh.r);
      const ratio = (edge - xm) / apex;
      const want = (p.moon_distance - R_EARTH) / moonUmbraLength();
      if (!near(ratio, want, 0.012 * want + 0.02)) out.push(`the Earth is ${ratio.toFixed(3)} umbra lengths away in the drawing and the distances give ${want.toFixed(3)}`);
      const kind = xm + apex >= edge ? "total" : "annular";
      if (word(r, "Result") !== kind || kind !== solarKind(p.moon_distance)) out.push(`the umbra ${kind === "total" ? "reaches" : "falls short of"} the Earth in the drawing, so the eclipse is ${kind}`);
      if (!near(val(r, "Umbra"), moonUmbraLength(), 0.012 * moonUmbraLength())) out.push("the umbra length is not R_moon D / (R_sun - R_moon)");
      if (word(r, "Sizes") !== "not to scale") out.push("the figure says it is not to scale");
      return out;
    }
    const ps = readScale(r);
    const [pn, um, mn] = [shapeBy(r, "pn"), shapeBy(r, "um"), shapeBy(r, "mn")];
    if (ps === undefined || !pn || !um || !mn) return ["a shadow circle, the Moon or the scale bar is missing"];
    const sh = earthShadow(p.moon_distance);
    const tol = (v: number): number => 0.006 * v + 0.04 * ps;
    if (!near(Number(um.r) * ps, sh.umbra, tol(sh.umbra))) out.push(`the umbra has radius ${(Number(um.r) * ps).toExponential(3)} m and the distance gives ${sh.umbra.toExponential(3)}`);
    if (!near(Number(pn.r) * ps, sh.penumbra, tol(sh.penumbra))) out.push("the penumbra is not the radius of the inputs");
    if (!near(Number(mn.r) * ps, R_MOON, tol(R_MOON))) out.push("the Moon is not drawn to the scale of the shadow");
    const off = (Number(mn.cx) - Number(um.cx)) * ps;
    if (!near(off, p.offset, tol(p.offset) + 0.01 * R_MOON)) out.push("the Moon is not the offset of the inputs from the axis of the shadow");
    const [ru, rp, rm] = [Number(um.r), Number(pn.r), Number(mn.r)];
    const d = Math.abs(Number(mn.cx) - Number(um.cx));
    const kind = d <= ru - rm ? "total" : d < ru + rm ? "partial" : d < rp + rm ? "penumbral" : "none";
    if (word(r, "Result") !== kind) out.push(`the drawn Moon is in the ${kind === "none" ? "open" : kind} part of the shadow and the figure says otherwise`);
    return out;
  },
});
