import { componentFor, IMPLEMENTED } from "@eve/components";
import { katexMath } from "@eve/components/src/build";
import { assureLayout, referenceViewports } from "@eve/layout";
import { containsLiteralMath, SceneSpec, wordsOf, type Expr, type NarrationSentence } from "@eve/schema";

/** What a scene is checked against: the beat it belongs to, the sentences it may anchor to, and the lesson's expression table. */
export type SceneContext = {
  sceneId: string;
  beatId: string;
  /** Ids of the content records the beat draws on: a scene may cite these and no others. */
  sourceIds: readonly string[];
  /** The beat's narration, in order. */
  sentences: ReadonlyArray<Pick<NarrationSentence, "id" | "text">>;
  expressions: Readonly<Record<string, Expr>>;
  locale: string;
};

/**
 * Everything that can be wrong with ONE scene, as messages a model can be asked to repair. An empty list means the scene may go into a bundle:
 * the schema, the beat and sources, every component's own verification (including the parts cues address), anchors inside the beat's sentences,
 * pauses, no maths written as text, and the height budget at the phone and the desktop frame. Reading time needs the audio and is checked later.
 */
export function validateScene(candidate: unknown, ctx: SceneContext): string[] {
  const parsed = SceneSpec.safeParse(candidate);
  if (!parsed.success) return parsed.error.issues.map((i) => `${i.path.join(".") || "scene"}: ${i.message}`);
  const scene = parsed.data;
  const out: string[] = [];
  const bad = (path: string, message: string) => out.push(`${path}: ${message}`);

  if (scene.id !== ctx.sceneId) bad("id", `must be ${ctx.sceneId}, not ${scene.id}`);
  if (scene.beatId !== ctx.beatId) bad("beatId", `must be ${ctx.beatId}, not ${scene.beatId}`);
  for (const s of scene.sourceIds) if (!ctx.sourceIds.includes(s)) bad("sourceIds", `${s} is not a source of this beat (${ctx.sourceIds.join(", ")})`);

  const sentences = new Map(ctx.sentences.map((s) => [s.id, s]));
  const objects = new Map(scene.objects.map((o) => [o.id, o]));
  if (objects.size !== scene.objects.length) bad("objects", "object ids must be unique");

  for (const o of scene.objects) {
    const at = `objects.${o.id}`;
    if (!IMPLEMENTED.includes(o.component)) {
      bad(at, `component ${o.component} is not built (available: ${IMPLEMENTED.join(", ")})`);
      continue;
    }
    if (o.exprRef !== undefined && !(o.exprRef in ctx.expressions)) bad(at, `exprRef ${o.exprRef} is not an expression of this lesson`);
    if ((o.component === "equation" || o.component === "functionGraph") && !o.exprRef) bad(at, `${o.component} must take its content from an exprRef`);
    if (o.component === "text") {
      const t = (o.props as { text?: unknown }).text;
      if (typeof t === "string" && containsLiteralMath(t)) bad(`${at}.props.text`, "maths must come from an expression (exprRef), not be written as text");
    }
    const module = componentFor(o.component);
    const props = module.propsSchema.safeParse(o.props);
    if (!props.success) {
      for (const i of props.error.issues) bad(`${at}.props.${i.path.join(".")}`, i.message);
      continue;
    }
    const mine = scene.cues.filter((c) => c.targetObject.startsWith(`${o.id}#`));
    try {
      for (const p of module.verify(props.data as never, {
        expressions: { ...ctx.expressions },
        exprRef: o.exprRef,
        objectIds: scene.objects.map((x) => x.id),
        math: katexMath,
        cueParts: mine.map((c) => c.targetObject.split("#")[1]!),
        cueActions: mine.map((c) => ({ part: c.targetObject.split("#")[1]!, action: c.action })),
        wholeActions: scene.cues.filter((c) => c.targetObject === o.id).map((c) => c.action),
      })) {
        bad(at, p);
      }
    } catch (e) {
      bad(at, `cannot be verified: ${(e as Error).message}`);
    }
  }

  const named = (rule: SceneSpec["layout"][number]) => ("items" in rule ? rule.items : "of" in rule ? [rule.item, rule.of] : [rule.item]);
  for (const rule of scene.layout) for (const id of named(rule)) if (!objects.has(id)) bad("layout", `names ${id}, which is not an object of this scene`);

  for (const c of scene.cues) {
    const [target] = c.targetObject.split("#");
    if (!objects.has(target!)) bad("cues", `target ${c.targetObject}: no such object`);
    const s = sentences.get(c.anchor.sentenceId);
    if (!s) bad("cues", `anchor ${c.anchor.sentenceId} is not a sentence of this beat (${[...sentences.keys()].join(", ")})`);
    else if (typeof c.anchor.at === "object" && c.anchor.at.wordIndex >= wordsOf(s.text).length) bad("cues", `wordIndex ${c.anchor.at.wordIndex} is past the end of ${s.id}`);
  }
  for (const q of scene.interactions ?? []) {
    if (!sentences.has(q.afterSentenceId)) bad(`interactions.${q.id}`, `afterSentenceId ${q.afterSentenceId} is not a sentence of this beat`);
    if (q.goalExprRef && !(q.goalExprRef in ctx.expressions)) bad(`interactions.${q.id}`, `goalExprRef ${q.goalExprRef} is not an expression of this lesson`);
  }

  if (out.length === 0) {
    // Solve and check at the phone and the desktop frame. A scene over the height budget is reported here, so the composer can split it or fall back.
    for (const f of assureLayout({ scenes: [scene], expressions: { ...ctx.expressions }, locale: ctx.locale }, { scenes: [] }, referenceViewports())) out.push(`layout (${f.viewport}): ${f.message}`);
  }
  return out;
}
