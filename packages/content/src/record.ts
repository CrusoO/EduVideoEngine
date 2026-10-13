import { z } from "zod";
import { COLOR_NAMES, ExprSchema, hashOf, type Claim, type Expr } from "@eve/schema";
import config from "../../../config/content.json";
import licences from "../../../config/licences.json";

/** Settings read from config/, never written in code (English only in Phase 1). */
export const CONTENT_CONFIG = config as { locales: string[]; reviewStatuses: string[]; minimumReviewStatus: string };
export const ALLOWED_LICENCES: readonly string[] = licences.allowed;

const id = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_.:-]*$/, "ids are letters, digits and _ . : -");
const hex64 = z.string().regex(/^[0-9a-f]{64}$/);

export const KINDS = ["passage", "solutionSteps", "misconception", "glossary"] as const;
export const REVIEW_STATUSES = ["draft", "reviewed", "approved"] as const;

/**
 * One step of a worked solution. A step is an expression tree (an equation), in order, and a ROLE that says what it is for:
 *  - transform: an equivalent form of the equation before it (a factorisation)  -> claim "equivalent"
 *  - root: an answer of the form x = value                                       -> collected into claim "roots"
 *  - sum: an equation stating the sum of the roots (2 + 3 = 5)                   -> claim "sum-of-roots"
 *  - note: shown or said, claims nothing
 * The claims of a worked beat are DERIVED from these roles by a fixed rule (derive.ts); a model never writes a claim.
 */
export const SolutionStep = z.object({ id, role: z.enum(["transform", "root", "sum", "note"]), expr: id, note: z.string().min(1).optional() }).strict();

export const GlossaryTerm = z.object({ id, term: z.string().min(1), definition: z.string().min(1) }).strict();

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
    reviewStatus: z.enum(REVIEW_STATUSES),
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
