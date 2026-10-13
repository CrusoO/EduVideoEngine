import { z } from "zod";

/**
 * Expression trees. Equations exist ONLY as trees: the on-screen KaTeX form, the spoken form and the verifier input
 * are all derived from one tree, so screen, voice and checker cannot disagree. Numbers are exact rationals.
 */
/**
 * The CLOSED set of node types. Each maps one-to-one onto something the SymPy verifier can check (SYMPY_NODE). A node
 * type the verifier cannot check must never be added here: "every number is verified" would silently stop being true.
 */
export const EXPR_OPS = ["num", "sym", "neg", "add", "sub", "mul", "div", "pow", "eq"] as const;
export type ExprOp = (typeof EXPR_OPS)[number];
export const SYMPY_NODE: Record<ExprOp, string> = {
  num: "Rational(n, d)",
  sym: "Symbol(name)",
  neg: "Mul(-1, a)",
  add: "Add(a, b)",
  sub: "Add(a, Mul(-1, b))",
  mul: "Mul(a, b)",
  div: "Mul(a, Pow(b, -1))",
  pow: "Pow(a, b)",
  eq: "Eq(a, b)",
};

/**
 * Which function of the Python verifier (services/verifier, eve_verifier/handlers.py) turns each node type into SymPy.
 * Typed as a Record over every ExprOp: adding a node type to EXPR_OPS without a line here is a COMPILE ERROR, and the
 * generated expr-ops.json plus the Python tests then fail until the handler exists. That is how "every number is verified"
 * stays true.
 */
export const VERIFIER_HANDLERS: Record<ExprOp, string> = {
  num: "h_num",
  sym: "h_sym",
  neg: "h_neg",
  add: "h_add",
  sub: "h_sub",
  mul: "h_mul",
  div: "h_div",
  pow: "h_pow",
  eq: "h_eq",
};

/**
 * `term` is an optional name for a term of a formula (x squared, minus five x): the same name in two formulas is the same term, so it can keep one
 * colour across scenes (termColors on the bundle). It never changes what the expression means: the verifier, the voice and the arithmetic ignore it,
 * and it is absent from lessons that do not colour anything, so their hashes do not change (ADR 0003).
 */
export type Expr =
  | { op: "num"; n: number; d?: number; term?: string } // n/d, d defaults to 1, d > 0
  | { op: "sym"; name: string; term?: string }
  | { op: "neg"; a: Expr; term?: string }
  | { op: "add" | "sub" | "mul" | "div"; a: Expr; b: Expr; term?: string }
  | { op: "pow"; a: Expr; b: Expr; term?: string }
  | { op: "eq"; a: Expr; b: Expr; term?: string };

export const TERM_ID = /^[A-Za-z][A-Za-z0-9_.-]*$/;
const term = z.string().regex(TERM_ID).optional();

export const ExprSchema: z.ZodType<Expr> = z.lazy(() =>
  z.union([
    z.object({ op: z.literal("num"), n: z.number().int(), d: z.number().int().positive().optional(), term }).strict(),
    z.object({ op: z.literal("sym"), name: z.string().regex(/^[a-zA-Z][a-zA-Z0-9_]*$/), term }).strict(),
    z.object({ op: z.literal("neg"), a: ExprSchema, term }).strict(),
    z.object({ op: z.enum(["add", "sub", "mul", "div", "pow", "eq"]), a: ExprSchema, b: ExprSchema, term }).strict(),
  ]),
);

export const num = (n: number, d = 1): Expr => (d === 1 ? { op: "num", n } : { op: "num", n, d });
export const sym = (name: string): Expr => ({ op: "sym", name });
export const add = (a: Expr, b: Expr): Expr => ({ op: "add", a, b });
export const sub = (a: Expr, b: Expr): Expr => ({ op: "sub", a, b });
export const mul = (a: Expr, b: Expr): Expr => ({ op: "mul", a, b });
export const div = (a: Expr, b: Expr): Expr => ({ op: "div", a, b });
export const pow = (a: Expr, b: Expr): Expr => ({ op: "pow", a, b });
export const neg = (a: Expr): Expr => ({ op: "neg", a });
export const eq = (a: Expr, b: Expr): Expr => ({ op: "eq", a, b });

/** Name a term: returns the same tree with `term` set on its root. */
export const named = <E extends Expr>(term: string, e: E): E => ({ ...e, term });

/** Every term name used in a tree. */
export function termIds(e: Expr, into = new Set<string>()): Set<string> {
  if (e.term) into.add(e.term);
  if (e.op === "neg") termIds(e.a, into);
  else if (e.op !== "num" && e.op !== "sym") {
    termIds(e.a, into);
    termIds(e.b, into);
  }
  return into;
}

/** Every symbol name used in a tree (for checks and for the verifier). */
export function symbols(e: Expr, into = new Set<string>()): Set<string> {
  switch (e.op) {
    case "num":
      break;
    case "sym":
      into.add(e.name);
      break;
    case "neg":
      symbols(e.a, into);
      break;
    default:
      symbols(e.a, into);
      symbols(e.b, into);
  }
  return into;
}

/** Evaluate a tree with exact rationals. Returns null when it cannot (free symbol, division by zero, eq, big powers). */
export type Rat = { n: bigint; d: bigint };
const gcd = (a: bigint, b: bigint): bigint => (b === 0n ? (a < 0n ? -a : a) : gcd(b, a % b));
const rat = (n: bigint, d: bigint): Rat => {
  const g = gcd(n, d) || 1n;
  const s = d < 0n ? -1n : 1n;
  return { n: (s * n) / g, d: (s * d) / g };
};

export function evaluate(e: Expr, env: Record<string, Rat> = {}): Rat | null {
  switch (e.op) {
    case "num":
      return rat(BigInt(e.n), BigInt(e.d ?? 1));
    case "sym":
      return env[e.name] ?? null;
    case "neg": {
      const a = evaluate(e.a, env);
      return a && rat(-a.n, a.d);
    }
    case "eq":
      return null;
    default: {
      const a = evaluate(e.a, env);
      const b = evaluate(e.b, env);
      if (!a || !b) return null;
      if (e.op === "add") return rat(a.n * b.d + b.n * a.d, a.d * b.d);
      if (e.op === "sub") return rat(a.n * b.d - b.n * a.d, a.d * b.d);
      if (e.op === "mul") return rat(a.n * b.n, a.d * b.d);
      if (e.op === "div") return b.n === 0n ? null : rat(a.n * b.d, a.d * b.n);
      // pow: integer exponents only, and small
      if (b.d !== 1n || b.n < 0n || b.n > 64n) return null;
      return rat(a.n ** b.n, a.d ** b.n);
    }
  }
}

export const rational = (n: number, d = 1): Rat => rat(BigInt(n), BigInt(d));
export const ratEquals = (a: Rat, b: Rat) => a.n === b.n && a.d === b.d;
