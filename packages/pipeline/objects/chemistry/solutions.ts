import { chemDrawer, near } from "./ckit";
import {
  GASES, INDICATORS, SOLUBILITY, SOLUBILITY_T, boilingPointC, idealPressure, indicatorColour, indicatorSuitable, maxwell, pHOf, R_GAS, solubilityAt, titrationFigures, titrationPH, vapourPressureKpa,
} from "./compute";
import { checkCurve, drawGraph, exact, niceCeil, niceWindow, parseReadouts, pointsOf, r1, r2, readGraph, sig, shapeBy, textBy, type Readout, type Series } from "../physics/kit";

/**
 * Wave 3, gases and solutions: the gas-law graphs and the Maxwell speed distribution, the titration curve with its indicator, the pH scale, the solubility curve and the vapour pressure
 * of water (ADR 0110). Each curve is a closed form of its inputs (an exact charge balance for the titration, the Antoine equation for water between 1 and 100 degrees C), and is read
 * back point by point; the figure's own invariants are read back as well (the area under a speed distribution is one, the pH of a marker is its place on the scale).
 */
const evenly = (n: number, a: number, b: number, f: (x: number) => number): Array<[number, number]> => Array.from({ length: n + 1 }, (_, i) => {
  const x = a + ((b - a) * i) / n;
  return [x, f(x)] as [number, number];
});
const trapezoid = (pts: Array<[number, number]>): number => pts.slice(1).reduce((s, q, i) => s + ((q[0] - pts[i]![0]) * (q[1] + pts[i]![1])) / 2, 0);

