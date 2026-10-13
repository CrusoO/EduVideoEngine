import type { LayoutRule } from "@eve/schema";
import { OVERLAY, measure, type Intrinsic, type LayoutObject, type MeasureCtx } from "./measure";
import { GAP, PAD, ROW_COLLAPSE_PX, type Viewport } from "./tokens";

export type SceneInput = { objects: readonly LayoutObject[]; layout: readonly LayoutRule[] };
export type Box = { x: number; y: number; width: number; height: number };
export type Layout = {
  viewport: Viewport;
  /** One box per laid-out object, in whole pixels, origin at the top-left of the stage (padding included). */
  boxes: Record<string, Box>;
  /** Objects that are not laid out because they follow another object (highlights). */
  overlays: string[];
  /** Objects the spec asked to centre: the player aligns their content to the middle of the box. */
  centered: string[];
  /** Height the stage needs, bottom padding included. */
  contentHeight: number;
  /** True when rows were stacked because the stage is narrower than ROW_COLLAPSE_PX. */
  collapsed: boolean;
  /** The size model's answer per object, kept so the checks and the player read the same numbers. */
  intrinsic: Record<string, Intrinsic>;
};

export class LayoutError extends Error {
  constructor(readonly problems: string[]) {
    super(`cannot lay out: ${problems.join("; ")}`);
  }
}

type Block = { kind: "item"; id: string } | { kind: "col" | "row"; items: Block[]; gap: number };
const items = (b: Block): string[] => (b.kind === "item" ? [b.id] : b.items.flatMap(items));

/**
 * Rules in, one box per object out. Pure and deterministic: the same scene, viewport and context always give the same
 * boxes, with these rules (ADR 0014 and 0017):
 *  - Every size is a whole pixel. CONTENT rounds UP (it is never under-measured); SPACE rounds DOWN when split, and the
 *    leftover pixels go one each to the earliest items, so a row always fills its width exactly.
 *  - Objects without a rule fall into one column in declaration order, with the normal gap.
 *  - column / row group their items (row: equal shares). below moves an item after another. beside pairs two items in a
 *    row. center centres an object narrower than its slot. A row or beside collapses to a column under 480 px.
 *  - Highlights are overlays: not laid out, they follow the measured rectangle of their target. Naming one in a column or row is harmless.
 */
