import type { DrawResult } from "../registry";
import { at, bioDrawer, byId, centreOf, contains, distToBox, textOf, type Pt } from "./bkit";
import { checkFlow, drawFlow, readFlow, type FlowDef } from "./flow";
import { CYCLE_TABLES, HEART_RING, NEPHRON_FLOW, ORGANISMS, PATHWAY_TABLES, SYSTEM_TABLES, TAXA, TREE_TABLES, WEB_TABLES, binomial, carbonIn, flattenTree, heartFlow, mrca, taxonomyFlow, treeFlow, webFacts, RANKS } from "./flows";
import { balanced } from "./compute";
import type { Readout } from "../physics/kit";
import { sig } from "../physics/kit";

/**
 * Wave 4, pathways, cycles and trees as flow diagrams (ADR 0111): the human and plant systems, the heart and double circulation, the nephron, photosynthesis and respiration, the nutrient cycles,
 * food chains and webs, the ranks of classification and trees of descent. Each draws a table of `flows.ts` with the flow engine and reads it back: the label of every box, the box each arrow
 * starts and ends in, and the arrow's colour. On top of that each figure reads back what its own facts say: the carbon in a pathway adds up, the blood is oxygen-rich only between the lungs and
 * the body, a food web has its arrows pointing up to the one that eats, a classification ladder names its genus and species, a common ancestor is the lowest clade that holds both.
 */
const counts = (f: FlowDef): Readout[] => [{ key: "Boxes", value: f.nodes.filter((n) => !n.dot).length, unit: "" }, { key: "Arrows", value: f.edges.length, unit: "" }];

export const systemFigure = bioDrawer("b_system", "system_flow", {
  covers: ["Human digestive system", "Human respiratory system, alveolus", "Neuron, reflex arc, brain", "Human reproductive systems, gametes, cycle graph", "Antibody, immune response, vaccination", "Transport in plants: xylem, phloem, transpiration", "Flower parts, pollination, fertilisation, fruit"],
  readouts(p) {
    const t = SYSTEM_TABLES[p.system];
    return [...counts(t.flow), ...t.words.map((w) => ({ key: w.key, word: w.word }) as Readout)];
  },
  draw: (sk, p) => drawFlow(sk, SYSTEM_TABLES[p.system].flow),
  check: (result, p) => checkFlow(result, SYSTEM_TABLES[p.system].flow),
});

// ---- the heart ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
const CHAMBERS = ["Right atrium", "Right ventricle", "Left atrium", "Left ventricle"];
export const heartFigure = bioDrawer("b_heart", "heart_circulation", {
  covers: ["Heart, blood vessels, double circulation"],
  readouts() {
    const f = heartFlow();
    return [{ key: "Chambers", value: f.nodes.filter((n) => CHAMBERS.includes(n.label)).length, unit: "" }, { key: "Circuits", value: f.nodes.filter((n) => n.label === "Lungs" || n.label === "Body").length, unit: "" }, { key: "Red", word: "oxygen-rich" }, { key: "Purple", word: "oxygen-poor" }];
  },
  draw: (sk) => drawFlow(sk, heartFlow()),
  check(result) {
    const out = checkFlow(result, heartFlow());
    // the colour of the blood follows the lungs: red from the lungs to the body, purple from the body back to the lungs, read from the drawn arrows
    const r = readFlow(result);
    const next = new Map<string, { to: string; tone: string }>();
    r.edges.forEach((e) => next.set(r.labels[e.from] ?? "", { to: r.labels[e.to] ?? "", tone: e.tone }));
    const walk = (from: string, until: string, want: string): void => {
      let at: string = from;
      for (let i = 0; i < HEART_RING.length && at !== until; i++) {
        const e = next.get(at);
        if (!e) return void out.push("a box of the circulation has no arrow leaving it");
        if (e.tone !== want) out.push(`blood leaving ${at} is drawn ${e.tone} and should be ${want}`);
        at = e.to;
      }
    };
    walk("Lungs", "Body", "red");
    walk("Body", "Lungs", "purple");
    return [...new Set(out)].slice(0, 4);
  },
});

// ---- the nephron -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
export const reabsorbed = (filtrate: number, urine: number): number => (100 * (filtrate - urine)) / filtrate;
export const nephronFigure = bioDrawer("b_nephron", "nephron_flow", {
  covers: ["Kidney, nephron"],
  readouts: (p) => [{ key: "Filtrate", value: p.filtrate_l, unit: "L/day" }, { key: "Urine", value: p.urine_l, unit: "L/day" }, { key: "Reabsorbed", value: reabsorbed(p.filtrate_l, p.urine_l), unit: "%" }, { key: "Stages", value: NEPHRON_FLOW.nodes.length - 3, unit: "" }],
  draw: (sk) => drawFlow(sk, NEPHRON_FLOW),
  check: (result) => checkFlow(result, NEPHRON_FLOW),
});

