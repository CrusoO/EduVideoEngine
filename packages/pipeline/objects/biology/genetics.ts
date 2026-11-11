import type { DrawResult } from "../registry";
import { at, bioDrawer, byId, idsLike, near, readSegs, segsD, textOf, type Pt } from "./bkit";
import {
  ABO_GROUPS, AA3, CODON_TABLE, HBONDS, INCOMPLETE, PED_NAMES, STAGE_NAMES, TRAITS, aboAllelesOf, aboGroup, aboJoin, chromatidsIn, chromosomesIn, codonsOf, complementDNA, gametes, gcContent, genotypeOrder,
  incompleteJoin, joinGametes, pedAffected, pedCarrier, pedChance, phenotypeCounts, phenotypeOf, proteinOf, ratioText, rodLength, square, stageFigures, stagePlan, tally, toRNA, childProblem, type StagePlan,
} from "./compute";
import type { Readout } from "../physics/kit";
import { r1, sig } from "../physics/kit";

/**
 * Wave 4, heredity and the molecules of heredity (ADR 0111): Punnett squares with their computed ratios, pedigrees whose shading is worked out from the genotypes, the stages of mitosis and
 * meiosis with the chromosomes counted, the structure of DNA and RNA, and transcription and translation from a sequence. Every figure reads itself back from the drawn text and lines: a cell of a
 * square must be the join of the gametes drawn at the head of its row and column, the shading of a pedigree must be what the genotype written under each symbol gives, the rods of a dividing
 * cell are counted again, a drawn base must be paired with its complement, and each codon must read to the amino acid the code gives.
 */
const yn = (b: boolean): string => (b ? "yes" : "no");
const NAME = (id: string): string => (TRAITS as Record<string, { dom: string; rec: string }>)[id]!.dom;

// ---- Punnett squares ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
type PunnettP =
  | { mode: "mono"; trait: keyof typeof TRAITS; p1: string; p2: string }
  | { mode: "dihybrid"; trait1: keyof typeof TRAITS; trait2: keyof typeof TRAITS; p1: string; p2: string }
  | { mode: "incomplete"; p1: string; p2: string }
  | { mode: "abo"; p1: string; p2: string }
  | { mode: "sex" };
type Sq = { top: string[]; side: string[]; cells: string[][]; join: (a: string, b: string) => string };
const xjoin = (a: string, b: string): string => (a === "X" || b === "Y" ? a + b : b + a);
function squareOf(p: PunnettP): Sq {
  if (p.mode === "mono") return { ...square([p.p1], [p.p2]), join: joinGametes };
  if (p.mode === "dihybrid") return { ...square([p.p1.slice(0, 2), p.p1.slice(2)], [p.p2.slice(0, 2), p.p2.slice(2)]), join: joinGametes };
  if (p.mode === "incomplete") {
    const top = [...p.p1];
    const side = [...p.p2];
    return { top, side, cells: side.map((s) => top.map((t) => incompleteJoin(t, s))), join: incompleteJoin };
  }
  if (p.mode === "abo") {
    const top = aboAllelesOf(p.p1);
    const side = aboAllelesOf(p.p2);
    return { top, side, cells: side.map((s) => top.map((t) => aboJoin(t, s))), join: aboJoin };
  }
  const top = ["X", "X"];
  const side = ["X", "Y"];
  return { top, side, cells: side.map((s) => top.map((t) => xjoin(t, s))), join: xjoin };
}
const GRID = (cols: number): { ox: number; oy: number; w: number; h: number } => (cols === 4 ? { ox: 16, oy: 9.5, w: 9, h: 5.6 } : { ox: 20, oy: 11, w: 14, h: 9 });

