"""Boundary and message tests for the step handlers (ADR 0034, 0045): the places where a handler could be off by one condition. Every result is checked in full,
the verdict AND the reason, because the reason is what a teacher reads when a lesson is rejected. The handlers are mutation-tested with cosmic-ray (docs/adr/0046)."""

import pytest
from sympy import Symbol

from eve_verifier import steps
from eve_verifier.steps import UnknownStepKind, check_step
from test_steps import FACTORED, QUAD, X, X2, E, n, op, sy

Y = sy("y")
Z = sy("z")
A = sy("a")


def eq_(a, b):
    return E(a, b)


# helpers -----------------------------------------------------------------------------------------------------------------------------------

def test_unknown_prefers_x_then_the_only_symbol_and_gives_up_on_several():
    x, y, z = Symbol("x"), Symbol("y"), Symbol("z")
    assert steps._unknown(x + y) == x  # x wins even though it is not the only symbol
    assert steps._unknown(y + x + z) == x
    assert steps._unknown(y) == y  # the only symbol, whatever its name
    assert steps._unknown(y + z) is None  # two symbols, neither is x
    assert steps._unknown(Symbol("a") + x) == x
    assert steps._unknown(E(n(2), n(3)).lhs) is None  # none


def test_unknown_picks_x_even_when_an_earlier_name_sorts_first():
    a, x = Symbol("a"), Symbol("x")
    assert steps._unknown(a * x) == x


def test_one_equation_or_a_message_that_counts():
    assert steps._one([QUAD], "step") is QUAD
    assert steps._one([], "step") == "step must be one equation, found 0"
    assert steps._one([QUAD, FACTORED], "step") == "step must be one equation, found 2"


def test_solutions_union_each_in_its_own_unknown_and_refuse_a_closed_equation():
    s = steps._solutions([E(X, n(2)), E(op("pow", Y, n(1)), n(5))])
    assert s == {2, 5}
    assert steps._solutions([E(n(2), n(2))]) is None
    assert steps._solutions([E(op("add", X, Y), n(2))]) is not None  # x is the unknown; y is a parameter
    assert steps._solutions([E(op("add", Y, Z), n(2))]) is None
    assert steps._solutions([]) == steps.S.EmptySet


def test_same_is_symbolic_equality():
    x = Symbol("x")
    assert steps._same(x + x, 2 * x)
    assert not steps._same(x, x + 1)


# the handlers that take one equation each ---------------------------------------------------------------------------------------------------

@pytest.mark.parametrize("kind", ["factorise", "expand", "simplify", "substitute"])
def test_one_equation_in_and_one_out(kind):
    assert check_step(kind, [], [QUAD]) == (False, f"{kind}: the source must be one equation, found 0")
    assert check_step(kind, [QUAD, QUAD], [QUAD]) == (False, f"{kind}: the source must be one equation, found 2")
    assert check_step(kind, [QUAD], []) == (False, f"{kind}: the result must be one equation, found 0")
    assert check_step(kind, [QUAD], [QUAD, QUAD]) == (False, f"{kind}: the result must be one equation, found 2")


def test_rearrange_reasons():
    ok, why = check_step("rearrange", [FACTORED], [E(X, n(2)), E(X, n(3))])
    assert ok and why == "Eq((x - 3)*(x - 2), 0) has solutions {2, 3}; Eq(x, 2) and Eq(x, 3) has {2, 3}"
    ok, why = check_step("rearrange", [E(X, n(2))], [E(X, n(3))])
    assert not ok and why == "Eq(x, 2) has solutions {2}; Eq(x, 3) has {3}: not the same set"
    assert check_step("rearrange", [E(n(2), n(2))], [E(X, n(3))]) == (False, "rearrange: each equation needs one unknown to compare solution sets")
    assert check_step("rearrange", [E(X, n(3))], [E(n(2), n(2))]) == (False, "rearrange: each equation needs one unknown to compare solution sets")


