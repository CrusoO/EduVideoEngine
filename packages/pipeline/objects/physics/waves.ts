import type { DrawResult } from "../registry";
import { TICKS_PER_WAVELENGTH, echo, longitudinalPositions, soundWavelength, standingLength, superposedAmplitude, waveSpeed } from "./compute";
import { physicsDrawer } from "./define";
import { LEAST_COUNT_MM } from "./params";
import { arrowBy, checkCurve, drawGraph, drawScaleBar, niceWindow, numbersIn, r1, readGraph, readScale, shapeBy, parseReadouts, type Readout, type Sketch } from "./kit";

/**
 * Waves, sound and the measuring instruments (ADR 0108). A transverse wave, a superposition and a standing wave are graphs of displacement against position, read back like any
 * graph. A longitudinal wave is a row of ticks at the positions of the particles at one instant; it is read back by finding where the ticks bunch (the compressions) and measuring how
 * far apart they are. An instrument is drawn as its scales, and the reading is read back from which line of one scale meets a line of the other.
 */
const near = (a: number, b: number, tol: number): boolean => Math.abs(a - b) <= tol;
const N_WAVE = 48;
const sine = (n: number, a: number, b: number, f: (x: number) => number): Array<[number, number]> => Array.from({ length: n + 1 }, (_, i) => [a + ((b - a) * i) / n, f(a + ((b - a) * i) / n)] as [number, number]);

/** The x positions (and ends) of the ticks of a path written as `M x y V y2` repeated. */
export function ticksOf(d: unknown): Array<{ x: number; y1: number; y2: number }> {
  const out: Array<{ x: number; y1: number; y2: number }> = [];
  for (const m of String(d ?? "").matchAll(/M(-?[\d.]+) (-?[\d.]+)V(-?[\d.]+)/g)) out.push({ x: Number(m[1]), y1: Number(m[2]), y2: Number(m[3]) });
  return out;
}
const tickPath = (ticks: Array<{ x: number; y1: number; y2: number }>): string => ticks.map((t) => `M${r1(t.x)} ${r1(t.y1)}V${r1(t.y2)}`).join("");
/** Where the particles bunch: the indices of the ticks at the centre of each compression (where the spacing is least). */
export function compressionIndices(xs: number[]): number[] {
  const s = xs.slice(1).map((x, i) => x - xs[i]!);
  const v = s.slice(1).map((x, i) => x + s[i]!); // v[i] belongs to tick i + 1
  const out: number[] = [];
  for (let i = 1; i < v.length - 1; i++) if (v[i]! < v[i - 1]! && v[i]! < v[i + 1]!) out.push(i + 1);
  return out;
}
function drawTicks(sk: Sketch, wavelength: number, x0: number, w: number, y0: number): void {
  const pos = longitudinalPositions(wavelength, 2);
  sk.path("tk", tickPath(pos.map((x) => ({ x: x0 + (x / (2 * wavelength)) * w, y1: y0, y2: y0 + 8 }))), { width: 0.3 });
}
/** The wavelength a drawn row of ticks shows, in stage units, from the distance between consecutive compressions; null when it cannot be told. */
function tickWavelength(r: DrawResult): { stage: number; count: number } | null {
  const t = ticksOf(shapeBy(r, "tk")?.d);
  if (t.length !== TICKS_PER_WAVELENGTH * 2 + 1) return null;
  const idx = compressionIndices(t.map((q) => q.x));
  if (idx.length < 2) return null;
  return { stage: (t[idx[idx.length - 1]!]!.x - t[idx[0]!]!.x) / (idx.length - 1), count: idx.length };
}

