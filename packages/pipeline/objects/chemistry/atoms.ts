import { addDots, chemDrawer, polar, near, readDots, readRects, rectsD, shapesLike } from "./ckit";
import {
  SUBSHELL_LETTER, TREND_DATA, TREND_UNIT, blockOf, classOf, configOf, configText, elementByZ, groupOf, hundBoxes, lastFilled, levelEnergy, outerElectrons, periodOf, radialNodes, shellsOf, subName, transition, trendSummary,
  type Sub,
} from "./compute";
import { axisLabel, checkCurve, drawGraph, exact, MIN_TEXT, niceWindow, parseReadouts, pointsOf, r1, r2, readGraph, sig, shapeBy, textBy, type GraphModel, type Readout } from "../physics/kit";

/**
 * Wave 3, atoms: the Bohr shell diagram, the orbital boxes with Hund's rule, the energy levels of a one-electron ion, the periodic table with its element cell, the trends of the table,
 * and the shapes and nodes of s, p and d orbitals (ADR 0110). Electrons are dots inside paths; what is read back is the number of dots on each ring, the arrows in each box, the level
 * lines against the formula, the cell against the group and period the atomic number gives, the plotted trend against the table of values, the node circles against the Laguerre zeros.
 */
const circleOf = (result: { shapes: Array<Record<string, unknown>> }, suffix: string): { cx: number; cy: number; r: number } | undefined => {
  const s = result.shapes.find((x) => typeof x.id === "string" && x.id.endsWith(`_${suffix}`) && x.kind === "circle");
  return s ? { cx: Number(s.cx), cy: Number(s.cy), r: Number(s.r) } : undefined;
};
/** The configuration as it is printed: in full up to argon, then "Ar core" and the subshells after it. */
export function configLine(e: number): string {
  if (e < 1) return "none";
  const c = configOf(e);
  if (e <= 18) return configText(c);
  const rest = c.filter((s: Sub) => !((s.n <= 2) || (s.n === 3 && s.l <= 1)));
  return `Ar core ${configText(rest)}`;
}
/** The electrons in each shell that a printed configuration line adds up to. */
export function shellsFromLine(line: string): number[] {
  const out: number[] = line.startsWith("Ar core") ? [2, 8, 8] : [];
  for (const m of line.matchAll(/(\d)([spdf])\^(\d+)/g)) {
    const n = Number(m[1]);
    out[n - 1] = (out[n - 1] ?? 0) + Number(m[3]);
  }
  return out.map((v) => v ?? 0);
}
const readWord = (result: Parameters<typeof parseReadouts>[0], key: string): string | undefined => parseReadouts(result).get(key)?.word;

