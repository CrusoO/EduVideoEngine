import { AREA, SIZE, TEMPLATE_KINDS, cell, cueOf, fitChars, isObj, lineShape, optStr, rectShape, roleOf, round2, str, textShape, textWidth, titleOf, unknownKeys, wrap, type Ctx, type Raw, type TemplateKind, type TemplateRole } from "./story-template-core";

/**
 * Scene templates (ADR 0119). A scene may carry `template`: typed data for one of eight closed kinds (checklist, table, comparison, steps, quiz, bars, definition, endcard). The engine
 * expands it into ordinary raw shapes (text, rect, line, arrow, with the four colour roles only) laid out inside the placement grid, each item brought in by a sentence cue, BEFORE the
 * usual sanitising, exactly as `steps` are (ADR 0115). So the host sends no coordinates and no colours, every other rule applies to the shapes (the personal-data and secret check, the
 * automatic layout, the strict gates), and a template that is invalid is dropped with a note and never fails a job. Deterministic and pure.
 *
 * Every expander validates its own fields: an item that is not valid is dropped with a note; a template that cannot be drawn whole (a table with a bad cell, fewer than the least number of
 * steps) is dropped whole, because a half table or a missing step is a wrong picture. A field the template does not know is ignored with a note.
 */
export { TEMPLATE_KINDS, type TemplateKind } from "./story-template-core";

/** The one wording of the provenance line of an end card; it is drawn only when the request asks for it with `provenance: true`. */
export const PROVENANCE_LINE = "Voice and pictures made by a computer program; not checked by a person";

export const TEMPLATE_LIMITS = {
  title: 36,
  checklist: { items: 6, text: 40 },
  table: { cols: 5, rows: 6, cell: 24 },
  comparison: { label: 14, points: 4, point: 20 },
  steps: { min: 3, max: 6, text: 22 },
  quiz: { question: 90, options: 4, option: 34 },
  bars: { max: 8, label: 12, value: 99_999 },
  definition: { term: 24, meaning: 120, example: 70 },
  endcard: { title: 28, lines: 3, line: 42 },
} as const;

const L = TEMPLATE_LIMITS;
const CHECK_STATES = ["done", "todo", "wrong"] as const;
const lastOf = (ctx: Ctx): number => Math.max(0, ctx.sentences - 1);

/** The list under `field`, with at most `max` kept (the rest noted); an empty list when it is not a list. */
function listOf(v: unknown, max: number, ctx: Ctx, field: string): unknown[] {
  if (!Array.isArray(v)) {
    ctx.notes.push(`scene ${ctx.scene}, template ${ctx.kind}: ${field} must be a list`);
    return [];
  }
  if (v.length > max) ctx.notes.push(`scene ${ctx.scene}, template ${ctx.kind}: only the first ${max} ${field} are kept (${v.length} were sent)`);
  return v.slice(0, max);
}
const dropped = (ctx: Ctx, why: string): Raw[] => {
  ctx.notes.push(`scene ${ctx.scene}, template ${ctx.kind} dropped: ${why}`);
  return [];
};
const titleShape = (title: string | undefined, y = 5): Raw[] => (title ? [textShape("t_title", 50, y, title, 0, { size: SIZE.title, bold: true })] : []);

/** An item of a list: an object with `text` of 1 to `max` characters and an optional sentence `s`. Null (and noted) when it is not. */
function itemOf(raw: unknown, max: number, ctx: Ctx, n: number, extra: readonly string[] = []): { text: string; item: Raw } | null {
  if (!isObj(raw)) {
    ctx.notes.push(`scene ${ctx.scene}, template ${ctx.kind}, item ${n} dropped: an item must be an object with text`);
    return null;
  }
  unknownKeys(raw, ["text", "s", ...extra], ctx, `, item ${n}`);
  const text = str(raw.text, max);
  if (text === null) {
    ctx.notes.push(`scene ${ctx.scene}, template ${ctx.kind}, item ${n} dropped: text must be 1 to ${max} characters`);
    return null;
  }
  return { text, item: raw };
}

// ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
function checklist(t: Raw, ctx: Ctx): Raw[] {
  unknownKeys(t, ["kind", "title", "items"], ctx);
  const title = titleOf(t.title, ctx);
  const kept: Array<{ text: string; state: (typeof CHECK_STATES)[number]; s: number }> = [];
  for (const [i, raw] of listOf(t.items, L.checklist.items, ctx, "items").entries()) {
    const got = itemOf(raw, L.checklist.text, ctx, i + 1, ["state"]);
    if (!got) continue;
    let state: (typeof CHECK_STATES)[number] = "todo";
    if (got.item.state !== undefined) {
      if ((CHECK_STATES as readonly string[]).includes(got.item.state as string)) state = got.item.state as (typeof CHECK_STATES)[number];
      else ctx.notes.push(`scene ${ctx.scene}, template checklist, item ${i + 1}: state must be done, todo or wrong; todo was used`);
    }
    kept.push({ text: got.text, state, s: cueOf(got.item.s, kept.length, ctx, `, item ${i + 1}`) });
  }
  if (kept.length === 0) return dropped(ctx, "it has no valid item");
  const top = title ? 10 : 5;
  const pitch = Math.min(6.2, (AREA.yBottom - top) / kept.length);
  const BOX = 3.4;
  const GAP = 2.4;
  const widest = Math.max(...kept.map((k) => textWidth(k.text, SIZE.body, false, k.state === "wrong" ? "look-again" : undefined)));
  const x0 = 50 - (BOX + GAP + widest) / 2;
  const out: Raw[] = [...titleShape(title)];
  for (const [i, k] of kept.entries()) {
    const y = top + pitch * (i + 0.5);
    const id = `t_i${i + 1}`;
    out.push(rectShape(`${id}_box`, x0, y - BOX / 2, BOX, BOX, k.s));
    if (k.state === "done") {
      out.push(lineShape(`${id}_a`, x0 + 0.7, y + 0.1, x0 + 1.4, y + 1, k.s, { width: 0.5, role: "checked", off: 500 }), lineShape(`${id}_b`, x0 + 1.4, y + 1, x0 + 2.8, y - 1.1, k.s, { width: 0.5, role: "checked", off: 800 }));
    } else if (k.state === "wrong") {
      out.push(lineShape(`${id}_a`, x0 + 0.8, y - 0.9, x0 + 2.6, y + 0.9, k.s, { width: 0.5, role: "look-again", off: 500 }), lineShape(`${id}_b`, x0 + 2.6, y - 0.9, x0 + 0.8, y + 0.9, k.s, { width: 0.5, role: "look-again", off: 800 }));
    }
    out.push(textShape(`${id}_t`, x0 + BOX + GAP, y, k.text, k.s, { anchor: "start", ...(k.state === "wrong" ? { role: "look-again" as const } : {}) }));
  }
  return out;
}

// ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
function table(t: Raw, ctx: Ctx): Raw[] {
  unknownKeys(t, ["kind", "title", "header", "rows", "highlight"], ctx);
  const title = titleOf(t.title, ctx);
  const header = Array.isArray(t.header) ? t.header : null;
  if (!header || header.length < 2 || header.length > L.table.cols) return dropped(ctx, `header must be a list of 2 to ${L.table.cols} column names`);
  const cols = header.length;
  const size = cols >= 4 ? SIZE.small : SIZE.body;
  const colW = Math.min(26, AREA.w / cols);
  const headMax = Math.min(L.table.cell, fitChars(colW - 1.6, size, true));
  const cellMax = Math.min(L.table.cell, fitChars(colW - 1.6, size, false));
  const head = header.map((h) => str(h, headMax));
  if (head.some((h) => h === null)) return dropped(ctx, `every column name must be text of 1 to ${headMax} characters (${cols} columns)`);
  const rows: Array<{ cells: string[]; s: number }> = [];
  for (const [i, raw] of listOf(t.rows, L.table.rows, ctx, "rows").entries()) {
    const body = Array.isArray(raw) ? raw : isObj(raw) && Array.isArray(raw.cells) ? raw.cells : null;
    if (isObj(raw)) unknownKeys(raw, ["cells", "s"], ctx, `, row ${i + 1}`);
    const cells = body ? body.map((c) => cell(c, cellMax)) : [];
    if (!body || cells.length !== cols || cells.some((c) => c === null)) {
      ctx.notes.push(`scene ${ctx.scene}, template table, row ${i + 1} dropped: it needs ${cols} cells, each text or a number of 1 to ${cellMax} characters`);
      continue;
    }
    rows.push({ cells: cells as string[], s: cueOf(isObj(raw) ? raw.s : undefined, rows.length + 1, ctx, `, row ${i + 1}`) });
  }
  if (rows.length === 0) return dropped(ctx, "it has no valid row");
  const top = title ? 9.5 : 4;
  const lines = rows.length + 1;
  const pitch = Math.min(5.4, (AREA.yBottom - top) / lines);
  const width = colW * cols;
  const x0 = 50 - width / 2;
  const cx = (c: number): number => x0 + colW * (c + 0.5);
  const rowY = (r: number): number => top + pitch * (r + 0.5);
  const out: Raw[] = [...titleShape(title)];
  const hs = 0;
  for (let c = 0; c < cols; c++) out.push(textShape(`t_h${c + 1}`, cx(c), rowY(0), head[c]!, hs, { size, bold: true }));
  out.push(lineShape("t_rule0", x0, top, x0 + width, top, hs, { width: 0.3 }), lineShape("t_rule1", x0, top + pitch, x0 + width, top + pitch, hs, { width: 0.4, off: 200 }));
  for (let c = 1; c < cols; c++) out.push(lineShape(`t_col${c}`, x0 + colW * c, top, x0 + colW * c, top + pitch * lines, hs, { width: 0.15, off: 300 }));
  for (const [r, row] of rows.entries()) {
    for (let c = 0; c < cols; c++) out.push(textShape(`t_r${r + 1}c${c + 1}`, cx(c), rowY(r + 1), row.cells[c]!, row.s, { size }));
    out.push(lineShape(`t_rule${r + 2}`, x0, top + pitch * (r + 2), x0 + width, top + pitch * (r + 2), row.s, { width: r === rows.length - 1 ? 0.3 : 0.12, off: 200 }));
  }
  // an optional highlighted row and/or column: a tinted band behind the text, in the key role
  if (t.highlight !== undefined) {
    if (!isObj(t.highlight)) ctx.notes.push(`scene ${ctx.scene}, template table: highlight must be { row?, col?, s? }; it was ignored`);
    else {
      const h = t.highlight;
      unknownKeys(h, ["row", "col", "s"], ctx, ", highlight");
      const hsent = cueOf(h.s, lastOf(ctx), ctx, ", highlight");
      const inRange = (v: unknown, max: number): v is number => typeof v === "number" && Number.isInteger(v) && v >= 1 && v <= max;
      if (h.row !== undefined && !inRange(h.row, rows.length)) ctx.notes.push(`scene ${ctx.scene}, template table: highlight.row must be a whole number from 1 to ${rows.length}; it was ignored`);
      else if (h.row !== undefined) out.push(rectShape("t_hl_row", x0, top + pitch * (h.row as number) + 0.1, width, pitch - 0.2, hsent, { role: "key", fillOpacity: 0.16, z: -1 }));
      if (h.col !== undefined && !inRange(h.col, cols)) ctx.notes.push(`scene ${ctx.scene}, template table: highlight.col must be a whole number from 1 to ${cols}; it was ignored`);
      else if (h.col !== undefined) out.push(rectShape("t_hl_col", x0 + colW * ((h.col as number) - 1) + 0.1, top + 0.1, colW - 0.2, pitch * lines - 0.2, hsent, { role: "key", fillOpacity: 0.16, z: -1 }));
      if (h.row === undefined && h.col === undefined) ctx.notes.push(`scene ${ctx.scene}, template table: highlight names neither a row nor a column; it was ignored`);
    }
  }
  return out;
}

// ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
type Panel = { label: string; role: TemplateRole | undefined; points: Array<{ text: string; s: number }>; labelS: number };
function panel(raw: unknown, side: "left" | "right", rank: { n: number }, ctx: Ctx): Panel | null {
  if (!isObj(raw)) {
    ctx.notes.push(`scene ${ctx.scene}, template comparison: ${side} must be an object with label and points`);
    return null;
  }
  unknownKeys(raw, ["label", "role", "s", "points"], ctx, `, ${side}`);
  const label = str(raw.label, L.comparison.label);
  if (label === null) {
    ctx.notes.push(`scene ${ctx.scene}, template comparison: the ${side} label must be 1 to ${L.comparison.label} characters`);
    return null;
  }
  const role = roleOf(raw.role, ctx, `, ${side}`);
  const labelS = cueOf(raw.s, rank.n++, ctx, `, ${side}`);
  const points: Panel["points"] = [];
  for (const [i, p] of listOf(raw.points, L.comparison.points, ctx, `${side} points`).entries()) {
    const got = itemOf(p, L.comparison.point, ctx, i + 1);
    if (got) points.push({ text: got.text, s: cueOf(got.item.s, rank.n++, ctx, `, ${side} point ${i + 1}`) });
  }
  if (points.length === 0) {
    ctx.notes.push(`scene ${ctx.scene}, template comparison: the ${side} panel has no valid point`);
    return null;
  }
  return { label, role, points, labelS };
}

function comparison(t: Raw, ctx: Ctx): Raw[] {
  unknownKeys(t, ["kind", "title", "left", "right"], ctx);
  const title = titleOf(t.title, ctx);
  const rank = { n: 0 };
  const left = panel(t.left, "left", rank, ctx);
  const right = panel(t.right, "right", rank, ctx);
  if (!left || !right) return dropped(ctx, "it needs a valid left and a valid right panel");
  const top = title ? 9.5 : 4;
  const W = 43;
  const most = Math.max(left.points.length, right.points.length);
  const bottom = Math.min(41.2, top + 8.5 + 6.6 * most + 2);
  const out: Raw[] = [...titleShape(title)];
  for (const [side, p, x] of [["l", left, 5], ["r", right, 52]] as const) {
    out.push(rectShape(`t_${side}_box`, x, top, W, bottom - top, p.labelS, { round: 1.2 }));
    out.push(textShape(`t_${side}_lab`, x + W / 2, top + 4, p.label, p.labelS, { size: 3.4, bold: true, ...(p.role ? { role: p.role } : {}) }));
    out.push(lineShape(`t_${side}_rule`, x + 3, top + 7.4, x + W - 3, top + 7.4, p.labelS, { width: 0.2, off: 200 }));
    const pitch = Math.min(6.6, (bottom - top - 8.5 - 1.5) / p.points.length);
    for (const [i, pt] of p.points.entries()) out.push(textShape(`t_${side}_p${i + 1}`, x + 3.5, top + 8.5 + pitch * (i + 0.5), pt.text, pt.s, { size: SIZE.small, anchor: "start" }));
  }
  return out;
}

// ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
function steps(t: Raw, ctx: Ctx): Raw[] {
  unknownKeys(t, ["kind", "title", "steps"], ctx);
  const title = titleOf(t.title, ctx);
  const BOX = { w: 26, h: 12.5, gapX: 6, gapY: 6 };
  const maxChars = fitChars(BOX.w - 2.4, SIZE.small, false);
  const kept: Array<{ lines: string[]; s: number }> = [];
  for (const [i, raw] of listOf(t.steps, L.steps.max, ctx, "steps").entries()) {
    const got = itemOf(raw, L.steps.text, ctx, i + 1);
    if (!got) continue;
    const lines = wrap(got.text, maxChars, 2);
    if (!lines) {
      ctx.notes.push(`scene ${ctx.scene}, template steps, item ${i + 1} dropped: the text does not fit two lines of ${maxChars} characters`);
      continue;
    }
    kept.push({ lines, s: cueOf(got.item.s, kept.length, ctx, `, item ${i + 1}`) });
  }
  if (kept.length < L.steps.min) return dropped(ctx, `it needs ${L.steps.min} to ${L.steps.max} valid steps (${kept.length} were valid)`);
  const n = kept.length;
  const perRow = n <= 3 ? [n] : n === 4 ? [2, 2] : n === 5 ? [3, 2] : [3, 3];
  const cols = Math.max(...perRow);
  const top0 = title ? 10 : 3.5;
  const height = perRow.length * BOX.h + (perRow.length - 1) * BOX.gapY;
  const top = top0 + Math.max(0, (AREA.yBottom - top0 - height) / 2);
  const gridW = cols * BOX.w + (cols - 1) * BOX.gapX;
  const gx = 50 - gridW / 2;
  const out: Raw[] = [...titleShape(title)];
  const at: Array<{ x: number; y: number }> = [];
  for (const [r, count] of perRow.entries()) {
    for (let j = 0; j < count; j++) {
      const slot = r % 2 === 0 ? j : cols - 1 - j; // a second row runs right to left, so the arrow down from the end of a row is a short one
      at.push({ x: gx + slot * (BOX.w + BOX.gapX), y: top + r * (BOX.h + BOX.gapY) });
    }
  }
  for (const [k, st] of kept.entries()) {
    const p = at[k]!;
    out.push(rectShape(`t_s${k + 1}_box`, p.x, p.y, BOX.w, BOX.h, st.s, { round: 1.2 }));
    // the number is its own bold line: a leading "1." in a text is taken for list numbering and stripped by the sanitiser
    out.push(textShape(`t_s${k + 1}_n`, p.x + BOX.w / 2, p.y + 2.6, String(k + 1), st.s, { size: SIZE.small, bold: true }));
    for (const [li, line] of st.lines.entries()) out.push(textShape(`t_s${k + 1}_t${li + 1}`, p.x + BOX.w / 2, p.y + (st.lines.length === 1 ? 7.9 : 6.1 + li * 3.7), line, st.s, { size: SIZE.small }));
    if (k > 0) {
      const q = at[k - 1]!;
      const same = Math.abs(q.y - p.y) < 0.01;
      const dir = p.x > q.x ? 1 : -1;
      if (same) out.push({ id: `t_a${k}`, kind: "arrow", x1: round2(dir === 1 ? q.x + BOX.w + 0.4 : q.x - 0.4), y1: round2(p.y + BOX.h / 2), x2: round2(dir === 1 ? p.x - 0.4 : p.x + BOX.w + 0.4), y2: round2(p.y + BOX.h / 2), width: 0.4, color: "ink", how: "draw", in: { s: st.s, off: 0 } });
      else out.push({ id: `t_a${k}`, kind: "arrow", x1: round2(q.x + BOX.w / 2), y1: round2(q.y + BOX.h + 0.4), x2: round2(p.x + BOX.w / 2), y2: round2(p.y - 0.4), width: 0.4, color: "ink", how: "draw", in: { s: st.s, off: 0 } });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
function quiz(t: Raw, ctx: Ctx): Raw[] {
  unknownKeys(t, ["kind", "question", "options", "answer", "reveal"], ctx);
  const question = str(t.question, L.quiz.question);
  if (question === null) return dropped(ctx, `question must be text of 1 to ${L.quiz.question} characters`);
  const qLines = wrap(question, fitChars(AREA.w, 3.4, false), 2);
  if (!qLines) return dropped(ctx, "the question does not fit two lines");
  const opts: Array<{ text: string; s: number }> = [];
  for (const [i, raw] of listOf(t.options, L.quiz.options, ctx, "options").entries()) {
    const got = itemOf(raw, L.quiz.option, ctx, i + 1);
    if (got) opts.push({ text: got.text, s: cueOf(got.item.s, opts.length + 1, ctx, `, option ${i + 1}`) });
  }
  if (opts.length < 2) return dropped(ctx, `it needs 2 to ${L.quiz.options} valid options`);
  // the answer is an option number from 0 or a letter A to D; with no valid answer the question is shown and nothing is revealed
  let answer: number | null = null;
  if (t.answer !== undefined) {
    const a = typeof t.answer === "string" && /^[A-D]$/.test(t.answer) ? t.answer.charCodeAt(0) - 65 : t.answer;
    if (typeof a === "number" && Number.isInteger(a) && a >= 0 && a < opts.length) answer = a;
    else ctx.notes.push(`scene ${ctx.scene}, template quiz: answer must be the number (from 0) or the letter of one of the ${opts.length} options; nothing is revealed`);
  }
  if (t.reveal !== undefined && answer === null && t.answer === undefined) ctx.notes.push(`scene ${ctx.scene}, template quiz: reveal needs an answer; it was ignored`);
  const reveal = cueOf(t.reveal, lastOf(ctx), ctx, ", reveal");
  const out: Raw[] = [];
  for (const [i, line] of qLines.entries()) out.push(textShape(`t_q${i + 1}`, 50, 5 + i * 4.2, line, 0, { size: 3.4, bold: true }));
  const ROW = { top: qLines.length === 1 ? 14.5 : 16.5, pitch: 7, h: 6, x: 8, w: 84 };
  for (const [i, o] of opts.entries()) {
    const y = ROW.top + ROW.pitch * i;
    out.push(rectShape(`t_o${i + 1}_box`, ROW.x, y - ROW.h / 2, ROW.w, ROW.h, o.s, { round: 1 }));
    out.push(textShape(`t_o${i + 1}_t`, ROW.x + 3.5, y, `${String.fromCharCode(65 + i)}. ${o.text}`, o.s, { anchor: "start" }));
    if (answer === i) {
      // a little inside the option's own box: the animated style makes every box breathe a little, and two boxes of one size would show a double edge
      out.push(rectShape(`t_o${i + 1}_ok`, ROW.x + 0.8, y - ROW.h / 2 + 0.8, ROW.w - 1.6, ROW.h - 1.6, reveal, { role: "checked", fillOpacity: 0.2, round: 0.6, z: -1 }));
      out.push(textShape(`t_o${i + 1}_c`, ROW.x + ROW.w - 3, y, "correct", reveal, { anchor: "end", role: "checked", size: SIZE.small, bold: true }));
    }
  }
  return out;
}

// ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
/** A scale end for a bar chart: the smallest of 1, 2, 2.5, 5 and 10 times a power of ten that is at least `max`. */
export function niceMax(max: number): number {
  const exp = 10 ** Math.floor(Math.log10(max));
  const f = max / exp;
  const nf = f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10;
  return Math.round(nf * exp * 1e6) / 1e6;
}
/** A number as printed on a chart: at most two decimals, no trailing zeros. */
export const printNumber = (v: number): string => String(Math.round(v * 100) / 100);

function bars(t: Raw, ctx: Ctx): Raw[] {
  unknownKeys(t, ["kind", "title", "bars"], ctx);
  const title = titleOf(t.title, ctx);
  const count = Array.isArray(t.bars) ? Math.min(L.bars.max, t.bars.length) : 0;
  const slot = 80 / Math.max(2, count);
  const labelMax = Math.min(L.bars.label, fitChars(slot - 0.8, SIZE.small, false));
  const valueMax = fitChars(slot - 1, SIZE.small, false);
  const kept: Array<{ label: string; value: number; shown: string; role: TemplateRole; s: number }> = [];
  for (const [i, b] of listOf(t.bars, L.bars.max, ctx, "bars").entries()) {
    if (!isObj(b)) {
      ctx.notes.push(`scene ${ctx.scene}, template bars, bar ${i + 1} dropped: a bar must be an object with label and value`);
      continue;
    }
    unknownKeys(b, ["label", "value", "role", "s"], ctx, `, bar ${i + 1}`);
    const label = str(b.label, labelMax);
    const value = typeof b.value === "number" && Number.isFinite(b.value) && b.value >= 0 && b.value <= L.bars.value ? b.value : null;
    if (label === null || value === null) {
      ctx.notes.push(`scene ${ctx.scene}, template bars, bar ${i + 1} dropped: label must be 1 to ${labelMax} characters (${count} bars) and value a number from 0 to ${L.bars.value}`);
      continue;
    }
    const shown = printNumber(value);
    if (shown.length > valueMax) {
      ctx.notes.push(`scene ${ctx.scene}, template bars, bar ${i + 1} dropped: its value "${shown}" is too long to print under ${count} bars (at most ${valueMax} characters)`);
      continue;
    }
    kept.push({ label, value, shown, role: roleOf(b.role, ctx, `, bar ${i + 1}`) ?? "term", s: cueOf(b.s, kept.length, ctx, `, bar ${i + 1}`) });
  }
  if (kept.length < 2) return dropped(ctx, "it needs 2 to 8 valid bars");
  const peak = Math.max(...kept.map((k) => k.value));
  if (peak <= 0) return dropped(ctx, "every value is 0, so there is nothing to scale");
  const top = niceMax(peak);
  const X0 = 14;
  const BASE = 34;
  const H = 22;
  const out: Raw[] = [...titleShape(title)];
  // a tick at the top of the scale, not a line across the chart: a printed value above a tall bar would be struck through by it
  out.push(lineShape("t_base", X0, BASE, 94, BASE, 0, { width: 0.35 }), lineShape("t_top", X0 - 1.2, BASE - H, X0, BASE - H, 0, { width: 0.3, off: 200 }));
  out.push(textShape("t_ax0", X0 - 1.8, BASE, "0", 0, { size: SIZE.small, anchor: "end" }), textShape("t_axtop", X0 - 1.8, BASE - H, printNumber(top), 0, { size: SIZE.small, anchor: "end" }));
  const sl = 80 / kept.length;
  const bw = Math.min(12, sl * 0.62);
  for (const [i, k] of kept.entries()) {
    const cx = X0 + sl * (i + 0.5);
    const h = (k.value / top) * H;
    if (h > 0) out.push({ ...rectShape(`t_b${i + 1}`, cx - bw / 2, BASE - h, bw, h, k.s, { role: k.role, fillOpacity: 0.85 }), how: "flood", floodFrom: "bottom" });
    out.push(textShape(`t_v${i + 1}`, cx, BASE - h - 2.3, k.shown, k.s, { size: SIZE.small, bold: true, off: h > 0 ? 900 : 0 }));
    out.push(textShape(`t_l${i + 1}`, cx, BASE + 3.6, k.label, k.s, { size: SIZE.small }));
  }
  return out;
}

// ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
const FRAME = { x: 8, y: 2.5, w: 84, h: 38.5 } as const;
function definition(t: Raw, ctx: Ctx): Raw[] {
  unknownKeys(t, ["kind", "term", "meaning", "example"], ctx);
  const term = str(t.term, L.definition.term);
  if (term === null) return dropped(ctx, `term must be text of 1 to ${L.definition.term} characters`);
  const meaning = str(t.meaning, L.definition.meaning);
  const mLines = meaning === null ? null : wrap(meaning, fitChars(FRAME.w - 4, 3.4, false), 3);
  if (!mLines) return dropped(ctx, `meaning must be text of 1 to ${L.definition.meaning} characters that fits three lines`);
  const ex = optStr(t.example, L.definition.example);
  const exLines = ex ? wrap(`Example: ${ex}`, fitChars(FRAME.w - 4, 3.4, false), 2) : null;
  if (ex === null || (ex && !exLines)) ctx.notes.push(`scene ${ctx.scene}, template definition: example must be text of 1 to ${L.definition.example} characters that fits two lines; it was left out`);
  const out: Raw[] = [rectShape("t_frame", FRAME.x, FRAME.y, FRAME.w, FRAME.h, 0, { round: 1.5 })];
  out.push(textShape("t_term", 50, 8.5, term, 0, { size: SIZE.big, bold: true, role: "term" }), lineShape("t_rule", 30, 12.6, 70, 12.6, 0, { width: 0.3, off: 300 }));
  const sm = cueOf(undefined, 1, ctx, "");
  for (const [i, line] of mLines.entries()) out.push(textShape(`t_m${i + 1}`, 50, 18.5 + i * 4.8, line, sm, { size: 3.4 }));
  if (exLines) {
    const se = cueOf(undefined, 2, ctx, "");
    for (const [i, line] of exLines.entries()) out.push(textShape(`t_e${i + 1}`, 50, 32.8 + i * 4.6, line, se, { size: 3.4, role: "key" }));
  }
  return out;
}

// ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
function endcard(t: Raw, ctx: Ctx): Raw[] {
  unknownKeys(t, ["kind", "title", "lines", "provenance"], ctx);
  const title = str(t.title, L.endcard.title);
  if (title === null) return dropped(ctx, `title must be text of 1 to ${L.endcard.title} characters`);
  const lines: Array<{ text: string; s: number }> = [];
  if (t.lines !== undefined) {
    for (const [i, raw] of listOf(t.lines, L.endcard.lines, ctx, "lines").entries()) {
      const text = str(raw, L.endcard.line);
      if (text === null) ctx.notes.push(`scene ${ctx.scene}, template endcard, line ${i + 1} dropped: a line must be text of 1 to ${L.endcard.line} characters`);
      else lines.push({ text, s: cueOf(undefined, lines.length + 1, ctx, "") });
    }
  }
  if (t.provenance !== undefined && typeof t.provenance !== "boolean") ctx.notes.push(`scene ${ctx.scene}, template endcard: provenance must be true or false; it was left out`);
  const out: Raw[] = [rectShape("t_frame", FRAME.x, FRAME.y, FRAME.w, FRAME.h + 0.5, 0, { round: 1.5 })];
  out.push(textShape("t_title", 50, 10, title, 0, { size: SIZE.big, bold: true, role: "term" }));
  for (const [i, l] of lines.entries()) out.push(textShape(`t_l${i + 1}`, 50, 19.5 + i * 5.6, l.text, l.s, { size: 3.4 }));
  if (t.provenance === true) {
    const p = wrap(PROVENANCE_LINE, fitChars(FRAME.w - 4, SIZE.small, false), 2)!;
    for (const [i, line] of p.entries()) out.push(textShape(`t_p${i + 1}`, 50, 34.6 + i * 3.6, line, 0, { size: SIZE.small }));
  }
  return out;
}

// ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
const EXPANDERS: Record<TemplateKind, (t: Raw, ctx: Ctx) => Raw[]> = { checklist, table, comparison, steps, quiz, bars, definition, endcard };

/**
 * The raw shapes a scene's `template` stands for, for the sanitiser; `notes` collects what was dropped or changed. A template that is absent gives no shapes; one that is not an
 * object, or of a kind that is not one of the eight, is dropped with a note.
 */
export function expandTemplate(raw: unknown, sentenceCount: number, notes: string[], sceneNo: number): Raw[] {
  if (raw === undefined) return [];
  if (!isObj(raw)) {
    notes.push(`scene ${sceneNo}: template must be an object with a kind (${TEMPLATE_KINDS.join(", ")}); it was ignored`);
    return [];
  }
  const kind = (TEMPLATE_KINDS as readonly string[]).includes(raw.kind as string) ? (raw.kind as TemplateKind) : null;
  if (kind === null) {
    notes.push(`scene ${sceneNo}: template kind must be one of ${TEMPLATE_KINDS.join(", ")}; the template was ignored`);
    return [];
  }
  return EXPANDERS[kind](raw, { notes, scene: sceneNo, kind, sentences: sentenceCount });
}
