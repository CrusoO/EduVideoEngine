import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  cacheGet, cacheKey, cachePut, CacheScanError, decide, defaultRegistry, DrawerRegistry, labelCardDrawer, loadSourceRegister, OUTCOME_NAMES, parseObjectRequest, ProvenanceError, propWrapper,
  readQueue, routeObject, type Drawer, type Facts, type ObjectSpec, type Outcome, type RouteContext,
} from "../objects";
import { findPrivacyProblems } from "../objects";

let dir: string;
beforeEach(() => void (dir = mkdtempSync(join(tmpdir(), "eve-objects-"))));
afterEach(() => rmSync(dir, { recursive: true, force: true }));

const reg = loadSourceRegister();
const ctx = (over: Partial<RouteContext> = {}): RouteContext => ({ enabled: true, registry: defaultRegistry(reg), today: "2026-11-11", cacheDir: join(dir, "cache"), queueFile: join(dir, "queue.jsonl"), ...over });
const parse = (raw: unknown): ObjectSpec => {
  const r = parseObjectRequest(raw);
  if (!r.ok) throw new Error(r.refusal.reason);
  return r.spec;
};
const plant = { kind: "prop", id: "p1", name: "Plant", prop: "plant", cell: "B2" };
const mirror = { kind: "ray_diagram", id: "r1", name: "Concave mirror", device: "mirror_concave", subject: "physics", grade: 10 };
const fakeDomain: Drawer<"ray_diagram"> = {
  name: "ray_mirror", kind: "ray_diagram", version: "1.0.0", license: "owner-original", sources: ["own-drawings"], covers: ["Ray diagram"],
  draw: (s) => ({ shapes: [{ id: "x", kind: "line", x1: 1, y1: 1, x2: 2, y2: 2, label: s.device }], alt: "A ray diagram" }),
  readBack: (s, r) => ({ ok: r.shapes[0]?.label === s.device, mismatches: r.shapes[0]?.label === s.device ? [] : ["device differs"] }),
};

describe("decide: one test per outcome of the 16-outcome tree (pure)", () => {
  const spec = parse(mirror);
  const wrapped = defaultRegistry(reg).find(parse(plant));
  const wrappedSpec = parse(plant);
  const domain = fakeDomain as unknown as Drawer;
  const cases: Array<[Outcome, ObjectSpec, Facts, Drawer | undefined, string]> = [
    [1, spec, { cached: true }, domain, "use_cache"],
    [2, spec, { ambiguous: "IEC or IEEE symbols" }, domain, "refuse"],
    [3, spec, {}, domain, "draw"],
    [4, spec, { nameUnresolved: true }, domain, "label_card"],
    [5, spec, { readBackFailed: true }, domain, "label_card"],
    [6, wrappedSpec, {}, wrapped, "existing"],
    [7, spec, { needsRealImage: true }, domain, "label_card"],
    [8, spec, { safetyCritical: true }, domain, "refuse"],
    [9, spec, { sensitive: true }, domain, "label_card"],
    [10, spec, { sourcesDisagree: true }, domain, "label_card"],
    [11, spec, { cached: true, cacheStale: true }, domain, "draw"],
    [13, spec, { blockedSources: ["openmoji"] }, domain, "refuse"],
    [15, spec, {}, undefined, "label_card"],
    [16, spec, { reported: true, cached: true }, domain, "label_card"],
  ];
  it.each(cases)("outcome %i", (outcome, s, facts, drawer, action) => {
    const d = decide(s, facts, drawer);
    expect(d.outcome).toBe(outcome);
    expect(d.name).toBe(OUTCOME_NAMES[outcome]);
    expect(d.action).toBe(action);
    expect(d.reason.length).toBeGreaterThan(5);
  });

  it("outcome 8 passes once a reviewer has signed off", () => {
    expect(decide(spec, { safetyCritical: true, reviewed: true }, domain).outcome).toBe(3);
  });
  it("outcome 11 with no drawer is a label card, not a guess", () => {
    expect(decide(spec, { cached: true, cacheStale: true }, undefined).action).toBe("label_card");
  });
  it("outcomes 12 and 14 are applied, not final: accessible always, locale when one applies", () => {
    expect(decide(spec, {}, domain).applied).toEqual([14]);
    expect(decide(spec, { locale: "en-IN" }, domain).applied).toEqual([12, 14]);
  });
  it("a thing with no catalog entry is outcome 6 and queued; an unknown domain object is outcome 15 and queued", () => {
    const icon = parse({ kind: "icon", id: "i", name: "Flask", set: "tabler-icons", icon: "flask" });
    expect(decide(icon, {}, undefined)).toMatchObject({ outcome: 6, action: "label_card", queue: true });
    expect(decide(spec, {}, undefined)).toMatchObject({ outcome: 15, queue: true });
  });
  it("fails closed: the refusals win over the cache and the drawer", () => {
    expect(decide(spec, { cached: true, blockedSources: ["kegg"] }, domain).outcome).toBe(13);
    expect(decide(spec, { cached: true, reported: true, safetyCritical: true }, domain).outcome).toBe(16);
  });
  it("all 16 outcomes have a name", () => {
    expect(Object.keys(OUTCOME_NAMES).length).toBe(16);
  });
});

