import type { Claim, Expr } from "@eve/schema";
import { claimExpressions } from "./helpers";

/**
 * G5 part (d): numbers written as words in a claim or link sentence must be numbers of the claim (ADR 0054). English only. Pure functions.
 *
 * What is a number word: zero, two to twenty, thirty to ninety, hundred, alone or in a compound ("twenty one", "twenty-one", "two hundred and five"), and
 * "minus" or "negative" straight before one. Whole words only, so "someone", "second", "often" and "tens" are not numbers. Ordinals (first, second, third) are not
 * number words. The word "one" is ignored when it stands alone (it is a pronoun as often as a number: "the last one"); it counts inside a compound.
 * The sign is not compared, only the size: "minus five" matches the 5 of `-5x`, which is a subtraction, not a negative number in the tree.
 */
const PLACEHOLDER = /\{expr:[A-Za-z0-9][A-Za-z0-9_.:-]*\}/g;
const UNITS: Record<string, number> = { zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9 };
const TEENS: Record<string, number> = { ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19 };
const TENS: Record<string, number> = { twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90 };
const SIGNS = new Set(["minus", "negative"]);

export type SpokenNumber = { words: string; value: number };

/** The value and length (in words) of the number that starts at `i`, below one hundred; undefined if none starts there. `one` alone is not a number here. */
function below100(words: string[], i: number): { value: number; length: number } | undefined {
  const w = words[i] ?? "";
  const tens = TENS[w];
  if (tens !== undefined) {
    const unit = UNITS[words[i + 1] ?? ""];
    return unit !== undefined && unit > 0 ? { value: tens + unit, length: 2 } : { value: tens, length: 1 };
  }
  const teen = TEENS[w];
  if (teen !== undefined) return { value: teen, length: 1 };
  const unit = UNITS[w];
  return unit !== undefined ? { value: unit, length: 1 } : undefined;
}

/** The number that starts at `i`: a compound with hundred, a number below one hundred, or `hundred` alone. `ignore` is a lone "one". */
function numberAt(words: string[], i: number): { value: number; length: number } | "ignore" | undefined {
  const w = words[i]!;
  const unit = UNITS[w];
  if (words[i + 1] === "hundred" && unit !== undefined && unit > 0) {
    let value = unit * 100;
    let length = 2;
    const joined = words[i + 2] === "and" ? 3 : 2;
    const tail = below100(words, i + joined);
    if (tail !== undefined && tail.value > 0) {
      value += tail.value;
      length = joined + tail.length;
    }
    return { value, length };
  }
  if (w === "hundred") return { value: 100, length: 1 };
  if (w === "one") return "ignore";
  return below100(words, i);
}

/** Every number written as words in the text, in order. Expression placeholders are not text. */
export function spokenNumbers(text: string): SpokenNumber[] {
  const words = text.replace(PLACEHOLDER, " ").toLowerCase().match(/[a-z]+/g) ?? [];
  const out: SpokenNumber[] = [];
  let i = 0;
  while (i < words.length) {
    const signed = SIGNS.has(words[i]!) && i + 1 < words.length;
    const at = signed ? i + 1 : i;
    const found = numberAt(words, at);
    if (found === undefined || found === "ignore") {
      i = found === "ignore" ? at + 1 : i + 1;
      continue;
    }
    out.push({ words: words.slice(i, at + found.length).join(" "), value: found.value });
    i = at + found.length;
  }
  return out;
}

/** The closed set of a claim: the sizes of the `num` nodes of the expressions it names, and of its own values (the roots it states, the value it puts back). */
export function claimNumbers(claim: Claim, expressions: Readonly<Record<string, Expr>>): Set<number> {
  const out = new Set<number>();
  const walk = (e: Expr | undefined): void => {
    if (e === undefined) return;
    if (e.op === "num") {
      out.add(Math.abs(e.n));
      if (e.d !== undefined) out.add(e.d);
    } else if (e.op === "neg") walk(e.a);
    else if (e.op !== "sym") {
      walk(e.a);
      walk(e.b);
    }
  };
  for (const id of claimExpressions(claim)) walk(expressions[id]);
  if (claim.kind === "roots") claim.values.forEach(walk);
  if (claim.kind === "satisfied-by") walk(claim.value);
  return out;
}
