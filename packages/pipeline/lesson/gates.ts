import { GATE_CONFIG, syntheticDurationMs, type GateContext } from "@eve/gates";
import { LOCALES, type LessonBundle } from "@eve/schema";
import type { LessonContext } from "./context";

/** The narration time of every sentence if it were spoken at the configured rate: what the gates use until there is audio. */
export const syntheticDurations = (bundle: LessonBundle): Record<string, number> => Object.fromEntries(bundle.script.map((s) => [s.id, syntheticDurationMs(s.text)]));

/**
 * What the gates read, from the store and the bundle (the shape `buildCleanFixture` gives them): skills and their prerequisites, the skill of each record, the
 * practice questions a question sentence may cite, the closed list of transitions. A generated lesson is judged as `generated`: the delivery gate warns.
 */
export function gateContext(ctx: LessonContext, bundle: LessonBundle, durationsMs: Readonly<Record<string, number>> = syntheticDurations(bundle), lessonKind: GateContext["lessonKind"] = "generated"): GateContext {
  const questions = [ctx.lesson, ...ctx.prerequisites.map((p) => p.retrieval)].flatMap((r) => r.byKind.practiceQuestion);
  return {
    bundle,
    durationsMs,
    skills: ctx.skills,
    recordSkill: ctx.recordSkill,
    questions: Object.fromEntries(questions.map((q) => [q.id, { text: q.text }])),
    transitions: LOCALES[ctx.locale]?.transitions ?? [],
    coreClaimMinMs: GATE_CONFIG.coreClaimMinMs,
    lessonKind,
  };
}
