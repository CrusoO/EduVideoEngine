import type { DrawResult } from "../registry";
import {
  BANDS, C_LIGHT, H_OVER_E, THERMAL_VOLT_300K, bandOf, bindingPerNucleon, bohrEnergy, bohrRadius, bandwidth, currentAt, decayChain, decayRun, diodeCurrent, emWavelength, gateOut, keMax, materialOf,
  photonEv, pnJunction, qualityFactor, remainingExact, resonanceFrequency, rmsOf, seriesLcr, stableZ, symbolOf, thresholdFrequency, transition, type Gate,
} from "./compute";
import { physicsDrawer } from "./define";
import {
  arrowBy, checkCurve, drawGraph, drawScaleBar, fitScale, niceWindow, numbersIn, parseReadouts, r1, readGraph, readScale, shapeBy, textBy, vectorOf, type Readout,
} from "./kit";
import { drawScaleBar2, near, ptsOf, seg, subpaths, type P } from "./kit-b";

/**
 * Modern physics and alternating current (ADR 0109): the AC waveform, phasors and resonance, the electromagnetic wave and spectrum, the photoelectric effect, the Bohr atom, the nucleus
 * (seeded decay, decay chains, the binding energy curve) and the semiconductor figures. Every curve is a graph read back like those of wave 1; every geometry is read back from its shapes.
 */
const N = 48;
const evenly = (n: number, a: number, b: number, f: (x: number) => number): Array<[number, number]> => Array.from({ length: n + 1 }, (_, i) => [a + ((b - a) * i) / n, f(a + ((b - a) * i) / n)] as [number, number]);
const six = (x: number): number => Number(x.toPrecision(6));
const val = (r: DrawResult, k: string): number => parseReadouts(r).get(k)?.value ?? NaN;
const word = (r: DrawResult, k: string): string | undefined => parseReadouts(r).get(k)?.word;

// ---- alternating current ---------------------------------------------------------------------------------------------------------------------------------------------------------------
type Lcr = { v0: number; r: number; l: number; c: number };
const resonanceWindow = (p: Lcr & { window_ratio: number }): number => niceWindow(0, resonanceFrequency(p.l, p.c) * p.window_ratio)[1];
export const acFigure = physicsDrawer("p_ac", "ac_circuits", {
  covers: ["AC waveform, phasor, resonance curve"],
  readouts(p) {
    if (p.mode === "waveform") return [{ key: "V0", value: p.v0, unit: "V" }, { key: "f", value: p.frequency, unit: "Hz" }, { key: "T", value: 1 / p.frequency, unit: "s" }, { key: "Vrms", value: rmsOf(p.v0), unit: "V" }, { key: "omega", value: 2 * Math.PI * p.frequency, unit: "rad/s" }];
    if (p.mode === "phasor") {
      const s = seriesLcr({ ...p, f: p.frequency });
      return [{ key: "V0", value: p.v0, unit: "V" }, { key: "R", value: p.r, unit: "ohm" }, { key: "L", value: p.l, unit: "H" }, { key: "C", value: p.c, unit: "F" }, { key: "f", value: p.frequency, unit: "Hz" }, { key: "Z", value: s.z, unit: "ohm" }, { key: "I0", value: s.i0, unit: "A" }, { key: "phi", value: s.phiDeg, unit: "deg" }];
    }
    const f0 = resonanceFrequency(p.l, p.c);
    return [{ key: "V0", value: p.v0, unit: "V" }, { key: "R", value: p.r, unit: "ohm" }, { key: "L", value: p.l, unit: "H" }, { key: "C", value: p.c, unit: "F" }, { key: "f0", value: f0, unit: "Hz" }, { key: "Q", value: qualityFactor(p.r, p.l, p.c), unit: "" }, { key: "Width", value: bandwidth(p.r, p.l), unit: "Hz" }, { key: "Imax", value: p.v0 / p.r, unit: "A" }];
  },
  draw(sk, p) {
    const pic = sk.L.pic;
    if (p.mode === "waveform") {
      const T = six(p.cycles / p.frequency);
      const k = 2 * Math.PI * p.frequency;
      drawGraph(sk, {
        xName: "t", xUnit: "s", yName: "v", yUnit: "V", xwin: [0, T], ywin: niceWindow(-p.v0, p.v0),
        series: [{ id: "c0", pts: evenly(N, 0, T, (t) => p.v0 * Math.sin(k * t)) }, { id: "c1", pts: [[0, rmsOf(p.v0)], [T / 2, rmsOf(p.v0)], [T, rmsOf(p.v0)]], dash: true, width: 0.3, label: "rms", labelAt: 0.5 }],
      });
      return;
    }
    if (p.mode === "phasor") {
      const s = seriesLcr({ ...p, f: p.frequency });
      const o: P = [pic.x + pic.w * 0.3, pic.y + (pic.h - 2) / 2];
      const perUnit = fitScale(s.vr, Math.max(s.vl, s.vc, Math.abs(s.vl - s.vc)), pic.w * 0.55, (pic.h - 8) / 2);
      const arrow = (id: string, x: number, y: number): void => sk.arrow(id, o[0], o[1], o[0] + x / perUnit, o[1] - y / perUnit, { width: id === "vt" ? 0.6 : 0.45, dash: id === "vc" });
      arrow("vr", s.vr, 0);
      arrow("vl", 0, s.vl);
      arrow("vc", 0, -s.vc);
      arrow("vt", s.vr, s.vl - s.vc);
      sk.text("tr", o[0] + s.vr / perUnit + 1, o[1] + 2.4, "VR", { anchor: "start" });
      sk.text("tl", o[0] - 1.2, o[1] - s.vl / perUnit - 1.2, "VL", { anchor: "end" });
      sk.text("tc", o[0] - 1.2, o[1] + s.vc / perUnit + 1.2, "VC", { anchor: "end" });
      drawScaleBar(sk, pic.x + 1, pic.y + pic.h - 1.6, perUnit, "V");
      return;
    }
    const f0 = resonanceFrequency(p.l, p.c);
    const fmax = resonanceWindow(p);
    const imax = p.v0 / p.r;
    const f = drawGraph(sk, { xName: "f", xUnit: "Hz", yName: "I0", yUnit: "A", xwin: [0, fmax], ywin: niceWindow(0, imax), series: [{ id: "c0", pts: resonancePts(p, fmax) }] });
    sk.path("mk", `M${r1(f.X(f0))} ${r1(f.Y(0))}L${r1(f.X(f0))} ${r1(f.Y(imax))}`, { color: "soft", dash: true, width: 0.25 });
    sk.text("tf", f.X(f0) + 1, f.b - 1.8, "f0", { anchor: "start" });
  },
  check(r, p) {
    const out: string[] = [];
    if (p.mode === "phasor") {
      const s = seriesLcr({ ...p, f: p.frequency });
      const ps = readScale(r);
      const [vr, vl, vc, vt] = ["vr", "vl", "vc", "vt"].map((id) => arrowBy(r, id));
      if (ps === undefined || !vr || !vl || !vc || !vt) return ["a phasor or the scale bar is missing"];
      const v = (a: NonNullable<typeof vr>) => vectorOf(a, ps);
      const [a, b, c, d] = [v(vr), v(vl), v(vc), v(vt)];
      const tol = 0.02 * ps + 1e-9;
      if (!near(a.x, s.vr, tol) || !near(a.y, 0, tol)) out.push("VR is drawn along the current (the +x axis) with the length I R");
      if (!near(b.y, s.vl, tol) || !near(b.x, 0, tol)) out.push("VL is drawn 90 degrees ahead of the current, with the length I XL");
      if (!near(c.y, -s.vc, tol) || !near(c.x, 0, tol)) out.push("VC is drawn 90 degrees behind the current, with the length I XC");
      // the sum of the three phasors is the supply: V0 = sqrt(VR^2 + (VL - VC)^2), at the phase angle phi
      if (!near(d.x, a.x + b.x + c.x, tol) || !near(d.y, a.y + b.y + c.y, tol)) out.push("the total phasor is not the sum of the three");
      if (!near(Math.hypot(d.x, d.y), p.v0, 0.012 * p.v0 + tol)) out.push("the total phasor is not as long as the supply voltage");
      if (!near((Math.atan2(d.y, d.x) * 180) / Math.PI, s.phiDeg, 0.4)) out.push("the angle of the total phasor is not the phase angle");
      return out;
    }
    const g = readGraph(r);
    if (!g.ok) return [g.why];
    if (p.mode === "waveform") {
      const T = six(p.cycles / p.frequency);
      const k = 2 * Math.PI * p.frequency;
      out.push(...checkCurve(g, "c0", (t) => p.v0 * Math.sin(k * t), "voltage", N + 1, (i) => (T * i) / N));
      const rms = g.curve("c1");
      if (rms.length !== 3 || !near(rms[0]![1], rmsOf(p.v0), 0.012 * p.v0)) out.push("the dashed line is not at the rms value, V0 over root 2");
      return out;
    }
    const f0 = resonanceFrequency(p.l, p.c);
    const fmax = resonanceWindow(p);
    out.push(...checkCurve(g, "c0", (f) => (f <= 0 ? 0 : currentAt(p, f)), "current", N + 1, (i) => (fmax * i) / N));
    const mk = ptsOf(r, "mk");
    if (mk.length !== 2 || !near(g.toX(mk[0]![0]), f0, ((g.xwin[1] - g.xwin[0]) / (g.frame.r - g.frame.l)) * 0.15)) out.push("the marker is not at the resonant frequency 1 / (2 pi sqrt(LC))");
    const pts = g.curve("c0");
    const top = pts.reduce((m, q) => (q[1] > m[1] ? q : m), pts[0]!);
    if (Math.abs(top[0] - f0) > 2.5 * (fmax / N)) out.push("the curve does not peak at the resonant frequency");
    return out;
  },
});
function resonancePts(p: Lcr, fmax: number): Array<[number, number]> {
  return Array.from({ length: N + 1 }, (_, i) => {
    const f = (fmax * i) / N;
    return [f, f <= 0 ? 0 : currentAt(p, f)] as [number, number];
  });
}

