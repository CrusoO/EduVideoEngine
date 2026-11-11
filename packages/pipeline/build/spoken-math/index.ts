/**
 * Spoken maths for Hindi and Nepali (ADR 0106). A deterministic normaliser: every digit, sign and maths symbol of a sentence is written out as words before any
 * text-to-speech engine sees it, because a vendor's own normaliser cannot be trusted with an equation. Pure: no model, no network, no clock. The wording is data
 * (lexicon.json, edited by a reviewer); this file only decides which entry applies and where.
 *
 * Registers: "ncert" is textbook Hindi (numbers, signs and units in Hindi words); "hinglish" is the Hindi sentence with English maths words, as taught in
 * classrooms ("x square", "three by four"). Nepali has one register of its own. A Nepali entry with no reviewed wording prints a visible NE_TODO_<id> marker
 * (and is listed in `pending`) instead of a guess.
 */
import lexiconJson from "./lexicon.json";

export type SpokenLanguage = "hi" | "ne";
export type SpokenRegister = "hinglish" | "ncert";

export type SpokenMathOptions = {
  language: SpokenLanguage;
  register: SpokenRegister;
  /** Silence after each equation, in the engine's pause-marker form `[pause 0.6s]` (ADR 0096, 0097). Default 600; 0 turns it off; clamped to 200..3000. */
  pauseMs?: number;
  /** "latin" (default) keeps the English maths words of the hinglish register in Latin letters; "devanagari" writes them in Devanagari for a voice that cannot read Latin script. */
  englishScript?: "latin" | "devanagari";
  /** Hinglish only. "english" (default) reads 0 to 10 in English like the worked examples (minus five, three by four); "hindi" reads 0 to 10 in Hindi words. */
  smallNumbers?: "english" | "hindi";
};

export type LexiconUse = { id: string; written: string; spoken: string; needsNativeCheck: boolean };
export type SpokenMathResult = {
  text: string;
  /** Lexicon entries this sentence used (one row each). */
  terms: LexiconUse[];
  /** Nepali entries with no wording yet: their NE_TODO_ markers are in `text`. Never release a sentence with a non-empty list. */
  pending: string[];
  equations: number;
  /** The pause the markers in `text` ask for (0 when none). */
  pauseMs: number;
};

type Entry = { id: string; category: string; written: string; hinglish: string; ncert: string; ne: string | null; neSuggestion?: string; needsNativeCheck: { hi: boolean; ne: boolean }; note?: string };
type IndicTable = { needsNativeCheck: boolean; ones: string[]; hundred: string; thousand: string; lakh: string; crore: string };
type Lexicon = {
  numbers: { hi: IndicTable; ne: IndicTable; en: { ones: string[]; tens: string[]; hundred: string; thousand: string; lakh: string; crore: string } };
  ordinals: { hi: { needsNativeCheck: boolean; first: string[]; suffix: string }; ne: { needsNativeCheck: boolean; first: string[]; suffix: string } };
  months: { en: string[]; hi: { needsNativeCheck: boolean; names: string[] }; ne: { needsNativeCheck: boolean; names: string[] } };
  letters: { hi: { needsNativeCheck: boolean; names: Record<string, string> }; ne: { needsNativeCheck: boolean; names: Record<string, string> } };
  chemistry: { elements: string[]; knownWithoutDigits: string[]; knownSingleElementWithDigits: string[] };
  translit: { words: Record<string, string> };
  entries: Entry[];
};
export const SPOKEN_LEXICON = lexiconJson as unknown as Lexicon;

const BY_ID = new Map(SPOKEN_LEXICON.entries.map((e) => [e.id, e] as const));
const TERMS = new Map(SPOKEN_LEXICON.entries.filter((e) => e.category === "term").map((e) => [e.written.toLowerCase(), e] as const));
const UNIT_ENTRIES = SPOKEN_LEXICON.entries.filter((e) => e.category === "unit" && /^unit\.[A-Za-z]+$/.test(e.id) && !["unit.degC", "unit.degF", "unit.rupee", "unit.per", "unit.sq", "unit.cu"].includes(e.id));
const UNIT_BY_SYMBOL = new Map(UNIT_ENTRIES.map((e) => [e.written, e] as const));
const ELEMENTS = new Set(SPOKEN_LEXICON.chemistry.elements);
const KNOWN_PLAIN = new Set(SPOKEN_LEXICON.chemistry.knownWithoutDigits);
const KNOWN_SINGLE = new Set(SPOKEN_LEXICON.chemistry.knownSingleElementWithDigits);