// ---- Bohr shells --------------------------------------------------------------------------------------------------------------------------------------------------------------------
export const atomShells = chemDrawer("c_atom_shells", "atom_shells", {
  covers: ["Shell/Bohr atom diagram from atomic number, electron configuration"],
  readouts(p) {
    const e = p.z - p.charge;
    const sh = e > 0 ? shellsOf(e) : [];
    return [
      { key: "Atomic number", value: p.z, unit: "" }, { key: "Electrons", value: e, unit: "" }, ...(p.charge !== 0 ? [{ key: "Ion charge", value: p.charge, unit: "" } as Readout] : []),
      { key: "Shells", word: sh.length ? sh.join(" ") : "none" }, { key: "Outer electrons", value: e > 0 ? outerElectrons(e) : 0, unit: "" }, { key: "Config", word: configLine(e) },
    ];
  },
  draw(sk, p) {
    const e = p.z - p.charge;
    const sh = e > 0 ? shellsOf(e) : [];
    const { pic } = sk.L;
    const cx = pic.x + pic.w / 2;
    const cy = pic.y + pic.h / 2;
    const rMax = Math.min(pic.w, pic.h) / 2 - 0.9;
    const nuc = 2.3;
    sk.circle("nu", cx, cy, nuc, { color: "red", fill: "red", fillOpacity: 0.3 });
    sk.text("nt", cx, cy, `${p.z}+`, { anchor: "middle" });
    const step = (rMax - nuc - 0.6) / Math.max(1, sh.length);
    sh.forEach((count, i) => {
      const r = r2(nuc + 0.6 + step * (i + 1));
      sk.circle(`s${i + 1}`, cx, cy, r, { color: "soft", width: 0.25 });
      addDots(sk, `e${i + 1}_`, Array.from({ length: count }, (_, j) => polar(cx, cy, r, 90 - (360 * j) / count)));
    });
  },
  check(result, p) {
    const out: string[] = [];
    const e = p.z - p.charge;
    const sh = e > 0 ? shellsOf(e) : [];
    if (textBy(result, "nt") !== `${p.z}+`) out.push("the nucleus does not show the atomic number");
    const nu = circleOf(result, "nu");
    if (!nu) return [...out, "the nucleus is missing"];
    const rings = shapesLike(result, "s").filter((s) => s.kind === "circle");
    if (rings.length !== sh.length) out.push(`${rings.length} shells are drawn and the electrons need ${sh.length}`);
    let drawn = 0;
    const counts: number[] = [];
    rings.forEach((s, i) => {
      const r = Number(s.r);
      if (!near(Number(s.cx), nu.cx, 0.06) || !near(Number(s.cy), nu.cy, 0.06)) out.push(`shell ${i + 1} is not centred on the nucleus`);
      if (i > 0 && !(r > Number(rings[i - 1]!.r))) out.push("the shells do not grow outwards");
      const dots = readDots(result, `e${i + 1}_`);
      counts.push(dots.length);
      drawn += dots.length;
      if (dots.length !== sh[i]) out.push(`shell ${i + 1} has ${dots.length} electrons drawn and holds ${sh[i] ?? 0}`);
      for (const d of dots) if (!near(Math.hypot(d[0] - nu.cx, d[1] - nu.cy), r, 0.08)) out.push(`an electron of shell ${i + 1} is not on its shell`);
      for (let a = 0; a < dots.length; a++) for (let b = a + 1; b < dots.length; b++) if (Math.hypot(dots[a]![0] - dots[b]![0], dots[a]![1] - dots[b]![1]) < 0.7) out.push(`two electrons of shell ${i + 1} are on the same spot`);
    });
    if (drawn !== e) out.push(`${drawn} electrons are drawn and the atom has ${e}`);
    const line = readWord(result, "Config");
    if (e > 0 && line !== undefined && shellsFromLine(line).join(",") !== counts.join(",")) out.push("the printed configuration does not add up to the electrons drawn on each shell");
    return out.slice(0, 4);
  },
});

