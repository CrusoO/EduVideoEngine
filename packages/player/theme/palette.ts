/**
 * The stage theme (dark). One source of truth for the colours of the player stage. The same values live in
 * packages/components/src/styles.css (variables) and packages/layout/src/tokens.ts (COLOR); tests/theme.test.ts fails if they drift.
 */
/** The dark band around a capped stage on a wide card. */
export const SURROUND = "#06070C";

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

/**
 * The whiteboard theme (ADR 0082): the same stage on a warm white board, written in marker colours that read on it (each one 4.5:1 or better on the board, tests/theme.test.ts).
 * Chosen at play time (`?theme=whiteboard`, `pnpm lesson:video`), never by a bundle, so no bundle and no hash changes. The same values live in theme/whiteboard.css.
 */
export const WHITEBOARD_STAGE = { bg: "#FBFAF6", grid: "#E9E6DB", axis: "#6B7080", text: "#1A2236", muted: "#5B6275" } as const;
export const WHITEBOARD_SEMANTIC = { blue: "#1D63C9", yellow: "#9A5B00", green: "#1F7A3E", red: "#C42B22", purple: "#6B3FA0" } as const;
export type Theme = "dark" | "whiteboard";

export type ColorName = keyof typeof SEMANTIC;
export const COLOR_NAMES = Object.keys(SEMANTIC) as ColorName[];

/** What the components need to colour a formula: the hex of a term by its name (from the bundle termColors), and the dimmed colour. */
export function colorTheme(termColors: Readonly<Record<string, ColorName>> | undefined, theme: Theme = "dark"): { of: (term: string) => string | undefined; muted: string } {
  const palette = theme === "whiteboard" ? WHITEBOARD_SEMANTIC : SEMANTIC;
  return { of: (term) => (termColors?.[term] ? palette[termColors[term]!] : undefined), muted: theme === "whiteboard" ? WHITEBOARD_STAGE.muted : STAGE.muted };
}