const esc = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const UNIT_ATOM = [...UNIT_BY_SYMBOL.keys()].sort((a, b) => b.length - a.length).map(esc).join("|");
const UNIT_EXPR = String.raw`(${UNIT_ATOM}|Ω)(\^[23])?(?:\/(${UNIT_ATOM}|Ω)(\^[23])?)?(?![A-Za-z0-9_])`;
const SUFFIX_RE = new RegExp(String.raw`[ ]?(?:(%)|(°[ ]?[CF])(?![A-Za-z])|${UNIT_EXPR})`, "y");
const MONTH_WORDS = [...SPOKEN_LEXICON.months.en, ...SPOKEN_LEXICON.months.hi.names, ...SPOKEN_LEXICON.months.ne.names].map(esc).join("|");
const YEAR_CONTEXT = new RegExp(String.raw`(?:सन्|सन|साल|वर्ष|year|in|since|from|until|AD|CE|${MONTH_WORDS})\s*$`, "i");

const YEAR_AFTER = /^\s*(?:में|ई\.|AD|CE|BC|BCE)/;
const DATE_DMY = /(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})(?!\d)/y;
const DATE_ISO = /(\d{4})-(\d{1,2})-(\d{1,2})(?!\d)/y;
const MIXED = /(\d+) +(\d+)\/(\d+)(?![\d/])/y;
const FRAC = /(\d+)\/(\d+)(?![\d/])/y;
const ORDINAL = /(\d+)(?:st|nd|rd|th)(?![A-Za-z])/y;
const NUMBER = /\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d{1,2}(?:,\d{2})+,\d{3}(?:\.\d+)?|\d+(?:\.\d+)?/y;
const POWER = /\^[ ]?(?:(-?\d+(?:\.\d+)?)|([A-Za-z])(?![A-Za-z])|\(([^()]*)\)|\{([^{}]*)\})/y;
const SUBSCRIPT = /_(?:(\d+)|\{([^{}]*)\})/y;
const FORMULA = /(?:[A-Z][a-z]?\d*)+(?![A-Za-z0-9])/y;
const LATIN_WORD = /[A-Za-z]+/y;

const GREEK: Record<string, string> = { π: "sym.pi", α: "sym.alpha", β: "sym.beta", θ: "sym.theta", Δ: "sym.delta", λ: "sym.lambda", μ: "sym.mu", ω: "sym.omega" };
const STOPWORDS = new Set(["of", "in", "is", "if", "or", "to", "at", "on", "as", "by", "an", "no", "so", "and", "the", "for", "are", "was", "not", "can", "has", "all", "any", "but", "you", "how", "why", "who", "now", "one", "two", "six", "ten"]);
const SUPERSCRIPTS: Record<string, string> = { "⁰": "0", "¹": "1", "²": "2", "³": "3", "⁴": "4", "⁵": "5", "⁶": "6", "⁷": "7", "⁸": "8", "⁹": "9", "⁻": "-" };
const SUBSCRIPTS = "₀₁₂₃₄₅₆₇₈₉";
const VULGAR: Record<string, string> = { "½": "1/2", "¼": "1/4", "¾": "3/4", "⅓": "1/3", "⅔": "2/3", "⅕": "1/5", "⅛": "1/8" };

/** Everything that is not a sentence's own words becomes plain ASCII digits and signs first, so the scanner has one spelling of each thing to look for. */
function prepare(text: string): string {
  return text
    .replace(/[०-९]/g, (d) => String(d.charCodeAt(0) - 0x0966))
    .replace(/[₀-₉]/g, (d) => String(SUBSCRIPTS.indexOf(d)))
    .replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹⁻]+/g, (run) => "^" + [...run].map((c) => SUPERSCRIPTS[c] ?? c).join(""))
    .replace(/(\d)([½¼¾⅓⅔⅕⅛])/g, (_m, d: string, f: string) => `${d} ${VULGAR[f]}`)
    .replace(/[½¼¾⅓⅔⅕⅛]/g, (f) => VULGAR[f]!)
    .replace(/−/g, "-")
    .replace(/ /g, " ")
    .replace(/<=/g, "≤")
    .replace(/>=/g, "≥")
    .replace(/!=/g, "≠");
}

type Tok = { s: string; math: boolean; eq?: boolean };

class Speaker {
  readonly used = new Map<string, LexiconUse>();
  readonly pending = new Set<string>();
  equations = 0;
  constructor(readonly o: Required<SpokenMathOptions>) {}

