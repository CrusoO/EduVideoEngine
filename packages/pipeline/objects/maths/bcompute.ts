import { EPS, type Pt } from "./compute";

/**
 * The numbers of every wave-6 maths figure (ADR 0113), as small pure functions with no drawing in them. Each is tested against a known value, an identity or a brute-force check
 * (`tests/objects-maths-b-compute.test.ts`); the drawers print only what these return, and the read-back recomputes the same quantities from the drawn shapes.
 * Angles are in degrees at the edges and in radians inside. Points are [x, y] with y up, as on a graph.
 */

// ---- fractions --------------------------------------------------------------------------------------------------------------------------------------------------------------------------
export const gcd = (a: number, b: number): number => {
  let x = Math.abs(a);
  let y = Math.abs(b);
  while (y) [x, y] = [y, x % y];
  return x;
};
export type Frac = [number, number];
/** n / d in lowest terms with a positive denominator. */
export const frac = (n: number, d: number): Frac => {
  const g = gcd(n, d) || 1;
  const s = d < 0 ? -1 : 1;
  return [(s * n) / g, (s * d) / g];
};
export const fracText = (f: Frac): string => (f[1] === 1 ? String(f[0]) : `${f[0]}/${f[1]}`);
export const fracVal = (f: Frac): number => f[0] / f[1];
export const fracMul = (a: Frac, b: Frac): Frac => frac(a[0] * b[0], a[1] * b[1]);
export const fracAdd = (a: Frac, b: Frac): Frac => frac(a[0] * b[1] + b[0] * a[1], a[1] * b[1]);
/** -1, 0 or 1: which of a/b and c/d is greater. */
export const fracCompare = (a: Frac, b: Frac): number => Math.sign(a[0] * b[1] - b[0] * a[1]);

// ---- statistics: grouped data --------------------------------------------------------------------------------------------------------------------------------------------------
export type Classes = { start: number; width: number; freqs: number[] };
export const total = (xs: number[]): number => xs.reduce((s, v) => s + v, 0);
export const classLow = (c: Classes, i: number): number => c.start + i * c.width;
export const classMid = (c: Classes, i: number): number => c.start + (i + 0.5) * c.width;
/** The mean of grouped data, every value taken at the middle of its class. */
export const groupedMean = (c: Classes): number => c.freqs.reduce((s, f, i) => s + f * classMid(c, i), 0) / total(c.freqs);
/** Index of the class with the greatest frequency (the first, if two tie). */
export const modalClass = (c: Classes): number => c.freqs.reduce((best, f, i, a) => (f > a[best]! ? i : best), 0);
/** The mode of grouped data: L + (f1 - f0) / (2 f1 - f0 - f2) w, with f0 and f2 the frequencies of the classes before and after the modal class (0 at the ends). */
export function groupedMode(c: Classes): number {
  const i = modalClass(c);
  const f1 = c.freqs[i]!;
  const f0 = i > 0 ? c.freqs[i - 1]! : 0;
  const f2 = i + 1 < c.freqs.length ? c.freqs[i + 1]! : 0;
  const den = 2 * f1 - f0 - f2;
  return den === 0 ? classMid(c, i) : classLow(c, i) + ((f1 - f0) / den) * c.width;
}
/** Less-than cumulative frequencies at the upper limits of the classes: [f1, f1 + f2, ...]. */
export const cumulative = (freqs: number[]): number[] => freqs.reduce<number[]>((a, f) => [...a, (a[a.length - 1] ?? 0) + f], []);
/** The points of the less-than ogive: (start, 0), then (upper limit, cumulative frequency) of each class. */
export const ogivePoints = (c: Classes): Pt[] => [[c.start, 0], ...cumulative(c.freqs).map((cf, i) => [classLow(c, i + 1), cf] as Pt)];
/** The median of grouped data: L + (n/2 - cf) / f w, in the class where the cumulative frequency first reaches n/2. */
export function groupedMedian(c: Classes): number {
  const n = total(c.freqs);
  const cum = cumulative(c.freqs);
  const i = cum.findIndex((v) => v >= n / 2);
  const before = i > 0 ? cum[i - 1]! : 0;
  return classLow(c, i) + ((n / 2 - before) / c.freqs[i]!) * c.width;
}
/** The x at which a polyline (x increasing) first reaches height y: the median reading of an ogive. */
export function readAcross(pts: Pt[], y: number): number | null {
  for (let i = 1; i < pts.length; i++) {
    const [a, b] = [pts[i - 1]!, pts[i]!];
    if (b[1] >= y && a[1] <= y && b[1] > a[1]) return a[0] + ((y - a[1]) / (b[1] - a[1])) * (b[0] - a[0]);
  }
  return null;
}
/** The points of a frequency polygon: the class middles, with a class of frequency 0 added before the first and after the last. */
export const polygonPoints = (c: Classes): Pt[] => [[c.start - c.width / 2, 0], ...c.freqs.map((f, i) => [classMid(c, i), f] as Pt), [c.start + (c.freqs.length + 0.5) * c.width, 0]];

