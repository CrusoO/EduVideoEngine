/**
 * The stage theme (dark). One source of truth for the colours of the player stage. The same values live in
 * packages/components/src/styles.css (variables) and packages/layout/src/tokens.ts (COLOR); tests/theme.test.ts fails if they drift.
 */
export const STAGE = {
  bg: "#0B0D14",
  grid: "#171B2A",
  axis: "#5B6178",
  text: "#E6E8F0",
  muted: "#8A90A6",
} as const;

/** The closed palette a term may be coloured with. Names are what bundles use (termColors); hex values never appear in a bundle. */
export const SEMANTIC = {
  blue: "#58C4DD",
  yellow: "#F5D547",
  green: "#83C167",
  red: "#FC6255",
  purple: "#9A72AC",
} as const;

export type ColorName = keyof typeof SEMANTIC;
export const COLOR_NAMES = Object.keys(SEMANTIC) as ColorName[];

/** What the components need to colour a formula: the hex of a term by its name (from the bundle termColors), and the dimmed colour. */
export function colorTheme(termColors: Readonly<Record<string, ColorName>> | undefined): { of: (term: string) => string | undefined; muted: string } {
  return { of: (term) => (termColors?.[term] ? SEMANTIC[termColors[term]!] : undefined), muted: STAGE.muted };
}