function punnettReadouts(p: PunnettP): Readout[] {
  const sq = squareOf(p);
  const flat = sq.cells.flat();
  if (p.mode === "mono") {
    const t = TRAITS[p.trait];
    const g = tally(sq.cells, genotypeOrder([t.letter]));
    const [d, r] = phenotypeCounts(sq.cells, 1);
    return [{ key: "Genotypes", word: ratioText(g.map((x) => x.n)) }, { key: "Phenotypes", word: ratioText([d!, r!]) }, { key: t.dom, value: d!, unit: "" }, { key: t.rec, value: r!, unit: "" }];
  }
  if (p.mode === "dihybrid") {
    const order = genotypeOrder([TRAITS[p.trait1].letter, TRAITS[p.trait2].letter]);
    return [{ key: "Phenotypes", word: ratioText(phenotypeCounts(sq.cells, 2)) }, { key: "Genotype kinds", value: tally(sq.cells, order).length, unit: "" }];
  }
  if (p.mode === "incomplete") {
    const g = tally(sq.cells, ["RR", "RW", "WW"]);
    return [{ key: "Genotypes", word: ratioText(g.map((x) => x.n)) }, ...g.map((x) => ({ key: INCOMPLETE.names[x.key]!, value: x.n, unit: "" }) as Readout)];
  }
  if (p.mode === "abo") {
    const counts = ABO_GROUPS.map((gp) => ({ gp, n: flat.filter((c) => aboGroup(c) === gp).length })).filter((x) => x.n > 0);
    return [{ key: "Blood groups", word: ratioText(counts.map((x) => x.n)) }, ...counts.map((x) => ({ key: `Group ${x.gp}`, value: x.n, unit: "" }) as Readout)];
  }
  return [{ key: "Daughters", value: flat.filter((c) => c === "XX").length, unit: "" }, { key: "Sons", value: flat.filter((c) => c === "XY").length, unit: "" }, { key: "Ratio", word: ratioText([flat.filter((c) => c === "XX").length, flat.filter((c) => c === "XY").length]) }];
}
export const punnettFigure = bioDrawer("b_punnett", "punnett_square", {
  covers: ["Punnett square, pedigree, inheritance ratios"],
  readouts: (p) => punnettReadouts(p as PunnettP),
  draw(sk, pp) {
    const p = pp as PunnettP;
    const sq = squareOf(p);
    const cols = sq.top.length;
    const g = GRID(cols);
    const A = (u: number, v: number): Pt => at(sk.L, u, v);
    const segs: Array<[number, number, number, number]> = [];
    for (let i = 0; i <= cols; i++) segs.push([...A(g.ox, g.oy + i * g.h), ...A(g.ox + cols * g.w, g.oy + i * g.h)], [...A(g.ox + i * g.w, g.oy), ...A(g.ox + i * g.w, g.oy + cols * g.h)]);
    sk.path("gr", segsD(segs), { width: 0.35, how: "draw" });
    sq.top.forEach((t, j) => sk.text(`h${j}`, ...A(g.ox + (j + 0.5) * g.w, g.oy - 2.2), t, { anchor: "middle", bold: true }));
    sq.side.forEach((s, i) => sk.text(`s${i}`, ...A(g.ox - 1.2, g.oy + (i + 0.5) * g.h), s, { anchor: "end", bold: true }));
    sq.cells.forEach((row, i) => row.forEach((c, j) => sk.text(`c${i}${j}`, ...A(g.ox + (j + 0.5) * g.w, g.oy + (i + 0.5) * g.h), c, { anchor: "middle" })));
  },
  check(result, pp, L) {
    const p = pp as PunnettP;
    const sq = squareOf(p);
    const cols = sq.top.length;
    const g = GRID(cols);
    const out: string[] = [];
    const top = sq.top.map((_, j) => textOf(byId(result, `h${j}`)) ?? "");
    const side = sq.side.map((_, i) => textOf(byId(result, `s${i}`)) ?? "");
    if (top.join("|") !== sq.top.join("|")) out.push(`the gametes along the top are ${top.join(" ")} and should be ${sq.top.join(" ")}`);
    if (side.join("|") !== sq.side.join("|")) out.push(`the gametes down the side are ${side.join(" ")} and should be ${sq.side.join(" ")}`);
    // every cell must be the join of the gametes drawn at the head of its column and the start of its row
    side.forEach((s, i) =>
      top.forEach((t, j) => {
        const c = byId(result, `c${i}${j}`);
        if (textOf(c) !== sq.join(t, s)) out.push(`the cell in row ${i + 1}, column ${j + 1} says "${textOf(c) ?? ""}" and the gametes ${t} and ${s} give ${sq.join(t, s)}`);
        else if (c) {
          const [cx, cy] = at(L, g.ox + (j + 0.5) * g.w, g.oy + (i + 0.5) * g.h);
          if (!near(Number(c.x), cx, 0.1) || !near(Number(c.y), cy, 0.1)) out.push("a cell is not in its place in the grid");
        }
      }));
    const lines = readSegs(byId(result, "gr")?.d);
    if (lines.length !== 2 * (cols + 1)) out.push(`the grid has ${lines.length} lines and a ${cols} by ${cols} square has ${2 * (cols + 1)}`);
    return [...new Set(out)].slice(0, 4);
  },
});