  private get deva(): boolean {
    return this.o.language === "hi" && this.o.register === "hinglish" && this.o.englishScript === "devanagari";
  }
  private note(id: string, written: string, spoken: string, flag: boolean): void {
    if (!this.used.has(id)) this.used.set(id, { id, written, spoken, needsNativeCheck: flag });
  }
  /** English words of a template to Devanagari (placeholders such as {x} are left alone). */
  private toDeva(t: string): string {
    return t.replace(/\{[a-z]\}|[A-Za-z]+/g, (w) => (w.startsWith("{") ? w : SPOKEN_LEXICON.translit.words[w] ?? SPOKEN_LEXICON.translit.words[w.toLowerCase()] ?? w));
  }
  /** One lexicon entry, in the language and register asked for, with {placeholders} filled. */
  say(id: string, vars: Record<string, string> = {}): string {
    const e = BY_ID.get(id);
    if (!e) throw new Error(`no lexicon entry ${id}`);
    let t: string;
    if (this.o.language === "ne") {
      if (e.ne === null) {
        this.pending.add(id);
        t = `NE_TODO_${id.replace(/\./g, "_")}`;
      } else t = e.ne;
    } else t = this.o.register === "ncert" ? e.ncert : e.hinglish;
    if (this.deva) t = this.toDeva(t);
    this.note(id, e.written, t, this.o.language === "ne" ? e.needsNativeCheck.ne : e.needsNativeCheck.hi);
    return t.replace(/\{([a-z])\}/g, (_m, k: string) => vars[k] ?? "");
  }

  // ---- numbers -------------------------------------------------------------------------------------------------------------------------------------------
  private indic(n: number, t: IndicTable): string {
    if (n === 0) return t.ones[0]!;
    const parts: string[] = [];
    const crore = Math.floor(n / 1e7);
    const lakh = Math.floor(n / 1e5) % 100;
    const thousand = Math.floor(n / 1e3) % 100;
    const hundred = Math.floor(n / 100) % 10;
    const rest = n % 100;
    if (crore) parts.push(`${this.indic(crore, t)} ${t.crore}`);
    if (lakh) parts.push(`${t.ones[lakh]} ${t.lakh}`);
    if (thousand) parts.push(`${t.ones[thousand]} ${t.thousand}`);
    if (hundred) parts.push(`${t.ones[hundred]} ${t.hundred}`);
    if (rest) parts.push(t.ones[rest]!);
    return parts.join(" ");
  }
  private english(n: number): string {
    const e = SPOKEN_LEXICON.numbers.en;
    const below100 = (r: number): string => (r < 20 ? e.ones[r]! : `${e.tens[Math.floor(r / 10)]}${r % 10 ? ` ${e.ones[r % 10]}` : ""}`);
    if (n === 0) return e.ones[0]!;
    const parts: string[] = [];
    const crore = Math.floor(n / 1e7);
    const lakh = Math.floor(n / 1e5) % 100;
    const thousand = Math.floor(n / 1e3) % 100;
    const hundred = Math.floor(n / 100) % 10;
    const rest = n % 100;
    if (crore) parts.push(`${this.english(crore)} ${e.crore}`);
    if (lakh) parts.push(`${below100(lakh)} ${e.lakh}`);
    if (thousand) parts.push(`${below100(thousand)} ${e.thousand}`);
    if (hundred) parts.push(`${e.ones[hundred]} ${e.hundred}`);
    if (rest) parts.push(below100(rest));
    return parts.join(" ");
  }
  /** A whole number, in digits only, as words. Long or zero-led strings are read digit by digit (an id, a code), never as a quantity. */
  words(digits: string): string {
    this.note(`numbers.${this.o.language}`, "0-9", "(number words)", this.o.language === "ne");
    if ((digits.length > 1 && digits.startsWith("0")) || digits.length > 10) return [...digits].map((d) => this.words(d)).join(" ");
    const n = Number(digits);
    if (this.o.language === "ne") return this.indic(n, SPOKEN_LEXICON.numbers.ne);
    if (this.o.register === "ncert" || (this.o.smallNumbers === "hindi" && n <= 10)) return this.indic(n, SPOKEN_LEXICON.numbers.hi);
    const w = this.english(n);
    return this.deva ? this.toDeva(w) : w;
  }
  private decimal(text: string): string {
    const [i, f] = text.split(".") as [string, string];
    return `${this.words(i)} ${this.say("decimal.point")} ${[...f].map((d) => this.words(d)).join(" ")}`;
  }
  private number(text: string): string {
    const t = text.replace(/,/g, "");
    return t.includes(".") ? this.decimal(t) : this.words(t);
  }
  /** A year, spoken the way years are: nineteen forty seven, or उन्नीस सौ सैंतालीस. Outside 1100 to 2999 it is an ordinary number. */
  private year(y: number): string {
    const s = String(y);
    if (y < 1100 || y > 2999) return this.words(s);
    const hi = Math.floor(y / 100);
    const lo = y % 100;
    if (y >= 2000 && y <= 2099) return lo === 0 ? this.thousandWord(2) : `${this.thousandWord(2)} ${this.words(String(lo))}`;
    const tbl = this.o.language === "ne" ? SPOKEN_LEXICON.numbers.ne : this.o.register === "ncert" ? SPOKEN_LEXICON.numbers.hi : null;
    if (tbl) return lo === 0 ? `${tbl.ones[hi]} ${tbl.hundred}` : `${tbl.ones[hi]} ${tbl.hundred} ${tbl.ones[lo]}`;
    // hinglish: nineteen forty seven, nineteen hundred
    const head = this.words(String(hi));
    return lo === 0 ? `${head} ${this.deva ? this.toDeva("hundred") : "hundred"}` : `${head} ${this.words(String(lo))}`;
  }
  /** "two thousand" in the current language (the head of 2000 to 2099). */
  private thousandWord(n: number): string {
    return `${this.words(String(n))} ${this.o.language === "ne" ? SPOKEN_LEXICON.numbers.ne.thousand : this.o.register === "ncert" ? SPOKEN_LEXICON.numbers.hi.thousand : this.deva ? this.toDeva("thousand") : "thousand"}`;
  }
  private ordinal(n: number): string {
    this.note(`ordinals.${this.o.language}`, "1st", "(ordinal words)", true);
    if (this.o.language === "ne" || this.o.register === "ncert") {
      const t = this.o.language === "ne" ? SPOKEN_LEXICON.ordinals.ne : SPOKEN_LEXICON.ordinals.hi;
      return n >= 1 && n <= 10 ? t.first[n]! : `${this.words(String(n))}${t.suffix}`;
    }
    if (n >= 100000) return this.words(String(n));
    const irregular: Record<string, string> = { one: "first", two: "second", three: "third", five: "fifth", eight: "eighth", nine: "ninth", twelve: "twelfth" };
    const ws = this.english(n).split(" ");
    const last = ws.pop()!;
    ws.push(irregular[last] ?? (last.endsWith("y") ? `${last.slice(0, -1)}ieth` : `${last}th`));
    const out = ws.join(" ");
    return this.deva ? this.toDeva(out) : out;
  }
  private monthName(m: number): string {
    this.note(`months.${this.o.language}`, "month", "(month names)", true);
    if (this.o.language === "ne") return SPOKEN_LEXICON.months.ne.names[m - 1]!;
    if (this.o.register === "ncert") return SPOKEN_LEXICON.months.hi.names[m - 1]!;
    const en = SPOKEN_LEXICON.months.en[m - 1]!;
    return this.deva ? this.toDeva(en) : en;
  }
  private letter(l: string): string {
    return (this.o.language === "ne" ? SPOKEN_LEXICON.letters.ne : SPOKEN_LEXICON.letters.hi).names[l.toUpperCase()] ?? l;
  }
  /** A formula such as H2O as letter names and number words, or null when the word is not a formula (every symbol must be a known element). */
  private formula(w: string): string | null {
    const parts = [...w.matchAll(/([A-Z][a-z]?)(\d*)/g)];
    if (parts.length === 0 || parts.map((p) => p[0]).join("") !== w) return null;
    const hasDigit = /\d/.test(w);
    const ok = parts.every((p) => ELEMENTS.has(p[1]!));
    if (!ok) return null;
    if (parts.length === 1 ? !KNOWN_SINGLE.has(w) : !hasDigit && !KNOWN_PLAIN.has(w)) return null;
    this.note("chemistry", w, "(letter names)", this.o.language === "ne");
    const out: string[] = [];
    for (const [, sym, num] of parts) {
      for (const ch of sym!) out.push(this.letter(ch));
      if (num) out.push(this.toDeva(this.english(Number(num))));
    }
    return out.join(" ");
  }