// ---- statistics: raw data ---------------------------------------------------------------------------------------------------------------------------------------------------------
export const mean = (xs: number[]): number => total(xs) / xs.length;
export function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}
/** The values that occur most often (every one of them, smallest first), or [] when every value occurs once. */
export function modes(xs: number[]): number[] {
  const count = new Map<number, number>();
  for (const x of xs) count.set(x, (count.get(x) ?? 0) + 1);
  const top = Math.max(...count.values());
  return top === 1 ? [] : [...count].filter(([, c]) => c === top).map(([v]) => v).sort((a, b) => a - b);
}
/** Quartiles by the median of each half, the middle value left out of both halves when there is an odd number of values. */
export function quartiles(xs: number[]): { q1: number; q2: number; q3: number } {
  const s = [...xs].sort((a, b) => a - b);
  const h = s.length >> 1;
  return { q1: median(s.slice(0, h)), q2: median(s), q3: median(s.slice(s.length % 2 ? h + 1 : h)) };
}
export const populationSd = (xs: number[]): number => Math.sqrt(xs.reduce((s, x) => s + (x - mean(xs)) ** 2, 0) / xs.length);
export function regression(pts: Pt[]): { slope: number; intercept: number; r: number; mx: number; my: number } {
  const mx = mean(pts.map((p) => p[0]));
  const my = mean(pts.map((p) => p[1]));
  const sxx = pts.reduce((s, p) => s + (p[0] - mx) ** 2, 0);
  const syy = pts.reduce((s, p) => s + (p[1] - my) ** 2, 0);
  const sxy = pts.reduce((s, p) => s + (p[0] - mx) * (p[1] - my), 0);
  const slope = sxy / sxx;
  return { slope, intercept: my - slope * mx, r: sxy / Math.sqrt(sxx * syy), mx, my };
}
export const strengthWord = (r: number): string => {
  const a = Math.abs(r);
  const w = a >= 0.8 ? "strong" : a >= 0.5 ? "moderate" : a >= 0.2 ? "weak" : "almost none";
  return a < 0.2 ? w : `${w}, ${r > 0 ? "positive" : "negative"}`;
};

// ---- the normal and binomial distributions --------------------------------------------------------------------------------------------------------------------------------------------
/** The error function: its Taylor series up to 3 and the continued fraction of erfc beyond (accurate to about 1e-12). */
export function erf(x: number): number {
  const ax = Math.abs(x);
  if (ax > 3) {
    let f = ax;
    for (let k = 80; k >= 1; k--) f = ax + k / 2 / f;
    const erfc = Math.exp(-ax * ax) / (Math.sqrt(Math.PI) * f);
    return Math.sign(x) * (1 - erfc);
  }
  let term = ax;
  let sum = ax;
  for (let n = 1; n < 120; n++) {
    term *= (-ax * ax) / n;
    const add = term / (2 * n + 1);
    sum += add;
    if (Math.abs(add) < 1e-18 * Math.abs(sum)) break;
  }
  return Math.sign(x) * ((2 / Math.sqrt(Math.PI)) * sum);
}
export const normPdf = (mu: number, sigma: number, x: number): number => Math.exp(-0.5 * ((x - mu) / sigma) ** 2) / (sigma * Math.sqrt(2 * Math.PI));
export const normCdf = (mu: number, sigma: number, x: number): number => 0.5 * (1 + erf((x - mu) / (sigma * Math.SQRT2)));
export const zScore = (mu: number, sigma: number, x: number): number => (x - mu) / sigma;
/** The probability that a normal variable lies between a and b. */
export const normBetween = (mu: number, sigma: number, a: number, b: number): number => normCdf(mu, sigma, b) - normCdf(mu, sigma, a);
export function choose(n: number, k: number): number {
  if (k < 0 || k > n) return 0;
  let c = 1;
  for (let i = 1; i <= k; i++) c = (c * (n - k + i)) / i;
  return Math.round(c);
}
export const binomPmf = (n: number, p: number, k: number): number => choose(n, k) * p ** k * (1 - p) ** (n - k);
export const binomCdf = (n: number, p: number, k: number): number => Array.from({ length: k + 1 }, (_, i) => binomPmf(n, p, i)).reduce((s, v) => s + v, 0);
/** A seeded generator of numbers in [0, 1): the same seed always gives the same run. */
export function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}
/** `trials` experiments of n tosses of a coin that shows heads with probability p, each counted by its number of heads: the counts of 0, 1, ... n heads. */
export function simulateBinom(n: number, p: number, trials: number, seed: number): number[] {
  const next = lcg(seed);
  const counts = new Array<number>(n + 1).fill(0);
  for (let t = 0; t < trials; t++) {
    let heads = 0;
    for (let i = 0; i < n; i++) if (next() < p) heads++;
    counts[heads]!++;
  }
  return counts;
}

