import type { Expr } from "./expr";
import { LOCALES } from "./locales";

/**
 * Expression tree -> spoken words. The third derivation from the one tree (screen: toLatex, checker: SymPy, voice: this),
 * so the voice, the equation on screen and the verifier cannot disagree. It follows the same grouping rules as the LaTeX
 * serializer: a bracket is spoken exactly where the tree would otherwise be ambiguous, never more.
 *
 * Vocabulary is per locale and carries a review status. A locale without a reviewed table REFUSES (never guesses, never
 * machine-translates and calls it approved): hi-IN and ne-NP wait for native reviewers.
 */
export type SpeechTable = {
  status: "reviewed" | "draft";
  plus: string;
  minus: string;
  times: string;
  over: string;
  equals: string;
  squared: string;
  cubed: string;
  toThePower: string;
  openBracket: string;
  closeBracket: string;
  theFraction: string;
  endFraction: string;
  sub: string;
  /** Integer 0..999,999,999 as words. */
  words(n: number): string;
};

const ONES = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen"];
const TENS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];
function below1000(n: number): string {
  const h = Math.floor(n / 100);
  const r = n % 100;
  const tail = r < 20 ? (r === 0 ? "" : ONES[r]!) : `${TENS[Math.floor(r / 10)]}${r % 10 ? ` ${ONES[r % 10]}` : ""}`;
  return [h ? `${ONES[h]} hundred` : "", tail].filter(Boolean).join(" ");
}
function englishWords(n: number): string {
  if (!Number.isInteger(n) || n < 0 || n > 999_999_999) throw new Error(`no words for ${n}`);
  if (n === 0) return "zero";
  const parts: string[] = [];
  for (const [size, name] of [[1_000_000, "million"], [1000, "thousand"], [1, ""]] as const) {
    const chunk = Math.floor(n / size) % 1000;
    if (chunk) parts.push(`${below1000(chunk)}${name ? ` ${name}` : ""}`);
  }
  return parts.join(" ");
}

export const SPEECH: Record<string, SpeechTable | undefined> = {
  "en-IN": {
    status: "reviewed",
    plus: "plus",
    minus: "minus",
    times: "times",
    over: "over",
    equals: "equals",
    squared: "squared",
    cubed: "cubed",
    toThePower: "to the power",
    openBracket: "open bracket",
    closeBracket: "close bracket",
    theFraction: "the fraction",
    endFraction: "end fraction",
    sub: "sub",
    words: englishWords,
  },
  // hi-IN and ne-NP: deliberately absent. Hindi number words are irregular up to 99 and the operator phrasing is a
  // curriculum choice; both need a named native reviewer (see docs/adr/0013). verbalise() refuses until they exist.
};

export class NoSpeechVocabulary extends Error {
  constructor(locale: string) {
    super(`no reviewed speech vocabulary for ${locale}: a native reviewer must approve one before this language is voiced`);
  }
}

export type VerbaliseOptions = {
  /** words: "five" (default, what a voice should read). numerals: "5" in the digit style of the locale. */
  numbers?: "words" | "numerals";
  /** Allow a draft table. Never set in production. */
  allowDraft?: boolean;
};

const DEVANAGARI_DIGITS = "०१२३४५६७८९";
const numeral = (n: number, locale: string): string => {
  const s = String(n);
  return LOCALES[locale]?.digits === "devanagari" ? [...s].map((c) => (/[0-9]/.test(c) ? DEVANAGARI_DIGITS[Number(c)]! : c)).join("") : s;
};

type Out = { s: string; p: number; atom: boolean; /** a fraction always spoken with its own brackets, for use as an operand of another fraction */ full?: string };
const P = { eq: 0, add: 1, neg: 1.5, mul: 2, pow: 3, atom: 4 } as const;

