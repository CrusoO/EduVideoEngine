import { addDots, chemDrawer, dist, dotsAround, near, polar, readDots, readSegs, segD, sideOf, type Seg } from "./ckit";
import { DOMAIN_SLOTS, dotsPerSide, elementBySym, ionic, lewis, loneSlots, shapeOf, valenceOf, type LewisOk } from "./compute";
import { parseReadouts, pointsOf, r1, r2, shapeBy, textBy, textWidth, type Readout } from "../physics/kit";

/**
 * Wave 3, bonding: ionic bonding as the transfer of electrons between two Lewis symbols, the Lewis structure of a small molecule with its shared and lone pairs, and its VSEPR shape
 * (ADR 0110). Lone pairs and Lewis dots are dots inside paths. What is read back is the electron bookkeeping of the drawing (bonds and dots add up to the valence electrons), the octet
 * of the central atom, and, for VSEPR, the direction of every bond and lone pair against the directions of the electron arrangement that its count of domains gives.
 */
const FONT = 3.2;
const symHalf = (s: string): number => textWidth(s, FONT) / 2;

// ---- ionic bonding ------------------------------------------------------------------------------------------------------------------------------------------------------------------
export const ionicBond = chemDrawer("c_bond_ionic", "ionic_bond", {
  covers: ["Ionic/covalent bond formation, electron transfer"],
  readouts(p) {
    const i = ionic(p.metal, p.nonmetal);
    return [{ key: "Formula", word: i.formula }, { key: "Cation", word: i.cation }, { key: "Anion", word: i.anion }, { key: "Ratio", word: `${i.a} : ${i.b}` }, { key: "Electrons moved", value: i.moved, unit: "" }, { key: "Net charge", value: i.net, unit: "" }];
  },
  draw(sk, p) {
    const i = ionic(p.metal, p.nonmetal);
    const { pic } = sk.L;
    const [x1, x2] = [pic.x + pic.w * 0.27, pic.x + pic.w * 0.73];
    const [y1, y2] = [pic.y + pic.h * 0.3, pic.y + pic.h * 0.78];
    sk.text("m", x1, y1, p.metal, { anchor: "middle", bold: true, size: FONT });
    addDots(sk, "md", dotsAround(x1, y1, dotsPerSide(i.metalDots), symHalf(p.metal), 1.6));
    sk.text("nm", x2, y1, p.nonmetal, { anchor: "middle", bold: true, size: FONT });
    addDots(sk, "nd", dotsAround(x2, y1, dotsPerSide(i.nonmetalDots), symHalf(p.nonmetal), 1.6));
    sk.arrow("tr", x1 + symHalf(p.metal) + 3.4, y1, x2 - symHalf(p.nonmetal) - 3.4, y1, { color: "red", width: 0.5 });
    sk.text("tl", (x1 + x2) / 2, y1 - 2, `${i.qm} e-`, { anchor: "middle" });
    sk.text("ct", x1, y2, i.cation, { anchor: "middle", bold: true, size: FONT });
    sk.text("at", x2, y2, i.anion, { anchor: "middle", bold: true, size: FONT });
    addDots(sk, "ad", dotsAround(x2, y2, dotsPerSide(8), textWidth(i.anion, FONT) / 2, 1.6));
  },
  check(result, p) {
    const out: string[] = [];
    const i = ionic(p.metal, p.nonmetal);
    const sym = (id: string): { x: number; y: number; text: string } | undefined => {
      const s = result.shapes.find((x) => String(x.id).endsWith(`_${id}`));
      return s ? { x: Number(s.x), y: Number(s.y), text: String(s.text) } : undefined;
    };
    const sides = (dots: Array<[number, number]>, c: { x: number; y: number }): number[] => {
      const k = [0, 0, 0, 0];
      for (const [x, y] of dots) k[sideOf(x - c.x, y - c.y)]!++;
      return k;
    };
    const [m, nm, ct, at] = [sym("m"), sym("nm"), sym("ct"), sym("at")];
    if (!m || !nm || !ct || !at) return ["a symbol of the picture is missing"];
    if (m.text !== p.metal || nm.text !== p.nonmetal) out.push("a Lewis symbol is not the element asked for");
    const md = readDots(result, "md");
    const nd = readDots(result, "nd");
    const ad = readDots(result, "ad");
    if (md.length !== valenceOf(p.metal)) out.push(`the metal shows ${md.length} dots and has ${valenceOf(p.metal)} outer electrons`);
    if (nd.length !== valenceOf(p.nonmetal)) out.push(`the non-metal shows ${nd.length} dots and has ${valenceOf(p.nonmetal)} outer electrons`);
    if (ad.length !== 8) out.push(`the anion shows ${ad.length} dots and a full shell has 8`);
    if (sides(md, m).join() !== dotsPerSide(valenceOf(p.metal)).join()) out.push("the metal's dots are not placed one to a side first");
    if (sides(nd, nm).join() !== dotsPerSide(valenceOf(p.nonmetal)).join()) out.push("the non-metal's dots are not placed one to a side first");
    // each dot sits where the Lewis layout puts it, round the centre of its symbol
    const placed = (got: Array<[number, number]>, c: { x: number; y: number }, per: [number, number, number, number], half: number): boolean => dotsAround(c.x, c.y, per, half, 1.6).every((e) => got.some((g) => dist(g, e) < 0.06));
    if (!placed(md, m, dotsPerSide(valenceOf(p.metal)), symHalf(p.metal)) || !placed(nd, nm, dotsPerSide(valenceOf(p.nonmetal)), symHalf(p.nonmetal)) || !placed(ad, at, dotsPerSide(8), textWidth(at.text, FONT) / 2)) out.push("an electron is not where the Lewis symbol puts it");
    if (shapeBy(result, "cd0")) out.push("a cation has no outer electrons: no dots are drawn round it");
    if (ct.text !== i.cation || at.text !== i.anion) out.push("an ion's charge is not the one the electrons moved give");
    if (textBy(result, "tl") !== `${i.qm} e-`) out.push("the electrons on the arrow are not the number the metal loses");
    const a = result.shapes.find((s) => s.kind === "arrow");
    if (!a || !(Number(a.x2) > Number(a.x1))) out.push("the electrons must move from the metal to the non-metal");
    // the formula and the ions drawn agree: counts of each ion times its charge cancel
    const f = parseReadouts(result).get("Formula")?.word ?? "";
    const cnt = (s: string): number => Number(new RegExp(`${s}(\\d*)`).exec(f)?.[1] || 1);
    const qc = Number(/(\d*)\+$/.exec(ct.text)?.[1] || 1);
    const qa = Number(/(\d*)-$/.exec(at.text)?.[1] || 1);
    if (cnt(p.metal) * qc !== cnt(p.nonmetal) * qa) out.push("the formula does not balance the charges of the ions drawn");
    return out.slice(0, 3);
  },
});

