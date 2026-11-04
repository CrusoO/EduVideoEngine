/**
 * A coarse placement grid for stories (ADR 0102). A model names a cell (`B2`) or an area (`A1:C3`) and this module turns it into stage units, so nobody has to type coordinates and
 * nothing placed by a cell can fall off the visible area or under the caption band. Pure: no clock, no randomness, no files.
 */

/** Columns A to F run left to right, rows 1 to 6 top to bottom, over this part of the 100 by 45 stage (it stops above the caption band, which starts at y 43). */
export const GRID = { x: 4, y: 2, w: 92, h: 41, cols: 6, rows: 6 } as const;

export type GridBox = { x: number; y: number; w: number; h: number };
/** The cells an area covers: first and last column and row, counted from 0. */
export type GridCells = { c0: number; r0: number; c1: number; r1: number };

const CELL = /^([A-F])([1-6])$/;

function corner(s: string): [number, number] | null {
  const m = CELL.exec(s.trim().toUpperCase());
  return m ? [m[1]!.charCodeAt(0) - 65, Number(m[2]) - 1] : null;
}

/** The cells named by `B2` or `A1:C3` (either corner first), or null if it is not one. */
export function gridCells(spec: unknown): GridCells | null {
  if (typeof spec !== "string") return null;
  const parts = spec.split(":");
  if (parts.length > 2) return null;
  const a = corner(parts[0]!);
  const b = parts.length === 2 ? corner(parts[1]!) : a;
  if (!a || !b) return null;
  return { c0: Math.min(a[0], b[0]), r0: Math.min(a[1], b[1]), c1: Math.max(a[0], b[0]), r1: Math.max(a[1], b[1]) };
}

/** The same cells written the one way: `B2`, or `A1:C3` with the top left corner first. */
export function gridName(c: GridCells): string {
  const name = (col: number, row: number): string => `${String.fromCharCode(65 + col)}${row + 1}`;
  return c.c0 === c.c1 && c.r0 === c.r1 ? name(c.c0, c.r0) : `${name(c.c0, c.r0)}:${name(c.c1, c.r1)}`;
}

/** The box of some cells in stage units. */
export function gridBox(c: GridCells): GridBox {
  const cw = GRID.w / GRID.cols;
  const ch = GRID.h / GRID.rows;
  return { x: GRID.x + c.c0 * cw, y: GRID.y + c.r0 * ch, w: (c.c1 - c.c0 + 1) * cw, h: (c.r1 - c.r0 + 1) * ch };
}

/** Do two areas share a cell? */
export const gridOverlap = (a: GridCells, b: GridCells): boolean => a.c0 <= b.c1 && b.c0 <= a.c1 && a.r0 <= b.r1 && b.r0 <= a.r1;

const CENTRED = new Set(["circle", "prop", "sun", "element", "fuzzy", "particles", "angle", "path"]);
const ROUND = new Set(["circle", "sun", "element", "fuzzy", "particles"]);
const BOXED = new Set(["plot", "axes"]);

const r3 = (n: number): number => Math.round(n * 1000) / 1000;

/**
 * Fills the position a shape lacks from its cells: the centre for a shape placed by a centre (a prop stands on the bottom of its cells if it stands on its anchor, and takes the largest
 * size that fits), the box for a rectangle, a plot or axes, the middle for text and math. A number the author wrote is never replaced. A line, arrow or spring is placed by its end points
 * and ignores the cells. Returns a new record; the one it was given is not touched.
 */
export function fillFromGrid(v: Record<string, unknown>, cells: GridCells, prop?: { w: number; h: number; anchor: "bottom" | "center" }): Record<string, unknown> {
  const b = gridBox(cells);
  const out: Record<string, unknown> = { ...v };
  const missing = (k: string): boolean => out[k] === undefined;
  const cx = r3(b.x + b.w / 2);
  const kind = String(v.kind);
  if (CENTRED.has(kind)) {
    const bottom = kind === "prop" && prop?.anchor === "bottom";
    if (missing("cx")) out.cx = cx;
    if (missing("cy")) out.cy = r3(bottom ? b.y + b.h : b.y + b.h / 2);
    if (ROUND.has(kind) && missing("r")) out.r = r3(Math.min(b.w, b.h) / 2);
    if (kind === "prop" && prop && missing("size")) out.size = r3(Math.min(b.w, (b.h * prop.w) / prop.h));
  } else if (kind === "rect") {
    for (const [k, val] of [["x", b.x], ["y", b.y], ["w", b.w], ["h", b.h]] as const) if (missing(k)) out[k] = r3(val);
  } else if (BOXED.has(kind)) {
    if (missing("box")) out.box = { x: r3(b.x), y: r3(b.y), w: r3(b.w), h: r3(b.h) };
  } else if (kind === "numberline") {
    if (missing("x")) out.x = r3(b.x);
    if (missing("y")) out.y = r3(b.y + b.h / 2);
    if (missing("w")) out.w = r3(b.w);
  } else if (kind === "text" || kind === "math") {
    if (missing("x")) out.x = cx;
    if (missing("y")) out.y = r3(b.y + b.h / 2);
    if (out.anchor === undefined) out.anchor = "middle";
  }
  return out;
}
