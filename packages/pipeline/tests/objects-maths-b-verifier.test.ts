import { describe, expect, it } from "vitest";
import { verifyBundle } from "@eve/verify";
import { NOT_EXPRESSIBLE, figureClaims, parseObjectRequest, type MiniBundle } from "../objects";
import { MATHS_B_FIGURES } from "../objects/maths/bparams";
import { SAMPLES } from "./maths-b-samples";

/**
 * The wave-6 figures through the existing verifier path (ADR 0100, 0113): the numbers a figure states about a mean, a median of grouped data, a regression slope, the probabilities of a
 * binomial or a tree, a derivative of x squared, a Riemann sum, the best value of an optimisation, a term or a sum of an AP or a GP, a determinant, a solution of two equations, a product of
 * complex numbers, the focal distance of a conic, the best corner of a linear programme, the arithmetic of a proof, a fraction in lowest terms and an identity of areas are written as claims over
 * the closed expression language and sent to the SymPy verifier of `services/verifier` (`@eve/verify`), in one process.
 */
const paramsOf = (name: string): { figure: (typeof MATHS_B_FIGURES)[number]; params: unknown } => {
  const r = parseObjectRequest(SAMPLES[name]);
  if (!r.ok || r.spec.kind !== "maths") throw new Error(`${name} is not a valid maths sample`);
  return { figure: r.spec.figure as (typeof MATHS_B_FIGURES)[number], params: r.spec.params };
};
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
/** The first number leaf of an expression, made one more (a wrong stated number, or a wrong input inside an identity). */
function bump(node: Record<string, unknown>): boolean {
  if (node.op === "num") {
    node.n = Number(node.n) + Number(node.d ?? 1);
    return true;
  }
  for (const k of ["a", "b"]) if (node[k] && typeof node[k] === "object" && bump(node[k] as Record<string, unknown>)) return true;
  return false;
}
function tamper(b: MiniBundle): MiniBundle | null {
  // a deep copy that does not share nodes, so that changing a number in one place does not change it in another
  const copy = JSON.parse(JSON.stringify(b)) as MiniBundle;
  const roots = copy.claims.find((c) => c.kind === "roots" && (c.values as unknown[]).length > 0) as { values: Array<{ n: number; d?: number }> } | undefined;
  if (roots) {
    roots.values[0]!.n += roots.values[0]!.d ?? 1;
    return copy;
  }
  // the stated number: the right-hand side of an equality that is a plain number; else a number inside an identity
  for (const node of Object.values(copy.expressions) as Array<{ op: string; b?: Record<string, unknown> }>) {
    if (node.op === "eq" && node.b?.op === "num") {
      node.b.n = Number(node.b.n) + Number(node.b.d ?? 1);
      return copy;
    }
  }
  for (const node of Object.values(copy.expressions) as Array<Record<string, unknown>>) if (node.op === "eq" && bump(node)) return copy;
  return null;
}
const names = Object.keys(SAMPLES);
const withClaims = names.map((name) => ({ name, ...paramsOf(name) })).map((s) => ({ ...s, claims: figureClaims(s.figure, s.params) })).filter((s) => s.claims !== null && s.claims.claimed.length > 0);

describe("the figures whose numbers the closed expression language can state are proved by the SymPy verifier", () => {
  it("covers 22 of the 25 figures and says which 3 it cannot state, and why", () => {
    const figures = new Set(withClaims.map((s) => s.figure));
    const cannot = MATHS_B_FIGURES.filter((f) => !figures.has(f));
    expect(cannot).toEqual(["m_normal", "m_sample", "m_invtrig"]);
    for (const f of cannot) expect(NOT_EXPRESSIBLE[f], `${f} needs a stated reason`).toBeDefined();
    expect(figures.size).toBe(22);
    expect(withClaims.length).toBeGreaterThan(110);
  });
  it("what the language cannot say is listed, not skipped", () => {
    const corr = figureClaims("m_scatter", paramsOf("scatter_positive").params)!;
    expect(corr.omitted.some((o) => o.includes("correlation coefficient"))).toBe(true);
    const irr = figureClaims("m_realtree", paramsOf("realtree_sqrt2").params);
    expect(irr).toBeNull();
    const tan = figureClaims("m_tangent", paramsOf("tangent_sin").params);
    expect(tan).toBeNull();
    const ex = figureClaims("m_conic", paramsOf("conic_ellipse_wide").params)!;
    expect(ex.claimed.length).toBeGreaterThan(0);
    const spiral = figureClaims("m_realtree", paramsOf("realtree_spiral_5").params)!;
    expect(spiral.claimed).toHaveLength(1);
  });
  it("every claim of every sample figure is verified (one verifier process for all of them)", async () => {
    const report = await verifyBundle(merge(withClaims.map((s) => ({ name: s.name, bundle: s.claims!.bundle }))));
    expect(report.failed.map((f) => `${f.id}: ${f.detail}`)).toEqual([]);
    expect(report.ok).toBe(true);
    expect(report.counts.equality).toBeGreaterThan(200);
    expect(report.counts.claim).toBeGreaterThan(3);
  }, 180_000);
  it("a wrong number in the claims is caught: every figure fails when one stated number is made wrong by one", async () => {
    const parts = withClaims.map((s) => ({ name: s.name, bundle: tamper(s.claims!.bundle) })).filter((p): p is { name: string; bundle: MiniBundle } => p.bundle !== null);
    expect(parts.length).toBe(withClaims.length);
    const report = await verifyBundle(merge(parts));
    expect(report.ok).toBe(false);
    const failed = new Set(report.failed.map((f) => f.id.split(".")[0]));
    for (const p of parts) expect(failed.has(p.name), `${p.name}: a wrong number was accepted`).toBe(true);
  }, 180_000);
  it("random programmes, bags, GPs and matrices, 200 in all, are verified; what is stated is what the compute code found", async () => {
    let seed = 20261113;
    const next = (): number => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;
    const int = (lo: number, hi: number): number => lo + Math.floor(next() * (hi - lo + 1));
    const parts: Array<{ name: string; bundle: MiniBundle }> = [];
    for (let i = 0; i < 50; i++) parts.push({ name: `g${i}`, bundle: figureClaims("m_seq", { mode: i % 2 ? "gp" : "converge", a: int(1, 30), r: [0.5, -0.5, 0.25, 0.8][i % 4]!, n: int(3, 8) })!.bundle });
    for (let i = 0; i < 50; i++) parts.push({ name: `a${i}`, bundle: figureClaims("m_seq", { mode: i % 2 ? "ap" : "partial", a: int(-30, 30), d: int(-9, 9) || 2, n: int(3, 8) })!.bundle });
    for (let i = 0; i < 50; i++) parts.push({ name: `t${i}`, bundle: figureClaims("m_ptree", { mode: "bag", red: int(1, 9), blue: int(1, 9), replace: next() < 0.5, event: (["both_first", "both_second", "same", "different", "at_least_one_first"] as const)[i % 5] })!.bundle });
    let made = 0;
    while (made < 50) {
      const p = { mode: "square", a: int(-5, 5), b: int(-5, 5), c: int(-5, 5), d: int(-5, 5) };
      if (p.a === 0 && p.b === 0 && p.c === 0 && p.d === 0) continue;
      parts.push({ name: `m${made++}`, bundle: figureClaims("m_matrix", p)!.bundle });
    }
    const report = await verifyBundle(merge(parts));
    expect(report.failed.map((f) => `${f.id}: ${f.detail}`)).toEqual([]);
    expect(report.ok).toBe(true);
  }, 180_000);
});
