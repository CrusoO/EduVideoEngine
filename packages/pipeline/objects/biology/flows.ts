import type { Colour } from "../physics/kit";
import type { FEdge, FNode, FlowDef } from "./flow";
import { endospermPloidy, zygotePloidy } from "./compute";

/**
 * The tables of the flow diagrams of wave 4 (ADR 0111): which boxes a pathway or a cycle has, where each is, and which arrows join them. These are facts of record stated from knowledge (a
 * textbook pathway, a food web of a named habitat), and the tests check what they must satisfy (every arrow joins two boxes, no arrow runs through a box, no two boxes overlap, the names
 * of arrows clear every box, the tone of a blood vessel follows the lungs). A figure draws a table and reads the drawing back against it.
 */
const R5 = [2.5, 10.5, 18.5, 26.5, 34.5] as const;
const R4 = [3.5, 13.4, 23.3, 33.2] as const;
const XL = 15;
const XR = 45;
const nd = (id: string, label: string, x: number, y: number, extra: Partial<FNode> = {}): FNode => ({ id, label, x, y, ...extra });
const ed = (from: string, to: string, extra: Partial<FEdge> = {}): FEdge => ({ from, to, ...extra });
const chain = (ids: string[], extra: Partial<FEdge> = {}): FEdge[] => ids.slice(1).map((id, i) => ed(ids[i]!, id, extra));

// ---- human and plant systems as pathways -----------------------------------------------------------------------------------------------------------------------------------------------
export const SYSTEMS = ["digestion", "respiration", "reflex_arc", "reproduction_male", "reproduction_female", "immune_response", "vaccination", "water_transport", "phloem", "pollination"] as const;
export type SystemId = (typeof SYSTEMS)[number];

