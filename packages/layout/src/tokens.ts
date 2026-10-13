/**
 * Layout tokens (ADR 0014, amended by ADR 0017). Every number the solver uses is here, in whole pixels.
 * The colour and size values mirror packages/components/src/styles.css; tests/tokens.test.ts fails if they drift apart.
 */
export const PAD = 20; // padding of the stage on every side
export const GAP = { tight: 8, normal: 16, loose: 28 } as const; // fixed, never scaled: a wider stage must never be taller
export const ROW_COLLAPSE_PX = 480; // a stage narrower than this stacks every row (phones first)
export const GRAPH_MAX_WIDTH = 480;
/** The most spare stage height that is spread into one gap or margin when a scene is shorter than its stage; the rest of the spare height is shared equally above and below. */
export const MAX_SPREAD_PX = 72;
export const GRAPH_ASPECT = { w: 400, h: 260 }; // the SVG viewBox of the graph component

/** Smallest text that may appear anywhere: chart annotations (axis numbers) included. */
export const MIN_TEXT_PX = 12;
/** Smallest text that must be read as a sentence or a step: titles, labels, body. */
export const MIN_READING_PX = 16;

/** Colours of the player stage (styles.css). */
export const COLOR = { stage: "#0B0D14", ink: "#E6E8F0", muted: "#8A90A6", highlight: "#F5D547", onHighlight: "#0B0D14" } as const;

/** Reading speed for school-age learners, in words per minute, and what an equation costs in words. Tunable assumptions (ADR 0017). */
export const READING_WPM = 140;
export const EQUATION_WORDS = 4;

/** The screen every layout is designed for first: a small phone, 360 x 640 CSS pixels. */
export const DESIGN_SCREEN = { width: 360, height: 640 } as const;

/**
 * Height taken by the lesson sheet around the stage (the sheet header, and the caption and voice credit under the stage). It is a
 * PARAMETER of the solver and the budget, never a constant inside them. **184 px (56 + 128) is an estimate, not a measurement**: the
 * owner is measuring the real sheet, and the value is replaced there. Everything downstream takes `chromePx`.
 */
export const DEFAULT_CHROME_PX = 56 + 128;

export type Viewport = { width: number; height: number };

/** From this card width the stage is a 16:9 frame; below it, a phone frame. 880 px gives 495 px of height, more than the 456 px of the design phone: desktop is roomier, never the reverse. */
export const WIDE_MIN_WIDTH = 880;
/** On a wide card the stage is capped at this width and centred on a dark surround: a sparse scene in a very wide stage looks empty (ADR 0019). */
export const MAX_STAGE_PX = 960;
/** A stage is never shorter than this, whatever the screen (a phone held sideways). */
export const MIN_STAGE_PX = 240;

export type Frame = { width: number; height: number; mode: "phone" | "wide" };

/**
 * The frame the stage is drawn in. Wide cards: 16:9 of the card width. Phones: the dynamic viewport height (dvh) minus the sheet
 * chrome, never 16:9 and never a fixed screen height. The chrome is a parameter (default 184 px, UNCONFIRMED).
 */
export function stageFrame(cardWidth: number, dvhPx: number, chromePx: number = DEFAULT_CHROME_PX): Frame {
  if (cardWidth >= WIDE_MIN_WIDTH) return { width: cardWidth, height: Math.round((cardWidth * 9) / 16), mode: "wide" };
  return { width: cardWidth, height: Math.max(MIN_STAGE_PX, Math.floor(dvhPx - chromePx)), mode: "phone" };
}

/** Spare height above a scene that is shorter than its frame: the content is centred, so no band of empty stage sits under it. */
export const centerOffset = (contentHeight: number, frameHeight: number): number => Math.max(0, Math.floor((frameHeight - contentHeight) / 2));

/** Screens every reference lesson must fit: the 360 x 640 design phone and a 1280 x 720 desktop window. */
export const referenceViewports = (chromePx: number = DEFAULT_CHROME_PX): ReadonlyArray<{ name: string; viewport: Viewport }> => {
  const phone = stageFrame(DESIGN_SCREEN.width, DESIGN_SCREEN.height, chromePx);
  const wide = stageFrame(Math.min(1280, MAX_STAGE_PX), 720, chromePx); // a 1280 px window shows a 960 px stage
  return [
    { name: "phone 360x640", viewport: { width: phone.width, height: phone.height } },
    { name: "desktop 1280x720 (stage capped at 960)", viewport: { width: wide.width, height: wide.height } },
  ];
};