// ---- electromagnetic waves and the spectrum ---------------------------------------------------------------------------------------------------------------------------------------------
export const emWaveFigure = physicsDrawer("p_em_wave", "em_wave_and_spectrum", {
  covers: ["EM wave, spectrum"],
  readouts(p) {
    if (p.mode === "wave") {
      const lam = emWavelength(p.frequency);
      return [{ key: "f", value: p.frequency, unit: "Hz" }, { key: "lambda", value: lam, unit: "m" }, { key: "c", value: C_LIGHT, unit: "m/s" }, { key: "E0", value: p.e0, unit: "V/m" }, { key: "B0", value: p.e0 / C_LIGHT, unit: "T" }, { key: "T", value: 1 / p.frequency, unit: "s" }, { key: "Band", word: bandOf(lam) }];
    }
    return [{ key: "lambda", value: p.wavelength, unit: "m" }, { key: "f", value: C_LIGHT / p.wavelength, unit: "Hz" }, { key: "Photon", value: photonEv(C_LIGHT / p.wavelength), unit: "eV" }, { key: "Band", word: bandOf(p.wavelength) }];
  },
  draw(sk, p) {
    const pic = sk.L.pic;
    if (p.mode === "wave") {
      const lam = six(emWavelength(p.frequency));
      const f = drawGraph(sk, {
        xName: "x", xUnit: "m", yName: "E/E0 and B/B0", yUnit: "", xwin: [0, 2 * lam], ywin: [-1, 1],
        series: [{ id: "c0", pts: evenly(N, 0, 2 * lam, (x) => Math.sin((2 * Math.PI * x) / lam)), label: "E", labelAt: 0.375 }, { id: "c1", pts: evenly(N, 0, 2 * lam, (x) => Math.sin((2 * Math.PI * x) / lam)), dash: true, width: 0.3, label: "B", labelAt: 0.625 }],
      });
      sk.arrow("pr", f.l + 1, f.b - 2.2, f.l + 9, f.b - 2.2, { width: 0.5 });
      return;
    }
    // seven bands side by side (not to scale), the marker in the one the wavelength is in
    const x0 = pic.x + 0.8;
    const w = (pic.w - 1.6) / BANDS.length;
    const y = pic.y + (pic.h - 2) / 2;
    sk.path("bx", `M${r1(x0)} ${r1(y - 3)}L${r1(x0 + w * BANDS.length)} ${r1(y - 3)}L${r1(x0 + w * BANDS.length)} ${r1(y + 3)}L${r1(x0)} ${r1(y + 3)}Z` + BANDS.map((_, i) => `M${r1(x0 + w * i)} ${r1(y - 3)}L${r1(x0 + w * i)} ${r1(y + 3)}`).join(""), { width: 0.4, how: "fade" });
    BANDS.forEach((b, i) => sk.text(`n${i}`, x0 + w * (i + 0.5), y + (i % 2 === 0 ? -5.2 : 5.6), b.name, { anchor: "middle" }));
    const idx = BANDS.findIndex((b) => p.wavelength >= b.lo && p.wavelength < b.hi);
    const band = BANDS[idx < 0 ? BANDS.length - 1 : idx]!;
    const t = (Math.log10(p.wavelength) - Math.log10(band.lo)) / (Math.log10(band.hi) - Math.log10(band.lo));
    const mx = x0 + w * ((idx < 0 ? BANDS.length - 1 : idx) + Math.min(0.95, Math.max(0.05, t)));
    // the arrow comes in from the side of the box that has no label for this band
    const fromAbove = (idx < 0 ? BANDS.length - 1 : idx) % 2 === 1;
    sk.arrow("mk", mx, fromAbove ? y - 3 - 8.5 : y + 3 + 8.5, mx, fromAbove ? y - 3.2 : y + 3.2, { width: 0.5 });
  },
  check(r, p) {
    const out: string[] = [];
    if (p.mode === "wave") {
      const g = readGraph(r);
      if (!g.ok) return [g.why];
      const lam = six(emWavelength(p.frequency));
      if (!near(g.xwin[1], 2 * lam, 1e-9 * lam)) out.push("the window is not two wavelengths");
      for (const id of ["c0", "c1"]) out.push(...checkCurve(g, id, (x) => Math.sin((2 * Math.PI * x) / lam), id === "c0" ? "E" : "B", N + 1, (i) => (2 * lam * i) / N));
      const pr = arrowBy(r, "pr");
      if (!pr || !(pr.x2 > pr.x1)) out.push("the wave travels to the right, so the arrow does");
      if (!near(val(r, "lambda") * val(r, "f"), C_LIGHT, 0.012 * C_LIGHT)) out.push("lambda times f is not the speed of light");
      if (!near(val(r, "E0") / val(r, "B0"), C_LIGHT, 0.012 * C_LIGHT)) out.push("E0 over B0 is not the speed of light");
      return out;
    }
    const idx = BANDS.findIndex((b) => p.wavelength >= b.lo && p.wavelength < b.hi);
    const want = idx < 0 ? BANDS.length - 1 : idx;
    const bx = ptsOf(r, "bx");
    const mk = arrowBy(r, "mk");
    if (bx.length < 4 || !mk) return ["the bands or the marker are missing"];
    const x0 = bx[0]![0];
    const w = (bx[1]![0] - x0) / BANDS.length;
    const got = Math.floor((mk.x2 - x0) / w);
    if (got !== want) out.push(`the marker is in band ${got + 1} and the wavelength is in band ${want + 1} (${bandOf(p.wavelength)})`);
    const [top, bottom] = [bx[0]![1], bx[1]![1] === bx[0]![1] ? bx[2]![1] : bx[1]![1]];
    const fromAbove = mk.y2 > mk.y1;
    if (!near(mk.y2, fromAbove ? Math.min(top, bottom) : Math.max(top, bottom), 0.4)) out.push("the marker's tip is on the edge of the band box");
    if (fromAbove !== (want % 2 === 1)) out.push("the marker comes in from the side of the box that has no label for the band");
    if (word(r, "Band") !== BANDS[want]!.name) out.push("the band named is not the band of the wavelength");
    BANDS.forEach((b, i) => {
      if (textBy(r, `n${i}`) !== b.name) out.push(`band ${i + 1} is not labelled ${b.name}`);
    });
    return out;
  },
});

