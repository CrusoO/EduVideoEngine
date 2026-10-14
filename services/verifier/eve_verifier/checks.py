"""What the verifier proves about a LessonBundle.

1. equalities: every equation with no free symbol (2 + 3 = 5) is exactly true.
2. points: every point a graph or highlight names is a root of the function it rings.
3. claims: the machine-readable statements of the lesson (equivalent equations, roots, sum of roots).

A check never guesses: if it cannot decide (several unknowns, an unsupported shape) it FAILS with the reason.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from sympy import Eq, FiniteSet, Poly, Rational, S, Symbol, nan, roots, simplify, solveset, zoo

from .handlers import HANDLERS, UnknownNode, to_sympy
from .steps import UnknownStepKind, check_step

Bundle = dict[str, Any]


@dataclass
class Check:
    id: str
    kind: str
    ok: bool
    detail: str

    def as_dict(self) -> dict[str, Any]:
        return {"id": self.id, "kind": self.kind, "ok": self.ok, "detail": self.detail}


@dataclass
class Report:
    checks: list[Check] = field(default_factory=list)

    @property
    def ok(self) -> bool:
        return bool(self.checks) and all(c.ok for c in self.checks)

    def counts(self) -> dict[str, int]:
        out: dict[str, int] = {}
        for c in self.checks:
            out[c.kind] = out.get(c.kind, 0) + 1
        return out

    def as_dict(self) -> dict[str, Any]:
        return {
            "ok": self.ok,
            "counts": self.counts(),
            "failed": [c.as_dict() for c in self.checks if not c.ok],
            "checks": [c.as_dict() for c in self.checks],
        }


def _text(e: Any) -> str:
    return str(e).replace("**", "^")


def _bad(e: Any) -> bool:
    return bool(e.has(zoo) or e.has(nan))


def _sides(eq: Any) -> tuple[Any, Any]:
    return eq.lhs, eq.rhs


def _unknown(expr: Any) -> Symbol | None:
    """The unknown of an equation: the symbol named x if present, otherwise the only symbol. Anything else is ambiguous."""
    syms = sorted(expr.free_symbols, key=lambda s: s.name)
    for s in syms:
        if s.name == "x":
            return s
    return syms[0] if len(syms) == 1 else None


def _plain(node: dict[str, Any], top: bool = True) -> str:
    """The tree as the author wrote it (2 + 3 = 6), before SymPy folds the arithmetic. Brackets only where nested."""
    op = node.get("op")
    if op == "num":
        return str(node["n"]) if node.get("d", 1) == 1 else f"{node['n']}/{node['d']}"
    if op == "sym":
        return str(node["name"])
    if op == "neg":
        return f"-{_plain(node['a'], False)}"
    if op == "eq":
        return f"{_plain(node['a'])} = {_plain(node['b'])}"
    sign = {"add": "+", "sub": "-", "mul": "*", "div": "/", "pow": "^"}.get(op or "", "?")
    inner = f"{_plain(node['a'], False)} {sign} {_plain(node['b'], False)}"
    return inner if top else f"({inner})"


def _ops(node: dict[str, Any]) -> set[str]:
    found = {str(node.get("op"))}
    for k in ("a", "b"):
        if isinstance(node.get(k), dict):
            found |= _ops(node[k])
    return found


def check_nodes(bundle: Bundle, report: Report) -> None:
    """Every expression uses only node types the verifier has a handler for. An unknown node rejects the lesson, whatever it is."""
    for eid, node in bundle["expressions"].items():
        unknown = sorted(o for o in _ops(node) if o not in HANDLERS)
        report.checks.append(Check(eid, "expression", not unknown, "uses only supported node types" if not unknown else f"no verifier handler for node type {', '.join(unknown)}"))


def check_equalities(bundle: Bundle, report: Report) -> None:
    for eid, node in bundle["expressions"].items():
        if node.get("op") != "eq":
            continue
        try:
            eq = to_sympy(node)
        except UnknownNode:
            continue  # reported once, by check_nodes
        lhs, rhs = _sides(eq)
        if eq.free_symbols:
            continue  # a condition on unknowns, not a number: covered by claims
        if _bad(lhs) or _bad(rhs):
            report.checks.append(Check(eid, "equality", False, f"{_plain(node)} divides by zero"))
            continue
        ok = simplify(lhs - rhs) == 0
        detail = _plain(node) if ok else f"{_plain(node)} is false: the left side is {_text(simplify(lhs))}, the right side is {_text(simplify(rhs))}"
        report.checks.append(Check(eid, "equality", ok, detail))


def _function_of(node: dict[str, Any]) -> Any:
    e = to_sympy(node)
    return e.lhs - e.rhs if isinstance(e, Eq) else e


def check_points(bundle: Bundle, report: Report) -> None:
    for scene in bundle["scenes"]:
        objects = {o["id"]: o for o in scene["objects"]}
        for o in scene["objects"]:
            points = o.get("props", {}).get("points")
            if o["component"] not in ("functionGraph", "highlight") or not points:
                continue
            owner = o if o["component"] == "functionGraph" else objects.get(o["props"].get("target", ""))
            cid = f"{scene['id']}/{o['id']}"
            if owner is None or not owner.get("exprRef"):
                report.checks.append(Check(cid, "point", False, "the points belong to no function: the target has no expression"))
                continue
            f = _function_of(bundle["expressions"][owner["exprRef"]])
            x = _unknown(f)
            if x is None:
                report.checks.append(Check(cid, "point", False, f"cannot check: {_text(f)} has no single unknown"))
                continue
            for p in points:
                v = f.subs(x, Rational(str(p)))
                ok = simplify(v) == 0
                report.checks.append(Check(f"{cid}@{p}", "point", ok, f"{_text(f)} at {x} = {p} is {_text(simplify(v))}" + ("" if ok else ", not 0: the point is not a root")))


def _poly_roots(eq: Any) -> tuple[Symbol, dict[Any, int]] | str:
    x = _unknown(eq.lhs - eq.rhs)
    if x is None:
        return f"cannot check: {_text(eq)} has no single unknown (name it x)"
    try:
        p = Poly(eq.lhs - eq.rhs, x)
    except Exception:  # noqa: BLE001 - anything that is not a polynomial in x
        return f"cannot check: {_text(eq)} is not a polynomial in {x}"
    return x, roots(p)


def check_claims(bundle: Bundle, report: Report) -> None:
    ex = bundle["expressions"]
    for claim in bundle.get("claims", []):
        cid, kind = claim["id"], claim["kind"]
        if kind == "statement":
            continue  # prose a person approves (AM-3): there is nothing for the verifier to prove, and the approval is checked at compile time
        try:
            if kind == "equivalent":
                a, b = to_sympy(ex[claim["a"]]), to_sympy(ex[claim["b"]])
                xa, xb = _unknown(a.lhs - a.rhs), _unknown(b.lhs - b.rhs)
                if xa is None or xb is None or xa != xb:
                    report.checks.append(Check(cid, "claim", False, "equivalent: the two equations need one common unknown"))
                    continue
                sa, sb = solveset(a.lhs - a.rhs, xa, S.Complexes), solveset(b.lhs - b.rhs, xb, S.Complexes)
                ok = sa == sb
                report.checks.append(Check(cid, "claim", ok, f"{_text(a)} has solutions {_text(sa)}; {_text(b)} has {_text(sb)}" + ("" if ok else ": they are not equivalent")))
            elif kind == "roots":
                eq = to_sympy(ex[claim["equation"]])
                got = _poly_roots(eq)
                if isinstance(got, str):
                    report.checks.append(Check(cid, "claim", False, got))
                    continue
                _, rs = got
                stated = FiniteSet(*[to_sympy(v) for v in claim["values"]])
                actual = FiniteSet(*rs.keys())
                ok = stated == actual
                report.checks.append(Check(cid, "claim", ok, f"{_text(eq)} has roots {_text(actual)}; the lesson says {_text(stated)}"))
            elif kind == "sum-of-roots":
                eq = to_sympy(ex[claim["equation"]])
                target = to_sympy(ex[claim["equals"]])
                got = _poly_roots(eq)
                if isinstance(got, str):
                    report.checks.append(Check(cid, "claim", False, got))
                    continue
                _, rs = got
                total = sum(r * m for r, m in rs.items())  # a double root counts twice
                ok = simplify(total - target.rhs) == 0
                report.checks.append(Check(cid, "claim", ok, f"the roots of {_text(eq)} add up to {_text(simplify(total))}; the lesson says {_text(target.rhs)}"))
            else:
                report.checks.append(Check(cid, "claim", False, f"unknown claim kind {kind!r}"))
        except UnknownNode as e:
            report.checks.append(Check(cid, "claim", False, str(e)))
        except KeyError as e:
            report.checks.append(Check(cid, "claim", False, f"names an expression that does not exist: {e}"))


def _result_of(bundle: Bundle, claim: dict[str, Any]) -> list[Any]:
    """The equations a claim ends with: what the next step starts from, and what a step produces."""
    ex = bundle["expressions"]
    if claim["kind"] == "equivalent":
        return [to_sympy(ex[claim["b"]])]
    if claim["kind"] == "sum-of-roots":
        return [to_sympy(ex[claim["equals"]])]
    eq = to_sympy(ex[claim["equation"]])
    x = _unknown(eq.lhs - eq.rhs)
    if x is None:
        raise KeyError(f"the equation of {claim['id']} has no single unknown")
    return [Eq(x, to_sympy(v), evaluate=False) for v in claim["values"]]


def check_steps(bundle: Bundle, report: Report) -> None:
    """Claims that declare a step (usesStep with a stepKind): the step is a valid transformation of the claim it uses (ADR 0034).

    This proves the transformation is valid, not that it was the best one to teach; the link itself is declared by the author.
    """
    claims = {c["id"]: c for c in bundle.get("claims", [])}
    for claim in claims.values():
        kind = claim.get("stepKind")
        if kind is None and claim.get("usesStep") is None:
            continue
        cid = claim["id"]
        try:
            if kind is None or claim.get("usesStep") is None:
                report.checks.append(Check(cid, "step", False, "a step needs both usesStep and stepKind"))
                continue
            used = claims.get(claim["usesStep"])
            if used is None:
                report.checks.append(Check(cid, "step", False, f"uses unknown claim {claim['usesStep']}"))
                continue
            ok, detail = check_step(kind, _result_of(bundle, used), _result_of(bundle, claim), claim.get("identity"))
            report.checks.append(Check(cid, "step", ok, f"{kind}: {detail}"))
        except (UnknownStepKind, UnknownNode) as e:
            report.checks.append(Check(cid, "step", False, str(e)))
        except KeyError as e:
            report.checks.append(Check(cid, "step", False, f"names an expression that does not exist: {e}"))


def _value(bundle: Bundle, expr_id: str) -> Any:
    """The exact number an expression id stands for (None if it is not a number)."""
    node = bundle["expressions"].get(expr_id)
    if node is None:
        return None
    try:
        v = to_sympy(node)
    except UnknownNode:
        return None
    return v if not v.free_symbols and v.is_number else None


def check_numberlines(bundle: Bundle, report: Report) -> None:
    """Number lines: the hops continue where the last one ended, stay on the line, and their total is what the bracket says.

    Where the same scene shows a quadratic, the total of the hops must be the sum of its roots (minus the coefficient of x over the leading one):
    the hops have to add up to the coefficient the lesson points at.
    """
    for scene in bundle["scenes"]:
        quad = None
        for o in scene["objects"]:
            if o["component"] == "equation" and o.get("exprRef") and bundle["expressions"][o["exprRef"]].get("op") == "eq":
                eq = to_sympy(bundle["expressions"][o["exprRef"]])
                syms = sorted(eq.free_symbols, key=lambda s: s.name)
                if len(syms) == 1:
                    try:
                        p = Poly(eq.lhs - eq.rhs, syms[0])
                    except Exception:  # noqa: BLE001
                        continue
                    if p.degree() == 2:
                        quad = -p.coeff_monomial(syms[0]) / p.coeff_monomial(syms[0] ** 2)
        for o in scene["objects"]:
            if o["component"] != "numberLine":
                continue
            cid = f"{scene['id']}/{o['id']}"
            props = o["props"]
            hops = []
            ok = True
            for i, h in enumerate(props.get("hops", [])):
                a, b = _value(bundle, h["from"]), _value(bundle, h["to"])
                if a is None or b is None:
                    report.checks.append(Check(f"{cid}#hop{i}", "numberline", False, f"hop {i}: {h['from']} or {h['to']} is not a number"))
                    ok = False
                    continue
                hops.append((a, b))
                inside = props["min"] <= a <= props["max"] and props["min"] <= b <= props["max"]
                if not inside or a == b:
                    report.checks.append(Check(f"{cid}#hop{i}", "numberline", False, f"hop {i} from {a} to {b} is not on the line {props['min']} to {props['max']}" if not inside else f"hop {i} has no length"))
                    ok = False
            for i in range(1, len(hops)):
                if hops[i][0] != hops[i - 1][1]:
                    report.checks.append(Check(f"{cid}#hop{i}", "numberline", False, f"hop {i} starts at {hops[i][0]} but hop {i - 1} ended at {hops[i - 1][1]}"))
                    ok = False
            if not hops:
                continue
            total = sum(b - a for a, b in hops)
            span = hops[-1][1] - hops[0][0]
            if total != span:
                report.checks.append(Check(f"{cid}", "numberline", False, f"the hops add up to {total} but they span {span}"))
                ok = False
            for i, br in enumerate(props.get("brackets", [])):
                label = br.get("label")
                node = bundle["expressions"].get(label) if label else None
                if node is not None and node.get("op") == "eq":
                    stated = to_sympy(node).rhs
                    if simplify(stated - span) != 0:
                        report.checks.append(Check(f"{cid}#bracket{i}", "numberline", False, f"the bracket spans {span} but its label says {_text(stated)}"))
                        ok = False
            if quad is not None and simplify(span - quad) != 0:
                report.checks.append(Check(f"{cid}", "numberline", False, f"the hops add up to {span} but the roots of the equation on screen add up to {_text(simplify(quad))} (minus the coefficient of x over the leading one)"))
                ok = False
            if ok:
                report.checks.append(Check(cid, "numberline", True, f"{len(hops)} hops from {hops[0][0]} to {hops[-1][1]}, total {total}" + (f", the sum of the roots of the equation on screen ({_text(simplify(quad))})" if quad is not None else "")))


def verify_bundle(bundle: Bundle) -> Report:
    """Run every check. A bundle with nothing checkable is NOT ok: silence is not verification."""
    report = Report()
    check_nodes(bundle, report)
    check_equalities(bundle, report)
    check_points(bundle, report)
    check_numberlines(bundle, report)
    check_claims(bundle, report)
    check_steps(bundle, report)
    return report
