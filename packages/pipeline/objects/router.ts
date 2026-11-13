import { cacheGet, cacheKey, cachePut, DEFAULT_CACHE_DIR } from "./cache";
import { labelCardDrawer } from "./drawers";
import { inputHash, makeProvenance, type DrawResult, type Drawer, type DrawerRegistry, type RawShape } from "./registry";
import { provenanceProblems, type Provenance } from "./provenance";
import { appendReview, DEFAULT_QUEUE_FILE } from "./review-queue";
import { parseObjectRequest, type ObjectSpec, type Refusal } from "./spec";
import { sourceById, type SourceRegister } from "./sources";

/**
 * The object router (ADR 0107): for each requested object it decides one of the sixteen outcomes of the decision tree of the engine prompt v3.1 and acts on it. Only five things can
 * happen to a request: reuse a cached object, draw it with a registered drawer, draw it with a wrapper of the existing prop or shape path, show a label card and queue it for review,
 * or refuse it with a reason. There is no path that ends in a guess and none that draws a thing no tool can make. `decide` is pure (it is tested once per outcome); `routeObject` runs it.
 */
export const OUTCOME_NAMES = {
  1: "cache_hit",
  2: "ambiguous",
  3: "domain_drawer",
  4: "name_unresolved",
  5: "read_back_failed",
  6: "physical_thing",
  7: "real_image_needed",
  8: "safety_critical_unreviewed",
  9: "sensitive_content",
  10: "sources_disagree",
  11: "source_changed",
  12: "locale_rules",
  13: "licence_blocked",
  14: "accessible",
  15: "out_of_scope",
  16: "reported_error",
} as const;
export type Outcome = keyof typeof OUTCOME_NAMES;
export type Action = "use_cache" | "draw" | "existing" | "label_card" | "refuse";

/** What the engine knows about a request besides the request itself. Each field is set by a check in code or by a later wave's reviewer data, never by the model that made the request. */
export type Facts = {
  /** an entry for this request and drawer version is in the cache */
  cached?: boolean;
  /** the cached entry was made from an older source version and must be re-reviewed (outcome 11) */
  cacheStale?: boolean;
  /** a learner or teacher reported an error in this object (outcome 16) */
  reported?: boolean;
  /** a source this request needs is blocked by the licence policy: the ids (outcome 13) */
  blockedSources?: string[];
  safetyCritical?: boolean;
  reviewed?: boolean;
  /** the drawer that would draw this request is registered `reviewed: false` and the switch that allows unreviewed drawers is off (outcome 8, ADR 0108) */
  unreviewedDrawer?: boolean;
  sensitive?: boolean;
  sourcesDisagree?: boolean;
  /** text that says what is ambiguous (outcome 2); the author is asked at plan time */
  ambiguous?: string;
  nameUnresolved?: boolean;
  needsRealImage?: boolean;
  /** the drawer's read-back found a mismatch (outcome 5) */
  readBackFailed?: boolean;
  /** a locale whose rules apply (outcome 12, not final) */
  locale?: string;
};

export type Decision = { outcome: Outcome; name: (typeof OUTCOME_NAMES)[Outcome]; action: Action; reason: string; queue: boolean; drawer?: string; /** the non-final outcomes that were also applied: 12 and 14 */ applied: Outcome[] };

const decision = (outcome: Outcome, action: Action, reason: string, queue: boolean, drawer?: Drawer, locale?: string): Decision => ({
  outcome,
  name: OUTCOME_NAMES[outcome],
  action,
  reason,
  queue,
  ...(drawer ? { drawer: drawer.name } : {}),
  applied: locale ? [12, 14] : [14],
});

/**
 * The decision tree as a pure function. The order is the order of the table in the engine prompt, with the refusals first: a reported error, a blocked licence and unreviewed
 * safety-critical content stop everything; then the cases that fail closed; then the cache; then the drawing.
 */