// ---- waves --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
export const waveFigure = physicsDrawer("p_wave", "wave_diagram", {
  covers: ["Transverse/longitudinal wave, superposition, standing wave"],
  readouts(p) {
    if (p.kind === "transverse") return [{ key: "f", value: p.frequency, unit: "Hz" }, { key: "lambda", value: p.wavelength, unit: "m" }, { key: "v", value: waveSpeed(p.frequency, p.wavelength), unit: "m/s" }, { key: "A", value: p.amplitude, unit: "m" }, { key: "T", value: 1 / p.frequency, unit: "s" }];
    if (p.kind === "longitudinal") return [{ key: "f", value: p.frequency, unit: "Hz" }, { key: "lambda", value: p.wavelength, unit: "m" }, { key: "v", value: waveSpeed(p.frequency, p.wavelength), unit: "m/s" }, { key: "Dense", word: "compression" }, { key: "Sparse", word: "rarefaction" }];
    if (p.kind === "superposition") {
      const ar = superposedAmplitude(p.amp1, p.amp2, p.phase_deg);
      const ph = ((p.phase_deg % 360) + 360) % 360;
      return [{ key: "A1", value: p.amp1, unit: "m" }, { key: "A2", value: p.amp2, unit: "m" }, { key: "Phase", value: p.phase_deg, unit: "deg" }, { key: "A result", value: ar, unit: "m" }, { key: "Result", word: ph === 0 ? "constructive" : ph === 180 ? (p.amp1 === p.amp2 ? "cancels" : "destructive") : "partial" }];
    }
    return [{ key: "lambda", value: p.wavelength, unit: "m" }, { key: "n", value: p.harmonic, unit: "" }, { key: "Length", value: standingLength(p.wavelength, p.harmonic), unit: "m" }, { key: "Nodes", value: p.harmonic + 1, unit: "" }, { key: "Antinodes", value: p.harmonic, unit: "" }, { key: "A", value: p.amplitude, unit: "m" }];
  },
  draw(sk, p) {
    const pic = sk.L.pic;
    if (p.kind === "transverse") {
      const k = (2 * Math.PI) / p.wavelength;
      const f = drawGraph(sk, { xName: "x", xUnit: "m", yName: "y", yUnit: "m", xwin: [0, 2 * p.wavelength], ywin: niceWindow(-p.amplitude, p.amplitude), series: [{ id: "c0", pts: sine(N_WAVE, 0, 2 * p.wavelength, (x) => p.amplitude * Math.sin(k * x)) }] });
      sk.path("da", `M${r1(f.X(p.wavelength / 4))} ${r1(f.Y(0))}L${r1(f.X(p.wavelength / 4))} ${r1(f.Y(p.amplitude))}`, { color: "soft", dash: true, width: 0.25 });
      sk.path("dl", `M${r1(f.X(p.wavelength / 4))} ${r1(f.Y(p.amplitude))}L${r1(f.X((5 * p.wavelength) / 4))} ${r1(f.Y(p.amplitude))}`, { color: "soft", dash: true, width: 0.25 });
      sk.text("ta", f.X(p.wavelength / 4) + 0.8, f.Y(p.amplitude / 2), "A");
      sk.text("tl", f.X(p.wavelength * 0.75), f.Y(p.amplitude) - 1.6, "lambda", { anchor: "middle" });
    } else if (p.kind === "longitudinal") {
      const w = pic.w - 4;
      const x0 = pic.x + 2;
      const y0 = pic.y + (pic.h - 8) / 2 - 2;
      drawTicks(sk, p.wavelength, x0, w, y0);
      sk.text("tc", x0 + w / 4, y0 - 1.8, "C", { anchor: "middle" });
      sk.text("tr", x0 + w / 2, y0 - 1.8, "R", { anchor: "middle" });
      drawScaleBar(sk, pic.x + 1, pic.y + pic.h - 1.6, (2 * p.wavelength) / w, "m");
    } else if (p.kind === "superposition") {
      const k = (2 * Math.PI) / p.wavelength;
      const ph = (p.phase_deg * Math.PI) / 180;
      const tot = p.amp1 + p.amp2;
      drawGraph(sk, {
        xName: "x", xUnit: "m", yName: "y", yUnit: "m", xwin: [0, 2 * p.wavelength], ywin: niceWindow(-tot, tot),
        series: [
          { id: "c0", pts: sine(N_WAVE, 0, 2 * p.wavelength, (x) => p.amp1 * Math.sin(k * x)), dash: true, width: 0.3, label: "1", labelAt: 0.27 },
          { id: "c1", pts: sine(N_WAVE, 0, 2 * p.wavelength, (x) => p.amp2 * Math.sin(k * x + ph)), dash: true, width: 0.3, label: "2", labelAt: 0.52 },
          { id: "c2", pts: sine(N_WAVE, 0, 2 * p.wavelength, (x) => p.amp1 * Math.sin(k * x) + p.amp2 * Math.sin(k * x + ph)), width: 0.6, label: "sum", labelAt: 0.77 },
        ],
      });
    } else {
      const L = standingLength(p.wavelength, p.harmonic);
      const k = (2 * Math.PI) / p.wavelength;
      const f = drawGraph(sk, {
        xName: "x", xUnit: "m", yName: "y", yUnit: "m", xwin: [0, L], ywin: niceWindow(-p.amplitude, p.amplitude),
        series: [{ id: "c0", pts: sine(N_WAVE, 0, L, (x) => p.amplitude * Math.sin(k * x)) }, { id: "c1", pts: sine(N_WAVE, 0, L, (x) => -p.amplitude * Math.sin(k * x)), dash: true, width: 0.3 }],
      });
      sk.path("nd", tickPath(Array.from({ length: p.harmonic + 1 }, (_, m) => ({ x: f.X((m * p.wavelength) / 2), y1: f.Y(0) - 1, y2: f.Y(0) + 1 }))), { width: 0.5, how: "fade" });
    }
  },
  check(r, p) {
    const out: string[] = [];
    if (p.kind === "longitudinal") {
      const s = readScale(r);
      const w = tickWavelength(r);
      if (s === undefined || !w) return ["the ticks or the scale bar are missing, or the particles do not bunch"];
      const lambda = w.stage * s;
      if (!near(lambda, p.wavelength, 0.02 * p.wavelength + 0.06 * s)) out.push(`the drawn compressions are ${lambda.toPrecision(3)} m apart and the inputs give ${p.wavelength}`);
      return out;
    }
    const g = readGraph(r);
    if (!g.ok) return [g.why];
    if (p.kind === "transverse" || p.kind === "superposition") {
      const k = (2 * Math.PI) / p.wavelength;
      const ph = p.kind === "superposition" ? (p.phase_deg * Math.PI) / 180 : 0;
      const [a1, a2] = p.kind === "transverse" ? [p.amplitude, 0] : [p.amp1, p.amp2];
      const xs = (i: number): number => (2 * p.wavelength * i) / N_WAVE;
      const sum = (x: number): number => a1 * Math.sin(k * x) + a2 * Math.sin(k * x + ph);
      if (p.kind === "superposition") out.push(...checkCurve(g, "c0", (x) => a1 * Math.sin(k * x), "wave 1", N_WAVE + 1, xs), ...checkCurve(g, "c1", (x) => a2 * Math.sin(k * x + ph), "wave 2", N_WAVE + 1, xs), ...checkCurve(g, "c2", sum, "sum", N_WAVE + 1, xs));
      else out.push(...checkCurve(g, "c0", sum, "wave", N_WAVE + 1, xs));
      const pts = g.curve(p.kind === "transverse" ? "c0" : "c2");
      const ty = ((g.ywin[1] - g.ywin[0]) / (g.frame.b - g.frame.t)) * 0.1;
      if (p.kind === "transverse") {
        const crests = pts.flatMap((q, i) => (i > 0 && i < pts.length - 1 && q[1] > pts[i - 1]![1] && q[1] >= pts[i + 1]![1] && q[1] > 0.9 * p.amplitude ? [q[0]] : []));
        const tx = ((g.xwin[1] - g.xwin[0]) / (g.frame.r - g.frame.l)) * 0.1;
        if (crests.length < 2) out.push("the drawn wave has fewer than two crests");
        else if (!near(crests[1]! - crests[0]!, p.wavelength, 2 * tx)) out.push("the distance between two drawn crests is not the wavelength");
        if (!near(Math.max(...pts.map((q) => q[1])), p.amplitude, 0.01 * p.amplitude + ty)) out.push("the height of the drawn crests is not the amplitude");
      } else {
        const ar = superposedAmplitude(p.amp1, p.amp2, p.phase_deg);
        if (!near(Math.max(...pts.map((q) => Math.abs(q[1]))), ar, 0.015 * ar + ty)) out.push("the largest displacement of the sum is not the resultant amplitude");
      }
    } else {
      const L = standingLength(p.wavelength, p.harmonic);
      const k = (2 * Math.PI) / p.wavelength;
      out.push(...checkCurve(g, "c0", (x) => p.amplitude * Math.sin(k * x), "standing wave", N_WAVE + 1, (i) => (L * i) / N_WAVE), ...checkCurve(g, "c1", (x) => -p.amplitude * Math.sin(k * x), "other half cycle", N_WAVE + 1, (i) => (L * i) / N_WAVE));
      const nd = ticksOf(shapeBy(r, "nd")?.d).map((t) => g.toX(t.x));
      const tx = ((g.xwin[1] - g.xwin[0]) / (g.frame.r - g.frame.l)) * 0.1;
      if (nd.length !== p.harmonic + 1) out.push(`${nd.length} nodes are marked and the inputs give ${p.harmonic + 1}`);
      else if (nd.some((x, m) => !near(x, (m * p.wavelength) / 2, tx))) out.push("a node is not where the standing wave crosses zero");
    }
    return out;
  },
});

