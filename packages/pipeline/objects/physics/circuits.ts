import type { DrawResult } from "../registry";
import { capacitors, circuitNetlist, rcExact, rcSamples, solveNetlist, wheatstone, type CircuitMode, type Element } from "./compute";
import { physicsDrawer } from "./define";
import { checkCurve, drawGraph, niceWindow, parseReadouts, r1, readGraph, shapeBy, type Readout, type Sketch } from "./kit";
import { batteryPath, capacitorPath, dot, len, near, ptsOf, resistorPath, sub, subpaths, unit, type P } from "./kit-b";

/**
 * Circuits (ADR 0109): series, parallel and mixed resistors, Ohm's law, the two-battery circuit of Kirchhoff's rules, capacitors, the RC circuit and the Wheatstone bridge. Own TypeScript
 * for the symbols and the solver (owner decision: no Schemdraw). The symbols are paths between two points; the wires are one path. The read-back does not trust the inputs: it rebuilds
 * the netlist from the DRAWN symbols and wires (which ends touch), takes each value from the number printed beside its symbol, solves that netlist with the same small linear solver,
 * and checks that the printed currents and voltage drops are what the drawn circuit gives, that the arrows point the way the current flows, and that Kirchhoff's current law holds.
 */
type SymKind = "R" | "V" | "C";
type Sym = { id: string; kind: SymKind; a: P; b: P; tag?: string; tagAt?: P; tagAnchor?: "start" | "middle" | "end" };
type Layout = { syms: Sym[]; wires: P[][]; arrows: Array<{ id: string; of: string }>; galvanometer?: { c: P; r: number } };
const symPath = (s: Sym): string => (s.kind === "R" ? resistorPath(s.a, s.b) : s.kind === "C" ? capacitorPath(s.a, s.b) : batteryPath(s.a, s.b));
const mid = (a: P, b: P): P => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
const horizontal = (a: P, b: P): boolean => Math.abs(b[0] - a[0]) > Math.abs(b[1] - a[1]);

function frame(pic: { x: number; y: number; w: number; h: number }) {
  return { X0: pic.x + 2.5, X1: pic.x + pic.w - 5.5, Y0: pic.y + 4.5, Y1: pic.y + pic.h - 2.5 };
}
type F = ReturnType<typeof frame>;
const hTag = (s: Sym): Sym => ({ ...s, tagAt: [mid(s.a, s.b)[0], mid(s.a, s.b)[1] + 3.6], tagAnchor: "middle" });
const vTag = (s: Sym): Sym => ({ ...s, tagAt: [mid(s.a, s.b)[0] - 3, mid(s.a, s.b)[1]], tagAnchor: "end" });
const kindOf = (k: SymKind, n: number): string => (k === "R" ? "R" : k === "C" ? "C" : "E") + n;

