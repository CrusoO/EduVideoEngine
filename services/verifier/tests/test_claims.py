"""Claim kinds (ADR 0042, 0053): the table of kinds matches the handlers; each new kind accepts a true claim and rejects every wrong variant, with the reason;
and a linear equation is written as a chain (a test fixture, not content) and proved end to end by the whole verifier, claims and steps."""

import copy
import json
from pathlib import Path

import pytest

from eve_verifier.checks import CLAIM_HANDLERS, verify_bundle

SPEC = json.loads((Path(__file__).parents[3] / "packages" / "schema" / "claim-kinds.json").read_text(encoding="utf-8"))


def n(v, d=1):
    return {"op": "num", "n": v} if d == 1 else {"op": "num", "n": v, "d": d}


X = {"op": "sym", "name": "x"}


def op(o, a, b):
    return {"op": o, "a": a, "b": b}


def eq(a, b):
    return {"op": "eq", "a": a, "b": b}


def claim(cid, kind, **kw):
    return {"id": cid, "beatId": "b1", "kind": kind, **kw}


def run(expressions, claims):
    return verify_bundle({"expressions": expressions, "claims": claims, "scenes": []})


def failed(report):
    return {c.id: c.detail for c in report.checks if not c.ok}


def detail(report, cid, kind):
    """The detail of the check of one kind (claim, step, equality) on one id."""
    return next(c.detail for c in report.checks if c.id == cid and c.kind == kind)


# ---- the table of kinds ------------------------------------------------------------------------------------------------------------------------------------


def test_the_generated_table_of_claim_kinds_matches_the_handlers():
    assert set(SPEC["kinds"]) == set(CLAIM_HANDLERS)
    for kind, name in SPEC["handlers"].items():
        handler = CLAIM_HANDLERS[kind]
        assert (name == "none") == (handler is None), kind
        if handler is not None:
            assert handler.__name__ == name, kind


def test_every_answer_kind_is_proved_by_a_claim_kind_that_has_a_handler():
    assert set(SPEC["answerKinds"]) == {"sum-of-roots", "product-of-roots", "roots", "solution"}
    for answer_kind, claim_kind in SPEC["answerKinds"].items():
        assert CLAIM_HANDLERS[claim_kind] is not None, answer_kind


def test_an_unknown_claim_kind_is_rejected_not_skipped():
    r = run({"e": eq(X, n(1))}, [claim("c", "guess", equation="e")])
    assert not r.ok and "unknown claim kind 'guess'" in failed(r)["c"]


# ---- product-of-roots ------------------------------------------------------------------------------------------------------------------------------------


QUAD = eq(op("add", op("sub", op("pow", X, n(2)), op("mul", n(5), X)), n(6)), n(0))  # x^2 - 5x + 6 = 0: roots 2 and 3


def test_the_product_of_the_roots_is_proved_and_a_wrong_one_is_rejected_with_the_numbers():
    ok = run({"q": QUAD, "p": eq({"op": "sym", "name": "P"}, n(6))}, [claim("c", "product-of-roots", equation="q", equals="p")])
    assert ok.ok, failed(ok)
    assert detail(ok, "c", "claim") == "the roots of Eq(x^2 - 5*x + 6, 0) multiply to 6; the lesson says 6"
    bad = run({"q": QUAD, "p": eq({"op": "sym", "name": "P"}, n(7))}, [claim("c", "product-of-roots", equation="q", equals="p")])
    assert not bad.ok and "multiply to 6; the lesson says 7" in failed(bad)["c"]


def test_a_double_root_counts_twice_in_the_product():
    double = eq(op("pow", op("sub", X, n(3)), n(2)), n(0))  # (x - 3)^2 = 0: the root 3 twice, product 9
    assert run({"e": double, "p": eq({"op": "sym", "name": "P"}, n(9))}, [claim("c", "product-of-roots", equation="e", equals="p")]).ok
    assert not run({"e": double, "p": eq({"op": "sym", "name": "P"}, n(3))}, [claim("c", "product-of-roots", equation="e", equals="p")]).ok


def test_a_product_claim_with_no_single_unknown_fails_instead_of_guessing():
    amb = eq(op("add", {"op": "sym", "name": "a"}, {"op": "sym", "name": "b"}), n(0))
    r = run({"e": amb, "p": eq({"op": "sym", "name": "P"}, n(0))}, [claim("c", "product-of-roots", equation="e", equals="p")])
    assert "single unknown" in failed(r)["c"]


# ---- the roots and the solution (answer kinds roots and solution use the roots claim) ----------------------------------------------------------------


LINEAR = eq(op("add", op("mul", n(3), X), n(5)), n(20))  # 3x + 5 = 20: the root 5


def test_the_solution_of_a_linear_equation_is_a_roots_claim_with_one_value():
    assert run({"e": LINEAR}, [claim("c", "roots", equation="e", values=[n(5)])]).ok
    r = run({"e": LINEAR}, [claim("c", "roots", equation="e", values=[n(6)])])
    assert not r.ok and "has roots {5}; the lesson says {6}" in failed(r)["c"]


def test_all_the_roots_must_be_stated_for_the_roots_answer():
    assert run({"q": QUAD}, [claim("c", "roots", equation="q", values=[n(2), n(3)])]).ok
    assert "c" in failed(run({"q": QUAD}, [claim("c", "roots", equation="q", values=[n(2)])]))
    assert "c" in failed(run({"q": QUAD}, [claim("c", "roots", equation="q", values=[n(2), n(3), n(4)])]))


