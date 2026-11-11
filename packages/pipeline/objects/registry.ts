import type { ObjectKind, ObjectSpec, ObjectSpecOf } from "./spec";
import { canonical, sha256, type Provenance } from "./provenance";
import { ALLOWED_LICENCES, sourceById, type SourceRegister } from "./sources";

/** A shape in the story language (what `sanitizeStory` reads), before the sanitiser has checked it. A drawer returns these; it never returns pixels of its own. */
export type RawShape = Record<string, unknown>;
export type DrawResult = { shapes: RawShape[]; /** the text alternative of the object, built from the spec */ alt: string };
export type ReadBack = { ok: boolean; mismatches: string[] };
export type DrawContext = { /** the shape id prefix the expansion gives this object */ idPrefix: string };

/**
 * A drawer turns one kind of typed spec into shapes (ADR 0107). It is registered under a name with its kind, a version, the licence of what it makes, the register ids of the art and
 * tools it uses and the versions of those tools. `draw` must be pure and deterministic: the same spec gives the same shapes (the object cache relies on it). `readBack` is the Q4 check:
 * it reads the values back out of the drawn shapes and compares them to the spec; a later drawer plugs its own in.
 */
export interface Drawer<K extends ObjectKind = ObjectKind> {
  name: string;
  kind: K;
  version: string;
  license: string;
  sources: string[];
  toolVersions?: Record<string, string>;
  /** Object names (the `object` column of the inventory) this drawer can draw with meaning intact: what the coverage report counts. */
  covers?: string[];
  /** False until the owner records a subject teacher's review of this drawer (ADR 0108). A drawer without the field is reviewed (wave 0's wrappers). The router refuses to ship an unreviewed drawer unless the switch allows it. */
  reviewed?: boolean;
  /** "existing" marks a wrapper that calls the engine's own prop or shape path, so existing behaviour is unchanged. */
  wraps?: "existing";
  accepts?(spec: ObjectSpecOf<K>): boolean;
  draw(spec: ObjectSpecOf<K>, ctx: DrawContext): DrawResult;
  readBack?(spec: ObjectSpecOf<K>, result: DrawResult): ReadBack;
}

export class RegistrationError extends Error {
  constructor(public readonly drawer: string, public readonly problems: string[]) {
    super(`drawer ${drawer} cannot register: ${problems.join("; ")}`);
  }
}

const NAME = /^[a-z][a-z0-9_]{1,39}$/;
const SEMVER = /^\d+\.\d+\.\d+$/;

/** Why a drawer may not register against a source register; empty when it may. */
export function drawerProblems(d: Drawer, register: SourceRegister): string[] {
  const out: string[] = [];
  if (!NAME.test(d.name)) out.push("the name is lower-case letters, digits and _ (2 to 40)");
  if (!SEMVER.test(d.version)) out.push("the version is not x.y.z");
  if (typeof d.draw !== "function") out.push("it has no draw()");
  if (!(ALLOWED_LICENCES as readonly string[]).includes(d.license)) out.push(`the licence ${d.license} is not one the policy allows`);
  if (!Array.isArray(d.sources) || d.sources.length === 0) out.push("it names no source id (own work is the source own-drawings)");
  for (const id of d.sources ?? []) {
    const s = sourceById(register, id);
    if (!s) out.push(`source ${id} is not in the register`);
    else if (!s.allowed) out.push(`source ${id} is not allowed${s.unverified ? " (its licence is unverified)" : ""}`);
    else if (s.kind === "tool" && !(d.toolVersions?.[id] ?? "").trim()) out.push(`tool ${id} needs a version in toolVersions`);
  }
  return out;
}

/** Drawers by name. Registering one that breaks the source policy throws, so the build that registers it fails. */
export class DrawerRegistry {
  private readonly drawers = new Map<string, Drawer>();
  constructor(readonly sources: SourceRegister) {}

  register<K extends ObjectKind>(d: Drawer<K>): this {
    const problems = drawerProblems(d as unknown as Drawer, this.sources);
    if (this.drawers.has(d.name)) problems.push("a drawer with this name is already registered");
    if (problems.length > 0) throw new RegistrationError(d.name, problems);
    this.drawers.set(d.name, d as unknown as Drawer);
    return this;
  }
  get(name: string): Drawer | undefined {
    return this.drawers.get(name);
  }
  all(): Drawer[] {
    return [...this.drawers.values()];
  }
  /** The first registered drawer of the spec's kind that accepts it. */
  find(spec: ObjectSpec): Drawer | undefined {
    return this.all().find((d) => d.kind === spec.kind && (d.accepts ? d.accepts(spec as never) : true));
  }
}

/** The part of a spec that says what is drawn. Where it goes (id, sentence) does not change the drawing, so it is left out of the hash. */
export const specContent = (spec: ObjectSpec): Record<string, unknown> => {
  const { id: _id, sentence: _sentence, ...rest } = spec as Record<string, unknown>;
  return rest;
};
export const inputHash = (spec: ObjectSpec): string => sha256(canonical(specContent(spec)));

export const makeProvenance = (d: Drawer, spec: ObjectSpec, date: string): Provenance => ({
  drawer: d.name,
  version: d.version,
  inputHash: inputHash(spec),
  sources: [...d.sources],
  licence: d.license,
  toolVersions: { ...(d.toolVersions ?? {}) },
  date,
  ...(d.reviewed === false ? { reviewed: false } : {}),
});