/** n elements in a row on the top wire, the cell on the left and the wire back along the bottom. */
function seriesLayout(f: F, n: number, kind: SymKind, tags: string[]): Layout {
  const slot = (f.X1 - f.X0 - 1) / n;
  const ids = ["ra", "rb", "rc"];
  const syms: Sym[] = [{ id: "bt", kind: "V", a: [f.X0, f.Y1], b: [f.X0, f.Y0] }];
  const wires: P[][] = [];
  let prev: P = [f.X0, f.Y0];
  for (let i = 0; i < n; i++) {
    const a: P = [f.X0 + 0.5 + i * slot + 1.5, f.Y0];
    const b: P = [f.X0 + 0.5 + (i + 1) * slot - 1.5, f.Y0];
    syms.push(hTag({ id: kind === "C" ? `c${"abc"[i]}` : ids[i]!, kind, a, b, tag: tags[i] ?? kindOf(kind, i + 1) }));
    wires.push([prev, a]);
    prev = b;
  }
  wires.push([prev, [f.X1, f.Y0], [f.X1, f.Y1], [f.X0, f.Y1]]);
  return { syms, wires, arrows: kind === "R" ? [{ id: "ia", of: syms[1]!.id }] : [] };
}
/** n elements side by side between the top and the bottom wire, the cell on the left. */
function parallelLayout(f: F, n: number, kind: SymKind, tags: string[]): Layout {
  const xs = Array.from({ length: n }, (_, i) => f.X0 + (f.X1 - f.X0) * (n === 3 ? [0.42, 0.68, 0.94][i]! : [0.55, 0.9][i]!));
  const ids = ["ra", "rb", "rc"];
  const syms: Sym[] = [{ id: "bt", kind: "V", a: [f.X0, f.Y1], b: [f.X0, f.Y0] }];
  xs.forEach((x, i) => syms.push(vTag({ id: kind === "C" ? `c${"abc"[i]}` : ids[i]!, kind, a: [x, f.Y0], b: [x, f.Y1], tag: tags[i] ?? kindOf(kind, i + 1) })));
  const wires: P[][] = [[[f.X0, f.Y0], ...xs.map((x): P => [x, f.Y0])], [...xs.map((x): P => [x, f.Y1]).reverse(), [f.X0, f.Y1]]];
  return { syms, wires, arrows: kind === "R" ? xs.map((_, i) => ({ id: `i${"abc"[i]}`, of: ids[i]! })) : [] };
}
function mixedLayout(f: F): Layout {
  const w = f.X1 - f.X0;
  const [r1a, r1b, x2, x3] = [f.X0 + 1.5, f.X0 + 0.4 * w, f.X0 + 0.66 * w, f.X1];
  const syms: Sym[] = [
    { id: "bt", kind: "V", a: [f.X0, f.Y1], b: [f.X0, f.Y0] },
    hTag({ id: "ra", kind: "R", a: [r1a, f.Y0], b: [r1b, f.Y0], tag: "R1" }),
    vTag({ id: "rb", kind: "R", a: [x2, f.Y0], b: [x2, f.Y1], tag: "R2" }),
    vTag({ id: "rc", kind: "R", a: [x3, f.Y0], b: [x3, f.Y1], tag: "R3" }),
  ];
  const wires: P[][] = [[[f.X0, f.Y0], [r1a, f.Y0]], [[r1b, f.Y0], [x2, f.Y0], [x3, f.Y0]], [[x3, f.Y1], [x2, f.Y1], [f.X0, f.Y1]]];
  return { syms, wires, arrows: [{ id: "ia", of: "ra" }, { id: "ib", of: "rb" }, { id: "ic", of: "rc" }] };
}
function twoLoopLayout(f: F): Layout {
  const xm = (f.X0 + f.X1) / 2;
  const syms: Sym[] = [
    { ...{ id: "bt", kind: "V" as const, a: [f.X0, f.Y1] as P, b: [f.X0, f.Y0] as P }, tag: "E1", tagAt: [f.X0 + 3, (f.Y0 + f.Y1) / 2], tagAnchor: "start" },
    { id: "b2", kind: "V", a: [f.X1, f.Y1], b: [f.X1, f.Y0], tag: "E2", tagAt: [f.X1 - 3, (f.Y0 + f.Y1) / 2], tagAnchor: "end" },
    hTag({ id: "ra", kind: "R", a: [f.X0 + 1.5, f.Y0], b: [xm - 1.5, f.Y0], tag: "R1" }),
    hTag({ id: "rb", kind: "R", a: [f.X1 - 1.5, f.Y0], b: [xm + 1.5, f.Y0], tag: "R2" }),
    vTag({ id: "rc", kind: "R", a: [xm, f.Y0], b: [xm, f.Y1], tag: "R3" }),
  ];
  const wires: P[][] = [[[f.X0, f.Y0], [f.X0 + 1.5, f.Y0]], [[f.X1, f.Y0], [f.X1 - 1.5, f.Y0]], [[xm - 1.5, f.Y0], [xm, f.Y0], [xm + 1.5, f.Y0]], [[f.X0, f.Y1], [xm, f.Y1], [f.X1, f.Y1]]];
  return { syms, wires, arrows: [{ id: "ia", of: "ra" }, { id: "ib", of: "rb" }, { id: "ic", of: "rc" }] };
}
function ohmLayout(f: F): Layout {
  const syms: Sym[] = [{ id: "bt", kind: "V", a: [f.X0, f.Y1], b: [f.X0, f.Y0] }, { id: "ra", kind: "R", a: [f.X1, f.Y0], b: [f.X1, f.Y1], tag: "R", tagAt: [f.X1 - 3, (f.Y0 + f.Y1) / 2], tagAnchor: "end" }];
  return { syms, wires: [[[f.X0, f.Y0], [f.X1, f.Y0]], [[f.X1, f.Y1], [f.X0, f.Y1]]], arrows: [{ id: "ia", of: "ra" }] };
}
function bridgeLayout(f: F): Layout {
  const cx = (f.X0 + f.X1) / 2 + 4;
  const yc = (f.Y0 + f.Y1) / 2;
  const dx = Math.min(15, (f.X1 - cx) * 0.9);
  const [A, B, C, D] = [[cx, f.Y0], [cx - dx, yc], [cx + dx, yc], [cx, f.Y1]] as [P, P, P, P];
  const side = (id: string, a: P, b: P, tag: string, dxTag: number, dyTag: number): Sym => ({ id, kind: "R", a, b, tag, tagAt: [mid(a, b)[0] + dxTag, mid(a, b)[1] + dyTag], tagAnchor: dxTag < 0 ? "end" : "start" });
  const syms: Sym[] = [{ id: "bt", kind: "V", a: [f.X0, f.Y1], b: [f.X0, f.Y0] }, side("ra", A, B, "P", -3, -1.4), side("rb", A, C, "Q", 3, -1.4), side("rc", B, D, "R", -3, 1.4), side("rd", C, D, "S", 3, 1.4)];
  const gr = 2.6;
  return { syms, wires: [[[f.X0, f.Y0], A], [D, [f.X0, f.Y1]], [B, [cx - gr, yc]], [[cx + gr, yc], C]], arrows: [], galvanometer: { c: [cx, yc], r: gr } };
}

