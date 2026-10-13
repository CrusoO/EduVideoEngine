/**
 * Layout tokens (ADR 0014, amended by ADR 0017). Every number the solver uses is here, in whole pixels.
 * The colour and size values mirror packages/components/src/styles.css; tests/tokens.test.ts fails if they drift apart.
 */
export const PAD = 20; // padding of the stage on every side
export const GAP = { tight: 8, normal: 16, loose: 28 } as const; // fixed, never scaled: a wider stage must never be taller
export const ROW_COLLAPSE_PX = 480; // a stage narrower than this stacks every row (phones first)
export const GRAPH_MAX_WIDTH = 480;
export const GRAPH_ASPECT = { w: 400, h: 260 }; // the SVG viewBox of the graph component

/** Smallest text that may appear anywhere: chart annotations (axis numbers) included. */
export const MIN_TEXT_PX = 12;
/** Smallest text that must be read as a sentence or a step: titles, labels, body. */
export const MIN_READING_PX = 16;

/** Colours of the player stage (styles.css). */
export const COLOR = { stage: "#ffffff", ink: "#14172b", muted: "#464e6b", highlight: "#b45309", onHighlight: "#ffffff" } as const;

/** Reading speed for school-age learners, in words per minute, and what an equation costs in words. Tunable assumptions (ADR 0017). */
export const READING_WPM = 140;
export const EQUATION_WORDS = 4;

/**
 * Stage height available on a phone: the screen height minus the header of the lesson sheet (56) and the caption and
 * voice credit under the stage (128). An assumption of the player layout, stated in ADR 0017.
 */
export const CHROME_PX = 56 + 128;
export const stageHeight = (screenHeight: number): number => screenHeight - CHROME_PX;

export type Viewport = { width: number; height: number };
/** Screens every reference lesson must fit: a small phone and a desktop window. */
export const REFERENCE_VIEWPORTS: ReadonlyArray<{ name: string; viewport: Viewport }> = [
  { name: "phone 360x640", viewport: { width: 360, height: stageHeight(640) } },
  { name: "desktop 1280x720", viewport: { width: 1280, height: stageHeight(720) } },
];