export const SYSTEM_TABLES: Record<SystemId, { covers: string; flow: FlowDef; /** what the key facts of the figure say, computed from the table by the figure */ words: Array<{ key: string; word: string }> }> = {
  digestion: {
    covers: "Human digestive system",
    flow: {
      nodes: [nd("mouth", "Mouth", XL, R5[0]), nd("oes", "Oesophagus", XL, R5[1]), nd("stom", "Stomach", XL, R5[2]), nd("si", "Small intestine", XL, R5[3]), nd("li", "Large intestine", XL, R5[4]),
        nd("sal", "Salivary glands", XR, R5[0]), nd("liv", "Liver", XR, R5[2]), nd("pan", "Pancreas", XR, R5[3]), nd("anus", "Anus", XR, R5[4])],
      edges: [...chain(["mouth", "oes", "stom", "si", "li", "anus"]), ed("sal", "mouth"), ed("liv", "si"), ed("pan", "si")],
    },
    words: [{ key: "In villi", word: "absorption" }],
  },
  respiration: {
    covers: "Human respiratory system, alveolus",
    flow: {
      nodes: [nd("nose", "Nasal cavity", XL, R5[0]), nd("phar", "Pharynx", XL, R5[1]), nd("lar", "Larynx", XL, R5[2]), nd("tra", "Trachea", XL, R5[3]), nd("bro", "Bronchi", XL, R5[4]),
        nd("bol", "Bronchioles", XR, R5[4]), nd("alv", "Alveoli", XR, R5[3]), nd("blo", "Blood", XR, R5[2])],
      edges: [...chain(["nose", "phar", "lar", "tra", "bro", "bol", "alv"]), ed("alv", "blo", { tone: "red", off: 1, label: "O2" }), ed("blo", "alv", { tone: "purple", off: 1, label: "CO2" })],
    },
    words: [{ key: "Red", word: "O2 in" }, { key: "Purple", word: "CO2 out" }],
  },
  reflex_arc: {
    covers: "Neuron, reflex arc, brain",
    flow: {
      nodes: [nd("stim", "Stimulus", XL, R5[0]), nd("rec", "Receptor", XL, R5[1]), nd("sen", "Sensory neuron", XL, R5[2]), nd("cord", "Spinal cord", XL, R5[3]), nd("brain", "Brain", XL, R5[4]),
        nd("mot", "Motor neuron", XR, R5[3]), nd("eff", "Effector", XR, R5[2]), nd("res", "Response", XR, R5[1])],
      edges: [...chain(["stim", "rec", "sen", "cord"]), ed("cord", "mot"), ed("mot", "eff"), ed("eff", "res"), ed("cord", "brain")],
    },
    words: [{ key: "Centre", word: "spinal cord" }],
  },
  reproduction_male: {
    covers: "Human reproductive systems, gametes, cycle graph",
    flow: {
      nodes: [nd("tes", "Testes", XL, R5[0]), nd("epi", "Epididymis", XL, R5[1]), nd("vas", "Vas deferens", XL, R5[2]), nd("ure", "Urethra", XL, R5[3]),
        nd("sv", "Seminal vesicle", XR, R5[1]), nd("pro", "Prostate gland", XR, R5[3])],
      edges: [...chain(["tes", "epi", "vas", "ure"]), ed("sv", "vas"), ed("pro", "ure")],
    },
    words: [{ key: "Sperm made in", word: "testes" }],
  },
  reproduction_female: {
    covers: "Human reproductive systems, gametes, cycle graph",
    flow: {
      nodes: [nd("ova", "Ovary", XL, R5[0]), nd("ovi", "Oviduct", XL, R5[1]), nd("ute", "Uterus", XL, R5[2]), nd("cer", "Cervix", XL, R5[3]), nd("vag", "Vagina", XL, R5[4]),
        nd("fer", "Fertilisation", XR, R5[1]), nd("imp", "Implantation", XR, R5[2])],
      edges: [...chain(["ova", "ovi", "ute", "cer", "vag"]), ed("ovi", "fer"), ed("fer", "imp"), ed("imp", "ute")],
    },
    words: [{ key: "Egg released by", word: "ovary" }],
  },
  immune_response: {
    covers: "Antibody, immune response, vaccination",
    flow: {
      nodes: [nd("ag", "Antigen", XL, R5[0]), nd("mac", "Macrophage", XL, R5[1]), nd("th", "Helper T cell", XL, R5[2]), nd("b", "B cell", XL, R5[3]),
        nd("ab", "Antibodies", XR, R5[2]), nd("pl", "Plasma cell", XR, R5[3]), nd("mem", "Memory B cell", XR, R5[4])],
      edges: [...chain(["ag", "mac", "th", "b"]), ed("b", "pl"), ed("b", "mem"), ed("pl", "ab")],
    },
    words: [{ key: "Made by", word: "plasma cells" }],
  },
  vaccination: {
    covers: "Antibody, immune response, vaccination",
    flow: {
      nodes: [nd("vac", "Vaccine", XL, R5[0]), nd("b", "B cell", XL, R5[1]), nd("pl", "Plasma cell", XL, R5[2]), nd("ab", "Antibodies", XL, R5[3]),
        nd("fast", "Fast response", XR, R5[1]), nd("mem", "Memory B cell", XR, R5[2]), nd("later", "Later infection", XR, R5[3])],
      edges: [...chain(["vac", "b", "pl", "ab"]), ed("b", "mem"), ed("later", "mem"), ed("mem", "fast")],
    },
    words: [{ key: "Later", word: "fast response" }],
  },
  water_transport: {
    covers: "Transport in plants: xylem, phloem, transpiration",
    flow: {
      nodes: [nd("soil", "Soil water", XL, R5[0]), nd("hair", "Root hair", XL, R5[1]), nd("cor", "Root cortex", XL, R5[2]), nd("xyl", "Xylem", XL, R5[3]), nd("leaf", "Leaf cells", XL, R5[4]),
        nd("sto", "Stomata", XR, R5[4]), nd("air", "Air", XR, R5[3])],
      edges: [...chain(["soil", "hair", "cor", "xyl", "leaf"]), ed("leaf", "sto"), ed("sto", "air", { label: "transpiration", ls: -1 })],
    },
    words: [{ key: "Water up", word: "in xylem" }],
  },
  pollination: {
    covers: "Flower parts, pollination, fertilisation, fruit",
    flow: {
      nodes: [nd("pol", "Pollen grain", XL, R5[0]), nd("sti", "Stigma", XL, R5[1]), nd("tub", "Pollen tube", XL, R5[2]), nd("ovu", "Ovule", XL, R5[3]), nd("see", "Seed", XL, R5[4]),
        nd("zyg", "Zygote 2n", XR, R5[2]), nd("end", "Endosperm 3n", XR, R5[3])],
      edges: [...chain(["pol", "sti", "tub", "ovu", "see"]), ed("ovu", "zyg"), ed("ovu", "end")],
    },
    words: [{ key: "Zygote", word: `${zygotePloidy()}n` }, { key: "Endosperm", word: `${endospermPloidy()}n` }],
  },
  phloem: {
    covers: "Transport in plants: xylem, phloem, transpiration",
    flow: {
      nodes: [nd("leaf", "Leaf cells", 30, R5[0]), nd("load", "Sucrose loaded", 30, R5[1]), nd("phl", "Phloem", 30, R5[2]), nd("unl", "Sucrose unloaded", 30, R5[3]), nd("sink", "Roots and fruits", 30, R5[4])],
      edges: chain(["leaf", "load", "phl", "unl", "sink"]),
    },
    words: [{ key: "Sugar", word: "source to sink" }],
  },
};