// ---- orbital boxes (Hund's rule) ------------------------------------------------------------------------------------------------------------------------------------------
const subshellOf = (z: number, name: string): Sub => (name === "auto" ? lastFilled(z) : configOf(z).find((s) => subName(s) === name)!);
export const orbitalBoxes = chemDrawer("c_orbital_boxes", "orbital_boxes", {
  covers: ["Shell/Bohr atom diagram from atomic number, electron configuration"],
  readouts(p) {
    const s = subshellOf(p.z, p.subshell);
    const unpaired = hundBoxes(s.l, s.e).filter(([u, d]) => u === 1 && d === 0).length;
    return [{ key: "Subshell", word: subName(s) }, { key: "Electrons in it", value: s.e, unit: "" }, { key: "Unpaired", value: unpaired, unit: "" }, { key: "Config", word: configLine(p.z) }];
  },
  draw(sk, p) {
    const s = subshellOf(p.z, p.subshell);
    const boxes = hundBoxes(s.l, s.e);
    const { pic } = sk.L;
    const bw = Math.min(6, (pic.w - 7) / boxes.length);
    const total = 5 + boxes.length * bw;
    const x0 = pic.x + (pic.w - total) / 2 + 5;
    const y0 = pic.y + pic.h / 2 - bw / 2;
    sk.text("sl", x0 - 0.8, y0 + bw / 2, subName(s), { anchor: "end", bold: true });
    sk.path("bx", rectsD(boxes.map((_, i) => [x0 + i * bw, y0, bw, bw])), { width: 0.35, how: "fade" });
    boxes.forEach(([u, d], i) => {
      if (u) sk.arrow(`u${i}`, x0 + i * bw + bw * 0.33, y0 + bw - 0.8, x0 + i * bw + bw * 0.33, y0 + 0.8, { color: "red", width: 0.4 });
      if (d) sk.arrow(`d${i}`, x0 + i * bw + bw * 0.67, y0 + 0.8, x0 + i * bw + bw * 0.67, y0 + bw - 0.8, { color: "purple", width: 0.4 });
    });
  },
  check(result, p) {
    const out: string[] = [];
    const s = subshellOf(p.z, p.subshell);
    const want = hundBoxes(s.l, s.e);
    const rects = readRects(result, "bx");
    if (textBy(result, "sl") !== subName(s)) out.push("the subshell label is not the one asked for");
    if (rects.length !== want.length) return [...out, `${rects.length} boxes are drawn and a ${SUBSHELL_LETTER[s.l]} subshell has ${want.length}`];
    const got = rects.map(() => [0, 0] as [number, number]);
    for (const a of result.shapes.filter((x) => x.kind === "arrow")) {
      const x = Number(a.x1);
      const i = rects.findIndex(([rx, , rw]) => x > rx && x < rx + rw);
      if (i < 0) {
        out.push("an arrow is outside every box");
        continue;
      }
      if (Number(a.y2) < Number(a.y1)) got[i]![0]++;
      else got[i]![1]++;
    }
    want.forEach(([u, d], i) => {
      if (got[i]![0] !== u || got[i]![1] !== d) out.push(`box ${i + 1} holds ${got[i]![0]} up and ${got[i]![1]} down and Hund's rule gives ${u} up and ${d} down`);
    });
    return out.slice(0, 3);
  },
});