// ---- pedigrees ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
type PedP = { mode: "ad" | "ar" | "xr"; f: string; m: string; n: number } & Record<string, unknown>;
const kids = (p: PedP): Array<{ sex: "M" | "F"; g: string }> => Array.from({ length: p.n }, (_, i) => ({ sex: p[`s${i + 1}`] as "M" | "F", g: p[`g${i + 1}`] as string }));
const kidX = (n: number, i: number): number => (n === 1 ? 30 : 12 + (36 / (n - 1)) * i);
export const pedigreeFigure = bioDrawer("b_pedigree", "pedigree_chart", {
  covers: ["Punnett square, pedigree, inheritance ratios"],
  readouts(pp) {
    const p = pp as unknown as PedP;
    const ks = kids(p);
    const c = pedChance(p.mode, p.f, p.m);
    return [
      { key: "Gene", word: PED_NAMES[p.mode].replace("autosomal dominant", "autosomal dom").replace("autosomal recessive", "autosomal rec").replace("X-linked recessive", "X-linked rec") },
      { key: "Affected children", value: ks.filter((k) => pedAffected(p.mode, k.g)).length, unit: "" },
      { key: "Carriers", value: ks.filter((k) => pedCarrier(p.mode, k.g)).length + (pedCarrier(p.mode, p.m) ? 0 : 0), unit: "" },
      { key: "Chance", value: (100 * c.num) / c.den, unit: "%" },
    ];
  },
  draw(sk, pp) {
    const p = pp as unknown as PedP;
    const A = (u: number, v: number): Pt => at(sk.L, u, v);
    const sym = (id: string, sex: "M" | "F", cx: number, cy: number, g: string): void => {
      const aff = pedAffected(p.mode, g);
      const o = { color: "ink" as const, fill: aff ? ("ink" as const) : ("none" as const), ...(aff ? { fillOpacity: 0.5 } : {}), width: aff ? 0.5 : 0.3 };
      const [x, y] = A(cx, cy);
      if (sex === "M") sk.rect(id, x - 2.5, y - 2.5, 5, 5, o);
      else sk.circle(id, x, y, 2.5, o);
      sk.text(`g${id}`, x, y + 4.6, g, { anchor: "middle" });
    };
    sym("fa", "M", 22, 7, p.f);
    sym("mo", "F", 38, 7, p.m);
    const ks = kids(p);
    ks.forEach((k, i) => sym(`k${i}`, k.sex, kidX(p.n, i), 25, k.g));
    const segs: Array<[number, number, number, number]> = [[...A(24.5, 7), ...A(35.5, 7)], [...A(30, 7), ...A(30, 15.5)]];
    if (p.n > 1) segs.push([...A(kidX(p.n, 0), 15.5), ...A(kidX(p.n, p.n - 1), 15.5)]);
    ks.forEach((_, i) => segs.push([...A(kidX(p.n, i), 15.5), ...A(kidX(p.n, i), 22.5)]));
    sk.path("ln", segsD(segs), { width: 0.3, how: "draw" });
  },
  check(result, pp, L) {
    const p = pp as unknown as PedP;
    const out: string[] = [];
    const g = (id: string): string => textOf(byId(result, `g${id}`)) ?? "";
    const aff = (id: string): boolean => {
      const s = byId(result, id);
      return !!s && s.fill !== "none";
    };
    const sexOf = (id: string): string => (byId(result, id)?.kind === "rect" ? "M" : byId(result, id)?.kind === "circle" ? "F" : "?");
    if (sexOf("fa") !== "M" || sexOf("mo") !== "F") out.push("the father is a square and the mother a circle");
    if (g("fa") !== p.f || g("mo") !== p.m) out.push("the parents' genotypes are not those asked for");
    const ks = kids(p);
    // the shading of every symbol is worked out again from the genotype written under it
    ["fa", "mo", ...ks.map((_, i) => `k${i}`)].forEach((id) => {
      if (aff(id) !== pedAffected(p.mode, g(id))) out.push(`${id === "fa" ? "the father" : id === "mo" ? "the mother" : `child ${Number(id.slice(1)) + 1}`} is ${aff(id) ? "shaded" : "not shaded"} and the genotype ${g(id)} says ${aff(id) ? "not affected" : "affected"}`);
    });
    ks.forEach((k, i) => {
      const id = `k${i}`;
      if (sexOf(id) !== k.sex) out.push(`child ${i + 1} is drawn as the wrong sex`);
      if (g(id) !== k.g) out.push(`child ${i + 1} has the genotype ${g(id)} and ${k.g} was asked for`);
      const why = childProblem(p.mode, g("fa"), g("mo"), sexOf(id) as "M" | "F", g(id));
      if (why) out.push(`child ${i + 1}: ${why}`);
    });
    const lines = readSegs(byId(result, "ln")?.d);
    const want = 2 + (p.n > 1 ? 1 : 0) + p.n;
    if (lines.length !== want) out.push(`${lines.length} lines were drawn and the chart needs ${want}`);
    else ks.forEach((_, i) => {
      const x = at(L, kidX(p.n, i), 0)[0];
      if (!lines.some((s) => near(s[0], x, 0.15) && near(s[2], x, 0.15) && s[3] > s[1])) out.push(`child ${i + 1} is not joined to its parents`);
    });
    return [...new Set(out)].slice(0, 4);
  },
});