describe("routeObject", () => {
  it("is inactive with the flag off: nothing is drawn, cached or queued", () => {
    expect(routeObject(plant, ctx({ enabled: false }))).toEqual({ active: false });
    expect(existsSync(join(dir, "cache"))).toBe(false);
    expect(existsSync(join(dir, "queue.jsonl"))).toBe(false);
  });

  it("an unknown kind is a refusal with a reason, not a label card and not queued", () => {
    const r = routeObject({ kind: "hologram", id: "h", name: "X" }, ctx());
    expect(r.active && r.refusal?.code).toBe("unknown_kind");
    expect(r.active && r.shapes).toEqual([]);
    expect(readQueue(join(dir, "queue.jsonl"))).toEqual([]);
  });

  it("an existing prop goes through the wrapper to the story shape it always was", () => {
    const r = routeObject(plant, ctx());
    expect(r.active && r.decision).toMatchObject({ outcome: 6, action: "existing", drawer: "existing_prop" });
    expect(r.active && r.shapes[0]).toMatchObject({ kind: "prop", name: "plant", cell: "B2", in: { s: 0, off: 0 } });
    expect(r.active && r.provenance).toMatchObject({ drawer: "existing_prop", licence: "owner-original", sources: ["own-drawings"] });
  });

  it("a wrapped shape works and an arrow (not placeable by a cell) becomes a label card", () => {
    const c = routeObject({ kind: "primitive", id: "c", name: "Ball", shape: "circle", cell: "C3" }, ctx());
    expect(c.active && c.shapes[0]).toMatchObject({ kind: "circle", cell: "C3" });
    const a = routeObject({ kind: "primitive", id: "a", name: "Pointer", shape: "arrow" }, ctx());
    expect(a.active && a.decision.action).toBe("label_card");
  });

  it("an object no drawer can make is a clearly labelled card and one queue entry, never a drawing", () => {
    const c = ctx();
    const r = routeObject(mirror, c);
    expect(r.active && r.decision).toMatchObject({ outcome: 15, action: "label_card" });
    expect(r.active && r.shapes.map((s) => s.kind)).toEqual(["rect", "text"]);
    expect(r.active && r.shapes[1]!.text).toBe("Diagram not available yet: Concave mirror");
    expect(r.active && r.queued).toBe("added");
    const again = routeObject(mirror, c);
    expect(again.active && again.queued).toBe("duplicate");
    const q = readQueue(join(dir, "queue.jsonl"));
    expect(q).toHaveLength(1);
    expect(q[0]).toMatchObject({ kind: "ray_diagram", name: "Concave mirror", outcome: 15, subject: "physics", grade: 10, at: "2026-11-11" });
  });

  it("an icon from a disallowed or unknown set is refused for its licence (outcome 13)", () => {
    for (const set of ["openmoji", "nowhere"]) {
      const r = routeObject({ kind: "icon", id: "i", name: "Flask", set, icon: "flask" }, ctx());
      expect(r.active && r.decision).toMatchObject({ outcome: 13, action: "refuse" });
      expect(r.active && r.shapes).toEqual([]);
    }
  });

  it("a registered drawer draws, is read back, cached, and a second call is a cache hit with the same shapes", () => {
    const registry = defaultRegistry(reg).register(fakeDomain);
    const c = ctx({ registry });
    const first = routeObject(mirror, c);
    expect(first.active && first.decision.outcome).toBe(3);
    expect(first.active && first.fromCache).toBe(false);
    const second = routeObject(mirror, c);
    expect(second.active && second.decision.outcome).toBe(1);
    expect(second.active && second.fromCache).toBe(true);
    expect(second.active && second.shapes).toEqual(first.active && first.shapes);
  });

  it("a cache hit skips drawing", () => {
    let draws = 0;
    const counting: Drawer<"ray_diagram"> = { ...fakeDomain, draw: (s, x) => (draws++, fakeDomain.draw(s, x)) };
    const c = ctx({ registry: defaultRegistry(reg).register(counting) });
    routeObject(mirror, c);
    routeObject(mirror, c);
    routeObject({ ...mirror, id: "other", sentence: 3 }, c); // same drawing, different place in the story
    expect(draws).toBe(1);
  });

  it("a read-back failure is outcome 5: a label card and a queue entry, never the bad drawing", () => {
    const liar: Drawer<"ray_diagram"> = { ...fakeDomain, name: "ray_liar", draw: () => ({ shapes: [{ id: "x", kind: "line", label: "wrong" }], alt: "a" }) };
    const c = ctx({ registry: defaultRegistry(reg).register(liar) });
    const r = routeObject(mirror, c);
    expect(r.active && r.decision).toMatchObject({ outcome: 5, action: "label_card" });
    expect(r.active && r.shapes.map((s) => s.kind)).toEqual(["rect", "text"]);
    expect(readQueue(join(dir, "queue.jsonl"))[0]!.outcome).toBe(5);
    expect(existsSync(join(dir, "cache"))).toBe(false); // the bad drawing was not cached
  });

  it("extra facts reach the tree (a later wave's reviewer data)", () => {
    const c = ctx({ registry: defaultRegistry(reg).register(fakeDomain), facts: () => ({ safetyCritical: true }) });
    expect(routeObject(mirror, c)).toMatchObject({ decision: { outcome: 8, action: "refuse" } });
  });

  it("a reported object is not served from the cache", () => {
    const registry = defaultRegistry(reg).register(fakeDomain);
    routeObject(mirror, ctx({ registry }));
    const r = routeObject(mirror, ctx({ registry, facts: () => ({ reported: true }) }));
    expect(r.active && r.decision.outcome).toBe(16);
    expect(r.active && r.fromCache).toBe(false);
  });

  it("a drawn object without valid provenance fails the build", () => {
    const registry = new DrawerRegistry(reg).register(labelCardDrawer).register(propWrapper);
    // a registered drawer is always accountable; corrupt the registry's sources after registering to prove the check
    const bad = structuredClone(reg);
    bad.sources.find((s) => s.id === "own-drawings")!.allowed = false;
    const c = ctx({ registry: Object.assign(registry, { sources: bad }) });
    expect(() => routeObject(plant, c)).toThrow(ProvenanceError);
  });
});