def test_factorise_boundaries():
    # an already-correct form: a factored source "factorised" to itself is still a product, so it is accepted
    assert check_step("factorise", [FACTORED], [FACTORED])[0]
    # a square of a bracket is a factored form
    assert check_step("factorise", [E(op("add", op("sub", X2, op("mul", n(4), X)), n(4)), n(0))], [E(op("pow", op("sub", X, n(2)), n(2)), n(0))])[0]
    # a product of a number and an unbracketed x is not a factorisation into brackets
    ok, why = check_step("factorise", [E(op("mul", n(2), X), n(0))], [E(op("mul", n(2), X), n(0))])
    assert not ok and why == "2*x is not a product of factors"
    # a bare sum is not a product
    ok, why = check_step("factorise", [FACTORED], [QUAD])
    assert not ok and why == "x^2 - 5*x + 6 is not a product of factors"
    # the right side matters: the same product equal to a different number is not the source equation
    ok, why = check_step("factorise", [QUAD], [E(op("mul", op("sub", X, n(2)), op("sub", X, n(3))), n(1))])
    assert not ok and why == "Eq((x - 3)*(x - 2), 1) is not equal to Eq(x**2 - 5*x + 6, 0) on each side".replace("**", "^")
    # accepted reason
    assert check_step("factorise", [QUAD], [FACTORED]) == (True, "x^2 - 5*x + 6 = (x - 3)*(x - 2)")


def test_factorise_needs_a_sum_inside_the_product():
    # x * y has two factors but no bracket: not accepted
    ok, why = check_step("factorise", [E(op("mul", X, Y), n(0))], [E(op("mul", X, Y), n(0))])
    assert not ok and why == "x*y is not a product of factors"
    # a power of a sum is accepted, a power of a symbol is not
    assert not check_step("factorise", [E(X2, n(0))], [E(X2, n(0))])[0]


def test_expand_boundaries():
    # an already-correct form: an expanded source "expanded" to itself is accepted
    assert check_step("expand", [QUAD], [QUAD])[0]
    ok, why = check_step("expand", [QUAD], [FACTORED])
    assert not ok and why == "(x - 3)*(x - 2) is not expanded"
    ok, why = check_step("expand", [FACTORED], [E(op("add", op("sub", X2, op("mul", n(5), X)), n(7)), n(0))])
    assert not ok and why == "Eq(x**2 - 5*x + 7, 0) is not equal to Eq((x - 3)*(x - 2), 0) on each side".replace("**", "^")
    assert check_step("expand", [FACTORED], [QUAD]) == (True, "(x - 3)*(x - 2) = x^2 - 5*x + 6")
    # the right side must match too
    ok, _ = check_step("expand", [E(op("mul", op("sub", X, n(2)), op("sub", X, n(3))), n(1))], [E(op("add", op("sub", X2, op("mul", n(5), X)), n(6)), n(0))])
    assert not ok


def test_simplify_reasons():
    src = E(op("add", op("mul", n(2), X), op("mul", n(3), X)), n(10))
    assert check_step("simplify", [src], [E(op("mul", n(5), X), n(10))]) == (True, "Eq(5*x, 10) and Eq(5*x, 10) are equal on each side".replace("Eq(5*x, 10) and Eq(5*x, 10)", "Eq(5*x, 10) and Eq(5*x, 10)"))
    ok, why = check_step("simplify", [src], [E(op("mul", n(6), X), n(10))])
    assert not ok and why == "Eq(6*x, 10) is not equal to Eq(5*x, 10) on each side"
    # both sides are compared, not only the left
    ok, _ = check_step("simplify", [E(X, n(1))], [E(X, n(2))])
    assert not ok
    ok, _ = check_step("simplify", [E(X, n(1))], [E(op("add", X, n(1)), n(1))])
    assert not ok