// ---- probability: trees, sample spaces, Venn diagrams --------------------------------------------------------------------------------------------------------------------------------
export const TREE_EVENTS = ["both_first", "both_second", "same", "different", "at_least_one_first"] as const;
export type TreeEvent = (typeof TREE_EVENTS)[number];
export const inTreeEvent = (e: TreeEvent, i: number, j: number): boolean => (e === "both_first" ? i === 0 && j === 0 : e === "both_second" ? i === 1 && j === 1 : e === "same" ? i === j : e === "different" ? i !== j : i === 0 || j === 0);
export type Tree = { p1: [number, number]; p2: [[number, number], [number, number]]; leaves: number[]; exact?: { p1: [Frac, Frac]; p2: [[Frac, Frac], [Frac, Frac]]; leaves: Frac[] } };
/** Two draws from a bag of `red` red and `blue` blue balls, with or without putting the first back: every probability as an exact fraction. */
export function bagTree(red: number, blue: number, replace: boolean): Tree {
  const n = red + blue;
  const p1: [Frac, Frac] = [frac(red, n), frac(blue, n)];
  const m = replace ? n : n - 1;
  const p2: [[Frac, Frac], [Frac, Frac]] = [
    [frac(replace ? red : red - 1, m), frac(blue, m)],
    [frac(red, m), frac(replace ? blue : blue - 1, m)],
  ];
  const leaves = [fracMul(p1[0], p2[0][0]), fracMul(p1[0], p2[0][1]), fracMul(p1[1], p2[1][0]), fracMul(p1[1], p2[1][1])];
  return { p1: [fracVal(p1[0]), fracVal(p1[1])], p2: [[fracVal(p2[0][0]), fracVal(p2[0][1])], [fracVal(p2[1][0]), fracVal(p2[1][1])]], leaves: leaves.map(fracVal), exact: { p1, p2, leaves } };
}
export const probTree = (p1: [number, number], p2: [[number, number], [number, number]]): Tree => ({ p1, p2, leaves: [p1[0] * p2[0][0], p1[0] * p2[0][1], p1[1] * p2[1][0], p1[1] * p2[1][1]] });
export const treeEventProb = (t: Tree, e: TreeEvent): number => t.leaves.reduce((s, v, k) => s + (inTreeEvent(e, k >> 1, k & 1) ? v : 0), 0);
export const treeEventFrac = (t: Tree, e: TreeEvent): Frac | null => (t.exact ? t.exact.leaves.reduce<Frac>((s, v, k) => (inTreeEvent(e, k >> 1, k & 1) ? fracAdd(s, v) : s), [0, 1]) : null);
/** P(the second outcome is j | the first is i): the second-stage probability on the branch. */
export const conditional = (t: Tree, i: number, j: number): number => t.p2[i]![j]!;