// ---- the stages of cell division --------------------------------------------------------------------------------------------------------------------------------------------------------
const CELLS: Record<number, Array<[number, number, number]>> = { 1: [[30, 18.5, 15]], 2: [[17, 18.5, 12.5], [43, 18.5, 12.5]], 4: [[16, 9.5, 8], [44, 9.5, 8], [16, 25.5, 8], [44, 25.5, 8]] };
/** The centre of each group of chromosomes in picture units: the middle of its cell, or a third of the way to its pole at anaphase. */
const groupX = (plan: StagePlan, k: number): number => CELLS[plan.cells]![plan.groups[k]!.cell]![0] + plan.groups[k]!.side * 7.5;
function rods(plan: StagePlan, k: number): Array<[number, number, number, number]> {
  const gr = plan.groups[k]!;
  const [, cy] = CELLS[plan.cells]![gr.cell]!;
  const gx = groupX(plan, k);
  const segs: Array<[number, number, number, number]> = [];
  const draw = (x: number, y: number, pair: number): void => {
    const len = rodLength(pair);
    if (gr.chromatids === 2) segs.push([x - len / 2, y - 0.5, x + len / 2, y - 0.5], [x - len / 2, y + 0.5, x + len / 2, y + 0.5], [x, y - 0.5, x, y + 0.5]);
    else segs.push([x - len / 2, y, x + len / 2, y]);
  };
  if (plan.paired) {
    const k2 = gr.pairs.length / 2;
    for (let i = 0; i < k2; i++) {
      const y = cy + (i - (k2 - 1) / 2) * 3.6;
      draw(gx - 3.8, y, i);
      draw(gx + 3.8, y, i);
    }
  } else gr.pairs.forEach((pair, i) => draw(gx, cy + (i - (gr.pairs.length - 1) / 2) * 3.2, pair));
  return segs;
}
const divStage = (p: { mode: "mitosis" | "meiosis"; stage: string; d: number }): StagePlan => stagePlan(p.mode, p.stage, p.d);
export const divisionFigure = bioDrawer("b_division", "cell_division_stage", {
  covers: ["Mitosis, meiosis, chromosome stages"],
  readouts(p) {
    const plan = divStage(p);
    const f = stageFigures(plan);
    return [{ key: "Chromosomes", value: f.chromosomes, unit: "" }, { key: "Chromatids", value: f.chromatids, unit: "" }, { key: "DNA per cell", word: `${plan.dna}C` }, { key: "Cells", value: plan.cells, unit: "" }];
  },
  draw(sk, p) {
    const plan = divStage(p);
    CELLS[plan.cells]!.forEach(([cx, cy, r], i) => sk.circle(`cell${i}`, ...at(sk.L, cx, cy), r, { fill: "yellow", fillOpacity: 0.15, width: 0.4 }));
    plan.groups.forEach((_, k) => sk.path(`k${k}`, segsD(rods(plan, k).map(([a, b, c, d]) => [...at(sk.L, a, b), ...at(sk.L, c, d)] as [number, number, number, number])), { width: 0.5, color: "ink", how: "draw" }));
    sk.text("st", ...at(sk.L, 30, 35.6), STAGE_NAMES[p.stage]!, { anchor: "middle", bold: true });
  },
  check(result, p, L) {
    const plan = divStage(p);
    const out: string[] = [];
    const cells = result.shapes.filter((s) => s.kind === "circle" && /_cell\d$/.test(String(s.id)));
    if (cells.length !== plan.cells) out.push(`${cells.length} cells were drawn and this stage has ${plan.cells}`);
    if (textOf(byId(result, "st")) !== STAGE_NAMES[p.stage]) out.push("the stage is not named");
    plan.groups.forEach((gr, k) => {
      const segs = readSegs(byId(result, `k${k}`)?.d);
      const horiz = segs.filter((s) => near(s[1], s[3], 0.01) && Math.abs(s[2] - s[0]) > 1);
      const bridges = segs.filter((s) => near(s[0], s[2], 0.01) && Math.abs(s[3] - s[1]) < 1.5);
      const chromatids = horiz.length;
      const chromosomes = chromatids - bridges.length;
      if (chromosomes !== chromosomesIn(gr) || chromatids !== chromatidsIn(gr)) out.push(`group ${k + 1} shows ${chromosomes} chromosomes of ${chromatids} chromatids and the stage needs ${chromosomesIn(gr)} and ${chromatidsIn(gr)}`);
      // the rods of a pair are one length and each pair has its own: homologues stay together or are shared out as the stage says
      const lens = horiz.map((s) => r1(Math.abs(s[2] - s[0]))).sort((a, b) => a - b);
      const wantLens = gr.pairs.flatMap((pair) => Array(gr.chromatids).fill(rodLength(pair)) as number[]).sort((a, b) => a - b);
      if (lens.join() !== wantLens.join()) out.push(`group ${k + 1} has the wrong chromosomes: the homologous pairs are not kept or shared as this stage says`);
      const cell = CELLS[plan.cells]![gr.cell]!;
      const [cx, cy] = at(L, cell[0], cell[1]);
      const xs = segs.flatMap((s) => [s[0], s[2]]);
      const ys = segs.flatMap((s) => [s[1], s[3]]);
      if (segs.length > 0 && (Math.hypot(Math.min(...xs) - cx, Math.min(...ys) - cy) > cell[2] || Math.hypot(Math.max(...xs) - cx, Math.max(...ys) - cy) > cell[2])) out.push(`group ${k + 1} is outside its cell`);
      const mx = (Math.min(...xs) + Math.max(...xs)) / 2;
      if (segs.length > 0 && Math.sign(Math.round((mx - cx) * 10) / 10) !== gr.side && !(gr.side === 0 && Math.abs(mx - cx) < 3)) out.push(`group ${k + 1} is on the wrong side of the cell`);
      if (plan.paired) {
        const rowsY = new Set(horiz.map((s) => s[1])).size;
        if (rowsY > gr.pairs.length / 2 * 2) out.push("homologues are not paired side by side");
      }
    });
    return [...new Set(out)].slice(0, 4);
  },
});

