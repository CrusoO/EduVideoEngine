import type { Claim, Expr, SceneSpec } from "@eve/schema";
import type { Retrieval } from "@eve/content";

/**
 * A slot is a hole in a scene skeleton. A `content` slot is filled from retrieved records and from nothing else (an expression id, the roots of a
 * stored solution, a plot window). A `writer` slot is a short text the planner, scriptwriter or composer supplies (a title, a question, alt text);
 * it is length-checked and never holds maths.
 */
export type Slot = { name: string; source: "content" | "writer"; what: string; optional?: boolean; maxChars?: number };

/** What a caller supplies to instantiate a pattern for one beat. */
export type PatternArgs = {
  sceneId: string;
  beatId: string;
  /** The ids of the beat's narration sentences, in order. Cues anchor to these and to nothing else. */
  sentenceIds: readonly string[];
  /** The writer slots, by name. */
  text: Readonly<Record<string, string>>;
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

export type Pattern<C = unknown> = {
  id: string;
  useWhen: string;
  /** The components the scene uses, from the closed component registry. */
  components: readonly string[];
  slots: readonly Slot[];
  /** Fewest narration sentences the beat needs (cues anchor to different sentences). */
  minSentences: number;
  /** Height cost in pixels at the design phone, worst case (a two-line title), computed from component-costs.json. */
  heightCostPx: number;
  /** Fills the content slots from retrieved records, or says what is missing. Deterministic. */
  fill(r: Retrieval): FillResult<C>;
  build(content: C, args: PatternArgs): Instance;
};

export class PatternError extends Error {}
