import type { DrawResult } from "../registry";
import { at, bioDrawer, byId, near, readRects, rectsD, readSegs, segsD, textOf, type Pt } from "./bkit";
import { checkFlow, drawFlow, type FlowDef } from "./flow";
import {
  GEL, LADDER_BP, exponential, gelDistance, integrate, logistic, lvEquilibrium, lvField, lvPeriod, michaelis, pcrCopies, phOptimum, phRate, pyramidFromEfficiency, selectionP, speciesArea, tempOptimum, tempRate,
} from "./compute";
import type { Readout, Series } from "../physics/kit";
import { checkCurve, drawGraph, niceCeil, niceWindow, pointsOf, r1, readGraph, shapeBy, sig } from "../physics/kit";

/**
 * Wave 4, numbers of living things (ADR 0111): energy pyramids, population and selection curves, enzyme graphs, and the two figures of biotechnology that are arithmetic (the copies a PCR makes,
 * how far DNA fragments run on a gel). Every curve is a closed form or a Runge-Kutta integration of a stated model and is read back point by point against the same function; every number
 * is printed once and read back. The models are the textbook ones and are stated in ADR 0111, with what each leaves out.
 */
const N = 40;
const evenly = (n: number, a: number, b: number, f: (x: number) => number): Array<[number, number]> => Array.from({ length: n + 1 }, (_, i) => {
  const x = a + ((b - a) * i) / n;
  return [x, f(x)] as [number, number];
});

// ---- energy pyramid ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
const LEVEL_NAMES = ["Producers", "Primary consumers", "Secondary consumers", "Tertiary consumers"];
const BAR = { cx: 43.5, min: 8, max: 32, h: 6, gap: 2, top: 3 } as const;
type PyrP = { mode: "efficiency"; e1: number; eff: number; levels: number } | { mode: "given"; e1: number; e2: number; e3: number; e4?: number };
export const energiesOf = (p: PyrP): number[] => (p.mode === "efficiency" ? pyramidFromEfficiency(p.e1, p.eff, p.levels) : [p.e1, p.e2, p.e3, ...(p.e4 !== undefined ? [p.e4] : [])]);
/** Bar widths on a log scale: energies fall by powers of ten, so a linear bar for the top level would be too thin to see. Widest for the most energy, the narrowest 8 units. */
export function barWidths(e: number[]): number[] {
  const lo = Math.log10(Math.min(...e));
  const hi = Math.log10(Math.max(...e));
  return e.map((x) => (hi === lo ? BAR.max : BAR.min + ((BAR.max - BAR.min) * (Math.log10(x) - lo)) / (hi - lo)));
}
export const pyramidFigure = bioDrawer("b_pyramid", "energy_pyramid", {
  covers: ["Food chain, food web, energy pyramid"],
  readouts(pp) {
    const p = pp as PyrP;
    const e = energiesOf(p);
    const out: Readout[] = e.map((x, i) => ({ key: `Level ${i + 1}`, value: x, unit: "kJ" }) as Readout);
    if (p.mode === "efficiency") out.push({ key: "Passed on", value: p.eff, unit: "%" });
    else e.slice(1).forEach((x, i) => out.push({ key: `Passed ${i + 1} to ${i + 2}`, value: (100 * x) / e[i]!, unit: "%" }));
    return out;
  },
  draw(sk, pp) {
    const e = energiesOf(pp as PyrP);
    const w = barWidths(e);
    const n = e.length;
    const rects = e.map((_, k) => {
      const row = n - 1 - k; // the top level is the first row
      return [...at(sk.L, BAR.cx - w[k]! / 2, BAR.top + row * (BAR.h + BAR.gap)), w[k]!, BAR.h] as [number, number, number, number];
    });
    // bars are listed top row first
    sk.path("bars", rectsD([...rects].reverse()), { fill: "orange", fillOpacity: 0.3, width: 0.4, how: "fade" });
    e.forEach((_, k) => sk.text(`n${k}`, ...at(sk.L, 0.5, BAR.top + (n - 1 - k) * (BAR.h + BAR.gap) + BAR.h / 2), LEVEL_NAMES[k]!, { anchor: "start" }));
    sk.text("lg", ...at(sk.L, 30, 35.4), "Bar width: log scale", { anchor: "middle" });
  },
  check(result, pp, L) {
    const e = energiesOf(pp as PyrP);
    const n = e.length;
    const out: string[] = [];
    const bars = readRects(byId(result, "bars")?.d).reverse(); // level 1 first
    if (bars.length !== n) return [`${bars.length} bars were drawn and ${n} levels were asked for`];
    const want = barWidths(e);
    bars.forEach((b, k) => {
      const row = n - 1 - k;
      const [ex, ey] = at(L, BAR.cx - want[k]! / 2, BAR.top + row * (BAR.h + BAR.gap));
      if (!near(b[1], ey, 0.1) || !near(b[3], BAR.h, 0.1) || !near(b[0], ex, 0.1)) out.push(`the bar of level ${k + 1} is not where the stack puts it`);
      if (!near(b[2], want[k]!, 0.1)) out.push(`the bar of level ${k + 1} is ${r1(b[2])} wide and its energy gives ${r1(want[k]!)}`);
      if (Math.abs(b[0] + b[2] / 2 - (bars[0]![0] + bars[0]![2] / 2)) > 0.1) out.push("the bars are not centred on one line");
    });
    for (let k = 1; k < n; k++) if (!(bars[k]![2] < bars[k - 1]![2])) out.push(`level ${k + 1} is drawn as wide as or wider than level ${k}: no level can hold more energy than the one below`);
    for (let k = 1; k < n; k++) if (!(bars[k]![1] < bars[k - 1]![1])) out.push("the levels are not stacked with the producers at the bottom");
    for (let k = 0; k < n; k++) if (textOf(byId(result, `n${k}`)) !== LEVEL_NAMES[k]) out.push(`the name of level ${k + 1} is not "${LEVEL_NAMES[k]}"`);
    return [...new Set(out)].slice(0, 4);
  },
});

