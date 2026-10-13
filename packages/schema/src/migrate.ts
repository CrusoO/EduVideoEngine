import { LEGACY_SPEC_VERSION, SPEC_VERSION, type LessonBundle } from "./bundle";
import { seal } from "./hash";

/**
 * Migration from spec 1.0.0 to 2.0.0 (ADR 0030). Every new field is written explicitly, nothing is defaulted when the bundle is parsed, and running it
 * twice gives the same bundle as running it once (an already-2.0.0 bundle is returned as it is). Facts a person must decide (the goal of a beat, the role of
 * a sentence) are never guessed: they come in through `MigrationInput`, and a missing one is an error that names it.
 */
export type BeatMigration = { beatKind?: NonNullable<LessonBundle["plan"]["beats"][number]["beatKind"]>; slotId: string; learningGoal: string };
export type SentenceMigration = Pick<LessonBundle["script"][number], "role" | "claimId" | "linkClaimIds" | "questionId">;
export type ClaimMigration = Pick<NonNullable<LessonBundle["claims"]>[number], "claimMode" | "importance" | "dependsOn" | "usesStep" | "stepKind">;

export type MigrationInput = {
  subjectId: string;
  arcId: string;
  level: string;
  prerequisites?: NonNullable<LessonBundle["plan"]["prerequisites"]>;
  beats: Record<string, BeatMigration>;
  sentences: Record<string, SentenceMigration>;
  /** Per claim; a claim not listed is `computed` and `core` (every legacy claim is checked by the verifier). */
  claims?: Record<string, Partial<ClaimMigration>>;
};

/** The pedagogy beat kind a legacy beat kind most often maps to. Used only when the input does not name one. */
const LEGACY_BEAT_KIND = { predict: "hook", explore: "concept", explain: "concept", worked: "worked", check: "check" } as const;

export class MigrationError extends Error {}

/** Drop members that are undefined, so an optional field is omitted rather than present-and-empty. */
const compact = <T extends object>(o: T): T => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as T;

export function migrateToV2(bundle: LessonBundle, input: MigrationInput): LessonBundle {
  if (bundle.specVersion === SPEC_VERSION) return bundle;
  if (bundle.specVersion !== LEGACY_SPEC_VERSION) throw new MigrationError(`cannot migrate spec ${bundle.specVersion}`);
  const missing: string[] = [];
  const beats = bundle.plan.beats.map((beat) => {
    const m = input.beats[beat.id];
    if (!m) {
      missing.push(`beat ${beat.id}`);
      return beat;
    }
    return { ...beat, beatKind: m.beatKind ?? LEGACY_BEAT_KIND[beat.kind], slotId: m.slotId, learningGoal: m.learningGoal };
  });
  const script = bundle.script.map((s) => {
    const m = input.sentences[s.id];
    if (!m) {
      missing.push(`sentence ${s.id}`);
      return s;
    }
    const { status, ...rest } = s;
    return { ...rest, status: status === "reviewed" ? ("approved" as const) : status, ...compact(m) };
  });
  if (missing.length) throw new MigrationError(`migration input is missing: ${missing.join(", ")}`);
  const claims = bundle.claims?.map((c) => ({ ...c, claimMode: "computed" as const, importance: "core" as const, ...compact(input.claims?.[c.id] ?? {}) }));
  const { hashes: _old, ...rest } = bundle;
  void _old;
  return seal({
    ...rest,
    specVersion: SPEC_VERSION,
    subjectId: input.subjectId,
    plan: { ...bundle.plan, beats, arcId: input.arcId, level: input.level, ...(input.prerequisites?.length ? { prerequisites: input.prerequisites } : {}) },
    script,
    ...(claims ? { claims } : {}),
  });
}
