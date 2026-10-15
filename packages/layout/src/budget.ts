import { OVERLAY, measure, type LayoutObject, type MeasureCtx } from "./measure";
import { solve, type SceneInput } from "./solve";
import { DESIGN_SCREEN, GAP, PAD, type Viewport } from "./tokens";

/**
 * The height budget (ADR 0017 section 7). Every component has a pixel height cost, from the same size model the solver uses at
 * run time. A scene must cost no more than the stage; if it does not, the composer splits the beat, and if it cannot, it falls back
 * to the template scene. The budget is a number the composer can be told, and the build checks it again with `assureLayout`.
 */
export type SceneCost = {
  /** What the scene needs: padding, every object and the gaps between them. */
  cost: number;
  /** What the stage has. */
  budget: number;
  /** budget - cost: negative when the scene is over. */
  remaining: number;
  fits: boolean;
  /** Height of each laid-out object. */
  perObject: Record<string, number>;
  /** Padding and gaps: what the scene pays for beyond its objects. */
  overhead: number;
};

export function sceneCost(scene: SceneInput, viewport: Viewport, ctx: MeasureCtx): SceneCost {
  const layout = solve(scene, viewport, ctx);
  const perObject = Object.fromEntries(Object.entries(layout.boxes).map(([id, b]) => [id, b.height]));
  const objects = Object.values(perObject).reduce((a, b) => a + b, 0);
  // A row puts objects side by side, so the objects can cost more than the scene: overhead is then reported as 0, not negative.
  return {
    cost: layout.contentHeight,
    budget: viewport.height,
    remaining: viewport.height - layout.contentHeight,
    fits: layout.contentHeight <= viewport.height,
    perObject,
    overhead: Math.max(0, layout.contentHeight - objects),
  };
}

/** The room kept beyond the tallest scene: a stage slot a little shorter than the chrome budget assumed must still hold the lesson (ADR 0051). */
export const MIN_STAGE_MARGIN_PX = 40;

/** What `lessonMinStagePx` needs of a lesson: its expressions, its language and, for each scene, its objects and layout rules. A LessonBundle has all of it. */
export type LessonForBudget = { expressions: Record<string, import("@eve/schema").Expr>; locale: string; scenes: ReadonlyArray<SceneInput> };

/**
 * The least stage height a host must give a lesson (ADR 0051): the cost of its tallest scene at the design width (360 px) plus a margin of 40 px. It is reported
 * when a lesson is built and goes into the package manifest at INT; a host that cannot give a slot of this height refuses the lesson and never shrinks the scenes.
 */
export function lessonMinStagePx(lesson: LessonForBudget): number {
  const ctx = { expressions: lesson.expressions, locale: lesson.locale };
  const viewport = { width: DESIGN_SCREEN.width, height: DESIGN_SCREEN.height };
  const tallest = Math.max(0, ...lesson.scenes.map((s) => sceneCost({ objects: s.objects, layout: s.layout }, viewport, ctx).cost));
  return tallest + MIN_STAGE_MARGIN_PX;
}

/**
 * The price list for a composer prompt at one stage width: what each kind of object costs, in pixels. Text is priced per line (the
 * number of lines depends on the words, so the composer is also told the words that fit a line).
 */
export function costTable(width: number, ctx: MeasureCtx & { sample: { fraction: string; plain: string; steps: string[] } }) {
  const at = (o: LayoutObject) => measure(o, width - 2 * PAD, ctx).height;
  const text = (role: "title" | "label" | "body"): LayoutObject => ({ id: role, component: "text", props: { text: "Word", role } });
  return {
    width,
    padding: 2 * PAD,
    gap: GAP,
    textPerLine: { title: at(text("title")), label: at(text("label")), body: at(text("body")) },
    equation: { plain: at({ id: "e", component: "equation", props: {}, exprRef: ctx.sample.plain }), fraction: at({ id: "e", component: "equation", props: {}, exprRef: ctx.sample.fraction }) },
    equationLarge: at({ id: "e", component: "equation", props: { size: "l" }, exprRef: ctx.sample.plain }),
    graph: at({ id: "g", component: "functionGraph", props: {}, exprRef: ctx.sample.plain }),
    steps: at({ id: "s", component: "stepList", props: { steps: ctx.sample.steps } }),
    highlight: 0,
  };
}

export type SplitResult = {
  /** Consecutive scenes (objects, and the layout rules that still make sense inside each), each of which fits the stage on its own. */
  scenes: ReadonlyArray<SceneInput>;
  ok: boolean;
  /** When not ok: why, so the composer can fall back to the template scene. */
  reason?: string;
};

/**
 * Splits a scene's objects, in order, into the fewest consecutive groups that each fit the stage. Rules that name an object outside a
 * group are dropped for that group (a rule is only kept when all its objects are in the group). Overlays follow their target's group.
 * Each returned scene carries only the rules whose objects are all in it. `ok` is false when a single object cannot fit by itself: nothing can be done by splitting, so the caller uses the template scene.
 * Splitting a scene means splitting its beat (one scene per beat, ADR 0010), which is the composer's job and needs the beat limit relaxed (ADR 0018).
 */
export function splitToFit(scene: SceneInput, viewport: Viewport, ctx: MeasureCtx): SplitResult {
  const flow = scene.objects.filter((o) => !OVERLAY.has(o.component));
  const overlays = scene.objects.filter((o) => OVERLAY.has(o.component));
  const ids = (g: LayoutObject[]) => new Set(g.map((o) => o.id));
  const sceneFor = (g: LayoutObject[]): SceneInput => {
    const have = ids(g);
    const objects = [...g, ...overlays.filter((o) => have.has(String((o.props as { target?: string }).target)))];
    const names = (r: SceneInput["layout"][number]): string[] => ("items" in r ? [...r.items] : "of" in r ? [r.item, r.of] : [r.item]);
    return { objects, layout: scene.layout.filter((r) => names(r).every((n) => have.has(n) || overlays.some((o) => o.id === n))) };
  };
  const fits = (g: LayoutObject[]) => sceneCost(sceneFor(g), viewport, ctx).fits;

  const groups: LayoutObject[][] = [];
  let current: LayoutObject[] = [];
  for (const o of flow) {
    if (!fits([o])) return { scenes: [], ok: false, reason: `${o.id} (${o.component}) needs more height than the whole stage (${viewport.height} px) on its own` };
    if (current.length > 0 && !fits([...current, o])) {
      groups.push(current);
      current = [];
    }
    current.push(o);
  }
  if (current.length > 0) groups.push(current);
  return { scenes: groups.map(sceneFor), ok: true };
}