// ---- populations -----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
type PopP =
  | { mode: "exponential"; n0: number; r: number; t_max: number }
  | { mode: "logistic"; n0: number; r: number; k: number; t_max: number }
  | { mode: "predator_prey"; a: number; b: number; c: number; d: number; x0: number; y0: number }
  | { mode: "species_area"; c: number; z: number; a_max: number }
  | { mode: "selection"; p0: number; s: number; t_max: number };
const lvEnd = (p: { a: number; b: number; c: number; d: number }): number => 2 * lvPeriod(p);
const lvPoints = (p: PopP & { mode: "predator_prey" }): number[][] => integrate(lvField(p), [p.x0, p.y0], lvEnd(p), N);
export const inflectionTime = (n0: number, r: number, k: number): number => Math.max(0, Math.log((k - n0) / n0) / r);
export const generationsToHalf = (p0: number, s: number): number => (p0 >= 0.5 ? 0 : Math.log((1 - p0) / p0) / Math.log(1 + s));

function popFns(p: PopP): { series: Array<{ id: string; f: (x: number) => number; label?: string; dash?: boolean }>; xmax: number; ymax: number; x: [string, string]; y: [string, string]; ywin?: [number, number] } {
  switch (p.mode) {
    case "exponential": { const f = (t: number): number => exponential(p.n0, p.r, t); return { series: [{ id: "c0", f }], xmax: p.t_max, ymax: f(p.t_max), x: ["t", "time"], y: ["N", "individuals"] }; }
    case "logistic": { const f = (t: number): number => logistic(p.n0, p.r, p.k, t); return { series: [{ id: "c0", f }], xmax: p.t_max, ymax: p.k, x: ["t", "time"], y: ["N", "individuals"] }; }
    case "species_area": { const f = (a: number): number => speciesArea(p.c, p.z, a); return { series: [{ id: "c0", f }], xmax: p.a_max, ymax: f(p.a_max), x: ["A", "area"], y: ["S", "species"] }; }
    case "selection": { const f = (t: number): number => selectionP(p.p0, p.s, t); return { series: [{ id: "c0", f }], xmax: p.t_max, ymax: 1, x: ["t", "generations"], y: ["p", "frequency"], ywin: [0, 1] }; }
    default: return { series: [], xmax: lvEnd(p), ymax: 0, x: ["t", "time"], y: ["N", "individuals"] };
  }
}
export const populationFigure = bioDrawer("b_population", "population_curve", {
  covers: ["Population growth, logistic curve, species-area", "Phylogenetic tree, homology, natural selection graphs"],
  readouts(pp) {
    const p = pp as PopP;
    if (p.mode === "exponential") return [{ key: "r", value: p.r, unit: "" }, { key: "Doubling", value: Math.LN2 / p.r, unit: "time" }, { key: "N at the end", value: exponential(p.n0, p.r, p.t_max), unit: "" }];
    if (p.mode === "logistic") return [{ key: "K", value: p.k, unit: "" }, { key: "Fastest at N", value: p.k / 2, unit: "" }, { key: "Fastest at t", value: inflectionTime(p.n0, p.r, p.k), unit: "" }, { key: "N at the end", value: logistic(p.n0, p.r, p.k, p.t_max), unit: "" }];
    if (p.mode === "predator_prey") { const [xe, ye] = lvEquilibrium(p); return [{ key: "Prey balance", value: xe, unit: "" }, { key: "Predator balance", value: ye, unit: "" }, { key: "Cycle", value: lvPeriod(p), unit: "time" }]; }
    if (p.mode === "species_area") return [{ key: "z", value: p.z, unit: "" }, { key: "S at max area", value: speciesArea(p.c, p.z, p.a_max), unit: "" }, { key: "x10 area", value: 10 ** p.z, unit: "x" }];
    return [{ key: "p at the end", value: selectionP(p.p0, p.s, p.t_max), unit: "" }, { key: "Gens to 0.5", value: generationsToHalf(p.p0, p.s), unit: "" }, { key: "s", value: p.s, unit: "" }];
  },
  draw(sk, pp) {
    const p = pp as PopP;
    if (p.mode === "predator_prey") {
      const pts = lvPoints(p);
      const T = lvEnd(p);
      const series: Series[] = [{ id: "c0", pts: pts.map((s, i) => [(T * i) / N, s[0]!] as [number, number]), label: "Prey", labelAt: 0.1 }, { id: "c1", pts: pts.map((s, i) => [(T * i) / N, s[1]!] as [number, number]), dash: true, width: 0.3, label: "Predator", labelAt: 0.45 }];
      const peak = Math.max(...pts.flat());
      drawGraph(sk, { xName: "t", xUnit: "time", yName: "N", yUnit: "individuals", xwin: [0, niceCeil(T)], ywin: niceWindow(0, peak), series });
      return;
    }
    const m = popFns(p);
    const pts = evenly(N, 0, m.xmax, m.series[0]!.f);
    const ywin = m.ywin ?? niceWindow(0, m.ymax);
    const fr = drawGraph(sk, { xName: m.x[0], xUnit: m.x[1], yName: m.y[0], yUnit: m.y[1], xwin: [0, niceCeil(m.xmax)], ywin, series: [{ id: "c0", pts }] });
    if (p.mode === "logistic") sk.path("kl", `M${r1(fr.l)} ${r1(fr.Y(p.k))}L${r1(fr.r)} ${r1(fr.Y(p.k))}`, { color: "soft", dash: true, width: 0.25, how: "fade" });
  },
  check(result, pp) {
    const p = pp as PopP;
    const g = readGraph(result);
    if (!g.ok) return [g.why];
    if (p.mode === "predator_prey") {
      const pts = lvPoints(p);
      const T = lvEnd(p);
      return [...checkCurve(g, "c0", () => 0, "prey", N + 1, (i) => (T * i) / N).filter((x) => /sample|missing|points/.test(x)), ...rk4Match(g.curve("c0"), pts.map((s) => s[0]!), g, "prey"), ...rk4Match(g.curve("c1"), pts.map((s) => s[1]!), g, "predator")].slice(0, 3);
    }
    const m = popFns(p);
    const out = checkCurve(g, "c0", m.series[0]!.f, m.y[0], N + 1, (i) => (m.xmax * i) / N);
    if (p.mode === "logistic") {
      const kl = pointsOf(shapeBy(result, "kl")?.d);
      if (kl.length !== 2 || !near(g.toY(kl[0]![1]), p.k, ((g.ywin[1] - g.ywin[0]) / (g.frame.b - g.frame.t)) * 0.12)) out.push("the dashed line is not at the carrying capacity K");
      const c = g.curve("c0");
      if (c.some(([, y]) => y > p.k * 1.002)) out.push("a logistic curve never rises above K");
    }
    if (p.mode === "selection" && g.curve("c0").some(([, y]) => y < -0.01 || y > 1.01)) out.push("a frequency is between 0 and 1");
    return out.slice(0, 3);
  },
});
/** A drawn curve compared point by point with the integrated values. */
function rk4Match(drawn: Array<[number, number]>, want: number[], g: ReturnType<typeof readGraph>, name: string): string[] {
  const ty = ((g.ywin[1] - g.ywin[0]) / (g.frame.b - g.frame.t)) * 0.13 + 1e-9;
  if (drawn.length !== want.length) return [`${name}: ${drawn.length} points were drawn and ${want.length} were expected`];
  const worst = drawn.reduce((m, [, y], i) => Math.max(m, Math.abs(y - want[i]!)), 0);
  return worst > ty ? [`${name}: a point is off the integrated curve by more than a pixel`] : [];
}

