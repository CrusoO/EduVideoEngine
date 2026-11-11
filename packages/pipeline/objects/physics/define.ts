import type { Drawer, DrawContext, DrawResult, ReadBack } from "../registry";
import type { ObjectKind, ObjectSpecOf } from "../spec";
import { findBannedPositioning } from "../qa-text";
import { altOf, areaTooSmall, boxOf, checkReadouts, layoutFor, layoutProblems, LINE_H, MAX_READOUTS, okBack, readoutText, SHAPE_BUDGET, Sketch, type Readout } from "./kit";
import { PHYSICS_PARAMS, type PhysicsFigure, type PhysicsParams } from "./params";

/**
 * How a figure becomes a registered drawer (ADR 0108). A figure supplies four things and nothing else: the read-outs (every number it prints, computed from the inputs), how to draw
 * the picture, and how to read the picture back. The wrapper adds the title, prints the read-outs that the figure did not place itself in the column on the right, checks the
 * layout (text size, alphabet, overlap, inside the area, shape budget), checks the printed numbers against the inputs, and sets what every wave-1 drawer carries: version, the licence of
 * its own work, the source `own-drawings`, no tool, and `reviewed: false` until the owner records a physics teacher's review.
 */
export type FigureDef<P> = {
  /** the object names of the inventory this drawer draws with meaning intact: what `pnpm objects:coverage` counts */
  covers: string[];
  readouts(p: P): Readout[];
  /** keys of read-outs the figure prints itself, next to what they describe; the rest go in the column */
  inline?(p: P): string[];
  draw(sk: Sketch, p: P, all: Readout[]): void;
  /** what the drawn shapes show, compared with the inputs: the Q4 read-back (the printed read-outs are checked by the wrapper) */
  check(result: DrawResult, p: P): string[];
};

export const WAVE1_VERSION = "1.0.0";

type Common = { sentence: number; name: string; area?: string; cell?: string };

function build<K extends ObjectKind, P>(cfg: { name: string; kind: K; accepts: (spec: ObjectSpecOf<K>) => boolean; params: (spec: ObjectSpecOf<K>) => P; def: FigureDef<P> }): Drawer<K> {
  const { def } = cfg;
  const columnOf = (p: P): Readout[] => {
    const inline = new Set(def.inline?.(p) ?? []);
    return def.readouts(p).filter((r) => !inline.has(r.key));
  };
  return {
    name: cfg.name,
    kind: cfg.kind,
    version: WAVE1_VERSION,
    license: "owner-original",
    sources: ["own-drawings"],
    reviewed: false,
    covers: def.covers,
    accepts: (spec) => !areaTooSmall(spec as Common) && cfg.accepts(spec),
    draw(spec, ctx: DrawContext): DrawResult {
      const p = cfg.params(spec);
      const all = def.readouts(p);
      if (all.length > MAX_READOUTS) throw new Error(`${cfg.name}: more than ${MAX_READOUTS} read-outs`);
      const col = columnOf(p);
      const sk = new Sketch(spec as Common, ctx, layoutFor(boxOf(spec as Common), col.map(readoutText)));
      sk.title();
      def.draw(sk, p, all);
      const inline = new Set(def.inline?.(p) ?? []);
      let row = 0;
      all.forEach((r, i) => {
        if (!inline.has(r.key)) sk.readoutAt(i, r, sk.L.col.x, sk.L.col.y + 1.7 + row++ * LINE_H);
      });
      return sk.result(altOf((spec as Common).name, cfg.name, all));
    },
    readBack(spec, result): ReadBack {
      const p = cfg.params(spec);
      const out = [...checkReadouts(result, def.readouts(p)), ...def.check(result, p), ...layoutProblems(result.shapes, boxOf(spec as Common))];
      if (result.shapes.length > SHAPE_BUDGET) out.push(`the figure has ${result.shapes.length} shapes and the budget is ${SHAPE_BUDGET}`);
      for (const s of result.shapes) if (typeof s.text === "string" && findBannedPositioning(s.text).length > 0) out.push("a text uses a banned positioning phrase");
      return okBack(out);
    },
  };
}

/** A figure of the `physics` kind: the inputs are parsed again from the request, so a drawer never trusts a spec that did not pass the schema. */
export function physicsDrawer<F extends PhysicsFigure>(figure: F, drawerName: string, def: FigureDef<PhysicsParams<F>>): Drawer<"physics"> {
  return build({
    name: drawerName,
    kind: "physics",
    accepts: (spec) => spec.figure === figure,
    params: (spec) => PHYSICS_PARAMS[figure].parse(spec.params) as PhysicsParams<F>,
    def,
  });
}

/** A figure of another kind (the free-body diagram uses the `free_body` request wave 0 defined). */
export function kindDrawer<K extends ObjectKind, P>(kind: K, drawerName: string, accepts: (spec: ObjectSpecOf<K>) => boolean, params: (spec: ObjectSpecOf<K>) => P, def: FigureDef<P>): Drawer<K> {
  return build({ name: drawerName, kind, accepts, params, def });
}