  // ---- the scanner ---------------------------------------------------------------------------------------------------------------------------------------
  private applyPower(base: string, exp: string, grouped = false): string {
    const e = exp.trim();
    if (e === "2") return this.say("power.square", { x: base });
    if (e === "3") return this.say("power.cube", { x: base });
    return this.say("power.n", { x: base, n: grouped && this.isMathGroup(e) ? this.group(e) : this.inline(e) });
  }
  /** Text inside a bracket, an exponent or a root, read as maths. */
  private inline(src: string): string {
    return join(this.scan(src));
  }
  private matchParen(src: string, open: number): number {
    let depth = 0;
    for (let i = open; i < src.length; i++) {
      if (src[i] === "(") depth++;
      else if (src[i] === ")" && --depth === 0) return i;
    }
    return -1;
  }
  private isMathGroup(inner: string): boolean {
    return /[\d=+\-×÷*/^√<>≤≥≠±]/.test(inner) && !/[ऀ-ॿ]/.test(inner) && !/[A-Za-z]{3,}/.test(inner);
  }
  private group(inner: string): string {
    return `${this.say("bracket.open")} ${this.inline(inner)} ${this.say("bracket.close")}`;
  }
  /** What follows a number: a percent sign, a temperature, a unit. */
  private suffix(src: string, at: number): { s: string; end: number } | null {
    SUFFIX_RE.lastIndex = at;
    const m = SUFFIX_RE.exec(src);
    if (!m) return null;
    if (m[1]) return { s: this.say("percent"), end: SUFFIX_RE.lastIndex };
    if (m[2]) return { s: this.say(m[2].endsWith("C") ? "unit.degC" : "unit.degF"), end: SUFFIX_RE.lastIndex };
    const atom = (sym: string, exp: string | undefined): string => {
      const e = UNIT_BY_SYMBOL.get(sym) ?? (sym === "Ω" ? BY_ID.get("unit.ohm") : undefined)!;
      const word = this.say(e.id);
      return exp === "^2" ? this.say("unit.sq", { u: word }) : exp === "^3" ? this.say("unit.cu", { u: word }) : word;
    };
    const first = atom(m[3]!, m[4]);
    return { s: m[5] ? this.say("unit.per", { a: first, b: atom(m[5], m[6]) }) : first, end: SUFFIX_RE.lastIndex };
  }