// ---- Lewis structure and VSEPR shape ----------------------------------------------------------------------------------------------------------------------------------------
const lewisOf = (p: { central: string; ligand: string; n: number }): LewisOk => lewis(p.central, p.ligand, p.n) as LewisOk;
const pairDots = (cx: number, cy: number, r: number, deg: number): Array<[number, number]> => {
  const c = polar(cx, cy, r, deg);
  const [tx, ty] = [polar(0, 0, 0.55, deg + 90)[0], polar(0, 0, 0.55, deg + 90)[1]];
  return [[c[0] + tx, c[1] + ty], [c[0] - tx, c[1] - ty]];
};
const octetWord = (l: LewisOk): string => (l.central === "H" ? "duet" : l.electronsAround === 8 ? "complete" : l.electronsAround > 8 ? "expanded" : "incomplete");
const geometry = (l: LewisOk) => {
  const slots = DOMAIN_SLOTS[l.domains]!;
  const lone = loneSlots(l.domains, l.centralLone);
  return { slots, lone, bonded: slots.map((_, i) => i).filter((i) => !lone.includes(i)) };
};
const bondLen = (pic: { w: number; h: number }): number => Math.min(11, Math.min(pic.w, pic.h) * 0.36);
const OFFSETS: Record<number, number[]> = { 1: [0], 2: [90, -90], 3: [0, 90, -90] };

