"""Step kinds: one handler for each way a worked solution may move from one result to the next (ADR 0034).

A step handler receives what the step USED (`src`, the equations that claim ended with) and what it PRODUCED (`dst`), both as lists of SymPy
equations, and returns (ok, detail). It proves that dst is a valid transformation of src of that kind. It does not judge whether this was the
best step to teach: the link between steps is declared by the author and reviewed by a teacher.

The set of kinds is CLOSED and lives in packages/schema/src/bundle.ts; the handler for each is named in packages/schema/step-kinds.json, generated from
TypeScript. A kind without a handler (or a handler without a kind) fails tests/test_steps.py. An unknown kind rejects the lesson.
"""

from __future__ import annotations

from typing import Any, Callable

from sympy import Add, FiniteSet, Mul, Poly, Pow, S, Symbol, expand, simplify, solveset, sqrt

Equations = list[Any]
Result = tuple[bool, str]


class UnknownStepKind(ValueError):
    """A step kind or identity with no handler: the lesson is rejected, never skipped."""


def _t(e: Any) -> str:
    return str(e).replace("**", "^")


def _eqs(items: Equations) -> str:
    return " and ".join(_t(e) for e in items)


def _unknown(e: Any) -> Symbol | None:
    syms = sorted(e.free_symbols, key=lambda s: s.name)
    for s in syms:
        if s.name == "x":
            return s
    return syms[0] if len(syms) == 1 else None


def _solutions(items: Equations) -> Any | None:
    """The union of the solution sets of the equations, each in its own unknown. None when an equation has no single unknown."""
    out: Any = S.EmptySet
    for e in items:
        x = _unknown(e.lhs - e.rhs)
        if x is None:
            return None
        out = out.union(solveset(e.lhs - e.rhs, x, S.Complexes))
    return out


def _same(a: Any, b: Any) -> bool:
    return bool(simplify(a - b) == 0)


def _one(items: Equations, what: str) -> Any | str:
    return items[0] if len(items) == 1 else f"{what} must be one equation, found {len(items)}"


def s_rearrange(src: Equations, dst: Equations) -> Result:
    """The same operation on both sides: the two have the same solution set."""
    a, b = _solutions(src), _solutions(dst)
    if a is None or b is None:
        return False, "rearrange: each equation needs one unknown to compare solution sets"
    return a == b, f"{_eqs(src)} has solutions {_t(a)}; {_eqs(dst)} has {_t(b)}" + ("" if a == b else ": not the same set")


def _both_sides_equal(src: Any, dst: Any) -> bool:
    return _same(src.lhs, dst.lhs) and _same(src.rhs, dst.rhs)


def _is_factored(e: Any) -> bool:
    return (e.is_Mul and len(Mul.make_args(e)) >= 2 and any(a.is_Add for a in Mul.make_args(e))) or (e.is_Pow and e.base.is_Add)


def s_factorise(src: Equations, dst: Equations) -> Result:
    a, b = _one(src, "factorise: the source"), _one(dst, "factorise: the result")
    if isinstance(a, str) or isinstance(b, str):
        return False, a if isinstance(a, str) else b
    if not _both_sides_equal(a, b):
        return False, f"{_t(b)} is not equal to {_t(a)} on each side"
    if not _is_factored(b.lhs):
        return False, f"{_t(b.lhs)} is not a product of factors"
    return True, f"{_t(a.lhs)} = {_t(b.lhs)}"


def s_expand(src: Equations, dst: Equations) -> Result:
    a, b = _one(src, "expand: the source"), _one(dst, "expand: the result")
    if isinstance(a, str) or isinstance(b, str):
        return False, a if isinstance(a, str) else b
    if not _both_sides_equal(a, b):
        return False, f"{_t(b)} is not equal to {_t(a)} on each side"
    if expand(b.lhs) != b.lhs:
        return False, f"{_t(b.lhs)} is not expanded"
    return True, f"{_t(a.lhs)} = {_t(b.lhs)}"