// ---- sound -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
export const soundFigure = physicsDrawer("p_sound", "sound_wave", {
  covers: ["Sound: compression/rarefaction, echo, ear"],
  readouts(p) {
    if (p.mode === "compression") return [{ key: "f", value: p.frequency, unit: "Hz" }, { key: "v", value: p.speed, unit: "m/s" }, { key: "lambda", value: soundWavelength(p.speed, p.frequency), unit: "m" }, { key: "T", value: 1 / p.frequency, unit: "s" }, { key: "Peak", word: "compression" }, { key: "Trough", word: "rarefaction" }];
    return [{ key: "Distance", value: p.distance, unit: "m" }, { key: "Speed", value: p.speed, unit: "m/s" }, { key: "Round trip", value: 2 * p.distance, unit: "m" }, { key: "Echo time", value: echo(p).time, unit: "s" }];
  },
  draw(sk, p) {
    const pic = sk.L.pic;
    if (p.mode === "compression") {
      const lam = soundWavelength(p.speed, p.frequency);
      const sub = { x: pic.x, y: pic.y + 10, w: pic.w, h: pic.h - 10 };
      drawTicks(sk, lam, sub.x + 1, sub.w - 2, pic.y + 0.8);
      drawGraph(sk, { xName: "x", xUnit: "m", yName: "pressure change", yUnit: "relative", xwin: [0, 2 * lam], ywin: [-1, 1], series: [{ id: "c0", pts: sine(N_WAVE, 0, 2 * lam, (x) => -Math.cos((2 * Math.PI * x) / lam)) }] }, sub);
    } else {
      const y1 = pic.y + pic.h * 0.35;
      const y2 = pic.y + pic.h * 0.65;
      const x0 = pic.x + 5;
      const x1 = pic.x + pic.w - 6;
      sk.circle("src", x0 - 2, (y1 + y2) / 2, 1.8, { fill: "soft", fillOpacity: 0.4 });
      sk.path("wall", `M${r1(x1 + 1)} ${r1(pic.y + 2)}L${r1(x1 + 1)} ${r1(pic.y + pic.h - 2)}`, { width: 1 });
      sk.arrow("go", x0, y1, x1, y1, { width: 0.5 });
      sk.arrow("back", x1, y2, x0, y2, { width: 0.5, dash: true });
      sk.text("td", (x0 + x1) / 2, y1 - 2, "d", { anchor: "middle" });
      sk.text("tb", (x0 + x1) / 2, y2 + 2, "echo, total 2d", { anchor: "middle" });
    }
  },
  check(r, p) {
    const out: string[] = [];
    if (p.mode === "compression") {
      const lam = soundWavelength(p.speed, p.frequency);
      const g = readGraph(r);
      if (!g.ok) return [g.why];
      out.push(...checkCurve(g, "c0", (x) => -Math.cos((2 * Math.PI * x) / lam), "pressure", N_WAVE + 1, (i) => (2 * lam * i) / N_WAVE));
      const t = ticksOf(shapeBy(r, "tk")?.d);
      if (t.length !== TICKS_PER_WAVELENGTH * 2 + 1) return [...out, "the row of particles is missing"];
      const idx = compressionIndices(t.map((q) => q.x));
      const tx = ((g.xwin[1] - g.xwin[0]) / (g.frame.r - g.frame.l)) * 0.1;
      const pk = g.curve("c0").flatMap((q, i, a) => (i > 0 && i < a.length - 1 && q[1] > a[i - 1]![1] && q[1] >= a[i + 1]![1] && q[1] > 0.95 ? [q[0]] : []));
      const xsPhys = idx.map((i) => g.toX(t[i]!.x));
      if (idx.length !== 2 || pk.length < 1 || xsPhys.some((x) => !pk.some((q) => near(q, x, 1.5 * tx + 0.04 * lam)))) out.push("the pressure peaks are not where the particles bunch");
      if (idx.length === 2 && !near(xsPhys[1]! - xsPhys[0]!, lam, 0.02 * lam + 2 * tx)) out.push("the compressions are not one wavelength apart");
    } else {
      const [go, back] = [arrowBy(r, "go"), arrowBy(r, "back")];
      const wall = numbersIn(String(shapeBy(r, "wall")?.d ?? ""))[0];
      if (!go || !back || wall === undefined) return ["an arrow or the wall is missing"];
      if (!near(go.x2 - go.x1, back.x1 - back.x2, 0.02)) out.push("the way out and the way back are not the same length");
      if (!near(go.x2, back.x1, 0.02) || !near(wall - 1, go.x2, 0.05)) out.push("the sound does not turn at the wall");
    }
    return out;
  },
});

