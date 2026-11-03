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
  /**
   * A story from first principles (ADR 0085): a hook, then four beats of the idea built up from what is simplest (what moves, what pushes, what holds back, what the measurements show,
   * what the law says), a worked example, a mistake and a check. Written by a person (or later a model offered it by ADR): the planner is not offered it.
   */
  story_first: {
    id: "story_first",
    slots: [slot("hook"), slot("concept"), slot("concept"), slot("concept"), slot("concept"), slot("worked_example"), slot("common_mistake_contrast"), slot("check")],
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

export type VarietyCheck = { pictureBeats: number; longestTextHeavyRun: number; problems: string[] };

/** The variety rule (ADR 0043) for the beats of a lesson, given which are text-heavy. Lessons shorter than the threshold are not constrained. */
export function varietyCheck(textHeavy: readonly boolean[]): VarietyCheck {
  const { fromBeats, minPictureBeats, maxTextHeavyRun } = LIMITS.variety;
  let run = 0;
  let longest = 0;
  for (const heavy of textHeavy) {
    run = heavy ? run + 1 : 0;
    longest = Math.max(longest, run);
  }
  const pictures = textHeavy.filter((h) => !h).length;
  const problems: string[] = [];
  if (textHeavy.length >= fromBeats) {
    if (pictures < minPictureBeats) problems.push(`${pictures} picture beat(s), at least ${minPictureBeats} needed`);
    if (longest > maxTextHeavyRun) problems.push(`${longest} text-heavy beats in a row, at most ${maxTextHeavyRun} allowed`);
  }
  return { pictureBeats: pictures, longestTextHeavyRun: longest, problems };
}

/**
 * The best the patterns can do for a slot sequence: each slot gets a picture pattern when one fits (that is never worse for either part of the rule),
 * otherwise a text-heavy one. A slot no pattern fills makes the sequence impossible (null).
 */
export function bestFlags(sequence: readonly SlotId[]): boolean[] | null {
  const flags: boolean[] = [];
  for (const s of sequence) {
    const p = patternsForSlot(s);
    if (p.all.length === 0) return null;
    flags.push(p.picture.length === 0);
  }
  return flags;
}

export type ArcLengthResult = { beats: number; possible: boolean; pictureBeats: number; longestTextHeavyRun: number; problems: string[]; sequence: SlotId[]; textHeavy: boolean[] };
export type ArcResult = { arcId: ArcId; hasPrerequisites: boolean; lengths: ArcLengthResult[]; satisfiable: boolean };

/**
 * For each arc, with and without prerequisites, and each lesson length the arc can produce (up to the beat limit), can the beats be given patterns that meet the
 * variety rule? Reported, never bent: if an arc cannot, the rule is changed by ADR; the patterns are not changed to pass.
 */
export function textHeavyReport(): ArcResult[] {
  const out: ArcResult[] = [];
  for (const arcId of ARC_IDS) {
    for (const hasPrerequisites of [true, false]) {
      const lengths: ArcLengthResult[] = [];
      for (const sequence of slotSequences(arcId, hasPrerequisites)) {
        const flags = bestFlags(sequence);
        if (sequence.length < LIMITS.beats.min || sequence.length > LIMITS.beats.max) continue;
        const check = flags ? varietyCheck(flags) : { pictureBeats: 0, longestTextHeavyRun: 0, problems: ["a slot has no pattern"] };
        lengths.push({ beats: sequence.length, possible: flags !== null && check.problems.length === 0, pictureBeats: check.pictureBeats, longestTextHeavyRun: check.longestTextHeavyRun, problems: check.problems, sequence, textHeavy: flags ?? [] });
      }
      lengths.sort((a, b) => a.beats - b.beats);
      out.push({ arcId, hasPrerequisites, lengths, satisfiable: lengths.length > 0 && lengths.every((l) => l.possible) });
    }
  }
  return out;
}