function drawLayout(sk: Sketch, lay: Layout, currents: Map<string, number>): void {
  sk.path("w", lay.wires.map((w) => w.map(([x, y], i) => `${i === 0 ? "M" : "L"}${Math.round(x * 100) / 100} ${Math.round(y * 100) / 100}`).join("")).join(""), { width: 0.35, how: "draw" });
  for (const s of lay.syms) sk.path(s.id, symPath(s), { width: s.kind === "V" ? 0.45 : 0.4, how: "fade" });
  if (lay.galvanometer) sk.circle("gc", lay.galvanometer.c[0], lay.galvanometer.c[1], lay.galvanometer.r, { width: 0.4 });
  if (lay.galvanometer) sk.text("tg", lay.galvanometer.c[0], lay.galvanometer.c[1], "G", { anchor: "middle" });
  for (const s of lay.syms) if (s.tag && s.tagAt) sk.text(`t${s.id}`, s.tagAt[0], s.tagAt[1], s.tag, { anchor: s.tagAnchor ?? "middle" });
  for (const a of lay.arrows) {
    const s = lay.syms.find((q) => q.id === a.of)!;
    const i = currents.get(a.of) ?? 0;
    const d = unit(sub(s.b, s.a));
    const sgn = i >= 0 ? 1 : -1;
    const c = mid(s.a, s.b);
    const nrm: P = horizontal(s.a, s.b) ? [0, -3.2] : [3.2, 0];
    sk.arrow(a.id, c[0] + nrm[0] - sgn * d[0] * 2.6, c[1] + nrm[1] - sgn * d[1] * 2.6, c[0] + nrm[0] + sgn * d[0] * 2.6, c[1] + nrm[1] + sgn * d[1] * 2.6, { width: 0.4 });
  }
}

// ---- reading a drawn circuit back ----------------------------------------------------------------------------------------------------------------------------------------------------
const key = (p: P): string => `${p[0].toFixed(2)},${p[1].toFixed(2)}`;
type Drawn = { nodes: Map<string, number>; node: (p: P) => number; syms: Array<{ id: string; kind: SymKind; a: P; b: P }> };
/** The nodes of the drawn circuit: every vertex of a wire path is one conductor; each symbol joins its own two ends to whatever wires touch them. */
function readDrawn(r: DrawResult, ids: string[], kinds: Record<string, SymKind>): Drawn | null {
  const parent = new Map<string, string>();
  const find = (k: string): string => {
    if (!parent.has(k)) parent.set(k, k);
    let c = k;
    while (parent.get(c) !== c) c = parent.get(c)!;
    parent.set(k, c);
    return c;
  };
  const join = (a: string, b: string): void => void parent.set(find(a), find(b));
  for (const sp of subpaths(shapeBy(r, "w")?.d)) for (let i = 1; i < sp.length; i++) join(key(sp[0]!), key(sp[i]!));
  const syms: Drawn["syms"] = [];
  for (const id of ids) {
    const p = ptsOf(r, id);
    if (p.length < 2) continue;
    const a = p[0]!;
    const b = p[p.length - 1]!;
    find(key(a));
    find(key(b));
    syms.push({ id, kind: kinds[id]!, a, b });
  }
  if (syms.length !== ids.length) return null;
  const nodes = new Map<string, number>();
  const node = (p: P): number => {
    const root = find(key(p));
    if (!nodes.has(root)) nodes.set(root, nodes.size);
    return nodes.get(root)!;
  };
  return { nodes, node, syms };
}
const within = (shown: number, exact: number): boolean => Math.abs(shown - exact) <= 0.006 * Math.abs(exact) + 1e-12;

