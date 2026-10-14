import { validateRecord, validateStore } from "@eve/content";
import { validateBundle, type Expr } from "@eve/schema";
import { checkApprovals } from "./approvals";
import { CORRUPTIONS, type Corruption, type Target } from "./corruptions";
import type { Fixture } from "./fixture";
import { GATES, failures } from "./index-gates";

/** Every check that can reject a lesson without a process: the seven gates, the validators of the bundle and of its records, and the compile check. */
export type Rejections = Partial<Record<Target, string[]>>;

export function rejectionsOf(f: Fixture): Rejections {
  const out: Rejections = {};
  const add = (target: Target, messages: string[]) => {
    if (messages.length > 0) out[target] = [...(out[target] ?? []), ...messages];
  };
  for (const gate of GATES) add(gate.id as Target, failures(gate.run(f.ctx)).map((x) => `${x.code}: ${x.message}`));
  const bundle = validateBundle(f.ctx.bundle);
  add("Validator", bundle.ok ? [] : bundle.issues.map((i) => `${i.path}: ${i.message}`));
  const records = Object.values(f.records);
  const known = new Set(records.flatMap((r) => Object.keys(r.expressions)));
  const table: Record<string, Expr> = Object.assign({}, ...records.map((r) => r.expressions));
  add("Validator", [...records.flatMap((r) => validateRecord(r, known, table)), ...validateStore(records)].map((p) => `${p.recordId} ${p.path}: ${p.message}`));
  add("Compile", checkApprovals(f.ctx.bundle, f.recordHashes, f.approvals).map((x) => `${x.code}: ${x.message}`));
  return out;
}

export type CorruptionResult = {
  corruption: Corruption;
  rejectedBy: Target[];
  /** The check the corruption names rejected it. */
  named: boolean;
  /** ... and for the reason the corruption names (its `reason`), not for another one. */
  forTheRightReason: boolean;
  messages: string[];
};

/** Applies one corruption and says which checks rejected the copy and whether the one it names was among them. */
export function judge(clean: Fixture, corruption: Corruption): CorruptionResult {
  const rejections = rejectionsOf(corruption.corrupt(clean));
  const rejectedBy = Object.keys(rejections) as Target[];
  const messages = rejections[corruption.target] ?? [];
  return { corruption, rejectedBy, named: rejectedBy.includes(corruption.target), forTheRightReason: messages.some((m) => corruption.reason.test(m)), messages };
}

export const judgeAll = (clean: Fixture): CorruptionResult[] => CORRUPTIONS.map((c) => judge(clean, c));