export const SPACES = ["dice2", "coins2", "coins3", "coin_die"] as const;
export type Space = (typeof SPACES)[number];
export const SPACE_EVENTS = ["sum_eq", "sum_ge", "sum_le", "doubles", "heads_eq", "heads_ge", "head_and_even"] as const;
export type SpaceEvent = (typeof SPACE_EVENTS)[number];
/** The row labels and column labels of the grid of a sample space (the outcome in row r and column c is the pair). */
export function spaceGrid(space: Space): { rows: string[]; cols: string[] } {
  switch (space) {
    case "dice2": return { rows: ["1", "2", "3", "4", "5", "6"], cols: ["1", "2", "3", "4", "5", "6"] };
    case "coins2": return { rows: ["H", "T"], cols: ["H", "T"] };
    case "coins3": return { rows: ["H", "T"], cols: ["HH", "HT", "TH", "TT"] };
    case "coin_die": return { rows: ["H", "T"], cols: ["1", "2", "3", "4", "5", "6"] };
  }
}
const heads = (s: string): number => [...s].filter((c) => c === "H").length;
/** Does the outcome (row label, column label) belong to the event? `k` is the number the event is about. */
export function inSpaceEvent(space: Space, event: SpaceEvent, k: number, row: string, col: string): boolean {
  switch (event) {
    case "sum_eq": return Number(row) + Number(col) === k;
    case "sum_ge": return Number(row) + Number(col) >= k;
    case "sum_le": return Number(row) + Number(col) <= k;
    case "doubles": return row === col;
    case "heads_eq": return heads(row + col) === k;
    case "heads_ge": return heads(row + col) >= k;
    case "head_and_even": return space === "coin_die" && row === "H" && Number(col) % 2 === 0;
  }
}
export const spaceCells = (space: Space, event: SpaceEvent, k: number): Array<[number, number]> => {
  const g = spaceGrid(space);
  const out: Array<[number, number]> = [];
  g.rows.forEach((r, i) => g.cols.forEach((c, j) => { if (inSpaceEvent(space, event, k, r, c)) out.push([i, j]); }));
  return out;
};
/** Why an event does not make sense for a sample space, or null when it does. */
export function spaceEventProblem(space: Space, event: SpaceEvent, k: number): string | null {
  const dice = space === "dice2";
  if ((event === "sum_eq" || event === "sum_ge" || event === "sum_le" || event === "doubles") && !dice) return "the sum of two dice and doubles are events of the two-dice space: the other spaces have no sum";
  if ((event === "heads_eq" || event === "heads_ge") && (space === "dice2" || space === "coin_die")) return "the number of heads is an event of the coin spaces: this space has a die in it";
  if (event === "head_and_even" && space !== "coin_die") return "head and an even number is an event of the coin-and-die space";
  const coins = space === "coins2" ? 2 : space === "coins3" ? 3 : 0;
  if (event === "sum_eq" && (k < 2 || k > 12)) return "the sum of two dice is a whole number from 2 to 12";
  if ((event === "sum_ge" || event === "sum_le") && (k < 2 || k > 12)) return "the sum of two dice is a whole number from 2 to 12, so the bound is too";
  if (event === "sum_ge" && k === 2) return "every outcome has a sum of at least 2: the event is the whole space, not a part of it";
  if (event === "sum_le" && k === 12) return "every outcome has a sum of at most 12: the event is the whole space, not a part of it";
  if ((event === "heads_eq" || event === "heads_ge") && (k < 0 || k > coins)) return `${coins} coins show from 0 to ${coins} heads`;
  if (event === "heads_ge" && k === 0) return "every outcome has at least 0 heads: the event is the whole space, not a part of it";
  return null;
}
export type Venn = { u: number; a: number; b: number; ab: number; aOnly: number; bOnly: number; neither: number; either: number };
export const vennOf = (u: number, a: number, b: number, ab: number): Venn => ({ u, a, b, ab, aOnly: a - ab, bOnly: b - ab, neither: u - a - b + ab, either: a + b - ab });
/** Why three counts cannot be the sizes of two sets in a universe, or null. */
export function vennProblem(u: number, a: number, b: number, ab: number): string | null {
  if (ab > a || ab > b) return "the overlap cannot be bigger than either set: n(A and B) is at most n(A) and at most n(B)";
  if (a + b - ab > u) return "A and B together hold more members than the universe: n(A) + n(B) - n(A and B) is at most n(U)";
  return null;
}

