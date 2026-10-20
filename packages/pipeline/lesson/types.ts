import { ARC_IDS, SLOT_IDS, type ArcId, type SlotId } from "@eve/patterns";
import { PREREQUISITE_STATUSES } from "@eve/schema";
import { z } from "zod";

const id = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_.:-]*$/);

/**
 * One beat of the arc plan: what the planner decides (ADR 0061). The beat kind, the pause, the legacy kind, the template and the scene are all derived by code
 * from the slot and the pattern, so the planner cannot get them wrong. `sourceIds` are the records the beat draws on: the pattern's own records and any
 * concept claims the beat states.
 */
export const ArcBeat = z
  .object({
    id,
    slotId: z.enum(SLOT_IDS as [SlotId, ...SlotId[]]),
    pattern: z.string().min(1),
    title: z.string().min(1).max(60),
    learningGoal: z.string().min(1),
    sourceIds: z.array(id).min(1),
  })
  .strict();
export type ArcBeat = z.infer<typeof ArcBeat>;

export const ArcPlan = z
  .object({
    arcId: z.enum(ARC_IDS as [ArcId, ...ArcId[]]),
    /** One entry for each direct prerequisite of the lesson's skill: recapped by a beat, linked, or assumed at the lesson's level. */
    prerequisites: z.array(z.object({ skillId: id, status: z.enum(PREREQUISITE_STATUSES) }).strict()),
    beats: z.array(ArcBeat).min(1),
  })
  .strict();
export type ArcPlan = z.infer<typeof ArcPlan>;

/** A sentence the scriptwriter writes: one claim of the beat, or a link between two claims joined by a dependency edge. Its role, id and order are code's. */
export const BodySentence = z.union([
  z.object({ claimId: id, text: z.string().min(1) }).strict(),
  z.object({ linkClaimIds: z.tuple([id, id]), text: z.string().min(1) }).strict(),
]);
export type BodySentence = z.infer<typeof BodySentence>;

/** The scriptwriter's answer for one beat that has claims: its sentences, and the two short texts a pattern may ask for. */
export const BeatScript = z
  .object({
    sentences: z.array(BodySentence).min(1),
    /** The question put to the student when the scene pauses (patterns with a pause-and-ask). */
    prompt: z.string().min(1).optional(),
    /** The short line shown on a statement card. */
    note: z.string().min(1).optional(),
  })
  .strict();
export type BeatScript = z.infer<typeof BeatScript>;

/** The scripts of a lesson by beat id. A beat without claims has no entry: its sentences are the goal and a transition, written by code. */
export type LessonScript = Readonly<Record<string, BeatScript>>;
