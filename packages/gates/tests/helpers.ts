import { buildCleanFixture, type Finding, type Fixture, type GateContext } from "../src";

let cached: Fixture | undefined;
/** A fresh copy of the clean fixture (built once, cloned for each test so tests cannot disturb each other). */
export const fresh = (): Fixture => structuredClone((cached ??= buildCleanFixture()));
/** The gate context of a fresh clean fixture after an edit. Gates read the bundle as it is: no hash is checked here. */
export function ctxWith(edit: (ctx: GateContext) => void): GateContext {
  const ctx = fresh().ctx;
  edit(ctx);
  return ctx;
}
export const codes = (findings: readonly Finding[]): string[] => findings.map((f) => f.code);
export const sentence = (ctx: GateContext, id: string) => ctx.bundle.script.find((s) => s.id === id)!;
export const claim = (ctx: GateContext, id: string) => ctx.bundle.claims!.find((c) => c.id === id)!;
export const scene = (ctx: GateContext, id: string) => ctx.bundle.scenes.find((s) => s.id === id)!;
export const beat = (ctx: GateContext, id: string) => ctx.bundle.plan.beats.find((b) => b.id === id)!;
export const dur = (c: GateContext): Record<string, number> => c.durationsMs as Record<string, number>;
