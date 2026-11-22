/**
 * A worked-step scene (ADR 0115). A scene may carry `steps` instead of hand-placed formulas: a short list of lines of working, each said by one sentence, and the engine stacks them
 * down the middle of the stage with a size that fits their number. A step may be `wrong: true` (the common mistake: it is drawn in the look-again role and struck through by a line the engine draws, so a viewer
 * who cannot tell colours apart still sees it is crossed out) or carry a role (`checked` for the line that verifies the answer, `key` for the result). The steps are turned into
 * ordinary `math` shapes before the usual sanitising, so every other rule (roles, cues, the layout check) applies to them unchanged. Pure.
 *
 * A step is `{ latex, say?, role?, wrong? }`: `say` is the sentence (from 0) that brings it in; left out it is the step's own position, kept inside the scene's sentences. At most
 * STEP_LIMIT steps are kept; a step with no formula is dropped with a note.
 */
export const STEP_LIMIT = 6;
const ROLES = ["term", "key", "look-again", "checked"] as const;
const FRAME = { top: 2.5, height: 39 } as const;

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
/** How many glyph cells a formula takes: commands count as one, braces, spaces and the colour argument none. A rough measure, tuned on KaTeX output (a token is about one size unit wide). */
export function mathTokens(latex: string): number {
  const bare = latex.replace(/\\textcolor\{[^}]*\}/g, "").replace(/\\[a-zA-Z]+/g, "X").replace(/[{}\s^_$]/g, "");
  return Math.max(1, bare.length);
}



/** The size of a line of working for a given number of lines: five units for up to three lines, then smaller so the stack still fits above the caption band. */
export const stepSize = (n: number): number => (n <= 3 ? 5 : n === 4 ? 4.4 : n === 5 ? 4 : 3.6);

/** The formulas a scene's `steps` stand for, as raw shapes for the sanitiser; `notes` collects what was dropped or changed. */
export function expandSteps(raw: unknown, sentenceCount: number, notes: string[], sceneNo: number): Array<Record<string, unknown>> {
  if (raw === undefined) return [];
  if (!Array.isArray(raw)) {
    notes.push(`scene ${sceneNo}: steps must be a list; it was ignored`);
    return [];
  }
  if (raw.length > STEP_LIMIT) notes.push(`scene ${sceneNo}: only the first ${STEP_LIMIT} steps are kept (${raw.length} were sent)`);
  const kept: Array<{ latex: string; say: number | null; role: string | null; wrong: boolean }> = [];
  for (const [i, s] of raw.slice(0, STEP_LIMIT).entries()) {
    const latex = isObj(s) && typeof s.latex === "string" ? s.latex.trim() : "";
    if (!latex) {
      notes.push(`scene ${sceneNo}, step ${i + 1} dropped: a step needs latex, the line of working`);
      continue;
    }
    const role = isObj(s) && typeof s.role === "string" && (ROLES as readonly string[]).includes(s.role) ? s.role : null;
    if (isObj(s) && s.role !== undefined && role === null) notes.push(`scene ${sceneNo}, step ${i + 1}: role must be one of ${ROLES.join(", ")}; it was ignored`);
    const say = isObj(s) && typeof s.say === "number" && Number.isInteger(s.say) && s.say >= 0 ? s.say : null;
    kept.push({ latex, say, role, wrong: isObj(s) && s.wrong === true });
  }
  const n = kept.length;
  if (n === 0) return [];
  const size = stepSize(n);
  const pitch = Math.min(size * 1.9, FRAME.height / n);
  const top = FRAME.top + (FRAME.height - pitch * n) / 2;
  const out: Array<Record<string, unknown>> = [];
  for (const [i, k] of kept.entries()) {
    const y = Math.round((top + pitch * (i + 0.5)) * 100) / 100;
    const cue = { s: Math.min(k.say ?? i, Math.max(0, sentenceCount - 1)), off: 0 };
    const role = k.wrong ? "look-again" : (k.role ?? undefined);
    out.push({ id: `step${i + 1}`, kind: "math", x: 50, y, latex: k.latex, size, anchor: "middle", display: true, how: "write", role, in: cue });
    if (k.wrong) {
      // the strike is a line the engine draws across the formula, not KaTeX's \cancel (its SVG line is not drawn inside the story page); it comes in a moment after the formula
      const half = (mathTokens(k.latex) * size * 0.98) / 2 + 0.8;
      out.push({ id: `strike${i + 1}`, kind: "line", x1: Math.max(1, 50 - half), y1: y + size * 0.1, x2: Math.min(99, 50 + half), y2: y + size * 0.1, width: 0.4, how: "draw", role: "look-again", in: { ...cue, off: 700 } });
    }
  }
  return out;
}
