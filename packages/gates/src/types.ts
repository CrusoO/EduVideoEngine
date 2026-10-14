import type { LessonBundle } from "@eve/schema";

/** One finding of a gate. `fail` rejects the lesson; `warn` is shown but does not reject. */
export type GateId = "G1" | "G2" | "G3" | "G4" | "G5" | "G6" | "G7" | "Compile";
export type Finding = { gate: GateId; level: "fail" | "warn"; code: string; message: string; ids: string[] };

/** What the content store knows about a skill: its direct prerequisites and the lesson levels at which it may be assumed (AM-10). */
export type SkillFacts = { prerequisiteSkillIds: readonly string[]; assumableAtLevels: readonly string[] };

/**
 * Everything a gate needs, as plain data, so a gate is a pure function. The bundle is spec 2.0.0. Nothing here reads a file or a store: the caller fills it
 * (scripts/verify-gate.ts and the tests build it from the fixture; the compiler will build it from the content store).
 */
export type GateContext = {
  bundle: LessonBundle;
  /** Measured (or, for the synthetic fixture, computed) narration time of each sentence, by sentence id. */
  durationsMs: Readonly<Record<string, number>>;
  /** The skills the lesson can see: direct prerequisites and assumable levels, by skill id. */
  skills: Readonly<Record<string, SkillFacts>>;
  /** The skill each source record belongs to, by record id. */
  recordSkill: Readonly<Record<string, string>>;
  /** The practice questions a question sentence may cite, by id, with the text their sentence must carry. */
  questions: Readonly<Record<string, { text: string }>>;
  /** The closed transition phrases of the lesson's language. */
  transitions: readonly string[];
  /** Narration floor for the sentences of one core claim (config/gates.json). */
  coreClaimMinMs: number;
  /** `reference` lessons fail the delivery gate; `generated` lessons only warn (CO-2 G2). */
  lessonKind: "reference" | "generated";
};