export const lewisStructure = chemDrawer("c_lewis", "lewis_structure", {
  covers: ["Molecule structure: Lewis, skeletal, VSEPR 3D", "Ionic/covalent bond formation, electron transfer"],
  readouts(p) {
    const l = lewisOf(p);
    return [
      { key: "Valence electrons", value: l.totalElectrons, unit: "" }, { key: "Bonding pairs", value: l.bonds, unit: "" }, { key: "Lone pairs", value: l.centralLone + l.n * l.ligandLone, unit: "" },
      { key: "Around central", value: l.electronsAround, unit: "" }, { key: "Bond type", word: l.bondText }, { key: "Octet", word: octetWord(l) },
    ];
  },
  draw(sk, p) {
    const l = lewisOf(p);
    const { pic } = sk.L;
    const [cx, cy] = [pic.x + pic.w / 2, pic.y + pic.h / 2];
    const L = bondLen(pic);
    const g = geometry(l);
    const segs: Seg[] = [];
    const lone: Array<[number, number]> = [];
    sk.text("c", cx, cy, l.central, { anchor: "middle", bold: true, size: FONT });
    g.lone.forEach((si) => lone.push(...pairDots(cx, cy, 3.9, g.slots[si]!.deg)));
    g.bonded.forEach((si, k) => {
      const deg = g.slots[si]!.deg;
      const [lx, ly] = polar(cx, cy, L, deg);
      sk.text(`l${k}`, lx, ly, l.ligand, { anchor: "middle", bold: true, size: FONT });
      const a = polar(cx, cy, 2.7, deg);
      const b = polar(cx, cy, L - 2.2, deg);
      const [nx, ny] = [polar(0, 0, 1, deg + 90)[0], polar(0, 0, 1, deg + 90)[1]];
      for (let j = 0; j < l.bondOrder; j++) {
        const o = (j - (l.bondOrder - 1) / 2) * 0.7;
        segs.push([a[0] + nx * o, a[1] + ny * o, b[0] + nx * o, b[1] + ny * o]);
      }
      for (const d of OFFSETS[l.ligandLone] ?? []) lone.push(...pairDots(lx, ly, 3.0, deg + d));
    });
    sk.path("bp", segD(segs), { width: 0.4 });
    addDots(sk, "lp", lone);
  },
  check(result, p) {
    const out: string[] = [];
    const l = lewisOf(p);
    const c = result.shapes.find((s) => String(s.id).endsWith("_c"));
    const ligs = result.shapes.filter((s) => /_l\d+$/.test(String(s.id)));
    if (!c || c.text !== l.central) return ["the central atom is missing or is not the one asked for"];
    if (ligs.length !== l.n || ligs.some((s) => s.text !== l.ligand)) out.push(`${ligs.length} atoms are drawn round the centre and the formula has ${l.n} ${l.ligand}`);
    const segs = readSegs(result, "bp");
    const dots = readDots(result, "lp");
    if (dots.length % 2 !== 0) out.push("a lone pair has a single dot");
    const centre: [number, number] = [Number(c.x), Number(c.y)];
    const pairs: Array<[number, number]> = [];
    for (let i = 0; i + 1 < dots.length; i += 2) pairs.push([(dots[i]![0] + dots[i + 1]![0]) / 2, (dots[i]![1] + dots[i + 1]![1]) / 2]);
    // a lone pair is two dots 1.1 apart, at the same distance from its atom each time
    for (let i = 0; i + 1 < dots.length; i += 2) if (!near(dist(dots[i]!, dots[i + 1]!), 1.1, 0.12)) out.push("a lone pair is not drawn as two dots side by side");
    // a lone pair belongs to the atom it is nearest to
    const owner = (q: [number, number]): number => {
      const all: Array<[number, number]> = [centre, ...ligs.map((l) => [Number(l.x), Number(l.y)] as [number, number])];
      return all.reduce((b, a, i) => (dist(q, a) < dist(q, all[b]!) ? i : b), 0);
    };
    const own = pairs.map(owner);
    pairs.forEach((q, i) => {
      const c: [number, number] = own[i] === 0 ? centre : [Number(ligs[own[i]! - 1]!.x), Number(ligs[own[i]! - 1]!.y)];
      if (!near(dist(q, c), own[i] === 0 ? 3.9 : 3.0, 0.12)) out.push("a lone pair is not at its place round its atom");
    });
    const atC = own.filter((i) => i === 0).length;
    if (atC !== l.centralLone) out.push(`the central atom shows ${atC} lone pairs and should show ${l.centralLone}`);
    ligs.forEach((s, k) => {
      const lp = own.filter((i) => i === k + 1).length;
      if (lp !== l.ligandLone) out.push(`atom ${k + 1} shows ${lp} lone pairs and should show ${l.ligandLone}`);
      const lines = segs.filter((q) => Math.min(dist([q[2], q[3]], [Number(s.x), Number(s.y)]), dist([q[0], q[1]], [Number(s.x), Number(s.y)])) < 3.2).length;
      if (lines !== l.bondOrder) out.push(`atom ${k + 1} is joined by ${lines} lines and a ${l.bondText} bond has ${l.bondOrder}`);
    });
    // every electron of the formula is drawn once: two in each bond line, two in each lone pair
    if (2 * segs.length + dots.length !== l.totalElectrons) out.push(`the drawing holds ${2 * segs.length + dots.length} electrons and the atoms bring ${l.totalElectrons}`);
    const around = 2 * segs.filter((q) => Math.min(dist([q[0], q[1]], centre), dist([q[2], q[3]], centre)) < 3.2).length + 2 * atC;
    if (around !== l.electronsAround) out.push(`the central atom has ${around} electrons round it in the drawing and ${l.electronsAround} from the rules`);
    return out.slice(0, 3);
  },
});

