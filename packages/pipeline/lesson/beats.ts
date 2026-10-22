import { DeriveError, deriveClaimGraph, type ContentRecord, type Retrieval } from "@eve/content";
import { LIBRARY, PatternError, SLOT_BEAT_KIND, instantiate, type PedagogyBeatKind } from "@eve/patterns";
import type { Claim, Expr } from "@eve/schema";
import { narrow, retrievalOf, type LessonContext } from "./context";
import type { ArcBeat, ArcPlan } from "./types";

/** One beat of a plan with everything code can know about it before any sentence is written. */
export type BeatBuild = {
  /** 0-based position in the plan; the sentences of the beat are `s<index + 1>.<n>`. */
  index: number;
  beat: ArcBeat;
  beatKind: PedagogyBeatKind;
  sceneId: string;
  /** The skill whose records the beat draws on: the lesson's skill, or the prerequisite a recap beat is about. */
  skillId: string;
  /** The records of that skill the beat names, and no others: the pattern is built from these. */
  retrieval: Retrieval;
  /** The claims the beat makes, in telling order (a claim after the claims it depends on inside the beat). */
  claims: Claim[];
  /** Expressions the pattern adds to the bundle (such as the stops of a number line). */
  expressions: Record<string, Expr>;
  /** The practice question a check-question beat asks (its text is the question sentence). */
  question?: ContentRecord;
};

export type BuiltBeats = { ok: true; beats: BeatBuild[] } | { ok: false; errors: string[] };

export const sceneIdOf = (index: number): string => `scene.b${index + 1}`;
export const sentenceIdOf = (index: number, n: number): string => `s${index + 1}.${n}`;

/** The beat kinds whose beats may state concept claims: a worked beat's claims come from its solution, a hook states none, a check's from its question. */
const CONCEPT_BEAT_KINDS: readonly PedagogyBeatKind[] = ["prerequisite", "concept", "mistake"];

/** The claim a conceptClaim record stands for: a computed claim keeps the statement the verifier proves, a grounded one is a statement a person approves. */
export function conceptClaimOf(rec: ContentRecord, beatId: string): Claim {
  const base = { id: rec.id, beatId, sourceIds: [rec.id], importance: rec.importance ?? ("support" as const) };
  if (rec.claimMode === "computed" && rec.claim) return { ...base, ...rec.claim, claimMode: "computed" as const };
  // a grounded claim carries the expressions its record says the prose is about (spec 2.3.0, ADR 0074); a record that declares none gives the claim as before
  return { ...base, kind: "statement" as const, claimMode: "grounded" as const, ...(rec.exprRefs ? { exprRefs: [...rec.exprRefs] } : {}) };
}

/** Claims in telling order: each after the claims of the same beat it depends on; the planner's order otherwise. A cycle cannot happen (G1 rejects it); it is left in place. */
export function orderClaims(claims: readonly Claim[]): Claim[] {
  const inBeat = new Set(claims.map((c) => c.id));
  const placed: Claim[] = [];
  const rest = [...claims];
  while (rest.length > 0) {
    const at = rest.findIndex((c) => (c.dependsOn ?? []).every((d) => !inBeat.has(d) || placed.some((p) => p.id === d)));
    placed.push(...rest.splice(at === -1 ? 0 : at, 1));
  }
  return placed;
}

/**
 * Finds out what each beat of a plan will contain, with no sentence yet: the records it draws on, the scene's expressions and the claims it makes. The
 * pattern is built once with stand-in sentence ids and stand-in writer text, only to read its claims and expressions back (they do not depend on either);
 * a title that is too long, a pattern that cannot be filled from the beat's records, or a slot that does not take the pattern are reported here, with the
 * messages a model can be asked to repair. Shared by the planner's check and by the assembler, so the two cannot disagree.
 */