def test_evaluate_boundaries():
    five = E(op("add", n(2), n(3)), n(5))
    assert check_step("evaluate", [], [five]) == (True, "Eq(5, 5)")
    assert check_step("evaluate", [], []) == (True, "")  # nothing to evaluate is not an error
    ok, why = check_step("evaluate", [], [E(op("add", n(2), n(3)), n(6))])
    assert not ok and why == "Eq(5, 6) is false: the left side is 5, the right side is 6"
    ok, why = check_step("evaluate", [], [E(X, n(5))])
    assert not ok and why == "Eq(x, 5) still has an unknown: evaluate gives numbers"
    # a closed source must show up among the results, on either side of one of them
    assert check_step("evaluate", [E(op("mul", n(2), n(3)), n(6))], [E(n(6), n(6))])[0]
    ok, why = check_step("evaluate", [E(op("mul", n(2), n(3)), n(6))], [five])
    assert not ok and why == "Eq(6, 6) does not evaluate to a result shown"
    # a source with an unknown is not required to match (it is the thing being evaluated)
    assert check_step("evaluate", [E(X, n(2))], [five])[0]
    # the source value may match the right side of a result
    assert check_step("evaluate", [E(n(5), n(5))], [E(n(2), n(2)), E(n(1), n(1))])[0] is False  # 5 appears in no result
    assert check_step("evaluate", [E(n(7), n(7))], [E(n(1), n(1)), E(n(7), n(7))])[0]
    assert check_step("evaluate", [E(op("add", n(2), n(3)), n(5))], [E(n(5), n(5))])[0]


def test_substitute_boundaries():
    src = E(op("add", op("mul", n(3), X), n(5)), n(20))
    good = E(op("add", op("mul", n(3), n(5)), n(5)), n(20))
    assert check_step("substitute", [src], [good]) == (True, "x = 5 in Eq(3*x + 5, 20) gives Eq(20, 20)")
    ok, why = check_step("substitute", [src], [E(op("add", op("mul", n(3), n(5)), n(5)), n(21))])
    assert not ok and why == "no single value of x turns Eq(3*x + 5, 20) into Eq(20, 21)"
    assert check_step("substitute", [src], [src]) == (False, "substitute: the source needs one unknown and the result must have none")
    assert check_step("substitute", [good], [good]) == (False, "substitute: the source needs one unknown and the result must have none")
    # the right side must follow from the same value
    ok, _ = check_step("substitute", [E(op("add", X, n(1)), op("mul", n(2), X))], [E(n(6), n(8))])
    assert not ok
    assert check_step("substitute", [E(op("add", X, n(1)), op("mul", n(2), X))], [E(n(6), n(10))])[0]
    # a value that does not satisfy the equation is still a valid substitution (it is a transformation, not a solution)
    assert check_step("substitute", [E(X, n(7))], [E(n(2), n(7))])[0] is True