// ---- the photoelectric effect -------------------------------------------------------------------------------------------------------------------------------------------------------------
type PeP = { work_ev: number; frequency: number; work2_ev?: number; window?: number };
const peWindow = (p: PeP): number => p.window ?? niceWindow(0, Math.max(p.frequency * 1.15, thresholdFrequency(p.work2_ev ?? p.work_ev) * 1.25))[1];
export const photoelectricFigure = physicsDrawer("p_photoelectric", "photoelectric_effect", {
  covers: ["Photoelectric setup and KE-frequency graph"],
  readouts(p) {
    const ke = keMax(p.frequency, p.work_ev);
    const out: Readout[] = [{ key: "Work", value: p.work_ev, unit: "eV" }, { key: "f0", value: thresholdFrequency(p.work_ev), unit: "Hz" }, { key: "f", value: p.frequency, unit: "Hz" }, { key: "Photon", value: photonEv(p.frequency), unit: "eV" }];
    out.push(ke === null ? { key: "Emission", word: "none" } : { key: "KE max", value: ke, unit: "eV" });
    if (ke !== null) out.push({ key: "Stopping", value: ke, unit: "V" });
    out.push({ key: "Slope", value: H_OVER_E, unit: "V.s" });
    if (p.work2_ev !== undefined) out.push({ key: "f0 metal 2", value: thresholdFrequency(p.work2_ev), unit: "Hz" });
    return out;
  },
  draw(sk, p) {
    const W = peWindow(p);
    const keAt = (phi: number, f: number): number => photonEv(f) - phi;
    const top = Math.max(keAt(p.work_ev, W), 1e-3);
    const yw = niceWindow(0, top);
    const line = (phi: number): Array<[number, number]> => [[thresholdFrequency(phi), 0], [W, keAt(phi, W)]];
    const series = [{ id: "c0", pts: line(p.work_ev), label: p.work2_ev !== undefined ? "1" : undefined, labelAt: 0.9 }];
    if (p.work2_ev !== undefined && thresholdFrequency(p.work2_ev) < W) series.push({ id: "c1", pts: line(p.work2_ev), dash: true, width: 0.3, label: "2", labelAt: 0.9 } as never);
    const f = drawGraph(sk, { xName: "f", xUnit: "Hz", yName: "KE max", yUnit: "eV", xwin: [0, W], ywin: yw, series });
    const ke = keMax(p.frequency, p.work_ev);
    sk.path("mk", ke === null ? `M${r1(f.X(p.frequency))} ${r1(f.b - 2.4)}L${r1(f.X(p.frequency))} ${r1(f.b)}` : `M${r1(f.X(p.frequency))} ${r1(f.Y(0))}L${r1(f.X(p.frequency))} ${r1(f.Y(ke))}L${r1(f.l)} ${r1(f.Y(ke))}`, { color: "soft", dash: true, width: 0.25 });
  },
  check(r, p) {
    const out: string[] = [];
    const g = readGraph(r);
    if (!g.ok) return [g.why];
    const W = peWindow(p);
    if (!near(g.xwin[1], W, 1e-9 * W) || g.xwin[0] !== 0) out.push("the frequency axis is not the window of the inputs");
    const lines: Array<[string, number]> = [["c0", p.work_ev]];
    if (p.work2_ev !== undefined && thresholdFrequency(p.work2_ev) < W) lines.push(["c1", p.work2_ev]);
    const tx = ((g.xwin[1] - g.xwin[0]) / (g.frame.r - g.frame.l)) * 0.1;
    const ty = ((g.ywin[1] - g.ywin[0]) / (g.frame.b - g.frame.t)) * 0.1;
    for (const [id, phi] of lines) {
      const pts = g.curve(id);
      if (pts.length !== 2) {
        out.push(`the line ${id} is missing`);
        continue;
      }
      // the intercept on the frequency axis is the threshold, and the slope is h / e whatever the metal
      const f0 = thresholdFrequency(phi);
      if (!near(pts[0]![0], f0, 2 * tx) || !near(pts[0]![1], 0, 2 * ty)) out.push(`the line starts at ${pts[0]![0].toExponential(3)} Hz and the threshold of the metal is ${f0.toExponential(3)}`);
      const slope = (pts[1]![1] - pts[0]![1]) / (pts[1]![0] - pts[0]![0]);
      if (!near(slope, H_OVER_E, 0.012 * H_OVER_E + (3 * ty) / (pts[1]![0] - pts[0]![0]))) out.push(`the slope is ${slope.toExponential(3)} V s and h/e is ${H_OVER_E.toExponential(3)}`);
    }
    const mk = ptsOf(r, "mk");
    const ke = keMax(p.frequency, p.work_ev);
    if (mk.length < 2 || !near(g.toX(mk[0]![0]), p.frequency, 2 * tx)) out.push("the marker is not at the frequency of the light");
    if (ke === null ? word(r, "Emission") !== "none" || mk.length !== 2 : mk.length !== 3 || !near(g.toY(mk[1]![1]), ke, 2 * ty)) out.push(ke === null ? "below the threshold nothing is emitted, and the picture says so" : "the marker is not on the line");
    return out;
  },
});

