import costs from "../../layout/component-costs.json";

/** Keys of `costsPx` in component-costs.json: the price of each component at the design phone. */
export type CostKey = keyof typeof costs.costsPx;

/**
 * The height a pattern needs: padding, the price of each of its objects, and the normal gap between them. A title is priced at two lines (the writer
 * slot allows 46 characters), the worst case, so a pattern that is under the stage here is under it whatever title is written.
 */
export function heightCostPx(objects: readonly CostKey[]): number {
  const total = objects.reduce((sum, k) => sum + costs.costsPx[k] + (k === "text (title, one line)" ? costs.textLines.title.heightPerLine : 0), 0);
  return costs.padding + total + costs.gapPx.normal * Math.max(0, objects.length - 1);
}

export const STAGE_HEIGHT_PX = costs.generatedFor.stageHeight;
/** Longest title a writer slot may hold: two lines of the title size. */
export const TITLE_MAX_CHARS = 2 * costs.textLines.title.charactersPerLine;
