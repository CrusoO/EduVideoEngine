import type { LlmClient } from "@eve/adapters";
import type { ContentRecord } from "@eve/content";
import { syntheticDurationMs, type Approval } from "@eve/gates";
import { resolve } from "@eve/resolver";
import type { AudioTrack, LessonBundle } from "@eve/schema";
import { ARC_PLANNER_VERSION, planArc } from "../arcplan";
import { assembleLesson, type AssembleResult } from "../lesson/assemble";
import { lessonContext, type LessonContext } from "../lesson/context";
import type { ArcPlan, LessonScript } from "../lesson/types";
import { SYSTEM_PROMPT_VERSION } from "../planner";
import { SCRIPTWRITER_VERSION, writeScript } from "../script";
import { assureLesson, type Assurance } from "./assure";
import { synthesizeLesson, type Synthesizer, type VoiceOutput } from "./voice";

export type BuildInput = {
  client: LlmClient;
  store: readonly ContentRecord[];
  skillId: string;
  locale?: string;
  level?: string;
  /** Where the voice is made and with what; "synthetic" times each sentence from its words and makes no audio (tests, and a quick look at the gates). */
  voice: { dir: string; synth: Synthesizer } | "synthetic";
  /** Run the SymPy verifier (default true). A lesson is `publishable` only when it ran. */
  verify?: boolean;
  approvals?: readonly Approval[];
  log?: (line: string) => void;
};

export type BuildFailure = { ok: false; stage: "plan" | "script"; reason: string; details: string[]; requests: number };
export type BuildSuccess = {
  ok: true;
  ctx: LessonContext;
  plan: ArcPlan;
  script: LessonScript;
  assembled: AssembleResult;
  bundle: LessonBundle;
  tracks: AudioTrack[];
  voice?: VoiceOutput;
  assurance: Assurance;
  usage: { model: string; promptVersions: Record<string, string>; requests: number; replayed: number; repairs: number; plannerRepaired: boolean; scriptRepaired: boolean };
};
export type BuildResult = BuildSuccess | BuildFailure;

/** Audio tracks for a lesson with no audio files: each sentence lasts as long as its words take at the configured speaking rate. */
export const syntheticTracks = (bundle: LessonBundle): AudioTrack[] =>
  bundle.script.map((s) => ({ sentenceId: s.id, durationMs: syntheticDurationMs(s.text), hash: "a".repeat(64), provenance: { provider: "synthetic", voice: "none", modelVersion: "0" }, aiGenerated: true }));

/**
 * The whole compile for one skill (ADR 0061): plan the arc, write the script, assemble the bundle, voice every sentence, record the measured length in the plan,
 * and judge the lesson with everything that can judge it. A model is asked at most twice per pass (once, and once more with the validator's messages). A plan or a
 * script that does not pass its own rules after the repair stops the build with its reasons; nothing is guessed in their place.
 */
export async function buildLesson(input: BuildInput): Promise<BuildResult> {
  const { client } = input;
  const log = input.log ?? (() => {});
  const ctx = lessonContext(input.store, input.skillId, input.locale ?? "en-IN", input.level ?? "class-10");
  const before = { ...client.stats };
  const used = () => ({ requests: client.stats.sent - before.sent, replayed: client.stats.replayed - before.replayed, repairs: client.stats.repairs - before.repairs });

  log(`planning the arc for ${ctx.skillId}`);
  const planned = await planArc(client, ctx);
  if (!planned.ok) {
    const details = planned.reason === "invalid" ? planned.errors : planned.reason === "insufficient_content" ? planned.missing : planned.reason === "unknown_id" ? [planned.id] : [];
    return { ok: false, stage: "plan", reason: planned.reason, details, requests: used().requests };
  }
  log(`  ${planned.plan.arcId}: ${planned.plan.beats.map((b) => `${b.slotId} (${b.pattern})`).join(", ")}${planned.repaired ? " [repaired once]" : ""}`);

  log("writing the script");
  const scripted = await writeScript(client, ctx, planned.plan);
  if (!scripted.ok) {
    const details = scripted.reason === "invalid" ? scripted.errors : scripted.reason === "insufficient_content" ? scripted.missing : scripted.reason === "unknown_id" ? [scripted.id] : [];
    return { ok: false, stage: "script", reason: scripted.reason, details, requests: used().requests };
  }

  log("assembling the lesson");
  let assembled = assembleLesson(ctx, planned.plan, scripted.script);
  let tracks: AudioTrack[];
  let voice: VoiceOutput | undefined;
  if (input.voice === "synthetic") tracks = syntheticTracks(assembled.bundle);
  else {
    log("voicing the sentences");
    voice = await synthesizeLesson(assembled.bundle, input.voice.dir, input.voice.synth);
    tracks = voice.tracks;
    log(`  ${voice.synthesized} voiced, ${voice.reused} kept`);
  }
  // the plan records the measured length; only the length differs, so the sentences and their audio stay valid
  try {
    const lengthS = Math.max(1, Math.ceil(resolve(assembled.bundle, tracks).totalMs / 1000));
    if (lengthS !== assembled.bundle.plan.targetLengthS) assembled = assembleLesson(ctx, planned.plan, scripted.script, { targetLengthS: lengthS });
  } catch {
    // a lesson that cannot be resolved is reported by the assurance below
  }

  log("checking the lesson");
  const assurance = await assureLesson({ ctx, bundle: assembled.bundle, tracks, ...(input.approvals ? { approvals: input.approvals } : {}), fallbackBeats: assembled.fallbacks.map((f) => f.beatId), ...(input.verify === undefined ? {} : { verify: input.verify }) });
  const u = used();
  return {
    ok: true,
    ctx,
    plan: planned.plan,
    script: scripted.script,
    assembled,
    bundle: assembled.bundle,
    tracks,
    ...(voice ? { voice } : {}),
    assurance,
    usage: { model: client.model, promptVersions: { system: SYSTEM_PROMPT_VERSION, planner: ARC_PLANNER_VERSION, scriptwriter: SCRIPTWRITER_VERSION }, ...u, plannerRepaired: planned.repaired, scriptRepaired: scripted.repaired },
  };
}
