/**
 * Expressions for a story's animation (ADR 0091): a number that changes with time, such as `30*sin(2*t)`. A host's text is never run as code. This parser reads a small grammar
 * (numbers, four named variables, constants, a fixed list of functions, + - * / ^ and comparisons) into a tree and writes JavaScript from the tree alone, so the only
 * identifiers in the output are the ones listed here and the only calls are `Math.<name>`. Anything else is refused with the reason.
 */
export const VARIABLES = ["t", "x", "u", "p"] as const;
const CONSTANTS: Record<string, string> = { pi: "Math.PI", e: "Math.E", tau: "(2*Math.PI)" };
/** name -> [arity, JavaScript]. A function written in two parts, `(a)` and so on, is filled in by position. */
const FUNCTIONS: Record<string, { arity: number; js: (a: string[]) => string }> = {
  sin: { arity: 1, js: (a) => `Math.sin(${a[0]})` },
  cos: { arity: 1, js: (a) => `Math.cos(${a[0]})` },
  tan: { arity: 1, js: (a) => `Math.tan(${a[0]})` },
  asin: { arity: 1, js: (a) => `Math.asin(${a[0]})` },
  acos: { arity: 1, js: (a) => `Math.acos(${a[0]})` },
  atan: { arity: 1, js: (a) => `Math.atan(${a[0]})` },
  atan2: { arity: 2, js: (a) => `Math.atan2(${a[0]},${a[1]})` },
  sinh: { arity: 1, js: (a) => `Math.sinh(${a[0]})` },
  cosh: { arity: 1, js: (a) => `Math.cosh(${a[0]})` },
  tanh: { arity: 1, js: (a) => `Math.tanh(${a[0]})` },
  sqrt: { arity: 1, js: (a) => `Math.sqrt(${a[0]})` },
  abs: { arity: 1, js: (a) => `Math.abs(${a[0]})` },
  exp: { arity: 1, js: (a) => `Math.exp(${a[0]})` },
  ln: { arity: 1, js: (a) => `Math.log(${a[0]})` },
  log: { arity: 1, js: (a) => `Math.log10(${a[0]})` },
  floor: { arity: 1, js: (a) => `Math.floor(${a[0]})` },
  ceil: { arity: 1, js: (a) => `Math.ceil(${a[0]})` },
  round: { arity: 1, js: (a) => `Math.round(${a[0]})` },
  sign: { arity: 1, js: (a) => `Math.sign(${a[0]})` },
  min: { arity: 2, js: (a) => `Math.min(${a[0]},${a[1]})` },
  max: { arity: 2, js: (a) => `Math.max(${a[0]},${a[1]})` },
  pow: { arity: 2, js: (a) => `Math.pow(${a[0]},${a[1]})` },
  mod: { arity: 2, js: (a) => `((${a[0]})%(${a[1]}))` },
  clamp: { arity: 3, js: (a) => `Math.min(Math.max(${a[0]},${a[1]}),${a[2]})` },
  if: { arity: 3, js: (a) => `((${a[0]})?(${a[1]}):(${a[2]}))` },
  lerp: { arity: 3, js: (a) => `((${a[0]})+((${a[1]})-(${a[0]}))*(${a[2]}))` },
  smooth: { arity: 1, js: (a) => `((k=>${`6*k*k*k*k*k-15*k*k*k*k+10*k*k*k`})(Math.min(1,Math.max(0,${a[0]}))))`  },
  snap: { arity: 2, js: (a) => `(Math.round((${a[0]})/(${a[1]}))*(${a[1]}))` },
};
/** Only the names listed above count: a plain lookup would also find inherited ones such as `constructor` and `__proto__`. */
const own = (table: object, name: string): boolean => Object.prototype.hasOwnProperty.call(table, name);
export const FUNCTION_NAMES = Object.keys(FUNCTIONS);
export const CONSTANT_NAMES = Object.keys(CONSTANTS);

export const EXPR_LIMITS = { chars: 200, nodes: 120, depth: 24 } as const;

type Tok = { k: "num" | "id" | "op" | "("  | ")" | ","; v: string };
type Node = { n: "num"; v: string } | { n: "var"; v: string } | { n: "const"; v: string } | { n: "call"; f: string; a: Node[] } | { n: "bin"; o: string; l: Node; r: Node } | { n: "neg"; a: Node };

export type Compiled = { ok: true; js: string; usesTime: boolean } | { ok: false; error: string };

function tokenize(src: string): Tok[] | string {
  const out: Tok[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i]!;
    if (c === " " || c === "\t") i++;
    else if (/[0-9.]/.test(c)) {
      const m = /^(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/.exec(src.slice(i));
      if (!m) return `a number cannot be read at ${i}`;
      out.push({ k: "num", v: m[0] });
      i += m[0].length;
    } else if (/[A-Za-z_]/.test(c)) {
      const m = /^[A-Za-z_][A-Za-z0-9_]*/.exec(src.slice(i))!;
      out.push({ k: "id", v: m[0] });
      i += m[0].length;
    } else if (c === "(" || c === ")" || c === ",") {
      out.push({ k: c, v: c });
      i++;
    } else if (/^(<=|>=)/.test(src.slice(i))) {
      out.push({ k: "op", v: src.slice(i, i + 2) });
      i += 2;
    } else if ("+-*/^<>".includes(c)) {
      out.push({ k: "op", v: c });
      i++;
    } else return `the character "${c}" is not allowed`;
  }
  return out;
}