// ---- gas laws and the Maxwell distribution ----------------------------------------------------------------------------------------------------------------------------------
const N_GAS = 40;
const maxwellWindow = (p: { gas: keyof typeof GASES; t1: number; t2?: number }): [number, number] => [0, niceCeil(3.4 * maxwell(p.gas, p.t2 ?? p.t1).vp)];
export const gasGraph = chemDrawer("c_gas", "gas_law_graph", {
  covers: ["Gas law graphs, Maxwell distribution"],
  readouts(p) {
    if (p.mode === "boyle") return [{ key: "n", value: p.n_mol, unit: "mol" }, { key: "T", value: p.t_k, unit: "K" }, { key: "PV", value: p.n_mol * R_GAS * p.t_k, unit: "J" }, { key: "P at V min", value: idealPressure(p.n_mol, p.t_k, p.v_min), unit: "kPa" }, { key: "P at V max", value: idealPressure(p.n_mol, p.t_k, p.v_max), unit: "kPa" }];
    if (p.mode === "charles") return [{ key: "n", value: p.n_mol, unit: "mol" }, { key: "P", value: p.p_kpa, unit: "kPa" }, { key: "Slope", value: (p.n_mol * R_GAS) / p.p_kpa, unit: "L/K" }, { key: "V at max T", value: (p.n_mol * R_GAS * p.t_max) / p.p_kpa, unit: "L" }];
    if (p.mode === "gay_lussac") return [{ key: "n", value: p.n_mol, unit: "mol" }, { key: "V", value: p.v_l, unit: "L" }, { key: "Slope", value: (p.n_mol * R_GAS) / p.v_l, unit: "kPa/K" }, { key: "P at max T", value: idealPressure(p.n_mol, p.t_max, p.v_l), unit: "kPa" }];
    const m = maxwell(p.gas, p.t1);
    return [{ key: "Gas", word: p.gas }, { key: "vp", value: m.vp, unit: "m/s" }, { key: "v mean", value: m.vmean, unit: "m/s" }, { key: "v rms", value: m.vrms, unit: "m/s" }, ...(p.t2 !== undefined ? [{ key: "vp at T2", value: maxwell(p.gas, p.t2).vp, unit: "m/s" } as Readout] : [])];
  },
  draw(sk, p) {
    if (p.mode === "boyle") {
      const pts = evenly(N_GAS, p.v_min, p.v_max, (v) => idealPressure(p.n_mol, p.t_k, v));
      drawGraph(sk, { xName: "V", xUnit: "L", yName: "P", yUnit: "kPa", xwin: [0, niceCeil(p.v_max)], ywin: niceWindow(0, pts[0]![1]), series: [{ id: "c0", pts }] });
    } else if (p.mode === "charles" || p.mode === "gay_lussac") {
      const f = (t: number): number => (p.mode === "charles" ? (p.n_mol * R_GAS * t) / p.p_kpa : idealPressure(p.n_mol, t, p.v_l));
      const pts = evenly(N_GAS, 0, p.t_max, f);
      drawGraph(sk, { xName: "T", xUnit: "K", yName: p.mode === "charles" ? "V" : "P", yUnit: p.mode === "charles" ? "L" : "kPa", xwin: [0, niceCeil(p.t_max)], ywin: niceWindow(0, pts.at(-1)![1]), series: [{ id: "c0", pts }] });
    } else {
      const win = maxwellWindow(p);
      const m1 = maxwell(p.gas, p.t1);
      const series: Series[] = [{ id: "c0", pts: evenly(N_GAS, 0, win[1], m1.f), label: "T1", labelAt: 0.2 }];
      if (p.t2 !== undefined) series.push({ id: "c1", pts: evenly(N_GAS, 0, win[1], maxwell(p.gas, p.t2).f), dash: true, label: "T2", labelAt: 0.5 });
      const peak = Math.max(...series.flatMap((s) => s.pts.map((q) => q[1])));
      drawGraph(sk, { xName: "v", xUnit: "m/s", yName: "f", yUnit: "s/m", xwin: win, ywin: niceWindow(0, peak), series });
    }
  },
  check(result, p) {
    const g = readGraph(result);
    if (!g.ok) return [g.why];
    if (p.mode === "boyle") return checkCurve(g, "c0", (v) => idealPressure(p.n_mol, p.t_k, v), "P", N_GAS + 1, (i) => p.v_min + ((p.v_max - p.v_min) * i) / N_GAS);
    if (p.mode === "charles" || p.mode === "gay_lussac") {
      const f = (t: number): number => (p.mode === "charles" ? (p.n_mol * R_GAS * t) / p.p_kpa : idealPressure(p.n_mol, t, p.v_l));
      const out = checkCurve(g, "c0", f, p.mode === "charles" ? "V" : "P", N_GAS + 1, (i) => (p.t_max * i) / N_GAS);
      const c = g.curve("c0");
      if (c.length > 1 && !near(c[0]![1], 0, ((g.ywin[1] - g.ywin[0]) / (g.frame.b - g.frame.t)) * 0.1)) out.push("the line must start at zero at absolute zero");
      return out;
    }
    const win = maxwellWindow(p);
    const out = checkCurve(g, "c0", maxwell(p.gas, p.t1).f, "f(T1)", N_GAS + 1, (i) => (win[1] * i) / N_GAS);
    const curves = [["c0", p.t1], ...(p.t2 !== undefined ? [["c1", p.t2]] : [])] as Array<[string, number]>;
    for (const [id, t] of curves) {
      const pts = g.curve(id);
      if (id === "c1") out.push(...checkCurve(g, "c1", maxwell(p.gas, t).f, "f(T2)", N_GAS + 1, (i) => (win[1] * i) / N_GAS));
      // a speed distribution is normalised: the fraction of molecules at all speeds is one
      if (pts.length > 2 && !near(trapezoid(pts), 1, 0.05)) out.push(`the area under the ${id === "c0" ? "T1" : "T2"} curve is ${sig(trapezoid(pts))} and a distribution of speeds has area 1`);
      const top = pts.reduce((b, q) => (q[1] > b[1] ? q : b), pts[0]!);
      if (pts.length > 2 && !near(top[0], maxwell(p.gas, t).vp, win[1] / 40 + 1)) out.push(`the peak of the ${id === "c0" ? "T1" : "T2"} curve is not at the most probable speed`);
    }
    return out.slice(0, 3);
  },
});

