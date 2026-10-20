import { KINDS, retrieve, type ContentRecord, type Retrieval } from "@eve/content";

/** What the content store knows about a skill, for the prerequisite rules (the same shape the gates read). */
export type SkillFacts = { prerequisiteSkillIds: readonly string[]; assumableAtLevels: readonly string[] };

export class LessonContextError extends Error {}

/**
 * Everything the compile passes need to know about the store for one lesson, found once: the records of the lesson's skill, the records of each direct
 * prerequisite skill, and the tables the gates take (`skills`, `recordSkill`, `hashes`). Nothing outside the store is reachable from here.
 */
export type LessonContext = {
  skillId: string;
  locale: string;
  level: string;
  lesson: Retrieval;
  /** The skill record of the lesson's skill, when the store has one. */
  skillRecord: ContentRecord | undefined;
  /** The direct prerequisites of the lesson's skill, in the order the skill record lists them, each with its records. */
  prerequisites: ReadonlyArray<{ skillId: string; retrieval: Retrieval; assumableAtLevels: readonly string[] }>;
  skills: Readonly<Record<string, SkillFacts>>;
  recordSkill: Readonly<Record<string, string>>;
  /** The hash of every record, by id (approvals are tied to these). */
  hashes: Readonly<Record<string, string>>;
};

export function lessonContext(store: readonly ContentRecord[], skillId: string, locale: string, level: string): LessonContext {
  const lesson = retrieve(store, skillId, locale);
  if (lesson.records.length === 0) throw new LessonContextError(`the store has no records for ${skillId} in ${locale}`);
  const skillRecord = lesson.byKind.skill[0];
  const skillFacts = (rec: ContentRecord): SkillFacts => ({ prerequisiteSkillIds: rec.prerequisiteSkillIds ?? [], assumableAtLevels: rec.assumableAtLevels ?? [] });
  const skills = Object.fromEntries(store.filter((r) => r.kind === "skill").map((r) => [r.skillId, skillFacts(r)]));
  const prerequisites = (skillRecord?.prerequisiteSkillIds ?? []).map((pre) => ({ skillId: pre, retrieval: retrieve(store, pre, locale), assumableAtLevels: skills[pre]?.assumableAtLevels ?? [] }));
  return {
    skillId,
    locale,
    level,
    lesson,
    skillRecord,
    prerequisites,
    skills,
    recordSkill: Object.fromEntries(store.map((r) => [r.id, r.skillId])),
    hashes: Object.fromEntries(store.map((r) => [r.id, r.hash])),
  };
}

/** The retrieval of a skill the lesson can see: its own, or one of its direct prerequisites. */
export function retrievalOf(ctx: LessonContext, skillId: string): Retrieval | undefined {
  return skillId === ctx.skillId ? ctx.lesson : ctx.prerequisites.find((p) => p.skillId === skillId)?.retrieval;
}

/**
 * The same retrieval seen through a beat's sources: only those records are offered to a pattern, so a pattern that picks "the first record of its kind"
 * picks among the records the planner chose. The expression table stays whole, because a pattern may draw an expression that another record owns.
 */
export function narrow(r: Retrieval, ids: readonly string[]): Retrieval {
  const keep = new Set(ids);
  return {
    ...r,
    records: r.records.filter((x) => keep.has(x.id)),
    byKind: Object.fromEntries(KINDS.map((k) => [k, r.byKind[k].filter((x) => keep.has(x.id))])) as Retrieval["byKind"],
  };
}