  /** A number at `pos` with everything that can belong to it: date, mixed number, fraction, ordinal, range, power, percent, unit. */
  private numeric(src: string, pos: number): { s: string; end: number } | null {
    const at = (re: RegExp): RegExpExecArray | null => {
      re.lastIndex = pos;
      return re.exec(src);
    };
    const withSuffix = (s: string, end: number): { s: string; end: number } => {
      const sf = this.suffix(src, end);
      return sf ? { s: `${s} ${sf.s}`, end: sf.end } : { s, end };
    };
    let m = at(DATE_DMY) ?? at(DATE_ISO);
    if (m) {
      const iso = m[1]!.length === 4;
      const [d, mo, y] = iso ? [Number(m[3]), Number(m[2]), Number(m[1])] : [Number(m[1]), Number(m[2]), Number(m[3])];
      if (d >= 1 && d <= 31 && mo >= 1 && mo <= 12) return { s: `${this.words(String(d))} ${this.monthName(mo)} ${this.year(y)}`, end: m.index + m[0].length };
    }
    if ((m = at(MIXED))) return withSuffix(this.say("mixed", { w: this.words(m[1]!), f: this.say("frac", { n: this.words(m[2]!), d: this.words(m[3]!) }) }), m.index + m[0].length);
    if ((m = at(FRAC))) return withSuffix(this.say("frac", { n: this.words(m[1]!), d: this.words(m[2]!) }), m.index + m[0].length);
    if ((m = at(ORDINAL))) return { s: this.ordinal(Number(m[1])), end: m.index + m[0].length };
    m = at(NUMBER);
    if (!m) return null;
    let end = m.index + m[0].length;
    const raw = m[0];
    let s: string;
    const isPlainInt = /^\d+$/.test(raw);
    // a year: four digits after a month name, "in", "सन्" and the like
    if (isPlainInt && raw.length === 4 && Number(raw) >= 1100 && Number(raw) <= 2999 && (YEAR_CONTEXT.test(src.slice(Math.max(0, pos - 24), pos)) || YEAR_AFTER.test(src.slice(end)))) return { s: this.year(Number(raw)), end };
    // a power: 10^5, 2^n
    POWER.lastIndex = end;
    const pw = POWER.exec(src);
    if (pw && pw.index === end) {
      const after = POWER.lastIndex;
      s = this.applyPower(this.number(raw), pw[1] ?? pw[2] ?? pw[3] ?? pw[4]!, pw[3] !== undefined);
      return withSuffix(s, after);
    }
    s = this.number(raw);
    // a range: 10-20 (an en dash always; a hyphen only when the rest of the sentence is not an equation and a word or the end follows)
    const rest = src.slice(end);
    const clause = src.slice(Math.max(src.lastIndexOf(";", pos), src.lastIndexOf("।", pos), -1) + 1, Math.min(...[src.indexOf(";", end), src.indexOf("।", end)].map((x) => (x < 0 ? src.length : x))));
    const rg = /^( ?– ?|-)(\d+(?:\.\d+)?)/.exec(rest);
    if (rg) {
      const afterRange = rest.slice(rg[0].length);
      const isRange = rg[1]!.includes("–") || (!/[=<>≤≥≠≈]/.test(clause) && (afterRange === "" || /^ ?[A-Za-z%°ऀ-ॿ]/.test(afterRange)));
      if (isRange) {
        end += rg[0].length;
        s = this.say("range", { a: s, b: this.number(rg[2]!) });
      }
    }
    return withSuffix(s, end);
  }

