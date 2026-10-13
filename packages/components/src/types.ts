import type { z } from "zod";
import type { ComponentName, Expr } from "@eve/schema";
import type { ColorTheme } from "./latex";

/**
 * A scheduled change for ONE object, in milliseconds on the lesson clock. The timeline resolver (step c) produces
 * these; a component never sees a cue or a sentence, only its own resolved events.
 */
export type ObjectEvent = {
  action: "reveal" | "highlight" | "move" | "morph" | "dim" | "draw" | "pop";
  atMs: number;
  holdUntilMs: number;
  /** A named piece of the object (a cue target written `object#part`): the curve of a graph, one hop of a number line. Absent: the whole object. */
  part?: string;
};

/** What an object looks like at one instant. A pure function of (events, t): see state.ts. */
export type ObjectState = {
  visible: boolean;
  /** 0 to 1: how far the reveal has progressed. */
  opacity: number;
  /** 0 to 1: strength of the highlight (eased in and out). */
  highlight: number;
  dimmed: boolean;
  /** 0 to 1: how much of a stroke has been drawn (1 when nothing draws it). */
  draw: number;
  /** Scale of a popping object, 0.6 to 1 (1 when nothing pops it). */
  scale: number;
};

/** Typesets LaTeX to HTML (KaTeX markup). The player gets a pre-rendered cache (math-cache.ts), so it ships no KaTeX code. */
export type MathRenderer = (latex: string, display: boolean) => string;

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
  /** Maths typesetter: a cache lookup in the player, live KaTeX at build time and in tests. */
  math: MathRenderer;
  /** Colours of named terms and the dimmed colour. Absent: formulas are plain. */
  colors?: ColorTheme;
  /** Jump every motion to its end state (prefers-reduced-motion). */
  reduceMotion?: boolean;
  /** Where another object of the scene sits, relative to the stage (null if unknown). For overlays such as highlight. */
  rectOf?: (objectId: string) => Rect | null;
};

export type VerifyContext = {
  expressions: Record<string, Expr>;
  exprRef?: string;
  /** Ids of every object in the scene. */
  objectIds: string[];
  /** When given, verify also checks that every formula typesets. Build time only. */
  math?: MathRenderer;
  /** The parts of this object that cues address (the part names after the # in cue targets). Each must be one the component lists. */
  cueParts?: string[];
  /** Every cue that addresses a part of this object: the part and the action. Lets a component refuse an action it cannot show on a part. */
  cueActions?: Array<{ part: string; action: string }>;
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
  /** Parts a cue may address (`object#part`). "whole" always works. The expression is given for parts that depend on it (the roots of a graph). */
  cueTargets(props: P, ctx?: Pick<RenderContext, "expressions" | "exprRef">): string[];
  /** Text alternative for screen readers; equations also expose MathML through KaTeX. */
  altText(props: P, ctx: Pick<RenderContext, "expressions" | "exprRef" | "locale">): string;
  /** Problems found in the instance; an empty array means verified. */
  verify(props: P, ctx: VerifyContext): string[];
}
