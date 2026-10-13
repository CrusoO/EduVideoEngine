import katex from "katex";
import type { LessonBundle } from "@eve/schema";
import { toLatex } from "./latex";
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
export function buildMathCache(bundle: Pick<LessonBundle, "scenes" | "expressions">, math: MathRenderer = katexMath): MathCache {
  const cache: MathCache = {};
  const add = (id: string, display: boolean) => {
    const expr = bundle.expressions[id];
    if (!expr) throw new Error(`unknown expression ${id}`);
    const latex = toLatex(expr);
    cache[mathKey(latex, display)] ??= math(latex, display);
  };
  for (const scene of bundle.scenes) {
    for (const o of scene.objects) {
      if (o.component === "equation" && o.exprRef) add(o.exprRef, (o.props as { display?: boolean }).display ?? true);
      if (o.component === "stepList") for (const id of (o.props as { steps?: string[] }).steps ?? []) add(id, false);
    }
  }
  return cache;
}