// ---- calculus ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
export const CALC_FNS = ["x2", "x3", "sqrt", "sin", "exp", "ln"] as const;
export type CalcFn = (typeof CALC_FNS)[number];
export const CALC: Record<CalcFn, { name: string; f: (x: number) => number; df: (x: number) => number; F: (x: number) => number; lo: number; open: boolean }> = {
  x2: { name: "x^2", f: (x) => x * x, df: (x) => 2 * x, F: (x) => x ** 3 / 3, lo: -Infinity, open: false },
  x3: { name: "x^3", f: (x) => x ** 3, df: (x) => 3 * x * x, F: (x) => x ** 4 / 4, lo: -Infinity, open: false },
  sqrt: { name: "sqrt(x)", f: (x) => Math.sqrt(x), df: (x) => 0.5 / Math.sqrt(x), F: (x) => (2 / 3) * x ** 1.5, lo: 0, open: false },
  sin: { name: "sin x", f: (x) => Math.sin(x), df: (x) => Math.cos(x), F: (x) => -Math.cos(x), lo: -Infinity, open: false },
  exp: { name: "e^x", f: (x) => Math.exp(x), df: (x) => Math.exp(x), F: (x) => Math.exp(x), lo: -Infinity, open: false },
  ln: { name: "ln x", f: (x) => Math.log(x), df: (x) => 1 / x, F: (x) => x * Math.log(x) - x, lo: 0, open: true },
};
export const secantSlope = (fn: CalcFn, x0: number, h: number): number => (CALC[fn].f(x0 + h) - CALC[fn].f(x0)) / h;
export type RiemannRule = "left" | "right" | "mid";
export function riemann(fn: CalcFn, a: number, b: number, n: number, rule: RiemannRule): { sum: number; heights: number[]; width: number } {
  const w = (b - a) / n;
  const heights = Array.from({ length: n }, (_, i) => CALC[fn].f(rule === "left" ? a + i * w : rule === "right" ? a + (i + 1) * w : a + (i + 0.5) * w));
  return { sum: heights.reduce((s, h) => s + h * w, 0), heights, width: w };
}
export const exactArea = (fn: CalcFn, a: number, b: number): number => CALC[fn].F(b) - CALC[fn].F(a);
/** The smallest value of f on [a, b], by scanning 400 points (used to refuse an area that dips below the axis). */
export const minOn = (fn: CalcFn, a: number, b: number): number => Math.min(...Array.from({ length: 401 }, (_, i) => CALC[fn].f(a + ((b - a) * i) / 400)));
export const OPTIM = ["fence", "box"] as const;
export type OptimKind = (typeof OPTIM)[number];
/** fence: a rectangle of perimeter P, one side x, area x (P/2 - x), best at x = P/4. box: an open box cut from a square sheet of side L by cutting out squares of side x, volume x (L - 2x)^2, best at x = L/6. */
export function optim(kind: OptimKind, s: number): { f: (x: number) => number; df: (x: number) => number; hi: number; best: number; value: number; other: number } {
  if (kind === "fence") return { f: (x) => x * (s / 2 - x), df: (x) => s / 2 - 2 * x, hi: s / 2, best: s / 4, value: (s * s) / 16, other: s / 2 - s / 4 };
  return { f: (x) => x * (s - 2 * x) ** 2, df: (x) => (s - 2 * x) * (s - 6 * x), hi: s / 2, best: s / 6, value: (2 * s ** 3) / 27, other: s - s / 3 };
}
export const LIMIT_MODES = ["hole", "jump", "infinity"] as const;
export type LimitMode = (typeof LIMIT_MODES)[number];

// ---- sequences and series -----------------------------------------------------------------------------------------------------------------------------------------------------------------
export const apTerm = (a: number, d: number, k: number): number => a + (k - 1) * d;
export const apSum = (a: number, d: number, n: number): number => (n * (2 * a + (n - 1) * d)) / 2;
export const gpTerm = (a: number, r: number, k: number): number => a * r ** (k - 1);
export const gpSum = (a: number, r: number, n: number): number => (r === 1 ? a * n : (a * (1 - r ** n)) / (1 - r));
/** The sum to infinity of a GP, which exists only when |r| < 1. */
export const gpInfinity = (a: number, r: number): number => a / (1 - r);

// ---- matrices ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
export type M2 = [number, number, number, number]; // [[a, b], [c, d]]
export const det2 = (m: M2): number => m[0] * m[3] - m[1] * m[2];
export const inv2 = (m: M2): M2 | null => {
  const d = det2(m);
  return Math.abs(d) < EPS ? null : [m[3] / d, -m[1] / d, -m[2] / d, m[0] / d];
};
export const apply2 = (m: M2, p: Pt): Pt => [m[0] * p[0] + m[1] * p[1], m[2] * p[0] + m[3] * p[1]];
/** The images of the corners of the unit square (0,0), (1,0), (1,1), (0,1). */
export const unitSquareImage = (m: M2): Pt[] => ([[0, 0], [1, 0], [1, 1], [0, 1]] as Pt[]).map((p) => apply2(m, p));
export type Solve2 = { kind: "unique"; x: number; y: number; det: number } | { kind: "none"; det: 0 } | { kind: "infinite"; det: 0 };
/** a1 x + b1 y = c1 and a2 x + b2 y = c2 by Cramer's rule, or why there is no single solution. */
export function solve2(a1: number, b1: number, c1: number, a2: number, b2: number, c2: number): Solve2 {
  const det = a1 * b2 - a2 * b1;
  if (Math.abs(det) > EPS) return { kind: "unique", x: (c1 * b2 - c2 * b1) / det, y: (a1 * c2 - a2 * c1) / det, det };
  const same = Math.abs(a1 * c2 - a2 * c1) < EPS && Math.abs(b1 * c2 - b2 * c1) < EPS;
  return same ? { kind: "infinite", det: 0 } : { kind: "none", det: 0 };
}