export function buildBeats(ctx: LessonContext, plan: ArcPlan): BuiltBeats {
  const errors: string[] = [];
  const builds: BeatBuild[] = [];
  const claimedBy = new Map<string, string>(); // record id -> beat id, for a record used by two beats

  plan.beats.forEach((beat, index) => {
    const at = `beat ${beat.id}`;
    const beatKind = SLOT_BEAT_KIND[beat.slotId];
    const pattern = LIBRARY.find((p) => p.id === beat.pattern);
    if (!pattern) return void errors.push(`${at}: pattern ${beat.pattern} does not exist (patterns: ${LIBRARY.map((p) => p.id).join(", ")})`);
    if (!(pattern.beatKinds as readonly string[]).includes(beatKind)) errors.push(`${at}: slot ${beat.slotId} is a ${beatKind} beat, and pattern ${pattern.id} suits ${pattern.beatKinds.join(", ")}`);

    // the skill the beat is about: a recap beat is about the prerequisite its records belong to, every other beat about the lesson's skill
    const first = beat.sourceIds.map((s) => ctx.recordSkill[s]).find((s) => s !== undefined);
    const skillId = beatKind === "prerequisite" ? first : ctx.skillId;
    const base = skillId === undefined ? undefined : retrievalOf(ctx, skillId);
    if (skillId === undefined || !base || (beatKind === "prerequisite" && skillId === ctx.skillId)) {
      return void errors.push(`${at}: a prerequisite beat draws on the records of a direct prerequisite of ${ctx.skillId} (${ctx.prerequisites.map((p) => p.skillId).join(", ") || "it has none"})`);
    }
    const known = new Set(base.records.map((r) => r.id));
    const stray = beat.sourceIds.filter((s) => !known.has(s));
    if (stray.length > 0) return void errors.push(`${at}: sourceIds ${stray.join(", ")} ${stray.length === 1 ? "is" : "are"} not ${beatKind === "prerequisite" ? `records of ${skillId}` : `records of ${ctx.skillId}`}`);
    for (const s of beat.sourceIds) {
      const other = claimedBy.get(s);
      if (other !== undefined && base.records.find((r) => r.id === s)?.kind === "conceptClaim") errors.push(`${at}: concept claim ${s} is already stated by beat ${other}; a claim is stated once`);
      claimedBy.set(s, beat.id);
    }

    const retrieval = narrow(base, beat.sourceIds);
    const concept = retrieval.byKind.conceptClaim;
    if (concept.length > 0 && !CONCEPT_BEAT_KINDS.includes(beatKind)) {
      errors.push(`${at}: a ${beatKind} beat cannot state concept claims (${concept.map((c) => c.id).join(", ")}); move them to a beat of the concept, prerequisite or mistake slot (a scene that shows an equation needs a claim that names it in the same beat, so do not just delete them)`);
    }

    const sentenceIds = Array.from({ length: Math.max(2, pattern.minSentences) }, (_x, k) => sentenceIdOf(index, k + 1));
    let instance;
    try {
      instance = instantiate(pattern.id, retrieval, { sceneId: sceneIdOf(index), beatId: beat.id, sentenceIds, text: { title: beat.title, prompt: "Placeholder", note: "Placeholder", altText: "Placeholder" } });
    } catch (e) {
      if (!(e instanceof PatternError)) throw e;
      return void errors.push(`${at}: ${e.message}${e.message.includes("cannot be used") ? ` (the beat's sourceIds are ${beat.sourceIds.join(", ")})` : ""}`);
    }

    // The claims of the beat. A worked pattern derives the flat claims of its solution; a spec 2.0.0 bundle needs the claim graph (mode, importance, edges), which
    // is derived from the same record by the same fixed rule. The other patterns' claims are used as they come, then the concept claims of the beat's records
    // that the pattern did not make itself.
    const solution = pattern.derivesClaims ? retrieval.byKind.solutionSteps[0] : undefined;
    let own: Claim[];
    try {
      own = solution ? deriveClaimGraph(solution, beat.id) : instance.claims;
    } catch (e) {
      if (!(e instanceof DeriveError)) throw e;
      return void errors.push(`${at}: ${e.message}`);
    }
    const made = new Set(own.flatMap((c) => c.sourceIds ?? []));
    const stated = concept.filter((rec) => !made.has(rec.id)).map((rec) => conceptClaimOf(rec, beat.id));
    const question = pattern.id === "check-question" ? retrieval.byKind.practiceQuestion.find((q) => instance.recordIds.includes(q.id)) : undefined;
    builds.push({ index, beat, beatKind, sceneId: sceneIdOf(index), skillId, retrieval, claims: [...own, ...stated], expressions: instance.expressions, ...(question ? { question } : {}) });
  });
  const seen = new Map<string, string>();
  for (const b of builds) {
    for (const c of b.claims) {
      const other = seen.get(c.id);
      if (other !== undefined) errors.push(`beat ${b.beat.id} repeats claim ${c.id} of beat ${other}; two beats need different records (a second worked example needs a different solution)`);
      seen.set(c.id, b.beat.id);
    }
  }
  if (errors.length > 0) return { ok: false, errors };

  // a record's dependsOn names other records: the claim of each is the claim the lesson makes of that record
  const claimOfRecord = new Map<string, string>();
  const recordOf = new Map(builds.flatMap((b) => b.retrieval.records.map((r) => [r.id, r] as const)));
  for (const b of builds) for (const c of b.claims) for (const s of c.sourceIds ?? []) if (recordOf.get(s)?.kind === "conceptClaim") claimOfRecord.set(s, c.id);
  for (const b of builds) {
    b.claims = orderClaims(
      b.claims.map((c) => {
        const rec = recordOf.get(c.sourceIds?.[0] ?? "");
        if (rec?.kind !== "conceptClaim" || !rec.dependsOn) return c;
        const wanted = rec.dependsOn.flatMap((d) => {
          const claim = claimOfRecord.get(d);
          if (claim === undefined) errors.push(`beat ${b.beat.id}: concept claim ${rec.id} depends on ${d}, which no beat of the plan states`);
          return claim === undefined ? [] : [claim];
        });
        return wanted.length > 0 ? { ...c, dependsOn: [...new Set([...(c.dependsOn ?? []), ...wanted])] } : c;
      }),
    );
  }
  return errors.length > 0 ? { ok: false, errors } : { ok: true, beats: builds };
}