// ---- Bohr energy levels --------------------------------------------------------------------------------------------------------------------------------------------------------
export const bohrLevels = chemDrawer("c_bohr", "bohr_levels", {
  covers: ["Bohr model, energy levels, spectral series"],
  readouts(p) {
    const t = transition(p.z, p.n_from, p.n_to);
    return [
      { key: "E from", value: t.eFrom, unit: "eV" }, { key: "E to", value: t.eTo, unit: "eV" }, { key: "Photon energy", value: t.dE, unit: "eV" }, { key: "Wavelength", value: t.wavelength, unit: "nm" },
      { key: "Series", word: t.series }, { key: "Region", word: t.region }, { key: "Process", word: t.emission ? "emission" : "absorption" },
    ];
  },
  draw(sk, p) {
    const { pic } = sk.L;
    const levels = Math.min(7, Math.max(4, p.n_from, p.n_to));
    const [lo] = niceWindow(levelEnergy(p.z, 1), 0);
    const top = pic.y + 3.4;
    const bot = pic.y + pic.h - 1.2;
    const ax = r1(pic.x + 9);
    const xl = r1(ax + 1);
    const xr = r1(pic.x + pic.w - 8);
    const Y = (e: number): number => r1(bot - ((e - lo) / (0 - lo)) * (bot - top));
    sk.path("ax", `M${ax} ${r1(top)}L${ax} ${r1(bot)}`, { width: 0.4 });
    sk.text("yl", ax, pic.y + 1.2, axisLabel("E", "eV", [lo, 0]));
    sk.path("lv", Array.from({ length: levels }, (_, i) => `M${xl} ${Y(levelEnergy(p.z, i + 1))}L${xr} ${Y(levelEnergy(p.z, i + 1))}`).join(""), { width: 0.4, how: "fade" });
    sk.text("lf", ax - 0.6, Y(levelEnergy(p.z, p.n_from)), `n = ${p.n_from}`, { anchor: "end" });
    sk.text("lt", xr + 0.6, Y(levelEnergy(p.z, p.n_to)), `n = ${p.n_to}`);
    const mid = (xl + xr) / 2;
    sk.arrow("tr", mid, Y(levelEnergy(p.z, p.n_from)), mid, Y(levelEnergy(p.z, p.n_to)), { color: "red", width: 0.5 });
  },
  check(result, p) {
    const out: string[] = [];
    const ax = pointsOf(shapeBy(result, "ax")?.d);
    const m = /, (-?[\d.e-]+) to (-?[\d.e-]+)$/.exec(textBy(result, "yl") ?? "");
    if (ax.length !== 2 || !m) return ["the axis or its printed range is missing"];
    const [top, bot] = [ax[0]![1], ax[1]![1]];
    const [lo, hi] = [Number(m[1]), Number(m[2])];
    const toE = (py: number): number => lo + ((bot - py) / (bot - top)) * (hi - lo);
    const tol = ((hi - lo) / (bot - top)) * 0.08 + 1e-9;
    const pts = pointsOf(shapeBy(result, "lv")?.d);
    const ys: number[] = [];
    for (let i = 0; i + 1 < pts.length; i += 2) ys.push(pts[i]![1]);
    const levels = Math.min(7, Math.max(4, p.n_from, p.n_to));
    if (ys.length !== levels) out.push(`${ys.length} levels are drawn and ${levels} were expected`);
    ys.forEach((y, i) => {
      if (!near(toE(y), levelEnergy(p.z, i + 1), tol)) out.push(`level n = ${i + 1} is drawn at ${sig(toE(y))} eV and the formula gives ${sig(levelEnergy(p.z, i + 1))} eV`);
    });
    for (const [id, n] of [["lf", p.n_from], ["lt", p.n_to]] as const) {
      const t = result.shapes.find((s) => String(s.id).endsWith(`_${id}`));
      if (!t || t.text !== `n = ${n}` || !near(Number(t.y), ys[n - 1] ?? -99, 0.06)) out.push(`the label of level ${n} is not on that level`);
    }
    const a = result.shapes.find((s) => s.kind === "arrow");
    if (!a) return [...out, "the transition arrow is missing"];
    const [e1, e2] = [toE(Number(a.y1)), toE(Number(a.y2))];
    const t = transition(p.z, p.n_from, p.n_to);
    if (!near(e1, t.eFrom, 2 * tol) || !near(e2, t.eTo, 2 * tol)) out.push("the arrow does not join the two levels of the jump");
    if (!near(Math.abs(e2 - e1), t.dE, 3 * tol)) out.push("the energy the arrow spans is not the photon energy");
    if ((e2 < e1) !== t.emission) out.push("the arrow points the wrong way for emission or absorption");
    return out.slice(0, 3);
  },
});

