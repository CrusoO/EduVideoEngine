import { chemDrawer, near, readSegs } from "./ckit";
import { ELECTROLYTES, GASES, METALS, collectionProblem, electrolysis, galvanic, AIR_MOLAR_MASS, type Collection, type GasName } from "./compute";
import { methodFor } from "./params";
import { pointsOf, shapeBy, textBy, r1, type Readout, type Sketch } from "../physics/kit";
import type { DrawResult } from "../registry";

/**
 * Wave 3, apparatus: the electrochemical (Daniell-type) cell, an electrolysis cell, and the laboratory set-ups of distillation, filtration, gas collection and titration, all as schematics
 * of owner-original shapes (ADR 0110). They are diagrams of how the apparatus is arranged, not scale drawings. What the figures claim is read back from the drawing: which electrode
 * is the anode (the metal with the lower standard potential, on the left), which way the electrons flow, the sign of each terminal, where cooling water enters a condenser (at the lower
 * end, against the flow of vapour), where the residue stays, and the way the jar is held and where the delivery tube ends for the gas that is collected.
 */
type Box = { x: number; y: number; w: number; h: number };
const at = (b: Box) => (fx: number, fy: number): [number, number] => [b.x + fx * b.w, b.y + fy * b.h];
const find = (result: DrawResult, id: string) => result.shapes.find((s) => String(s.id).endsWith(`_${id}`));
const fnum = (v: unknown): number => Number(v);