const WEDGE_W = 0.9;
export const vseprShape = chemDrawer("c_vsepr", "vsepr_shape", {
  covers: ["Molecule structure: Lewis, skeletal, VSEPR 3D"],
  readouts(p) {
    const l = lewisOf(p);
    // written as a word, not rounded to three figures: 109.5 degrees must not become 110
    const ang: Readout = { key: "Ideal angle", word: l.idealAngle === "none" ? "none" : `${l.idealAngle} degrees` };
    return [{ key: "Electron domains", value: l.domains, unit: "" }, { key: "Bonded atoms", value: l.n, unit: "" }, { key: "Lone pairs", value: l.centralLone, unit: "" }, { key: "Shape", word: l.shape }, ang];
  },
  draw(sk, p) {
    const l = lewisOf(p);
    const { pic } = sk.L;
    const [cx, cy] = [pic.x + pic.w / 2, pic.y + pic.h / 2];
    const L = bondLen(pic);
    const g = geometry(l);
    const plain: Seg[] = [];
    const dash: Seg[] = [];
    const wedges: string[] = [];
    const lone: Array<[number, number]> = [];
    sk.text("c", cx, cy, l.central, { anchor: "middle", bold: true, size: FONT });
    g.lone.forEach((si) => lone.push(...pairDots(cx, cy, 3.9, g.slots[si]!.deg)));
    g.bonded.forEach((si, k) => {
      const slot = g.slots[si]!;
      const [lx, ly] = polar(cx, cy, L, slot.deg);
      sk.text(`l${k}`, lx, ly, l.ligand, { anchor: "middle", bold: true, size: FONT });
      const a = polar(cx, cy, 2.7, slot.deg);
      const b = polar(cx, cy, L - 2.2, slot.deg);
      if (slot.style === "plain") plain.push([a[0], a[1], b[0], b[1]]);
      else if (slot.style === "dash") {
        // a hashed bond: short lines across the bond, growing towards the atom that is farther from the viewer (the page draws a dash pattern as solid)
        const [nx, ny] = [polar(0, 0, 1, slot.deg + 90)[0], polar(0, 0, 1, slot.deg + 90)[1]];
        for (let k = 1; k <= 5; k++) {
          const t = k / 5;
          const [hx, hy] = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
          const w = 0.2 + 0.7 * t;
          dash.push([hx + nx * w, hy + ny * w, hx - nx * w, hy - ny * w]);
        }
      }
      else {
        const [nx, ny] = [polar(0, 0, WEDGE_W, slot.deg + 90)[0], polar(0, 0, WEDGE_W, slot.deg + 90)[1]];
        wedges.push(`M${r1(a[0])} ${r1(a[1])}L${r1(b[0] + nx)} ${r1(b[1] + ny)}L${r1(b[0] - nx)} ${r1(b[1] - ny)}Z`);
      }
    });
    if (plain.length) sk.path("bp", segD(plain), { width: 0.4 });
    if (dash.length) sk.path("bd", segD(dash), { width: 0.3 });
    if (wedges.length) sk.path("bw", wedges.join(""), { color: "ink", fill: "ink", fillOpacity: 0.5, width: 0.2 });
    addDots(sk, "lp", lone);
  },
  check(result, p) {
    const out: string[] = [];
    const l = lewisOf(p);
    const c = result.shapes.find((s) => String(s.id).endsWith("_c"));
    const ligs = result.shapes.filter((s) => /_l\d+$/.test(String(s.id)));
    if (!c || c.text !== l.central) return ["the central atom is missing or is not the one asked for"];
    if (ligs.length !== l.n || ligs.some((s) => s.text !== l.ligand)) out.push(`${ligs.length} atoms are drawn round the centre and the formula has ${l.n} ${l.ligand}`);
    const centre: [number, number] = [Number(c.x), Number(c.y)];
    const slots = DOMAIN_SLOTS[l.domains]!;
    const used = new Set<number>();
    const angleOf = (x: number, y: number): number => ((Math.atan2(-(y - centre[1]), x - centre[0]) * 180) / Math.PI + 360) % 360;
    const slotAt = (deg: number): number => slots.findIndex((s) => Math.abs((((deg - s.deg) % 360) + 540) % 360 - 180) < 1.5);
    const plainEnds = readSegs(result, "bp").flatMap((q) => [[q[0], q[1]], [q[2], q[3]]] as Array<[number, number]>);
    const dashEnds = readSegs(result, "bd").flatMap((q) => [[q[0], q[1]], [q[2], q[3]]] as Array<[number, number]>);
    const wedgePts = pointsOf(shapeBy(result, "bw")?.d);
    const hits = (pts: Array<[number, number]>, px: number, py: number): boolean => pts.some((q) => dist(q, [px, py]) < 3.2);
    const styleOf = (px: number, py: number): string => [hits(plainEnds, px, py) ? "plain" : "", hits(dashEnds, px, py) ? "dash" : "", hits(wedgePts, px, py) ? "wedge" : ""].filter(Boolean).join("+") || "none";
    const bondsDrawn = readSegs(result, "bp").length + readSegs(result, "bd").length / 5 + wedgePts.length / 3;
    if (bondsDrawn !== l.n) out.push(`${bondsDrawn} bonds are drawn and the formula has ${l.n} bonded atoms`);
    for (const s of ligs) {
      const i = slotAt(angleOf(Number(s.x), Number(s.y)));
      if (i < 0) {
        out.push("an atom is not in a direction of the electron arrangement");
        continue;
      }
      used.add(i);
      const want = slots[i]!.style;
      const got = styleOf(Number(s.x), Number(s.y));
      if (got !== want) out.push(`a bond drawn ${got} should be drawn ${want}`);
    }
    const dots = readDots(result, "lp");
    const lonePairs: number[] = [];
    for (let i = 0; i + 1 < dots.length; i += 2) {
      if (!near(dist(dots[i]!, dots[i + 1]!), 1.1, 0.12) || !near(dist([(dots[i]![0] + dots[i + 1]![0]) / 2, (dots[i]![1] + dots[i + 1]![1]) / 2], centre), 3.9, 0.12)) out.push("a lone pair is not two dots side by side at its place round the central atom");
      const m: [number, number] = [(dots[i]![0] + dots[i + 1]![0]) / 2, (dots[i]![1] + dots[i + 1]![1]) / 2];
      const j = slotAt(angleOf(m[0], m[1]));
      if (j < 0 || used.has(j)) out.push("a lone pair is not in a free direction of the electron arrangement");
      else {
        used.add(j);
        lonePairs.push(j);
      }
    }
    if (lonePairs.length !== l.centralLone) out.push(`${lonePairs.length} lone pairs are drawn and the central atom has ${l.centralLone}`);
    if (ligs.length + lonePairs.length !== l.domains) out.push(`${ligs.length + lonePairs.length} electron domains are drawn and the rules give ${l.domains}`);
    const t = shapeOf(ligs.length, lonePairs.length);
    const printed = parseReadouts(result).get("Shape")?.word;
    if (!t || t.name !== printed) out.push(`the drawing is ${t?.name ?? "no listed shape"} and the label says ${printed ?? "nothing"}`);
    return out.slice(0, 3);
  },
});