export function verbalise(expr: Expr, locale: string, opts: VerbaliseOptions = {}): string {
  const table = SPEECH[locale];
  if (!table || (table.status !== "reviewed" && !opts.allowDraft)) throw new NoSpeechVocabulary(locale);
  const t: SpeechTable = table;
  const asNumber = (n: number) => (opts.numbers === "numerals" ? numeral(n, locale) : t.words(n));
  const wrap = (o: Out, min: number) => (o.p >= min ? o.s : `${t.openBracket} ${o.s} ${t.closeBracket}`);

  function name(n: string): string {
    // x -> "x"; x_1 -> "x sub one"; abc -> "a b c"
    return n
      .split("_")
      .map((part) =>
        part
          .replace(/([A-Za-z])(?=[A-Za-z])/g, "$1 ")
          .replace(/([A-Za-z]?)([0-9]+)/g, (_m, l: string, d: string) => `${l ? `${l} ` : ""}${asNumber(Number(d))}`),
      )
      .join(` ${t.sub} `);
  }

  function go(e: Expr): Out {
    switch (e.op) {
      case "num": {
        const d = e.d ?? 1;
        const body = d === 1 ? asNumber(Math.abs(e.n)) : `${asNumber(Math.abs(e.n))} ${t.over} ${asNumber(d)}`;
        if (e.n < 0) return { s: `${t.minus} ${body}`, p: P.neg, atom: false };
        return { s: body, p: d === 1 ? P.atom : P.pow, atom: d === 1 };
      }
      case "sym":
        return { s: name(e.name), p: P.atom, atom: true };
      case "neg": {
        const a = go(e.a);
        return { s: `${t.minus} ${wrap(a, P.mul)}`, p: P.neg, atom: false };
      }
      case "add": {
        const a = go(e.a);
        const b = go(e.b);
        return { s: `${wrap(a, P.add)} ${t.plus} ${wrap(b, P.neg + 0.1)}`, p: P.add, atom: false };
      }
      case "sub": {
        const a = go(e.a);
        const b = go(e.b);
        return { s: `${wrap(a, P.add)} ${t.minus} ${wrap(b, P.mul)}`, p: P.add, atom: false };
      }
      case "mul": {
        const a = go(e.a);
        const b = go(e.b);
        // Juxtaposed in print (5x, ab, (x+1)(x-2)); a number on the right needs a spoken "times".
        const startsWithNumber = e.b.op === "num" || (e.b.op === "div" && e.b.a.op === "num");
        return { s: `${wrap(a, P.mul)} ${startsWithNumber ? `${t.times} ` : ""}${wrap(b, P.mul)}`, p: P.mul, atom: false };
      }
      case "div": {
        const a = go(e.a);
        const b = go(e.b);
        // A fraction inside a fraction is always spoken with its own brackets, or (a/b)/c and a/(b/c) would sound alike.
        const an = e.a.op === "div" ? (a.full ?? a.s) : a.s;
        const bn = e.b.op === "div" ? (b.full ?? b.s) : b.s;
        const full = `${t.theFraction} ${an} ${t.over} ${bn} ${t.endFraction}`;
        return { s: a.atom && b.atom ? `${a.s} ${t.over} ${b.s}` : full, full, p: P.pow, atom: false };
      }
      case "pow": {
        const a = go(e.a);
        const base = a.atom ? a.s : `${t.openBracket} ${a.s} ${t.closeBracket}`;
        const x = e.b;
        if (x.op === "num" && (x.d ?? 1) === 1 && x.n === 2) return { s: `${base} ${t.squared}`, p: P.pow, atom: false };
        if (x.op === "num" && (x.d ?? 1) === 1 && x.n === 3) return { s: `${base} ${t.cubed}`, p: P.pow, atom: false };
        const exp = go(x);
        const spoken = exp.atom || x.op === "num" ? exp.s : `${t.openBracket} ${exp.s} ${t.closeBracket}`;
        return { s: `${base} ${t.toThePower} ${spoken}`, p: P.pow, atom: false };
      }
      case "eq":
        return { s: `${go(e.a).s} ${t.equals} ${go(e.b).s}`, p: P.eq, atom: false };
    }
  }
  return go(expr).s;
}

/** A narration sentence as the voice reads it: every {expr:id} placeholder replaced by its spoken form. */
export function spokenText(text: string, expressions: Record<string, Expr>, locale: string, opts: VerbaliseOptions = {}): string {
  return text.replace(/\{expr:([^}]+)\}/g, (_m, id: string) => {
    const e = expressions[id];
    if (!e) throw new Error(`unknown expression ${id}`);
    return verbalise(e, locale, opts);
  });
}