// ---- the atom ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
const LEVELS = 7;
const eWindow: [number, number] = [-14, 0];
export const atomFigure = physicsDrawer("p_atom_models", "atom_models", {
  covers: ["Bohr model, energy levels, spectral series"],
  readouts(p) {
    if (p.mode === "bohr") return [{ key: "Z", value: p.z, unit: "" }, { key: "n", value: p.n_at, unit: "" }, { key: "r_n", value: bohrRadius(p.n_at, p.z), unit: "m" }, { key: "E_n", value: bohrEnergy(p.n_at, p.z), unit: "eV" }, { key: "r_1", value: bohrRadius(1, p.z), unit: "m" }];
    const t = transition(1, p.n_high, p.n_low);
    return [{ key: "n high", value: p.n_high, unit: "" }, { key: "n low", value: p.n_low, unit: "" }, { key: "E high", value: bohrEnergy(p.n_high, 1), unit: "eV" }, { key: "E low", value: bohrEnergy(p.n_low, 1), unit: "eV" }, { key: "Photon", value: t.energyEv, unit: "eV" }, { key: "lambda", value: t.wavelength, unit: "m" }, { key: "Series", word: t.series }, { key: "Region", word: t.band }];
  },
  draw(sk, p) {
    const pic = sk.L.pic;
    if (p.mode === "bohr") {
      const cx = pic.x + pic.w / 2;
      const cy = pic.y + (pic.h - 2.5) / 2;
      const rMax = bohrRadius(p.n_max, p.z);
      const s = (Math.min(pic.w, pic.h - 3.5) / 2 - 1.2) / rMax;
      for (let n = 1; n <= p.n_max; n++) {
        sk.circle(`o${n}`, cx, cy, bohrRadius(n, p.z) * s, { width: n === p.n_at ? 0.45 : 0.25, dash: n !== p.n_at, color: n === p.n_at ? "ink" : "soft" });
        sk.text(`t${n}`, cx + bohrRadius(n, p.z) * s * 0.7071 + 0.5, cy - bohrRadius(n, p.z) * s * 0.7071 - 1.2, String(n), { anchor: "start" });
      }
      sk.circle("nu", cx, cy, 0.9, { fill: "red", fillOpacity: 0.6, width: 0.3 });
      const a = (40 * Math.PI) / 180;
      sk.circle("el", cx + bohrRadius(p.n_at, p.z) * s * Math.cos(a), cy - bohrRadius(p.n_at, p.z) * s * Math.sin(a), 0.7, { fill: "ink" });
      drawScaleBar2(sk, pic.x + 1, pic.y + pic.h - 1.6, 1 / s, "m");
      return;
    }
    // energy levels on a linear scale of eV: the ground state is at -13.6 and the levels crowd up towards 0
    const t = pic.y + 2;
    const b = pic.y + pic.h - 3.6;
    const l = pic.x + 8;
    const rgt = pic.x + pic.w - 2;
    const Y = (e: number): number => b - ((e - eWindow[0]) / (eWindow[1] - eWindow[0])) * (b - t);
    sk.path("ax", `M${r1(l)} ${r1(t)}L${r1(l)} ${r1(b)}`, { width: 0.4 });
    sk.text("yl", pic.x + 0.5, pic.y + pic.h - 1.2, `E (eV), ${eWindow[0]} to ${eWindow[1]}`, { anchor: "start" });
    sk.path("lv", Array.from({ length: LEVELS }, (_, i) => seg([l + 1, Y(bohrEnergy(i + 1, 1))], [rgt - 6, Y(bohrEnergy(i + 1, 1))], r1)).join(""), { width: 0.35 });
    const xm = (l + rgt) / 2 - 2;
    sk.arrow("tr", xm, Y(bohrEnergy(p.n_high, 1)), xm, Y(bohrEnergy(p.n_low, 1)), { width: 0.5 });
    sk.text("nl", rgt - 5, Y(bohrEnergy(p.n_low, 1)), `n=${p.n_low}`, { anchor: "start" });
    sk.text("nh", l - 1.2, Y(bohrEnergy(p.n_high, 1)), `n=${p.n_high}`, { anchor: "end" });
  },
  check(r, p) {
    const out: string[] = [];
    if (p.mode === "bohr") {
      const ps = readScale(r);
      const circles = Array.from({ length: p.n_max }, (_, i) => shapeBy(r, `o${i + 1}`));
      const el = shapeBy(r, "el");
      const nu = shapeBy(r, "nu");
      if (ps === undefined || circles.some((c) => !c) || !el || !nu) return ["an orbit, the nucleus, the electron or the scale bar is missing"];
      circles.forEach((c, i) => {
        const want = bohrRadius(i + 1, p.z);
        if (!near(Number(c!.r) * ps, want, 0.006 * want + 0.03 * ps)) out.push(`orbit ${i + 1} has radius ${(Number(c!.r) * ps).toExponential(3)} m and n^2 a0 / Z gives ${want.toExponential(3)}`);
      });
      const d = Math.hypot(Number(el.cx) - Number(nu.cx), Number(el.cy) - Number(nu.cy));
      if (!near(d, Number(circles[p.n_at - 1]!.r), 0.08)) out.push("the electron is not on the orbit its n says");
      return out;
    }
    const ax = ptsOf(r, "ax");
    const lv = ptsOf(r, "lv").filter((_, i) => i % 2 === 0);
    const tr = arrowBy(r, "tr");
    if (ax.length !== 2 || lv.length !== LEVELS || !tr) return ["the axis, the levels or the transition arrow are missing"];
    const [t, b] = [ax[0]![1], ax[1]![1]];
    const E = (y: number): number => eWindow[0] + ((b - y) / (b - t)) * (eWindow[1] - eWindow[0]);
    const tol = ((eWindow[1] - eWindow[0]) / (b - t)) * 0.1;
    lv.forEach((q, i) => {
      if (!near(E(q[1]), bohrEnergy(i + 1, 1), tol)) out.push(`level ${i + 1} is drawn at ${E(q[1]).toFixed(2)} eV and -13.6 / n^2 gives ${bohrEnergy(i + 1, 1).toFixed(2)}`);
    });
    if (!near(E(tr.y1), bohrEnergy(p.n_high, 1), tol) || !near(E(tr.y2), bohrEnergy(p.n_low, 1), tol)) out.push("the arrow does not run from the higher level to the lower one");
    if (!(tr.y2 > tr.y1)) out.push("light is emitted when the electron falls, so the arrow points down");
    const t_ = transition(1, p.n_high, p.n_low);
    if (!near(val(r, "Photon"), E(tr.y1) - E(tr.y2), 0.012 * t_.energyEv + 2 * tol)) out.push("the photon energy is not the gap between the two drawn levels");
    if (!near(val(r, "lambda") * val(r, "Photon"), (C_LIGHT * 6.62607015e-34) / 1.602176634e-19, 0.012 * 1.2398e-6)) out.push("lambda is not h c over the photon energy");
    if (textBy(r, "nl") !== `n=${p.n_low}` || textBy(r, "nh") !== `n=${p.n_high}`) out.push("the levels are labelled with their n");
    return out;
  },
});

