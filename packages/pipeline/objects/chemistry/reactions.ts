import { chemDrawer, near } from "./ckit";
import {
  arrheniusLnK, concentration, conservationProblems, elementBySym, energyProfile, equilibriumApproach, halfLife, isSpecies, molarMass, parseSpecies, profileFigures, R_GAS, sideTotals, stoichiometry,
  type Species,
} from "./compute";
import { reactionElements, reactionIonic, resolveReaction, type Resolved } from "./params";
import {
  axisLabel, checkCurve, drawGraph, exact, MIN_TEXT, niceCeil, niceWindow, parseReadouts, pointsOf, r1, readGraph, sig, shapeBy, textBy, textWidth, type GraphModel, type Readout, type Series,
} from "../physics/kit";

/**
 * Wave 3, reactions: a balanced equation with its atom and charge count, mole and mass figures for a reaction, the energy profile of a reaction, and the concentration-time curves of rates,
 * equilibrium and the Arrhenius line (ADR 0110). The equation is typed as formulas, parsed into atoms by code, balanced by an exact integer null-space or checked when the coefficients are
 * given; an equation that does not conserve atoms and charge is refused with the element that breaks it. What is read back is the equation as drawn (its LaTeX is parsed again into species
 * and coefficients and its atoms are recounted), the heights of the bars against the mole ratios of the coefficients, and every curve against its closed form.
 */
// ---- equation ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
export const latexOf = (text: string): string => {
  const [body, charge] = text.split("^") as [string, string | undefined];
  return `${body.replace(/(?<=[A-Za-z)])(\d+)/g, "_{$1}")}${charge !== undefined ? `^{${charge}}` : ""}`;
};
const unlatex = (t: string): string => t.replace(/_\{(\d+)\}/g, "$1").replace(/\^\{([^}]*)\}/g, "^$1");
/** One side of the equation in upright type (a chemical formula is not italic): `\mathrm{2H_{2} + O_{2}}`. */
const sideLatex = (items: Array<{ s: Species; c: number }>): string => `\\mathrm{${items.map((x) => `${x.c > 1 ? x.c : ""}${latexOf(x.s.text)}`).join(" + ")}}`;
const parseSide = (latex: string): Array<{ s: Species; c: number }> | string => {
  const out: Array<{ s: Species; c: number }> = [];
  const inner = /^\\mathrm\{(.*)\}$/.exec(latex)?.[1];
  if (inner === undefined) return "a side of the equation is not set in upright type";
  for (const part of inner.split(" + ")) {
    const m = /^(\d*)(.+)$/.exec(part);
    if (!m) return "a term of the equation is empty";
    const s = parseSpecies(unlatex(m[2]!));
    if (!isSpecies(s)) return s.error;
    out.push({ s, c: m[1] ? Number(m[1]) : 1 });
  }
  return out;
};
const LATEX_OK = /^\\mathrm\{[A-Za-z0-9_{}^()+\- ]*\}$/;
const MATH_W = 0.6; // average width of a KaTeX glyph as a fraction of the size, a little over what is needed
const sidesOf = (r: Resolved) => ({ left: r.species.filter((x) => x.side === "left"), right: r.species.filter((x) => x.side === "right") });
const countOf = (side: Array<{ s: Species; c: number }>, el: string): number => sideTotals(side).atoms[el] ?? 0;