// ---- periodic table and the element cell ------------------------------------------------------------------------------------------------------------------------------
const OUTLINE: Array<[number, number]> = [[0, 0], [1, 0], [1, 1], [2, 1], [2, 3], [12, 3], [12, 1], [17, 1], [17, 0], [18, 0], [18, 7], [0, 7]];
type Grid = { ox: number; oy: number; cw: number };
const gridFor = (pic: { x: number; y: number; w: number; h: number }): Grid => {
  const cw = Math.min((pic.w - 1) / 18, (pic.h - 1.5) / 9.7);
  return { cw, ox: pic.x + (pic.w - 18 * cw) / 2, oy: pic.y + 0.8 };
};
const cellXY = (g: Grid, col: number, row: number): [number, number] => [g.ox + (col - 1) * g.cw, g.oy + (row - 1) * g.cw];
export const periodicCell = chemDrawer("c_periodic", "periodic_cell", {
  covers: ["Periodic table and element cell"],
  readouts(p) {
    const e = elementByZ(p.z)!;
    return [
      { key: "Atomic number", value: p.z, unit: "" }, { key: "Symbol", word: e.sym }, { key: "Name", word: e.name }, { key: "Mass", value: e.mass, unit: "u" }, { key: "Group", value: groupOf(p.z), unit: "" },
      { key: "Period", value: periodOf(p.z), unit: "" }, { key: "Block", word: blockOf(p.z) }, { key: "Type", word: classOf(p.z) },
    ];
  },
  draw(sk, p) {
    const e = elementByZ(p.z)!;
    const g = gridFor(sk.L.pic);
    const at = (c: number, r: number): [number, number] => [g.ox + c * g.cw, g.oy + r * g.cw];
    const V: Array<[number, number, number]> = [[1, 0, 7], [2, 1, 7], ...Array.from({ length: 10 }, (_, i) => [3 + i, 3, 7] as [number, number, number]), ...[13, 14, 15, 16, 17].map((x) => [x, 1, 7] as [number, number, number])];
    const H: Array<[number, number, number]> = [[1, 0, 1], [1, 17, 18], [2, 0, 2], [2, 12, 18], [3, 0, 18], [4, 0, 18], [5, 0, 18], [6, 0, 18]];
    sk.path("gr", [...V.map(([x, y0, y1]) => `M${r1(at(x, y0)[0])} ${r1(at(x, y0)[1])}L${r1(at(x, y1)[0])} ${r1(at(x, y1)[1])}`), ...H.map(([y, x0, x1]) => `M${r1(at(x0, y)[0])} ${r1(at(x0, y)[1])}L${r1(at(x1, y)[0])} ${r1(at(x1, y)[1])}`)].join(""), { color: "soft", width: 0.15, how: "fade" });
    sk.path("tb", OUTLINE.map(([c, r], i) => `${i === 0 ? "M" : "L"}${r1(at(c, r)[0])} ${r1(at(c, r)[1])}`).join("") + "Z", { width: 0.35, how: "fade" });
    const [fx, fy] = at(2, 7.7);
    sk.rect("fb", fx, fy, 14 * g.cw, 2 * g.cw, { color: "soft", width: 0.25 });
    const [hx, hy] = cellXY(g, groupOf(p.z), periodOf(p.z));
    sk.rect("hl", hx, hy, g.cw, g.cw, { color: "red", fill: "red", fillOpacity: 0.35, width: 0.4 });
    const [cx0, cy0] = at(2.4, 1.15);
    sk.rect("cd", cx0, cy0, 9.2 * g.cw, 1.7 * g.cw, { width: 0.3 });
    sk.text("sy", cx0 + 4.6 * g.cw, cy0 + 0.85 * g.cw, e.sym, { anchor: "middle", bold: true, size: Math.max(MIN_TEXT, Math.min(5, g.cw * 1.4)) });
  },
  check(result, p) {
    const out: string[] = [];
    const tb = pointsOf(shapeBy(result, "tb")?.d);
    if (tb.length !== OUTLINE.length) return ["the outline of the table is missing"];
    const cw = (tb[10]![0] - tb[0]![0]) / 18;
    const [ox, oy] = [tb[0]![0], tb[0]![1]];
    if (!near((tb[11]![1] - oy) / cw, 7, 0.1)) out.push("the table is not seven rows tall");
    OUTLINE.forEach(([c, r], i) => {
      if (!near(tb[i]![0], ox + c * cw, 0.2) || !near(tb[i]![1], oy + r * cw, 0.2)) out.push("the outline of the table is not the shape of the periodic table");
    });
    const hl = result.shapes.find((s) => String(s.id).endsWith("_hl"));
    if (!hl) return [...out, "the highlighted cell is missing"];
    const col = Math.round((Number(hl.x) - ox) / cw) + 1;
    const row = Math.round((Number(hl.y) - oy) / cw) + 1;
    if (!near(Number(hl.w), cw, 0.15)) out.push("the highlighted cell is not one cell wide");
    if (col !== groupOf(p.z) || row !== periodOf(p.z)) out.push(`the highlighted cell is in group ${col}, period ${row}; the atomic number gives group ${groupOf(p.z)}, period ${periodOf(p.z)}`);
    if (textBy(result, "sy") !== elementByZ(p.z)!.sym) out.push("the symbol in the cell is not the element's");
    return out.slice(0, 3);
  },
});

