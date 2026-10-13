import type { Retrieval } from "@eve/content";
import { patternSources, usablePatterns } from "@eve/patterns";
import type { PlannerAnswer } from "./index";

/**
 * A plan written by rule, not by a model: the order a human teacher would choose for the sum-of-roots kind of skill, using only the patterns the
 * records support. It exists for two uses: tests (a plan that must pass every check), and the AUTHORED STAND-IN fixture that lets the replay path run
 * before a key exists. It is never presented as a model output.
 */
export function referencePlan(r: Retrieval, template: "problem-first" | "example-first" = "problem-first"): PlannerAnswer {
  const usable = new Set<string>(usablePatterns(r));
  const wanted: Array<{ pattern: string; kind: "predict" | "explore" | "explain" | "worked"; title: string; durationS: number; pause: boolean }> = [
    { pattern: "colour-bound-terms", kind: "predict", title: "Meet the equation", durationS: 14, pause: false },
    { pattern: "plot-and-mark-roots", kind: "explore", title: "Where the curve crosses", durationS: 20, pause: false },
    { pattern: "step-by-step-worked-example", kind: "worked", title: "Factorise and find the roots", durationS: 26, pause: true },
    { pattern: "hops-on-number-line", kind: "worked", title: "Add the roots with hops", durationS: 26, pause: true },
  ];
  const beats = wanted
    .filter((w) => usable.has(w.pattern))
    .map((w, i) => ({ id: `b${i + 1}`, kind: w.kind, title: w.title, pattern: w.pattern, durationS: w.durationS, pause: w.pause, animate: true, sourceIds: patternSources(w.pattern, r)! }));
  return { template, beats };
}