// ---- complex numbers ---------------------------------------------------------------------------------------------------------------------------------------------------------------------
export type C = [number, number];
export const cAdd = (a: C, b: C): C => [a[0] + b[0], a[1] + b[1]];
export const cMul = (a: C, b: C): C => [a[0] * b[0] - a[1] * b[1], a[0] * b[1] + a[1] * b[0]];
export const cConj = (a: C): C => [a[0], -a[1]];
export const cAbs = (a: C): number => Math.hypot(a[0], a[1]);
/** The principal argument in degrees, in (-180, 180]. */
export const cArg = (a: C): number => {
  const d = (Math.atan2(a[1], a[0]) * 180) / Math.PI;
  return Math.abs(d + 180) < 1e-9 ? 180 : d;
};
export const rootsOfUnity = (n: number): C[] => Array.from({ length: n }, (_, k) => [Math.cos((2 * Math.PI * k) / n), Math.sin((2 * Math.PI * k) / n)] as C);
export const cText = (a: C, f: (x: number) => string): string => (a[1] === 0 ? f(a[0]) : a[0] === 0 ? `${f(a[1])}i` : `${f(a[0])} ${a[1] < 0 ? "-" : "+"} ${f(Math.abs(a[1]))}i`);

// ---- conic sections --------------------------------------------------------------------------------------------------------------------------------------------------------------------------
export const OPENS = ["right", "left", "up", "down"] as const;
export type Opens = (typeof OPENS)[number];
/** Turns a point of the standard parabola y^2 = 4 a x (opening to the right) to the orientation asked for. */
export const orient = (p: Pt, opens: Opens): Pt => (opens === "right" ? p : opens === "left" ? [-p[0], p[1]] : opens === "up" ? [p[1], p[0]] : [p[1], -p[0]]);
export type ConicFacts = { c: number; e: number; foci: Pt[]; directrices: Array<[Pt, Pt]>; latus: number; sumOrDiff: number | null };
export const parabolaFacts = (a: number, opens: Opens, span = 40): ConicFacts => ({ c: a, e: 1, foci: [orient([a, 0], opens)], directrices: [[orient([-a, -span], opens), orient([-a, span], opens)]], latus: 4 * a, sumOrDiff: null });
export const parabolaPoint = (a: number, t: number, opens: Opens): Pt => orient([a * t * t, 2 * a * t], opens);
export function ellipseFacts(a: number, b: number, span = 40): ConicFacts {
  const major = Math.max(a, b);
  const minor = Math.min(a, b);
  const c = Math.sqrt(major * major - minor * minor);
  const e = c / major;
  const along: (v: number) => Pt = a >= b ? (v) => [v, 0] : (v) => [0, v];
  const across: (v: number) => Pt = a >= b ? (v) => [0, v] : (v) => [v, 0];
  const dr = (s: number): [Pt, Pt] => { const base = along(s * (major / e)); const [x, y] = across(span); return [[base[0] - x, base[1] - y], [base[0] + x, base[1] + y]]; };
  return { c, e, foci: [along(-c), along(c)], directrices: [dr(-1), dr(1)], latus: (2 * minor * minor) / major, sumOrDiff: 2 * major };
}
export const ellipsePoint = (a: number, b: number, tDeg: number): Pt => [a * Math.cos((tDeg * Math.PI) / 180), b * Math.sin((tDeg * Math.PI) / 180)];
export function hyperbolaFacts(a: number, b: number, span = 40): ConicFacts {
  const c = Math.sqrt(a * a + b * b);
  const e = c / a;
  const dr = (s: number): [Pt, Pt] => [[(s * a) / e, -span], [(s * a) / e, span]];
  return { c, e, foci: [[-c, 0], [c, 0]], directrices: [dr(-1), dr(1)], latus: (2 * b * b) / a, sumOrDiff: 2 * a };
}
export const hyperbolaPoint = (a: number, b: number, t: number): Pt => [a * Math.cosh(t), b * Math.sinh(t)];
/** The distance from a point to the line through two points. */
export function distToLine(p: Pt, a: Pt, b: Pt): number {
  const [dx, dy] = [b[0] - a[0], b[1] - a[1]];
  return Math.abs(dx * (p[1] - a[1]) - dy * (p[0] - a[0])) / Math.hypot(dx, dy);
}

