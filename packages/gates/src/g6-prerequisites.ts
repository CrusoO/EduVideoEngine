import type { Finding, GateContext } from "./types";

const fail = (code: string, message: string, ids: string[]): Finding => ({ gate: "G6", level: "fail", code, message, ids });

/**
 * G6 PREREQUISITES (CO-2 section 6, AM-10). Every direct prerequisite of every skill the lesson teaches is declared, and the declaration holds:
 *  - recapped: a beat of kind prerequisite whose sources belong to that skill;
 *  - linked: the skill exists in the content store;
 *  - assumed: the lesson level is one the prerequisite skill lists as assumable.
 * An undeclared prerequisite fails. Only direct prerequisites are checked; gaps further down the chain are not (ADR 0035).
 * The skills taught are the lesson skill and the skills of the sources of every beat that is not itself a prerequisite beat.
 */
export function g6Prerequisites(ctx: GateContext): Finding[] {
  const out: Finding[] = [];
  const { plan } = ctx.bundle;
  const declared = new Map((plan.prerequisites ?? []).map((p) => [p.skillId, p.status] as const));
  const taught = new Set<string>([ctx.bundle.skillId]);
  for (const beat of plan.beats.filter((b) => b.beatKind !== "prerequisite")) for (const r of beat.sourceIds) if (ctx.recordSkill[r]) taught.add(ctx.recordSkill[r]!);
  const needed = new Set<string>();
  for (const skill of taught) for (const pre of ctx.skills[skill]?.prerequisiteSkillIds ?? []) needed.add(pre);

  for (const pre of needed) {
    const status = declared.get(pre);
    if (status === undefined) {
      out.push(fail("undeclared-prerequisite", `prerequisite skill ${pre} is not declared as recapped, linked or assumed`, [pre]));
    } else if (status === "recapped") {
      const recap = plan.beats.some((b) => b.beatKind === "prerequisite" && b.sourceIds.some((r) => ctx.recordSkill[r] === pre));
      if (!recap) out.push(fail("recap-without-beat", `prerequisite ${pre} is declared recapped, but no prerequisite beat has sources from that skill`, [pre]));
    } else if (status === "linked") {
      if (!(pre in ctx.skills)) out.push(fail("link-target-missing", `prerequisite ${pre} is declared linked, but no skill record for it exists in the content store`, [pre]));
    } else {
      const level = plan.level;
      const allowed = ctx.skills[pre]?.assumableAtLevels ?? [];
      if (level === undefined || !allowed.includes(level)) out.push(fail("assumed-at-unlisted-level", `prerequisite ${pre} is declared assumed, but its skill is not assumable at level ${String(level)}`, [pre]));
    }
  }
  return out;
}