def test_take_root_boundaries():
    sq = lambda k: E(X2, k)  # noqa: E731
    assert check_step("take_root", [sq(n(25))], [E(X, n(5)), E(X, n(-5))]) == (True, "Eq(x**2, 25) gives {-5, 5}".replace("**", "^"))
    # zero has one root
    assert check_step("take_root", [sq(n(0))], [E(X, n(0))])[0]
    ok, why = check_step("take_root", [sq(n(0))], [E(X, n(0)), E(X, n(1))])
    assert not ok and why == "Eq(x^2, 0) has roots {0}; the step keeps {0, 1}".replace("x^2", "x**2").replace("**", "^")
    # only the positive root: the reason says both signed roots must be kept
    ok, why = check_step("take_root", [sq(n(25))], [E(X, n(5))])
    assert not ok and why == "Eq(x^2, 25) has roots {-5, 5}; the step keeps {5}: both signed roots must be kept"
    # a wrong root is rejected without that hint
    ok, why = check_step("take_root", [sq(n(25))], [E(X, n(5)), E(X, n(-4))])
    assert not ok and why == "Eq(x^2, 25) has roots {-5, 5}; the step keeps {-4, 5}"
    # a repeated root is the same set
    assert check_step("take_root", [sq(n(25))], [E(X, n(5)), E(X, n(-5)), E(X, n(5))])[0]
    # an irrational root is compared exactly: 2 has the roots plus and minus the square root of 2, not 1.414
    assert check_step("take_root", [sq(n(2))], [E(X, n(1)), E(X, n(-1))])[0] is False
    # the source must be s^2 = number
    assert check_step("take_root", [E(op("pow", X, n(3)), n(8))], [E(X, n(2))]) == (False, "take_root: Eq(x**3, 8) is not of the form s^2 = number".replace("**", "^"))
    assert check_step("take_root", [E(X, n(8))], [E(X, n(2))])[1].endswith("is not of the form s^2 = number")
    assert check_step("take_root", [E(X2, X)], [E(X, n(2))])[1].endswith("is not of the form s^2 = number")
    # each result must be s = number, for the same s
    assert check_step("take_root", [sq(n(25))], [E(Y, n(5)), E(Y, n(-5))]) == (False, "take_root: Eq(y, 5) is not of the form x = number")
    assert check_step("take_root", [sq(n(25))], [E(X, op("add", Y, n(1)))])[1] == "take_root: Eq(x, y + 1) is not of the form x = number"
    # a bracket squared: the roots are of the bracket
    sq_bracket = E(op("pow", op("sub", X, n(1)), n(2)), n(4))
    assert check_step("take_root", [sq_bracket], [E(op("sub", X, n(1)), n(2)), E(op("sub", X, n(1)), n(-2))])[0]
    # two or no source equations
    assert check_step("take_root", [], [E(X, n(5))]) == (False, "take_root: the source must be one equation, found 0")
    assert check_step("take_root", [sq(n(25)), sq(n(25))], [E(X, n(5))]) == (False, "take_root: the source must be one equation, found 2")
    # no result at all keeps no root
    assert check_step("take_root", [sq(n(25))], [])[0] is False


def test_square_root_of_reads_off_only_what_it_can():
    r = steps._square_root_of
    x = Symbol("x")
    assert r(steps.S(9)) == 3
    assert r(steps.S(4) / 9) == steps.S(2) / 3
    assert r(steps.S(2)) is None  # irrational
    assert r(steps.S(0)) is None  # not positive
    assert r(steps.S(-4)) is None
    assert r(x**2) == x
    assert r(x**4) == x**2
    assert r(x**3) is None
    assert r(9 * x**2) == 3 * x
    assert r(2 * x**2) is None
    assert r(9 * x) is None
    assert r(x) is None
    assert r(x + 1) is None


def test_difference_of_squares_boundaries():
    def dos(src, dst):
        return check_step("apply_identity", [src], [dst], "difference_of_squares")

    src = E(op("sub", X2, n(9)), n(0))
    good = E(op("mul", op("sub", X, n(3)), op("add", X, n(3))), n(0))
    assert dos(src, good) == (True, "x**2 - 9 = (x - 3)(x + 3)".replace("**", "^"))
    # the order of the two brackets does not matter
    assert dos(src, E(op("mul", op("add", X, n(3)), op("sub", X, n(3))), n(0)))[0]
    ok, why = dos(src, E(op("mul", op("sub", X, n(3)), op("sub", X, n(3))), n(0)))
    assert not ok and why == "(x - 3)^2 is not (x - 3)(x + 3)"
    # a different right side is not the same equation
    assert not dos(src, E(op("mul", op("sub", X, n(3)), op("add", X, n(3))), n(1)))[0]
    # a sum of squares, a single term, three terms, a non-square
    assert dos(E(op("add", X2, n(9)), n(0)), good) == (False, "difference_of_squares: x**2 + 9 is not one square minus another".replace("**", "^"))
    assert dos(E(X2, n(0)), good) == (False, "difference_of_squares: x**2 is not a difference of two terms".replace("**", "^"))
    assert dos(E(op("sub", op("sub", X2, X), n(9)), n(0)), good) == (False, "difference_of_squares: x**2 - x - 9 is not a difference of two terms".replace("**", "^"))
    assert dos(E(op("sub", X2, n(2)), n(0)), good) == (False, "difference_of_squares: x**2 - 2 is not a difference of two squares".replace("**", "^"))
    # two minus terms are not one square minus another
    assert dos(E({"op": "neg", "a": op("add", X2, n(9))}, n(0)), good)[0] is False
    # a result that is not a product of exactly two brackets
    ok, _ = dos(src, E(op("sub", X2, n(9)), n(0)))
    assert not ok
    ok, _ = dos(src, E(op("mul", op("mul", op("sub", X, n(3)), op("add", X, n(3))), n(1)), n(0)))
    assert ok  # a factor 1 collapses away in SymPy, so the shape is still two brackets