// ---- linear programming ----------------------------------------------------------------------------------------------------------------------------------------------------------------
export type Cons = { a: number; b: number; c: number; op: "le" | "ge" };
export const LP_BIG = 1000;
const side = (k: Cons, p: Pt): number => (k.op === "le" ? k.c - (k.a * p[0] + k.b * p[1]) : k.a * p[0] + k.b * p[1] - k.c);
/** Sutherland-Hodgman: the part of a convex polygon on the allowed side of one constraint. */
export function clipHalf(poly: Pt[], k: Cons): Pt[] {
  const out: Pt[] = [];
  poly.forEach((p, i) => {
    const q = poly[(i + 1) % poly.length]!;
    const [sp, sq] = [side(k, p), side(k, q)];
    if (sp >= -1e-9) out.push(p);
    if ((sp > 1e-9 && sq < -1e-9) || (sp < -1e-9 && sq > 1e-9)) {
      const t = sp / (sp - sq);
      out.push([p[0] + t * (q[0] - p[0]), p[1] + t * (q[1] - p[1])]);
    }
  });
  return out.filter((p, i) => out.findIndex((q) => Math.hypot(q[0] - p[0], q[1] - p[1]) < 1e-7) === i);
}
/** The feasible region of x >= 0, y >= 0 and the constraints, cut at x, y <= LP_BIG (so an unbounded region is a polygon that reaches that edge). */
export const feasibleRegion = (cons: Cons[]): Pt[] => cons.reduce<Pt[]>((poly, k) => (poly.length ? clipHalf(poly, k) : poly), [[0, 0], [LP_BIG, 0], [LP_BIG, LP_BIG], [0, LP_BIG]]);
export type LpResult = { poly: Pt[]; empty: boolean; unbounded: boolean; value: number; at: Pt[]; corners: Pt[] };
export function lpSolve(cons: Cons[], p: number, q: number, goal: "max" | "min" | "none"): LpResult {
  const poly = feasibleRegion(cons);
  if (poly.length < 3) return { poly, empty: true, unbounded: false, value: NaN, at: [], corners: [] };
  const reaches = (v: Pt): boolean => v[0] > LP_BIG - 1e-6 || v[1] > LP_BIG - 1e-6;
  const corners = poly.filter((v) => !reaches(v));
  const unboundedRegion = poly.some(reaches);
  if (goal === "none") return { poly, empty: false, unbounded: unboundedRegion, value: NaN, at: [], corners };
  const vals = poly.map((v) => p * v[0] + q * v[1]);
  const best = goal === "max" ? Math.max(...vals) : Math.min(...vals);
  const at = poly.filter((_, i) => Math.abs(vals[i]! - best) < 1e-7 * (1 + Math.abs(best)));
  return { poly, empty: false, unbounded: at.some(reaches), value: best, at, corners };
}

// ---- inverse trigonometric functions ---------------------------------------------------------------------------------------------------------------------------------------------
export const INV_TRIG = ["arcsin", "arccos", "arctan"] as const;
export type InvTrig = (typeof INV_TRIG)[number];
export const invTrigAt = (fn: InvTrig, x: number): number => (fn === "arcsin" ? Math.asin(x) : fn === "arccos" ? Math.acos(x) : Math.atan(x));
/** The function the inverse undoes, on the principal branch: sin on [-pi/2, pi/2], cos on [0, pi], tan on (-pi/2, pi/2). */
export const invTrigOriginal = (fn: InvTrig, x: number): number => (fn === "arcsin" ? Math.sin(x) : fn === "arccos" ? Math.cos(x) : Math.tan(x));
export const invTrigBranch = (fn: InvTrig): [number, number] => (fn === "arcsin" ? [-Math.PI / 2, Math.PI / 2] : fn === "arccos" ? [0, Math.PI] : [-Math.PI / 2, Math.PI / 2]);

// ---- flowcharts --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
export const FLOWS = ["even_odd", "larger", "sum_to_n"] as const;
export type Flow = (typeof FLOWS)[number];
/** The edges (numbered as the drawer draws them) the algorithm follows for its input, and its output. */
export function runFlow(flow: Flow, a: number, b: number): { edges: number[]; result: string; loops: number } {
  if (flow === "even_odd") return a % 2 === 0 ? { edges: [0, 1, 2, 4], result: "even", loops: 0 } : { edges: [0, 1, 3, 5], result: "odd", loops: 0 };
  if (flow === "larger") return a >= b ? { edges: [0, 1, 2, 4], result: String(a), loops: 0 } : { edges: [0, 1, 3, 5], result: String(b), loops: 0 };
  let s = 0;
  let i = 1;
  const edges = [0, 1];
  let loops = 0;
  while (i <= a) {
    edges.push(2, 4, ...(loops === 0 ? [] : []));
    s += i;
    i++;
    loops++;
  }
  edges.push(3, 5);
  return { edges: [...new Set(edges)].sort((x, y) => x - y), result: String(s), loops };
}

// ---- mappings -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
export const RULES = ["linear", "square", "abs"] as const;
export type Rule = (typeof RULES)[number];
export const ruleValue = (rule: Rule, a: number, b: number, x: number): number => (rule === "linear" ? a * x + b : rule === "square" ? x * x : Math.abs(x));
export const isOneOne = (images: number[]): boolean => new Set(images).size === images.length;