// ---- photosynthesis and respiration -------------------------------------------------------------------------------------------------------------------------------------------------
const PATH_WORD: Record<string, string> = { photosynthesis: "photosynthesis", aerobic: "aerobic", yeast: "yeast", lactic: "lactic acid" };
/** The carbon atoms in the boxes of a pathway that carry it in and out, read from the labels of a table. */
const carbonSum = (flow: FlowDef, ids: string[]): number => ids.reduce((s, id) => s + (carbonIn(flow.nodes.find((n) => n.id === id)!.label) ?? 0), 0);
export const pathwayFigure = bioDrawer("b_pathway", "pathway_flow", {
  covers: ["Photosynthesis inputs/outputs, light and dark reaction", "Glycolysis, Krebs, ETS flow"],
  readouts(p) {
    const t = PATHWAY_TABLES[p.pathway];
    return [{ key: "Path", word: PATH_WORD[p.pathway]! }, { key: "In", word: t.left }, { key: "Out", word: t.right }, { key: "Carbon in", value: carbonSum(t.flow, t.carbonIn), unit: "" }, { key: "Carbon out", value: carbonSum(t.flow, t.carbonOut), unit: "" }];
  },
  draw: (sk, p) => drawFlow(sk, PATHWAY_TABLES[p.pathway].flow),
  check(result, p) {
    const t = PATHWAY_TABLES[p.pathway];
    const out = checkFlow(result, t.flow);
    // from the printed text: the equation balances, and the carbon in the boxes that take carbon in equals the carbon in those that give it out
    const printed = (key: string): string | undefined => result.shapes.map((s) => textOf(s)).find((x) => x !== undefined && x.startsWith(`${key}: `))?.slice(key.length + 2);
    const l = printed("In");
    const r = printed("Out");
    if (l === undefined || r === undefined) out.push("the equation is not printed");
    else if (!balanced(l, r)) out.push(`the equation ${l} to ${r} does not conserve every atom`);
    const rf = readFlow(result);
    const labelOf = (id: string): string => rf.labels[t.flow.nodes.findIndex((n) => n.id === id)] ?? "";
    const sum = (ids: string[]): number => ids.reduce((s, id) => s + (carbonIn(labelOf(id)) ?? 0), 0);
    if (sum(t.carbonIn) !== sum(t.carbonOut)) out.push(`the boxes take in ${sum(t.carbonIn)} carbon atoms and give out ${sum(t.carbonOut)}: carbon is conserved`);
    return [...new Set(out)].slice(0, 4);
  },
});

// ---- cycles ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
export const cycleFigure = bioDrawer("b_cycle", "nutrient_cycle", {
  covers: ["Carbon, nitrogen, water cycles"],
  readouts: (p) => [{ key: "Cycle", word: p.cycle }, ...counts(CYCLE_TABLES[p.cycle].flow), { key: "Named steps", value: CYCLE_TABLES[p.cycle].flow.edges.filter((e) => e.label !== undefined).length, unit: "" }],
  draw: (sk, p) => drawFlow(sk, CYCLE_TABLES[p.cycle].flow),
  check(result, p) {
    const out = checkFlow(result, CYCLE_TABLES[p.cycle].flow);
    // a cycle returns: every box is entered by an arrow and left by one, so matter is not lost at a dead end or made from nothing
    const r = readFlow(result);
    r.labels.forEach((lab, k) => {
      if (!r.edges.some((e) => e.to === k)) out.push(`${lab ?? "a box"} is not entered by any arrow`);
      if (!r.edges.some((e) => e.from === k)) out.push(`${lab ?? "a box"} is not left by any arrow`);
    });
    return [...new Set(out)].slice(0, 4);
  },
});

// ---- food webs ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
const WEB_COVERS = ["Food chain, food web, energy pyramid"];
function factsOfWeb(id: keyof typeof WEB_TABLES) {
  const t = WEB_TABLES[id];
  return webFacts(t.flow.nodes.map((n) => n.id), t.eats);
}
export const webFigure = bioDrawer("b_web", "food_web", {
  covers: WEB_COVERS,
  readouts(p) {
    const t = WEB_TABLES[p.web];
    const f = factsOfWeb(p.web);
    const lab = (id: string): string => t.flow.nodes.find((n) => n.id === id)!.label;
    return [{ key: "Organisms", value: t.flow.nodes.length, unit: "" }, { key: "Food chains", value: f.chains.length, unit: "" }, { key: "Longest chain", value: f.longest, unit: "" }, { key: "Highest level", value: Math.max(...Object.values(f.levels)), unit: "" }, { key: "Top", word: f.tops.map(lab).join(", ") }];
  },
  draw: (sk, p) => drawFlow(sk, WEB_TABLES[p.web].flow),
  check(result, p) {
    const out = checkFlow(result, WEB_TABLES[p.web].flow);
    const r = readFlow(result);
    // every arrow points up the picture, from the eaten to the one that eats it
    r.edges.forEach((e, j) => {
      const a = r.boxes[e.from];
      const b = r.boxes[e.to];
      if (a && b && !(centreOf(b)[1] < centreOf(a)[1])) out.push(`arrow ${j + 1} does not point up from the eaten to the eater`);
    });
    // the facts of the web are worked out again from the drawn arrows and labels: chains and levels
    const names = r.labels.map((l, k) => l ?? `#${k}`);
    try {
      const f = webFacts(names, r.edges.map((e) => [names[e.to]!, names[e.from]!] as [string, string]));
      const want = factsOfWeb(p.web);
      if (f.chains.length !== want.chains.length || f.longest !== want.longest) out.push(`the drawn arrows give ${f.chains.length} food chains and a longest of ${f.longest}, not ${want.chains.length} and ${want.longest}`);
    } catch {
      out.push("the drawn arrows make a loop: a food web has none");
    }
    return [...new Set(out)].slice(0, 4);
  },
});