// ---- the heart and double circulation ---------------------------------------------------------------------------------------------------------------------------------------------------
/** The ring of the circulation in the order blood goes: the first five boxes carry oxygen-poor blood and the last five oxygen-rich, so the tone of each arrow is worked out from where the lungs are. */
export const HEART_RING = ["body", "vc", "ra", "rv", "pa", "lungs", "pv", "la", "lv", "ao"] as const;
export function heartFlow(): FlowDef {
  const pos: Record<string, [string, number, number]> = {
    vc: ["Vena cava", XL, R5[0]], ra: ["Right atrium", XL, R5[1]], rv: ["Right ventricle", XL, R5[2]], pa: ["Pulmonary artery", XL, R5[3]], lungs: ["Lungs", XL, R5[4]],
    pv: ["Pulmonary vein", XR, R5[4]], la: ["Left atrium", XR, R5[3]], lv: ["Left ventricle", XR, R5[2]], ao: ["Aorta", XR, R5[1]], body: ["Body", XR, R5[0]],
  };
  const lungs = HEART_RING.indexOf("lungs");
  const edges: FEdge[] = HEART_RING.map((id, i) => {
    const next = HEART_RING[(i + 1) % HEART_RING.length]!;
    // blood leaving the body, and everything until it has passed the lungs, is oxygen-poor; after the lungs it is oxygen-rich until the body takes it
    const tone: Colour = i < lungs ? "purple" : "red";
    return ed(id, next, { tone });
  });
  return { nodes: HEART_RING.map((id) => nd(id, pos[id]![0], pos[id]![1], pos[id]![2])), edges };
}

// ---- the nephron --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
export const NEPHRON_FLOW: FlowDef = {
  nodes: [nd("glo", "Glomerulus", XL, R5[0]), nd("bow", "Bowman's capsule", XL, R5[1]), nd("pct", "Proximal tubule", XL, R5[2]), nd("loop", "Loop of Henle", XL, R5[3]), nd("dct", "Distal tubule", XL, R5[4]),
    nd("cd", "Collecting duct", XR, R5[4]), nd("uri", "Urine", XR, R5[3]), nd("cap", "Blood capillary", XR, R5[2])],
  edges: [ed("glo", "bow", { label: "filtration", ls: -1 }), ed("bow", "pct"), ed("pct", "loop"), ed("loop", "dct"), ed("dct", "cd"), ed("cd", "uri"), ed("pct", "cap", { tone: "red" })],
};