// ---- number models ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------
/** The whole-number root of value (a square root for power 2, a cube root for power 3), or null when it is not a perfect power. */
export function exactRoot(value: number, power: 2 | 3): number | null {
  const r = Math.round(value ** (1 / power));
  return r ** power === value ? r : null;
}
export type NumClass = { sets: Array<"N" | "W" | "Z" | "Q" | "I" | "R">; smallest: "N" | "W" | "Z" | "Q" | "I" };
export function classifyFraction(p: number, q: number): NumClass & { reduced: Frac } {
  const f = frac(p, q);
  if (f[1] !== 1) return { sets: ["Q", "R"], smallest: "Q", reduced: f };
  const v = f[0];
  if (v >= 1) return { sets: ["N", "W", "Z", "Q", "R"], smallest: "N", reduced: f };
  if (v === 0) return { sets: ["W", "Z", "Q", "R"], smallest: "W", reduced: f };
  return { sets: ["Z", "Q", "R"], smallest: "Z", reduced: f };
}
export function classifySqrt(m: number): NumClass & { root: number | null } {
  const r = exactRoot(m, 2);
  if (r === null) return { sets: ["I", "R"], smallest: "I", root: null };
  return { ...classifyFraction(r, 1), root: r };
}
/** The points O = (0, 0), P1 = (1, 0), P2, ... of the square-root spiral: P(k+1) is one unit from P(k), at a right angle to O P(k), so |O P(k)| = sqrt(k). */
export function sqrtSpiral(n: number): Pt[] {
  const pts: Pt[] = [[1, 0]];
  for (let k = 1; k <= n; k++) {
    const p = pts[k - 1]!;
    const len = Math.hypot(p[0], p[1]);
    pts.push([p[0] - p[1] / len, p[1] + p[0] / len]);
  }
  return pts;
}

// ---- algebraic identities as areas -------------------------------------------------------------------------------------------------------------------------------------------
export const IDENTITIES = ["plus", "minus", "diff", "xpq"] as const;
export type Identity = (typeof IDENTITIES)[number];

// ---- two-column proofs -----------------------------------------------------------------------------------------------------------------------------------------------------------------
export const THEOREMS = ["vertical", "triangle_sum", "isosceles", "exterior", "pythagoras", "parallelogram"] as const;
export type Theorem = (typeof THEOREMS)[number];
export type ProofRow = { s: string; r: string };
/** The rows of a two-column proof, every number computed from the givens. */
export function proofRows(t: Theorem, a: number, b: number, c: number): ProofRow[] {
  switch (t) {
    case "vertical": return [{ s: "AB and CD cross at O", r: "Given" }, { s: `Angle AOC = ${a} deg`, r: "Given" }, { s: `Angle AOD = ${180 - a} deg`, r: "Linear pair" }, { s: `Angle BOD = ${a} deg`, r: "Linear pair" }, { s: "Angle BOD = Angle AOC", r: "Steps 2 and 4" }];
    case "triangle_sum": return [{ s: "Triangle ABC", r: "Given" }, { s: `A = ${a} deg, B = ${b} deg`, r: "Given" }, { s: "A + B + C = 180 deg", r: "Angle sum" }, { s: `C = 180 - ${a + b} deg`, r: "Subtract" }, { s: `C = ${180 - a - b} deg`, r: "Work out" }];
    case "isosceles": return [{ s: `AB = AC, A = ${a} deg`, r: "Given" }, { s: "Angle B = Angle C", r: "Equal sides" }, { s: `B + C = ${180 - a} deg`, r: "Angle sum" }, { s: `Angle B = ${(180 - a) / 2} deg`, r: "Halve" }];
    case "exterior": return [{ s: `A = ${a} deg, B = ${b} deg`, r: "Given" }, { s: `C = ${180 - a - b} deg`, r: "Angle sum" }, { s: `Exterior = ${a + b} deg`, r: "Linear pair" }, { s: "Exterior = A + B", r: "Steps 1 and 3" }];
    case "pythagoras": return [{ s: `Sides ${a}, ${b} and ${c}`, r: "Given" }, { s: `${a}^2 + ${b}^2 = ${a * a + b * b}`, r: "Square and add" }, { s: `${c}^2 = ${c * c}`, r: "Square" }, { s: "a^2 + b^2 = c^2", r: "Equal" }, { s: "Angle C = 90 deg", r: "Converse" }];
    case "parallelogram": return [{ s: "ABCD is a parallelogram", r: "Given" }, { s: `Angle A = ${a} deg`, r: "Given" }, { s: `Angle C = ${a} deg`, r: "Opposite angles" }, { s: `Angle B = ${180 - a} deg`, r: "Co-interior" }, { s: `Angle D = ${180 - a} deg`, r: "Opposite angles" }];
  }
}