// ---- the nucleus ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
const N_SIM = 16;
type DecayP = { nuclei: number; half_life: number; seed: number; half_lives: number };
const decayWindow = (p: DecayP): number => six(p.half_lives * p.half_life);
const simTimes = (p: DecayP): number[] => Array.from({ length: N_SIM + 1 }, (_, i) => (decayWindow(p) * i) / N_SIM);
export const nuclearFigure = physicsDrawer("p_nuclear", "nuclear_physics", {
  covers: ["Binding-energy curve, decay chain, reactor schematic"],
  readouts(p) {
    if (p.mode === "decay") {
      const run = decayRun(p.nuclei, p.half_life, simTimes(p), p.seed);
      return [{ key: "N0", value: p.nuclei, unit: "" }, { key: "Half-life", value: p.half_life, unit: "s" }, { key: "lambda", value: Math.LN2 / p.half_life, unit: "1/s" }, { key: "N at T", value: remainingExact(p.nuclei, p.half_life, p.half_life), unit: "" }, { key: "Seed", value: p.seed, unit: "" }, { key: "Run end", value: run[N_SIM]!, unit: "" }];
    }
    if (p.mode === "chain") {
      const c = decayChain({ a: p.a, z: p.z }, p.steps).chain;
      const last = c[c.length - 1]!;
      return [{ key: "Start", word: `${symbolOf(p.z)} ${p.a}` }, { key: "End", word: `${symbolOf(last.z)} ${last.a}` }, { key: "Alpha", value: [...p.steps].filter((s) => s === "a").length, unit: "" }, { key: "Beta", value: [...p.steps].filter((s) => s === "b").length, unit: "" }, { key: "Delta A", value: last.a - p.a, unit: "" }, { key: "Delta Z", value: last.z - p.z, unit: "" }];
    }
    return [{ key: "A", value: p.a, unit: "" }, { key: "Z", value: stableZ(p.a), unit: "" }, { key: "BE per A", value: bindingPerNucleon(p.a), unit: "MeV" }, { key: "Peak at A", value: bindingPeak(), unit: "" }, { key: "Model", word: "mass formula" }];
  },
  draw(sk, p) {
    if (p.mode === "decay") {
      const T = decayWindow(p);
      const run = decayRun(p.nuclei, p.half_life, simTimes(p), p.seed);
      const f = drawGraph(sk, {
        xName: "t", xUnit: "s", yName: "N", yUnit: "", xwin: [0, T], ywin: niceWindow(0, p.nuclei),
        series: [{ id: "c0", pts: evenly(N, 0, T, (t) => remainingExact(p.nuclei, p.half_life, t)) }, { id: "c1", pts: simTimes(p).map((t, i) => [t, run[i]!] as [number, number]), dash: true, width: 0.3, label: "run", labelAt: 0.4 }],
      });
      sk.path("mk", `M${r1(f.X(p.half_life))} ${r1(f.Y(0))}L${r1(f.X(p.half_life))} ${r1(f.Y(p.nuclei / 2))}L${r1(f.l)} ${r1(f.Y(p.nuclei / 2))}`, { color: "soft", dash: true, width: 0.25 });
      return;
    }
    if (p.mode === "chain") {
      const c = decayChain({ a: p.a, z: p.z }, p.steps).chain;
      const ns = c.map((q) => q.a - q.z);
      const zs = c.map((q) => q.z);
      const [n0, n1, z0, z1] = [Math.min(...ns) - 1, Math.max(...ns) + 1, Math.min(...zs) - 1, Math.max(...zs) + 1];
      const f = drawGraph(sk, { xName: "N", xUnit: "", yName: "Z", yUnit: "", xwin: [n0, Math.max(n1, n0 + 2)], ywin: [z0, Math.max(z1, z0 + 2)], series: [{ id: "c0", pts: c.map((q) => [q.a - q.z, q.z] as [number, number]), width: 0.45 }], equalScale: true });
      // each nuclide of the chain is marked with a small cross, so the steps can be counted
      sk.path("nd", c.map((q) => `M${r1(f.X(q.a - q.z) - 0.8)} ${r1(f.Y(q.z))}L${r1(f.X(q.a - q.z) + 0.8)} ${r1(f.Y(q.z))}M${r1(f.X(q.a - q.z))} ${r1(f.Y(q.z) - 0.8)}L${r1(f.X(q.a - q.z))} ${r1(f.Y(q.z) + 0.8)}`).join(""), { width: 0.4, how: "fade" });
      return;
    }
    const f = drawGraph(sk, { xName: "A", xUnit: "", yName: "BE per A", yUnit: "MeV", xwin: [0, 250], ywin: [0, 10], series: [{ id: "c0", pts: bindingPts() }] });
    sk.path("mk", `M${r1(f.X(p.a))} ${r1(f.Y(0))}L${r1(f.X(p.a))} ${r1(f.Y(bindingPerNucleon(p.a)))}L${r1(f.l)} ${r1(f.Y(bindingPerNucleon(p.a)))}`, { color: "soft", dash: true, width: 0.25 });
  },
  check(r, p) {
    const out: string[] = [];
    const g = readGraph(r);
    if (!g.ok) return [g.why];
    if (p.mode === "decay") {
      const T = decayWindow(p);
      out.push(...checkCurve(g, "c0", (t) => remainingExact(p.nuclei, p.half_life, t), "decay curve", N + 1, (i) => (T * i) / N));
      // the dashed run is the seeded simulation of the inputs, point for point, and stays near the law within a few standard deviations
      const times = simTimes(p);
      const run = decayRun(p.nuclei, p.half_life, times, p.seed);
      const pts = g.curve("c1");
      const ty = ((g.ywin[1] - g.ywin[0]) / (g.frame.b - g.frame.t)) * 0.12;
      if (pts.length !== N_SIM + 1) return [...out, "the simulated run has the wrong number of points"];
      pts.forEach(([, y], i) => {
        if (!near(y, run[i]!, ty + 1e-9)) out.push(`the run at point ${i} shows ${y.toFixed(1)} nuclei and the seeded simulation gives ${run[i]}`);
        const mean = remainingExact(p.nuclei, p.half_life, times[i]!);
        const sd = Math.sqrt(mean * (1 - mean / p.nuclei));
        if (Math.abs(y - mean) > 5 * sd + 1.5 + ty) out.push(`the run is further from the decay law than chance allows at point ${i}`);
      });
      const mk = ptsOf(r, "mk");
      if (mk.length !== 3 || !near(g.toX(mk[0]![0]), p.half_life, ((g.xwin[1] - g.xwin[0]) / (g.frame.r - g.frame.l)) * 0.15) || !near(g.toY(mk[1]![1]), p.nuclei / 2, ty * 1.3)) out.push("after one half-life half of the nuclei are left, and the marker is not there");
      return out.slice(0, 4);
    }
    if (p.mode === "chain") {
      const c = decayChain({ a: p.a, z: p.z }, p.steps).chain;
      const pts = g.curve("c0");
      if (pts.length !== c.length) return [...out, `${pts.length} nuclides are drawn and the chain has ${c.length}`];
      const tx = ((g.xwin[1] - g.xwin[0]) / (g.frame.r - g.frame.l)) * 0.12;
      pts.forEach(([n, z], i) => {
        if (!near(n, c[i]!.a - c[i]!.z, tx + 1e-9) || !near(z, c[i]!.z, tx + 1e-9)) out.push(`nuclide ${i} is at (N=${n.toFixed(2)}, Z=${z.toFixed(2)}) and the chain gives (${c[i]!.a - c[i]!.z}, ${c[i]!.z})`);
      });
      const nd = subpaths(shapeBy(r, "nd")?.d);
      if (nd.length !== 2 * c.length) out.push(`${nd.length / 2} nuclide marks are drawn and the chain has ${c.length}`);
      else
        for (let i = 0; i < c.length; i++) {
          const h = nd[2 * i]!;
          const cx = (h[0]![0] + h[1]![0]) / 2;
          const cy = (h[0]![1] + h[1]![1]) / 2;
          if (!near(g.toX(cx), c[i]!.a - c[i]!.z, tx * 1.2 + 1e-9) || !near(g.toY(cy), c[i]!.z, tx * 1.2 + 1e-9)) {
            out.push(`the mark of nuclide ${i} is not on the curve`);
            break;
          }
        }
      return out.slice(0, 3);
    }
    out.push(...checkCurve(g, "c0", (a) => bindingPerNucleon(Math.max(a, 1)), "binding energy per nucleon", bindingPts().length, (i) => bindingPts()[i]![0]));
    const mk = ptsOf(r, "mk");
    if (mk.length !== 3 || !near(g.toX(mk[0]![0]), p.a, ((g.xwin[1] - g.xwin[0]) / (g.frame.r - g.frame.l)) * 0.15)) out.push("the marker is not at the chosen mass number");
    return out;
  },
});
const bindingPts = (): Array<[number, number]> => Array.from({ length: 41 }, (_, i) => [12 + i * 5.7, bindingPerNucleon(12 + i * 5.7)] as [number, number]);
const bindingPeak = (): number => {
  let best = 20;
  for (let a = 20; a <= 240; a++) if (bindingPerNucleon(a) > bindingPerNucleon(best)) best = a;
  return best;
};

