import { z } from "zod";
import { morphProgress } from "./morph";
import type { ObjectEvent } from "./types";

/**
 * A sweep (ADR 0070): the graphed quadratic is drawn for a family, with its x-coefficient b multiplied by a factor that a `morph` cue moves from `from` to `to`
 * (and that the student can drag between `min` and `max` while the lesson is paused). `readout` writes b and the sum of the roots on the graph. With `roundTrip` the
 * factor goes to `to` and comes back to `from`, so the graph ends as the equation on the screen says.
 */
export const Sweep = z.object({ from: z.number().positive(), to: z.number().positive(), min: z.number().positive().optional(), max: z.number().positive().optional(), readout: z.boolean().optional(), roundTrip: z.boolean().optional() }).strict();
export type SweepProps = z.infer<typeof Sweep>;
/** The factor a drag to `fraction` (0 at the left edge of the graph, 1 at the right) sets. */
export const sweepValueAt = (s: SweepProps, fraction: number): number => {
  const lo = s.min ?? Math.min(s.from, s.to);
  const hi = s.max ?? Math.max(s.from, s.to);
  return lo + (hi - lo) * Math.min(1, Math.max(0, fraction));
};


/**
 * Where the factor of a sweep is at time t for a picture that is not a graph (the circuit, the water analogy; ADR 0085): its start before the `morph` cue on the object, its end
 * after it, linear between, going to `to` and back with `roundTrip`; or what the student dragged to while the lesson is paused.
 */
export function sweepFactorAt(sw: SweepProps, events: readonly ObjectEvent[], t: number, reduceMotion?: boolean, override?: number): number {
  if (override !== undefined) return override;
  const ev = events.find((e) => e.part === undefined && e.action === "morph");
  const u = morphProgress(ev, t, reduceMotion);
  return sw.from + (sw.to - sw.from) * (sw.roundTrip ? 1 - Math.abs(2 * u - 1) : u);
}
