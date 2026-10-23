import type { LlmClient } from "@eve/adapters";
import type { ContentRecord } from "@eve/content";
import { syntheticDurationMs, type Approval } from "@eve/gates";
import { resolve } from "@eve/resolver";
import type { AudioTrack, LessonBundle } from "@eve/schema";
import { ARC_PLANNER_VERSION, planArc } from "../arcplan";
import { assembleLesson, type AssembleResult, type Features } from "../lesson/assemble";
import { PADDING_TRANSITIONS } from "../lesson/sentences";
import { lessonContext, type LessonContext } from "../lesson/context";
import type { ArcPlan, LessonScript } from "../lesson/types";
import { SYSTEM_PROMPT_VERSION } from "../planner";
import { SCRIPTWRITER_VERSION, writeScript } from "../script";
import { SCRIPTWRITER_V2_VERSION, writeScriptPerBeat } from "../script/per-beat";
import { assureLesson, type Assurance } from "./assure";
import { synthesizeLesson, type Synthesizer, type VoiceOutput } from "./voice";

export type BuildInput = {
  client: LlmClient;
  store: readonly ContentRecord[];
  skillId: string;
  locale?: string;
  level?: string;
  /** Where the voice is made and with what; "synthetic" times each sentence from its words and makes no audio (tests, and a quick look at the gates). */
  voice: { dir: string; synth: Synthesizer; jobs?: number } | "synthetic";
  /** Run the SymPy verifier (default true). A lesson is `publishable` only when it ran. */
  verify?: boolean;
  approvals?: readonly Approval[];
  /** Build without signalling highlights or carried objects, to compare with a lesson built with them (ADR 0066, 0067). */
  features?: Features;
  /** How the script is written: one request for the lesson (default, scriptwriter.v1) or one request for each beat (scriptwriter.v2, ADR 0087). */
  script?: { mode: "whole" } | { mode: "per-beat"; candidates?: number };
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
  const perBeat = input.script?.mode === "per-beat";
  const scripted = perBeat ? await writeScriptPerBeat(client, ctx, planned.plan, { candidates: input.script?.mode === "per-beat" ? input.script.candidates : undefined }) : await writeScript(client, ctx, planned.plan);
  if (!scripted.ok) {
    const details = scripted.reason === "invalid" ? scripted.errors : scripted.reason === "insufficient_content" ? scripted.missing : scripted.reason === "unknown_id" ? [scripted.id] : [];
    return { ok: false, stage: "script", reason: scripted.reason, details, requests: used().requests };
  }

  log("assembling the lesson");
  const padded: Record<string, number> = {};
  let assembled = assembleLesson(ctx, planned.plan, scripted.script, { features: input.features });
  let tracks: AudioTrack[];
  let voice: VoiceOutput | undefined;
  let assurance: Assurance;
  const assure = (verify: boolean) => assureLesson({ ctx, bundle: assembled.bundle, tracks, ...(input.approvals ? { approvals: input.approvals } : {}), fallbackBeats: assembled.fallbacks.map((f) => f.beatId), verify });

  // Voice, measure, judge; and, while a scene is too short to be read, give the beat one more transition (a beat that makes no claim has only its goal and one
  // transition, so its length is code's to adjust) and voice again: only the new sentence is voiced. Bounded by the transitions the language lists.
  for (let round = 0; ; round++) {
    if (input.voice === "synthetic") tracks = syntheticTracks(assembled.bundle);
    else {
      log(round === 0 ? "voicing the sentences" : "voicing the sentences that changed");
      voice = await synthesizeLesson(assembled.bundle, input.voice.dir, input.voice.synth, { jobs: input.voice.jobs });
      tracks = voice.tracks;
      log(`  ${voice.synthesized} voiced, ${voice.reused} kept`);
    }
    // the plan records the measured length; only the length differs, so the sentences and their audio stay valid
    try {
      const lengthS = Math.max(1, Math.ceil(resolve(assembled.bundle, tracks).totalMs / 1000));
      if (lengthS !== assembled.bundle.plan.targetLengthS) assembled = assembleLesson(ctx, planned.plan, scripted.script, { targetLengthS: lengthS, extraTransitions: padded, features: input.features });
    } catch {
      // a lesson that cannot be resolved is reported by the assurance below
    }
    log(round === 0 ? "checking the lesson" : "checking it again");
    assurance = await assure(false);
    const tooShort = [...new Set(assurance.findings.filter((f) => f.code === "reading-time" && f.sceneId).map((f) => assembled.bundle.scenes.find((s) => s.id === f.sceneId)?.beatId))]
      .filter((id): id is string => id !== undefined && assembled.builds.find((b) => b.beat.id === id)?.claims.length === 0 && (padded[id] ?? 0) < PADDING_TRANSITIONS.length);
    if (tooShort.length === 0) break;
    for (const id of tooShort) padded[id] = (padded[id] ?? 0) + 1;
    log(`  the scene of ${tooShort.join(", ")} is too short to read: one more transition`);
    assembled = assembleLesson(ctx, planned.plan, scripted.script, { extraTransitions: padded, features: input.features });
  }
  if (input.verify !== false) assurance = await assure(true);
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
    usage: { model: client.model, promptVersions: { system: SYSTEM_PROMPT_VERSION, planner: ARC_PLANNER_VERSION, scriptwriter: perBeat ? SCRIPTWRITER_V2_VERSION : SCRIPTWRITER_VERSION }, ...u, plannerRepaired: planned.repaired, scriptRepaired: scripted.repaired },
  };
}