  scan(src: string): Tok[] {
    const out: Tok[] = [];
    const raw = (s: string): void => {
      out.push({ s, math: false });
    };
    const math = (s: string, eq = false): void => {
      out.push({ s, math: true, eq });
    };
    let i = 0;
    while (i < src.length) {
      const c = src[i]!;
      if (/\d/.test(c)) {
        const r = this.numeric(src, i);
        if (r) {
          math(r.s);
          i = r.end;
          continue;
        }
      }
      if (c === "₹") {
        NUMBER.lastIndex = i + 1 + (src[i + 1] === " " ? 1 : 0);
        const m = NUMBER.exec(src);
        if (m && m.index === NUMBER.lastIndex - m[0].length) {
          math(`${this.number(m[0])} ${this.say("unit.rupee")}`);
          i = NUMBER.lastIndex;
          continue;
        }
      }
      if (c === "(") {
        const close = this.matchParen(src, i);
        if (close > 0 && this.isMathGroup(src.slice(i + 1, close))) {
          let s = this.group(src.slice(i + 1, close));
          let end = close + 1;
          POWER.lastIndex = end;
          const pw = POWER.exec(src);
          if (pw && pw.index === end) {
            const after = POWER.lastIndex;
            s = this.applyPower(s, pw[1] ?? pw[2] ?? pw[3] ?? pw[4]!, pw[3] !== undefined);
            end = after;
          }
          math(s);
          i = end;
          continue;
        }
      }
      if (c === "√" || c === "∛") {
        const id = c === "√" ? "root.square" : "root.cube";
        const r = this.rootOperand(src, i + 1);
        if (r) {
          math(this.say(id, { x: r.s }));
          i = r.end;
          continue;
        }
      }
      if (/[A-Za-z]/.test(c)) {
        const r = this.latin(src, i);
        for (const t of r.toks) out.push(t);
        i = r.end;
        continue;
      }
      const op = this.operator(src, i);
      if (op) {
        math(op.s, op.eq);
        i = op.end;
        continue;
      }
      raw(c);
      i++;
    }
    return out;
  }

  private rootOperand(src: string, at: number): { s: string; end: number } | null {
    if (src[at] === "(") {
      const close = this.matchParen(src, at);
      return close > 0 ? { s: this.group(src.slice(at + 1, close)), end: close + 1 } : null;
    }
    NUMBER.lastIndex = at;
    const m = NUMBER.exec(src);
    if (m && m.index === at) return { s: this.number(m[0]), end: at + m[0].length };
    if (/[A-Za-z]/.test(src[at] ?? "") && !/[A-Za-z]/.test(src[at + 1] ?? "")) return { s: this.variable(src[at]!), end: at + 1 };
    return null;
  }
  private variable(l: string): string {
    return this.deva ? this.letter(l) : l;
  }

  private latin(src: string, i: number): { toks: Tok[]; end: number } {
    const here = (re: RegExp): RegExpExecArray | null => {
      re.lastIndex = i;
      return re.exec(src);
    };
    const fm = here(FORMULA);
    if (fm) {
      const f = this.formula(fm[0]);
      if (f !== null) return { toks: [{ s: f, math: false }], end: i + fm[0].length };
    }
    const w = here(LATIN_WORD)![0];
    let end = i + w.length;
    if (/^(?:sqrt|cbrt)$/.test(w) && src[end] === "(") {
      const close = this.matchParen(src, end);
      if (close > 0) return { toks: [{ s: this.say(w === "sqrt" ? "root.square" : "root.cube", { x: this.group(src.slice(end + 1, close)) }), math: true }], end: close + 1 };
    }
    // a term: whole word, lexicon decides the form
    const term = TERMS.get(w.toLowerCase());
    if (term && (w === term.written || w.toLowerCase() === term.written.toLowerCase())) {
      const ne = this.o.language === "ne";
      const spoken = ne ? term.ne : this.o.register === "ncert" ? term.ncert : this.deva ? term.hinglish : w;
      this.note(term.id, term.written, spoken ?? w, ne ? term.needsNativeCheck.ne : term.needsNativeCheck.hi);
      return { toks: [{ s: spoken ?? w, math: false }], end };
    }
    // letters multiplied together (bx, ac, 4ac): each letter is a variable
    const nearBefore = /[+\-=×÷*/(<>≤≥≠≈]\s*$|\d$/.test(src.slice(Math.max(0, i - 3), i));
    const nearAfter = /^\s*[+\-=×÷*/)<>≤≥≠≈]/.test(src.slice(end, end + 3));
    if (/^[a-z]{2,3}$/.test(w) && !STOPWORDS.has(w) && (nearBefore || nearAfter)) return { toks: [...w].map((l) => ({ s: this.variable(l), math: true })), end };
    // a variable with an exponent or a subscript: the last letter is the base (xy^2 is x then y^2)
    const last = w[w.length - 1]!;
    const prefix = w.slice(0, -1);
    const prefixToks = (): Tok[] => (prefix.length <= 3 && /^[a-z]+$/.test(prefix) ? [...prefix].map((l) => ({ s: this.variable(l), math: true })) : prefix ? [{ s: prefix, math: false }] : []);
    const tail = (re: RegExp): RegExpExecArray | null => {
      re.lastIndex = end;
      const m = re.exec(src);
      return m && m.index === end ? m : null;
    };
    const pw = tail(POWER);
    const powerEnd = POWER.lastIndex;
    if (pw) {
      const toks: Tok[] = prefixToks();
      toks.push({ s: this.applyPower(this.variable(last), pw[1] ?? pw[2] ?? pw[3] ?? pw[4]!), math: true });
      return { toks, end: powerEnd };
    }
    const sb = tail(SUBSCRIPT);
    const subEnd = SUBSCRIPT.lastIndex;
    if (sb) {
      const toks: Tok[] = prefixToks();
      toks.push({ s: this.say("sub", { x: this.variable(last), n: this.inline(sb[1] ?? sb[2]!) }), math: true });
      return { toks, end: subEnd };
    }
    if (w.length === 1) return { toks: [{ s: this.variable(w), math: true }], end };
    // x2 and 2x written together: leave a word with digits as it is
    end = i + w.length;
    return { toks: [{ s: w, math: false }], end };
  }