/** Precedence, lowest first: comparison, add, multiply, power (right to left). Unary minus binds below power, so -x^2 is -(x^2). */
function parse(toks: Tok[]): Node | string {
  let at = 0;
  let nodes = 0;
  const fail = (m: string): never => {
    throw new Error(m);
  };
  const peek = () => toks[at];
  const eat = () => toks[at++]!;
  const bump = (): void => {
    if (++nodes > EXPR_LIMITS.nodes) fail("the expression is too long");
  };
  const primary = (depth: number): Node => {
    if (depth > EXPR_LIMITS.depth) fail("the expression is nested too deeply");
    const t = peek();
    if (!t) return fail("the expression ends too soon");
    if (t.k === "num") {
      eat();
      bump();
      return { n: "num", v: t.v };
    }
    if (t.k === "(") {
      eat();
      const inner = compare(depth + 1);
      if (peek()?.k !== ")") fail("a bracket is not closed");
      eat();
      return inner;
    }
    if (t.k === "id") {
      eat();
      bump();
      if (peek()?.k === "(") {
        const fn = own(FUNCTIONS, t.v) ? FUNCTIONS[t.v] : undefined;
        if (!fn) return fail(`the function "${t.v}" is not known`);
        eat();
        const args: Node[] = [];
        if (peek()?.k !== ")") {
          args.push(compare(depth + 1));
          while (peek()?.k === ",") {
            eat();
            args.push(compare(depth + 1));
          }
        }
        if (peek()?.k !== ")") fail("a bracket is not closed");
        eat();
        if (args.length !== fn.arity) fail(`${t.v} takes ${fn.arity} argument(s)`);
        return { n: "call", f: t.v, a: args };
      }
      if ((VARIABLES as readonly string[]).includes(t.v)) return { n: "var", v: t.v };
      if (own(CONSTANTS, t.v)) return { n: "const", v: t.v };
      return fail(`"${t.v}" is not a variable (use ${VARIABLES.join(", ")}), a constant (${Object.keys(CONSTANTS).join(", ")}) or a function`);
    }
    return fail(`"${t.v}" is not expected here`);
  };
  const power = (depth: number): Node => {
    const base = primary(depth);
    if (peek()?.k === "op" && peek()!.v === "^") {
      eat();
      bump();
      const exp = unary(depth + 1); // right to left, and 2^-1 reads as 2^(-1)
      return { n: "bin", o: "^", l: base, r: exp };
    }
    return base;
  };
  const unary = (depth: number): Node => {
    if (peek()?.k === "op" && (peek()!.v === "-" || peek()!.v === "+")) {
      const o = eat().v;
      bump();
      const a = unary(depth + 1);
      return o === "-" ? { n: "neg", a } : a;
    }
    return power(depth);
  };
  const product = (depth: number): Node => {
    let l = unary(depth);
    while (peek()?.k === "op" && (peek()!.v === "*" || peek()!.v === "/")) {
      const o = eat().v;
      bump();
      l = { n: "bin", o, l, r: unary(depth) };
    }
    return l;
  };
  const sum = (depth: number): Node => {
    let l = product(depth);
    while (peek()?.k === "op" && (peek()!.v === "+" || peek()!.v === "-")) {
      const o = eat().v;
      bump();
      l = { n: "bin", o, l, r: product(depth) };
    }
    return l;
  };
  function compare(depth: number): Node {
    let l = sum(depth);
    while (peek()?.k === "op" && ["<", ">", "<=", ">="].includes(peek()!.v)) {
      const o = eat().v;
      bump();
      l = { n: "bin", o, l, r: sum(depth) };
    }
    return l;
  }
  try {
    const tree = compare(0);
    if (at < toks.length) return `"${toks[at]!.v}" is not expected here`;
    return tree;
  } catch (e) {
    return (e as Error).message;
  }
}

function gen(n: Node): string {
  switch (n.n) {
    case "num":
      return n.v.startsWith(".") ? `0${n.v}` : n.v;
    case "var":
      return n.v;
    case "const":
      return CONSTANTS[n.v]!;
    case "neg":
      return `(-(${gen(n.a)}))`;
    case "call":
      return FUNCTIONS[n.f]!.js(n.a.map(gen));
    case "bin":
      if (n.o === "^") return `Math.pow(${gen(n.l)},${gen(n.r)})`;
      if (["<", ">", "<=", ">="].includes(n.o)) return `((${gen(n.l)})${n.o}(${gen(n.r)})?1:0)`;
      return `((${gen(n.l)})${n.o}(${gen(n.r)}))`;
  }
}

const uses = (n: Node, name: string): boolean => (n.n === "var" ? n.v === name : n.n === "call" ? n.a.some((x) => uses(x, name)) : n.n === "bin" ? uses(n.l, name) || uses(n.r, name) : n.n === "neg" ? uses(n.a, name) : false);

/** The JavaScript for an expression (a function body over t, x, u, p), or the reason it is refused. */
export function compileExpr(src: string): Compiled {
  if (typeof src !== "string" || src.trim() === "") return { ok: false, error: "the expression is empty" };
  if (src.length > EXPR_LIMITS.chars) return { ok: false, error: `the expression is over ${EXPR_LIMITS.chars} characters` };
  const toks = tokenize(src);
  if (typeof toks === "string") return { ok: false, error: toks };
  const tree = parse(toks);
  if (typeof tree === "string") return { ok: false, error: tree };
  return { ok: true, js: gen(tree), usesTime: uses(tree, "t") };
}

/** The value of an expression for given variables, with the same code the page runs (used by tests and by the layout checks). */
export function evalCompiled(js: string, env: { t?: number; x?: number; u?: number; p?: number } = {}): number {
  // eslint-disable-next-line no-new-func
  return new Function("t", "x", "u", "p", `"use strict";return (${js});`)(env.t ?? 0, env.x ?? 0, env.u ?? 0, env.p ?? 0) as number;
}
