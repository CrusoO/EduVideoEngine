import { contrast } from "@eve/components";
import type { LessonBundle, Timeline } from "@eve/schema";
import { minPx } from "./measure";
import type { Layout, SceneInput } from "./solve";
import { solve } from "./solve";
import { EQUATION_WORDS, READING_WPM, referenceViewports, type Viewport } from "./tokens";

export type LayoutFinding = {
  level: "fail";
  code: "overlap" | "outside" | "contrast" | "text-size" | "reading-time" | "sideways";
  sceneId: string;
  viewport: string;
  objectIds: string[];
  message: string;
};

type Where = { sceneId: string; viewport: string };
const fail = (w: Where, code: LayoutFinding["code"], objectIds: string[], message: string): LayoutFinding => ({ level: "fail", code, objectIds, message, ...w });

/** Large text needs 3:1, everything else 4.5:1 (WCAG AA): large is 24 px, or 18.66 px and bold. */
export const requiredContrast = (fontPx: number, bold: boolean): number => (fontPx >= 24 || (bold && fontPx >= 18.66) ? 3 : 4.5);

export type CheckOptions = {
  /** Pairs of objects the spec declares may overlap. None exist in the schema yet. */
  allowOverlap?: ReadonlyArray<readonly [string, string]>;
  /** How long the scene lasts, for the reading-time budget. Omitted: that check is skipped. */
  sceneDurationMs?: number;
};

/** The checks that run on solver output and fail the build. */
export function checkLayout(layout: Layout, where: Where, opts: CheckOptions = {}): LayoutFinding[] {
  const out: LayoutFinding[] = [];
  const ids = Object.keys(layout.boxes);
  const allowed = new Set((opts.allowOverlap ?? []).flatMap(([a, b]) => [`${a}|${b}`, `${b}|${a}`]));

  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      const a = layout.boxes[ids[i]!]!;
      const b = layout.boxes[ids[j]!]!;
      const overlaps = a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
      if (overlaps && !allowed.has(`${ids[i]}|${ids[j]}`)) out.push(fail(where, "overlap", [ids[i]!, ids[j]!], `${ids[i]} and ${ids[j]} overlap`));
    }
  }

  const { width, height } = layout.viewport;
  for (const id of ids) {
    const b = layout.boxes[id]!;
    if (b.x < 0 || b.y < 0 || b.x + b.width > width) out.push(fail(where, "outside", [id], `${id} is outside the ${width} px stage (x ${b.x}..${b.x + b.width})`));
  }
  if (layout.contentHeight > height) {
    out.push(fail(where, "outside", ids, `the scene needs ${layout.contentHeight} px but the stage has ${height} px: it overflows by ${layout.contentHeight - height} px`));
  }

  for (const id of ids) {
    const m = layout.intrinsic[id]!;
    for (const f of m.facts) {
      const need = requiredContrast(f.fontPx, f.bold);
      const got = contrast(f.fg, f.bg);
      if (got < need) out.push(fail(where, "contrast", [id], `${id}: ${f.what} has contrast ${got.toFixed(2)}:1, needs ${need}:1`));
      if (f.fontPx < minPx(f.kind)) out.push(fail(where, "text-size", [id], `${id}: ${f.what} is ${f.fontPx.toFixed(1)} px, the minimum is ${minPx(f.kind)} px`));
    }
    const box = layout.boxes[id]!;
    if (m.naturalWidth !== undefined && m.naturalWidth > box.width) {
      out.push(fail(where, "sideways", [id], `${id}: the formula is about ${m.naturalWidth} px wide in a ${box.width} px box and would scroll sideways`));
    }
  }

  if (opts.sceneDurationMs !== undefined) {
    const words = ids.reduce((n, id) => n + layout.intrinsic[id]!.words + layout.intrinsic[id]!.equations * EQUATION_WORDS, 0);
    const budget = Math.floor((READING_WPM * opts.sceneDurationMs) / 60000);
    if (words > budget) out.push(fail(where, "reading-time", ids, `${words} words to read (maths counted as ${EQUATION_WORDS} words each) but the scene lasts ${(opts.sceneDurationMs / 1000).toFixed(1)} s, which allows ${budget} at ${READING_WPM} words a minute`));
  }
  return out;
}

/** What `assureLayout` needs from a bundle: the scenes and the expression table. */
export type LayoutBundle = Pick<LessonBundle, "scenes" | "expressions" | "locale">;

/**
 * The build rule: every scene of a lesson is solved at every reference viewport and checked, with the real scene
 * durations from the resolved timeline. Any finding fails the build. Nothing is shrunk to make it fit.
 */
export function assureLayout(bundle: LayoutBundle, timeline: Pick<Timeline, "scenes">, viewports: ReadonlyArray<{ name: string; viewport: Viewport }> = referenceViewports()): LayoutFinding[] {
  const out: LayoutFinding[] = [];
  for (const scene of bundle.scenes) {
    const t = timeline.scenes.find((s) => s.sceneId === scene.id);
    const input: SceneInput = { objects: scene.objects, layout: scene.layout };
    for (const { name, viewport } of viewports) {
      const layout = solve(input, viewport, { expressions: bundle.expressions, locale: bundle.locale });
      out.push(...checkLayout(layout, { sceneId: scene.id, viewport: name }, { sceneDurationMs: t ? t.endMs - t.startMs : undefined }));
    }
  }
  return out;
}
