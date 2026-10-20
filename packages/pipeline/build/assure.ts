import { checkApprovals, runGates, type Approval } from "@eve/gates";
import { assureLayout } from "@eve/layout";
import { assureTimeline, resolve } from "@eve/resolver";
import { validateBundle, type AudioTrack, type LessonBundle, type Timeline } from "@eve/schema";
import { VerifierUnavailable, verifyBundle } from "@eve/verify";
import type { LessonContext } from "../lesson/context";
import { gateContext } from "../lesson/gates";

export type AssuranceSource = "validator" | "gate" | "approval" | "timeline" | "layout" | "verifier" | "review";
export type AssuranceFinding = { source: AssuranceSource; level: "fail" | "warn"; code: string; message: string; /** The scene a timeline or layout finding is about. */ sceneId?: string };

export type Assurance = {
  /** The validator, the seven gates, the timeline, the layout checks and the SymPy verifier all accept the lesson. This is "passes every gate". */
  passes: boolean;
  /** `passes`, and every grounded claim has a current approval, and no scene is a stand-in waiting for a person. Only such a lesson may be shown to a family. */
  publishable: boolean;
  findings: AssuranceFinding[];
  /** The resolved length of the lesson, when it could be resolved. */
  lengthMs: number | null;
  /** True when the verifier ran and proved every check; null when it was not run. */
  verified: boolean | null;
  verifierCounts?: Record<string, number>;
  timeline?: Timeline;
};

export type AssureInput = {
  ctx: LessonContext;
  bundle: LessonBundle;
  /** The audio of every sentence: its measured duration is what the timeline and the delivery gate use. */
  tracks: readonly AudioTrack[];
  /** Approvals of the grounded records, outside the bundle, tied to record hashes. */
  approvals?: readonly Approval[];
  /** Scenes that were replaced by the template scene (beat ids): a person must look at each before the lesson is published. */
  fallbackBeats?: readonly string[];
  /** Run the SymPy verifier (needs Python). A lesson is verified only when it ran and said ok. */
  verify?: boolean;
  /** The Python command the verifier runs with (the default is found from the environment). */
  python?: string;
};

/**
 * Everything that can judge a finished lesson, in one report (ADR 0061): the bundle validator, gates G1 to G7 with the real audio durations, the resolver and its
 * dead-air and length checks, the layout checks at the phone and the desktop frame, and the SymPy verifier. `passes` needs none of these to fail; `publishable`
 * also needs the approvals and no stand-in scene. A check that cannot run (the verifier, the resolver) is a failure, never a pass.
 */
export async function assureLesson(input: AssureInput): Promise<Assurance> {
  const { ctx, bundle, tracks } = input;
  const findings: AssuranceFinding[] = [];
  const add = (source: AssuranceSource, level: "fail" | "warn", code: string, message: string, sceneId?: string) => findings.push({ source, level, code, message, ...(sceneId ? { sceneId } : {}) });

  const valid = validateBundle(bundle);
  for (const i of valid.issues) add("validator", "fail", i.path, i.message);
  for (const w of valid.warnings) add("validator", "warn", w.path, w.message);

  const durations = Object.fromEntries(tracks.map((t) => [t.sentenceId, t.durationMs]));
  for (const f of runGates(gateContext(ctx, bundle, durations))) add("gate", f.level, `${f.gate} ${f.code}`, f.message);

  let timeline: Timeline | undefined;
  try {
    timeline = resolve(bundle, tracks);
    for (const f of assureTimeline(timeline, { kind: "standard" })) add("timeline", f.level, f.code, f.message, f.sceneId);
    for (const f of assureLayout(bundle, timeline)) add("layout", f.level, f.code, f.message, f.sceneId);
  } catch (e) {
    add("timeline", "fail", "cannot-resolve", `the lesson cannot be resolved against its audio: ${(e as Error).message}`);
  }

  let verified: boolean | null = null;
  let verifierCounts: Record<string, number> | undefined;
  if (input.verify !== false) {
    try {
      const report = await (input.python === undefined ? verifyBundle(bundle) : verifyBundle(bundle, input.python));
      verified = report.ok;
      verifierCounts = report.counts;
      for (const f of report.failed) add("verifier", "fail", f.kind, `${f.id}: ${f.detail}`);
      if (!report.ok && report.failed.length === 0) add("verifier", "fail", "not-ok", "the verifier did not say ok");
    } catch (e) {
      verified = false;
      add("verifier", "fail", e instanceof VerifierUnavailable ? "unavailable" : "error", `NOT verified: ${(e as Error).message}`);
    }
  }

  for (const f of checkApprovals(bundle, ctx.hashes, input.approvals ?? [])) add("approval", "fail", f.code, f.message);
  for (const beatId of input.fallbackBeats ?? []) add("review", "fail", "needs-human-review", `beat ${beatId} has the template scene and must be looked at by a person`);

  const blocking = findings.filter((f) => f.level === "fail");
  const passes = blocking.every((f) => f.source === "approval" || f.source === "review") && (input.verify === false || verified === true);
  return {
    passes,
    publishable: passes && blocking.length === 0 && verified === true,
    findings,
    lengthMs: timeline?.totalMs ?? null,
    verified,
    ...(verifierCounts ? { verifierCounts } : {}),
    ...(timeline ? { timeline } : {}),
  };
}
