import { z } from "zod";
import { ANSWER_KINDS, CLAIM_MODES, COLOR_NAMES, ExprSchema, IDENTITIES, IMPORTANCES, STEP_KINDS, hashOf, type Claim, type Expr } from "@eve/schema";
import config from "../../../config/content.json";
import licences from "../../../config/licences.json";

/** Settings read from config/, never written in code (English only in Phase 1). */
export const CONTENT_CONFIG = config as { locales: string[]; approvalStatuses: string[]; minimumApprovalStatus: string };
export const ALLOWED_LICENCES: readonly string[] = licences.allowed;

const id = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_.:-]*$/, "ids are letters, digits and _ . : -");
const hex64 = z.string().regex(/^[0-9a-f]{64}$/);

export const KINDS = ["passage", "solutionSteps", "misconception", "glossary", "skill", "conceptClaim", "practiceQuestion"] as const;
/** The four kinds the planner request of prompt versions planner.v2 and planner.v3 may carry. The newer kinds are added by the next planner version (ADR 0039). */
export const LEGACY_KINDS = ["passage", "solutionSteps", "misconception", "glossary"] as const;
export const QUESTION_TYPES = ["recall", "reasoning"] as const;
export const APPROVAL_STATUSES = ["draft", "reviewed", "approved"] as const;

/**
 * One step of a worked solution. A step is an expression tree (an equation), in order, and a ROLE that says what it is for:
 *  - transform: an equivalent form of the equation before it (a factorisation)  -> claim "equivalent"
 *  - root: an answer of the form x = value                                       -> collected into claim "roots"
 *  - sum: an equation stating the sum of the roots (2 + 3 = 5)                   -> claim "sum-of-roots"
 *  - check: the problem with a root put back, an equation of numbers (3 * 5 + 5 = 20); `uses` names the root step  -> claim "satisfied-by" (spec 2.1.0)
 *  - note: shown or said, claims nothing
 * The claims of a worked beat are DERIVED from these roles by a fixed rule (derive.ts); a model never writes a claim.
 */
export const SolutionStep = z
  .object({
    id,
    role: z.enum(["transform", "root", "sum", "check", "note"]),
    expr: id,
    note: z.string().min(1).optional(),
    /** How this step follows from the step it uses (ADR 0034). Absent on the first step. Omitted, never empty. */
    stepKind: z.enum(STEP_KINDS).optional(),
    /** The earlier step this one is derived from. Absent means the previous step that makes a claim. */
    uses: id.optional(),
    /** Required with stepKind apply_identity. */
    identity: z.enum(IDENTITIES).optional(),
    /** Author overrides of what is derived: other steps this one needs, and its importance (the last step of a chain is core by default). */
    needs: z.array(id).min(1).optional(),
    importance: z.enum(IMPORTANCES).optional(),
  })
  .strict();

export const GlossaryTerm = z.object({ id, term: z.string().min(1), definition: z.string().min(1) }).strict();

/** What a computed concept claim states: the same claim kinds the bundle carries, minus the beat and the id (the record's id is the claim's id). */
export const ConceptStatement = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("equivalent"), a: id, b: id }).strict(),
  z.object({ kind: z.literal("roots"), equation: id, values: z.array(ExprSchema).min(1) }).strict(),
  z.object({ kind: z.literal("sum-of-roots"), equation: id, equals: id }).strict(),
]);

export const ContentRecord = z
  .object({
    id,
    skillId: id,
    kind: z.enum(KINDS),
    locale: z.string().regex(/^[a-z]{2,3}-[A-Z]{2}$/),
    /** Prose. Maths is never written here: {expr:id} placeholders only, resolved in `expressions`. */
    text: z.string().min(1),
    /** Expression-table entries this record owns. Ids are unique across the whole store. */
    expressions: z.record(ExprSchema),
    sourceNote: z.string().min(1),
    /** Must be on the allow-list in config/licences.json. */
    licence: z.string(),
    approvalStatus: z.enum(APPROVAL_STATUSES),
    /** hashOf(the record without this field): changes whenever anything changes. */
    hash: hex64,
    /** solutionSteps: the equation being solved, then the ordered steps. */
    problem: id.optional(),
    steps: z.array(SolutionStep).min(1).optional(),
    /** glossary: the terms this record defines. */
    terms: z.array(GlossaryTerm).min(1).optional(),
    /** misconception: the mistaken statement and the correct one, as expressions. */
    contrast: z.object({ wrong: id, right: id }).strict().optional(),
    /** passage: a function to graph and the window to graph it in. The roots shown are computed from the expression, never stored. */
    plot: z.object({ expr: id, xMin: z.number(), xMax: z.number(), yMin: z.number(), yMax: z.number() }).strict().optional(),
    /** The colour of named terms (Expr.term) in this record's expressions, from the closed palette. */
    termColors: z.record(z.enum(COLOR_NAMES)).optional(),

    // skill (CO-2, ADR 0035): the direct prerequisites of the skill and the lesson levels at which a prerequisite may be assumed. Omitted when there are none.
    prerequisiteSkillIds: z.array(id).min(1).optional(),
    assumableAtLevels: z.array(id).min(1).optional(),

    // conceptClaim (ADR 0028): one claim of a concept beat. Computed claims carry the statement the verifier proves (no beatId: the beat that uses it supplies it);
    // grounded claims (definitions, misconceptions) carry prose only and need an approval record outside the bundle (ADR 0031).
    claimMode: z.enum(CLAIM_MODES).optional(),
    /** A grounded conceptClaim: the expression ids the prose is about (spec 2.1.0, ADR 0053). The approval covers the prose and these together, through the record hash. */
    exprRefs: z.array(id).min(1).optional(),
    importance: z.enum(IMPORTANCES).optional(),
    dependsOn: z.array(id).min(1).optional(),
    claim: ConceptStatement.optional(),

    // practiceQuestion (ADR 0033)
    questionType: z.enum(QUESTION_TYPES).optional(),
    /** recall: what the answer is, so which claim the verifier proves (ADR 0042, 0053). Written explicitly on every recall question; never defaulted. */
    answerKind: z.enum(ANSWER_KINDS).optional(),
    /** recall: the equation, and the equation that states its answer (S = number); the verifier proves the answer. */
    /** `answer` for sum-of-roots, product-of-roots and solution (one equation); `answers` for roots (one equation x = value for each root). */
    question: z.object({ problem: id, answer: id.optional(), answers: z.array(id).min(1).optional() }).strict().optional(),
    /** reasoning: a multiple-choice question with the claims that explain the right option. */
    options: z.array(z.string().min(1)).min(2).optional(),
    correctOption: z.number().int().min(0).optional(),
    rationaleClaimIds: z.array(id).min(1).optional(),
    /** A person approved this question. Written explicitly on every practice question; never defaulted. */
    humanApproved: z.boolean().optional(),
  })
  .strict();
export type ContentRecord = z.infer<typeof ContentRecord>;
export type SolutionStep = z.infer<typeof SolutionStep>;

export const recordHash = (r: Omit<ContentRecord, "hash"> | ContentRecord): string => {
  const { hash: _h, ...rest } = r as ContentRecord;
  void _h;
  return hashOf(rest);
};

/** Put the right hash on a record (used by the tools that write records, and by tests). */
export const sealRecord = (r: Omit<ContentRecord, "hash">): ContentRecord => ({ ...r, hash: recordHash(r) });

export type { Claim, Expr };