// ---- enzymes -----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
type EnzP = { mode: "michaelis"; vmax: number; km: number } | { mode: "temperature"; ea_kj: number; t_denature: number } | { mode: "ph"; pka1: number; pka2: number } | { mode: "inhibition"; vmax: number; km: number; i: number; ki: number };
const kmApp = (p: { km: number; i: number; ki: number }): number => p.km * (1 + p.i / p.ki);
const tempRel = (p: { ea_kj: number; t_denature: number }) => (t: number): number => (100 * tempRate(p.ea_kj, p.t_denature, t)) / tempRate(p.ea_kj, p.t_denature, tempOptimum(p.ea_kj, p.t_denature));
const phRel = (p: { pka1: number; pka2: number }) => (h: number): number => (100 * phRate(1, p.pka1, p.pka2, h)) / phRate(1, p.pka1, p.pka2, phOptimum(p.pka1, p.pka2));
const enzXmax = (p: EnzP): number => (p.mode === "michaelis" ? niceCeil(8 * p.km) : p.mode === "inhibition" ? niceCeil(6 * kmApp(p)) : p.mode === "temperature" ? 80 : 14);
export const enzymeFigure = bioDrawer("b_enzyme", "enzyme_graph", {
  covers: ["Enzyme action, rate against temperature, pH and substrate"],
  readouts(pp) {
    const p = pp as EnzP;
    if (p.mode === "michaelis") return [{ key: "Vmax", value: p.vmax, unit: "" }, { key: "Km", value: p.km, unit: "" }, { key: "v at S = Km", value: p.vmax / 2, unit: "" }];
    if (p.mode === "inhibition") return [{ key: "Vmax", value: p.vmax, unit: "" }, { key: "Km", value: p.km, unit: "" }, { key: "Km with inhibitor", value: kmApp(p), unit: "" }];
    if (p.mode === "temperature") return [{ key: "Optimum", value: tempOptimum(p.ea_kj, p.t_denature), unit: "degC" }, { key: "Denatures", value: p.t_denature, unit: "degC" }, { key: "Ea", value: p.ea_kj, unit: "kJ/mol" }];
    return [{ key: "Optimum pH", value: phOptimum(p.pka1, p.pka2), unit: "" }, { key: "pKa 1", value: p.pka1, unit: "" }, { key: "pKa 2", value: p.pka2, unit: "" }];
  },
  draw(sk, pp) {
    const p = pp as EnzP;
    const xm = enzXmax(p);
    if (p.mode === "michaelis") {
      const fr = drawGraph(sk, { xName: "S", xUnit: "substrate", yName: "v", yUnit: "rate", xwin: [0, xm], ywin: niceWindow(0, p.vmax), series: [{ id: "c0", pts: evenly(N, 0, xm, (s) => michaelis(p.vmax, p.km, s)) }] });
      sk.path("vl", `M${r1(fr.l)} ${r1(fr.Y(p.vmax))}L${r1(fr.r)} ${r1(fr.Y(p.vmax))}`, { color: "soft", dash: true, width: 0.25, how: "fade" });
    } else if (p.mode === "inhibition") {
      const fr = drawGraph(sk, { xName: "S", xUnit: "substrate", yName: "v", yUnit: "rate", xwin: [0, xm], ywin: niceWindow(0, p.vmax), series: [{ id: "c0", pts: evenly(N, 0, xm, (s) => michaelis(p.vmax, p.km, s)), label: "Free", labelAt: 0.8 }, { id: "c1", pts: evenly(N, 0, xm, (s) => michaelis(p.vmax, p.km, s, p.i, p.ki)), dash: true, width: 0.3, label: "Inhibited", labelAt: 0.55 }] });
      sk.path("vl", `M${r1(fr.l)} ${r1(fr.Y(p.vmax))}L${r1(fr.r)} ${r1(fr.Y(p.vmax))}`, { color: "soft", dash: true, width: 0.25, how: "fade" });
    } else if (p.mode === "temperature") drawGraph(sk, { xName: "T", xUnit: "degC", yName: "Rate", yUnit: "% of best", xwin: [0, 80], ywin: [0, 100], series: [{ id: "c0", pts: evenly(N, 0, 80, tempRel(p)) }] });
    else drawGraph(sk, { xName: "pH", xUnit: "", yName: "Activity", yUnit: "% of best", xwin: [0, 14], ywin: [0, 100], series: [{ id: "c0", pts: evenly(N, 0, 14, phRel(p)) }] });
  },
  check(result, pp) {
    const p = pp as EnzP;
    const g = readGraph(result);
    if (!g.ok) return [g.why];
    const xm = enzXmax(p);
    const xs = (i: number): number => (xm * i) / N;
    let out: string[];
    if (p.mode === "michaelis") out = checkCurve(g, "c0", (s) => michaelis(p.vmax, p.km, s), "v", N + 1, xs);
    else if (p.mode === "inhibition") out = [...checkCurve(g, "c0", (s) => michaelis(p.vmax, p.km, s), "free", N + 1, xs), ...checkCurve(g, "c1", (s) => michaelis(p.vmax, p.km, s, p.i, p.ki), "inhibited", N + 1, xs)];
    else if (p.mode === "temperature") out = checkCurve(g, "c0", tempRel(p), "rate", N + 1, xs);
    else out = checkCurve(g, "c0", phRel(p), "activity", N + 1, xs);
    if (p.mode === "michaelis" || p.mode === "inhibition") {
      const vl = pointsOf(shapeBy(result, "vl")?.d);
      if (vl.length !== 2 || !near(g.toY(vl[0]![1]), p.vmax, ((g.ywin[1] - g.ywin[0]) / (g.frame.b - g.frame.t)) * 0.12)) out.push("the dashed line is not at Vmax");
    } else {
      const c = g.curve("c0");
      const top = c.reduce((b, q) => (q[1] > b[1] ? q : b), c[0]!);
      const opt = p.mode === "temperature" ? tempOptimum(p.ea_kj, p.t_denature) : phOptimum(p.pka1, p.pka2);
      if (c.length > 2 && !near(top[0], opt, xm / N + 0.3)) out.push("the highest point of the curve is not at the optimum");
    }
    return out.slice(0, 3);
  },
});