export function decide(spec: ObjectSpec, facts: Facts, drawer: Drawer | undefined): Decision {
  const loc = facts.locale;
  if (facts.reported) return decision(16, "label_card", "an error was reported in this object; it is out of the cache until it is re-reviewed", true, drawer, loc);
  if (facts.blockedSources && facts.blockedSources.length > 0) return decision(13, "refuse", `blocked by the licence policy: ${facts.blockedSources.join(", ")}`, false, drawer, loc);
  if (facts.safetyCritical && !facts.reviewed) return decision(8, "refuse", "safety-critical content needs a cited source and a reviewer's sign-off before it is shown", false, drawer, loc);
  if (facts.unreviewedDrawer) return decision(8, "label_card", `the drawer ${drawer?.name ?? ""} has not been reviewed by a subject teacher; it is shown as a label card and queued until the owner records the review (or allows unreviewed drawers for development)`, true, drawer, loc);
  if (facts.sourcesDisagree) return decision(10, "label_card", "the sources disagree; neither is drawn until a reviewer resolves it", true, drawer, loc);
  if (facts.ambiguous) return decision(2, "refuse", `ambiguous: ${facts.ambiguous}; the author says which one at plan time`, false, drawer, loc);
  if (facts.sensitive) return decision(9, "label_card", "sensitive content is not drawn until an approved neutral schematic exists", true, drawer, loc);
  if (facts.nameUnresolved) return decision(4, "label_card", "the name could not be resolved and is never invented", true, drawer, loc);
  if (facts.needsRealImage) return decision(7, "label_card", "needs a real image and no licensed one is registered; a schematic would be labelled as one", true, drawer, loc);
  if (facts.readBackFailed) return decision(5, "label_card", "the drawn object did not read back to the request", true, drawer, loc);
  if (facts.cached && facts.cacheStale) {
    return drawer ? decision(11, "draw", "the source changed since this object was cached; it is drawn again and flagged for review", true, drawer, loc) : decision(11, "label_card", "the source changed and no drawer is registered to redraw it", true, drawer, loc);
  }
  if (facts.cached) return decision(1, "use_cache", "already drawn and cached for this request", false, drawer, loc);
  if (drawer?.wraps === "existing") return decision(6, "existing", "drawn by the engine's existing prop and shape path", false, drawer, loc);
  if (drawer) return decision(3, "draw", "drawn by a registered drawer and read back", false, drawer, loc);
  if (spec.kind === "icon" || spec.kind === "prop" || spec.kind === "primitive") return decision(6, "label_card", "a physical thing with no catalog entry yet; it is queued for the catalog", true, undefined, loc);
  return decision(15, "label_card", `no drawer is registered for ${spec.kind} yet`, true, undefined, loc);
}

/** What the router needs besides the request. */
export type RouteContext = {
  enabled: boolean;
  registry: DrawerRegistry;
  /** YYYY-MM-DD, given by the caller so a test is deterministic */
  today: string;
  cacheDir?: string;
  queueFile?: string;
  /** Draw with drawers that are registered `reviewed: false` (ADR 0108). Off unless the caller turns it on: nothing unreviewed ships by accident. Only an explicit ENGINE_OBJECTS_ALLOW_UNREVIEWED turns it on, in every environment. */
  allowUnreviewed?: boolean;
  /** extra facts for a request (later waves: reviewer data); the defaults are derived from the register */
  facts?: (spec: ObjectSpec) => Facts;
};

export type Routed =
  | { active: false }
  | { active: true; decision: Decision; spec?: ObjectSpec; shapes: RawShape[]; alt: string; provenance?: Provenance; fromCache: boolean; refusal?: Refusal; queued?: "added" | "duplicate" };

export class ProvenanceError extends Error {
  constructor(public readonly drawer: string, public readonly problems: string[]) {
    super(`the object from ${drawer} has no valid provenance: ${problems.join("; ")}`);
  }
}

/** Facts the register answers by itself: an icon from a set that is not allowed (or not known) is blocked by the licence policy. */
export function deriveFacts(spec: ObjectSpec, register: SourceRegister): Facts {
  if (spec.kind === "icon") {
    const s = sourceById(register, spec.set);
    if (!s || !s.allowed) return { blockedSources: [spec.set] };
  }
  return {};
}

