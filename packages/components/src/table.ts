import { z } from "zod";
import { evaluate, type Expr } from "@eve/schema";
import { css, objectStateAt, partStateAt } from "./state";
import { applyState } from "./text";
import type { ComponentModule } from "./types";

/**
 * A small grid of numbers (ADR 0076). Every cell is the id of an expression of the lesson that is a number, so the value on screen is evaluated (exact rationals), never typed.
 *  - `tint: "brightness"`: a cell is as bright as its value, from 0 (dark) to 1 (bright): a patch of pixels.
 *  - `tint: "signed"`: a cell is blue where its value is positive and red where it is negative, as strongly as its size: a patch of weights.
 * Parts a cue may address: `cell0`, `cell1`, ... (reveal, highlight, pop, dim).
 */
export const TABLE_MAX_CELLS = 9;
export const TABLE_LABEL_WORDS = 4;
export const TableProps = z
  .object({
    cols: z.number().int().min(1).max(3),
    cells: z.array(z.string().min(1)).min(1).max(TABLE_MAX_CELLS),
    tint: z.enum(["brightness", "signed"]),
    label: z.string().min(1).optional(),
  })
  .strict();
export type TableProps = z.infer<typeof TableProps>;

const valueOf = (expressions: Record<string, Expr>, id: string): number | null => {
  const e = expressions[id];
  const r = e ? evaluate(e) : null;
  return r === null ? null : Number(r.n) / Number(r.d);
};
/** A number as it is read: at most two decimals, a real minus sign. */
export const showCell = (v: number): string => String(Math.round(v * 100) / 100).replace("-", "−");

export const table: ComponentModule<TableProps> = {
  name: "table",
  propsSchema: TableProps as never,
  render(host, props, t, ctx) {
    const p = TableProps.parse(props);
    host.className = `eve-obj eve-table eve-table-${p.tint}`;
    host.setAttribute("lang", ctx.locale);
    const values = p.cells.map((id) => {
      const v = valueOf(ctx.expressions, id);
      if (v === null) throw new Error(`table ${ctx.objectId}: ${id} is not a number`);
      return v;
    });
    const sig = JSON.stringify([p, values]);
    if (host.dataset.sig !== sig) {
      host.dataset.sig = sig;
      const grid = document.createElement("div");
      grid.className = "eve-table-grid";
      grid.setAttribute("role", "img");
      grid.setAttribute("aria-label", table.altText(p, ctx));
      grid.style.gridTemplateColumns = `repeat(${p.cols}, 1fr)`;
      const biggest = Math.max(1, ...values.map((v) => Math.abs(v)));
      values.forEach((v, i) => {
        const cell = document.createElement("div");
        cell.className = "eve-table-cell";
        cell.dataset.part = `cell${i}`;
        cell.textContent = showCell(v);
        if (p.tint === "brightness") {
          const k = Math.min(1, Math.max(0, v));
          cell.style.background = `color-mix(in srgb, var(--eve-ink) ${Math.round(k * 100)}%, var(--eve-grid))`;
          cell.style.color = k >= 0.5 ? "var(--eve-bg)" : "var(--eve-ink)";
        } else {
          const k = Math.round((Math.abs(v) / biggest) * 60 + 10);
          cell.style.background = v === 0 ? "var(--eve-grid)" : `color-mix(in srgb, ${v > 0 ? "var(--eve-blue)" : "var(--eve-red)"} ${k}%, var(--eve-grid))`;
        }
        grid.append(cell);
      });
      host.replaceChildren(grid);
      if (p.label) {
        const l = document.createElement("div");
        l.className = "eve-table-label";
        l.textContent = p.label;
        host.append(l);
      }
    }
    values.forEach((_v, i) => {
      const s = partStateAt(ctx.events, `cell${i}`, t, ctx.reduceMotion);
      const c = host.querySelector<HTMLElement>(`[data-part="cell${i}"]`);
      if (!c) return;
      c.style.visibility = s.visible ? "visible" : "hidden";
      c.style.opacity = css(s.dimmed ? Math.min(s.opacity, 0.35) : s.opacity);
      c.style.setProperty("--eve-hl", css(s.highlight));
      if (s.scale === 1) c.style.removeProperty("transform");
      else c.style.transform = `scale(${css(s.scale)})`;
    });
    applyState(host, objectStateAt(ctx.events, t, ctx.reduceMotion));
  },
  cueTargets: (props) => ["whole", ...props.cells.map((_c, i) => `cell${i}`)],
  altText: (props, ctx) => {
    const values = props.cells.map((id) => {
      const v = valueOf(ctx.expressions, id);
      return v === null ? "?" : showCell(v);
    });
    const rows: string[] = [];
    for (let i = 0; i < values.length; i += props.cols) rows.push(values.slice(i, i + props.cols).join(", "));
    return `${props.label ? `${props.label}: ` : ""}a grid of numbers, row by row: ${rows.join("; ")}`;
  },
  verify(props, ctx) {
    const problems: string[] = [];
    props.cells.forEach((id, i) => {
      if (!(id in ctx.expressions)) return void problems.push(`cell ${i}: unknown expression ${id}`);
      const v = valueOf(ctx.expressions, id);
      if (v === null) return void problems.push(`cell ${i}: ${id} is not a number`);
      if (props.tint === "brightness" && (v < 0 || v > 1)) problems.push(`cell ${i}: a brightness is from 0 to 1, not ${showCell(v)}`);
    });
    if (props.cells.length % props.cols !== 0) problems.push(`${props.cells.length} cells do not fill whole rows of ${props.cols}`);
    const words = props.label ? props.label.trim().split(/\s+/).length : 0;
    if (words > TABLE_LABEL_WORDS) problems.push(`a table label has ${words} words; at most ${TABLE_LABEL_WORDS}`);
    const known = new Set(table.cueTargets(props));
    for (const part of ctx.cueParts ?? []) if (!known.has(part)) problems.push(`a cue targets the part ${part}, which this table does not have (it has ${[...known].join(", ")})`);
    return problems;
  },
};
