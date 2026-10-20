import { spokenLabel } from "@eve/components";
import type { ContentRecord } from "@eve/content";
import { claimNumbers } from "@eve/gates";
import type { Claim, Expr } from "@eve/schema";

const ONES = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen"];
const TENS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];

/** A whole number from 0 to 999 as English words, the form the number-word check (G5 part d) reads back. Larger numbers have no words here and are given as they are. */
export function numberWord(n: number): string {
  if (!Number.isInteger(n) || n < 0 || n > 999) return String(n);
  if (n < 20) return ONES[n]!;
  if (n < 100) return `${TENS[Math.floor(n / 10)]}${n % 10 === 0 ? "" : ` ${ONES[n % 10]}`}`;
  return `${ONES[Math.floor(n / 100)]} hundred${n % 100 === 0 ? "" : ` ${numberWord(n % 100)}`}`;
}

/** The numbers a claim may say aloud, as words, smallest first: the sizes of the numbers in the expressions it names and in its own values. */
export const numbersOf = (claim: Claim, expressions: Readonly<Record<string, Expr>>): string[] => [...claimNumbers(claim, expressions)].sort((a, b) => a - b).map(numberWord);

const say = (expressions: Readonly<Record<string, Expr>>, locale: string, id: string): string => (expressions[id] ? spokenLabel(expressions[id]!, locale) : id);
const list = (items: readonly string[]): string => (items.length <= 1 ? items.join("") : `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`);

/**
 * What a claim states, in plain words, for the scriptwriter to put in its own: a concept claim's record text as it is written (with its placeholders), and for
 * the claims code derives (a worked solution, a practice answer) a description built from the claim itself. The model is told what the claim means; it is
 * never asked to work it out, and the verifier has already proved it.
 */
export function claimMeaning(claim: Claim, record: ContentRecord | undefined, expressions: Readonly<Record<string, Expr>>, locale: string): string {
  if (record?.kind === "conceptClaim") return record.text;
  switch (claim.kind) {
    case "equivalent":
      return `{expr:${claim.a}} and {expr:${claim.b}} are the same equation written two ways`;
    case "roots":
      return `the roots of {expr:${claim.equation}} are ${list(claim.values.map((v) => spokenLabel(v, locale)))}`;
    case "sum-of-roots":
      return `the roots of {expr:${claim.equation}} add up to the number on the right of {expr:${claim.equals}}`;
    case "product-of-roots":
      return `the roots of {expr:${claim.equation}} multiply to the number on the right of {expr:${claim.equals}}`;
    case "satisfied-by":
      return `putting ${spokenLabel(claim.value, locale)} in for the unknown of {expr:${claim.equation}} gives {expr:${claim.instance}}, which is true`;
    case "statement":
      return record?.text ?? "a stated fact";
  }
}

/** How the placeholders of a claim will sound, so the model does not read a formula out a second time in words. */
export const placeholderReadings = (ids: readonly string[], expressions: Readonly<Record<string, Expr>>, locale: string): Record<string, string> => Object.fromEntries(ids.map((id) => [id, say(expressions, locale, id)]));
