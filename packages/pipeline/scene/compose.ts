import type { SceneSpec } from "@eve/schema";
import { templateScene, type FallbackContent } from "../fallback";
import { validateScene, type SceneContext } from "./validate";

export type Attempt = {
  /** 1 for the first try, 2 for the single repair retry. */
  attempt: 1 | 2;
  /** The validator's messages about the previous try (empty on the first): the repair prompt sends these back. */
  errors: readonly string[];
  /** The previous output, for the repair prompt. */
  previous?: unknown;
};

export type SceneOutcome = {
  scene: SceneSpec;
  usedFallback: boolean;
  /** How many times the composer was asked (0 to 2). */
  attempts: number;
  /** The messages of the last failed try, or of every failed try; empty when the first try passed. */
  errors: string[][];
};

/**
 * Gets one valid scene for one beat. The composer is asked once; if what it returns fails validation (or it throws), it is asked once more with
 * the validator's messages; if that fails too, the template scene is used and marked for human review. Only this scene is retried: the caller
 * runs this per beat. A composer that returns nonsense, throws, or returns nothing yields the fallback, never a crash. The one exception is an error
 * that says it is fatal (a refused call, a missing recorded response): those propagate, because falling back would hide them.
 */
export async function composeScene(
  ctx: SceneContext,
  compose: (a: Attempt) => unknown | Promise<unknown>,
  fallback: FallbackContent,
): Promise<SceneOutcome> {
  const errors: string[][] = [];
  let previous: unknown;
  for (const attempt of [1, 2] as const) {
    let candidate: unknown;
    let problems: string[];
    try {
      candidate = await compose({ attempt, errors: errors.at(-1) ?? [], previous });
      problems = validateScene(candidate, ctx);
    } catch (e) {
      if ((e as { fatal?: boolean }).fatal === true) throw e;
      problems = [`the composer failed: ${(e as Error).message ?? String(e)}`];
    }
    if (problems.length === 0) return { scene: candidate as SceneSpec, usedFallback: false, attempts: attempt, errors };
    errors.push(problems);
    previous = candidate;
  }
  return templateOutcome(ctx, fallback, errors);
}

/**
 * `composeScene` for a composer that is plain code (no model, no await): the same two attempts, the same validator and the same template fall-back, so the
 * lesson assembler can run to completion in one synchronous call, which is what the planner's repair check needs. A second attempt of a deterministic
 * composer is the same call again; it is kept so that the two functions answer alike and a composer that changes its answer by attempt still works.
 */
export function composeSceneSync(ctx: SceneContext, compose: (a: Attempt) => unknown, fallback: FallbackContent): SceneOutcome {
  const errors: string[][] = [];
  let previous: unknown;
  for (const attempt of [1, 2] as const) {
    let candidate: unknown;
    let problems: string[];
    try {
      candidate = compose({ attempt, errors: errors.at(-1) ?? [], previous });
      problems = validateScene(candidate, ctx);
    } catch (e) {
      if ((e as { fatal?: boolean }).fatal === true) throw e;
      problems = [`the composer failed: ${(e as Error).message ?? String(e)}`];
    }
    if (problems.length === 0) return { scene: candidate as SceneSpec, usedFallback: false, attempts: attempt, errors };
    errors.push(problems);
    previous = candidate;
  }
  return templateOutcome(ctx, fallback, errors);
}

/** The template scene for a beat that two attempts could not compose, checked by the same validator (a template that fails it is a bug in this package). */
function templateOutcome(ctx: SceneContext, fallback: FallbackContent, errors: string[][]): SceneOutcome {
  const scene = templateScene(ctx, { ...fallback, reason: `${fallback.reason} (${errors.at(-1)!.slice(0, 3).join("; ")})` });
  const own = validateScene(scene, ctx);
  if (own.length > 0) throw new Error(`the template scene itself is invalid, which is a bug: ${own.join("; ")}`);
  return { scene, usedFallback: true, attempts: 2, errors };
}
