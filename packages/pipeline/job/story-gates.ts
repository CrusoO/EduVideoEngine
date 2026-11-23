import type { PlacedScene, PlacedStory, PlacedVisual as PlacedBase, StoryShape } from "./story";
import { GRID, gridName, type GridCells } from "./story-grid";
import { SAFE, area, boxOf, holds, inside, obstacle, textSize, type Box } from "./story-layout";
import { ANIMATED_PALETTE_OVERRIDE, PALETTES, type Theme, type VisualStyle } from "./story-page";
import { PROP_NAMES, PROP_WORDS } from "./story-props";
import { ROLE_PALETTES, contrastRatio, rolePaletteName } from "./story-roles";

/**
 * Optional hard quality gates for story and source videos (ADR 0118). They run only for a request with `options.qa: "strict"`, on the placed story (after the layout has run), with
 * pure code: no browser, no clock, no files, no model. A request without `qa` never reaches this module, so its output is unchanged. The checks are geometry and arithmetic that the
 * ADR states exactly; nothing here judges what a picture means.
 *
 * Checks (ids): `overlap`, `safe_area`, `text_size`, `contrast`, `noun_at_cue`. The occupancy table is advisory data and is always returned. "Unapproved" is not here: the engine has
 * no approver field yet (ADR 0116), and none is invented.
 */

type PlacedVisual = PlacedBase & StoryShape;

/** Strict QA fails a job; each failure names the check, the scene (from 0) and, where it applies, the shape and the sentence (from 0). */
export type GateFailure = { check: GateId; scene: number; shape?: string; sentence?: number; message: string };
export const GATE_IDS = ["overlap", "safe_area", "text_size", "contrast", "noun_at_cue"] as const;
export type GateId = (typeof GATE_IDS)[number];
export type GateCheck = { id: GateId; ok: boolean; message: string; failures: GateFailure[] };

/** One row of the occupancy table: a shape that has a measurable box, the grid cells it covers, the sentence that starts it and the time window it is on screen. */
export type OccupancyRow = { scene: number; shape: string; kind: string; cells: string; sentence: number; text: string; fromMs: number; toMs: number };

export type GateOptions = { theme: Theme; style: VisualStyle; chrome: "full" | "none" };
export type GateResult = { ok: boolean; checks: GateCheck[]; failures: GateFailure[]; occupancy: OccupancyRow[] };

/**
 * The phone rule. The story is drawn on a 1920 px frame; a 390 px wide phone shows that frame at 390/1920 = 0.2031. The stage is 100 units wide: 16.8 frame px a unit when the page has its
 * card (chrome "full": the stage is 1680 px wide), 19.2 frame px a unit when it is full-bleed (chrome "none", which the animated style defaults to: the 100 by 45 stage fits 1920 by 1080 by its width, 1920/100). The smallest text is MIN_PHONE_PX = 10 phone px, which is 10 * 1920 / 390 = 49.23 frame px, so text `size` must be at least 49.23 / 16.8 = 2.93 units
 * (card) or 49.23 / 19.2 = 2.56 units (full-bleed). The more usual 12 px would need 3.52 and 3.08 units; the engine's own default text size (2.4) is below both, so a host that
 * asks for strict QA has to size its text on purpose.
 */
export const FRAME_PX = 1920;
export const PHONE_PX = 390;
export const MIN_PHONE_PX = 10;
export const PX_PER_UNIT = { full: 16.8, none: 19.2 } as const;
export const minTextUnits = (chrome: "full" | "none"): number => (MIN_PHONE_PX * FRAME_PX) / PHONE_PX / PX_PER_UNIT[chrome];
/** The phone size in px of a text of `size` units. */
export const phonePx = (size: number, chrome: "full" | "none"): number => (size * PX_PER_UNIT[chrome] * PHONE_PX) / FRAME_PX;
/** WCAG 2.2: 4.5:1 for text, 3:1 for large text and for graphics. Large text here is 24 px or more on the phone-scaled frame, or 18.66 px bold (WCAG's 18 pt and 14 pt bold, read at phone size). */
export const CONTRAST_TEXT = 4.5;
export const CONTRAST_LARGE = 3;
/** How near (ms) to the time of a cue its noun must be on screen. */
export const CUE_TOLERANCE_MS = 500;
/** Rounding slack for the safe area, in stage units. */
const EPS = 0.05;
/** A rectangle at least this much of the stage wide or tall is a backdrop (ground, sky, panel) and may touch the edge. */
const BACKDROP = 0.95;

