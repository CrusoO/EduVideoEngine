/**
 * Shared pieces of the scene templates (ADR 0119): reading a field strictly, measuring and wrapping a line of text, and building the plain `text` shape every template is made of.
 * A template never sets a colour or a coordinate for the host: the host gives typed data, and `story-templates.ts` turns it into ordinary shapes before the usual sanitising, so
 * every other rule (roles, cues, the personal-data check, the layout, the strict gates) applies to them unchanged. Pure: no clock, no randomness, no files.
 */
export const TEMPLATE_KINDS = ["checklist", "table", "comparison", "steps", "quiz", "bars", "definition", "endcard"] as const;
export type TemplateKind = (typeof TEMPLATE_KINDS)[number];
export const TEMPLATE_ROLES = ["term", "key", "look-again", "checked"] as const;
export type TemplateRole = (typeof TEMPLATE_ROLES)[number];

/** A raw shape for the story sanitiser. */
export type Raw = Record<string, unknown>;
/** What every expander gets: the notes list (what was dropped or changed), the scene number from 1 for the notes, the kind for the notes, and how many sentences the scene has. */
export type Ctx = { notes: string[]; scene: number; kind: TemplateKind; sentences: number };

/** The part of the stage a template may fill: the placement grid's own width less a margin (x 6 to 94), and from the top of the safe area to just above the caption band (y 42). */
export const AREA = { x0: 6, x1: 94, w: 88, yTop: 3, yBottom: 41.5 } as const;
/** Text sizes of templates (stage units). Strict QA needs at least 2.93 on the card page and 2.56 full-bleed (ADR 0118); every template text is at least BODY. */
export const SIZE = { body: 3.2, small: 3, title: 3.8, big: 5 } as const;

export const isObj = (v: unknown): v is Raw => typeof v === "object" && v !== null && !Array.isArray(v);
const r2 = (n: number): number => Math.round(n * 100) / 100;
export const round2 = r2;
const length = (s: string): number => Array.from(s).length;

/** The mark `applyRole` (story-roles.ts) puts before a line of text in this role; a line's room has to include it. */
export const markLength = (role: TemplateRole | undefined): number => (role === "look-again" ? 2 : role === "checked" ? 3 : 0);

/** The width of a line of text in stage units, by the same estimate the layout uses (story-layout.ts: 0.54 of the size a glyph, 0.58 bold), with the role's mark included. */
export function textWidth(text: string, size: number, bold: boolean, role?: TemplateRole): number {
  return (length(text) + markLength(role)) * size * (bold ? 0.58 : 0.54);
}
/** How many characters of a line fit in `width` units (the role's mark counted in). */
export function fitChars(width: number, size: number, bold: boolean, role?: TemplateRole): number {
  return Math.max(0, Math.floor(width / (size * (bold ? 0.58 : 0.54))) - markLength(role));
}

/** Warns once about each field the template does not know (coordinates, colours, free shapes): they are ignored, never read. */
export function unknownKeys(raw: Raw, allowed: readonly string[], ctx: Ctx, where = ""): void {
  const extra = Object.keys(raw).filter((k) => !allowed.includes(k));
  if (extra.length > 0) ctx.notes.push(`scene ${ctx.scene}, template ${ctx.kind}${where}: ${extra.slice(0, 6).map((k) => `"${k.slice(0, 20)}"`).join(", ")} ${extra.length === 1 ? "is not a field" : "are not fields"} of this template; ignored`);
}

/** A text of 1 to `max` characters; null when it is not a string, is empty after trimming, or is too long. Control characters count as spaces. */
export function str(v: unknown, max: number): string | null {
  if (typeof v !== "string") return null;
  const t = v.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
  return t !== "" && length(t) <= max ? t : null;
}
/** A cell: a text as above, or a finite number written plainly (at most `max` characters). */
export function cell(v: unknown, max: number): string | null {
  return typeof v === "number" ? (Number.isFinite(v) ? str(String(v), max) : null) : str(v, max);
}
/** An optional text: undefined when absent, null when present but invalid (the caller notes it). */
export function optStr(v: unknown, max: number): string | null | undefined {
  return v === undefined ? undefined : str(v, max);
}

/** A role named in the template, or undefined. A value that is not one of the four roles is noted and ignored. */
export function roleOf(v: unknown, ctx: Ctx, where: string): TemplateRole | undefined {
  if (v === undefined) return undefined;
  if (typeof v === "string" && (TEMPLATE_ROLES as readonly string[]).includes(v)) return v as TemplateRole;
  ctx.notes.push(`scene ${ctx.scene}, template ${ctx.kind}${where}: role must be one of ${TEMPLATE_ROLES.join(", ")}; it was ignored`);
  return undefined;
}