export const reactionEquation = chemDrawer("c_reaction", "reaction_equation", {
  covers: ["Balanced reaction with atom and charge count"],
  readouts(p) {
    const r = resolveReaction(p as never) as Resolved;
    const { left, right } = sidesOf(r);
    const out: Readout[] = reactionElements(r).flatMap((e) => [{ key: `${e} left`, value: countOf(left, e), unit: "" }, { key: `${e} right`, value: countOf(right, e), unit: "" }] as Readout[]);
    if (reactionIonic(r)) out.push({ key: "Charge left", value: sideTotals(left).charge, unit: "" }, { key: "Charge right", value: sideTotals(right).charge, unit: "" });
    return out;
  },
  draw(sk, p) {
    const r = resolveReaction(p as never) as Resolved;
    const { left, right } = sidesOf(r);
    const [l, rt] = [sideLatex(left), sideLatex(right)];
    const { pic } = sk.L;
    const cx = pic.x + pic.w / 2;
    const size = Math.max(MIN_TEXT, Math.min(3.4, (pic.w - 1) / (Math.max(l.length, rt.length) * MATH_W)));
    const [y1, y2] = [pic.y + pic.h * 0.28, pic.y + pic.h * 0.78];
    sk.raw("el", { kind: "math", x: Math.round(cx * 100) / 100, y: Math.round(y1 * 100) / 100, latex: l, size, anchor: "middle", display: false, color: "ink", how: "fade" });
    sk.arrow("ar", cx, y1 + 3, cx, y2 - 3, { width: 0.5 });
    sk.raw("er", { kind: "math", x: Math.round(cx * 100) / 100, y: Math.round(y2 * 100) / 100, latex: rt, size, anchor: "middle", display: false, color: "ink", how: "fade" });
  },
  check(result, p) {
    const out: string[] = [];
    const r = resolveReaction(p as never) as Resolved;
    const get = (id: string): { latex: string; size: number } | undefined => {
      const s = result.shapes.find((x) => String(x.id).endsWith(`_${id}`));
      return s && typeof s.latex === "string" ? { latex: s.latex, size: Number(s.size) } : undefined;
    };
    const [l, rt] = [get("el"), get("er")];
    if (!l || !rt) return ["a side of the equation is missing"];
    for (const t of [l, rt]) {
      if (!LATEX_OK.test(t.latex)) out.push("the equation uses a character outside the safe set");
      if (t.latex.length * t.size * MATH_W > 100) out.push("a side of the equation is too wide");
    }
    const [a, b] = [parseSide(l.latex), parseSide(rt.latex)];
    if (typeof a === "string" || typeof b === "string") return [...out, `the drawn equation cannot be read: ${typeof a === "string" ? a : b}`];
    const bad = conservationProblems(a, b);
    if (bad.length > 0) out.push(`the drawn equation does not conserve what it must: ${bad.join("; ")}`);
    const { left, right } = sidesOf(r);
    if (a.map((x) => x.c).join() !== left.map((x) => x.c).join() || b.map((x) => x.c).join() !== right.map((x) => x.c).join()) out.push("the coefficients drawn are not the ones the request gives or the balance requires");
    // the counts the read-outs print are the counts of the drawn equation
    const got = parseReadouts(result);
    for (const e of reactionElements(r)) {
      if (got.get(`${e} left`)?.value !== countOf(a, e) || got.get(`${e} right`)?.value !== countOf(b, e)) out.push(`the printed count of ${elementBySym(e)!.name} is not the count in the drawn equation`);
    }
    const arrow = result.shapes.find((s) => s.kind === "arrow");
    if (!arrow || !(Number(arrow.y2) > Number(arrow.y1))) out.push("the arrow must point from the reactants to the products");
    return out.slice(0, 3);
  },
});

