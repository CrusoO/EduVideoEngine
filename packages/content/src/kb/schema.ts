import { z } from "zod";
import { ExprSchema } from "@eve/schema";
import type { BookMap } from "./books";

const id = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_.:-]*$/, "ids are letters, digits and _ . : -");

/** One passage of a source, in the words of the source. Kept so that every claim can name the lines that support it. */
export const Passage = z.object({ id, text: z.string().min(1), loc: z.string().min(1) }).strict();

/**
 * A source of the knowledge base. `licence` is on config/licences.json; a source under any licence other than owner-original, CC0 or public-domain must also be an entry
 * of config/sources.json under the same id (the rights ledger, ADR 0078), and a source that may only check claims never supplies the wording of a lesson.
 */
export const KbSource = z
  .object({
    id,
    title: z.string().min(1),
    rightsHolder: z.string().min(1),
    licence: z.string(),
    edition: z.string().min(1).optional(),
    mock: z.boolean().optional(),
    passages: z.array(Passage).min(1),
  })
  .strict();

export const LEVELS = ["class-9", "class-10", "class-11", "class-12"] as const;
/** A place in a book of the book map (knowledge/books): the book and the section number. Only the place is kept, never the text (ADR 0086). */
export const BookRef = z.object({ bookId: id, section: z.string().regex(/^(A\.)?\d+\.\d+$/, "a section number like 2.3") }).strict();
/** A claim says where the school book treats the same topic. `confirmed` means a person read the claim against those pages; only a person sets it. */
export const Citation = BookRef.extend({ confirmed: z.boolean().optional() }).strict();

export const Concept = z
  .object({
    id,
    label: z.string().min(1),
    subject: z.enum(["maths", "physics", "chemistry", "biology"]),
    level: z.enum(LEVELS),
    definition: z.string().min(1),
    /** Concepts a learner needs first. The graph must have no cycle. */
    prerequisites: z.array(id),
    related: z.array(id).optional(),
  })
  .strict();

export const CLAIM_KINDS = ["computed", "grounded", "simplification", "disputed"] as const;
/**
 * One atomic statement. `conditions` are what must hold for it to be true ("at constant temperature"); a claim that holds with no condition says so with `unconditional`,
 * never by leaving the list empty by accident. A `simplification` names where it stops being true (`limit`) and what replaces it later. `support` names the passages
 * that entail it; a computed claim is proved by a verifier instead and may have none.
 */
export const KbClaim = z
  .object({
    id,
    conceptId: id,
    statement: z.string().min(1),
    conditions: z.array(z.string().min(1)),
    unconditional: z.boolean().optional(),
    kind: z.enum(CLAIM_KINDS),
    simplification: z.object({ limit: z.string().min(1), replacedBy: z.string().min(1).optional() }).strict().optional(),
    support: z.array(z.object({ sourceId: id, passageId: id }).strict()),
    /** A computed claim names the arithmetic that proves it: `expr` with the symbols of `given` put in is exactly `equals` (exact rationals, no floats). */
    proof: z.object({ expr: ExprSchema, given: z.record(z.number().int()), equals: z.number().int(), equalsDen: z.number().int().min(1).optional() }).strict().optional(),
    /** A person has read this claim against its sources (ADR 0080). Only a person sets it. */
    humanReviewed: z.boolean().optional(),
    /** Where a school book treats this (a pointer: section and pages come from the book map). */
    citations: z.array(Citation).optional(),
  })
  .strict();

/**
 * A law that relates quantities, with what a worked example needs (ADR 0081): the relation as an equation, how to solve for one quantity, two example sets of numbers
 * (the worked one and a different one for the check question), and one typical wrong way of using it. Every number is checked in exact arithmetic by `validateKb`.
 */
export const Law = z
  .object({
    id,
    conceptId: id,
    relation: ExprSchema,
    solveFor: z.string().min(1),
    /** The relation solved for `solveFor`: an equation whose left side is that symbol. */
    rearranged: ExprSchema,
    quantities: z.record(z.object({ label: z.string().min(1), unit: z.string().min(1), symbol: z.string().min(1).max(3).optional() }).strict()),
    /** Drawn as a magnet moving towards a coil (ADR 0083). */
    magnet: z.boolean().optional(),
    /** The quantity a proportion table lets vary (a third, two thirds and all of its example value); the first given quantity when absent. */
    vary: z.string().min(1).optional(),
    /** An electric law can be drawn as a circuit: which symbol is the battery, the resistor and the meter (ADR 0082). */
    circuit: z.object({ source: z.string().min(1), load: z.string().min(1), meter: z.string().min(1) }).strict().optional(),
    example: z.object({ given: z.record(z.number().int()), answer: z.number().int() }).strict(),
    check: z.object({ given: z.record(z.number().int()), answer: z.number().int() }).strict(),
    /** The wrong working, as two numbers multiplied or divided the wrong way round: `a` op `b` = `result`, with `why` in words. */
    mistake: z.object({ op: z.enum(["mul", "div"]), a: z.string().min(1), b: z.string().min(1), why: z.string().min(1) }).strict(),
  })
  .strict();

export const EXAMS = ["JEE", "NEET"] as const;
/** A place in an official syllabus. The syllabus text itself is not stored: only where the topic sits and what the learner should be able to do, in our own words. */
export const CurriculumNode = z
  .object({
    id,
    board: z.enum(["CBSE", "BHUTAN"]),
    grade: z.number().int().min(9).max(12),
    subject: z.enum(["maths", "physics", "chemistry", "biology"]),
    unit: z.string().min(1),
    topic: z.string().min(1),
    outcomes: z.array(z.string().min(1)).min(1),
    conceptIds: z.array(id).min(1),
    exams: z.array(z.enum(EXAMS)).optional(),
    syllabus: z.object({ title: z.string().min(1), edition: z.string().min(1) }).strict(),
    /** The section of a book that treats this topic (ADR 0086). A topic with one must have every claim of its taught concepts cite a section of a book of the map. */
    book: BookRef.optional(),
    /** The skill of the content store whose lesson teaches this topic, when one exists apart from the compiler (a lesson is made from a node by that skill). */
    lessonSkillId: z.string().min(1).optional(),
    /** What the lesson of `lessonSkillId` does not match about this topic (its words, what it leaves out). Shown beside the video so the learner is not told more than it covers. */
    lessonNote: z.string().min(1).optional(),
  })
  .strict();

export const ChapterFile = z.object({ concepts: z.array(Concept), sources: z.array(KbSource), claims: z.array(KbClaim), laws: z.array(Law).optional() }).strict();
export const CurriculumFile = z.object({ nodes: z.array(CurriculumNode) }).strict();

export type Passage = z.infer<typeof Passage>;
export type KbSource = z.infer<typeof KbSource>;
export type Concept = z.infer<typeof Concept>;
export type KbClaim = z.infer<typeof KbClaim>;
export type CurriculumNode = z.infer<typeof CurriculumNode>;
export type Law = z.infer<typeof Law>;
export type Kb = { concepts: Concept[]; sources: KbSource[]; claims: KbClaim[]; nodes: CurriculumNode[]; laws?: Law[]; books?: BookMap[] };

/** Trust tiers shown to a learner: A proved by code, B supported by a source passage, C unsupported (held back), D reviewed by a person. */
export type Tier = "A" | "B" | "C" | "D";
/** A is earned by a proof that code has run (`validateKb` runs it and refuses a wrong one), never by the label `computed` alone. */
export const tierOf = (c: KbClaim): Tier => (c.humanReviewed ? "D" : c.kind === "computed" && c.proof ? "A" : c.support.length > 0 ? "B" : "C");
