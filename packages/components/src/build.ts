import katex from "katex";
import type { LessonBundle } from "@eve/schema";
import { termIds } from "@eve/schema";
import { MAX_TERMS_PER_EQUATION } from "./equation";
import { formulaLatex, type ColorTheme } from "./latex";
import { mathKey, type MathCache } from "./math-cache";
import type { MathRenderer } from "./types";

/** Build-time and test-time entry: the only module that imports KaTeX. The player never loads it. */
export const katexMath: MathRenderer = (latex, display) =>
  katex.renderToString(latex, { displayMode: display, throwOnError: true, strict: "error", trust: false, output: "htmlAndMathml" });

/**
 * Typeset every formula of a bundle once. Equations come from fixed expression trees, so the set is closed and known at
 * build time. The result is a derived cache (keyed by LaTeX, never part of the hashed bundle): rebuild it freely, it
 * changes nothing the bundle hash covers.
 */
export function buildMathCache(bundle: Pick<LessonBundle, "scenes" | "script" | "expressions">, math: MathRenderer = katexMath, colors?: ColorTheme): MathCache {
  const cache: MathCache = {};
  const add = (id: string, display: boolean, focus?: string[], dimmed?: ReadonlySet<string>) => {
    const expr = bundle.expressions[id];
    if (!expr) throw new Error(`unknown expression ${id}`);
    const latex = formulaLatex(expr, colors, focus, dimmed);
    cache[mathKey(latex, display)] ??= math(latex, display);
  };
  // Captions typeset the formulas inside narration sentences inline.
  for (const sentence of bundle.script) for (const id of sentence.exprRefs) add(id, false);
  for (const scene of bundle.scenes) {
    for (const o of scene.objects) {
      if (o.component === "equation" && o.exprRef) {
        const display = (o.props as { display?: boolean }).display ?? true;
        const focus = (o.props as { focus?: string[] }).focus;
        add(o.exprRef, display, focus);
        // A cue may dim or highlight a named term at any moment: typeset every combination of dimmed terms, so the player only looks them up.
        const cued = (scene.cues ?? []).some((c) => c.targetObject.startsWith(`${o.id}#`));
        const terms = cued ? [...termIds(bundle.expressions[o.exprRef]!)].sort() : [];
        if (terms.length > MAX_TERMS_PER_EQUATION) throw new Error(`equation ${o.id} has ${terms.length} named terms and cues on them: at most ${MAX_TERMS_PER_EQUATION}`);
        for (let mask = 1; mask < 1 << terms.length; mask++) add(o.exprRef, display, focus, new Set(terms.filter((_t, i) => mask & (1 << i))));
      }
      if (o.component === "stepList") for (const id of (o.props as { steps?: string[] }).steps ?? []) add(id, false);
    }
  }
  return cache;
}