// ---- moles and masses --------------------------------------------------------------------------------------------------------------------------------------------------------------
type StoichP = { r1: string; r2?: string; p1: string; p2?: string; m_r1: number; m_r2?: number };
function stoichOf(p: StoichP) {
  const r = resolveReaction({ r1: p.r1, r2: p.r2, p1: p.p1, p2: p.p2 }) as Resolved;
  const masses = [p.m_r1, ...(p.r2 !== undefined ? [p.m_r2!] : [])];
  let k = 0;
  const items = r.species.map((x) => ({ ...x, mass: x.side === "left" ? masses[k++] : undefined }));
  return { r, items, st: stoichiometry(items) };
}
export const moleFigure = chemDrawer("c_stoich", "mole_stoichiometry", {
  covers: ["Balanced reaction with atom and charge count"],
  readouts(p) {
    const { items, st } = stoichOf(p as StoichP);
    const out: Readout[] = items.flatMap((x, i) => [{ key: `n ${x.s.text} ${x.side === "left" ? "used" : "made"}`, value: st.moles[i]!, unit: "mol" }, { key: `m ${x.s.text} ${x.side === "left" ? "used" : "made"}`, value: st.masses[i]!, unit: "g" }] as Readout[]);
    if ((p as StoichP).r2 !== undefined) out.push({ key: "Limiting", word: items[st.limiting]!.s.text });
    return out;
  },
  draw(sk, p) {
    const { items, st } = stoichOf(p as StoichP);
    const { pic } = sk.L;
    const base = pic.y + pic.h - 3.2;
    const H = pic.h - 7;
    const slot = (pic.w - 2) / items.length;
    const bw = Math.min(7, slot * 0.55);
    const top = Math.max(...st.moles);
    sk.line("bl", pic.x + 0.5, base, pic.x + pic.w - 0.5, base, { width: 0.35 });
    items.forEach((x, i) => {
      const h = Math.max(0.3, (st.moles[i]! / top) * H);
      const cx = pic.x + 1 + slot * (i + 0.5);
      sk.rect(`b${i}`, cx - bw / 2, base - h, bw, h, { fill: x.side === "left" ? "blue" : "green", fillOpacity: 0.35, width: 0.35 });
      sk.text(`lb${i}`, cx, base + 1.7, x.s.text, { anchor: "middle" });
    });
  },
  check(result, p) {
    const out: string[] = [];
    const { items, st } = stoichOf(p as StoichP);
    const bars = items.map((_, i) => result.shapes.find((s) => String(s.id).endsWith(`_b${i}`)));
    if (bars.some((b) => !b)) return ["a bar is missing"];
    const hs = bars.map((b) => Number(b!.h));
    const hMax = Math.max(...hs);
    const top = Math.max(...st.moles);
    hs.forEach((h, i) => {
      if (!near(h / hMax, st.moles[i]! / top, 0.12 / hMax + 1e-3)) out.push(`the bar of ${items[i]!.s.text} is not in proportion to its moles`);
      if (textBy(result, `lb${i}`) !== items[i]!.s.text) out.push(`the label under bar ${i + 1} is not ${items[i]!.s.text}`);
    });
    // the printed moles divided by the coefficient are all one number (the extent of the reaction), and the masses balance
    const got = parseReadouts(result);
    const ext = items.map((x) => (got.get(`n ${x.s.text} ${x.side === "left" ? "used" : "made"}`)?.value ?? NaN) / x.c);
    if (!ext.every((v) => near(v, ext[0]!, 0.01 * Math.abs(ext[0]!) + 1e-12))) out.push("the printed moles are not in the ratio of the coefficients");
    const mass = (side: "left" | "right"): number => items.reduce((s, x) => s + (x.side === side ? got.get(`m ${x.s.text} ${x.side === "left" ? "used" : "made"}`)?.value ?? NaN : 0), 0);
    if (!near(mass("left"), mass("right"), 0.012 * mass("left"))) out.push("the mass used up is not the mass made: mass is not conserved");
    return out.slice(0, 3);
  },
});

