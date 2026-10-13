import { WORD_BUDGET, spokenLabel } from "@eve/components";
import { TITLE_MAX_CHARS } from "@eve/patterns";
import type { Expr, SceneSpec } from "@eve/schema";
import type { SceneContext } from "../scene/validate";

/**
 * An error the pipeline must not swallow: the caller has to see it (a refused call because the daily cap is reached, a missing fixture in replay mode).
 * Anything else a composer does wrong is handled by the repair retry and then the template fallback.
 */
export class PipelineFatal extends Error {
  readonly fatal = true;
}

/** Longest caption of the template scene: three lines of the body size. */
export const CAPTION_MAX_CHARS = 99;

export type FallbackContent = {
  title: string;
  /** An expression of the lesson that is an equation. It was verified when its record was validated. */
  equation: string;
  caption: string;
  reason: string;
};

/** At most `maxChars` characters and `maxWords` words, cut at a word boundary, with an ellipsis when something was cut. */
const clip = (text: string, maxChars: number, maxWords: number): string => {
  const t = text.replace(/\s+/g, " ").trim();
  const words = t.split(" ");
  if (t.length <= maxChars && words.length <= maxWords) return t;
  let out = "";
  let n = 0;
  for (const w of words) {
    if (n === maxWords - 1 || (out + " " + w).trim().length > maxChars - 1) break;
    out = (out + " " + w).trim();
    n++;
  }
  return `${out.replace(/[\s,;:.-]+$/, "")}…`;
};

/**
 * The plain scene that always passes: a title, one equation, a caption. No cue is clever: the title, the equation and the caption appear in
 * turn on the beat's sentences. It is marked `review: needs-human-review`, so a lesson with such a scene cannot be published unseen.
 */
export function templateScene(ctx: SceneContext, content: FallbackContent): SceneSpec {
  const eq = ctx.expressions[content.equation] as Expr | undefined;
  const last = ctx.sentences.length - 1;
  const at = (i: number) => ({ sentenceId: ctx.sentences[Math.min(i, last)]!.id, at: "start" as const });
  const title = clip(content.title, TITLE_MAX_CHARS, WORD_BUDGET.title);
  return {
    id: ctx.sceneId,
    beatId: ctx.beatId,
    sourceIds: [...ctx.sourceIds],
    objects: [
      { id: "title", component: "text", props: { text: title, role: "title" } },
      { id: "eq", component: "equation", props: { size: "m" }, exprRef: content.equation },
      { id: "caption", component: "text", props: { text: clip(content.caption, CAPTION_MAX_CHARS, WORD_BUDGET.body), role: "body" } },
    ],
    layout: [{ rule: "column", items: ["title", "eq", "caption"] }, { rule: "center", item: "title" }],
    cues: [
      { targetObject: "title", action: "reveal", anchor: at(0), minHoldMs: 800 },
      { targetObject: "eq", action: "reveal", anchor: at(0), minHoldMs: 1500 },
      { targetObject: "caption", action: "reveal", anchor: at(1), minHoldMs: 1500 },
    ],
    a11y: { altText: `${title}. ${eq ? spokenLabel(eq, ctx.locale) : "An equation"}.` },
    review: { status: "needs-human-review", reason: content.reason },
  };
}

/**
 * What the template shows for a beat, from the beat's own data: its title, the first equation its sentences mention (or the lesson's problem),
 * and its first sentence as the caption with each {expr:id} placeholder replaced by "this equation".
 */
export function fallbackContent(ctx: SceneContext, beatTitle: string, problem: string, reason: string): FallbackContent {
  const mentioned = ctx.sentences.flatMap((s) => [...s.text.matchAll(/\{expr:([^}]+)\}/g)].map((m) => m[1]!)).find((id) => ctx.expressions[id]?.op === "eq");
  return {
    title: beatTitle,
    equation: mentioned ?? problem,
    caption: (ctx.sentences[0]?.text ?? beatTitle).replace(/\{expr:[^}]+\}/g, "this equation"),
    reason,
  };
}