// ---- Ohm's law and Kirchhoff ------------------------------------------------------------------------------------------------------------------------------------------------------------
const ORDER: Record<CircuitMode, string[]> = { ohm: ["bt", "ra"], series: ["bt", "ra", "rb", "rc"], parallel: ["bt", "ra", "rb", "rc"], mixed: ["bt", "ra", "rb", "rc"], two_loop: ["bt", "ra", "rc", "b2", "rb"] };
type CircuitP = { mode: CircuitMode; volts: number; r1: number; r2?: number; r3?: number; volts2?: number };
const solveP = (p: CircuitP) => solveNetlist(circuitNetlist(p));
const layoutOf = (mode: CircuitMode, f: F): Layout => (mode === "ohm" ? ohmLayout(f) : mode === "series" ? seriesLayout(f, 3, "R", ["R1", "R2", "R3"]) : mode === "parallel" ? parallelLayout(f, 3, "R", ["R1", "R2", "R3"]) : mode === "mixed" ? mixedLayout(f) : twoLoopLayout(f));
/** The current in each resistor symbol (by id), in the direction a to b of the symbol, from the solved netlist. */
function currentsOf(p: CircuitP): Map<string, number> {
  const sol = solveP(p);
  const out = new Map<string, number>();
  ORDER[p.mode].forEach((id, k) => out.set(id, sol.parts[k]!.current));
  return out;
}
const NAMES: Record<string, string> = { ra: "R1", rb: "R2", rc: "R3" };
export const circuitFigure = physicsDrawer("p_circuit", "circuit_diagram", {
  covers: ["Circuit diagrams: series, parallel, Ohm's law"],
  readouts(p) {
    const sol = solveP(p);
    const cur = currentsOf(p);
    const R = (k: number): number => (sol.parts[k] as Extract<Element, { kind: "R" }>).ohm;
    const a = (id: string): number => Math.abs(cur.get(id)!);
    const drop = (id: string): number => Math.abs(sol.parts[ORDER[p.mode].indexOf(id)]!.drop);
    const eq = p.volts / Math.abs(sol.parts[0]!.current);
    switch (p.mode) {
      case "ohm": return [{ key: "V", value: p.volts, unit: "V" }, { key: "R", value: p.r1, unit: "ohm" }, { key: "I", value: a("ra"), unit: "A" }, { key: "P", value: p.volts * a("ra"), unit: "W" }];
      case "series": return [{ key: "V", value: p.volts, unit: "V" }, { key: "R1", value: R(1), unit: "ohm" }, { key: "R2", value: R(2), unit: "ohm" }, { key: "R3", value: R(3), unit: "ohm" }, { key: "Req", value: eq, unit: "ohm" }, { key: "I", value: a("ra"), unit: "A" }, { key: "V1", value: drop("ra"), unit: "V" }, { key: "V2", value: drop("rb"), unit: "V" }, { key: "V3", value: drop("rc"), unit: "V" }];
      case "parallel": return [{ key: "V", value: p.volts, unit: "V" }, { key: "R1", value: R(1), unit: "ohm" }, { key: "R2", value: R(2), unit: "ohm" }, { key: "R3", value: R(3), unit: "ohm" }, { key: "Req", value: eq, unit: "ohm" }, { key: "I1", value: a("ra"), unit: "A" }, { key: "I2", value: a("rb"), unit: "A" }, { key: "I3", value: a("rc"), unit: "A" }, { key: "I", value: Math.abs(sol.parts[0]!.current), unit: "A" }];
      case "mixed": return [{ key: "V", value: p.volts, unit: "V" }, { key: "R1", value: R(1), unit: "ohm" }, { key: "R2", value: R(2), unit: "ohm" }, { key: "R3", value: R(3), unit: "ohm" }, { key: "Req", value: eq, unit: "ohm" }, { key: "I", value: a("ra"), unit: "A" }, { key: "I2", value: a("rb"), unit: "A" }, { key: "I3", value: a("rc"), unit: "A" }];
      case "two_loop": return [{ key: "E1", value: p.volts, unit: "V" }, { key: "E2", value: p.volts2!, unit: "V" }, { key: "R1", value: R(1), unit: "ohm" }, { key: "R2", value: R(4), unit: "ohm" }, { key: "R3", value: R(2), unit: "ohm" }, { key: "I1", value: a("ra"), unit: "A" }, { key: "I2", value: a("rb"), unit: "A" }, { key: "I3", value: a("rc"), unit: "A" }];
    }
  },
  draw(sk, p) {
    drawLayout(sk, layoutOf(p.mode, frame(sk.L.pic)), currentsOf(p));
  },
  check(r, p) {
    const lay = layoutOf(p.mode, frame({ x: 0, y: 0, w: 1, h: 1 }));
    const ids = lay.syms.map((s) => s.id);
    const kinds = Object.fromEntries(lay.syms.map((s) => [s.id, s.kind]));
    const drawn = readDrawn(r, ids, kinds);
    if (!drawn) return ["a symbol of the circuit is missing"];
    const out: string[] = [];
    const rd = parseReadouts(r);
    const val = (k: string): number | undefined => rd.get(k)?.value;
    // the names printed beside the symbols are the names the read-outs use
    const nameOf = (id: string): string => (id === "bt" ? (p.mode === "two_loop" ? "E1" : "V") : id === "b2" ? "E2" : p.mode === "ohm" ? "R" : NAMES[id]!);
    for (const s of lay.syms) if (s.tag) if (shapeBy(r, `t${s.id}`)?.text !== s.tag) out.push(`the tag of ${s.id} is not ${s.tag}`);
    // rebuild the netlist from the drawing; the numbers are the ones printed
    const els: Element[] = [];
    const idx = new Map<string, number>();
    const ground = drawn.node(drawn.syms.find((s) => s.id === "bt")!.a); // the minus end of the first cell is the reference
    const num = new Map<number, number>([[ground, 0]]);
    const mapNode = (n: number): number => {
      if (!num.has(n)) num.set(n, num.size);
      return num.get(n)!;
    };
    for (const s of drawn.syms) {
      const v = val(nameOf(s.id));
      if (v === undefined) {
        out.push(`the value of ${nameOf(s.id)} is not printed`);
        continue;
      }
      idx.set(s.id, els.length);
      els.push(s.kind === "V" ? { kind: "V", plus: mapNode(drawn.node(s.b)), minus: mapNode(drawn.node(s.a)), volts: v } : { kind: "R", a: mapNode(drawn.node(s.a)), b: mapNode(drawn.node(s.b)), ohm: v });
    }
    if (out.length) return out;
    let sol;
    try {
      sol = solveNetlist(els);
    } catch {
      return [...out, "the drawn circuit has no unique solution (a wire is missing or a loop is open)"];
    }
    if (sol.residual > 1e-9 * Math.max(1, ...sol.parts.map((q) => Math.abs(q.current)))) out.push("Kirchhoff's current law fails at a node of the drawn circuit");
    const cur = (id: string): number => sol.parts[idx.get(id)!]!.current;
    const drop = (id: string): number => sol.parts[idx.get(id)!]!.drop;
    const want = (k: string, v: number): void => {
      const shown = val(k);
      if (shown === undefined) out.push(`${k} is not printed`);
      else if (!within(shown, v)) out.push(`${k} is printed as ${shown} and the drawn circuit gives ${v.toPrecision(3)}`);
    };
    const eq = Math.abs((els[idx.get("bt")!] as Extract<Element, { kind: "V" }>).volts / (sol.parts[idx.get("bt")!]!.current || NaN));
    switch (p.mode) {
      case "ohm": want("I", Math.abs(cur("ra"))); want("P", Math.abs(cur("ra")) * (val("V") ?? NaN)); break;
      case "series": want("I", Math.abs(cur("ra"))); want("Req", eq); for (const [k, id] of [["V1", "ra"], ["V2", "rb"], ["V3", "rc"]] as const) want(k, Math.abs(drop(id))); break;
      case "parallel": want("Req", eq); want("I", Math.abs(sol.parts[idx.get("bt")!]!.current)); for (const [k, id] of [["I1", "ra"], ["I2", "rb"], ["I3", "rc"]] as const) want(k, Math.abs(cur(id))); break;
      case "mixed": want("Req", eq); want("I", Math.abs(cur("ra"))); want("I2", Math.abs(cur("rb"))); want("I3", Math.abs(cur("rc"))); break;
      case "two_loop": for (const [k, id] of [["I1", "ra"], ["I2", "rb"], ["I3", "rc"]] as const) want(k, Math.abs(cur(id))); break;
    }
    // Ohm's law on every resistor of the drawing, and Kirchhoff's voltage law round the loops (the drops add to the cell)
    for (const s of drawn.syms) if (s.kind === "R" && !near(Math.abs(drop(s.id)), Math.abs(cur(s.id)) * (els[idx.get(s.id)!] as Extract<Element, { kind: "R" }>).ohm, 1e-9 * Math.abs(drop(s.id)) + 1e-12)) out.push("Ohm's law fails on a drawn resistor");
    // each arrow points the way the current flows through its resistor
    for (const a of lay.arrows) {
      const s = drawn.syms.find((q) => q.id === a.of)!;
      const sh = shapeBy(r, a.id);
      if (!sh || sh.kind !== "arrow") {
        out.push(`the arrow ${a.id} is missing`);
        continue;
      }
      const d: P = [Number(sh.x2) - Number(sh.x1), Number(sh.y2) - Number(sh.y1)];
      const c = cur(a.of);
      if (Math.abs(c) > 1e-12 && Math.sign(dot(d, sub(s.b, s.a))) !== Math.sign(c)) out.push(`the arrow ${a.id} points against the current`);
      if (len(d) < 1) out.push(`the arrow ${a.id} is too short to read`);
    }
    return out;
  },
});