// ---- energy profile ----------------------------------------------------------------------------------------------------------------------------------------------------------------
const N_PROFILE = 40;
const profileWindow = (p: { delta_h: number; ea: number }): [number, number] => niceWindow(Math.min(0, p.delta_h), p.ea);
export const energyDiagram = chemDrawer("c_energy", "energy_profile", {
  covers: ["Reaction energy profile, activation energy, enthalpy diagram"],
  readouts(p) {
    const f = profileFigures(p);
    return [
      { key: "Ea", value: p.ea, unit: "kJ/mol" }, { key: "Delta H", value: p.delta_h, unit: "kJ/mol" }, { key: "Ea reverse", value: f.eaReverse, unit: "kJ/mol" }, { key: "Type", word: f.exo ? "exothermic" : "endothermic" },
      ...(p.ea_cat !== undefined ? [{ key: "Ea catalysed", value: p.ea_cat, unit: "kJ/mol" } as Readout, { key: "Lowered by", value: f.lowered!, unit: "kJ/mol" } as Readout] : []),
    ];
  },
  draw(sk, p) {
    const prof = energyProfile(p.delta_h, p.ea);
    const pts = (f: (x: number) => number): Array<[number, number]> => Array.from({ length: N_PROFILE + 1 }, (_, i) => [i / N_PROFILE, f(i / N_PROFILE)] as [number, number]);
    const series: Series[] = [{ id: "c0", pts: pts(prof.at) }];
    if (p.ea_cat !== undefined) series.push({ id: "c1", pts: pts(energyProfile(p.delta_h, p.ea_cat).at), dash: true, color: "purple", width: 0.3, label: "catalysed", labelAt: 0.72 });
    const f = drawGraph(sk, { xName: "Progress", xUnit: "", yName: "Energy", yUnit: "kJ/mol", xwin: [0, 1], ywin: profileWindow(p), series });
    sk.path("rf", `M${r1(f.X(0))} ${r1(f.Y(0))}L${r1(f.X(1))} ${r1(f.Y(0))}`, { color: "soft", dash: true, width: 0.2, how: "fade" });
    sk.arrow("ea", f.X(prof.peakX), f.Y(0), f.X(prof.peakX), f.Y(p.ea), { color: "red", width: 0.4 });
    sk.text("eal", f.X(prof.peakX), f.Y(p.ea) - 2, "Ea", { anchor: "middle" });
    sk.arrow("dh", f.X(0.9), f.Y(0), f.X(0.9), f.Y(p.delta_h), { color: "purple", width: 0.4 });
    sk.text("dhl", f.X(0.9) + 0.8, (f.Y(0) + f.Y(p.delta_h)) / 2, "dH");
  },
  check(result, p) {
    const g = readGraph(result);
    if (!g.ok) return [g.why];
    const prof = energyProfile(p.delta_h, p.ea);
    const out = checkCurve(g, "c0", prof.at, "profile", N_PROFILE + 1, (i) => i / N_PROFILE);
    const pts = g.curve("c0");
    const ty = ((g.ywin[1] - g.ywin[0]) / (g.frame.b - g.frame.t)) * 0.12;
    if (!near(pts[0]![1], 0, ty)) out.push("the curve does not start at the reactant level");
    if (!near(pts.at(-1)![1], p.delta_h, ty)) out.push("the curve does not end at the level of the products (the enthalpy change)");
    if (!near(Math.max(...pts.map((q) => q[1])), p.ea, ty * 1.2)) out.push("the top of the barrier is not the activation energy above the reactants");
    if (p.ea_cat !== undefined) {
      const c1 = g.curve("c1");
      if (!near(Math.max(...c1.map((q) => q[1])), p.ea_cat, ty * 1.2)) out.push("the catalysed barrier is not the catalysed activation energy");
      if (!near(c1.at(-1)![1], p.delta_h, ty)) out.push("a catalyst must not change the enthalpy change, but the catalysed curve ends elsewhere");
    }
    const arrow = (id: string): number | undefined => {
      const a = result.shapes.find((s) => String(s.id).endsWith(`_${id}`));
      return a ? g.toY(Number(a.y2)) - g.toY(Number(a.y1)) : undefined;
    };
    const [ea, dh] = [arrow("ea"), arrow("dh")];
    if (ea === undefined || !near(ea, p.ea, ty * 1.5)) out.push("the activation-energy arrow does not span the barrier");
    if (dh === undefined || !near(dh, p.delta_h, ty * 1.5)) out.push("the enthalpy arrow does not span the difference between products and reactants, or points the wrong way");
    return out.slice(0, 3);
  },
});

