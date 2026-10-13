import { z } from "zod";
import { ExprSchema } from "./expr";

/** The closed component registry (v1). A scene may only instantiate these; props are validated per component later. */
export const COMPONENT_NAMES = [
  "text",
  "equation",
  "numberLine",
  "functionGraph",
  "fractionBar",
  "areaModel",
  "table",
  "stepList",
  "arrowCallout",
  "shape",
  "highlight",
  "balanceScale",
] as const;
export const ComponentName = z.enum(COMPONENT_NAMES);
export type ComponentName = z.infer<typeof ComponentName>;

const id = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_.:-]*$/, "ids are letters, digits and _ . : -");

/** The closed colour palette of the stage (ADR 0019). A bundle names colours; the theme owns the hex values. */
export const COLOR_NAMES = ["blue", "yellow", "green", "red", "purple"] as const;
export const ColorName = z.enum(COLOR_NAMES);
export type ColorName = z.infer<typeof ColorName>;

export const BEAT_KINDS = ["predict", "explore", "explain", "worked", "check"] as const;

export const PauseAsk = z
  .object({
    id,
    afterSentenceId: id,
    prompt: z.string().min(1),
    goalExprRef: id.optional(),
  })
  .strict();

export const Beat = z
  .object({
    id,
    kind: z.enum(BEAT_KINDS),
    title: z.string().min(1),
    animate: z.boolean(),
    sourceIds: z.array(id).min(1),
    cueFocus: id.optional(), // at most one focus per beat
  })
  .strict();

export const LessonPlan = z
  .object({
    template: z.enum(["problem-first", "example-first"]),
    targetLengthS: z.number().int().positive(),
    beats: z.array(Beat).min(1),
  })
  .strict();

export const NarrationSentence = z
  .object({
    id,
    beatId: id,
    /** Approved text. Maths is never written here: use {expr:<id>} placeholders, spoken from the tree. */
    text: z.string().min(1),
    termSpans: z.array(z.object({ glossaryId: id, start: z.number().int().min(0), end: z.number().int().min(0) }).strict()),
    exprRefs: z.array(id),
    status: z.enum(["draft", "reviewed", "frozen"]),
  })
  .strict();

export const ComponentInstance = z
  .object({
    id,
    component: ComponentName,
    props: z.record(z.unknown()),
    exprRef: id.optional(),
  })
  .strict();

/** Layout is declared as rules for a solver, never as pixel positions. */
export const LayoutRule = z.discriminatedUnion("rule", [
  z.object({ rule: z.literal("column"), items: z.array(id).min(1), gap: z.enum(["tight", "normal", "loose"]).optional() }).strict(),
  z.object({ rule: z.literal("row"), items: z.array(id).min(1), gap: z.enum(["tight", "normal", "loose"]).optional() }).strict(),
  z.object({ rule: z.literal("below"), item: id, of: id }).strict(),
  z.object({ rule: z.literal("beside"), item: id, of: id, side: z.enum(["left", "right"]) }).strict(),
  z.object({ rule: z.literal("center"), item: id }).strict(),
]);

const AnchorAt = z.union([z.literal("start"), z.literal("end"), z.object({ wordIndex: z.number().int().min(0) }).strict()]);

/** A cue target: an object id, or `object#part` for a named part of it (the curve of a graph, one hop of a number line). */
export const CueTarget = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_.:-]*(#[A-Za-z0-9][A-Za-z0-9_.:-]*)?$/, "a cue target is an object id, or object#part");
/** What a cue can do. Every action must show a change or direct attention (ADR 0020); morph is not built (ADR 0021). */
export const CUE_ACTIONS = ["reveal", "highlight", "move", "morph", "dim", "draw", "pop"] as const;

export const Cue = z
  .object({
    targetObject: CueTarget,
    action: z.enum(CUE_ACTIONS),
    anchor: z.object({ sentenceId: id, at: AnchorAt, offsetMs: z.number().int().optional() }).strict(),
    /** Long enough to read: enforced by the resolver, never trusted. */
    minHoldMs: z.number().int().min(0),
  })
  .strict();

export const SceneSpec = z
  .object({
    id,
    beatId: id,
    sourceIds: z.array(id).min(1, "a scene with no sourceIds is invalid"),
    objects: z.array(ComponentInstance).min(1).max(5, "keep the screen sparse: at most 5 objects"),
    layout: z.array(LayoutRule),
    cues: z.array(Cue),
    interactions: z.array(PauseAsk).optional(),
    a11y: z.object({ altText: z.string().min(1) }).strict(),
    /** Set when the pipeline could not compose this scene and used the plain template instead: a person must look at it before the lesson is published. */
    review: z.object({ status: z.literal("needs-human-review"), reason: z.string().min(1) }).strict().optional(),
  })
  .strict();

const hex64 = z.string().regex(/^[0-9a-f]{64}$/);

/**
 * Statements the lesson makes about its equations, in a form the SymPy verifier can prove or refute. Narration is prose and
 * cannot be checked; a claim is the machine-readable twin of a sentence such as "the roots are two and three".
 * Each claim names the beat whose steps rely on it (`beatId`): a worked beat must declare at least one (validator rule, ADR 0015).
 * Optional and without defaults, so a lesson with no claims hashes exactly as before (ADR 0003).
 */
export const Claim = z.discriminatedUnion("kind", [
  /** `a` and `b` are equations in one symbol with the same solutions (for example an equation and its factored form). */
  z.object({ id, beatId: id, kind: z.literal("equivalent"), a: id, b: id }).strict(),
  /** The solutions of `equation` are exactly `values` (exact numbers, as expression trees). */
  z.object({ id, beatId: id, kind: z.literal("roots"), equation: id, values: z.array(ExprSchema).min(1) }).strict(),
  /** The sum of the roots of `equation` equals the right-hand side of the equation `equals`. */
  z.object({ id, beatId: id, kind: z.literal("sum-of-roots"), equation: id, equals: id }).strict(),
]);
export type Claim = z.infer<typeof Claim>;

export const LessonBundle = z
  .object({
    bundleId: id,
    specVersion: z.literal("1.0.0"),
    skillId: id,
    locale: z.string().regex(/^[a-z]{2,3}-[A-Z]{2}$/),
    /** Every content-plane record used. */
    sourceIds: z.array(id).min(1),
    /** Expression trees by id. Added to the sketched contract: every exprRef must resolve here (ADR 0002). */
    expressions: z.record(ExprSchema),
    /** Colour of each named term (Expr.term), from the closed palette. Optional and without defaults: a lesson that colours nothing hashes as before. */
    termColors: z.record(ColorName).optional(),
    plan: LessonPlan,
    script: z.array(NarrationSentence).min(1),
    scenes: z.array(SceneSpec).min(1),
    claims: z.array(Claim).optional(),
    hashes: z.object({ bundle: hex64, perScene: z.record(hex64) }).strict(),
  })
  .strict();

export type Beat = z.infer<typeof Beat>;
export type LessonPlan = z.infer<typeof LessonPlan>;
export type NarrationSentence = z.infer<typeof NarrationSentence>;
export type ComponentInstance = z.infer<typeof ComponentInstance>;
export type LayoutRule = z.infer<typeof LayoutRule>;
export type Cue = z.infer<typeof Cue>;
export type PauseAsk = z.infer<typeof PauseAsk>;
export type SceneSpec = z.infer<typeof SceneSpec>;
export type LessonBundle = z.infer<typeof LessonBundle>;
