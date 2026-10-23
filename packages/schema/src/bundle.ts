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
  "circuit",
  "magnetCoil",
  "waterAnalogy",
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

/**
 * Spec versions. 1.0.0 is the pinned legacy shape; 2.0.0 is the CO-2 pedagogy layer (ADR 0030); 2.1.0 is additive (ADR 0053): two more claim kinds
 * (`satisfied-by`, `product-of-roots`) and nothing else in the bundle. A bundle follows exactly one. A 2.0.0 bundle stays valid and keeps its hashes.
 */
export const LEGACY_SPEC_VERSION = "1.0.0";
export const SPEC_VERSION = "2.0.0";
export const SPEC_VERSION_2_1 = "2.1.0";
/** Spec 2.2.0 is additive (ADR 0067): `carryFrom` on a component instance, an object that stays on screen from the previous scene. */
export const SPEC_VERSION_2_2 = "2.2.0";
/** Spec 2.3.0 is additive (ADR 0074): a `statement` claim may name the expressions its prose is about (`exprRefs`). */
export const SPEC_VERSION_2_3 = "2.3.0";
export const SPEC_VERSIONS = [LEGACY_SPEC_VERSION, SPEC_VERSION, SPEC_VERSION_2_1, SPEC_VERSION_2_2, SPEC_VERSION_2_3] as const;
/** The claim kinds that exist from spec 2.1.0. A bundle of an earlier version may not carry them. */
export const CLAIM_KINDS_FROM_2_1 = ["satisfied-by", "product-of-roots"] as const;
/** What a recall practice question asks for, and so which claim the verifier proves (ADR 0042, 0053). */
/** `value` (ADR 0076): the answer equation is the problem worked out (z = 1 for a sum of products), proved as an `equivalent` claim. */
export const ANSWER_KINDS = ["sum-of-roots", "product-of-roots", "roots", "solution", "value"] as const;

/** What a beat does in the lesson (ADR 0028). Independent of how its claims are checked. */
export const PEDAGOGY_BEAT_KINDS = ["hook", "prerequisite", "concept", "worked", "mistake", "check"] as const;
export const SENTENCE_ROLES = ["goal", "claim", "link", "transition", "question"] as const;
export const CLAIM_MODES = ["computed", "grounded"] as const;
export const IMPORTANCES = ["core", "support"] as const;
export const PREREQUISITE_STATUSES = ["recapped", "linked", "assumed"] as const;
/** The closed set of solution-step kinds (ADR 0034). One verifier handler each; unknown kinds are rejected. */
export const STEP_KINDS = ["rearrange", "factorise", "expand", "substitute", "evaluate", "simplify", "take_root", "apply_identity"] as const;
/** The closed list of named identities `apply_identity` may cite (ADR 0034). Each is proved symbolically by the verifier. New ones need an ADR. */
export const IDENTITIES = ["vieta_sum", "vieta_product", "difference_of_squares"] as const;
export const TEXT_ROLES = ["title", "caption"] as const;

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
    /** Spec 2.0.0 only (ADR 0028, 0029). Hashed into this beat's scene. */
    beatKind: z.enum(PEDAGOGY_BEAT_KINDS).optional(),
    slotId: id.optional(),
    learningGoal: z.string().min(1).optional(),
  })
  .strict();

export const LessonPlan = z
  .object({
    template: z.enum(["problem-first", "example-first"]),
    targetLengthS: z.number().int().positive(),
    beats: z.array(Beat).min(1),
    /** Spec 2.0.0 only. Hashed into the bundle, not into any scene (ADR 0030). */
    arcId: id.optional(),
    prerequisites: z.array(z.object({ skillId: id, status: z.enum(PREREQUISITE_STATUSES) }).strict()).optional(),
    level: id.optional(),
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
    /** "reviewed" is legacy (1.0.0); 2.0.0 uses "approved" (ADR 0031). */
    status: z.enum(["draft", "reviewed", "approved", "frozen"]),
    /** Spec 2.0.0 only (ADR 0029). */
    role: z.enum(SENTENCE_ROLES).optional(),
    claimId: id.optional(),
    linkClaimIds: z.array(id).length(2).optional(),
    questionId: id.optional(),
  })
  .strict();