// ---- photosynthesis and respiration ---------------------------------------------------------------------------------------------------------------------------------------------------
export const PATHWAYS = ["photosynthesis", "aerobic", "yeast", "lactic"] as const;
export type PathwayId = (typeof PATHWAYS)[number];
/** Each pathway: its boxes and arrows, the equation (left and right sides), the carbon in each box (so a count can be read back), and which boxes carry the carbon in and out. */
export const PATHWAY_TABLES: Record<PathwayId, { flow: FlowDef; left: string; right: string; carbonIn: string[]; carbonOut: string[]; covers: string }> = {
  photosynthesis: {
    covers: "Photosynthesis inputs/outputs, light and dark reaction",
    left: "6CO2 + 6H2O",
    right: "C6H12O6 + 6O2",
    carbonIn: ["co2"],
    carbonOut: ["glu"],
    flow: {
      nodes: [nd("light", "Light", XL, R5[0]), nd("lr", "Light reaction", XL, R5[1]), nd("atp", "ATP and NADPH", XL, R5[2]), nd("cc", "Calvin cycle", XL, R5[3]), nd("glu", "Glucose C6", XL, R5[4]),
        nd("h2o", "Water", XR, R5[1]), nd("o2", "Oxygen", XR, R5[2]), nd("co2", "CO2 6 x C1", XR, R5[3])],
      edges: [ed("light", "lr"), ed("h2o", "lr"), ed("lr", "o2"), ed("lr", "atp"), ed("atp", "cc"), ed("co2", "cc"), ed("cc", "glu")],
    },
  },
  aerobic: {
    covers: "Glycolysis, Krebs, ETS flow",
    left: "C6H12O6 + 6O2",
    right: "6CO2 + 6H2O",
    carbonIn: ["glu"],
    carbonOut: ["co2a", "co2b"],
    flow: {
      nodes: [nd("glu", "Glucose C6", XL, R5[0]), nd("gly", "Glycolysis", XL, R5[1]), nd("link", "Link reaction", XL, R5[2]), nd("kre", "Krebs cycle", XL, R5[3]), nd("ets", "Electron transport", XL, R5[4]),
        nd("pyr", "Pyruvate 2 x C3", XR, R5[1]), nd("co2a", "CO2 2 x C1", XR, R5[2]), nd("co2b", "CO2 4 x C1", XR, R5[3]), nd("h2o", "Water", XR, R5[4])],
      edges: [ed("glu", "gly"), ed("gly", "pyr"), ed("pyr", "link"), ed("link", "kre"), ed("kre", "ets"), ed("link", "co2a"), ed("kre", "co2b"), ed("ets", "h2o")],
    },
  },
  yeast: {
    covers: "Glycolysis, Krebs, ETS flow",
    left: "C6H12O6",
    right: "2C2H5OH + 2CO2",
    carbonIn: ["glu"],
    carbonOut: ["eth", "co2"],
    flow: {
      nodes: [nd("glu", "Glucose C6", XL, R5[0]), nd("gly", "Glycolysis", XL, R5[1]), nd("pyr", "Pyruvate 2 x C3", XL, R5[2]), nd("eth", "Ethanol 2 x C2", XR, R5[2]), nd("co2", "CO2 2 x C1", XR, R5[3])],
      edges: [ed("glu", "gly"), ed("gly", "pyr"), ed("pyr", "eth"), ed("pyr", "co2")],
    },
  },
  lactic: {
    covers: "Glycolysis, Krebs, ETS flow",
    left: "C6H12O6",
    right: "2C3H6O3",
    carbonIn: ["glu"],
    carbonOut: ["lac"],
    flow: {
      nodes: [nd("glu", "Glucose C6", XL, R5[0]), nd("gly", "Glycolysis", XL, R5[1]), nd("pyr", "Pyruvate 2 x C3", XL, R5[2]), nd("lac", "Lactate 2 x C3", XR, R5[2])],
      edges: [ed("glu", "gly"), ed("gly", "pyr"), ed("pyr", "lac")],
    },
  },
};
/** The carbon atoms a box says it holds: "Glucose C6" is 6, "Pyruvate 2 x C3" is 6, "CO2 4 x C1" is 4; null when the label names no carbon count. */
export function carbonIn(label: string): number | null {
  const m = /(?:(\d+) x )?C(\d+)$/.exec(label);
  return m ? (m[1] === undefined ? 1 : Number(m[1])) * Number(m[2]) : null;
}

