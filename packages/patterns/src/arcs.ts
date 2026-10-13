import { LIMITS } from "@eve/schema";
import { LIBRARY, isTextHeavy } from "./patterns";
import type { PedagogyBeatKind } from "./types";

/**
 * Lesson arcs (CO-2, ADR 0028, 0038). An arc is an ordered list of slots; each slot is filled by one beat, and each slot has exactly one beat kind (AM-11).
 * The arcs are CO-2 section 5.1; the slot-to-beat-kind table is AM-11. Change either by ADR.
 */
export const SLOT_BEAT_KIND = {
  hook: "hook",
  prerequisite_activation: "prerequisite",
  concept: "concept",
  worked_example: "worked",
  second_worked_example: "worked",
  common_mistake_contrast: "mistake",
  why_it_fails: "mistake",
  check: "check",
} as const satisfies Record<string, PedagogyBeatKind>;
export type SlotId = keyof typeof SLOT_BEAT_KIND;
export const SLOT_IDS = Object.keys(SLOT_BEAT_KIND) as SlotId[];

/** `always` slots must be filled; `ifPrerequisites` slots must be filled when the skill has prerequisites and may be left out when it has none. */
export type Need = "always" | "ifPrerequisites";
export type ArcSlot = { slotId: SlotId; need: Need };
export type Arc = { id: string; slots: readonly ArcSlot[] };

const slot = (slotId: SlotId, need: Need = "always"): ArcSlot => ({ slotId, need });
/** The three arcs of CO-2 section 5.1, exactly. Every slot is required except prerequisite activation, which is required only when the skill has prerequisites. An extra slot needs an ADR. */
export const ARCS = {
  /** Start with the problem, then the idea, then work it. */
  problem_first: {
    id: "problem_first",
    slots: [slot("hook"), slot("prerequisite_activation", "ifPrerequisites"), slot("concept"), slot("worked_example"), slot("common_mistake_contrast"), slot("check")],
  },
  /** Start with the idea, then show it at work twice. */
  concept_first: {
    id: "concept_first",
    slots: [slot("prerequisite_activation", "ifPrerequisites"), slot("concept"), slot("worked_example"), slot("second_worked_example"), slot("check")],
  },
  /** Start from a mistake students make (the hook shows it; its beat kind is hook), then why it fails. */
  misconception_first: {
    id: "misconception_first",
    slots: [slot("hook"), slot("why_it_fails"), slot("concept"), slot("worked_example"), slot("check")],
  },
} as const satisfies Record<string, Arc>;
export type ArcId = keyof typeof ARCS;
export const ARC_IDS = Object.keys(ARCS) as ArcId[];

/** The slot sequences an arc allows for a skill: every required slot, any choice of the others, in arc order. */
export function slotSequences(arcId: ArcId, hasPrerequisites: boolean): SlotId[][] {
  const slots = ARCS[arcId].slots;
  const choosable = slots.filter((s) => s.need === "ifPrerequisites" && !hasPrerequisites);
  const out: SlotId[][] = [];
  for (let mask = 0; mask < 1 << choosable.length; mask++) {
    const dropped = new Set(choosable.filter((_s, i) => (mask & (1 << i)) !== 0).map((s) => s.slotId));
    out.push(slots.filter((s) => !dropped.has(s.slotId)).map((s) => s.slotId));
  }
  return out;
}

/** Library patterns that may fill a slot (by its beat kind), split into text-heavy and not. */
export function patternsForSlot(slotId: SlotId) {
  const fit = LIBRARY.filter((p) => (p.beatKinds as readonly string[]).includes(SLOT_BEAT_KIND[slotId]));
  return { all: fit.map((p) => p.id), picture: fit.filter((p) => !isTextHeavy(p)).map((p) => p.id), textHeavy: fit.filter((p) => isTextHeavy(p)).map((p) => p.id) };
}

/** The fewest text-heavy beats a slot sequence can have: a slot with a picture pattern costs none, any other costs one. A slot no pattern fills makes the sequence impossible. */
export function fewestTextHeavy(sequence: readonly SlotId[]): number | null {
  let heavy = 0;
  for (const s of sequence) {
    const p = patternsForSlot(s);
    if (p.all.length === 0) return null;
    if (p.picture.length === 0) heavy++;
  }
  return heavy;
}

export type ArcLengthResult = {
  beats: number;
  /** At most half (rounded down) are text-heavy: the rule of ADR 0038. */
  possible: boolean;
  fewestHeavy: number | null;
  allowed: number;
  /** For the relaxation proposed in ADR 0043 (at most half, rounded up). Reported beside the rule, not used by it. */
  possibleIfRoundedUp: boolean;
  allowedIfRoundedUp: number;
  sequence?: SlotId[];
};
export type ArcResult = { arcId: ArcId; hasPrerequisites: boolean; lengths: ArcLengthResult[]; satisfiable: boolean };

/**
 * For each arc and each lesson length of four beats or more that the arc can produce, can the beats be given patterns so that at most half are text-heavy?
 * (ADR 0038). Reported, never bent: if an arc cannot, the rule is relaxed by ADR, the patterns are not changed to pass.
 */
export function textHeavyReport(): ArcResult[] {
  const out: ArcResult[] = [];
  for (const arcId of ARC_IDS) {
    for (const hasPrerequisites of [true, false]) {
      const byLength = new Map<number, ArcLengthResult>();
      for (const seq of slotSequences(arcId, hasPrerequisites)) {
        const n = seq.length;
        if (n < 4 || n > LIMITS.beats.max) continue;
        const fewest = fewestTextHeavy(seq);
        const allowed = Math.floor(n / 2);
        const cur = byLength.get(n);
        const better = !cur || (fewest !== null && (cur.fewestHeavy === null || fewest < cur.fewestHeavy));
        if (better) byLength.set(n, { beats: n, possible: fewest !== null && fewest <= allowed, fewestHeavy: fewest, allowed, possibleIfRoundedUp: fewest !== null && fewest <= Math.ceil(n / 2), allowedIfRoundedUp: Math.ceil(n / 2), sequence: seq });
      }
      const lengths = [...byLength.values()].sort((a, b) => a.beats - b.beats);
      out.push({ arcId, hasPrerequisites, lengths, satisfiable: lengths.length > 0 && lengths.every((l) => l.possible) });
    }
  }
  return out;
}
