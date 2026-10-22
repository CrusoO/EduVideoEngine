import { z } from "zod";

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