  private operator(src: string, i: number): { s: string; end: number; eq: boolean } | null {
    const c = src[i]!;
    const prev = src[i - 1];
    const next = src[i + 1];
    const startish = i === 0 || /[\s(=+\-×*÷/<>≤≥≠≈,;:^±·]/.test(prev!);
    const unary = startish && next !== undefined && !/\s/.test(next) && /[\dA-Za-z(√∛.]/.test(next);
    const simple: Record<string, [string, boolean]> = { "=": ["op.equals", true], "×": ["op.times", false], "*": ["op.times", false], "·": ["op.times", false], "÷": ["op.divide", false], "<": ["op.lt", true], ">": ["op.gt", true], "≤": ["op.le", true], "≥": ["op.ge", true], "≠": ["op.ne", true], "≈": ["op.approx", true], "±": ["op.plusminus", false] };
    const hit = simple[c];
    if (hit) return { s: this.say(hit[0]), end: i + 1, eq: hit[1] };
    if (c === "→") return { s: this.say("op.arrow"), end: i + 1, eq: false };
    const greek = GREEK[c];
    if (greek) return { s: this.say(greek), end: i + 1, eq: false };
    if (c === "%") return { s: this.say("percent"), end: i + 1, eq: false };
    if (c === "+") return { s: this.say(unary ? "sign.plus" : "op.plus"), end: i + 1, eq: false };
    if (c === "-") {
      if (unary) return { s: this.say("sign.minus"), end: i + 1, eq: false };
      const before = /([A-Za-z]+)\s*$/.exec(src.slice(0, i))?.[1] ?? "";
      const after = /^\s*([A-Za-z]+)/.exec(src.slice(i + 1))?.[1] ?? "";
      const operandBefore = /[\dA-Za-z)]\s*$/.test(src.slice(0, i));
      const operandAfter = /^\s*[\dA-Za-z(√∛]/.test(src.slice(i + 1));
      if (operandBefore && operandAfter && !(before.length >= 2 && after.length >= 2)) return { s: this.say("op.minus"), end: i + 1, eq: false };
      return null;
    }
    if (c === "/") {
      const before = /([A-Za-z]+)$/.exec(src.slice(0, i))?.[1] ?? "";
      const after = /^([A-Za-z]+)/.exec(src.slice(i + 1))?.[1] ?? "";
      if ((before.length >= 2 && after.length >= 2) || (/[ऀ-ॿ]/.test(prev ?? "") && /[ऀ-ॿ]/.test(next ?? ""))) return { s: " ", end: i + 1, eq: false };
      return { s: this.say("op.slash"), end: i + 1, eq: false };
    }
    return null;
  }
}

/** Pieces to one string: a maths piece gets a space either side unless a quote, bracket or punctuation of the sentence already touches it; spaces are tidied around punctuation. */
function join(toks: readonly Tok[]): string {
  let out = "";
  toks.forEach((t, k) => {
    if (!t.math) {
      out += t.s;
      return;
    }
    const before = out.slice(-1);
    const after = toks[k + 1]?.s.slice(0, 1) ?? "";
    out += (before === "" || /[\s("“‘[]/.test(before) ? "" : " ") + t.s + (after === "" || /[\s)"”’\],.;:!?।]/.test(after) ? "" : " ");
  });
  return out
    .replace(/[ 	]+/g, " ")
    .replace(/ ([,.;:!?।)])/g, "$1")
    .replace(/\( /g, "(")
    .trim();
}

export const PAUSE_BOUNDS = { min: 200, max: 3000, default: 600 } as const;
const markerFor = (ms: number): string => `[pause ${Number((ms / 1000).toFixed(3))}s]`;

/** The detailed form: the spoken text and what the reviewer and the voice step need to know about it. */
export function spokenMathDetailed(text: string, options: SpokenMathOptions): SpokenMathResult {
  const pauseOpt = options.pauseMs ?? PAUSE_BOUNDS.default;
  const pause = pauseOpt <= 0 ? 0 : Math.min(PAUSE_BOUNDS.max, Math.max(PAUSE_BOUNDS.min, Math.round(pauseOpt)));
  const sp = new Speaker({ language: options.language, register: options.register, pauseMs: pause, englishScript: options.englishScript ?? "latin", smallNumbers: options.smallNumbers ?? "english" });
  const toks = sp.scan(prepare(text));
  // an equation is a run of maths pieces (spaces allowed between) that holds an = or another relation; the pause marker goes right after it
  const inserts: number[] = [];
  let lastMath = -1;
  let hasEq = false;
  const close = (): void => {
    if (lastMath >= 0 && hasEq) inserts.push(lastMath);
    lastMath = -1;
    hasEq = false;
  };
  toks.forEach((t, k) => {
    if (t.math) {
      lastMath = k;
      hasEq ||= !!t.eq;
    } else if (!/^\s*$/.test(t.s)) close();
  });
  close();
  sp.equations = inserts.length;
  if (pause > 0) for (const at of inserts.reverse()) toks.splice(at + 1, 0, { s: ` ${markerFor(pause)}`, math: false });
  return { text: join(toks), terms: [...sp.used.values()], pending: [...sp.pending], equations: sp.equations, pauseMs: pause > 0 && sp.equations > 0 ? pause : 0 };
}

/** The sentence with every digit and maths symbol written out as words, and a `[pause 0.6s]` marker after each equation. */
export function spokenMath(text: string, options: SpokenMathOptions): string {
  return spokenMathDetailed(text, options).text;
}

const MARKER = /\s*\[pause(?:\s+(\d+(?:\.\d+)?)s)?\]/gi;
/** Takes the pause markers out of a spoken sentence and returns the longest of them: the voice step has no mid-sentence pause (ADR 0097), so it adds that silence after the sentence. */
export function splitPauseMarkers(text: string): { text: string; pauseMs: number } {
  let pauseMs = 0;
  const clean = text.replace(MARKER, (_m, s: string | undefined) => {
    pauseMs = Math.max(pauseMs, Math.round(Number(s ?? PAUSE_BOUNDS.default / 1000) * 1000));
    return "";
  });
  return { text: clean.replace(/[ \t]+/g, " ").replace(/ ([,.;:!?।])/g, "$1").trim(), pauseMs };
}

/** What the voice step uses: the spoken sentence without markers, and the silence the equations ask for after it. */
export function spokenMathForVoice(text: string, options: SpokenMathOptions): { text: string; extraPauseMs: number } {
  const { text: t, pauseMs } = splitPauseMarkers(spokenMath(text, options));
  return { text: t, extraPauseMs: pauseMs };
}

/** Lexicon entries still waiting for a native speaker: Nepali entries flagged needsNativeCheck, and Hindi entries the engineers proposed beyond the owner's table. */
export function pendingLexicon(): Array<{ language: "hi" | "ne"; id: string; category: string; written: string; current: string; suggestion?: string; note?: string }> {
  const rows: ReturnType<typeof pendingLexicon> = [];
  for (const e of SPOKEN_LEXICON.entries) {
    if (e.needsNativeCheck.ne) rows.push({ language: "ne", id: e.id, category: e.category, written: e.written, current: e.ne ?? "(NO WORDING YET)", ...(e.neSuggestion ? { suggestion: e.neSuggestion } : {}), ...(e.note ? { note: e.note } : {}) });
    if (e.needsNativeCheck.hi) rows.push({ language: "hi", id: e.id, category: e.category, written: e.written, current: `ncert: ${e.ncert} | hinglish: ${e.hinglish}`, ...(e.note ? { note: e.note } : {}) });
  }
  const t = SPOKEN_LEXICON.numbers;
  rows.push({ language: "ne", id: "numbers.ne", category: "numbers", written: "0-99, सय, हजार, लाख, करोड", current: `${t.ne.ones.length} words from memory` });
  rows.push({ language: "ne", id: "ordinals.ne", category: "ordinals", written: "1st..10th", current: SPOKEN_LEXICON.ordinals.ne.first.slice(1).join(" ") });
  rows.push({ language: "ne", id: "months.ne", category: "months", written: "month names", current: SPOKEN_LEXICON.months.ne.names.join(" ") });
  rows.push({ language: "ne", id: "letters.ne", category: "letters", written: "A-Z", current: Object.values(SPOKEN_LEXICON.letters.ne.names).join(" ") });
  rows.push({ language: "hi", id: "ordinals.hi", category: "ordinals", written: "1st..10th", current: SPOKEN_LEXICON.ordinals.hi.first.slice(1).join(" ") });
  rows.push({ language: "hi", id: "months.hi", category: "months", written: "month names", current: SPOKEN_LEXICON.months.hi.names.join(" ") });
  return rows;
}
