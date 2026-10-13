import type { z } from "zod";
import type { ComponentName, Expr } from "@eve/schema";

/**
 * A scheduled change for ONE object, in milliseconds on the lesson clock. The timeline resolver (step c) produces
 * these; a component never sees a cue or a sentence, only its own resolved events.
 */
export type ObjectEvent = {
  action: "reveal" | "highlight" | "move" | "morph" | "dim";
  atMs: number;
  holdUntilMs: number;
};

/** What an object looks like at one instant. A pure function of (events, t): see state.ts. */
export type ObjectState = {
  visible: boolean;
  /** 0 to 1: how far the reveal has progressed. */
  opacity: number;
  /** 0 to 1: strength of the highlight (eased in and out). */
  highlight: number;
  dimmed: boolean;
};

export type Rect = { x: number; y: number; width: number; height: number };

export type RenderContext = {
  objectId: string;
  /** BCP-47 like "en-IN" or "hi-IN": sets the `lang` of text so the browser shapes and hyphenates correctly. */
  locale: string;
  /** The bundle's expression table. */
  expressions: Record<string, Expr>;
  /** This instance's exprRef, if it has one. */
  exprRef?: string;
  /** This object's resolved events. */
  events: ObjectEvent[];
  /** Where another object of the scene sits, relative to the stage (null if unknown). For overlays such as highlight. */
  rectOf?: (objectId: string) => Rect | null;
};

export type VerifyContext = {
  expressions: Record<string, Expr>;
  exprRef?: string;
  /** Ids of every object in the scene. */
  objectIds: string[];
};

/**
 * The component contract. `render` is the heart: it draws the object as it looks at lesson time `t` (milliseconds).
 * It must be PURE in (el, props, t, ctx) and IDEMPOTENT: calling it with the same arguments always yields the same
 * DOM, in any order, including seeking backwards. No timers, no Date.now, no requestAnimationFrame, no randomness.
 * That is what makes the player's seek, pause and replay (and the headless export) deterministic.
 */
export interface ComponentModule<P = unknown> {
  readonly name: ComponentName;
  readonly propsSchema: z.ZodType<P, z.ZodTypeDef, unknown>;
  render(el: HTMLElement, props: P, t: number, ctx: RenderContext): void;
  /** Parts a cue may address. "whole" always works. */
  cueTargets(props: P): string[];
  /** Text alternative for screen readers; equations also expose MathML through KaTeX. */
  altText(props: P, ctx: Pick<RenderContext, "expressions" | "exprRef" | "locale">): string;
  /** Problems found in the instance; an empty array means verified. */
  verify(props: P, ctx: VerifyContext): string[];
}