// ---- nutrient cycles ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------
export const CYCLES = ["carbon", "nitrogen", "water"] as const;
export type CycleId = (typeof CYCLES)[number];
const CL = 12;
const CR = 48;
export const CYCLE_TABLES: Record<CycleId, { flow: FlowDef }> = {
  carbon: {
    flow: {
      nodes: [nd("atm", "Atmosphere CO2", CL, R4[0]), nd("fos", "Fossil fuels", CR, R4[0]), nd("pro", "Producers", CL, R4[1]), nd("con", "Consumers", CR, R4[1]), nd("dead", "Dead matter", CL, R4[2]), nd("dec", "Decomposers", CR, R4[2])],
      edges: [
        ed("fos", "atm", { label: "burning", ls: -1 }), ed("atm", "pro"), ed("pro", "con"), ed("pro", "dead"), ed("con", "dead"),
        ed("dead", "dec", { label: "decay", ls: -1 }), ed("dec", "atm"), ed("dead", "fos"),
      ],
    },
  },
  nitrogen: {
    flow: {
      nodes: [nd("n2", "Atmosphere N2", 30, R4[3]), nd("amm", "Ammonium", 9, R4[1]), nd("nit", "Nitrate", 9, R4[2]), nd("pla", "Plants", 50, R4[2]), nd("ani", "Animals", 50, R4[1]), nd("dead", "Dead matter", 50, R4[0])],
      edges: [ed("n2", "amm"), ed("amm", "nit"), ed("nit", "pla", { label: "uptake", ls: -1 }), ed("pla", "ani", { label: "eating", ls: -1 }), ed("ani", "dead"), ed("dead", "amm"), ed("nit", "n2")],
    },
  },
  water: {
    flow: {
      nodes: [nd("vap", "Water vapour", CL, R4[0]), nd("cld", "Clouds", CR, R4[0]), nd("rain", "Rain and snow", CR, 18.3), nd("riv", "Rivers", CR, R4[3]), nd("sea", "Ocean", CL, R4[3]), nd("pla", "Plants", 34, 26)],
      edges: [ed("sea", "vap"), ed("vap", "cld", { label: "condensation" }), ed("cld", "rain", { label: "falls", ls: -1 }), ed("rain", "riv", { label: "runoff", ls: -1 }), ed("riv", "sea", { label: "flows" }), ed("rain", "pla"), ed("pla", "vap")],
    },
  },
};

// ---- food webs -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
export const WEBS = ["grassland_chain", "grassland", "pond"] as const;
export type WebId = (typeof WEBS)[number];
/** A web: each organism with where it sits, and who eats whom (the arrow goes from the eaten to the one that eats it, the way the energy goes). A producer eats nothing. */
export const WEB_TABLES: Record<WebId, { flow: FlowDef; eats: Array<[string, string]> }> = {
  grassland_chain: {
    flow: {
      nodes: [nd("grass", "Grass", 30, R5[4]), nd("gh", "Grasshopper", 30, R5[3]), nd("frog", "Frog", 30, R5[2]), nd("snake", "Snake", 30, R5[1]), nd("hawk", "Hawk", 30, R5[0])],
      edges: chain(["grass", "gh", "frog", "snake", "hawk"]),
    },
    eats: [["gh", "grass"], ["frog", "gh"], ["snake", "frog"], ["hawk", "snake"]],
  },
  grassland: {
    flow: {
      nodes: [nd("grass", "Grass", 30, R5[4]), nd("gh", "Grasshopper", 10, R5[3]), nd("mouse", "Mouse", 30, R5[3]), nd("rabbit", "Rabbit", 50, R5[3]), nd("frog", "Frog", 10, R5[2]), nd("snake", "Snake", 30, R5[1]), nd("hawk", "Hawk", 50, R5[0])],
      edges: [ed("grass", "gh"), ed("grass", "mouse"), ed("grass", "rabbit"), ed("gh", "frog"), ed("frog", "snake"), ed("mouse", "snake"), ed("snake", "hawk"), ed("rabbit", "hawk")],
    },
    eats: [["gh", "grass"], ["mouse", "grass"], ["rabbit", "grass"], ["frog", "gh"], ["snake", "frog"], ["snake", "mouse"], ["hawk", "snake"], ["hawk", "rabbit"]],
  },
  pond: {
    flow: {
      nodes: [nd("algae", "Algae", 14, R4[3]), nd("weed", "Water weed", 46, R4[3]), nd("zoo", "Zooplankton", 12, R4[2]), nd("tad", "Tadpole", 46, R4[2]), nd("fish", "Small fish", 14, R4[1]), nd("frog", "Frog", 46, R4[1]), nd("heron", "Heron", 30, R4[0])],
      edges: [ed("algae", "zoo"), ed("algae", "tad"), ed("weed", "tad"), ed("zoo", "fish"), ed("tad", "fish"), ed("tad", "frog"), ed("fish", "heron"), ed("frog", "heron")],
    },
    eats: [["zoo", "algae"], ["tad", "algae"], ["tad", "weed"], ["fish", "zoo"], ["fish", "tad"], ["frog", "tad"], ["heron", "fish"], ["heron", "frog"]],
  },
};
export type WebFacts = { levels: Record<string, number>; producers: string[]; tops: string[]; chains: string[][]; longest: number };
/** What a web says by arithmetic: the level of each organism (a producer is level 1; any other is 1 plus the mean level of what it eats), the producers, the top of the web, every food chain from a producer to a top predator, and the length of the longest. */
export function webFacts(nodes: string[], eats: Array<[string, string]>): WebFacts {
  const prey = new Map<string, string[]>(nodes.map((n) => [n, []]));
  const eaters = new Map<string, string[]>(nodes.map((n) => [n, []]));
  for (const [e, p] of eats) {
    prey.get(e)!.push(p);
    eaters.get(p)!.push(e);
  }
  const levels: Record<string, number> = {};
  const level = (n: string, seen: string[] = []): number => {
    if (seen.includes(n)) throw new Error("a food web has no cycle");
    if (levels[n] !== undefined) return levels[n]!;
    const ps = prey.get(n)!;
    levels[n] = ps.length === 0 ? 1 : 1 + ps.reduce((s, p) => s + level(p, [...seen, n]), 0) / ps.length;
    return levels[n]!;
  };
  nodes.forEach((n) => level(n));
  const producers = nodes.filter((n) => prey.get(n)!.length === 0);
  const tops = nodes.filter((n) => eaters.get(n)!.length === 0);
  const chains: string[][] = [];
  const walk = (path: string[]): void => {
    const next = eaters.get(path.at(-1)!)!;
    if (next.length === 0) chains.push(path);
    else next.forEach((e) => walk([...path, e]));
  };
  producers.forEach((p) => walk([p]));
  return { levels, producers, tops, chains, longest: Math.max(...chains.map((c) => c.length)) };
}