// ---- rates, equilibrium, Arrhenius -----------------------------------------------------------------------------------------------------------------------------------------
const N_RATE = 40;
const evenly = (n: number, a: number, b: number, f: (x: number) => number): Array<[number, number]> => Array.from({ length: n + 1 }, (_, i) => {
  const x = a + ((b - a) * i) / n;
  return [x, f(x)] as [number, number];
});
const K_UNIT = { 0: "mol/L/s", 1: "1/s", 2: "L/mol/s" } as const;
const RATE_LAW = { 0: "rate is k", 1: "rate is k c", 2: "rate is k c^2" } as const;
export const rateGraph = chemDrawer("c_kinetics", "rate_graph", {
  covers: ["Concentration-time curves, equilibrium approach, Arrhenius"],
  readouts(p) {
    if (p.mode === "order") return [{ key: "Order", value: p.order, unit: "" }, { key: "k", value: p.k, unit: K_UNIT[p.order] }, { key: "c0", value: p.c0, unit: "mol/L" }, { key: "Half-life", value: halfLife(p.order, p.k, p.c0), unit: "s" }, { key: "Rate law", word: RATE_LAW[p.order] }];
    if (p.mode === "equilibrium") {
      const e = equilibriumApproach(p.kf, p.kr, p.a0);
      return [{ key: "kf", value: p.kf, unit: "1/s" }, { key: "kr", value: p.kr, unit: "1/s" }, { key: "K", value: e.K, unit: "" }, { key: "A at equilibrium", value: e.aEq, unit: "mol/L" }, { key: "B at equilibrium", value: e.bEq, unit: "mol/L" }];
    }
    return [{ key: "Ea", value: p.ea_kj, unit: "kJ/mol" }, { key: "log10 A", value: p.log10_a, unit: "" }, { key: "Ea over R", value: (p.ea_kj * 1000) / R_GAS, unit: "K" }, { key: "ln k at low T", value: arrheniusLnK(p.ea_kj, p.log10_a, p.t_min), unit: "" }, { key: "ln k at high T", value: arrheniusLnK(p.ea_kj, p.log10_a, p.t_max), unit: "" }];
  },
  draw(sk, p) {
    if (p.mode === "order") {
      const pts = evenly(N_RATE, 0, p.t_max, (t) => concentration(p.order, p.k, p.c0, t));
      drawGraph(sk, { xName: "t", xUnit: "s", yName: "c", yUnit: "mol/L", xwin: [0, niceCeil(p.t_max)], ywin: niceWindow(0, p.c0), series: [{ id: "c0", pts }] });
    } else if (p.mode === "equilibrium") {
      const e = equilibriumApproach(p.kf, p.kr, p.a0);
      drawGraph(sk, { xName: "t", xUnit: "s", yName: "c", yUnit: "mol/L", xwin: [0, niceCeil(p.t_max)], ywin: niceWindow(0, p.a0), series: [{ id: "c0", pts: evenly(N_RATE, 0, p.t_max, e.a), label: "A", labelAt: 0.5 }, { id: "c1", pts: evenly(N_RATE, 0, p.t_max, e.b), dash: true, label: "B", labelAt: 0.5 }] });
    } else {
      const pts = evenly(N_RATE, 1000 / p.t_max, 1000 / p.t_min, (x) => arrheniusLnK(p.ea_kj, p.log10_a, 1000 / x));
      const lo = Math.min(...pts.map((q) => q[1]));
      const hi = Math.max(...pts.map((q) => q[1]));
      drawGraph(sk, { xName: "1000/T", xUnit: "1/K", yName: "ln k", yUnit: "", xwin: [0, niceCeil(1000 / p.t_min)], ywin: niceWindow(lo, hi), series: [{ id: "c0", pts }] });
    }
  },
  check(result, p) {
    const g = readGraph(result);
    if (!g.ok) return [g.why];
    if (p.mode === "order") return checkCurve(g, "c0", (t) => concentration(p.order, p.k, p.c0, t), "c", N_RATE + 1, (i) => (p.t_max * i) / N_RATE);
    if (p.mode === "equilibrium") {
      const e = equilibriumApproach(p.kf, p.kr, p.a0);
      const out = [...checkCurve(g, "c0", e.a, "A", N_RATE + 1, (i) => (p.t_max * i) / N_RATE), ...checkCurve(g, "c1", e.b, "B", N_RATE + 1, (i) => (p.t_max * i) / N_RATE)];
      // at every drawn time the two amounts add up to the starting amount (nothing is lost)
      const [a, b] = [g.curve("c0"), g.curve("c1")];
      const ty = ((g.ywin[1] - g.ywin[0]) / (g.frame.b - g.frame.t)) * 0.2;
      if (a.length === b.length && a.some((q, i) => !near(q[1] + b[i]![1], p.a0, ty))) out.push("A and B do not add up to the starting amount");
      return out.slice(0, 3);
    }
    return checkCurve(g, "c0", (x) => arrheniusLnK(p.ea_kj, p.log10_a, 1000 / x), "ln k", N_RATE + 1, (i) => 1000 / p.t_max + ((1000 / p.t_min - 1000 / p.t_max) * i) / N_RATE);
  },
});