// ---- galvanic cell --------------------------------------------------------------------------------------------------------------------------------------------------------------------
export const galvanicCell = chemDrawer("c_cell", "galvanic_cell", {
  covers: ["Electrochemical/electrolytic cell, Daniell cell, electrolysis"],
  readouts(p) {
    const g = galvanic(p.m1, p.m2);
    return [{ key: "E cell", value: g.e, unit: "V" }, { key: "E anode", value: METALS[g.anode]!.e0, unit: "V" }, { key: "E cathode", value: METALS[g.cathode]!.e0, unit: "V" }, { key: "Electrons", value: g.n, unit: "" }, { key: "dG", value: g.dg, unit: "kJ/mol" }, { key: "log10 K", value: g.log10K, unit: "" }];
  },
  draw(sk, p) {
    const g = galvanic(p.m1, p.m2);
    const { pic } = sk.L;
    const bw = pic.w * 0.34;
    const bh = pic.h * 0.34;
    const by = pic.y + pic.h * 0.5;
    const [b1, b2] = [pic.x + pic.w * 0.1, pic.x + pic.w * 0.56];
    const [e1, e2] = [b1 + bw / 2, b2 + bw / 2];
    const wy = pic.y + 7;
    sk.rect("bk0", b1, by, bw, bh, { fill: "blue", fillOpacity: 0.15, width: 0.35 });
    sk.rect("bk1", b2, by, bw, bh, { fill: "blue", fillOpacity: 0.15, width: 0.35 });
    sk.rect("el0", e1 - 0.8, by - 5, 1.6, bh * 0.8 + 5, { fill: "ink", fillOpacity: 0.4, width: 0.3 });
    sk.rect("el1", e2 - 0.8, by - 5, 1.6, bh * 0.8 + 5, { fill: "ink", fillOpacity: 0.4, width: 0.3 });
    sk.path("wr", `M${r1(e1)} ${r1(by - 5)}L${r1(e1)} ${r1(wy)}L${r1(e2)} ${r1(wy)}L${r1(e2)} ${r1(by - 5)}`, { width: 0.35 });
    const mid = (e1 + e2) / 2;
    sk.circle("vm", mid, wy, 2.1, { width: 0.3 });
    sk.text("vt", mid, wy, "V", { anchor: "middle", bold: true });
    sk.arrow("ef", e1 + 2.5, wy - 1.9, mid - 3.2, wy - 1.9, { color: "red", width: 0.4 });
    sk.text("efl", (e1 + mid) / 2, wy - 4, "e-", { anchor: "middle" });
    const sy = by - 2.5;
    sk.path("sb", `M${r1(b1 + bw * 0.85)} ${r1(by + bh * 0.45)}L${r1(b1 + bw * 0.85)} ${r1(sy)}L${r1(b2 + bw * 0.15)} ${r1(sy)}L${r1(b2 + bw * 0.15)} ${r1(by + bh * 0.45)}`, { width: 0.8, color: "soft", how: "fade" });
    sk.text("sbl", mid, sy - 1.8, "Salt bridge", { anchor: "middle" });
    sk.text("la", e1, by + bh + 2.2, `${g.anode} anode (-)`, { anchor: "middle" });
    sk.text("lc", e2, by + bh + 2.2, `${g.cathode} cathode (+)`, { anchor: "middle" });
    sk.text("ia", b1 + bw * 0.24, by + bh - 1.6, `${g.anode}${g.aCharge === 1 ? "" : g.aCharge}+`, { anchor: "middle" });
    sk.text("ic", b2 + bw * 0.24, by + bh - 1.6, `${g.cathode}${g.cCharge === 1 ? "" : g.cCharge}+`, { anchor: "middle" });
  },
  check(result, p) {
    const out: string[] = [];
    const sym = (id: string, tail: string): string | undefined => (typeof textBy(result, id) === "string" ? textBy(result, id)!.replace(tail, "") : undefined);
    const [left, right] = [sym("la", " anode (-)"), sym("lc", " cathode (+)")];
    if (!left || !right || !METALS[left] || !METALS[right]) return ["an electrode label is missing or names no metal"];
    const want = galvanic(p.m1, p.m2);
    if (left !== want.anode || right !== want.cathode) out.push(`the drawing has ${left} as the anode and ${right} as the cathode; the standard potentials make ${want.anode} the anode and ${want.cathode} the cathode`);
    // the drawing alone must name the anode as the metal of lower potential
    if (!(METALS[left]!.e0 < METALS[right]!.e0)) out.push("the anode drawn is not the metal with the lower standard potential");
    const a = find(result, "ef");
    if (!a || !(fnum(a.x2) > fnum(a.x1))) out.push("electrons must flow in the wire from the anode (left) to the cathode (right)");
    const e0 = find(result, "el0");
    const e1 = find(result, "el1");
    if (!e0 || !e1 || !(fnum(e0.x) < fnum(e1.x))) out.push("the two electrodes are missing or the anode is not on the left");
    const wr = pointsOf(shapeBy(result, "wr")?.d);
    if (e0 && e1 && wr.length === 4 && (!near(wr[0]![0], fnum(e0.x) + 0.8, 0.15) || !near(wr[3]![0], fnum(e1.x) + 0.8, 0.15) || !near(wr[0]![1], fnum(e0.y), 0.15) || !near(wr[3]![1], fnum(e1.y), 0.15))) out.push("the wire does not join the tops of the two electrodes");
    for (const [i, e] of [e0, e1].entries()) {
      const b = find(result, `bk${i}`);
      if (e && b && !(fnum(e.y) < fnum(b.y) && fnum(e.y) + fnum(e.h) < fnum(b.y) + fnum(b.h) && fnum(e.x) > fnum(b.x) && fnum(e.x) + fnum(e.w) < fnum(b.x) + fnum(b.w))) out.push("an electrode must stand in its beaker with its top out of the liquid");
    }
    const ions = [textBy(result, "ia"), textBy(result, "ic")];
    for (const [i, m] of [left, right].entries()) if (ions[i] !== `${m}${METALS[m]!.charge === 1 ? "" : METALS[m]!.charge}+`) out.push(`the ion in the ${i === 0 ? "left" : "right"} beaker is not the ion of ${m}`);
    return out.slice(0, 3);
  },
});