// ---- measuring instruments --------------------------------------------------------------------------------------------------------------------------------------------------------
const WINDOW_MM = 12;
export const dimensionFigure = physicsDrawer("p_dimension", "measuring_instrument", {
  covers: ["Measuring instruments: ruler, vernier, screw gauge, error bars"],
  readouts(p) {
    const lc = LEAST_COUNT_MM[p.instrument];
    if (p.instrument === "ruler") return [{ key: "Scale from", value: rulerStart(p.reading_mm), unit: "mm" }, { key: "Least count", value: lc, unit: "mm" }, { key: "Reading", value: p.reading_mm, unit: "mm" }, { key: "Uncertainty", value: lc / 2, unit: "mm" }];
    if (p.instrument === "vernier") {
      const v = vernierParts(p.reading_mm);
      return [{ key: "Scale from", value: Math.max(0, v.msr - 1), unit: "mm" }, { key: "Main scale", value: v.msr, unit: "mm" }, { key: "Vernier div", value: v.vsr, unit: "" }, { key: "Least count", value: lc, unit: "mm" }, { key: "Reading", value: p.reading_mm, unit: "mm" }];
    }
    const s = screwParts(p.reading_mm);
    return [{ key: "Scale from", value: Math.max(0, s.msr - 1), unit: "mm" }, { key: "Main scale", value: s.msr, unit: "mm" }, { key: "Circular div", value: s.n, unit: "" }, { key: "Least count", value: lc, unit: "mm" }, { key: "Reading", value: p.reading_mm, unit: "mm" }];
  },
  draw(sk, p) {
    const pic = sk.L.pic;
    const x0 = pic.x + 2;
    const U = 4.7; // stage units per mm on the main scale
    const y = pic.y + 12;
    const rail = (id: string, yy: number, w: number): void => sk.path(id, `M${r1(x0)} ${r1(yy)}L${r1(x0 + w)} ${r1(yy)}`, { width: 0.4, how: "fade" });
    if (p.instrument === "ruler") {
      const start = rulerStart(p.reading_mm);
      sk.path("mt", tickPath(Array.from({ length: 11 }, (_, i) => ({ x: x0 + i * U, y1: y, y2: y + ((start + i) % 5 === 0 ? 5 : 3) }))), { width: 0.3 });
      rail("rl", y, 10 * U);
      sk.arrow("ed", x0 + (p.reading_mm - start) * U, y - 7, x0 + (p.reading_mm - start) * U, y - 0.5, { width: 0.5 });
    } else if (p.instrument === "vernier") {
      const v = vernierParts(p.reading_mm);
      const start = Math.max(0, v.msr - 1);
      sk.path("mt", tickPath(Array.from({ length: WINDOW_MM + 1 }, (_, i) => ({ x: x0 + i * U, y1: y, y2: y + 4 }))), { width: 0.3 });
      rail("rl", y, WINDOW_MM * U);
      sk.path("vt", tickPath(Array.from({ length: 11 }, (_, k) => ({ x: x0 + (p.reading_mm - start + 0.9 * k) * U, y1: y + 6, y2: y + 10 }))), { width: 0.3 });
      sk.arrow("ca", x0 + (p.reading_mm - start + 0.9 * v.vsr) * U, y + 16, x0 + (p.reading_mm - start + 0.9 * v.vsr) * U, y + 10.5, { width: 0.5 });
    } else {
      const s = screwParts(p.reading_mm);
      const start = Math.max(0, s.msr - 1);
      const U2 = 9; // stage units per 0.5 mm
      sk.path("mt", tickPath(Array.from({ length: 7 }, (_, i) => ({ x: x0 + i * U2, y1: y - 6, y2: y - 2 }))), { width: 0.3 });
      sk.arrow("te", x0 + ((s.msr - start) / 0.5) * U2, y + 2, x0 + ((s.msr - start) / 0.5) * U2, y - 1.5, { width: 0.5 });
      const xr = x0 + 28;
      const strip = Array.from({ length: 51 }, (_, i) => {
        const j = i - 25;
        const div = (((s.n + j) % 50) + 50) % 50;
        return { x: xr + j * 1.1, y1: y + 7, y2: y + 7 + (div === 0 ? 5 : 2.5) };
      });
      sk.path("s0", tickPath(strip.slice(0, 25)), { width: 0.3 });
      sk.path("s1", tickPath(strip.slice(25)), { width: 0.3 });
      sk.arrow("ra", xr, y + 17, xr, y + 13, { width: 0.5 });
    }
  },
  check(r, p) {
    const out: string[] = [];
    const rd = parseReadouts(r);
    const start = rd.get("Scale from")?.value;
    const lc = rd.get("Least count")?.value;
    if (start === undefined || lc === undefined) return ["the printed start of the scale or the least count is missing"];
    const mt = ticksOf(shapeBy(r, "mt")?.d).map((t) => t.x);
    if (mt.length < 2) return ["the main scale is missing"];
    const per = (mt[mt.length - 1]! - mt[0]!) / (mt.length - 1); // stage units per tick
    const mmOf = (x: number, step: number): number => start + ((x - mt[0]!) / per) * step;
    if (p.instrument === "ruler") {
      const ed = arrowBy(r, "ed");
      if (!ed) return ["the edge arrow is missing"];
      if (!(ed.y2 > ed.y1)) out.push("the edge arrow must point down at the scale");
      const reading = mmOf(ed.x1, lc);
      if (!near(reading, p.reading_mm, 0.03 * lc)) out.push(`the drawn edge is at ${reading.toFixed(2)} mm and the inputs give ${p.reading_mm}`);
    } else if (p.instrument === "vernier") {
      const vt = ticksOf(shapeBy(r, "vt")?.d).map((t) => t.x);
      if (vt.length !== 11) return ["the vernier scale is missing"];
      // the vernier division that meets a line of the main scale is the vernier reading
      const gap = vt.map((x) => Math.min(...mt.map((m) => Math.abs(x - m))));
      const meets = gap.flatMap((g, i) => (g <= 0.15 ? [i] : []));
      // one division meets a line; with a reading of a whole number of mm the end divisions 0 and 10 both do
      const ok = meets.length === 1 || (meets.length === 2 && meets[0] === 0 && meets[1] === 10);
      if (!ok || gap.some((g, i) => !meets.includes(i) && g < 0.3)) out.push("no single vernier division meets a line of the main scale");
      const k = meets[0] ?? 0;
      const ca = arrowBy(r, "ca");
      if (!ca || !(ca.y2 < ca.y1)) out.push("the pointer under the vernier must point up at the meeting line");
      else if (!near(ca.x1, vt[k]!, 0.06)) out.push("the pointer is not under the division that meets the main scale");
      const pos = mmOf(vt[0]!, 1);
      const msr = Math.round(pos - 0.1 * k);
      const reading = msr + 0.1 * k;
      if (!near(reading, p.reading_mm, 1e-6)) out.push(`the drawn scales read ${reading.toFixed(1)} mm and the inputs give ${p.reading_mm}`);
    } else {
      const te = arrowBy(r, "te");
      const ra = arrowBy(r, "ra");
      const strip = [...ticksOf(shapeBy(r, "s0")?.d), ...ticksOf(shapeBy(r, "s1")?.d)];
      if (!te || !ra || strip.length !== 51) return ["the thimble edge, the reference or the circular scale is missing"];
      if (!(te.y2 < te.y1) || !(ra.y2 < ra.y1)) out.push("the thimble edge and the reference marker must point up at their scales");
      const msr = 0.5 * Math.round(mmOf(te.x1, 0.5) / 0.5);
      const zero = strip.reduce((a, b) => (b.y2 - b.y1 > a.y2 - a.y1 ? b : a));
      const n = ((Math.round((ra.x1 - zero.x) / 1.1) % 50) + 50) % 50;
      const reading = msr + n * 0.01;
      if (!near(reading, p.reading_mm, 1e-6)) out.push(`the drawn scales read ${reading.toFixed(2)} mm and the inputs give ${p.reading_mm}`);
    }
    return out;
  },
});
/** The first mm of the ruler's window: the reading is inside it, with at least 3 mm of scale on each side where the ruler allows. */
export const rulerStart = (reading: number): number => Math.max(0, Math.round(reading) - 5);
export function vernierParts(reading: number): { msr: number; vsr: number } {
  const tenths = Math.round(reading * 10);
  return { msr: Math.floor(tenths / 10), vsr: tenths % 10 };
}
export function screwParts(reading: number): { msr: number; n: number } {
  const hund = Math.round(reading * 100);
  return { msr: 0.5 * Math.floor(hund / 50), n: hund % 50 };
}
