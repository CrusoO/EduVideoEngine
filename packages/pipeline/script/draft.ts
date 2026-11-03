import { claimExpressions } from "@eve/gates";
import { LIBRARY } from "@eve/patterns";
import { wordsOf } from "@eve/schema";
import type { BeatBuild } from "../lesson/beats";
import type { LessonContext } from "../lesson/context";
import type { ArcPlan } from "../lesson/types";
import { SCRIPT_LIMITS, claimMeaning, scriptOf, scriptwriterData, writesOf, checkScript } from "./index";

/**
 * The narration as code writes it (ADR 0088): one sentence for each claim, from what the claim means, with the placeholders and the number words the claim already holds,
 * and neutral spoken filler only where a rule asks for more speech than the claims give (a core claim needs enough words to be heard, a pattern needs a minimum of
 * sentences). It adds no fact, so it cannot be wrong; it is plain, not good. It is the floor of the polisher: whatever a model does, this is what the lesson falls back to,
 * so a lesson never fails because a model was slow, refused or wrong. `checkScript` judges it like any other script.
 */
export type DraftBeat = { beatId: string; sentences: Array<{ claimId: string; text: string }>; prompt?: string; note?: string };

/** Spoken filler that states nothing, used in turn, never twice in a lesson while the list lasts. */
export const FILLER_SENTENCES: readonly string[] = [
  "Take a moment to let that sink in.",
  "This is the part that the rest of the lesson builds on.",
  "Say it in your own words, and it will stay with you.",
  "Everything that follows rests on this idea.",
  "Read it once more, slowly, and notice each part.",
  "It is worth holding on to this before we go on.",
  "Keep this in mind, because we will use it again.",
  "If it feels new, that is fine; the next part will help.",
];

const PROMPTS: Record<string, string> = {
  worked: "Try the next step yourself before it appears.",
  check: "Have a go at this before you look at the answer.",
  concept: "What do you notice about this?",
  mistake: "Can you see why this goes wrong?",
  hook: "What do you think the answer will be?",
  prerequisite: "Can you remember how this works?",
};

/** A claim's meaning as a spoken sentence: a capital letter, a full stop, single spaces; a leading placeholder is left alone. */
export function sentenceOf(says: string): string {
  const t = says.replace(/\s+/g, " ").trim().replace(/[.!?]+$/, "");
  const cap = t.startsWith("{") ? t : `${t.charAt(0).toUpperCase()}${t.slice(1)}`;
  return `${cap}.`;
}

/** Cuts a sentence that is too long at its comma nearest the middle, so each part can be said in one breath. */
function split(text: string, maxWords: number): string[] {
  if (wordsOf(text).length <= maxWords) return [text];
  const commas = [...text.matchAll(/,\s+/g)].map((m) => m.index!);
  if (commas.length === 0) return [text];
  const mid = text.length / 2;
  const at = commas.reduce((a, b) => (Math.abs(b - mid) < Math.abs(a - mid) ? b : a));
  const head = text.slice(0, at).trim();
  const tail = text.slice(at + 1).trim();
  return [`${head}.`, `${tail.charAt(0).toUpperCase()}${tail.slice(1)}`].flatMap((p) => split(p, maxWords));
}

const noteOf = (says: string, title: string): string => {
  const plain = says.replace(/\s+/g, " ").trim();
  const fits = (t: string) => !/[\d{}]/.test(t) && wordsOf(t).length <= SCRIPT_LIMITS.noteWords && t.length <= SCRIPT_LIMITS.noteChars;
  const words = plain.split(" ");
  for (let n = Math.min(words.length, SCRIPT_LIMITS.noteWords); n >= 3; n--) {
    const cut = words.slice(0, n).join(" ").replace(/[,.;:]+$/, "");
    if (fits(cut) && !/[{}\d]/.test(words.slice(0, n).join(" "))) return cut.charAt(0).toUpperCase() + cut.slice(1);
  }
  return fits(title) ? title : title.split(/\s+/).slice(0, SCRIPT_LIMITS.noteWords).join(" ").replace(/\d/g, "");
};

export function draftScript(ctx: LessonContext, plan: ArcPlan, builds: readonly BeatBuild[]): { beats: DraftBeat[]; problems: string[] } {
  const data = scriptwriterData(ctx, builds);
  let filler = 0;
  const nextFiller = (): string => FILLER_SENTENCES[filler++ % FILLER_SENTENCES.length]!;
  const beats: DraftBeat[] = [];
  for (const b of builds.filter((x) => x.claims.length > 0)) {
    const d = data.beats.find((x) => x.beatId === b.beat.id)!;
    const pattern = LIBRARY.find((p) => p.id === b.beat.pattern)!;
    const sentences: DraftBeat["sentences"] = [];
    for (const c of d.claims) {
      const mine = split(sentenceOf(c.says), SCRIPT_LIMITS.sentenceWords).map((text) => ({ claimId: c.id, text }));
      let words = mine.reduce((a, s) => a + wordsOf(s.text).length, 0);
      while (c.importance === "core" && words < SCRIPT_LIMITS.coreClaimWords) {
        const text = nextFiller();
        mine.push({ claimId: c.id, text });
        words += wordsOf(text).length;
      }
      sentences.push(...mine);
    }
    const needed = b.beat.pattern === "check-question" ? 1 : pattern.minSentences;
    while (sentences.length < needed) sentences.push({ claimId: sentences.at(-1)!.claimId, text: nextFiller() });
    const writes = writesOf(b);
    const beat: DraftBeat = { beatId: b.beat.id, sentences };
    if (writes.prompt) beat.prompt = PROMPTS[b.beatKind] ?? PROMPTS.concept!;
    if (writes.note) beat.note = noteOf(d.claims[0]?.says ?? b.beat.title, b.beat.title);
    beats.push(beat);
  }
  return { beats, problems: checkScript(ctx, plan, builds, { beats }) };
}

export { claimMeaning, claimExpressions, scriptOf };
