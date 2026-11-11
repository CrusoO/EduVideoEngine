import { gridBox, gridCells } from "../../job/story-grid";

/** Where a physics figure is drawn: the box of its area or cell (default the whole stage grid), and the smallest box it is drawn in. */
export type Box = { x: number; y: number; w: number; h: number };
export const DEFAULT_AREA = "A1:F6";
/** Four columns by three rows (61 by 20 stage units). A smaller area is refused at parse time: nothing is drawn too small to read. */
export const MIN_AREA = { w: 60, h: 20 } as const;

export function boxOf(spec: { area?: string; cell?: string }): Box {
  return gridBox(gridCells(spec.area ?? spec.cell ?? DEFAULT_AREA)!);
}
export const areaTooSmall = (spec: { area?: string; cell?: string }): boolean => {
  const b = boxOf(spec);
  return b.w < MIN_AREA.w - 1e-9 || b.h < MIN_AREA.h - 1e-9;
};