def s_simplify(src: Equations, dst: Equations) -> Result:
    a, b = _one(src, "simplify: the source"), _one(dst, "simplify: the result")
    if isinstance(a, str) or isinstance(b, str):
        return False, a if isinstance(a, str) else b
    ok = _both_sides_equal(a, b)
    return ok, f"{_t(a)} and {_t(b)} are equal on each side" if ok else f"{_t(b)} is not equal to {_t(a)} on each side"


def s_evaluate(src: Equations, dst: Equations) -> Result:
    """Recompute a number exactly: every result is a closed equation whose two sides have the same value, and any closed source keeps its values."""
    for e in dst:
        if e.free_symbols:
            return False, f"{_t(e)} still has an unknown: evaluate gives numbers"
        if not _same(e.lhs, e.rhs):
            return False, f"{_t(e)} is false: the left side is {_t(simplify(e.lhs))}, the right side is {_t(simplify(e.rhs))}"
    for s in src:
        if not s.free_symbols and not any(_same(s.lhs, d.lhs) or _same(s.lhs, d.rhs) for d in dst):
            return False, f"{_t(s)} does not evaluate to a result shown"
    return True, f"{_eqs(dst)}"


def s_substitute(src: Equations, dst: Equations) -> Result:
    """dst is src with one value put in for its unknown, on BOTH sides."""
    a, b = _one(src, "substitute: the source"), _one(dst, "substitute: the result")
    if isinstance(a, str) or isinstance(b, str):
        return False, a if isinstance(a, str) else b
    x = _unknown(a.lhs - a.rhs)
    if x is None or b.free_symbols:
        return False, "substitute: the source needs one unknown and the result must have none"
    candidates = solveset(a.lhs - b.lhs, x, S.Complexes)
    for v in candidates if isinstance(candidates, FiniteSet) else []:
        if _same(a.rhs.subs(x, v), b.rhs):
            return True, f"{_t(x)} = {_t(v)} in {_t(a)} gives {_t(b)}"
    return False, f"no single value of {_t(x)} turns {_t(a)} into {_t(b)}"


def s_take_root(src: Equations, dst: Equations) -> Result:
    """From s^2 = k to the roots: BOTH signed roots are kept (or the single root when k is 0)."""
    a = _one(src, "take_root: the source")
    if isinstance(a, str):
        return False, a
    if not (a.lhs.is_Pow and a.lhs.exp == 2 and not a.rhs.free_symbols):
        return False, f"take_root: {_t(a)} is not of the form s^2 = number"
    s_, k = a.lhs.base, a.rhs
    want = FiniteSet(S.Zero) if k == 0 else FiniteSet(sqrt(k), -sqrt(k))
    got = []
    for e in dst:
        if e.lhs != s_ or e.rhs.free_symbols:
            return False, f"take_root: {_t(e)} is not of the form {_t(s_)} = number"
        got.append(e.rhs)
    have = FiniteSet(*got)
    if have != want:
        return False, f"{_t(a)} has roots {_t(want)}; the step keeps {_t(have)}" + (": both signed roots must be kept" if have != want and want.is_superset(have) else "")
    return True, f"{_t(a)} gives {_t(have)}"


def _square_root_of(term: Any) -> Any | None:
    """The p with p^2 = term, where that can be read off (a number, or a power with an even exponent)."""
    if term.is_Number and term > 0:
        r = sqrt(term)
        return r if r.is_Rational else None
    if term.is_Pow and term.exp.is_Integer and term.exp % 2 == 0:
        return Pow(term.base, term.exp / 2)
    if term.is_Mul:
        coeff, rest = term.as_coeff_Mul()
        c = _square_root_of(coeff) if coeff != 1 else S.One
        r = _square_root_of(rest) if rest != 1 else S.One
        return None if c is None or r is None else c * r
    return None


