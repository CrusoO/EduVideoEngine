"""Step kinds (ADR 0034): the closed set matches its handlers, every handler accepts a true step and rejects a false one,
and three chains from real topics are written with the set: sum of the roots of a quadratic, a linear equation, Pythagoras."""

import json
from pathlib import Path

import pytest

from eve_verifier import steps
from eve_verifier.checks import verify_bundle
from eve_verifier.handlers import to_sympy
from eve_verifier.steps import STEP_FUNCS, UnknownStepKind, check_step

SPEC = json.loads((Path(__file__).parents[3] / "packages" / "schema" / "step-kinds.json").read_text(encoding="utf-8"))


def n(v, d=1):
    return {"op": "num", "n": v, "d": d} if d != 1 else {"op": "num", "n": v}


def sy(name):
    return {"op": "sym", "name": name}


def op(o, a, b):
    return {"op": o, "a": a, "b": b}


def eq(a, b):
    return op("eq", a, b)


X = sy("x")
X2 = op("pow", X, n(2))


def E(a, b):
    """A SymPy equation from two expression trees (how the verifier itself builds them)."""
    return to_sympy(eq(a, b))


QUAD = E(op("add", op("sub", X2, op("mul", n(5), X)), n(6)), n(0))  # x^2 - 5x + 6 = 0
FACTORED = E(op("mul", op("sub", X, n(2)), op("sub", X, n(3))), n(0))  # (x-2)(x-3) = 0


def test_every_step_kind_has_exactly_the_handler_the_schema_names():
    assert sorted(STEP_FUNCS) == sorted(SPEC["kinds"]), "a step kind was added or removed on one side only"
    for kind, name in SPEC["handlers"].items():
        assert getattr(steps, name) is STEP_FUNCS[kind]
    assert sorted(steps.IDENTITY_FUNCS) == sorted(SPEC["identities"])
    for ident, name in SPEC["identityHandlers"].items():
        assert getattr(steps, name) is steps.IDENTITY_FUNCS[ident]


def test_no_handler_without_a_kind():
    names = {n_ for n_ in dir(steps) if n_.startswith(("s_", "i_"))}
    assert names == set(SPEC["handlers"].values()) | set(SPEC["identityHandlers"].values())


def test_an_unknown_kind_or_identity_is_rejected_not_skipped():
    with pytest.raises(UnknownStepKind, match="guess"):
        check_step("guess", [QUAD], [FACTORED])
    with pytest.raises(UnknownStepKind, match="nonsense"):
        check_step("apply_identity", [QUAD], [FACTORED], "nonsense")
    assert check_step("apply_identity", [QUAD], [FACTORED], None)[0] is False


# one accepting and one rejecting case per kind -------------------------------------------------------------------------------------------

def test_rearrange():
    assert check_step("rearrange", [E(op("add", op("mul", n(3), X), n(5)), n(20))], [E(op("mul", n(3), X), n(15))])[0]
    ok, why = check_step("rearrange", [E(op("add", op("mul", n(3), X), n(5)), n(20))], [E(op("mul", n(3), X), n(14))])
    assert not ok and "not the same set" in why


def test_rearrange_covers_the_zero_product_step_to_the_roots():
    assert check_step("rearrange", [FACTORED], [E(X, n(2)), E(X, n(3))])[0]
    assert not check_step("rearrange", [FACTORED], [E(X, n(2))])[0]


def test_factorise():
    assert check_step("factorise", [QUAD], [FACTORED])[0]
    wrong = E(op("mul", op("sub", X, n(2)), op("sub", X, n(4))), n(0))
    assert not check_step("factorise", [QUAD], [wrong])[0]
    assert "not a product" in check_step("factorise", [FACTORED], [QUAD])[1]


def test_expand():
    assert check_step("expand", [FACTORED], [QUAD])[0]
    assert not check_step("expand", [FACTORED], [E(op("add", op("sub", X2, op("mul", n(5), X)), n(7)), n(0))])[0]
    assert "not expanded" in check_step("expand", [QUAD], [FACTORED])[1]