// ---- electrolysis -----------------------------------------------------------------------------------------------------------------------------------------------------------------------
const SHORT = { molten_nacl: "molten sodium chloride", aq_nacl: "sodium chloride solution", aq_cuso4: "copper sulfate solution", dil_h2so4: "dilute sulfuric acid" } as const;
export const electrolysisCell = chemDrawer("c_electrolysis", "electrolysis_cell", {
  covers: ["Electrochemical/electrolytic cell, Daniell cell, electrolysis"],
  readouts(p) {
    const d = ELECTROLYTES[p.electrolyte];
    const e = electrolysis(p.electrolyte, p.current_a, p.time_min);
    const out: Readout[] = [{ key: "Charge", value: e.q, unit: "C" }, { key: "Electrons", value: e.ne, unit: "mol" }, { key: "Cathode", word: d.cathode }, { key: "Anode", word: d.anode }];
    out.push(e.cMass !== undefined ? { key: "Cathode mass", value: e.cMass, unit: "g" } : { key: "Cathode gas", value: e.cVol!, unit: "L" });
    out.push({ key: "Anode gas", value: e.aVol, unit: "L" });
    return out;
  },
  draw(sk, p) {
    const d = ELECTROLYTES[p.electrolyte];
    const { pic } = sk.L;
    const bw = pic.w * 0.5;
    const bx = pic.x + pic.w * 0.25;
    const by = pic.y + pic.h * 0.46;
    const bh = pic.h * 0.34;
    const [xc, xa] = [bx + bw * 0.28, bx + bw * 0.72];
    const wy = pic.y + 9;
    const cx = bx + bw / 2;
    sk.rect("bk", bx, by, bw, bh, { fill: "blue", fillOpacity: 0.15, width: 0.35 });
    sk.rect("ec", xc - 0.8, by - 4, 1.6, bh * 0.85 + 4, { fill: "ink", fillOpacity: 0.4, width: 0.3 });
    sk.rect("ea", xa - 0.8, by - 4, 1.6, bh * 0.85 + 4, { fill: "ink", fillOpacity: 0.4, width: 0.3 });
    sk.path("wl", `M${r1(xc)} ${r1(by - 4)}L${r1(xc)} ${r1(wy)}L${r1(cx - 1.3)} ${r1(wy)}`, { width: 0.35 });
    sk.path("wp", `M${r1(xa)} ${r1(by - 4)}L${r1(xa)} ${r1(wy)}L${r1(cx + 1.3)} ${r1(wy)}`, { width: 0.35 });
    sk.path("bn", `M${r1(cx - 1.3)} ${r1(wy - 1.5)}L${r1(cx - 1.3)} ${r1(wy + 1.5)}`, { width: 0.9 });
    sk.path("bs", `M${r1(cx + 1.3)} ${r1(wy - 3)}L${r1(cx + 1.3)} ${r1(wy + 3)}`, { width: 0.35 });
    sk.arrow("ef", xa - 1.5, wy - 4.8, xc + 1.5, wy - 4.8, { color: "red", width: 0.4 });
    sk.text("efl", cx, wy - 7, "e-", { anchor: "middle" });
    sk.text("lc", xc, by + bh + 2.2, "Cathode -", { anchor: "middle" });
    sk.text("la", xa, by + bh + 2.2, "Anode +", { anchor: "middle" });
    sk.text("pc", xc - 1.4, by + bh * 0.45, d.cathode, { anchor: "end" });
    sk.text("pa", xa + 1.4, by + bh * 0.45, d.anode);
    sk.text("el", cx, by + bh + 5.6, SHORT[p.electrolyte], { anchor: "middle" });
  },
  check(result, p) {
    const out: string[] = [];
    const d = ELECTROLYTES[p.electrolyte];
    const ec = find(result, "ec");
    const ea = find(result, "ea");
    if (!ec || !ea) return ["an electrode is missing"];
    const [xc, xa] = [fnum(ec.x) + 0.8, fnum(ea.x) + 0.8];
    // the cathode is the electrode joined to the negative terminal: the short thick line of the battery
    const bn = pointsOf(shapeBy(result, "bn")?.d);
    const bs = pointsOf(shapeBy(result, "bs")?.d);
    if (bn.length !== 2 || bs.length !== 2) return ["the battery is missing"];
    const [lenN, lenS] = [Math.abs(bn[1]![1] - bn[0]![1]), Math.abs(bs[1]![1] - bs[0]![1])];
    if (!(lenN < lenS)) out.push("the negative terminal of a battery is the shorter line and the positive the longer");
    const wl = pointsOf(shapeBy(result, "wl")?.d);
    const wp = pointsOf(shapeBy(result, "wp")?.d);
    if (wl.length !== 3 || wp.length !== 3 || !near(wl[2]![0], bn[0]![0], 0.15) || !near(wp[2]![0], bs[0]![0], 0.15)) out.push("the wires do not join each electrode to its terminal");
    if (!(xc < xa) || !near(wl[0]![0], xc, 0.15) || !near(wp[0]![0], xa, 0.15)) out.push("the cathode must be the electrode on the negative side");
    const bk = find(result, "bk");
    for (const [e, w] of [[ec, wl], [ea, wp]] as const) {
      if (!near(w[0]![1], fnum(e.y), 0.15)) out.push("a wire does not reach the top of its electrode");
      if (bk && !(fnum(e.y) < fnum(bk.y) && fnum(e.y) + fnum(e.h) < fnum(bk.y) + fnum(bk.h))) out.push("an electrode must stand in the beaker with its top out of the liquid");
    }
    if (textBy(result, "lc") !== "Cathode -" || textBy(result, "la") !== "Anode +") out.push("the electrode labels are not Cathode - and Anode +");
    const x = find(result, "lc");
    const y = find(result, "la");
    if (x && y && !(fnum(x.x) < fnum(y.x))) out.push("the cathode label is not over the cathode");
    const ef = find(result, "ef");
    if (!ef || !(fnum(ef.x2) < fnum(ef.x1))) out.push("electrons flow from the anode, through the battery, to the cathode");
    if (textBy(result, "pc") !== d.cathode || textBy(result, "pa") !== d.anode) out.push("a product label is not what discharges at that electrode");
    return out.slice(0, 3);
  },
});