// ---- classification ladders ---------------------------------------------------------------------------------------------------------------------------------------------------------------
export const RANKS = ["Kingdom", "Phylum", "Class", "Order", "Family", "Genus", "Species"] as const;
export const ORGANISMS = ["human", "tiger", "cat", "peacock"] as const;
export type OrganismId = (typeof ORGANISMS)[number];
export const TAXA: Record<OrganismId, { common: string; names: string[] }> = {
  human: { common: "Human", names: ["Animalia", "Chordata", "Mammalia", "Primates", "Hominidae", "Homo", "sapiens"] },
  tiger: { common: "Tiger", names: ["Animalia", "Chordata", "Mammalia", "Carnivora", "Felidae", "Panthera", "tigris"] },
  cat: { common: "Cat", names: ["Animalia", "Chordata", "Mammalia", "Carnivora", "Felidae", "Felis", "catus"] },
  peacock: { common: "Peacock", names: ["Animalia", "Chordata", "Aves", "Galliformes", "Phasianidae", "Pavo", "cristatus"] },
};
export function taxonomyFlow(id: OrganismId): FlowDef {
  const names = TAXA[id].names;
  const nodes = RANKS.map((r, i) => nd(r.toLowerCase(), `${r}: ${names[i]}`, i % 2 === 0 ? XL : XR, 2.3 + 5.3 * i));
  return { nodes, edges: chain(nodes.map((n) => n.id)) };
}
/** The binomial name: the genus and the species, as the last two ranks make it. */
export const binomial = (id: OrganismId): string => `${TAXA[id].names[5]} ${TAXA[id].names[6]}`;
/** The highest rank two organisms share and how many ranks they have in common from the top: the more ranks, the closer the relatives. */
export function sharedRanks(a: OrganismId, b: OrganismId): number {
  let n = 0;
  while (n < RANKS.length && TAXA[a].names[n] === TAXA[b].names[n]) n++;
  return n;
}