const r2 = (n: number): number => Math.round(n * 100) / 100;
const win = (v: PlacedVisual, sc: PlacedScene): { from: number; to: number } => ({ from: v.inMs, to: v.outMs ?? sc.endMs });
const together = (a: { from: number; to: number }, b: { from: number; to: number }): boolean => a.from < b.to && b.from < a.to;

const isBackdrop = (v: PlacedVisual, b: Box): boolean => v.kind === "rect" && (b.x1 - b.x0 >= BACKDROP * 100 || b.y1 - b.y0 >= BACKDROP * 45);

/** The cells a box covers on the 6 by 6 placement grid (ADR 0102), clamped to the grid. */
export function cellsOf(b: Box): GridCells {
  const cw = GRID.w / GRID.cols, ch = GRID.h / GRID.rows;
  const clamp = (n: number, max: number): number => Math.max(0, Math.min(max, n));
  const c0 = clamp(Math.floor((b.x0 - GRID.x) / cw + 1e-6), GRID.cols - 1);
  const c1 = clamp(Math.ceil((b.x1 - GRID.x) / cw - 1e-6) - 1, GRID.cols - 1);
  const r0 = clamp(Math.floor((b.y0 - GRID.y) / ch + 1e-6), GRID.rows - 1);
  const r1 = clamp(Math.ceil((b.y1 - GRID.y) / ch - 1e-6) - 1, GRID.rows - 1);
  return { c0: Math.min(c0, c1), r0: Math.min(r0, r1), c1: Math.max(c0, c1), r1: Math.max(r0, r1) };
}

/** Advisory data: for every shape with a measurable box, its cells, its sentence and when it is on screen. Shapes placed by an expression of time or with no box (lines, plots) have no row. */
export function occupancy(placed: PlacedStory): OccupancyRow[] {
  const rows: OccupancyRow[] = [];
  for (const [si, sc] of placed.scenes.entries()) {
    for (const v of sc.visuals as PlacedVisual[]) {
      const b = boxOf(v);
      if (!b) continue;
      const w = win(v, sc);
      rows.push({ scene: si, shape: v.id, kind: v.kind, cells: gridName(cellsOf(b)), sentence: v.inS, text: sc.sentences[v.inS]?.text ?? "", fromMs: w.from, toMs: w.to });
    }
  }
  return rows;
}

/** Text and a formula that stand on a shape or another line of text while both are on screen: the same measure and the same allow-list as the automatic layout (a label inside a box or a circle that stays put, anything over a line or an arrow). */
export function overlapFailures(placed: PlacedStory): GateFailure[] {
  const out: GateFailure[] = [];
  for (const [si, sc] of placed.scenes.entries()) {
    const items = (sc.visuals as PlacedVisual[]).map((v) => ({ v, b: boxOf(v), w: win(v, sc) }));
    for (const [i, a] of items.entries()) {
      if ((a.v.kind !== "text" && a.v.kind !== "math") || !a.b) continue;
      for (const [j, o] of items.entries()) {
        if (j === i || !o.b || !obstacle(o.v) || !together(a.w, o.w)) continue;
        const aText = o.v.kind === "text" || o.v.kind === "math";
        if (aText && j > i) continue; // a pair of lines is reported once, for the later one (the layout moves the later one too)
        if (area(a.b, o.b) > 0.15 && !(holds(o.v) && inside(a.b, o.b))) {
          out.push({ check: "overlap", scene: si, shape: a.v.id, sentence: a.v.inS, message: `"${a.v.id}" (${a.v.kind}) overlaps ${aText ? "the text" : "the shape"} "${o.v.id}" while both are on screen` });
        }
      }
    }
  }
  return out;
}

