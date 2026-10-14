import { g1Coherence } from "./g1-coherence";
import { g2Delivery } from "./g2-delivery";
import { g3ActiveVisual } from "./g3-active-visual";
import { g4Arc } from "./g4-arc";
import { g5Role } from "./g5-role";
import { g6Prerequisites } from "./g6-prerequisites";
import { g7Coverage } from "./g7-coverage";
import type { Finding, GateContext, GateId } from "./types";

export const GATES: ReadonlyArray<{ id: GateId; name: string; run: (ctx: GateContext) => Finding[] }> = [
  { id: "G1", name: "coherence", run: g1Coherence },
  { id: "G2", name: "delivery", run: g2Delivery },
  { id: "G3", name: "active visual", run: g3ActiveVisual },
  { id: "G4", name: "arc", run: g4Arc },
  { id: "G5", name: "role", run: g5Role },
  { id: "G6", name: "prerequisites", run: g6Prerequisites },
  { id: "G7", name: "core coverage", run: g7Coverage },
];

/** Every gate, in order. A lesson passes when no finding is a failure; warnings do not reject. */
export const runGates = (ctx: GateContext): Finding[] => GATES.flatMap((g) => g.run(ctx));
export const failures = (findings: readonly Finding[]): Finding[] => findings.filter((f) => f.level === "fail");