def i_vieta_sum(src: Equations, dst: Equations) -> Result:
    a, b = _one(src, "vieta_sum: the source"), _one(dst, "vieta_sum: the result")
    if isinstance(a, str) or isinstance(b, str):
        return False, a if isinstance(a, str) else b
    x = _unknown(a.lhs - a.rhs)
    if x is None:
        return False, "vieta_sum: the source needs one unknown"
    p = Poly(a.lhs - a.rhs, x)
    if p.degree() != 2:
        return False, f"vieta_sum: {_t(a)} is not a quadratic"
    want = -p.coeff_monomial(x) / p.coeff_monomial(x**2)
    return _same(b.rhs, want), f"for {_t(a)} the roots add up to {_t(want)}; the step says {_t(b.rhs)}"


def i_vieta_product(src: Equations, dst: Equations) -> Result:
    a, b = _one(src, "vieta_product: the source"), _one(dst, "vieta_product: the result")
    if isinstance(a, str) or isinstance(b, str):
        return False, a if isinstance(a, str) else b
    x = _unknown(a.lhs - a.rhs)
    if x is None:
        return False, "vieta_product: the source needs one unknown"
    p = Poly(a.lhs - a.rhs, x)
    if p.degree() != 2:
        return False, f"vieta_product: {_t(a)} is not a quadratic"
    want = p.coeff_monomial(1) / p.coeff_monomial(x**2)
    return _same(b.rhs, want), f"for {_t(a)} the roots multiply to {_t(want)}; the step says {_t(b.rhs)}"


def i_difference_of_squares(src: Equations, dst: Equations) -> Result:
    a, b = _one(src, "difference_of_squares: the source"), _one(dst, "difference_of_squares: the result")
    if isinstance(a, str) or isinstance(b, str):
        return False, a if isinstance(a, str) else b
    terms = Add.make_args(expand(a.lhs))
    if len(terms) != 2:
        return False, f"difference_of_squares: {_t(a.lhs)} is not a difference of two terms"
    pos = [t for t in terms if not (t.could_extract_minus_sign())]
    neg = [-t for t in terms if t.could_extract_minus_sign()]
    if len(pos) != 1 or len(neg) != 1:
        return False, f"difference_of_squares: {_t(a.lhs)} is not one square minus another"
    p, q = _square_root_of(pos[0]), _square_root_of(neg[0])
    if p is None or q is None:
        return False, f"difference_of_squares: {_t(a.lhs)} is not a difference of two squares"
    factors = Mul.make_args(b.lhs)
    ok = len(factors) == 2 and {expand(f) for f in factors} == {expand(p - q), expand(p + q)} and _same(a.rhs, b.rhs)
    return ok, f"{_t(a.lhs)} = ({_t(p)} - {_t(q)})({_t(p)} + {_t(q)})" if ok else f"{_t(b.lhs)} is not ({_t(p)} - {_t(q)})({_t(p)} + {_t(q)})"


IDENTITY_FUNCS: dict[str, Callable[[Equations, Equations], Result]] = {
    "vieta_sum": i_vieta_sum,
    "vieta_product": i_vieta_product,
    "difference_of_squares": i_difference_of_squares,
}


def s_apply_identity(src: Equations, dst: Equations, identity: str | None = None) -> Result:
    if identity is None:
        return False, "apply_identity: the step names no identity"
    fn = IDENTITY_FUNCS.get(identity)
    if fn is None:
        raise UnknownStepKind(f"no proof for identity {identity!r}")
    return fn(src, dst)


STEP_FUNCS: dict[str, Callable[..., Result]] = {
    "rearrange": s_rearrange,
    "factorise": s_factorise,
    "expand": s_expand,
    "substitute": s_substitute,
    "evaluate": s_evaluate,
    "simplify": s_simplify,
    "take_root": s_take_root,
    "apply_identity": s_apply_identity,
}


def check_step(kind: str, src: Equations, dst: Equations, identity: str | None = None) -> Result:
    fn = STEP_FUNCS.get(kind)
    if fn is None:
        raise UnknownStepKind(f"no verifier handler for step kind {kind!r}")
    return fn(src, dst, identity) if kind == "apply_identity" else fn(src, dst)