// ---- semiconductors ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------
const N_DIODE = 40;
const GATE_ROWS = (g: Gate): Array<[number, number | undefined, number]> => (g === "NOT" ? [[0, undefined, gateOut(g, 0)], [1, undefined, gateOut(g, 1)]] : ([[0, 0], [0, 1], [1, 0], [1, 1]] as Array<[0 | 1, 0 | 1]>).map(([a, b]) => [a, b, gateOut(g, a, b)] as [number, number, number]));
export const semiconductorFigure = physicsDrawer("p_semiconductor", "semiconductor_devices", {
  covers: ["Band diagram, p-n junction, logic gates, transistor circuit"],
  readouts(p) {
    if (p.mode === "bands") return [{ key: "Gap", value: p.gap_ev, unit: "eV" }, { key: "Material", word: materialOf(p.gap_ev) }, { key: "kT", value: THERMAL_VOLT_300K, unit: "eV" }];
    if (p.mode === "diode") return [{ key: "Is", value: p.i_sat, unit: "A" }, { key: "n", value: p.ideality, unit: "" }, { key: "Vt", value: THERMAL_VOLT_300K, unit: "V" }, { key: "V max", value: p.v_max, unit: "V" }, { key: "I max", value: diodeCurrent(p.v_max, p.i_sat, p.ideality), unit: "A" }, { key: "Bias", word: "forward" }];
    if (p.mode === "pn") {
      const j = pnJunction(p.na, p.nd);
      return [{ key: "Na", value: p.na, unit: "m^-3" }, { key: "Nd", value: p.nd, unit: "m^-3" }, { key: "Vbi", value: j.vbi, unit: "V" }, { key: "W", value: j.width, unit: "m" }, { key: "xp", value: j.xp, unit: "m" }, { key: "xn", value: j.xn, unit: "m" }, { key: "Wider side", word: p.na === p.nd ? "equal" : p.na < p.nd ? "p side" : "n side" }];
    }
    const rows = GATE_ROWS(p.gate);
    return [{ key: "Gate", word: p.gate }, { key: "Inputs", value: p.gate === "NOT" ? 1 : 2, unit: "" }, { key: "Ones", value: rows.filter((q) => q[2] === 1).length, unit: "" }];
  },
  draw(sk, p) {
    const pic = sk.L.pic;
    if (p.mode === "bands") {
      const s = (pic.h - 20) / 12;
      const x0 = pic.x + 14;
      const w = pic.w - 22;
      const yMid = pic.y + pic.h / 2 - 1;
      const vbTop = yMid + (p.gap_ev * s) / 2;
      const cbBot = yMid - (p.gap_ev * s) / 2;
      sk.rect("vb", x0, vbTop, w, 6.5, { fill: "soft", fillOpacity: 0.3, width: 0.4 });
      sk.rect("cb", x0, cbBot - 6.5, w, 6.5, { fill: "soft", fillOpacity: 0.3, width: 0.4 });
      sk.text("tv", x0 + w / 2, vbTop + 3.25, "valence band", { anchor: "middle" });
      sk.text("tc", x0 + w / 2, cbBot - 3.25, "conduction band", { anchor: "middle" });
      if (p.gap_ev > 0) sk.arrow("ga", x0 - 3, vbTop, x0 - 3, cbBot, { width: 0.5 });
      drawScaleBar2(sk, pic.x + 1, pic.y + pic.h - 1.6, 1 / s, "eV");
      return;
    }
    if (p.mode === "diode") {
      const imax = diodeCurrent(p.v_max, p.i_sat, p.ideality);
      drawGraph(sk, { xName: "V", xUnit: "V", yName: "I", yUnit: "A", xwin: [0, p.v_max], ywin: niceWindow(0, imax), series: [{ id: "c0", pts: evenly(N_DIODE, 0, p.v_max, (v) => diodeCurrent(v, p.i_sat, p.ideality)) }] });
      return;
    }
    if (p.mode === "pn") {
      const j = pnJunction(p.na, p.nd);
      const y = pic.y + 6;
      const h = pic.h - 14;
      const x0 = pic.x + 2;
      const total = pic.w - 4;
      const dw = Math.min(14, total * 0.3);
      const bulk = (total - dw) / 2;
      sk.rect("pr", x0, y, bulk, h, { fill: "red", fillOpacity: 0.15, width: 0.35 });
      sk.rect("nr", x0 + bulk + dw, y, bulk, h, { fill: "purple", fillOpacity: 0.15, width: 0.35 });
      sk.rect("dp", x0 + bulk, y, dw, h, { fill: "soft", fillOpacity: 0.3, width: 0.35, dash: true });
      const jx = x0 + bulk + (dw * j.xp) / j.width;
      sk.path("jn", seg([jx, y - 1.5], [jx, y + h + 1.5], r1), { width: 0.4, dash: true });
      sk.text("tp", x0 + bulk / 2, y + h / 2, "p", { anchor: "middle", bold: true });
      sk.text("tn", x0 + bulk + dw + bulk / 2, y + h / 2, "n", { anchor: "middle", bold: true });
      drawScaleBar2(sk, pic.x + 1, pic.y + pic.h - 1.6, j.width / dw, "m");
      return;
    }
    // a logic gate and its truth table
    const g = p.gate;
    const two = g !== "NOT";
    const cy = pic.y + (pic.h - 2) / 2;
    const gx = pic.x + 12;
    const w = 12;
    const h = 9;
    const body = g === "AND" || g === "NAND" ? `M${r1(gx)} ${r1(cy - h / 2)}L${r1(gx + w / 2)} ${r1(cy - h / 2)}A${r1(h / 2)} ${r1(h / 2)} 0 0 1 ${r1(gx + w / 2)} ${r1(cy + h / 2)}L${r1(gx)} ${r1(cy + h / 2)}Z` : g === "NOT" ? `M${r1(gx)} ${r1(cy - h / 2)}L${r1(gx + w)} ${r1(cy)}L${r1(gx)} ${r1(cy + h / 2)}Z` : `M${r1(gx)} ${r1(cy - h / 2)}Q${r1(gx + w * 0.7)} ${r1(cy - h / 2)} ${r1(gx + w)} ${r1(cy)}Q${r1(gx + w * 0.7)} ${r1(cy + h / 2)} ${r1(gx)} ${r1(cy + h / 2)}Q${r1(gx + 3)} ${r1(cy)} ${r1(gx)} ${r1(cy - h / 2)}Z`;
    sk.path("gb", body, { width: 0.45 });
    const bubble = g === "NOT" || g === "NAND" || g === "NOR";
    const xOut = g === "AND" || g === "NAND" ? gx + w / 2 + h / 2 : gx + w;
    if (bubble) sk.circle("bb", xOut + 0.9, cy, 0.9, { width: 0.35 });
    if (g === "XOR") sk.path("xr", `M${r1(gx - 2)} ${r1(cy - h / 2)}Q${r1(gx + 1)} ${r1(cy)} ${r1(gx - 2)} ${r1(cy + h / 2)}`, { width: 0.4 });
    sk.path("ia", seg([gx - 8, two ? cy - h / 4 : cy], [gx, two ? cy - h / 4 : cy], r1), { width: 0.4 });
    if (two) sk.path("ib", seg([gx - 8, cy + h / 4], [gx, cy + h / 4], r1), { width: 0.4 });
    sk.path("oy", seg([xOut + (bubble ? 1.8 : 0), cy], [xOut + 8, cy], r1), { width: 0.4 });
    sk.text("la", gx - 9, two ? cy - h / 4 : cy, "A", { anchor: "end" });
    if (two) sk.text("lb", gx - 9, cy + h / 4, "B", { anchor: "end" });
    sk.text("ly", xOut + 9, cy, "Y", { anchor: "start" });
    const tx = pic.x + pic.w - 14;
    sk.text("h0", tx, pic.y + 4, two ? "A B Y" : "A Y", { anchor: "start", bold: true });
    GATE_ROWS(g).forEach((row, i) => sk.text(`w${i}`, tx, pic.y + 8 + i * 3.6, row[1] === undefined ? `${row[0]} ${row[2]}` : `${row[0]} ${row[1]} ${row[2]}`, { anchor: "start" }));
  },
  check(r, p) {
    const out: string[] = [];
    if (p.mode === "bands") {
      const ps = readScale(r);
      const [vb, cb] = [shapeBy(r, "vb"), shapeBy(r, "cb")];
      if (ps === undefined || !vb || !cb) return ["a band or the scale bar is missing"];
      const gap = (Number(vb.y) - (Number(cb.y) + Number(cb.h))) * ps;
      if (!near(gap, p.gap_ev, 0.012 * p.gap_ev + 0.03 * ps)) out.push(`the drawn gap is ${gap.toFixed(2)} eV and the inputs give ${p.gap_ev}`);
      const ga = arrowBy(r, "ga");
      if (p.gap_ev > 0) {
        if (!ga) out.push("the gap is marked with an arrow");
        else if (!(ga.y2 < ga.y1) || !near(ga.y1, Number(vb.y), 0.06) || !near(ga.y2, Number(cb.y) + Number(cb.h), 0.06)) out.push("the arrow runs up from the top of the valence band to the bottom of the conduction band");
      } else if (ga) out.push("a conductor has no gap to mark");
      if (word(r, "Material") !== materialOf(gap)) out.push(`a gap of ${gap.toFixed(2)} eV is a ${materialOf(gap)}`);
      return out;
    }
    if (p.mode === "gate") {
      const rows = GATE_ROWS(p.gate);
      rows.forEach((row, i) => {
        const t = textBy(r, `w${i}`);
        const got = numbersIn(t ?? "");
        const want = row[1] === undefined ? [row[0], row[2]] : [row[0], row[1], row[2]];
        if (got.length !== want.length || got.some((q, k) => q !== want[k])) out.push(`row ${i + 1} of the truth table reads "${t ?? ""}" and the ${p.gate} gate gives "${want.join(" ")}"`);
      });
      const bubble = p.gate === "NOT" || p.gate === "NAND" || p.gate === "NOR";
      if ((shapeBy(r, "bb") !== undefined) !== bubble) out.push(bubble ? "an inverting gate has a bubble at the output" : "this gate has no bubble at the output");
      if ((shapeBy(r, "ib") !== undefined) !== (p.gate !== "NOT")) out.push("a NOT gate has one input and the others have two");
      if ((shapeBy(r, "xr") !== undefined) !== (p.gate === "XOR")) out.push("only the exclusive OR has the extra curve at the input");
      return out;
    }
    if (p.mode === "pn") {
      const ps = readScale(r);
      const [dp, jn] = [shapeBy(r, "dp"), ptsOf(r, "jn")];
      if (ps === undefined || !dp || jn.length !== 2) return ["the depletion layer, the junction line or the scale bar is missing"];
      const na = val(r, "Na");
      const nd = val(r, "Nd");
      const j = pnJunction(na, nd);
      const xp = (jn[0]![0] - Number(dp.x)) * ps;
      const xn = (Number(dp.x) + Number(dp.w) - jn[0]![0]) * ps;
      if (!near(xp + xn, j.width, 0.012 * j.width + 0.03 * ps)) out.push("the drawn depletion layer is not as wide as W printed");
      if (!near(xp / xn, nd / na, 0.012 * (nd / na) + 0.02)) out.push("the depletion layer reaches further into the lightly doped side: xp / xn = Nd / Na, and the drawing does not");
      if (!near(val(r, "Vbi"), j.vbi, 0.012 * j.vbi) || !near(val(r, "W"), j.width, 0.012 * j.width)) out.push("Vbi or W is not what the printed doping gives");
      return out;
    }
    const g = readGraph(r);
    if (!g.ok) return [g.why];
    return checkCurve(g, "c0", (v) => diodeCurrent(v, p.i_sat, p.ideality), "diode current", N_DIODE + 1, (i) => (p.v_max * i) / N_DIODE, 0.12);
  },
});