export function solve(scene: SceneInput, viewport: Viewport, ctx: MeasureCtx): Layout {
  const problems: string[] = [];
  const byId = new Map(scene.objects.map((o) => [o.id, o]));
  const flow = scene.objects.filter((o) => !OVERLAY.has(o.component));
  const overlays = scene.objects.filter((o) => OVERLAY.has(o.component)).map((o) => o.id);
  const collapsed = viewport.width < ROW_COLLAPSE_PX;
  const W = viewport.width - 2 * PAD;
  if (W < 1) throw new LayoutError([`the stage is ${viewport.width} px wide: no room for content`]);

  // ---- blocks from rules ---------------------------------------------------------------------------------------
  let top: Block[] = flow.map((o) => ({ kind: "item", id: o.id }));
  const grouped = new Set<string>();
  const centered = new Set<string>();
  const known = (id: string, rule: string): boolean => {
    if (!byId.has(id)) problems.push(`${rule}: unknown object ${id}`);
    else if (OVERLAY.has(byId.get(id)!.component)) problems.push(`${rule}: ${id} is an overlay and is not laid out`);
    else return true;
    return false;
  };
  const take = (ids: string[], rule: string): Block[] | null => {
    const out: Block[] = [];
    for (const id of ids) {
      if (!known(id, rule)) return null;
      if (grouped.has(id)) {
        problems.push(`${rule}: ${id} is already placed by another rule`);
        return null;
      }
      out.push({ kind: "item", id });
    }
    return out;
  };
  const put = (group: Block, ids: string[]) => {
    // The group stands where its earliest-declared member stood.
    const first = Math.min(...ids.map((id) => top.findIndex((b) => b.kind === "item" && b.id === id)));
    top = top.filter((b) => !(b.kind === "item" && ids.includes(b.id)));
    top.splice(first, 0, group);
    for (const id of ids) grouped.add(id);
  };
  for (const rule of scene.layout) {
    if (rule.rule === "column" || rule.rule === "row") {
      // An overlay named in a column or row is ignored: it is drawn over its target, not placed.
      const ids = rule.items.filter((id) => !(byId.has(id) && OVERLAY.has(byId.get(id)!.component)));
      if (ids.length === 0) continue;
      if (new Set(ids).size !== ids.length) problems.push(`${rule.rule}: an object is listed twice`);
      const blocks = take(ids, rule.rule);
      if (!blocks) continue;
      const gap = GAP[rule.gap ?? "normal"];
      put({ kind: rule.rule === "row" && !collapsed ? "row" : "col", items: blocks, gap }, ids);
    } else if (rule.rule === "beside") {
      if (rule.of === rule.item) {
        problems.push(`beside: ${rule.item} cannot sit beside itself`);
        continue;
      }
      const blocks = take([rule.of, rule.item], "beside");
      if (!blocks) continue;
      const pair = rule.side === "left" ? [blocks[1]!, blocks[0]!] : [blocks[0]!, blocks[1]!];
      put({ kind: collapsed ? "col" : "row", items: collapsed ? [blocks[0]!, blocks[1]!] : pair, gap: GAP.normal }, [rule.of, rule.item]);
    } else if (rule.rule === "below") {
      if (!known(rule.item, "below") || !known(rule.of, "below")) continue;
      const mine = top.findIndex((b) => items(b).includes(rule.item));
      const theirs = top.findIndex((b) => items(b).includes(rule.of));
      if (mine === theirs) continue; // already in one block: its order stands
      const [moved] = top.splice(mine, 1);
      top.splice(top.findIndex((b) => items(b).includes(rule.of)) + 1, 0, moved!);
    } else if (rule.rule === "center") {
      if (known(rule.item, "center")) centered.add(rule.item);
    }
  }
  if (problems.length) throw new LayoutError(problems);

  // ---- place -----------------------------------------------------------------------------------------------------
  const boxes: Record<string, Box> = {};
  const intrinsic: Record<string, Intrinsic> = {};
  for (const o of scene.objects) intrinsic[o.id] = o.component === "highlight" ? { height: 0, words: 0, equations: 0, facts: [] } : measure(o, W, ctx);

  const place = (b: Block, x: number, y: number, w: number): number => {
    if (b.kind === "item") {
      const o = byId.get(b.id)!;
      const m = measure(o, w, ctx); // measured at the width it is actually given
      intrinsic[b.id] = m;
      const bw = m.maxWidth === undefined ? w : Math.min(w, m.maxWidth);
      const bx = centered.has(b.id) && bw < w ? x + Math.floor((w - bw) / 2) : x;
      boxes[b.id] = { x: bx, y, width: bw, height: m.height };
      return m.height;
    }
    if (b.kind === "col") {
      let used = 0;
      b.items.forEach((child, i) => {
        if (i > 0) used += b.gap;
        used += place(child, x, y + used, w);
      });
      return used;
    }
    const n = b.items.length;
    const room = w - b.gap * (n - 1);
    const share = Math.floor(room / n);
    const rest = room - share * n; // handed out one pixel at a time to the first items
    let cx = x;
    let tall = 0;
    b.items.forEach((child, i) => {
      const cw = share + (i < rest ? 1 : 0);
      tall = Math.max(tall, place(child, cx, y, cw));
      cx += cw + b.gap;
    });
    return tall;
  };

  let y = PAD;
  top.forEach((b, i) => {
    if (i > 0) y += GAP.normal;
    y += place(b, PAD, y, W);
  });
  return { viewport, boxes, overlays, centered: [...centered], contentHeight: y + PAD, collapsed, intrinsic };
}
