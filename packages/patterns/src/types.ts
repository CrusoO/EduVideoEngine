import type { Claim, Expr, PEDAGOGY_BEAT_KINDS, SceneSpec } from "@eve/schema";

export type PedagogyBeatKind = (typeof PEDAGOGY_BEAT_KINDS)[number];
import type { Retrieval } from "@eve/content";

/**
 * A slot is a hole in a scene skeleton. A `content` slot is filled from retrieved records and from nothing else (an expression id, the roots of a
 * stored solution, a plot window). A `writer` slot is a short text the planner, scriptwriter or composer supplies (a title, a question, alt text);
 * it is length-checked and never holds maths.
 */
export type Slot = { name: string; source: "content" | "writer"; what: string; optional?: boolean; maxChars?: number; maxWords?: number };

/** What a caller supplies to instantiate a pattern for one beat. */
export type PatternArgs = {
  sceneId: string;
  beatId: string;
  /** The ids of the beat's narration sentences, in order. Cues anchor to these and to nothing else. */
  sentenceIds: readonly string[];
  /** The writer slots, by name. */
  text: Readonly<Record<string, string>>;
  /** Let a pattern that can sweep a graph do so (ADR 0070). Off unless asked: a bundle that was built before sweeps, such as the reference lesson, must not change. */
  sweep?: boolean;
};

/** A scene made from a pattern, with what it adds to the bundle: expressions (such as the points of a number line), claims (derived) and records used. */
export type Instance = {
  scene: SceneSpec;
  expressions: Record<string, Expr>;
  claims: Claim[];
  /** Ids of the content records the scene was built from. */
  recordIds: string[];
};

export type FillResult<C> = { ok: true; content: C } | { ok: false; missing: string[] };

/** Whether the scene carries a pause-and-ask: required (the writer must give the question), optional, or none. */
export type PauseSupport = "required" | "optional" | "none";

export type Pattern<C = unknown> = {
  id: string;
  useWhen: string;
  /** The beat kinds this pattern suits. A worked beat must use a pattern whose claims are derived from a stored solution. */
  kinds: readonly ("predict" | "explore" | "explain" | "worked" | "check")[];
  /** The CO-2 beat kinds this pattern may fill (ADR 0028, AM-11): what the arcs ask for. */
  beatKinds: readonly PedagogyBeatKind[];
  pause: PauseSupport;
  /** True when the scene brings claims derived from a stored solution (the worked-beat patterns). */
  derivesClaims: boolean;
  /** The components the scene uses, from the closed component registry. */
  components: readonly string[];
  slots: readonly Slot[];
  /** Fewest narration sentences the beat needs (cues anchor to different sentences). */
  minSentences: number;
  /** Height cost in pixels at the design phone, worst case (a two-line title), computed from component-costs.json. */
  heightCostPx: number;
  /** Fills the content slots from retrieved records, or says what is missing. Deterministic. */
  fill(r: Retrieval): FillResult<C>;
  /** The ids of the records a scene of this pattern is built from: a beat that uses the pattern must list them as its sourceIds. */
  sources(content: C): string[];
  build(content: C, args: PatternArgs): Instance;
};

export class PatternError extends Error {}
