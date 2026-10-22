import { checkHops, hopsPreview, type HopLine } from "@eve/patterns";
import type { Claim, Cue, Expr, NarrationSentence, SceneSpec } from "@eve/schema";
import { validateScene, type SceneContext } from "../scene/validate";
import type { BeatBuild } from "./beats";
import { finishScene } from "./scene";

/** The pause between one hop and the next being drawn (each draw takes 800 ms; they overlap, so the picture is made in about two seconds). */
export const PREVIEW_STEP_MS = 500;

/**
 * Adds a number line of hops to a scene that reveals an answer, drawn as the answer appears (ADR 0072, 0073). The scene is validated again, and the scene as it
 * was is kept if it fails (the height of a fourth object, for one): this never makes a scene worse. `expressions` gains the stops of the line, and loses them
 * again if the scene is not used.
 */
function withHops(scene: SceneSpec, line: HopLine, ctx: SceneContext, sentences: readonly NarrationSentence[], claims: readonly Claim[], expressions: Record<string, Expr>, locale: string): SceneSpec | null {
  const answer = scene.cues.find((c) => c.targetObject === "answer");
  if (!answer || scene.objects.some((o) => o.id === line.object.id)) return null;
  const at = (i: number): Cue["anchor"] => ({ sentenceId: answer.anchor.sentenceId, at: "start", offsetMs: i * PREVIEW_STEP_MS });
  const cues: Cue[] = [
    ...Array.from({ length: line.hops }, (_h, i): Cue => ({ targetObject: `${line.object.id}#hop${i}`, action: "draw", anchor: at(i), minHoldMs: 800 })),
    { targetObject: `${line.object.id}#bracket0`, action: "draw", anchor: at(line.hops), minHoldMs: 800 },
  ];
  const layout = scene.layout.map((rule) => (rule.rule === "column" ? { ...rule, items: [...rule.items, line.object.id] } : rule));
  const added = Object.keys(line.expressions);
  Object.assign(expressions, line.expressions);
  const candidate = finishScene({ ...scene, objects: [...scene.objects, line.object], layout: [...layout, { rule: "center", item: line.object.id }], cues: [...scene.cues, ...cues] }, claims, sentences, expressions, locale);
  if (validateScene(candidate, ctx).length === 0) return candidate;
  for (const id of added) delete expressions[id];
  return null;
}

/**
 * The hook shows its answer as the hops of the worked example (ADR 0072): when the student has answered the prediction, the roots are walked out on a number
 * line and their total is bracketed. Only for a prediction (`predict-then-reveal`) of a hook whose stored solution has whole-number roots, and drawn from that
 * solution's own steps, the numbers the worked beat proves.
 */
export function previewHops(scene: SceneSpec, build: BeatBuild, ctx: SceneContext, sentences: readonly NarrationSentence[], claims: readonly Claim[], expressions: Record<string, Expr>, locale: string): SceneSpec {
  if (build.beatKind !== "hook" || build.beat.pattern !== "predict-then-reveal") return scene;
  const line = hopsPreview(build.retrieval, scene.id);
  return (line && withHops(scene, line, ctx, sentences, claims, expressions, locale)) ?? scene;
}

/**
 * The check shows why its answer is right (ADR 0073): after the student has answered a question about the sum of the roots, the roots of the question's equation
 * are walked out and bracketed. The roots are found by code from the equation, so no record holds them, and the claim that they are the roots is added to the
 * lesson with them (computed, support): SymPy proves it with the rest, so no number is shown that the verifier has not proved. The claim is added only if the
 * scene that shows it is used; it is not given to the scriptwriter, who is not asked to say it.
 */
export function previewCheckHops(scene: SceneSpec, build: BeatBuild, ctx: SceneContext, sentences: readonly NarrationSentence[], claims: readonly Claim[], expressions: Record<string, Expr>, locale: string): { scene: SceneSpec; claims: Claim[] } {
  if (build.beatKind !== "check" || build.beat.pattern !== "check-question") return { scene, claims: [] };
  const line = checkHops(build.retrieval, scene.id, build.beat.id);
  const made = line && withHops(scene, line, ctx, sentences, claims, expressions, locale);
  return made && line ? { scene: made, claims: [line.claim] } : { scene, claims: [] };
}