/** The sentence an item appears on: the `s` the host gave (a whole number from 0), else the item's own rank, kept inside the scene's sentences. */
export function cueOf(s: unknown, rank: number, ctx: Ctx, where: string): number {
  const last = Math.max(0, ctx.sentences - 1);
  if (s === undefined) return Math.min(rank, last);
  if (typeof s === "number" && Number.isInteger(s) && s >= 0) return Math.min(s, last);
  ctx.notes.push(`scene ${ctx.scene}, template ${ctx.kind}${where}: s must be a whole number from 0 (the sentence it appears on); the item's own place was used`);
  return Math.min(rank, last);
}

/** The greedy fill: words on a line while they fit in `max` characters; a word longer than that is cut. */
function fill(text: string, max: number): string[] {
  const out: string[] = [];
  let cur = "";
  for (const word of text.split(" ")) {
    let w = word;
    while (length(w) > max) {
      if (cur) {
        out.push(cur);
        cur = "";
      }
      const chars = Array.from(w);
      out.push(chars.slice(0, max).join(""));
      w = chars.slice(max).join("");
    }
    if (cur === "") cur = w;
    else if (length(cur) + 1 + length(w) <= max) cur += ` ${w}`;
    else {
      out.push(cur);
      cur = w;
    }
  }
  if (cur) out.push(cur);
  return out;
}

/**
 * Splits a text on spaces into lines of at most `max` characters; a word longer than that is cut. Null when it needs more than `lines` lines. The lines are balanced: the width is
 * lowered, never below the longest word, for as long as the number of lines stays the same, so a line is not left with one word ("Divide both by" and "2").
 */
export function wrap(text: string, max: number, lines: number): string[] | null {
  if (max < 1) return null;
  let best = fill(text, max);
  if (best.length > lines) return null;
  const longest = Math.max(...text.split(" ").map(length));
  for (let m = max - 1; m >= longest; m--) {
    const next = fill(text, m);
    if (next.length !== best.length) break;
    best = next;
  }
  return best;
}

export type TextOpts = { size?: number; anchor?: "start" | "middle" | "end"; bold?: boolean; role?: TemplateRole; off?: number; how?: "fade" | "write" | "pop" };
/** A line of text as a raw shape. `s` is the sentence that brings it in. */
export function textShape(id: string, x: number, y: number, text: string, s: number, o: TextOpts = {}): Raw {
  return { id, kind: "text", x: r2(x), y: r2(y), text, size: o.size ?? SIZE.body, anchor: o.anchor ?? "middle", bold: o.bold === true, ...(o.role ? { role: o.role } : {}), how: o.how ?? "fade", in: { s, off: o.off ?? 0 } };
}
/** A line, from (x1, y1) to (x2, y2). */
export function lineShape(id: string, x1: number, y1: number, x2: number, y2: number, s: number, o: { width?: number; role?: TemplateRole; off?: number } = {}): Raw {
  return { id, kind: "line", x1: r2(x1), y1: r2(y1), x2: r2(x2), y2: r2(y2), width: o.width ?? 0.3, color: "ink", ...(o.role ? { role: o.role } : {}), how: "draw", in: { s, off: o.off ?? 0 } };
}
/** A rectangle with no fill unless a role is given; `z` below 0 puts it behind the text. */
export function rectShape(id: string, x: number, y: number, w: number, h: number, s: number, o: { role?: TemplateRole; fillOpacity?: number; round?: number; off?: number; z?: number; how?: "fade" | "draw" } = {}): Raw {
  return { id, kind: "rect", x: r2(x), y: r2(y), w: r2(w), h: r2(h), round: o.round ?? 0, color: "ink", ...(o.role ? { role: o.role, fill: "blue", fillOpacity: o.fillOpacity ?? 0.15 } : {}), ...(o.z !== undefined ? { z: o.z } : {}), how: o.how ?? "fade", in: { s, off: o.off ?? 0 } };
}

/** An optional title, up to 36 characters. Returns the text, or undefined when there is none or it is invalid (noted). */
export function titleOf(v: unknown, ctx: Ctx, max = 36): string | undefined {
  const t = optStr(v, max);
  if (t === null) ctx.notes.push(`scene ${ctx.scene}, template ${ctx.kind}: the title must be text of 1 to ${max} characters; it was left out`);
  return t ?? undefined;
}
