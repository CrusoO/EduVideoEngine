import type { MathRenderer } from "./types";

/** Key of one typeset formula in a MathCache. */
export const mathKey = (latex: string, display: boolean): string => `${display ? "d" : "i"}:${latex}`;
export type MathCache = Record<string, string>;

/**
 * The player's typesetter: a lookup in markup produced at build time (see build.ts). It never runs KaTeX, so the player
 * ships KaTeX's CSS and three fonts but none of its 92 KB of script. A missing entry is a build bug, so it throws.
 */
export const cachedMath =
  (cache: MathCache): MathRenderer =>
  (latex, display) => {
    const html = cache[mathKey(latex, display)];
    if (html === undefined) throw new Error(`no pre-rendered markup for ${mathKey(latex, display)}: rebuild the math cache`);
    return html;
  };
