import { ARCS, SLOT_BEAT_KIND, type ArcId, type SlotId } from "@eve/patterns";
import { goalProblems } from "@eve/schema";
import type { Finding, GateContext } from "./types";

const fail = (code: string, message: string, ids: string[]): Finding => ({ gate: "G4", level: "fail", code, message, ids });

/**
 * G4 ARC (CO-2 section 6, AM-7, AM-11). The arc exists. Every beat fills a legal slot of the arc, with the beat kind that slot has. A slot is filled once.
 * The required slots are filled (prerequisite activation only when the skill has prerequisites), in the order of the arc. Every beat has a learning goal that
 * passes the narration rules (18 words or fewer, no digits, no notation).
 */
export function g4Arc(ctx: GateContext): Finding[] {
  const out: Finding[] = [];
  const { plan } = ctx.bundle;
  const arc = plan.arcId !== undefined && Object.hasOwn(ARCS, plan.arcId) ? ARCS[plan.arcId as ArcId] : undefined;
  if (!arc) {
    out.push(fail("unknown-arc", `arc ${String(plan.arcId)} is not in the arc registry`, [String(plan.arcId)]));
  }
  const slotOrder: readonly string[] = arc ? arc.slots.map((s) => s.slotId) : [];
  const used = new Map<string, string>();
  let lastIndex = -1;
  for (const beat of plan.beats) {
    if (beat.learningGoal === undefined || beat.learningGoal.trim() === "") out.push(fail("no-learning-goal", `beat ${beat.id} has no learning goal`, [beat.id]));
    else for (const problem of goalProblems(beat.learningGoal)) out.push(fail("bad-learning-goal", `beat ${beat.id}: ${problem}`, [beat.id]));
    if (!arc) continue;
    const slot = beat.slotId;
    if (slot === undefined || !slotOrder.includes(slot)) {
      out.push(fail("illegal-slot", `beat ${beat.id} fills slot ${String(slot)}, which arc ${arc.id} does not have`, [beat.id]));
      continue;
    }
    const expected = SLOT_BEAT_KIND[slot as SlotId];
    if (beat.beatKind !== expected) out.push(fail("wrong-beat-kind", `beat ${beat.id} fills slot ${slot} so it is a ${expected} beat, not ${String(beat.beatKind)}`, [beat.id]));
    const earlier = used.get(slot);
    if (earlier !== undefined) out.push(fail("slot-filled-twice", `slot ${slot} is filled by both ${earlier} and ${beat.id}`, [earlier, beat.id]));
    used.set(slot, beat.id);
    const at = slotOrder.indexOf(slot);
    if (at < lastIndex) out.push(fail("slot-out-of-order", `beat ${beat.id} fills slot ${slot}, which comes earlier in arc ${arc.id} than the beat before it`, [beat.id]));
    lastIndex = Math.max(lastIndex, at);
  }
  if (arc) {
    const hasPrerequisites = (ctx.skills[ctx.bundle.skillId]?.prerequisiteSkillIds.length ?? 0) > 0;
    for (const s of arc.slots) {
      const required = s.need === "always" || (s.need === "ifPrerequisites" && hasPrerequisites);
      if (required && !used.has(s.slotId)) out.push(fail("missing-slot", `arc ${arc.id} needs a beat for slot ${s.slotId}`, [s.slotId]));
    }
  }
  return out;
}