// ---- DNA and RNA ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
const rowY = (i: number): number => 6.5 + i * 3.3;
export const dnaFigure = bioDrawer("b_dna", "nucleic_acid_structure", {
  covers: ["DNA helix, replication, transcription, translation from a sequence"],
  readouts(p) {
    if (p.mode === "dna") return [{ key: "Base pairs", value: p.seq.length, unit: "" }, { key: "GC content", value: gcContent(p.seq), unit: "%" }, { key: "Hydrogen bonds", value: [...p.seq].reduce((s, c) => s + HBONDS[c]!, 0), unit: "" }];
    return [{ key: "Bases", value: p.seq.length, unit: "" }, { key: "GC content", value: gcContent(p.seq), unit: "%" }, { key: "Strands", value: 1, unit: "" }, { key: "Sugar", word: "ribose" }];
  },
  draw(sk, p) {
    const A = (u: number, v: number): Pt => at(sk.L, u, v);
    const n = p.seq.length;
    const end = rowY(n - 1) + 2.4;
    if (p.mode === "dna") {
      sk.line("bl", ...A(20, 3.5), ...A(20, end), { width: 0.5 });
      sk.line("br", ...A(40, 3.5), ...A(40, end), { width: 0.5 });
      const dashes: Array<[number, number, number, number]> = [];
      [...p.seq].forEach((c, i) => {
        const k = HBONDS[c]!;
        const xs = k === 2 ? [27, 33] : [25, 30, 35];
        xs.forEach((x) => dashes.push([...A(x - 1.2, rowY(i)), ...A(x + 1.2, rowY(i))]));
      });
      sk.path("hb", segsD(dashes), { width: 0.4, how: "draw" });
      [...p.seq].forEach((c, i) => {
        sk.text(`a${i}`, ...A(15.5, rowY(i)), c, { anchor: "middle", bold: true });
        sk.text(`b${i}`, ...A(44.5, rowY(i)), complementDNA(c), { anchor: "middle", bold: true });
      });
      sk.text("e0", ...A(20, 1.5), "5'", { anchor: "middle" });
      sk.text("e1", ...A(20, end + 2.2), "3'", { anchor: "middle" });
      sk.text("e2", ...A(40, 1.5), "3'", { anchor: "middle" });
      sk.text("e3", ...A(40, end + 2.2), "5'", { anchor: "middle" });
    } else {
      sk.line("bl", ...A(26, 3.5), ...A(26, end), { width: 0.5 });
      sk.path("tk", segsD([...p.seq].map((_, i) => [...A(26.5, rowY(i)), ...A(31, rowY(i))] as [number, number, number, number])), { width: 0.4, how: "draw" });
      [...p.seq].forEach((c, i) => sk.text(`a${i}`, ...A(34.5, rowY(i)), c, { anchor: "middle", bold: true }));
      sk.text("e0", ...A(26, 1.5), "5'", { anchor: "middle" });
      sk.text("e1", ...A(26, end + 2.2), "3'", { anchor: "middle" });
    }
  },
  check(result, p, L) {
    const out: string[] = [];
    const n = p.seq.length;
    const left = Array.from({ length: n }, (_, i) => textOf(byId(result, `a${i}`)) ?? "");
    if (left.join("") !== p.seq) out.push(`the strand reads ${left.join("")} and ${p.seq} was asked for`);
    if (p.mode === "rna") {
      if (left.some((c) => !"ACGU".includes(c))) out.push("RNA has the bases A, C, G and U only");
      if (readSegs(byId(result, "tk")?.d).length !== n) out.push("each base needs its short bond to the backbone");
      if (!byId(result, "bl")) out.push("the backbone is missing");
      if (byId(result, "br")) out.push("RNA is a single strand: a second backbone is drawn");
      if (textOf(byId(result, "e0")) !== "5'" || textOf(byId(result, "e1")) !== "3'") out.push("the ends of the strand are not named 5' and 3'");
      return out.slice(0, 3);
    }
    if (left.some((c) => !"ACGT".includes(c))) out.push("DNA has the bases A, C, G and T only");
    const dashes = readSegs(byId(result, "hb")?.d);
    left.forEach((c, i) => {
      const r = textOf(byId(result, `b${i}`));
      if (r !== complementDNA(c)) out.push(`base ${i + 1} (${c}) is paired with ${r ?? "nothing"} and pairs with ${complementDNA(c)}`);
      const y = at(L, 0, rowY(i))[1];
      const k = dashes.filter((s) => near(s[1], y, 0.15)).length;
      if (k !== HBONDS[c]) out.push(`the pair ${c} and ${complementDNA(c)} has ${k} hydrogen bonds drawn and should have ${HBONDS[c]}`);
    });
    if (textOf(byId(result, "e0")) !== "5'" || textOf(byId(result, "e1")) !== "3'" || textOf(byId(result, "e2")) !== "3'" || textOf(byId(result, "e3")) !== "5'") out.push("the two strands must run in opposite directions: 5' to 3' down the left and 3' to 5' down the right");
    if (!byId(result, "bl") || !byId(result, "br")) out.push("a backbone is missing");
    return [...new Set(out)].slice(0, 4);
  },
});