describe("the object cache (ADR 0107)", () => {
  const spec = parse(mirror);
  const key = (d: Partial<Drawer> = {}): string => cacheKey(spec, { ...fakeDomain, ...d });

  it("is keyed by spec, drawer version and tool versions: any change is a miss", () => {
    const k = key();
    expect(key()).toBe(k);
    expect(key({ version: "1.0.1" })).not.toBe(k);
    expect(key({ toolVersions: { sympy: "1.13.0" } })).not.toBe(k);
    expect(key({ toolVersions: { sympy: "1.13.1" } })).not.toBe(key({ toolVersions: { sympy: "1.13.0" } }));
    expect(key({ name: "ray_mirror2" })).not.toBe(k);
    expect(cacheKey(parse({ ...mirror, device: "mirror_convex" }), fakeDomain)).not.toBe(k);
    expect(cacheKey(parse({ ...mirror, id: "z", sentence: 4 }), fakeDomain)).toBe(k);
  });

  const entry = (k: string, shapes: unknown[] = [{ kind: "line" }]) => ({ v: 1 as const, key: k, result: { shapes: shapes as never, alt: "a" }, provenance: { drawer: "d", version: "1.0.0", inputHash: "a".repeat(64), sources: ["own-drawings"], licence: "owner-original", toolVersions: {}, date: "2026-11-11" } });

  it("round-trips an entry and reads a truncated, tampered or wrongly keyed file as a miss", () => {
    const k = key();
    cachePut(dir, entry(k));
    expect(cacheGet(dir, k)?.result.alt).toBe("a");
    const file = join(dir, k.slice(0, 2), `${k}.json`);
    const whole = readFileSync(file, "utf8");
    writeFileSync(file, whole.slice(0, 20));
    expect(cacheGet(dir, k)).toBeNull();
    writeFileSync(file, whole.replace(k, "f".repeat(64)));
    expect(cacheGet(dir, k)).toBeNull();
    expect(cacheGet(dir, "0".repeat(64))).toBeNull();
    mkdirSync(join(dir, "zz"), { recursive: true });
  });

  it("leaves no temp file behind", () => {
    const k = key();
    cachePut(dir, entry(k));
    expect(readdirSync(join(dir, k.slice(0, 2))).every((f) => f.endsWith(".json"))).toBe(true);
  });

  it("Q9: refuses to write an entry that holds personal data or a secret, so learner text cannot enter the cache", () => {
    const k = key();
    for (const text of ["write to ravi.k@example.com", "call 9876543210", "key " + "sk" + "-abcdefghijklmnopqrstuvwxyz123456"]) {
      expect(() => cachePut(dir, entry(k, [{ kind: "text", text }]))).toThrow(CacheScanError);
    }
    expect(existsSync(join(dir, k.slice(0, 2)))).toBe(false);
  });

  it("everything the router caches passes the privacy scan", () => {
    const c = ctx({ registry: defaultRegistry(reg).register(fakeDomain) });
    routeObject(mirror, c);
    routeObject(plant, c);
    const files = readdirSync(join(dir, "cache"), { recursive: true }).filter((f) => String(f).endsWith(".json"));
    expect(files.length).toBe(2);
    for (const f of files) expect(findPrivacyProblems(readFileSync(join(dir, "cache", String(f)), "utf8"))).toEqual([]);
  });
});