export const ComponentInstance = z
  .object({
    id,
    component: ComponentName,
    props: z.record(z.unknown()),
    exprRef: id.optional(),
    /** Spec 2.0.0 only (ADR 0032): a static object is a text title or caption, with no digits and no placeholders. */
    role: z.literal("static").optional(),
    textRole: z.enum(TEXT_ROLES).optional(),
    /** Spec 2.2.0 only (ADR 0067): this is the object `carryFrom` of the scene just before, kept on screen. */
    carryFrom: id.optional(),
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
/** What a cue can do. Every action must show a change or direct attention (ADR 0020). Only an equation draws `morph`, as a cross-fade (ADR 0068); `move` is not built. */
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
const ClaimExtras = {
  /** Spec 2.0.0 only (ADR 0028, 0034). `id` is the claim id; `usesStep` is the id of the claim whose result this claim's step transforms. */
  /** The content records the claim comes from (CO-2 section 2.2). Each must be a source of the bundle. */
  sourceIds: z.array(id).min(1).optional(),
  claimMode: z.enum(CLAIM_MODES).optional(),
  dependsOn: z.array(id).optional(),
  importance: z.enum(IMPORTANCES).optional(),
  usesStep: id.optional(),
  stepKind: z.enum(STEP_KINDS).optional(),
  /** Required by stepKind apply_identity, and only then. */
  identity: z.enum(IDENTITIES).optional(),
};
export const Claim = z.discriminatedUnion("kind", [
  /** `a` and `b` are equations in one symbol with the same solutions (for example an equation and its factored form). */
  z.object({ id, beatId: id, kind: z.literal("equivalent"), a: id, b: id, ...ClaimExtras }).strict(),
  /** The solutions of `equation` are exactly `values` (exact numbers, as expression trees). */
  z.object({ id, beatId: id, kind: z.literal("roots"), equation: id, values: z.array(ExprSchema).min(1), ...ClaimExtras }).strict(),
  /** The sum of the roots of `equation` equals the right-hand side of the equation `equals`. */
  z.object({ id, beatId: id, kind: z.literal("sum-of-roots"), equation: id, equals: id, ...ClaimExtras }).strict(),
  /** The product of the roots of `equation` equals the right-hand side of the equation `equals` (spec 2.1.0, ADR 0053). */
  z.object({ id, beatId: id, kind: z.literal("product-of-roots"), equation: id, equals: id, ...ClaimExtras }).strict(),
  /** Putting `value` (an exact number) in for the unknown of `equation` gives exactly the closed equation `instance`, and that equation is true: the check by substitution (spec 2.1.0, ADR 0053). */
  z.object({ id, beatId: id, kind: z.literal("satisfied-by"), equation: id, value: ExprSchema, instance: id, ...ClaimExtras }).strict(),
  /** A claim in prose with nothing for the verifier to prove (a definition, a misconception). Spec 2.0.0 only, and always `grounded`: a person approves it (AM-3, ADR 0031). */
  /** Prose a person approves. From spec 2.3.0 it may name the expressions the prose is about (`exprRefs`, ADR 0074), so a scene can show them and a sentence can use them. */
  z.object({ id, beatId: id, kind: z.literal("statement"), exprRefs: z.array(id).min(1).optional(), ...ClaimExtras }).strict(),
]);
export type Claim = z.infer<typeof Claim>;

/**
 * Every claim kind of the spec, and the Python handler that proves it (services/verifier/eve_verifier/checks.py, CLAIM_HANDLERS). `statement` is prose a person
 * approves: nothing to prove. `ANSWER_KIND_CLAIM` says which claim the verifier proves for each kind of recall answer (ADR 0042, 0053). The table is written to
 * packages/schema/claim-kinds.json by `pnpm gen:ops`, and a test on each side compares it with its handlers, as for node types and step kinds.
 */
export const CLAIM_KINDS = ["equivalent", "roots", "sum-of-roots", "product-of-roots", "satisfied-by", "statement"] as const;
export type ClaimKind = (typeof CLAIM_KINDS)[number];
export const CLAIM_HANDLERS: Record<ClaimKind, string> = {
  equivalent: "_claim_equivalent",
  roots: "_claim_roots",
  "sum-of-roots": "_claim_sum_of_roots",
  "product-of-roots": "_claim_product_of_roots",
  "satisfied-by": "_claim_satisfied_by",
  statement: "none",
};
export const ANSWER_KIND_CLAIM: Record<(typeof ANSWER_KINDS)[number], ClaimKind> = {
  "sum-of-roots": "sum-of-roots",
  "product-of-roots": "product-of-roots",
  roots: "roots",
  solution: "roots",
  value: "equivalent",
};
// the list above and the zod union must name the same kinds: a kind added to one and not the other does not compile
const _sameKinds: [ClaimKind] extends [Claim["kind"]] ? ([Claim["kind"]] extends [ClaimKind] ? true : never) : never = true;
void _sameKinds;

export const LessonBundle = z
  .object({
    bundleId: id,
    specVersion: z.enum(SPEC_VERSIONS),
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
    /** Spec 2.0.0 only. Hashed into the bundle (ADR 0030). The verification label is NOT stored here (ADR 0031). */
    subjectId: id.optional(),
    facts: z.array(z.object({ id, text: z.string().min(1), sourceIds: z.array(id).min(1) }).strict()).optional(),
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