const inactive: Routed = { active: false };

/** Routes one raw object request. With the flag off it does nothing and returns `{ active: false }`. Never throws for a bad request; throws ProvenanceError for a drawn object without valid provenance. */
export function routeObject(raw: unknown, ctx: RouteContext): Routed {
  if (!ctx.enabled) return inactive;
  const parsed = parseObjectRequest(raw);
  if (!parsed.ok) return { active: true, decision: decision(15, "refuse", `${parsed.refusal.code}: ${parsed.refusal.reason}`, false), shapes: [], alt: "", fromCache: false, refusal: parsed.refusal };
  const spec = parsed.spec;
  const cacheDir = ctx.cacheDir ?? DEFAULT_CACHE_DIR;
  const queueFile = ctx.queueFile ?? DEFAULT_QUEUE_FILE;
  const drawer = ctx.registry.find(spec);
  const facts: Facts = { ...deriveFacts(spec, ctx.registry.sources), ...(ctx.facts?.(spec) ?? {}) };
  if (drawer?.reviewed === false && !ctx.allowUnreviewed) facts.unreviewedDrawer = true;

  const key = drawer ? cacheKey(spec, drawer) : null;
  const entry = key && !facts.reported ? cacheGet(cacheDir, key) : null;
  const usable = entry !== null && provenanceProblems(entry.provenance, ctx.registry.sources).length === 0;
  if (entry && usable) facts.cached = true;

  let d = decide(spec, facts, drawer);
  const prefix = `obj_${spec.id}`;
  const card = (why: Decision): Routed => {
    const cardSpec = { kind: "label_card", id: spec.id, name: spec.name, sentence: spec.sentence, ...(spec.cell ? { cell: spec.cell } : {}), ...(spec.area ? { area: spec.area } : {}), ...(spec.subject ? { subject: spec.subject } : {}), ...(spec.grade ? { grade: spec.grade } : {}), reason: "not_drawable_yet" } as const;
    const result = labelCardDrawer.draw(cardSpec, { idPrefix: prefix });
    const provenance = makeProvenance(labelCardDrawer as unknown as Drawer, cardSpec, ctx.today);
    const problems = provenanceProblems(provenance, ctx.registry.sources);
    if (problems.length > 0) throw new ProvenanceError(labelCardDrawer.name, problems);
    const queued = why.queue ? appendReview(queueFile, { at: ctx.today, specHash: inputHash(spec), kind: spec.kind, name: spec.name, outcome: why.outcome, reason: why.reason, ...(spec.subject ? { subject: spec.subject } : {}), ...(spec.grade ? { grade: spec.grade } : {}) }) : undefined;
    return { active: true, decision: why, spec, shapes: result.shapes, alt: result.alt, provenance, fromCache: false, ...(queued ? { queued } : {}) };
  };

  if (d.action === "refuse") return { active: true, decision: d, spec, shapes: [], alt: "", fromCache: false };
  if (d.action === "label_card") return card(d);
  if (d.action === "use_cache" && entry) return { active: true, decision: d, spec, shapes: entry.result.shapes, alt: entry.result.alt, provenance: entry.provenance, fromCache: true };

  // draw (a registered drawer or a wrapper): read it back, then check its provenance, then cache it
  const dr = drawer!;
  const result: DrawResult = dr.draw(spec as never, { idPrefix: prefix });
  const back = dr.readBack ? dr.readBack(spec as never, result) : { ok: true, mismatches: [] };
  if (!back.ok) {
    d = decide(spec, { ...facts, readBackFailed: true }, dr);
    return card({ ...d, reason: `${d.reason}: ${back.mismatches.join("; ")}` });
  }
  const provenance = makeProvenance(dr, spec, ctx.today);
  const problems = provenanceProblems(provenance, ctx.registry.sources);
  if (problems.length > 0) throw new ProvenanceError(dr.name, problems);
  cachePut(cacheDir, { v: 1, key: key!, result, provenance });
  return { active: true, decision: d, spec, shapes: result.shapes, alt: result.alt, provenance, fromCache: false };
}