// ---- biotechnology ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------
export const PCR_FLOW: FlowDef = {
  nodes: [{ id: "den", label: "Denature 95 C", x: 15, y: 8 }, { id: "ann", label: "Anneal 55 C", x: 45, y: 8 }, { id: "ext", label: "Extend 72 C", x: 30, y: 26 }],
  edges: [{ from: "den", to: "ann" }, { from: "ann", to: "ext" }, { from: "ext", to: "den" }],
};
const GEL_TOP = 6;
const GEL_SCALE = 2.1;
const gelY = (bp: number): number => GEL_TOP + GEL_SCALE * gelDistance(bp);
type GelP = { mode: "gel"; f1: number; f2?: number; f3?: number; f4?: number };
const fragments = (p: GelP): number[] => [p.f1, p.f2, p.f3, p.f4].filter((x): x is number => x !== undefined).sort((a, b) => b - a);
type BiotechP = { mode: "pcr"; cycles: number; efficiency: number } | GelP;
export const biotechFigure = bioDrawer("b_biotech", "pcr_and_gel", {
  covers: ["Recombinant DNA, PCR cycle, gel electrophoresis, fermentor"],
  readouts(pp) {
    const p = pp as BiotechP;
    if (p.mode === "pcr") return [{ key: "Cycles", value: p.cycles, unit: "" }, { key: "Efficiency", value: p.efficiency, unit: "" }, { key: "Copies", value: pcrCopies(p.cycles, p.efficiency), unit: "" }];
    const f = fragments(p);
    return [{ key: "Fragments", value: f.length, unit: "" }, { key: "Largest", value: f[0]!, unit: "bp" }, { key: "Smallest", value: f.at(-1)!, unit: "bp" }, { key: "Farthest", word: "smallest" }];
  },
  draw(sk, pp) {
    const p = pp as BiotechP;
    if (p.mode === "pcr") return drawFlow(sk, PCR_FLOW);
    const A = (u: number, v: number): Pt => at(sk.L, u, v);
    sk.rect("gl", ...A(4, 3), 46, 32, { color: "soft", fill: "blue", fillOpacity: 0.1, width: 0.3 });
    sk.path("wl", `M${r1(A(16, 3.5)[0])} ${r1(A(16, 3.5)[1])}h8v1.6h-8zM${r1(A(36, 3.5)[0])} ${r1(A(36, 3.5)[1])}h8v1.6h-8z`, { fill: "ink", fillOpacity: 0.4, width: 0.2, how: "fade" });
    sk.path("lb", segsD(LADDER_BP.map((bp) => [...A(16, gelY(bp)), ...A(24, gelY(bp))] as [number, number, number, number])), { width: 0.5, how: "draw" });
    sk.path("sb", segsD(fragments(p).map((bp) => [...A(36, gelY(bp)), ...A(44, gelY(bp))] as [number, number, number, number])), { width: 0.5, color: "red", how: "draw" });
    LADDER_BP.forEach((bp, k) => sk.text(`ls${k}`, ...A(14.5, gelY(bp)), String(bp), { anchor: "end" }));
    sk.text("t1", ...A(20, 1.5), "Ladder", { anchor: "middle" });
    sk.text("t2", ...A(40, 1.5), "Sample", { anchor: "middle" });
  },
  check(result, pp, L) {
    const p = pp as BiotechP;
    if (p.mode === "pcr") return checkFlow(result, PCR_FLOW);
    const out: string[] = [];
    // the ladder tells what a distance means: its printed sizes and drawn bands give a straight line of distance against log size, and the sample bands are read off it
    const lad = readSegs(byId(result, "lb")?.d).map((s) => s[1]);
    const sizes = LADDER_BP.map((_, k) => Number(textOf(byId(result, `ls${k}`))));
    if (lad.length !== sizes.length || sizes.some((s) => !(s > 0))) return ["the ladder bands or their sizes are missing"];
    const xs = sizes.map(Math.log10);
    const mx = xs.reduce((a, b) => a + b, 0) / xs.length;
    const my = lad.reduce((a, b) => a + b, 0) / lad.length;
    const slope = xs.reduce((s, x, i) => s + (x - mx) * (lad[i]! - my), 0) / xs.reduce((s, x) => s + (x - mx) ** 2, 0);
    const icpt = my - slope * mx;
    if (!(slope < 0)) out.push("smaller fragments must run farther down the gel: the ladder runs the wrong way");
    const resid = lad.reduce((m, y, i) => Math.max(m, Math.abs(y - (icpt + slope * xs[i]!))), 0);
    if (resid > 0.15) out.push("the ladder bands are not on a straight line against the logarithm of their sizes");
    const bands = readSegs(byId(result, "sb")?.d).map((s) => s[1]).sort((a, b) => a - b);
    const want = fragments(p);
    if (bands.length !== want.length) out.push(`${bands.length} sample bands were drawn and there are ${want.length} fragments`);
    else bands.forEach((y, k) => {
      const size = 10 ** ((y - icpt) / slope);
      if (Math.abs(size - want[k]!) / want[k]! > 0.03) out.push(`a band is at ${sig(size)} bp by the ladder and the fragment is ${want[k]} bp`);
    });
    if (!byId(result, "gl")) out.push("the gel is missing");
    if (textOf(byId(result, "t1")) !== "Ladder" || textOf(byId(result, "t2")) !== "Sample") out.push("the lanes are not named Ladder and Sample");
    void L;
    void GEL;
    return [...new Set(out)].slice(0, 4);
  },
});
export type { DrawResult };
export { lvPoints };