// ---- transcription and translation ------------------------------------------------------------------------------------------------------------------------------------------------------
const DOGMA_ROWS = [{ id: "dc", label: "Coding 5'-3'" }, { id: "dt", label: "Template 3'-5'" }, { id: "dm", label: "mRNA 5'-3'" }, { id: "dp", label: "Protein" }] as const;
const dogmaX = (k: number): number => 28 + 6.5 * k;
const dogmaY = (r: number): number => 6 + 8 * r;
export const dogmaFigure = bioDrawer("b_dogma", "transcription_translation", {
  covers: ["DNA helix, replication, transcription, translation from a sequence"],
  readouts(p) {
    const aa = proteinOf(p.seq);
    return [{ key: "Codons", value: aa.length, unit: "" }, { key: "Amino acids", value: aa.filter((x) => x !== "Stop").length, unit: "" }, { key: "GC content", value: gcContent(p.seq), unit: "%" }];
  },
  draw(sk, p) {
    const cod = codonsOf(p.seq);
    const rows = [cod, codonsOf(complementDNA(p.seq)), codonsOf(toRNA(p.seq)), proteinOf(p.seq)];
    DOGMA_ROWS.forEach((r, ri) => sk.text(`rl${ri}`, ...at(sk.L, 0.5, dogmaY(ri)), r.label, { anchor: "start", bold: true }));
    rows.forEach((row, ri) => row.forEach((c, k) => sk.text(`${DOGMA_ROWS[ri]!.id}${k}`, ...at(sk.L, dogmaX(k), dogmaY(ri)), c, { anchor: "middle" })));
  },
  check(result, p, L) {
    const out: string[] = [];
    const n = p.seq.length / 3;
    const get = (id: string, k: number): string => textOf(byId(result, `${id}${k}`)) ?? "";
    DOGMA_ROWS.forEach((r, ri) => {
      if (textOf(byId(result, `rl${ri}`)) !== r.label) out.push(`the name of row ${ri + 1} is not "${r.label}"`);
    });
    for (let k = 0; k < n; k++) {
      const coding = get("dc", k);
      if (coding !== p.seq.slice(3 * k, 3 * k + 3)) out.push(`codon ${k + 1} of the coding strand is ${coding} and ${p.seq.slice(3 * k, 3 * k + 3)} was asked for`);
      if (get("dt", k) !== complementDNA(coding)) out.push(`codon ${k + 1} of the template is ${get("dt", k)} and the complement of ${coding} is ${complementDNA(coding)}`);
      if (get("dm", k) !== toRNA(coding)) out.push(`codon ${k + 1} of the mRNA is ${get("dm", k)} and should be ${toRNA(coding)} (U where the coding strand has T)`);
      const want = CODON_TABLE[get("dc", k)] ?? "?";
      if (get("dp", k) !== want) out.push(`codon ${coding} codes for ${want} and the protein row says ${get("dp", k)}`);
      for (let r = 0; r < 4; r++) {
        const s = byId(result, `${DOGMA_ROWS[r]!.id}${k}`);
        if (s && !near(Number(s.x), at(L, dogmaX(k), 0)[0], 0.05)) out.push(`codon ${k + 1} is not in its column in every row`);
      }
    }
    if (!Object.values(AA3).includes(get("dp", 0))) out.push("the first amino acid is not one of the twenty or Stop");
    return [...new Set(out)].slice(0, 4);
  },
});
export { idsLike, sig, yn, NAME, gametes, phenotypeOf };
export type { DrawResult };