/** Anything drawn outside the safe area (x 2 to 98, y 1.5 to 42) or into the caption band (from y 43). A backdrop rectangle may touch the edge. */
export function safeAreaFailures(placed: PlacedStory): GateFailure[] {
  const out: GateFailure[] = [];
  for (const [si, sc] of placed.scenes.entries()) {
    for (const v of sc.visuals as PlacedVisual[]) {
      const b = boxOf(v);
      if (!b || isBackdrop(v, b)) continue;
      const sides = [b.x0 < SAFE.x0 - EPS ? "left" : "", b.x1 > SAFE.x1 + EPS ? "right" : "", b.y0 < SAFE.y0 - EPS ? "top" : "", b.y1 > SAFE.y1 + EPS ? "bottom, in the caption band" : ""].filter(Boolean);
      if (sides.length) out.push({ check: "safe_area", scene: si, shape: v.id, sentence: v.inS, message: `"${v.id}" (${v.kind}) goes outside the safe area at the ${sides.join(" and ")} (its box is x ${r2(b.x0)} to ${r2(b.x1)}, y ${r2(b.y0)} to ${r2(b.y1)})` });
    }
  }
  return out;
}

/** Text or a formula smaller than MIN_PHONE_PX when the frame is shown 390 px wide. */
export function textSizeFailures(placed: PlacedStory, chrome: "full" | "none"): GateFailure[] {
  const out: GateFailure[] = [];
  const min = minTextUnits(chrome);
  for (const [si, sc] of placed.scenes.entries()) {
    for (const v of sc.visuals as PlacedVisual[]) {
      if ((v.kind !== "text" && v.kind !== "math") || !textSize(v)) continue;
      if (v.size < min - 1e-9) out.push({ check: "text_size", scene: si, shape: v.id, sentence: v.inS, message: `"${v.id}" has size ${v.size}, which is ${r2(phonePx(v.size, chrome))} px on a 390 px phone; at least ${MIN_PHONE_PX} px needs size ${r2(min)}` });
    }
  }
  return out;
}

const hex = /^#[0-9a-fA-F]{6}$/;
/** The palette of the stage as the page builds it: the theme's, with the animated overrides when that style is chosen. */
const pageColours = (o: GateOptions): Record<string, string> => ({ ...PALETTES[o.theme], ...(o.style === "animated" ? ANIMATED_PALETTE_OVERRIDE : {}) });

/** The colours that sit under the stage's text and graphics in a scene: the panel and the page background, or the scene's own solid or gradient colours when it names them. */
function backgroundsOf(sc: PlacedScene, p: Record<string, string>): string[] {
  const own = sc.bg ? (sc.bg.kind === "solid" ? [sc.bg.color] : [sc.bg.from, sc.bg.to]).filter((c) => hex.test(c)) : [];
  return own.length ? own : [p.panel!, p.bg!];
}

/**
 * Contrast. (a) Every role colour of the palette in use against the colours under the stage: at least 4.5:1 (so also 3:1 for graphics). (b) Every line of text or formula against the
 * background of its scene: at least 4.5:1, or 3:1 when large. (c) Every line, arrow and spring (a graphic) against it: at least 3:1. Fills are not checked (every drawn shape has the
 * charcoal outline, which is far above 3:1); a label's own colour and an image are not measured. A shape with `role` uses the role colour; otherwise its named colour.
 */
export function contrastFailures(placed: PlacedStory, o: GateOptions, palette: Record<string, string> = pageColours(o)): GateFailure[] {
  const out: GateFailure[] = [];
  const roles = ROLE_PALETTES[rolePaletteName(o.theme, o.style)];
  for (const [role, colour] of Object.entries(roles)) {
    for (const bg of [palette.panel!, palette.bg!]) {
      const ratio = contrastRatio(colour, bg);
      if (ratio < CONTRAST_TEXT) out.push({ check: "contrast", scene: 0, message: `the role colour "${role}" (${colour}) is ${r2(ratio)}:1 against ${bg}; text needs ${CONTRAST_TEXT}:1` });
    }
  }
  for (const [si, sc] of placed.scenes.entries()) {
    const bgs = backgroundsOf(sc, palette);
    for (const v of sc.visuals as PlacedVisual[]) {
      const isText = v.kind === "text" || v.kind === "math";
      if (!isText && v.kind !== "line" && v.kind !== "arrow" && v.kind !== "spring") continue;
      const colour = v.role ? (roles as Record<string, string>)[v.role] : v.color === "none" ? undefined : palette[v.color];
      if (!colour) continue;
      const size = isText ? (v as PlacedVisual & { size: number }).size : 0;
      const px = (size * PX_PER_UNIT.full * PHONE_PX) / FRAME_PX;
      const bold = v.kind === "text" && v.bold;
      const need = isText ? (px >= 24 || (bold && px >= 18.66) ? CONTRAST_LARGE : CONTRAST_TEXT) : CONTRAST_LARGE;
      const worst = Math.min(...bgs.map((bg) => contrastRatio(colour, bg)));
      if (worst < need) out.push({ check: "contrast", scene: si, shape: v.id, sentence: v.inS, message: `"${v.id}" is drawn in ${colour}, ${r2(worst)}:1 against its background; ${isText ? "text" : "a graphic"} needs ${need}:1` });
    }
  }
  return out;
}