// ---- classification ------------------------------------------------------------------------------------------------------------------------------------------------------------------------
export const taxonomyFigure = bioDrawer("b_taxonomy", "classification_ladder", {
  covers: ["Classification hierarchy / key tree"],
  readouts: (p) => [{ key: "Organism", word: TAXA[p.organism].common }, { key: "Name", word: binomial(p.organism) }, { key: "Ranks", value: RANKS.length, unit: "" }],
  draw: (sk, p) => drawFlow(sk, taxonomyFlow(p.organism)),
  check(result, p) {
    const f = taxonomyFlow(p.organism);
    const out = checkFlow(result, f);
    const r = readFlow(result);
    const rank = (name: string): string | undefined => r.labels.find((l) => l !== null && l.startsWith(`${name}: `))?.slice(name.length + 2);
    const genus = rank("Genus");
    const species = rank("Species");
    if (!genus || !species) out.push("the genus or the species is missing");
    else {
      if (!/^[A-Z][a-z]+$/.test(genus)) out.push("a genus is written with a capital letter");
      if (!/^[a-z]+$/.test(species)) out.push("a species name is written in small letters");
      const name = textOf(r.labels.length ? result.shapes.find((s) => /_r1$/.test(String(s.id))) : undefined)?.replace(/^Name: /, "");
      if (name !== undefined && name !== `${genus} ${species}`) out.push("the name printed is not the genus and the species of the ladder");
    }
    return [...new Set(out)].slice(0, 4);
  },
});

// ---- trees of descent ----------------------------------------------------------------------------------------------------------------------------------------------------------------
export const treeFigure = bioDrawer("b_tree", "descent_tree", {
  covers: ["Phylogenetic tree, homology, natural selection graphs"],
  readouts(p) {
    const nodes = flattenTree(TREE_TABLES[p.tree]);
    const out: Readout[] = [{ key: "Species", value: nodes.filter((n) => n.leaf).length, unit: "" }, { key: "Branch points", value: nodes.filter((n) => !n.leaf).length, unit: "" }];
    if (p.a !== undefined && p.b !== undefined) out.push({ key: "Clade", word: mrca(nodes, p.a, p.b)!.clade! });
    return out;
  },
  draw(sk, p) {
    const flow = treeFlow(TREE_TABLES[p.tree]);
    drawFlow(sk, flow, { fill: "none" });
    if (p.a !== undefined && p.b !== undefined) {
      const nodes = flattenTree(TREE_TABLES[p.tree]);
      const m = mrca(nodes, p.a, p.b)!;
      const n = flow.nodes.find((x) => x.id === m.id)!;
      const [x, y] = at(sk.L, n.x, n.y);
      sk.circle("hl", x, y, 1.9, { color: "red", width: 0.5 });
    }
  },
  check(result, p) {
    const flow = treeFlow(TREE_TABLES[p.tree]);
    const out = checkFlow(result, flow);
    const hl = byId(result, "hl");
    const asked = p.a !== undefined && p.b !== undefined;
    if (!asked && hl) out.push("a common ancestor is marked and none was asked for");
    if (asked) {
      if (!hl) out.push("the common ancestor is not marked");
      else {
        const r = readFlow(result);
        const c: Pt = [Number(hl.cx), Number(hl.cy)];
        const dots = r.boxes.map((b, k) => ({ b, k })).filter(({ k }) => r.labels[k] === null);
        const ring = dots.reduce((best, d) => (distToBox(d.b, c) < distToBox(best.b, c) ? d : best), dots[0]!);
        if (!ring || !contains({ x: ring.b.x - 1, y: ring.b.y - 1, w: ring.b.w + 2, h: ring.b.h + 2 }, c, 0)) out.push("the ring is not round a branch point");
        else {
          // the lowest branch point above both species, found again from the drawn lines
          const parent = new Map<number, number>();
          r.edges.forEach((e) => parent.set(e.to, e.from));
          const leaf = (name: string): number => r.labels.findIndex((l) => l === name);
          const up = (k: number): number[] => (parent.has(k) ? [parent.get(k)!, ...up(parent.get(k)!)] : []);
          const ua = new Set(up(leaf(p.a!)));
          const lowest = up(leaf(p.b!)).find((k) => ua.has(k));
          if (lowest !== ring.k) out.push("the ring is not round the last common ancestor of the two species");
        }
      }
    }
    return [...new Set(out)].slice(0, 4);
  },
});
export { ORGANISMS, sig };
export type { DrawResult };
