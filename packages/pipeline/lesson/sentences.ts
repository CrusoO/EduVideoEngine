import type { NarrationSentence } from "@eve/schema";
import { sentenceIdOf, type BeatBuild } from "./beats";
import type { BeatScript } from "./types";

/** The transition a beat with no claims gets: the closed list of the language is where every transition must come from (G5). */
export const PREFERRED_TRANSITION = "Let us see why.";
/** Transitions that may follow it when the beat has to last longer (the reading time of its scene): each is on the closed list, so no gate sees a new fact. */
export const PADDING_TRANSITIONS: readonly string[] = ["Here is the next step.", "Now let us look at the next idea."];

const PLACEHOLDER = /\{expr:([A-Za-z0-9][A-Za-z0-9_.:-]*)\}/g;
/** The expression ids a text uses, once each, in order. */
export const placeholdersOf = (text: string): string[] => [...new Set([...text.matchAll(PLACEHOLDER)].map((m) => m[1]!))];

export type BeatSentences = {
  sentences: NarrationSentence[];
  /** The sentences the pattern anchors its cues and its pause to, in order (see `windowOf`). */
  window: string[];
};

/**
 * The narration of one beat, with the roles and ids code owns (ADR 0061): the learning goal first, word for word; the practice question when the beat asks
 * one; then the scriptwriter's claim and link sentences, or, for a beat that makes no claim, one transition from the language's list. Nothing here is
 * judged: the gates judge the result.
 */
export function sentencesOf(b: BeatBuild, script: BeatScript | undefined, transitions: readonly string[], extraTransitions = 0): BeatSentences {
  const out: NarrationSentence[] = [];
  const add = (role: NarrationSentence["role"], text: string, more: Partial<NarrationSentence> = {}): string => {
    const id = sentenceIdOf(b.index, out.length + 1);
    out.push({ id, beatId: b.beat.id, text, termSpans: [], exprRefs: placeholdersOf(text), status: "draft", role, ...more });
    return id;
  };

  add("goal", b.beat.learningGoal);
  const question = b.question ? add("question", b.question.text, { questionId: b.question.id }) : undefined;
  const bearing: string[] = [];
  if (b.claims.length > 0) {
    for (const s of script?.sentences ?? []) {
      bearing.push("claimId" in s ? add("claim", s.text, { claimId: s.claimId }) : add("link", s.text, { linkClaimIds: [...s.linkClaimIds] }));
    }
  } else {
    const t = transitions.includes(PREFERRED_TRANSITION) ? PREFERRED_TRANSITION : transitions[0];
    if (t !== undefined) add("transition", t);
    for (const more of PADDING_TRANSITIONS.filter((p) => transitions.includes(p)).slice(0, Math.max(0, extraTransitions))) add("transition", more);
  }
  return { sentences: out, window: windowOf(b, out, question, bearing) };
}

/**
 * The sentences a pattern is given. Its cues sit on the first sentences it is given and its pause-and-ask after the second to last, so a pattern is shown the
 * sentences that carry claims (G3 wants its cues there); a check question is shown the question and then the sentence that gives the answer, which is what its
 * pause and its answer cue expect; a beat with no claims is shown all its sentences, except that a prediction (a pause after the goal question, the answer
 * after the transitions) is shown the goal and the last sentence, so padding it with transitions does not move its pause.
 */
export function windowOf(b: BeatBuild, sentences: readonly NarrationSentence[], question: string | undefined, bearing: readonly string[]): string[] {
  if (b.beat.pattern === "check-question" && question !== undefined) return bearing.length > 0 ? [question, bearing[0]!] : [question];
  if (b.claims.length > 0) return [...bearing];
  if (b.beat.pattern === "predict-then-reveal" && sentences.length > 2) return [sentences[0]!.id, sentences.at(-1)!.id];
  return sentences.map((s) => s.id);
}