def test_simplify():
    assert check_step("simplify", [E(op("add", op("mul", n(2), X), op("mul", n(3), X)), n(10))], [E(op("mul", n(5), X), n(10))])[0]
    assert not check_step("simplify", [E(op("add", op("mul", n(2), X), op("mul", n(3), X)), n(10))], [E(op("mul", n(6), X), n(10))])[0]


def test_substitute():
    src = E(op("add", op("mul", n(3), X), n(5)), n(20))
    assert check_step("substitute", [src], [E(op("add", op("mul", n(3), n(5)), n(5)), n(20))])[0]
    ok, why = check_step("substitute", [src], [E(op("add", op("mul", n(3), n(5)), n(5)), n(21))])
    assert not ok and "no single value" in why
    assert not check_step("substitute", [src], [src])[0]  # the result must have no unknown


def test_evaluate():
    assert check_step("evaluate", [E(op("add", n(2), n(3)), n(5))], [E(op("add", n(2), n(3)), n(5))])[0]
    ok, why = check_step("evaluate", [], [E(op("add", n(2), n(3)), n(6))])
    assert not ok and "is false" in why
    assert not check_step("evaluate", [], [E(X, n(5))])[0]


def test_take_root_keeps_both_signed_roots():
    src = E(X2, n(25))
    assert check_step("take_root", [src], [E(X, n(5)), E(X, n(-5))])[0]
    ok, why = check_step("take_root", [src], [E(X, n(5))])
    assert not ok and "both signed roots must be kept" in why
    assert not check_step("take_root", [src], [E(X, n(5)), E(X, n(-4))])[0]
    assert check_step("take_root", [E(X2, n(0))], [E(X, n(0))])[0]


def test_apply_identity_vieta():
    assert check_step("apply_identity", [QUAD], [E(sy("S"), n(5))], "vieta_sum")[0]
    assert not check_step("apply_identity", [QUAD], [E(sy("S"), n(6))], "vieta_sum")[0]
    assert check_step("apply_identity", [QUAD], [E(sy("P"), n(6))], "vieta_product")[0]
    assert not check_step("apply_identity", [QUAD], [E(sy("P"), n(5))], "vieta_product")[0]
    assert not check_step("apply_identity", [E(op("add", op("mul", n(2), X), n(1)), n(0))], [E(sy("S"), n(5))], "vieta_sum")[0]  # not a quadratic


def test_apply_identity_difference_of_squares():
    src = E(op("sub", X2, n(9)), n(0))
    assert check_step("apply_identity", [src], [E(op("mul", op("sub", X, n(3)), op("add", X, n(3))), n(0))], "difference_of_squares")[0]
    assert not check_step("apply_identity", [src], [E(op("mul", op("sub", X, n(3)), op("sub", X, n(3))), n(0))], "difference_of_squares")[0]
    assert not check_step("apply_identity", [E(op("add", X2, n(9)), n(0))], [E(op("mul", op("sub", X, n(3)), op("add", X, n(3))), n(0))], "difference_of_squares")[0]


# the three chains ------------------------------------------------------------------------------------------------------------------------

def claim(cid, kind, **kw):
    return {"id": cid, "beatId": "b1", "kind": kind, **kw}


def bundle(expressions, claims):
    return {"expressions": expressions, "claims": claims, "scenes": []}


def test_chain_sum_of_the_roots_of_a_quadratic():
    ex = {
        "quad": QUAD_NODE,
        "fac": eq(op("mul", op("sub", X, n(2)), op("sub", X, n(3))), n(0)),
        "total": eq(op("add", n(2), n(3)), n(5)),
        "rule": eq(sy("S"), n(5)),
    }
    claims = [
        claim("c.fac", "equivalent", a="quad", b="fac", usesStep="c.start", stepKind="factorise") | {"usesStep": "c.start"},
        claim("c.start", "equivalent", a="quad", b="quad"),
        claim("c.roots", "roots", equation="quad", values=[n(2), n(3)], usesStep="c.fac", stepKind="rearrange"),
        claim("c.sum", "sum-of-roots", equation="quad", equals="total", usesStep="c.roots", stepKind="evaluate"),
        claim("c.vieta", "sum-of-roots", equation="quad", equals="rule", usesStep="c.start", stepKind="apply_identity", identity="vieta_sum"),
    ]
    report = verify_bundle(bundle(ex, claims))
    assert [c.detail for c in report.checks if c.kind == "step" and not c.ok] == []
    assert sum(1 for c in report.checks if c.kind == "step") == 4  # c.start uses nothing
    assert report.ok  # the whole verifier, claims and steps, accepts this chain