// ---- trends ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
const SERIES_NAME = { period2: "Period 2", period3: "Period 3", group1: "Group 1", group17: "Group 17" } as const;
export const periodicTrend = chemDrawer("c_trend", "periodic_trend", {
  covers: ["Periodic trend plots/heat map"],
  readouts(p) {
    const pts = TREND_DATA[p.property][p.series];
    const s = trendSummary(pts);
    const u = TREND_UNIT[p.property];
    return [{ key: "Series", word: SERIES_NAME[p.series] }, { key: "Trend", word: s.direction }, { key: "Dips", value: s.dips, unit: "" }, { key: "Highest", value: s.max, unit: u.unit }, { key: "Lowest", value: s.min, unit: u.unit }];
  },
  draw(sk, p) {
    const pts = TREND_DATA[p.property][p.series];
    const u = TREND_UNIT[p.property];
    const series: GraphModel["series"] = [{ id: "c0", pts: pts.map((q, i) => [i + 1, q.v] as [number, number]) }];
    const f = drawGraph(sk, { xName: "Element", xUnit: "", yName: u.name, yUnit: u.unit, xwin: [0, pts.length + 1], ywin: niceWindow(0, trendSummary(pts).max), series });
    pts.forEach((q, i) => sk.text(`t${i}`, f.X(i + 1), f.Y(q.v) - 1.8, q.sym, { anchor: "middle" }));
  },
  check(result, p) {
    const pts = TREND_DATA[p.property][p.series];
    const g = readGraph(result);
    if (!g.ok) return [g.why];
    const drawn = g.curve("c0");
    const out: string[] = [];
    if (drawn.length !== pts.length) return [`${drawn.length} points are drawn and the table has ${pts.length}`];
    const tx = ((g.xwin[1] - g.xwin[0]) / (g.frame.r - g.frame.l)) * 0.08 + 1e-9;
    const ty = ((g.ywin[1] - g.ywin[0]) / (g.frame.b - g.frame.t)) * 0.08 + 1e-9;
    pts.forEach((q, i) => {
      if (!near(drawn[i]![0], i + 1, tx) || !near(drawn[i]![1], q.v, ty)) out.push(`${q.sym} is plotted at ${sig(drawn[i]![1])} and the table value is ${sig(q.v)}`);
      if (textBy(result, `t${i}`) !== q.sym) out.push(`the label of point ${i + 1} is not ${q.sym}`);
    });
    return out.slice(0, 3);
  },
});