// ---- titration ------------------------------------------------------------------------------------------------------------------------------------------------------------------------
const N_TITR = 48;
type TitrP = { acid: "strong" | "weak"; ca: number; va: number; cb: number; pka?: number; indicator?: string };
const titrWindow = (p: TitrP): [number, number] => [0, niceCeil((2 * p.ca * p.va) / p.cb)];
const jumpText = (f: { jumpLo: number; jumpHi: number }): string => `${sig(f.jumpLo)} to ${sig(f.jumpHi)}`;
export const titrationCurve = chemDrawer("c_titration", "titration_curve", {
  covers: ["Titration setup and curve"],
  readouts(p) {
    const f = titrationFigures(p as TitrP);
    const ind = p.indicator !== undefined ? INDICATORS[p.indicator]! : undefined;
    return [
      { key: "Equivalence", value: f.ve, unit: "mL" }, { key: "pH start", value: f.pHstart, unit: "" }, { key: "pH half", value: f.pHhalf, unit: "" }, { key: "pH equivalence", value: f.pHeq, unit: "" }, { key: "Steep part", word: jumpText(f) },
      ...(ind ? [{ key: "Indicator", word: ind.name } as Readout, { key: "Suitable", word: indicatorSuitable(ind, f) ? "yes" : "no" } as Readout] : []),
    ];
  },
  draw(sk, p) {
    const t = p as TitrP;
    const f = titrationFigures(t);
    const xwin = titrWindow(t);
    const pts = evenly(N_TITR, 0, 2 * f.ve, (v) => titrationPH(t, v));
    const fr = drawGraph(sk, { xName: "Base added", xUnit: "mL", yName: "pH", yUnit: "", xwin, ywin: [0, 14], series: [{ id: "c0", pts }] });
    sk.path("eq", `M${r1(fr.X(f.ve))} ${r1(fr.Y(0))}L${r1(fr.X(f.ve))} ${r1(fr.Y(14))}`, { color: "soft", dash: true, width: 0.25, how: "fade" });
    if (t.indicator) {
      const ind = INDICATORS[t.indicator]!;
      sk.rect("ib", fr.l, fr.Y(ind.hi), fr.r - fr.l, fr.Y(ind.lo) - fr.Y(ind.hi), { color: "none", fill: "yellow", fillOpacity: 0.3 });
      sk.text("il", fr.r - 0.5, (fr.Y(ind.hi) + fr.Y(ind.lo)) / 2, ind.name, { anchor: "end" });
    }
  },
  check(result, p) {
    const t = p as TitrP;
    const g = readGraph(result);
    if (!g.ok) return [g.why];
    const f = titrationFigures(t);
    const out = checkCurve(g, "c0", (v) => titrationPH(t, v), "pH", N_TITR + 1, (i) => (2 * f.ve * i) / N_TITR);
    const eq = pointsOf(shapeBy(result, "eq")?.d);
    if (eq.length !== 2 || !near(g.toX(eq[0]![0]), f.ve, ((g.xwin[1] - g.xwin[0]) / (g.frame.r - g.frame.l)) * 0.12)) out.push("the equivalence line is not at the volume of base that matches the acid");
    if (t.indicator) {
      const ind = INDICATORS[t.indicator]!;
      const b = result.shapes.find((s) => String(s.id).endsWith("_ib"));
      const tol = ((g.ywin[1] - g.ywin[0]) / (g.frame.b - g.frame.t)) * 0.12;
      if (!b || !near(g.toY(Number(b.y) + Number(b.h)), ind.lo, tol) || !near(g.toY(Number(b.y)), ind.hi, tol)) out.push("the indicator band is not its colour-change range");
      if (textBy(result, "il") !== ind.name) out.push("the indicator label is not the indicator asked for");
    }
    return out.slice(0, 3);
  },
});

