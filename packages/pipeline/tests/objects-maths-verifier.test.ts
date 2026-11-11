import { describe, expect, it } from "vitest";
import { verifyBundle } from "@eve/verify";
import { NOT_EXPRESSIBLE, figureClaims, parseObjectRequest, type MiniBundle } from "../objects";
import { MATHS_FIGURES } from "../objects/maths/params";
import { SAMPLES } from "./maths-samples";

/**
 * The maths figures through the existing verifier path (ADR 0100, ADR 0112): the numbers a figure states about an equation, a point or a polygon are written as claims over the closed expression
 * language and sent to the SymPy verifier of `services/verifier`, the same process the lessons go through (`@eve/verify`). One process runs all of them (every id is prefixed with the sample it belongs to),
 * so the suite starts Python twice, not once per figure.
 */
const paramsOf = (name: string): { figure: (typeof MATHS_FIGURES)[number]; params: unknown } => {
  const r = parseObjectRequest(SAMPLES[name]);
  if (!r.ok || r.spec.kind !== "maths") throw new Error(`${name} is not a valid maths sample`);
  return { figure: r.spec.figure, params: r.spec.params };
};
/** All the claims of a set of figures in one bundle: every expression and claim id gets the prefix of its figure. */
function merge(parts: Array<{ name: string; bundle: MiniBundle }>): MiniBundle {
  const out: MiniBundle = { expressions: {}, scenes: [], claims: [] };
  for (const { name, bundle } of parts) {
    for (const [id, node] of Object.entries(bundle.expressions)) out.expressions[`${name}.${id}`] = node;
    for (const c of bundle.claims) {
      const next: Record<string, unknown> = { ...c, id: `${name}.${String(c.id)}` };
      for (const k of ["equation", "equals", "instance", "a", "b"]) if (typeof c[k] === "string") next[k] = `${name}.${String(c[k])}`;
      out.claims.push(next);
    }
  }
  return out;
}
/** A copy of a figure's claims with one stated number made wrong by one: a root if there is a roots claim, else the right-hand side of the first equality. */
function tamper(b: MiniBundle): MiniBundle | null {
  const copy = structuredClone(b);
  const roots = copy.claims.find((c) => c.kind === "roots" && (c.values as unknown[]).length > 0) as { values: Array<{ n: number; d?: number }> } | undefined;
  if (roots) {
    roots.values[0]!.n += roots.values[0]!.d ?? 1;
    return copy;
  }
  for (const node of Object.values(copy.expressions) as Array<{ op: string; b?: { op: string; n: number; d?: number } }>) {
    if (node.op === "eq" && node.b?.op === "num") {
      node.b.n += node.b.d ?? 1;
      return copy;
    }
  }
  return null;
}
const names = Object.keys(SAMPLES);
const withClaims = names.map((name) => ({ name, ...paramsOf(name) })).map((s) => ({ ...s, claims: figureClaims(s.figure, s.params) })).filter((s) => s.claims !== null && s.claims.claimed.length > 0);

describe("the figures whose numbers the closed expression language can state are proved by the SymPy verifier", () => {
  it("covers the polynomial and rational facts of 14 of the 22 figures and says which 8 it cannot state, and why", () => {
    const figures = new Set(withClaims.map((s) => s.figure));
    expect(figures.size).toBe(14);
    const cannot = MATHS_FIGURES.filter((f) => !figures.has(f));
    expect(cannot).toHaveLength(8);
    for (const f of cannot) expect(NOT_EXPRESSIBLE[f], `${f} needs a stated reason`).toBeDefined();
    expect(withClaims.length).toBeGreaterThan(50);
  });
  it("every claim of every sample figure is verified (one verifier process for all of them)", async () => {
    const bundle = merge(withClaims.map((s) => ({ name: s.name, bundle: s.claims!.bundle })));
    const report = await verifyBundle(bundle);
    expect(report.failed.map((f) => `${f.id}: ${f.detail}`)).toEqual([]);
    expect(report.ok).toBe(true);
    expect(report.counts.equality).toBeGreaterThan(100);
    expect(report.counts.claim).toBeGreaterThan(15);
  }, 120_000);
  it("a wrong number in the claims is caught: every figure fails when one stated number is made wrong by one", async () => {
    const parts = withClaims.map((s) => ({ name: s.name, bundle: tamper(s.claims!.bundle) })).filter((p): p is { name: string; bundle: MiniBundle } => p.bundle !== null);
    expect(parts.length).toBe(withClaims.length);
    const report = await verifyBundle(merge(parts));
    expect(report.ok).toBe(false);
    const failedNames = new Set(report.failed.map((f) => f.id.split(".")[0]));
    for (const p of parts) expect(failedNames.has(p.name), `${p.name}: a wrong number was accepted`).toBe(true);
  }, 120_000);
  it("random quadratics with whole-number roots, random lines and random polygons, 150 in all, are verified; the roots stated are the roots the compute code found", async () => {
    let seed = 20261112;
    const next = (): number => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 4294967296;
    };
    const int = (lo: number, hi: number): number => lo + Math.floor(next() * (hi - lo + 1));
    const parts: Array<{ name: string; bundle: MiniBundle }> = [];
    for (let i = 0; i < 60; i++) {
      const [r1, r2, a] = [int(-9, 9), int(-9, 9), int(1, 4) * (next() < 0.5 ? -1 : 1)];
      // a (x - r1)(x - r2) = a x^2 - a (r1 + r2) x + a r1 r2
      const c = figureClaims("m_fnplot", { mode: "quad", a, b: -a * (r1 + r2), c: a * r1 * r2 })!;
      expect(c.omitted, "whole-number roots are rational").toEqual([]);
      parts.push({ name: `q${i}`, bundle: c.bundle });
    }
    for (let i = 0; i < 50; i++) {
      const [m1, c1, m2, c2] = [int(-6, 6), int(-9, 9), int(-6, 6), int(-9, 9)];
      if (m1 === m2) continue;
      parts.push({ name: `l${i}`, bundle: figureClaims("m_line", { mode: "pair", m1, c1, m2, c2 })!.bundle });
    }
    for (let i = 0; i < 40; i++) {
      const c = figureClaims("m_coord", { mode: "section", ax: int(-9, 9), ay: int(-9, 9), bx: int(-9, 9), by: int(-9, 9), m: int(1, 9), n: int(1, 9) })!;
      parts.push({ name: `s${i}`, bundle: c.bundle });
    }
    const report = await verifyBundle(merge(parts));
    expect(report.failed.map((f) => `${f.id}: ${f.detail}`)).toEqual([]);
    expect(report.ok).toBe(true);
  }, 120_000);
  it("what the language cannot say is listed, not skipped: an irrational root is left out and named, the discriminant is still stated", () => {
    const c = figureClaims("m_fnplot", { mode: "quad", a: 1, b: 0, c: -2 })!;
    expect(c.omitted.some((o) => o.includes("irrational root"))).toBe(true);
    expect(c.claimed).toContain("the discriminant");
    const d = figureClaims("m_coord", { mode: "distance", ax: -2, ay: 3, bx: 4, by: -1 })!;
    expect(d.claimed).toEqual(["the square of the distance"]);
    expect(figureClaims("m_trig", { fn: "sin", amp: 1, b: 1 })).toBeNull();
    expect(figureClaims("m_unitcircle", { deg: 30 })).toBeNull();
    const inequality = figureClaims("m_numline", { mode: "solve", a: -3, b: 1, op: "ge", c: -8 })!;
    expect(inequality.omitted.some((o) => o.includes("no inequality"))).toBe(true);
  });
});