// ---- trees of descent --------------------------------------------------------------------------------------------------------------------------------------------------------------------------
export type Clade = { name: string; kids: Array<Clade | string> };
export const TREES = ["vertebrates", "apes"] as const;
export type TreeId = (typeof TREES)[number];
/** The branching of two trees: a clade is a name and what descends from it (a clade or a species). Vertebrate classes: fish, then amphibians, then mammals apart from reptiles and birds; the apes: gibbons, then orangutans, then gorillas, then chimpanzees and humans. */
export const TREE_TABLES: Record<TreeId, Clade> = {
  vertebrates: { name: "Vertebrates", kids: ["Fish", { name: "Tetrapods", kids: ["Amphibians", { name: "Amniotes", kids: ["Mammals", { name: "Reptiles, birds", kids: ["Reptiles", "Birds"] }] }] }] },
  apes: { name: "Apes", kids: ["Gibbon", { name: "Great apes", kids: ["Orangutan", { name: "African apes", kids: ["Gorilla", { name: "Chimp, human", kids: ["Chimpanzee", "Human"] }] }] }] },
};
export type TreeNode = { id: string; clade?: string; leaf?: string; kids: string[]; parent?: string };
/** The tree as nodes: each clade a node with the id c0, c1, ... in the order met, each species a leaf. */
export function flattenTree(root: Clade): TreeNode[] {
  const out: TreeNode[] = [];
  let k = 0;
  const walk = (c: Clade | string, parent?: string): string => {
    if (typeof c === "string") {
      const id = `s_${c.toLowerCase().replace(/[^a-z]+/g, "_")}`;
      out.push({ id, leaf: c, kids: [], ...(parent ? { parent } : {}) });
      return id;
    }
    const id = `c${k++}`;
    const node: TreeNode = { id, clade: c.name, kids: [], ...(parent ? { parent } : {}) };
    out.push(node);
    node.kids = c.kids.map((x) => walk(x, id));
    return id;
  };
  walk(root);
  return out;
}
export const treeLeaves = (nodes: TreeNode[]): string[] => nodes.filter((n) => n.leaf).map((n) => n.leaf!);
/** The last common ancestor of two species: the lowest clade that holds both. */
export function mrca(nodes: TreeNode[], a: string, b: string): TreeNode | null {
  const byId = new Map(nodes.map((n) => [n.id, n] as const));
  const la = nodes.find((n) => n.leaf === a);
  const lb = nodes.find((n) => n.leaf === b);
  if (!la || !lb) return null;
  const up = (n: TreeNode): string[] => (n.parent ? [n.parent, ...up(byId.get(n.parent)!)] : []);
  const ua = new Set(up(la));
  const hit = up(lb).find((id) => ua.has(id));
  return hit ? byId.get(hit)! : null;
}
/** A flow table for a tree: leaves in a column on the right in the order of the table, each clade a small junction placed at the mean height of what it holds and at a depth that grows with how many splits lie below it. */
export function treeFlow(root: Clade): FlowDef {
  const nodes = flattenTree(root);
  const byId = new Map(nodes.map((n) => [n.id, n] as const));
  const height = (n: TreeNode): number => (n.leaf ? 0 : 1 + Math.max(...n.kids.map((k) => height(byId.get(k)!))));
  const leaves = nodes.filter((n) => n.leaf);
  const top = 4;
  const step = leaves.length > 1 ? (33 - top) / (leaves.length - 1) : 0;
  const yOf = new Map<string, number>(leaves.map((n, i) => [n.id, top + i * step]));
  const yy = (n: TreeNode): number => {
    if (yOf.has(n.id)) return yOf.get(n.id)!;
    const ys = n.kids.map((k) => yy(byId.get(k)!));
    const y = (Math.min(...ys) + Math.max(...ys)) / 2;
    yOf.set(n.id, y);
    return y;
  };
  const rootH = height(nodes[0]!);
  const flow: FNode[] = nodes.map((n) => (n.leaf ? nd(n.id, n.leaf, 48, yy(n)) : nd(n.id, "", 4 + (28 * (rootH - height(n))) / rootH, yy(n), { dot: true })));
  const edges: FEdge[] = nodes.flatMap((n) => n.kids.map((k) => ed(n.id, k, { plain: true })));
  return { nodes: flow, edges };
}