// ---- the pH scale ------------------------------------------------------------------------------------------------------------------------------------------------------------------
type PhP = { ph?: number; h_conc?: number; indicator?: string };
const phValue = (p: PhP): number => (p.ph !== undefined ? p.ph : pHOf(p.h_conc!));
const typeWord = (ph: number): string => (Math.abs(ph - 7) < 1e-9 ? "neutral" : ph < 7 ? "acidic" : "alkaline");
export const phScale = chemDrawer("c_ph", "ph_scale", {
  covers: ["pH scale with indicator colours"],
  readouts(p) {
    const ph = phValue(p as PhP);
    const ind = (p as PhP).indicator !== undefined ? INDICATORS[(p as PhP).indicator!]! : undefined;
    return [{ key: "pH", value: ph, unit: "" }, { key: "pOH", value: 14 - ph, unit: "" }, { key: "H+ conc", value: 10 ** -ph, unit: "mol/L" }, { key: "Type", word: typeWord(ph) }, ...(ind ? [{ key: "Colour", word: indicatorColour(ind, ph) } as Readout] : [])];
  },
  draw(sk, p) {
    const ph = phValue(p as PhP);
    const { pic } = sk.L;
    const [x0, x1] = [r1(pic.x + 2.5), r1(pic.x + pic.w - 2.5)];
    const X = (v: number): number => x0 + (v / 14) * (x1 - x0);
    const y = pic.y + pic.h * 0.58;
    sk.rect("ac", x0, y - 2, X(7) - x0, 4, { fill: "red", fillOpacity: 0.3, width: 0.3 });
    sk.rect("al", X(7), y - 2, x1 - X(7), 4, { fill: "purple", fillOpacity: 0.3, width: 0.3 });
    sk.path("sc", `M${x0} ${r1(y + 2)}L${x1} ${r1(y + 2)}`, { width: 0.3, how: "fade" });
    for (const [v, id] of [[0, "t0"], [7, "t7"], [14, "t14"]] as const) sk.text(id, X(v), y + 4.6, String(v), { anchor: "middle" });
    sk.arrow("mk", X(ph), y - 9, X(ph), y - 2.4, { color: "red", width: 0.5 });
    const ind = (p as PhP).indicator;
    if (ind) {
      const i = INDICATORS[ind]!;
      sk.rect("in", X(i.lo), y + 7, X(i.hi) - X(i.lo), 1.6, { fill: "yellow", fillOpacity: 0.4, width: 0.3 });
      sk.text("il", X(i.lo), y + 11, i.name);
    }
  },
  check(result, p) {
    const out: string[] = [];
    const ph = phValue(p as PhP);
    const sc = pointsOf(shapeBy(result, "sc")?.d);
    const ac = result.shapes.find((s) => String(s.id).endsWith("_ac"));
    const al = result.shapes.find((s) => String(s.id).endsWith("_al"));
    const mk = result.shapes.find((s) => String(s.id).endsWith("_mk"));
    if (sc.length !== 2 || !ac || !al || !mk) return ["the scale or its marker is missing"];
    const [x0, x1] = [sc[0]![0], sc[1]![0]];
    const toPh = (x: number): number => ((x - x0) / (x1 - x0)) * 14;
    const tol = (14 / (x1 - x0)) * 0.1 + 1e-9;
    if (!near(toPh(Number(ac.x) + Number(ac.w)), 7, tol) || !near(toPh(Number(al.x)), 7, tol)) out.push("the acid and alkaline halves do not meet at pH 7");
    if (!near(toPh(Number(mk.x2)), ph, tol)) out.push(`the marker is at pH ${sig(toPh(Number(mk.x2)))} and the value is ${sig(ph)}`);
    if (!(Number(mk.y2) > Number(mk.y1))) out.push("the marker must point down at the scale");
    for (const v of [0, 7, 14]) if (textBy(result, `t${v}`) !== String(v)) out.push(`the scale does not carry the number ${v}`);
    const ind = (p as PhP).indicator;
    if (ind) {
      const i = INDICATORS[ind]!;
      const b = result.shapes.find((s) => String(s.id).endsWith("_in"));
      if (!b || !near(toPh(Number(b.x)), i.lo, tol) || !near(toPh(Number(b.x) + Number(b.w)), i.hi, tol * 1.5)) out.push("the indicator bar is not its colour-change range");
    }
    return out.slice(0, 3);
  },
});