@pytest.mark.parametrize("name,cases", [
    ("vieta_sum", [(QUAD, E(sy("S"), n(5)), True), (QUAD, E(sy("S"), n(6)), False)]),
    ("vieta_product", [(QUAD, E(sy("P"), n(6)), True), (QUAD, E(sy("P"), n(5)), False)]),
])
def test_vieta_verdicts_and_reasons(name, cases):
    for src, dst, expected in cases:
        ok, why = check_step("apply_identity", [src], [dst], name)
        assert ok is expected
        assert "the roots" in why
    assert check_step("apply_identity", [QUAD], [E(sy("S"), n(5))], "vieta_sum")[1] == "for Eq(x^2 - 5*x + 6, 0) the roots add up to 5; the step says 5"
    assert check_step("apply_identity", [QUAD], [E(sy("P"), n(6))], "vieta_product")[1] == "for Eq(x^2 - 5*x + 6, 0) the roots multiply to 6; the step says 6"


@pytest.mark.parametrize("name", ["vieta_sum", "vieta_product"])
def test_vieta_refusals(name):
    dst = E(sy("S"), n(5))
    assert check_step("apply_identity", [E(op("add", op("mul", n(2), X), n(1)), n(0))], [dst], name) == (False, f"{name}: Eq(2*x + 1, 0) is not a quadratic")
    assert check_step("apply_identity", [E(n(1), n(0))], [dst], name) == (False, f"{name}: the source needs one unknown")
    assert check_step("apply_identity", [], [dst], name) == (False, f"{name}: the source must be one equation, found 0")
    assert check_step("apply_identity", [QUAD], [], name) == (False, f"{name}: the result must be one equation, found 0")
    assert check_step("apply_identity", [QUAD], [dst, dst], name)[1].endswith("found 2")
    # the leading coefficient divides: 2x^2 - 10x + 12 has the same sum and product as the monic one
    two = E(op("add", op("sub", op("mul", n(2), X2), op("mul", n(10), X)), n(12)), n(0))
    assert check_step("apply_identity", [two], [E(sy("S"), n(5))], "vieta_sum")[0]
    assert check_step("apply_identity", [two], [E(sy("P"), n(6))], "vieta_product")[0]
    # the sum may be given as an expression, not only a number
    assert check_step("apply_identity", [QUAD], [E(sy("S"), op("add", n(2), n(3)))], "vieta_sum")[0]


def test_apply_identity_dispatch():
    assert check_step("apply_identity", [QUAD], [E(sy("S"), n(5))]) == (False, "apply_identity: the step names no identity")
    with pytest.raises(UnknownStepKind, match="no proof for identity 'nonsense'"):
        check_step("apply_identity", [QUAD], [E(sy("S"), n(5))], "nonsense")
    with pytest.raises(UnknownStepKind, match="no verifier handler for step kind 'guess'"):
        check_step("guess", [QUAD], [QUAD])
    # an identity given to another kind is ignored
    assert check_step("factorise", [QUAD], [FACTORED], "vieta_sum") == check_step("factorise", [QUAD], [FACTORED])
    assert check_step("rearrange", [E(X, n(2))], [E(X, n(2))], "vieta_sum")[0]