def test_chain_solving_a_linear_equation():
    ex = {
        "e0": eq(op("add", op("mul", n(3), X), n(5)), n(20)),
        "e1": eq(op("mul", n(3), X), n(15)),
        "e2": eq(X, n(5)),
        "chk": eq(op("add", op("mul", n(3), n(5)), n(5)), n(20)),
    }
    claims = [
        claim("c.e0", "equivalent", a="e0", b="e0"),
        claim("c.e1", "equivalent", a="e0", b="e1", usesStep="c.e0", stepKind="rearrange"),
        claim("c.e2", "equivalent", a="e1", b="e2", usesStep="c.e1", stepKind="rearrange"),
        claim("c.chk", "equivalent", a="e0", b="chk", usesStep="c.e0", stepKind="substitute"),
    ]
    report = verify_bundle(bundle(ex, claims))
    assert [c.detail for c in report.checks if c.kind == "step" and not c.ok] == []
    assert sum(1 for c in report.checks if c.kind == "step") == 3
    # The FULL verifier (claims as well as steps) rejects this chain: the substitution check 3*5+5 = 20 is a true closed equation (the equality check
    # accepts it) but it cannot be stated as a claim, because `equivalent` needs two equations with one common unknown. ADR 0042 proposes the smallest addition.
    failed = {c.id: c.detail for c in report.checks if not c.ok}
    assert list(failed) == ["c.chk"] and "one common unknown" in failed["c.chk"]
    assert not report.ok


def test_chain_pythagoras_needs_a_kind_the_set_does_not_have():
    """c^2 = 3^2 + 4^2 -> c^2 = 25 (evaluate) -> c = 5 and c = -5 (take_root). A length is positive, so the next step discards -5.

    That step (restrict a root by what the quantity means) is not in the closed set, and the theorem itself (a^2 + b^2 = c^2 for a right triangle)
    is not a symbolic identity the verifier can prove. See ADR 0042: proposed, not added.
    """
    c = sy("c")
    ex = {
        "p0": eq(op("pow", c, n(2)), op("add", op("pow", n(3), n(2)), op("pow", n(4), n(2)))),
        "p1": eq(op("pow", c, n(2)), n(25)),
        "p2": eq(c, n(5)),
    }
    claims = [
        claim("c.p0", "equivalent", a="p0", b="p0"),
        claim("c.p1", "equivalent", a="p0", b="p1", usesStep="c.p0", stepKind="simplify"),
        claim("c.p2", "equivalent", a="p1", b="p2", usesStep="c.p1", stepKind="take_root"),  # drops -5: the set rejects this as take_root
    ]
    report = verify_bundle(bundle(ex, claims))
    failed = {c.id: c.detail for c in report.checks if c.kind == "step" and not c.ok}
    assert list(failed) == ["c.p2"] and "both signed roots must be kept" in failed["c.p2"]
    # the claim check fails too: c = 5 is not equivalent to c^2 = 25 (it drops -5), so the lesson cannot state the positive length as an `equivalent` claim
    claim_failed = [c.detail for c in report.checks if c.kind == "claim" and not c.ok]
    assert len(claim_failed) == 1 and "not equivalent" in claim_failed[0]
    assert not report.ok


def test_a_step_with_half_its_declaration_or_an_unknown_kind_is_rejected():
    ex = {"quad": QUAD_NODE}
    for extra in ({"usesStep": "c.a"}, {"stepKind": "simplify"}, {"usesStep": "c.a", "stepKind": "guess"}, {"usesStep": "c.zzz", "stepKind": "simplify"}):
        claims = [claim("c.a", "equivalent", a="quad", b="quad"), claim("c.b", "equivalent", a="quad", b="quad", **extra)]
        report = verify_bundle(bundle(ex, claims))
        assert any(c.kind == "step" and c.id == "c.b" and not c.ok for c in report.checks), extra


QUAD_NODE = eq(op("add", op("sub", X2, op("mul", n(5), X)), n(6)), n(0))