# ---- satisfied-by ------------------------------------------------------------------------------------------------------------------------------------


def check_chain(**over):
    """3x + 5 = 20, then 3x = 15, then x = 5, then the check 3 times 5 plus 5 equals 20: a test fixture, not content."""
    ex = {
        "e0": LINEAR,
        "e1": eq(op("mul", n(3), X), n(15)),
        "e2": eq(X, n(5)),
        "chk": eq(op("add", op("mul", n(3), n(5)), n(5)), n(20)),
    }
    claims = [
        claim("c.e0", "equivalent", a="e0", b="e0"),
        claim("c.e1", "equivalent", a="e0", b="e1", usesStep="c.e0", stepKind="rearrange"),
        claim("c.e2", "roots", equation="e0", values=[n(5)], usesStep="c.e1", stepKind="rearrange"),
        claim("c.chk", "satisfied-by", equation="e0", value=n(5), instance="chk", usesStep="c.e2", stepKind="substitute"),
    ]
    for key, value in over.items():
        target, field = key.split("__")
        if target in ex:
            ex[target] = value
        else:
            next(c for c in claims if c["id"] == target)[field] = value
    return ex, claims


def test_the_true_linear_chain_is_accepted_by_the_whole_verifier():
    ex, claims = check_chain()
    r = run(ex, claims)
    assert r.ok, failed(r)
    assert r.counts() == {"expression": 4, "equality": 1, "claim": 4, "step": 3}
    assert detail(r, "c.chk", "claim") == "x = 5 in Eq(3*x + 5, 20) gives Eq(20, 20), which is true"
    assert detail(r, "c.chk", "step") == "substitute: x = 5 in Eq(3*x + 5, 20) gives Eq(20, 20)"


@pytest.mark.parametrize(
    "name, over, claim_reason",
    [
        ("a value that does not solve the equation", {"c.chk__value": n(6)}, "putting x = 6 into Eq(3*x + 5, 20) gives 23 = 20, not Eq(20, 20)"),
        ("an instance that is false", {"chk__": eq(op("add", op("mul", n(3), n(5)), n(5)), n(21))}, "putting x = 5 into Eq(3*x + 5, 20) gives 20 = 20, not Eq(20, 21)"),
        ("an instance that is true but is not the substitution", {"chk__": eq(op("add", op("mul", n(3), n(5)), n(4)), n(19))}, "putting x = 5 into Eq(3*x + 5, 20) gives 20 = 20, not Eq(19, 19)"),
        ("an instance that still has the unknown", {"chk__": eq(op("add", op("mul", n(3), X), n(5)), n(20))}, "satisfied-by: the value and the instance must be numbers, with no unknown left"),
    ],
)
def test_each_wrong_check_is_rejected_with_its_reason(name, over, claim_reason):
    ex, claims = check_chain(**over)
    r = run(ex, claims)
    assert not r.ok, name
    assert detail(r, "c.chk", "claim") == claim_reason, name
    assert not next(c for c in r.checks if c.id == "c.chk" and c.kind == "step").ok, name  # the step is rejected too

def test_a_wrong_root_or_a_wrong_rearrangement_breaks_the_chain():
    ex, claims = check_chain()
    claims[2]["values"] = [n(6)]
    assert "c.e2" in failed(run(ex, claims))
    ex, claims = check_chain(**{"e1__": eq(op("mul", n(3), X), n(14))})
    assert not run(ex, claims).ok


def test_a_check_must_use_a_roots_claim_that_states_the_value_it_puts_back():
    ex, claims = check_chain()
    claims[3]["usesStep"] = "c.e1"  # an equivalence, not the root
    r = run(ex, claims)
    assert not r.ok
    assert detail(r, "c.chk", "step") == "substitute: a check uses a roots claim that states the value it puts back"
    ex, claims = check_chain()
    claims[2]["values"] = [n(5)]
    claims[3]["value"] = n(4)  # the roots claim says 5 but the check puts 4 back
    assert detail(run(ex, claims), "c.chk", "step") == "substitute: a check uses a roots claim that states the value it puts back"


def test_a_satisfied_by_claim_without_a_single_unknown_fails_instead_of_guessing():
    amb = eq(op("add", {"op": "sym", "name": "a"}, {"op": "sym", "name": "b"}), n(0))
    r = run({"e": amb, "i": eq(n(1), n(1))}, [claim("c", "satisfied-by", equation="e", value=n(1), instance="i")])
    assert "single unknown" in failed(r)["c"]


def test_a_satisfied_by_claim_naming_a_missing_expression_fails():
    r = run({"e": LINEAR}, [claim("c", "satisfied-by", equation="e", value=n(5), instance="nope")])
    assert "does not exist" in failed(r)["c"]


def test_the_check_of_a_rational_root():
    two_x = eq(op("mul", n(2), X), n(1))  # 2x = 1: the root 1/2
    inst = eq(op("mul", n(2), n(1, 2)), n(1))
    assert run({"e": two_x, "i": inst}, [claim("c", "satisfied-by", equation="e", value=n(1, 2), instance="i")]).ok


def test_the_chain_is_unchanged_by_copying_the_bundle():
    ex, claims = check_chain()
    assert run(copy.deepcopy(ex), copy.deepcopy(claims)).ok