// ---- solubility and the vapour pressure of water --------------------------------------------------------------------------------------------------------------------------
type SolP = { mode: "curve"; salt: string; temp_c: number; mass_g?: number; cool_to_c?: number } | { mode: "vapour"; pressure_kpa: number };
const dot = (sk: Parameters<typeof drawGraph>[0], id: string, x: number, y: number, colour: "red" | "purple" | "ink"): void => sk.circle(id, x, y, 0.8, colour === "ink" ? { color: "ink" } : { color: colour, fill: colour });
export const solubilityGraph = chemDrawer("c_solubility", "solubility_vapour", {
  covers: ["Phase diagram, solubility curve, vapour-pressure plots"],
  readouts(p) {
    const q = p as SolP;
    if (q.mode === "vapour") return [{ key: "Pressure", value: q.pressure_kpa, unit: "kPa" }, { key: "Boiling point", value: boilingPointC(q.pressure_kpa), unit: "degC" }, { key: "At 100 degC", value: vapourPressureKpa(100), unit: "kPa" }];
    const s = solubilityAt(q.salt, q.temp_c);
    const out: Readout[] = [{ key: "Salt", word: SOLUBILITY[q.salt]!.name }, { key: "Temperature", value: q.temp_c, unit: "degC" }, { key: "Solubility", value: s, unit: "g/100g" }];
    if (q.mass_g !== undefined) {
      out.push({ key: "Status", word: q.mass_g < s - 1e-9 ? "unsaturated" : q.mass_g > s + 1e-9 ? "saturated with excess" : "saturated" });
      if (q.mass_g > s + 1e-9) out.push({ key: "Undissolved", value: q.mass_g - s, unit: "g" });
    }
    if (q.cool_to_c !== undefined) {
      const s2 = solubilityAt(q.salt, q.cool_to_c);
      out.push({ key: "Solubility cool", value: s2, unit: "g/100g" }, { key: "Crystals", value: Math.max(0, Math.min(q.mass_g ?? s, s) - s2), unit: "g" });
    }
    return out;
  },
  draw(sk, p) {
    const q = p as SolP;
    if (q.mode === "vapour") {
      const pts = evenly(N_GAS, 1, 100, vapourPressureKpa);
      const f = drawGraph(sk, { xName: "T", xUnit: "degC", yName: "Vapour pressure", yUnit: "kPa", xwin: [0, 100], ywin: niceWindow(0, pts.at(-1)![1]), series: [{ id: "c0", pts }] });
      const tb = boilingPointC(q.pressure_kpa);
      sk.path("hp", `M${r1(f.X(0))} ${r1(f.Y(q.pressure_kpa))}L${r1(f.X(tb))} ${r1(f.Y(q.pressure_kpa))}`, { color: "soft", dash: true, width: 0.25, how: "fade" });
      dot(sk, "p0", f.X(tb), f.Y(q.pressure_kpa), "red");
      return;
    }
    const g = SOLUBILITY[q.salt]!.g;
    const pts = SOLUBILITY_T.map((t, i) => [t, g[i]!] as [number, number]);
    const ywin = niceWindow(0, Math.max(...g, q.mass_g ?? 0));
    const f = drawGraph(sk, { xName: "T", xUnit: "degC", yName: "Solubility", yUnit: "g/100g", xwin: [0, 100], ywin, series: [{ id: "c0", pts }] });
    dot(sk, "p0", f.X(q.temp_c), f.Y(solubilityAt(q.salt, q.temp_c)), "red");
    if (q.cool_to_c !== undefined) dot(sk, "p1", f.X(q.cool_to_c), f.Y(solubilityAt(q.salt, q.cool_to_c)), "purple");
    if (q.mass_g !== undefined) dot(sk, "pm", f.X(q.temp_c), f.Y(q.mass_g), "ink");
  },
  check(result, p) {
    const q = p as SolP;
    const g = readGraph(result);
    if (!g.ok) return [g.why];
    const tx = ((g.xwin[1] - g.xwin[0]) / (g.frame.r - g.frame.l)) * 0.2 + 1e-9;
    const ty = ((g.ywin[1] - g.ywin[0]) / (g.frame.b - g.frame.t)) * 0.2 + 1e-9;
    const mark = (id: string): { x: number; y: number } | undefined => {
      const s = result.shapes.find((x) => String(x.id).endsWith(`_${id}`));
      return s ? { x: g.toX(Number(s.cx)), y: g.toY(Number(s.cy)) } : undefined;
    };
    if (q.mode === "vapour") {
      const out = checkCurve(g, "c0", vapourPressureKpa, "P", N_GAS + 1, (i) => 1 + (99 * i) / N_GAS);
      const m = mark("p0");
      if (!m) return [...out, "the boiling-point marker is missing"];
      if (!near(m.y, vapourPressureKpa(m.x), ty + 0.02 * m.y) || !near(m.y, q.pressure_kpa, ty)) out.push("the marker is not on the curve at the pressure asked for");
      return out;
    }
    const tab = SOLUBILITY[q.salt]!.g;
    const out = checkCurve(g, "c0", (t) => solubilityAt(q.salt, t), "S", SOLUBILITY_T.length, (i) => SOLUBILITY_T[i]!);
    const m = mark("p0");
    if (!m || !near(m.x, q.temp_c, tx) || !near(m.y, solubilityAt(q.salt, q.temp_c), ty)) out.push("the marker is not on the curve at the temperature asked for");
    if (q.cool_to_c !== undefined) {
      const c = mark("p1");
      if (!c || !near(c.x, q.cool_to_c, tx) || !near(c.y, solubilityAt(q.salt, q.cool_to_c), ty)) out.push("the cooled marker is not on the curve at the lower temperature");
    }
    if (q.mass_g !== undefined) {
      const a = mark("pm");
      if (!a || !near(a.x, q.temp_c, tx) || !near(a.y, q.mass_g, ty)) out.push("the marker for the mass of salt is not at the mass asked for");
    }
    void tab;
    return out.slice(0, 3);
  },
});