// ---- laboratory set-ups --------------------------------------------------------------------------------------------------------------------------------------------------------------------
const flaskPoly = (cx: number, top: number, neck: number, base: number, h: number): Array<[number, number]> => [[cx - neck, top], [cx + neck, top], [cx + base, top + h], [cx - base, top + h]];
const METHOD_WORD: Record<Collection, string> = { over_water: "over water", air_upward: "upward displacement of air", air_downward: "downward displacement of air" };
function distillation(sk: Sketch): void {
  const a = at(sk.L.pic);
  const u = Math.min(sk.L.pic.w, sk.L.pic.h);
  const [fx, fy] = a(0.15, 0.58);
  const r = u * 0.15;
  const ny = fy - r - 5.6;
  sk.circle("fk", fx, fy, r, { fill: "blue", fillOpacity: 0.15, width: 0.35 });
  sk.rect("nk", fx - 1.2, ny, 2.4, 6.2, { width: 0.35 });
  sk.path("th", `M${r1(fx)} ${r1(ny - 4)}L${r1(fx)} ${r1(ny + 2.5)}`, { width: 0.35, how: "fade" });
  sk.circle("tb", fx, ny + 2.7, 0.6, { fill: "red" });
  const [cx0, cy0] = a(0.34, 0.36);
  const [cx1, cy1] = a(0.68, 0.58);
  sk.line("sa", fx + 1.2, ny + 2.7, cx0, cy0, { width: 0.35 });
  const L = Math.hypot(cx1 - cx0, cy1 - cy0);
  const [nx, ny2] = [-(cy1 - cy0) / L, (cx1 - cx0) / L];
  const hw = 1.7;
  sk.polygon("cj", [[cx0 + nx * hw, cy0 + ny2 * hw], [cx1 + nx * hw, cy1 + ny2 * hw], [cx1 - nx * hw, cy1 - ny2 * hw], [cx0 - nx * hw, cy0 - ny2 * hw]], { fill: "blue", fillOpacity: 0.2, width: 0.35 });
  sk.line("ct", cx0, cy0, cx1 + 3, cy1 + 1.8, { width: 0.3 });
  // cooling water enters at the lower end and leaves at the upper end, against the flow of the vapour
  const lerp = (t: number): [number, number] => [cx0 + (cx1 - cx0) * t, cy0 + (cy1 - cy0) * t];
  const [lo, up] = [lerp(0.8), lerp(0.15)];
  const wiTip: [number, number] = [lo[0] + nx * (hw + 0.2), lo[1] + ny2 * (hw + 0.2)];
  const woTail: [number, number] = [up[0] - nx * (hw + 0.2), up[1] - ny2 * (hw + 0.2)];
  sk.arrow("wi", wiTip[0], wiTip[1] + 5.5, wiTip[0], wiTip[1], { color: "red", width: 0.4 });
  sk.arrow("wo", woTail[0], woTail[1], woTail[0], woTail[1] - 5.5, { color: "red", width: 0.4 });
  const [rx, ry] = a(0.74, 0.62);
  sk.path("rc", `M${r1(rx - 5)} ${r1(ry)}L${r1(rx - 5)} ${r1(ry + 8)}L${r1(rx + 5)} ${r1(ry + 8)}L${r1(rx + 5)} ${r1(ry)}`, { width: 0.35 });
  sk.rect("hb", fx - 4, fy + r + 1, 8, 2.4, { fill: "red", fillOpacity: 0.25, width: 0.3 });
  sk.text("lf", fx, fy + r + 6.2, "Flask", { anchor: "middle" });
  sk.text("lt", sk.L.pic.x + 0.8, ny - 7, "Thermometer");
  sk.text("lcn", (cx0 + cx1) / 2 - 4, (cy0 + cy1) / 2 + 7.5, "Condenser", { anchor: "middle" });
  sk.text("lwi", wiTip[0] + 1, wiTip[1] + 7.7, "Water in", { anchor: "end" });
  sk.text("lwo", woTail[0] + 1.4, woTail[1] - 4, "Water out");
  sk.text("lr", rx, ry + 10.6, "Receiver", { anchor: "middle" });
}
function filtration(sk: Sketch): void {
  const a = at(sk.L.pic);
  const [cx, y0] = a(0.5, 0.22);
  const w = Math.min(sk.L.pic.w * 0.3, 16);
  const cone = Math.min(sk.L.pic.h * 0.25, 9);
  const y1 = y0 + cone;
  sk.polygon("fn", [[cx - w / 2, y0], [cx + w / 2, y0], [cx + 1, y1], [cx - 1, y1]], { width: 0.35 });
  sk.rect("st", cx - 1, y1, 2, 5.5, { width: 0.35 });
  sk.path("fp", `M${r1(cx - w / 2 + 1.5)} ${r1(y0)}L${r1(cx)} ${r1(y1 - 1)}L${r1(cx + w / 2 - 1.5)} ${r1(y0)}`, { color: "soft", dash: true, width: 0.3, how: "fade" });
  sk.circle("rs", cx, y1 - 2.2, 1, { fill: "ink", fillOpacity: 0.5 });
  sk.arrow("pm", cx, y0 - 6.5, cx, y0 + 1.4, { color: "red", width: 0.4 });
  const fy = y1 + 3;
  sk.polygon("fl", flaskPoly(cx, fy, 2, 6.5, 10), { width: 0.35 });
  sk.polygon("ft", [[cx - 5.3, fy + 7], [cx + 5.3, fy + 7], [cx + 6.5, fy + 10], [cx - 6.5, fy + 10]], { color: "none", fill: "blue", fillOpacity: 0.3 });
  sk.text("lm", cx + 1.2, y0 - 6, "Mixture");
  sk.text("lfn", cx + w / 2 + 1, y0 + 2, "Funnel");
  sk.text("lp", cx - w / 2 - 1, y0 + 2, "Filter paper", { anchor: "end" });
  sk.text("lrs", cx + w / 2 + 1, y1 - 2, "Residue");
  sk.text("lft", cx + 8.5, fy + 7.5, "Filtrate");
  sk.text("lf", cx, fy + 13, "Flask", { anchor: "middle" });
}
function gasCollection(sk: Sketch, gas: GasName, method: Collection): void {
  const a = at(sk.L.pic);
  const [fx, fy] = a(0.13, 0.55);
  sk.polygon("fk", flaskPoly(fx, fy, 1.8, 6.5, 12), { fill: "blue", fillOpacity: 0.15, width: 0.35 });
  const nx = fx;
  const [x0, x1] = [a(0.5, 0)[0], a(0.68, 0)[0]];
  const [yt, yb] = [a(0, 0.42)[1], a(0, 0.84)[1]];
  const mid = (x0 + x1) / 2;
  const top = a(0, 0.22)[1];
  const P = (pts: Array<[number, number]>): string => pts.map(([x, y], i) => `${i === 0 ? "M" : "L"}${r1(x)} ${r1(y)}`).join("");
  if (method === "over_water") {
    const wl = a(0, 0.7)[1];
    const floor = a(0, 0.88)[1];
    sk.rect("tr", a(0.4, 0)[0], wl, a(0.84, 0)[0] - a(0.4, 0)[0], floor - wl, { fill: "blue", fillOpacity: 0.25, width: 0.35 });
    sk.path("jr", P([[x0, yb], [x0, yt], [x1, yt], [x1, yb]]), { width: 0.4 });
    sk.rect("gf", x0 + 0.4, yt + 0.4, x1 - x0 - 0.8, wl - yt - 0.4, { color: "none", fill: "yellow", fillOpacity: 0.3 });
    const dx = a(0.34, 0)[0];
    sk.path("tb", P([[nx, fy], [nx, top], [dx, top], [dx, floor - 2], [mid, floor - 2], [mid, wl - 3]]), { width: 0.4 });
    sk.text("lw", a(0.62, 0)[0], floor + 1.8, "Water trough", { anchor: "middle" });
  } else if (method === "air_upward") {
    sk.path("jr", P([[x0, yt], [x0, yb], [x1, yb], [x1, yt]]), { width: 0.4 });
    sk.rect("gf", x0 + 0.4, yb - (yb - yt) * 0.5, x1 - x0 - 0.8, (yb - yt) * 0.5 - 0.4, { color: "none", fill: "yellow", fillOpacity: 0.3 });
    sk.path("tb", P([[nx, fy], [nx, top], [mid, top], [mid, yb - 2.2]]), { width: 0.4 });
    sk.arrow("ae", x1 - 2, yt - 0.5, x1 - 2, yt - 5.5, { color: "soft", width: 0.3 });
    sk.text("la", x1 + 1.2, yt - 4, "Air out");
  } else {
    sk.path("jr", P([[x0, yb], [x0, yt], [x1, yt], [x1, yb]]), { width: 0.4 });
    sk.rect("gf", x0 + 0.4, yt + 0.4, x1 - x0 - 0.8, (yb - yt) * 0.5, { color: "none", fill: "yellow", fillOpacity: 0.3 });
    const dx = a(0.36, 0)[0];
    const bench = a(0, 0.9)[1];
    sk.path("tb", P([[nx, fy], [nx, top], [dx, top], [dx, bench], [mid, bench], [mid, yt + 2.2]]), { width: 0.4 });
    sk.arrow("ae", x1 - 2, yb - 3, x1 - 2, yb + 3, { color: "soft", width: 0.3 });
    sk.text("la", x1 + 1.2, yb + 1, "Air out");
  }
  sk.text("lf", fx, fy + 15.2, "Flask", { anchor: "middle" });
  sk.text("ld", (nx + a(0.4, 0)[0]) / 2, top - 1.8, "Delivery tube", { anchor: "middle" });
  sk.text("lj", mid, yt - 1.8, `${gas} jar`, { anchor: "middle" });
}
function titration(sk: Sketch): void {
  const a = at(sk.L.pic);
  const [cx, by] = a(0.45, 0.06);
  const bh = sk.L.pic.h * 0.5;
  sk.rect("bu", cx - 1.4, by, 2.8, bh, { width: 0.35 });
  sk.rect("bl", cx - 1.1, by + bh * 0.12, 2.2, bh * 0.7, { color: "none", fill: "blue", fillOpacity: 0.3 });
  sk.path("bm", Array.from({ length: 5 }, (_, i) => `M${r1(cx - 1.4)} ${r1(by + bh * (0.15 + 0.15 * i))}L${r1(cx - 0.2)} ${r1(by + bh * (0.15 + 0.15 * i))}`).join(""), { color: "soft", width: 0.2, how: "fade" });
  sk.rect("tp", cx - 2.2, by + bh, 4.4, 1.6, { fill: "ink", fillOpacity: 0.4, width: 0.3 });
  sk.line("tt", cx, by + bh + 1.6, cx, by + bh + 4.4, { width: 0.35 });
  const fy = by + bh + 5;
  sk.polygon("fk", flaskPoly(cx, fy, 1.8, 7, 11), { width: 0.35 });
  sk.polygon("fl", [[cx - 5.6, fy + 7], [cx + 5.6, fy + 7], [cx + 7, fy + 11], [cx - 7, fy + 11]], { color: "none", fill: "pink", fillOpacity: 0.35 });
  sk.path("sd", `M${r1(cx - 8)} ${r1(by - 1)}L${r1(cx - 8)} ${r1(fy + 12)}L${r1(cx + 9)} ${r1(fy + 12)}M${r1(cx - 8)} ${r1(by + 3)}L${r1(cx - 1.4)} ${r1(by + 3)}`, { color: "soft", width: 0.4, how: "fade" });
  sk.text("lb", cx + 2.4, by + bh * 0.4, "Burette");
  sk.text("ltp", cx + 3, by + bh + 0.8, "Tap");
  sk.text("lf", cx + 8, fy + 8, "Conical flask");
}
export const labApparatus = chemDrawer("c_lab", "lab_apparatus", {
  covers: ["Lab apparatus: beaker, flask, burette, condenser, funnel, distillation, filtration"],
  readouts(p) {
    if (p.setup === "distillation") return [{ key: "Water in", word: "lower end" }, { key: "Water out", word: "upper end" }];
    if (p.setup === "filtration") return [{ key: "Residue", word: "stays on the paper" }, { key: "Filtrate", word: "passes through" }];
    if (p.setup === "titration") return [{ key: "Burette", word: "titrant" }, { key: "Flask", word: "solution and indicator" }];
    const g = p.gas!;
    return [{ key: "Gas", word: g }, { key: "Method", word: METHOD_WORD[methodFor(g, p.method as Collection | undefined)] }, { key: "Molar mass", value: GASES[g].M, unit: "g/mol" }, { key: "Air", value: AIR_MOLAR_MASS, unit: "g/mol" }];
  },
  draw(sk, p) {
    if (p.setup === "distillation") distillation(sk);
    else if (p.setup === "filtration") filtration(sk);
    else if (p.setup === "titration") titration(sk);
    else gasCollection(sk, p.gas!, methodFor(p.gas!, p.method as Collection | undefined));
  },
  check(result, p) {
    const out: string[] = [];
    const t = (id: string): { x: number; y: number; text: string } | undefined => {
      const s = find(result, id);
      return s ? { x: fnum(s.x), y: fnum(s.y), text: String(s.text) } : undefined;
    };
    const need = (pairs: Array<[string, string]>): boolean => {
      let ok = true;
      for (const [id, text] of pairs) if (t(id)?.text !== text) {
        out.push(`the label "${text}" is missing`);
        ok = false;
      }
      return ok;
    };
    if (p.setup === "distillation") {
      if (!need([["lf", "Flask"], ["lt", "Thermometer"], ["lcn", "Condenser"], ["lwi", "Water in"], ["lwo", "Water out"], ["lr", "Receiver"]])) return out;
      const [wi, wo] = [find(result, "wi"), find(result, "wo")];
      if (!wi || !wo) return ["a water arrow is missing"];
      if (!(fnum(wi.y1) > fnum(wo.y1))) out.push("cooling water must enter at the lower end of the condenser and leave at the upper end");
      if (!(fnum(wi.y2) < fnum(wi.y1)) || !(fnum(wo.y2) < fnum(wo.y1))) out.push("the water arrows must run up the jacket, in at the lower end and out at the upper end");
      if (!(t("lwi")!.y > t("lwo")!.y)) out.push("the label Water in must be below the label Water out");
      const bulb = find(result, "tb");
      const sa = find(result, "sa");
      if (!bulb || !sa || !near(fnum(bulb.cy), fnum(sa.y1), 3.2)) out.push("the thermometer bulb must be level with the side arm, where the vapour leaves");
      if (!(t("lr")!.x > t("lf")!.x)) out.push("the receiver must be on the far side of the condenser from the flask");
      const [fk, nk, hb] = [find(result, "fk"), find(result, "nk"), find(result, "hb")];
      if (fk && nk && hb) {
        const [fx, fy, fr] = [fnum(fk.cx), fnum(fk.cy), fnum(fk.r)];
        if (!near(fnum(nk.y) + fnum(nk.h), fy - fr, 1.6) || Math.abs(fnum(nk.x) + fnum(nk.w) / 2 - fx) > fr * 0.5) out.push("the neck must stand on top of the flask");
        if (!near(fnum(hb.y), fy + fr + 1, 1.6)) out.push("the burner must be under the flask");
        if (bulb && !(fnum(bulb.cy) > fnum(nk.y) && fnum(bulb.cy) < fnum(nk.y) + fnum(nk.h) && near(fnum(bulb.cx), fnum(nk.x) + fnum(nk.w) / 2, 0.6))) out.push("the thermometer bulb must be in the neck");
        if (sa && !near(fnum(sa.x1), fnum(nk.x) + fnum(nk.w), 0.6)) out.push("the side arm must leave the neck");
      }
      const cj = find(result, "cj");
      const rc = pointsOf(shapeBy(result, "rc")?.d);
      if (cj && rc.length === 4) {
        const pts = (cj.points as Array<[number, number]>);
        const low = pts.reduce((b, q) => (q[1] > b[1] ? q : b), pts[0]!);
        if (!(low[0] >= rc[0]![0] - 1 && low[0] <= rc[3]![0] + 4)) out.push("the lower end of the condenser does not drip into the receiver");
      }
    } else if (p.setup === "filtration") {
      if (!need([["lm", "Mixture"], ["lfn", "Funnel"], ["lp", "Filter paper"], ["lrs", "Residue"], ["lft", "Filtrate"], ["lf", "Flask"]])) return out;
      const fn = pointsOf(shapeBy(result, "fn")?.d);
      const fnPts = (find(result, "fn")?.points as Array<[number, number]> | undefined) ?? fn;
      const [yTop, yBot] = [fnPts[0]![1], fnPts[2]![1]];
      const rs = find(result, "rs");
      if (!rs || !(fnum(rs.cy) > yTop && fnum(rs.cy) < yBot)) out.push("the residue must stay on the paper inside the funnel");
      if (!(t("lrs")!.y > yTop && t("lrs")!.y < yBot + 1)) out.push("the label Residue must be on the paper, inside the funnel");
      const flask = (find(result, "fl")?.points as Array<[number, number]> | undefined) ?? [];
      const ft = (find(result, "ft")?.points as Array<[number, number]> | undefined) ?? [];
      if (flask.length === 4 && ft.length === 4 && !(ft[0]![1] > flask[0]![1] && ft[0]![1] > yBot)) out.push("the filtrate must be in the flask below the funnel");
      if (!(t("lft")!.y > yBot)) out.push("the label Filtrate must be below the funnel");
      const pm = find(result, "pm");
      if (!pm || !(fnum(pm.y2) > fnum(pm.y1))) out.push("the mixture must be poured down into the funnel");
      const st = find(result, "st");
      if (!st || !(flask.length === 4 && fnum(st.y) + fnum(st.h) > flask[0]![1])) out.push("the stem of the funnel must reach into the neck of the flask");
      else if (!near(fnum(st.y), yBot, 0.3)) out.push("the stem must start where the cone of the funnel ends");
    } else if (p.setup === "titration") {
      if (!need([["lb", "Burette"], ["ltp", "Tap"], ["lf", "Conical flask"]])) return out;
      const bu = find(result, "bu");
      const tp = find(result, "tp");
      const fk = (find(result, "fk")?.points as Array<[number, number]> | undefined) ?? [];
      if (!bu || !tp || fk.length !== 4) return [...out, "the burette, its tap or the flask is missing"];
      if (!(fnum(bu.y) + fnum(bu.h) <= fnum(tp.y) + 0.2 && fnum(tp.y) + fnum(tp.h) <= fk[0]![1])) out.push("the order from top must be the burette, its tap, then the flask");
      const ti = find(result, "tt");
      if (!ti || !(fnum(ti.x1) > fk[0]![0] && fnum(ti.x1) < fk[1]![0])) out.push("the tip of the burette must be over the mouth of the flask");
      const bl = find(result, "bl");
      if (!bl || !(fnum(bl.y) >= fnum(bu.y) && fnum(bl.y) + fnum(bl.h) <= fnum(bu.y) + fnum(bu.h))) out.push("the liquid must be inside the burette");
    } else {
      const wantedMethod = methodFor(p.gas!, p.method as Collection | undefined);
      if (!need([["lf", "Flask"], ["ld", "Delivery tube"], ["lj", `${p.gas} jar`], wantedMethod === "over_water" ? ["lw", "Water trough"] : ["la", "Air out"]])) return out;
      const jr = pointsOf(shapeBy(result, "jr")?.d);
      const tb = pointsOf(shapeBy(result, "tb")?.d);
      if (jr.length !== 4 || tb.length < 3) return [...out, "the jar or the delivery tube is missing"];
      const openBottom = jr[0]![1] > jr[1]![1];
      const [yt, yb] = [Math.min(jr[1]![1], jr[0]![1]), Math.max(jr[0]![1], jr[3]![1])];
      const end = tb.at(-1)!;
      const inside = end[0] > Math.min(jr[0]![0], jr[3]![0]) && end[0] < Math.max(jr[0]![0], jr[3]![0]);
      const trough = find(result, "tr");
      const drawn: Collection = trough ? "over_water" : openBottom ? "air_downward" : "air_upward";
      const want = methodFor(p.gas!, p.method as Collection | undefined);
      if (drawn !== want) out.push(`the drawing is ${METHOD_WORD[drawn]} and the request is ${METHOD_WORD[want]}`);
      const why = collectionProblem(p.gas!, drawn);
      if (why) out.push(why);
      if (!inside) out.push("the delivery tube must end inside the jar");
      else if (drawn === "air_upward" && !(end[1] > (yt + yb) / 2)) out.push("for a heavy gas the delivery tube must reach the bottom of the upright jar");
      else if (drawn === "air_downward" && !(end[1] < (yt + yb) / 2)) out.push("for a light gas the delivery tube must reach the top of the inverted jar");
      else if (drawn === "over_water" && trough && !(end[1] < fnum(trough.y))) out.push("the tube must end in the gas above the water inside the jar");
      const ae = find(result, "ae");
      if (drawn !== "over_water" && (!ae || (fnum(ae.y2) < fnum(ae.y1)) !== (drawn === "air_upward"))) out.push("the air must leave the jar upwards when a heavy gas fills it from below, and downwards when a light gas fills it from above");
    }
    return out.slice(0, 3);
  },
});