// ---- orbitals: shapes and nodes ----------------------------------------------------------------------------------------------------------------------------------------------
const meanRadius = (n: number, l: number): number => 0.5 * (3 * n * n - l * (l + 1)); // in a0, exact for a hydrogenic orbital
const lobeD = (cx: number, cy: number, L: number, deg: number, w: number): string => {
  const P = (u: number, v: number): string => {
    const [x, y] = polar(cx, cy, Math.hypot(u, v), deg + (Math.atan2(v, u) * 180) / Math.PI);
    return `${r1(x)} ${r1(y)}`;
  };
  return `M${r1(cx)} ${r1(cy)}C${P(0.25 * L, w * L)} ${P(0.9 * L, 0.78 * w * L)} ${P(L, 0)}C${P(0.9 * L, -0.78 * w * L)} ${P(0.25 * L, -w * L)} ${r1(cx)} ${r1(cy)}Z`;
};
export const orbitalShapes = chemDrawer("c_orbital", "orbital_shapes", {
  covers: ["s, p, d orbital shapes, nodes"],
  readouts(p) {
    const nodes = radialNodes(p.n, p.l);
    return [
      { key: "Orbital", word: `${p.n}${SUBSHELL_LETTER[p.l]}` }, { key: "Radial nodes", value: p.n - p.l - 1, unit: "" }, { key: "Angular nodes", value: p.l, unit: "" }, { key: "Total nodes", value: p.n - 1, unit: "" },
      ...nodes.map((r, i) => ({ key: `Node ${i + 1}`, value: r, unit: "a0" }) as Readout), { key: "Mean radius", value: meanRadius(p.n, p.l), unit: "a0" },
    ];
  },
  draw(sk, p) {
    const { pic } = sk.L;
    const cx = pic.x + pic.w / 2;
    const cy = pic.y + pic.h / 2;
    const R = Math.min(pic.w, pic.h) / 2 - 0.8;
    const k = R / (2 * meanRadius(p.n, p.l));
    if (p.l === 0) sk.circle("ob", cx, cy, R, { color: "ink", fill: "blue", fillOpacity: 0.2, width: 0.4 });
    else (p.l === 1 ? [90, 270] : [45, 135, 225, 315]).forEach((deg, i) => sk.path(`lb${i}`, lobeD(cx, cy, R, deg, p.l === 1 ? 0.45 : 0.24), { color: "ink", fill: "blue", fillOpacity: 0.25, width: 0.4, how: "fade" }));
    radialNodes(p.n, p.l).forEach((r, i) => sk.circle(`nd${i}`, cx, cy, r2(r * k), { color: "purple", dash: true, width: 0.3 }));
    for (let i = 0; i < p.l; i++) {
      const v = p.l === 1 ? false : i === 1;
      sk.line(`an${i}`, v ? cx : cx - R, v ? cy - R : cy, v ? cx : cx + R, v ? cy + R : cy, { color: "red", dash: true, width: 0.3 });
    }
  },
  check(result, p) {
    const out: string[] = [];
    let centre: [number, number];
    let R: number;
    const lobes = shapesLike(result, "lb");
    if (p.l === 0) {
      const ob = circleOf(result, "ob");
      if (!ob) return ["the orbital's outline is missing"];
      centre = [ob.cx, ob.cy];
      R = ob.r;
    } else {
      const want = p.l === 1 ? 2 : 4;
      if (lobes.length !== want) return [`${lobes.length} lobes are drawn and a ${SUBSHELL_LETTER[p.l]} orbital has ${want}`];
      const first = pointsOf(lobes[0]!.d)[0]!;
      centre = [first[0], first[1]];
      R = Math.max(...lobes.flatMap((s) => pointsOf(s.d).map(([x, y]) => Math.hypot(x - centre[0], y - centre[1]))));
    }
    const nodes = shapesLike(result, "nd").filter((s) => s.kind === "circle");
    const want = radialNodes(p.n, p.l);
    if (nodes.length !== p.n - p.l - 1) out.push(`${nodes.length} radial nodes are drawn and n - l - 1 = ${p.n - p.l - 1}`);
    const rb = 2 * meanRadius(p.n, p.l);
    nodes.forEach((s, i) => {
      if (!near(Number(s.r) / R, (want[i] ?? 0) / rb, 0.012 + 0.02 / R)) out.push(`radial node ${i + 1} is at ${sig(Number(s.r) / R)} of the outline and the wavefunction gives ${sig((want[i] ?? 0) / rb)}`);
    });
    const lines = shapesLike(result, "an");
    if (lines.length !== p.l) out.push(`${lines.length} angular nodes are drawn and l = ${p.l}`);
    for (const s of lines) if (!near(Number(s.x1) + Number(s.x2), 2 * centre[0], 0.2) && !near(Number(s.y1) + Number(s.y2), 2 * centre[1], 0.2)) out.push("a nodal plane does not pass through the nucleus");
    return out.slice(0, 3);
  },
});