// ---- capacitors, the RC circuit and the Wheatstone bridge ------------------------------------------------------------------------------------------------------------------------------------
const N_RC = 48;
type RcP = { mode: "rc"; volts: number; r: number; c: number; direction: "charging" | "discharging"; window_taus: number; y_max?: number };
const rcYWindow = (p: RcP): [number, number] => (p.y_max !== undefined ? [0, p.y_max] : niceWindow(0, p.volts));
const rcWindow = (p: RcP): number => Number((p.window_taus * p.r * p.c).toPrecision(6));
export const circuitAdvFigure = physicsDrawer("p_circuit_adv", "circuit_advanced", {
  covers: ["Advanced circuits: capacitors, RC/LCR, Wheatstone, meter bridge"],
  readouts(p) {
    if (p.mode === "rc") {
      const tau = p.r * p.c;
      const v = rcExact(p.volts, tau, tau, p.direction === "charging");
      const all: Readout[] = [{ key: "V", value: p.volts, unit: "V" }, { key: "R", value: p.r, unit: "ohm" }, { key: "C", value: p.c, unit: "F" }, { key: "tau", value: tau, unit: "s" }, { key: "v at tau", value: v, unit: "V" }, { key: "Mode", word: p.direction }];
      // a figure stacked above another has a third of the stage: only the three read-outs that matter
      return p.compact ? all.slice(3) : all;
    }
    if (p.mode === "wheatstone") {
      const w = wheatstone({ volts: p.volts, p: p.p, q: p.q, r: p.r, s: p.s, g: p.g });
      return [{ key: "V", value: p.volts, unit: "V" }, { key: "P", value: p.p, unit: "ohm" }, { key: "Q", value: p.q, unit: "ohm" }, { key: "R", value: p.r, unit: "ohm" }, { key: "S", value: p.s, unit: "ohm" }, { key: "Rg", value: p.g, unit: "ohm" }, { key: "Ig", value: w.balanced ? 0 : Math.abs(w.galvanometer), unit: "A" }, { key: "Bridge", word: w.balanced ? "balanced" : "not balanced" }];
    }
    const list = [p.c1, p.c2, ...(p.c3 !== undefined ? [p.c3] : [])];
    const c = capacitors(p.arrangement, p.volts, list);
    const out: Readout[] = [{ key: "V", value: p.volts, unit: "V" }, ...list.map((x, i): Readout => ({ key: `C${i + 1}`, value: x, unit: "F" })), { key: "Ceq", value: c.ceq, unit: "F" }, { key: "Q", value: c.q, unit: "C" }];
    if (list.length === 2) out.push({ key: "U", value: c.energy, unit: "J" });
    c.each.forEach((e, i) => out.push(p.arrangement === "series" ? { key: `V${i + 1}`, value: e.v, unit: "V" } : { key: `Q${i + 1}`, value: e.q, unit: "C" }));
    return out.slice(0, 9);
  },
  draw(sk, p) {
    const pic = sk.L.pic;
    if (p.mode === "rc") {
      const tau = p.r * p.c;
      const T = rcWindow(p);
      const charging = p.direction === "charging";
      const ywin = rcYWindow(p);
      const f = drawGraph(sk, { xName: "t", xUnit: "s", yName: "v", yUnit: "V", xwin: [0, T], ywin, series: [{ id: "c0", pts: rcSamples(p.volts, tau, T, N_RC, charging) }] });
      // the time constant: after one tau the capacitor has reached 63.2% of V (charging) or fallen to 36.8% (discharging)
      const vt = rcExact(p.volts, tau, tau, charging);
      sk.path("mk", `M${r1(f.X(tau))} ${r1(f.Y(0))}L${r1(f.X(tau))} ${r1(f.Y(vt))}L${r1(f.l)} ${r1(f.Y(vt))}`, { color: "soft", dash: true, width: 0.25 });
      sk.text("tt", f.X(tau) + 1, f.b - 1.8, "tau", { anchor: "start" });
      return;
    }
    const f = frame(pic);
    if (p.mode === "wheatstone") {
      const lay = bridgeLayout(f);
      drawLayout(sk, lay, new Map());
      return;
    }
    const n = p.c3 !== undefined ? 3 : 2;
    drawLayout(sk, p.arrangement === "series" ? seriesLayout(f, n, "C", ["C1", "C2", "C3"]) : parallelLayout(f, n, "C", ["C1", "C2", "C3"]), new Map());
  },
  check(r, p) {
    const out: string[] = [];
    if (p.mode === "rc") {
      const g = readGraph(r);
      if (!g.ok) return [g.why];
      const tau = p.r * p.c;
      const T = rcWindow(p);
      if (!near(g.xwin[1], T, 1e-9 * T) || g.xwin[0] !== 0) out.push("the time axis is not the window of the inputs");
      const yw = rcYWindow(p);
      if (g.ywin[0] !== 0 || !near(g.ywin[1], yw[1], 1e-9 * yw[1])) out.push("the voltage axis is not the window of the inputs");
      const charging = p.direction === "charging";
      out.push(...checkCurve(g, "c0", (t) => rcExact(p.volts, tau, t, charging), "capacitor voltage", N_RC + 1, (i) => (T * i) / N_RC));
      // the curve is an exponential: a drawn point one tau in is 63.2% of the way (charging) or 36.8% of V (discharging)
      const pts = g.curve("c0");
      const k = Math.round((tau / T) * N_RC);
      const v0 = charging ? 0 : p.volts;
      const vInf = charging ? p.volts : 0;
      if (Math.abs(tau - (T * k) / N_RC) < 0.02 * tau) {
        const frac = (pts[k]![1] - v0) / (vInf - v0);
        if (!near(frac, 1 - Math.exp(-(T * k) / N_RC / tau), 0.012)) out.push("one time constant in, the drawn voltage is not 63.2% of the way");
      }
      const mk = ptsOf(r, "mk");
      if (mk.length !== 3 || !near(g.toX(mk[0]![0]), tau, ((g.xwin[1] - g.xwin[0]) / (g.frame.r - g.frame.l)) * 0.15) || !near(g.toY(mk[1]![1]), rcExact(p.volts, tau, tau, charging), ((g.ywin[1] - g.ywin[0]) / (g.frame.b - g.frame.t)) * 0.15)) out.push("the marker at one time constant is not on the curve");
      return out;
    }
    const f = frame({ x: 0, y: 0, w: 1, h: 1 });
    const rd = parseReadouts(r);
    const val = (k: string): number | undefined => rd.get(k)?.value;
    if (p.mode === "wheatstone") {
      const lay = bridgeLayout(f);
      const ids = lay.syms.map((s) => s.id);
      const drawn = readDrawn(r, ids, Object.fromEntries(lay.syms.map((s) => [s.id, s.kind])));
      const gc = shapeBy(r, "gc");
      const gw = subpaths(shapeBy(r, "w")?.d);
      if (!drawn || !gc || gw.length < 4) return ["a symbol, the galvanometer or a wire is missing"];
      const names: Record<string, string> = { ra: "P", rb: "Q", rc: "R", rd: "S" };
      const ground = drawn.node(drawn.syms.find((s) => s.id === "bt")!.a);
      const num = new Map<number, number>([[ground, 0]]);
      const mapNode = (n: number): number => (num.has(n) ? num.get(n)! : (num.set(n, num.size), num.get(n)!));
      const els: Element[] = [];
      for (const s of drawn.syms) {
        const v = val(s.id === "bt" ? "V" : names[s.id]!);
        if (v === undefined) return [`the value of ${s.id === "bt" ? "V" : names[s.id]} is not printed`];
        els.push(s.kind === "V" ? { kind: "V", plus: mapNode(drawn.node(s.b)), minus: mapNode(drawn.node(s.a)), volts: v } : { kind: "R", a: mapNode(drawn.node(s.a)), b: mapNode(drawn.node(s.b)), ohm: v });
      }
      // the galvanometer is the circle: between the wire that ends at its left edge and the wire that starts at its right edge
      const left = gw.find((s) => Math.abs(s[s.length - 1]![0] - (Number(gc.cx) - Number(gc.r))) < 0.02)!;
      const right = gw.find((s) => Math.abs(s[0]![0] - (Number(gc.cx) + Number(gc.r))) < 0.02)!;
      const rg = val("Rg");
      if (!left || !right || rg === undefined) return ["the galvanometer is not wired between the two middle points"];
      els.push({ kind: "R", a: mapNode(drawn.node(left[0]!)), b: mapNode(drawn.node(right[right.length - 1]!)), ohm: rg });
      let sol;
      try {
        sol = solveNetlist(els);
      } catch {
        return ["the drawn bridge has no unique solution"];
      }
      const ig = sol.parts[els.length - 1]!.current;
      const [P, Q, R, S] = ["P", "Q", "R", "S"].map((k) => val(k) ?? NaN) as [number, number, number, number];
      const balanced = Math.abs(P * S - Q * R) <= 1e-9 * P * S;
      const shown = val("Ig");
      if (shown === undefined || (balanced ? shown !== 0 : !within(shown, Math.abs(ig)))) out.push(`the galvanometer current is printed as ${shown ?? "nothing"} and the drawn bridge gives ${balanced ? 0 : Math.abs(ig).toPrecision(3)}`);
      if (rd.get("Bridge")?.word !== (balanced ? "balanced" : "not balanced")) out.push("the bridge is balanced when P/Q = R/S, and the word printed does not say so");
      if (sol.residual > 1e-9) out.push("Kirchhoff's current law fails in the drawn bridge");
      return out;
    }
    const n = p.c3 !== undefined ? 3 : 2;
    const lay = p.arrangement === "series" ? seriesLayout(f, n, "C", ["C1", "C2", "C3"]) : parallelLayout(f, n, "C", ["C1", "C2", "C3"]);
    const caps = lay.syms.filter((s) => s.kind === "C").map((s) => s.id);
    const drawn = readDrawn(r, lay.syms.map((s) => s.id), Object.fromEntries(lay.syms.map((s) => [s.id, s.kind])));
    if (!drawn) return ["a symbol of the circuit is missing"];
    const cs = drawn.syms.filter((s) => caps.includes(s.id));
    const nodeSets = cs.map((s) => [drawn.node(s.a), drawn.node(s.b)].sort().join("-"));
    const arrangement = nodeSets.every((q) => q === nodeSets[0]) ? "parallel" : "series";
    if (arrangement !== p.arrangement) out.push(`the capacitors are wired in ${arrangement} in the drawing and the inputs say ${p.arrangement}`);
    const values = cs.map((_, i) => val(`C${i + 1}`) ?? NaN);
    const V = val("V") ?? NaN;
    const c = capacitors(arrangement, V, values);
    const want = (k: string, v: number): void => {
      const s = val(k);
      if (s !== undefined && !within(s, v)) out.push(`${k} is printed as ${s} and the drawn capacitors give ${v.toPrecision(3)}`);
    };
    want("Ceq", c.ceq);
    want("Q", c.q);
    want("U", c.energy);
    c.each.forEach((e, i) => (arrangement === "series" ? want(`V${i + 1}`, e.v) : want(`Q${i + 1}`, e.q)));
    if (arrangement === "series" && c.each.every((_, i) => val(`V${i + 1}`) !== undefined) && !within(c.each.reduce((s, _, i) => s + val(`V${i + 1}`)!, 0), V)) out.push("the voltages across the capacitors in series do not add up to the cell's");
    return out;
  },
});