/**
 * The structural form of the soft `noun_undrawn` note (ADR 0101, 0102): the first sentence of a scene that names a thing with a drawn prop (`PROP_NAMES`) must have that thing on screen
 * at its time (within CUE_TOLERANCE_MS): a prop of that name, or a shape whose label or text uses the word, with opacity above 0.5, that has appeared by then and has not yet gone.
 */
export function nounAtCueFailures(placed: PlacedStory): GateFailure[] {
  const out: GateFailure[] = [];
  for (const [si, sc] of placed.scenes.entries()) {
    for (const name of PROP_NAMES) {
      const first = sc.sentences.findIndex((s) => PROP_WORDS[name].test(s.text));
      if (first < 0) continue;
      const t = sc.sentences[first]!.startMs;
      const shown = (sc.visuals as PlacedVisual[]).some((v) => {
        const names = (v.kind === "prop" && v.name === name) || PROP_WORDS[name].test(v.label ?? "") || (v.kind === "text" && PROP_WORDS[name].test(v.text));
        const w = win(v, sc);
        return names && v.opacity > 0.5 && w.from <= t + CUE_TOLERANCE_MS && w.to >= t - CUE_TOLERANCE_MS;
      });
      if (!shown) out.push({ check: "noun_at_cue", scene: si, sentence: first, message: `sentence ${first + 1} names a ${name} at ${Math.round(t)} ms but none is on screen within ${CUE_TOLERANCE_MS} ms of that time (prop: "${name}")` });
    }
  }
  return out;
}

const SUMMARY: Record<GateId, string> = {
  overlap: "no line of text or formula sits on another shape while both are on screen",
  safe_area: "every shape is inside the safe area and clear of the caption band",
  text_size: `every line of text and formula is at least ${MIN_PHONE_PX} px on a 390 px phone`,
  contrast: "every role colour, line of text and graphic has the contrast WCAG asks for",
  noun_at_cue: "every noun with a drawn prop is on screen when its sentence starts",
};

/** All the checks and the occupancy table. Pure: the story is not changed. */
export function strictGates(placed: PlacedStory, options: GateOptions): GateResult {
  const by: Record<GateId, GateFailure[]> = {
    overlap: overlapFailures(placed),
    safe_area: safeAreaFailures(placed),
    text_size: textSizeFailures(placed, options.chrome),
    contrast: contrastFailures(placed, options),
    noun_at_cue: nounAtCueFailures(placed),
  };
  const checks = GATE_IDS.map((id): GateCheck => ({ id, ok: by[id].length === 0, message: by[id].length === 0 ? SUMMARY[id] : `${by[id].length} failure(s): ${by[id].slice(0, 3).map((f) => f.message).join("; ")}${by[id].length > 3 ? "; ..." : ""}`, failures: by[id] }));
  return { ok: checks.every((c) => c.ok), checks, failures: checks.flatMap((c) => c.failures), occupancy: occupancy(placed) };
}

/** The entries strict QA adds to qa.json: one per check (`strict:<id>`, `ok` false when it failed, with its failures) and the occupancy table as one advisory entry. */
export function strictEntries(r: GateResult): Array<Record<string, unknown>> {
  return [
    ...r.checks.map((c) => ({ id: `strict:${c.id}`, ok: c.ok, message: c.message, ...(c.ok ? {} : { failures: c.failures }) })),
    { id: "advisory:occupancy", ok: true, severity: "advisory", kind: "occupancy", message: `${r.occupancy.length} shape(s) with their grid cells, sentence and time on screen`, occupancy: r.occupancy },
  ];
}

/** The one line a failed job carries as its `detail`: the failed checks and how many failures each has. */
export const strictDetail = (r: GateResult): string => `strict QA failed: ${r.checks.filter((c) => !c.ok).map((c) => `${c.id} (${c.failures.length})`).join(", ")}`;
