/**
 * pnpm exec vite-node scripts/wide-audit.ts   READ-ONLY audit (phone and desktop targets): for each scene of the reference lesson at the card widths
 * 768 (tablet), 1280 and 1920 (desktop), the stage the player would draw, the bounding box of the laid-out content, and the share of the stage left empty.
 * It changes nothing: it calls the layout solver and prints.
 */
import { referenceLesson } from "../packages/schema/src";
import { MAX_STAGE_PX, solve, stageFrame, type Box } from "../packages/layout/src";

const cases = [
  { name: "tablet 768x1024", card: 768, dvh: 1024 },
  { name: "desktop 1280x720", card: 1280, dvh: 720 },
  { name: "desktop 1920x1080", card: 1920, dvh: 1080 },
];
const ctx = { expressions: referenceLesson.expressions, locale: referenceLesson.locale };
const union = (boxes: Box[]): Box => {
  const x0 = Math.min(...boxes.map((b) => b.x)), y0 = Math.min(...boxes.map((b) => b.y));
  const x1 = Math.max(...boxes.map((b) => b.x + b.width)), y1 = Math.max(...boxes.map((b) => b.y + b.height));
  return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
};
for (const c of cases) {
  const f = stageFrame(Math.min(c.card, MAX_STAGE_PX), c.dvh);
  console.log(`\n== ${c.name}: the stage is ${f.width} x ${f.height} (${f.mode}${c.card > MAX_STAGE_PX ? `, capped from a ${c.card} px card` : ""})`);
  console.log("scene            objects                                   content bbox (w x h at x,y)   empty (bbox)  empty (ink)  rows collapsed");
  for (const s of referenceLesson.scenes) {
    const layout = solve({ objects: s.objects, layout: s.layout }, { width: f.width, height: f.height }, ctx);
    // a solver box is as wide as its column; the content in it is as wide as the object's natural width (a formula, the graph's cap), centred
    const boxes = Object.entries(layout.boxes).map(([id, b]) => {
      const i = layout.intrinsic[id];
      const w = Math.min(b.width, i?.maxWidth ?? i?.naturalWidth ?? b.width);
      return { x: b.x + Math.floor((b.width - w) / 2), y: b.y, width: w, height: b.height };
    });
    const bb = union(boxes);
    const stageArea = f.width * f.height;
    const ink = boxes.reduce((a, b) => a + b.width * b.height, 0);
    const empty = (1 - (bb.width * bb.height) / stageArea) * 100;
    const emptyInk = (1 - Math.min(ink, stageArea) / stageArea) * 100;
    const comps = s.objects.map((o) => o.component).join(",");
    console.log(`${s.id.padEnd(16)} ${comps.slice(0, 42).padEnd(42)} ${`${bb.width} x ${bb.height} at ${bb.x},${bb.y}`.padEnd(29)} ${empty.toFixed(0).padStart(5)} %      ${emptyInk.toFixed(0).padStart(5)} %      ${layout.collapsed ? "yes" : "no"}   (content height ${layout.contentHeight}${layout.contentHeight > f.height ? ", OVER the stage" : ""})`);
  }
}
