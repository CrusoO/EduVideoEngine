/** How far a morph has gone at time t: 0 before it, 1 after it (and, with reduced motion, from its start on), linear in between. 1 when the object has no morph. */
export function morphProgress(morph: { atMs: number; holdUntilMs: number } | undefined, t: number, reduceMotion?: boolean): number {
  if (!morph) return 1;
  if (reduceMotion) return t >= morph.atMs ? 1 : 0;
  return Math.min(1, Math.max(0, (t - morph.atMs) / Math.max(1, morph.holdUntilMs - morph.atMs)));
}
