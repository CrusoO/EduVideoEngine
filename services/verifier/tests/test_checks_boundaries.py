"""Boundary tests for eve_verifier/checks.py, written against the Cosmic Ray survivors (ADR 0047, 0056): each test pins one rule at its edge, with the reason it gives."""

from sympy import symbols

from eve_verifier.checks import _ops, _plain, _unknown, verify_bundle
from test_claims import LINEAR, QUAD, X, check_chain, claim, detail, eq, failed, n, op, run

Y = {"op": "sym", "name": "y"}
P = {"op": "sym", "name": "P"}
NOT_A_POLYNOMIAL = eq(op("div", n(1), X), n(2))  # 1/x = 2
AMBIGUOUS = eq(op("add", {"op": "sym", "name": "a"}, {"op": "sym", "name": "b"}), n(0))


def scene(*objects, sid="s"):
    return {"id": sid, "objects": list(objects)}


def bundle(expressions=None, claims=None, scenes=None):
    return {"expressions": expressions or {}, "claims": claims or [], "scenes": scenes or []}


# ---- _unknown, _plain, _ops ---------------------------------------------------------------------------------------------------------------------------------


def test_the_unknown_is_x_if_present_else_the_only_symbol_else_nothing():
    a, b, x, y = symbols("a b x y")
    assert _unknown(x + y) == x  # x wins over another symbol
    assert _unknown(a + y + x) == x
    assert _unknown(y * 2) == y  # the only symbol, whatever its name
    assert _unknown(a + b) is None  # two symbols and none is x
    assert _unknown(x * 0 + 5) is None  # no symbol at all


def test_plain_writes_the_tree_as_the_author_wrote_it():
    assert _plain(n(3)) == "3"
    assert _plain(n(1, 2)) == "1/2"
    assert _plain({"op": "num", "n": 3, "d": 1}) == "3"
    assert _plain(X) == "x"
    assert _plain({"op": "neg", "a": X}) == "-x"
    assert _plain({"op": "neg", "a": op("add", n(2), n(3))}) == "-(2 + 3)"
    assert _plain(op("add", n(2), n(3))) == "2 + 3"
    assert _plain(op("sub", n(2), n(3))) == "2 - 3"
    assert _plain(op("mul", n(2), n(3))) == "2 * 3"
    assert _plain(op("div", n(2), n(3))) == "2 / 3"
    assert _plain(op("pow", n(2), n(3))) == "2 ^ 3"
    assert _plain(op("mod", n(2), n(3))) == "2 ? 3"  # an operator it has no sign for
    assert _plain(eq(op("add", n(2), n(3)), n(6))) == "2 + 3 = 6"
    assert _plain(op("mul", op("add", n(2), n(3)), n(4))) == "(2 + 3) * 4"
    assert _plain(op("add", op("mul", n(2), n(3)), op("pow", n(4), n(2)))) == "(2 * 3) + (4 ^ 2)"


def test_the_operators_of_a_tree_are_collected_from_both_sides_at_any_depth():
    tree = op("add", op("mul", n(1), X), {"op": "neg", "a": op("pow", X, n(2))})
    assert _ops(tree) == {"add", "mul", "num", "sym", "neg", "pow"}
    assert _ops(n(1)) == {"num"}
    assert _ops({"op": "num", "n": 1, "a": 5}) == {"num"}  # a field a that is not a node is not followed


# ---- check_nodes and check_equalities -----------------------------------------------------------------------------------------------------------------------


def test_a_node_type_with_no_handler_rejects_the_lesson_and_is_named():
    r = verify_bundle(bundle({"e": {"op": "foo", "a": {"op": "bar"}, "b": n(1)}}))
    assert detail(r, "e", "expression") == "no verifier handler for node type bar, foo"  # sorted, joined
    assert not r.ok
    assert detail(verify_bundle(bundle({"e": n(1)})), "e", "expression") == "uses only supported node types"


def test_an_equality_is_true_false_or_a_division_by_zero_and_the_others_are_skipped():
    r = verify_bundle(bundle({"t": eq(op("add", n(2), n(3)), n(5)), "f": eq(op("add", n(2), n(3)), n(6)), "z": eq(op("div", n(1), n(0)), n(1)), "s": eq(X, n(1)), "v": n(1)}))
    assert detail(r, "t", "equality") == "2 + 3 = 5"
    assert detail(r, "f", "equality") == "2 + 3 = 6 is false: the left side is 5, the right side is 6"
    assert detail(r, "z", "equality") == "1 / 0 = 1 divides by zero"
    assert {c.id for c in r.checks if c.kind == "equality"} == {"t", "f", "z"}  # an equation of unknowns and a non-equation are not equalities
    assert [c.ok for c in r.checks if c.kind == "equality"] == [True, False, False]


def test_an_unknown_node_in_an_equation_is_reported_once_by_the_node_check_and_not_as_an_equality():
    r = verify_bundle(bundle({"e": {"op": "eq", "a": {"op": "foo"}, "b": n(1)}, "t": eq(n(1), n(1))}))
    assert {c.id for c in r.checks if c.kind == "equality"} == {"t"}  # the unknown node does not stop the next equation either
    assert not r.ok


def test_a_zero_denominator_on_the_right_side_is_also_a_division_by_zero():
    r = verify_bundle(bundle({"z": eq(n(1), op("div", n(1), n(0)))}))
    assert "divides by zero" in failed(r)["z"]


# ---- check_points --------------------------------------------------------------------------------------------------------------------------------------------


def graph(points, expr="f", oid="g", component="functionGraph", **props):
    return {"id": oid, "component": component, "exprRef": expr, "props": {"points": points, **props}}


def test_a_point_is_a_root_of_the_function_the_graph_shows():
    f = op("add", op("sub", op("pow", X, n(2)), op("mul", n(5), X)), n(6))
    r = verify_bundle(bundle({"f": f}, scenes=[scene(graph([2, 3]))]))
    assert r.ok
    assert detail(r, "s/g@2", "point") == "x^2 - 5*x + 6 at x = 2 is 0"
    assert [c.id for c in r.checks if c.kind == "point"] == ["s/g@2", "s/g@3"]
    bad = verify_bundle(bundle({"f": f}, scenes=[scene(graph([2, 4]))]))
    assert failed(bad) == {"s/g@4": "x^2 - 5*x + 6 at x = 4 is 2, not 0: the point is not a root"}


def test_a_function_given_as_an_equation_is_its_left_side_minus_its_right_side():
    r = verify_bundle(bundle({"q": QUAD}, scenes=[scene(graph([2], expr="q"))]))
    assert r.ok and detail(r, "s/g@2", "point") == "x^2 - 5*x + 6 at x = 2 is 0"
    assert verify_bundle(bundle({"q": QUAD}, scenes=[scene(graph([1], expr="q"))])).ok is False


def test_a_fractional_point_is_read_exactly():
    f = op("sub", op("mul", n(2), X), n(1))
    assert verify_bundle(bundle({"f": f}, scenes=[scene(graph([0.5]))])).ok
    assert not verify_bundle(bundle({"f": f}, scenes=[scene(graph([0.4]))])).ok


def test_a_highlight_checks_the_points_of_the_object_it_rings():
    f = op("sub", X, n(1))
    ring = {"id": "r", "component": "highlight", "props": {"target": "g", "points": [1]}}
    g = {"id": "g", "component": "functionGraph", "exprRef": "f", "props": {}}
    r = verify_bundle(bundle({"f": f}, scenes=[scene(g, ring)]))
    assert r.ok and detail(r, "s/r@1", "point") == "x - 1 at x = 1 is 0"
    lost = {"id": "r", "component": "highlight", "props": {"target": "nobody", "points": [1]}}
    assert failed(verify_bundle(bundle({"f": f}, scenes=[scene(g, lost)]))) == {"s/r": "the points belong to no function: the target has no expression"}
    nothing = {"id": "r", "component": "highlight", "props": {"points": [1]}}  # no target at all
    assert "s/r" in failed(verify_bundle(bundle({"f": f}, scenes=[scene(g, nothing)])))
    plain = {"id": "g2", "component": "text", "props": {}}
    ring2 = {"id": "r", "component": "highlight", "props": {"target": "g2", "points": [1]}}
    assert "s/r" in failed(verify_bundle(bundle({"f": f}, scenes=[scene(plain, ring2)])))  # the target has no expression


def test_a_graph_with_no_points_or_of_another_kind_is_not_a_point_check_and_does_not_stop_the_next():
    f = op("sub", X, n(1))
    skip = [
        {"id": "a", "component": "functionGraph", "exprRef": "f", "props": {}},
        {"id": "b", "component": "functionGraph", "exprRef": "f"},
        {"id": "c", "component": "functionGraph", "exprRef": "f", "props": {"points": []}},
        {"id": "d", "component": "text", "exprRef": "f", "props": {"points": [7]}},
        graph([1], oid="e"),
    ]
    r = verify_bundle(bundle({"f": f}, scenes=[scene(*skip)]))
    assert [c.id for c in r.checks if c.kind == "point"] == ["s/e@1"]


def test_points_on_a_function_with_no_single_unknown_fail_with_the_reason():
    r = verify_bundle(bundle({"f": op("add", {"op": "sym", "name": "a"}, {"op": "sym", "name": "b"})}, scenes=[scene(graph([1])), scene(graph([1], oid="h"), sid="t")]))
    assert failed(r) == {"s/g": "cannot check: a + b has no single unknown", "t/h": "cannot check: a + b has no single unknown"}  # the second scene is still checked


# ---- check_numberlines ---------------------------------------------------------------------------------------------------------------------------------------


def nid(v):
    return f"n{v}".replace("-", "m")


def nums(*values):
    return {nid(v): n(v) for v in values}


def line(hops, lo=0, hi=10, brackets=None, oid="l"):
    props = {"min": lo, "max": hi, "hops": [{"from": nid(a), "to": nid(b)} for a, b in hops]}
    if brackets is not None:
        props["brackets"] = brackets
    return {"id": oid, "component": "numberLine", "props": props}


def eqn(expr, oid="q"):
    return {"id": oid, "component": "equation", "exprRef": expr, "props": {}}


def run_line(hops, lo=0, hi=10, extra=None, objects=(), **kw):
    ex = nums(*{v for h in hops for v in h})
    ex.update(extra or {})
    return verify_bundle(bundle(ex, scenes=[scene(*objects, line(hops, lo, hi, **kw))]))


def test_hops_that_continue_stay_on_the_line_and_add_up_are_accepted_with_a_summary():
    r = run_line([(0, 2), (2, 5)])
    assert r.ok and detail(r, "s/l", "numberline") == "2 hops from 0 to 5, total 5"
    left = run_line([(-2, -1)], lo=-2, hi=0)
    assert left.ok and detail(left, "s/l", "numberline") == "1 hops from -2 to -1, total 1"  # the line may start below zero
    assert run_line([(0, 10)]).ok  # both ends of the line are on the line
    back = run_line([(5, 0)])
    assert back.ok and detail(back, "s/l", "numberline") == "1 hops from 5 to 0, total -5"  # a hop backwards


def test_a_line_with_no_hops_checks_nothing():
    r = run_line([])
    assert [c for c in r.checks if c.kind == "numberline"] == []


def test_a_hop_off_either_end_of_the_line_is_rejected_for_each_of_its_two_ends():
    assert failed(run_line([(0, 5)], hi=4)) == {"s/l#hop0": "hop 0 from 0 to 5 is not on the line 0 to 4"}  # the end of the hop
    assert failed(run_line([(5, 0)], hi=4)) == {"s/l#hop0": "hop 0 from 5 to 0 is not on the line 0 to 4"}  # the start of the hop
    assert failed(run_line([(-1, 3)], lo=0)) == {"s/l#hop0": "hop 0 from -1 to 3 is not on the line 0 to 10"}
    assert failed(run_line([(3, -1)], lo=0)) == {"s/l#hop0": "hop 0 from 3 to -1 is not on the line 0 to 10"}


def test_a_hop_without_length_is_rejected_and_the_next_hop_is_still_checked():
    r = run_line([(2, 2), (2, 12)])
    assert failed(r)["s/l#hop0"] == "hop 0 has no length"
    assert failed(r)["s/l#hop1"] == "hop 1 from 2 to 12 is not on the line 0 to 10"


def test_a_hop_whose_ends_are_not_numbers_is_named_and_does_not_stop_the_next_hop():
    ex = {**nums(0, 3), "q": QUAD}
    props = {"min": 0, "max": 10, "hops": [{"from": "q", "to": nid(3)}, {"from": nid(0), "to": nid(3)}, {"from": nid(0), "to": "missing"}, {"from": nid(3), "to": nid(3)}]}
    r = verify_bundle(bundle(ex, scenes=[scene({"id": "l", "component": "numberLine", "props": props})]))
    f = failed(r)
    assert f["s/l#hop0"] == "hop 0: q or n3 is not a number"
    assert f["s/l#hop2"] == "hop 2: n0 or missing is not a number"
    assert f["s/l#hop3"] == "hop 3 has no length"  # checked after the two that were not numbers
    assert "s/l#hop1" not in f  # the good hop in the middle is fine


def test_an_expression_with_an_unknown_node_or_an_unknown_in_it_is_not_a_number():
    ex = {**nums(0), "u": {"op": "foo"}, "v": X}
    props = {"min": 0, "max": 10, "hops": [{"from": nid(0), "to": "u"}, {"from": nid(0), "to": "v"}]}
    f = failed(verify_bundle(bundle(ex, scenes=[scene({"id": "l", "component": "numberLine", "props": props})])))
    assert f["s/l#hop0"] == "hop 0: n0 or u is not a number" and f["s/l#hop1"] == "hop 1: n0 or v is not a number"


def test_a_hop_must_start_where_the_last_one_ended():
    f = failed(run_line([(0, 2), (3, 5)]))
    assert f["s/l#hop1"] == "hop 1 starts at 3 but hop 0 ended at 2"
    assert f["s/l"] == "the hops add up to 4 but they span 5"
    assert run_line([(0, 2), (2, 4), (4, 6)]).ok
    assert "s/l#hop2" in failed(run_line([(0, 2), (2, 4), (5, 6)]))  # the third against the second, not the first


def test_a_bracket_must_say_the_span():
    ok = run_line([(0, 5)], extra={"lab": eq(P, n(5))}, brackets=[{"label": "lab"}])
    assert ok.ok
    bad = run_line([(0, 5)], extra={"lab": eq(P, n(6))}, brackets=[{"label": "lab"}, {"label": "lab"}])
    assert failed(bad) == {"s/l#bracket0": "the bracket spans 5 but its label says 6", "s/l#bracket1": "the bracket spans 5 but its label says 6"}
    for br in ({}, {"label": "missing"}, {"label": nid(0)}):  # no label, a label that is no expression, a label that is not an equation
        assert run_line([(0, 5)], extra=nums(0), brackets=[br]).ok
    assert run_line([(0, 5)], extra={"lab": eq(P, n(5))}, brackets=[{"label": "missing"}, {"label": "lab"}]).ok


def test_the_hops_must_add_up_to_the_sum_of_the_roots_of_the_equation_on_screen():
    ok = run_line([(0, 5)], objects=[eqn("q")], extra={"q": QUAD})
    assert ok.ok and detail(ok, "s/l", "numberline") == "1 hops from 0 to 5, total 5, the sum of the roots of the equation on screen (5)"
    bad = run_line([(0, 4)], objects=[eqn("q")], extra={"q": QUAD})
    assert failed(bad) == {"s/l": "the hops add up to 4 but the roots of the equation on screen add up to 5 (minus the coefficient of x over the leading one)"}
    negative = eq(op("add", op("pow", X, n(2)), op("mul", n(3), X)), n(0))  # x^2 + 3x = 0: the roots add up to -3
    assert run_line([(0, -3)], lo=-5, hi=5, objects=[eqn("q")], extra={"q": negative}).ok
    scaled = eq(op("add", op("sub", op("mul", n(2), op("pow", X, n(2))), op("mul", n(10), X)), n(12)), n(0))  # 2x^2 - 10x + 12: sum 5
    assert run_line([(0, 5)], objects=[eqn("q")], extra={"q": scaled}).ok
    assert not run_line([(0, 10)], objects=[eqn("q")], extra={"q": scaled}).ok  # the coefficient alone is 10, not the sum


def test_only_a_quadratic_in_one_unknown_sets_the_sum_to_meet():
    for name, expr in {"linear": LINEAR, "ambiguous": AMBIGUOUS, "not a polynomial": NOT_A_POLYNOMIAL, "cubic": eq(op("pow", X, n(3)), n(8))}.items():
        r = run_line([(0, 4)], objects=[eqn("q")], extra={"q": expr})
        assert r.ok, name
        assert "the sum of the roots" not in detail(r, "s/l", "numberline"), name
    assert run_line([(0, 4)], objects=[eqn("q")], extra={"q": n(7)}).ok  # an expression that is no equation
    assert run_line([(0, 4)], objects=[{"id": "q", "component": "equation", "props": {}}]).ok  # an equation object with no expression


def test_the_equation_must_be_in_the_scene_of_the_line():
    r = verify_bundle(bundle({**nums(0, 4), "q": QUAD, "l1": LINEAR}, scenes=[scene(eqn("q"), eqn("l1", "q2"), line([(0, 4)]))]))
    assert not r.ok  # the quadratic still holds: 4 is not 5
    other = verify_bundle(bundle({**nums(0, 4), "q": QUAD}, scenes=[scene(eqn("q"), sid="a"), scene(line([(0, 4)]), sid="b")]))
    assert other.ok  # an equation in another scene is not on screen with the line


def test_two_lines_in_one_scene_are_each_checked_and_the_scene_after_is_too():
    ex = nums(0, 1, 2, 3)
    s1 = scene(line([(0, 1)], oid="a"), line([(0, 3), (1, 2)], oid="b"), sid="x")
    s2 = scene(line([(0, 2), (1, 3)], oid="c"), sid="y")
    f = failed(verify_bundle(bundle(ex, scenes=[s1, s2])))
    assert set(f) == {"x/b#hop1", "x/b", "y/c#hop1", "y/c"}


# ---- the claim handlers: messages and edges -----------------------------------------------------------------------------------------------------------------


def only(ex, cl):
    return run(ex, [cl])


def test_a_claim_that_cannot_be_decided_fails_with_the_reason_for_every_kind():
    for kind, extra in {"roots": {"values": [n(1)]}, "sum-of-roots": {"equals": "p"}, "product-of-roots": {"equals": "p"}}.items():
        for name, expr in {"ambiguous": AMBIGUOUS, "not a polynomial": NOT_A_POLYNOMIAL}.items():
            r = only({"e": expr, "p": eq(P, n(1))}, claim("c", kind, equation="e", **extra))
            assert not r.ok, (kind, name)
            assert failed(r)["c"].startswith("cannot check:"), (kind, name)
    r = only({"e": NOT_A_POLYNOMIAL, "p": eq(P, n(1))}, claim("c", "sum-of-roots", equation="e", equals="p"))
    assert failed(r) == {"c": "cannot check: Eq(1/x, 2) is not a polynomial in x"}


def test_the_sum_of_the_roots_is_exact_and_a_wrong_sum_is_not_rescued_by_a_divisor():
    ok = only({"q": QUAD, "p": eq(P, n(5))}, claim("c", "sum-of-roots", equation="q", equals="p"))
    assert ok.ok and detail(ok, "c", "claim") == "the roots of Eq(x^2 - 5*x + 6, 0) add up to 5; the lesson says 5"
    for wrong in (1, 10, 25, 4):
        bad = only({"q": QUAD, "p": eq(P, n(wrong))}, claim("c", "sum-of-roots", equation="q", equals="p"))
        assert failed(bad) == {"c": f"the roots of Eq(x^2 - 5*x + 6, 0) add up to 5; the lesson says {wrong}"}
    double = eq(op("pow", op("sub", X, n(3)), n(2)), n(0))
    assert only({"e": double, "p": eq(P, n(6))}, claim("c", "sum-of-roots", equation="e", equals="p")).ok  # 3 twice


def test_the_product_of_the_roots_with_a_double_root_and_a_negative_root():
    double = eq(op("pow", op("sub", X, n(3)), n(2)), n(0))
    assert only({"e": double, "p": eq(P, n(9))}, claim("c", "product-of-roots", equation="e", equals="p")).ok  # 3 * 3, not 3 * 2
    assert not only({"e": double, "p": eq(P, n(6))}, claim("c", "product-of-roots", equation="e", equals="p")).ok
    assert not only({"e": double, "p": eq(P, n(3))}, claim("c", "product-of-roots", equation="e", equals="p")).ok
    neg = eq(op("sub", op("pow", X, n(2)), n(1)), n(0))  # roots -1 and 1: product -1
    r = only({"e": neg, "p": eq(P, n(-1))}, claim("c", "product-of-roots", equation="e", equals="p"))
    assert r.ok and detail(r, "c", "claim") == "the roots of Eq(x^2 - 1, 0) multiply to -1; the lesson says -1"
    assert not only({"e": neg, "p": eq(P, n(1))}, claim("c", "product-of-roots", equation="e", equals="p")).ok


def test_equivalent_equations_need_one_common_unknown_and_the_same_solutions():
    a, b = eq(op("add", op("mul", n(3), X), n(5)), n(20)), eq(op("mul", n(3), X), n(15))
    ok = only({"a": a, "b": b}, claim("c", "equivalent", a="a", b="b"))
    assert ok.ok and detail(ok, "c", "claim") == "Eq(3*x + 5, 20) has solutions {5}; Eq(3*x, 15) has {5}"
    bad = only({"a": a, "b": eq(op("mul", n(3), X), n(14))}, claim("c", "equivalent", a="a", b="b"))
    assert failed(bad)["c"].endswith(": they are not equivalent")
    for other in (eq(op("mul", n(3), Y), n(15)), AMBIGUOUS):  # another unknown; no single unknown
        assert failed(only({"a": a, "b": other}, claim("c", "equivalent", a="a", b="b"))) == {"c": "equivalent: the two equations need one common unknown"}
        assert failed(only({"a": other, "b": a}, claim("c", "equivalent", a="a", b="b"))) == {"c": "equivalent: the two equations need one common unknown"}


def test_the_claims_after_a_rejected_one_are_still_checked():
    ex = {"e": LINEAR, "bad": {"op": "foo"}}
    claims = [
        claim("c0", "guess"),
        claim("c1", "statement", statement="prose"),
        claim("c2", "roots", equation="bad", values=[n(1)]),
        claim("c3", "roots", equation="missing", values=[n(1)]),
        claim("c4", "roots", equation="e", values=[n(5)]),
    ]
    r = run(ex, claims)
    claim_checks = {c.id: c for c in r.checks if c.kind == "claim"}
    assert set(claim_checks) == {"c0", "c2", "c3", "c4"}  # a statement is approved by a person and has no check
    assert [claim_checks[i].ok for i in ("c0", "c2", "c3", "c4")] == [False, False, False, True]
    assert claim_checks["c3"].detail == "names an expression that does not exist: 'missing'"


# ---- satisfied-by edges --------------------------------------------------------------------------------------------------------------------------------------


def sat(equation, value, instance):
    return only({"e": equation, "i": instance}, claim("c", "satisfied-by", equation="e", value=value, instance="i"))


def test_a_check_that_is_true_and_a_check_that_is_not_the_substitution_say_so():
    ok = sat(LINEAR, n(5), eq(op("add", op("mul", n(3), n(5)), n(5)), n(20)))
    assert ok.ok and detail(ok, "c", "claim") == "x = 5 in Eq(3*x + 5, 20) gives Eq(20, 20), which is true"
    # each side of the instance is compared with its side of the substituted equation, and a difference on either side alone is caught
    left_only = sat(LINEAR, n(5), eq(n(10), n(20)))
    right_only = sat(LINEAR, n(5), eq(n(20), n(10)))
    assert failed(left_only)["c"] == "putting x = 5 into Eq(3*x + 5, 20) gives 20 = 20, not Eq(10, 20)"
    assert failed(right_only)["c"] == "putting x = 5 into Eq(3*x + 5, 20) gives 20 = 20, not Eq(20, 10)"


def test_a_substitution_that_is_faithful_but_false_is_rejected_for_being_false():
    for rhs in (21, 10, 40, 19):  # 20 = 21 (left below right), 20 = 10 (a multiple), 20 = 40, 20 = 19 (left above right)
        eqn_ = eq(op("add", op("mul", n(3), X), n(5)), n(rhs))
        inst = eq(op("add", op("mul", n(3), n(5)), n(5)), n(rhs))
        assert failed(sat(eqn_, n(5), inst))["c"] == f"x = 5 does not satisfy Eq(3*x + 5, {rhs}): 20 is not {rhs}", rhs


def test_a_check_needs_one_unknown_and_numbers_to_put_in_it():
    inst = eq(n(1), n(1))
    assert "single unknown" in failed(sat(eq(n(1), n(1)), n(1), inst))["c"]
    assert "single unknown" in failed(sat(AMBIGUOUS, n(1), inst))["c"]
    still = "satisfied-by: the value and the instance must be numbers, with no unknown left"
    assert failed(sat(LINEAR, n(5), eq(op("add", op("mul", n(3), X), n(5)), n(20))))["c"] == still  # the instance still has x
    assert failed(sat(LINEAR, Y, eq(n(1), n(1))))["c"] == still  # the value is a symbol, the instance is clean
    assert failed(sat(LINEAR, Y, eq(op("add", op("mul", n(3), Y), n(5)), n(20))))["c"] == still  # both are wrong


def test_the_unknown_may_be_named_anything_when_it_is_the_only_one():
    r = sat(eq(op("mul", n(3), Y), n(15)), n(5), eq(op("mul", n(3), n(5)), n(15)))
    assert r.ok and detail(r, "c", "claim").startswith("y = 5 in")


def test_a_check_of_a_rational_value_and_of_a_negative_value():
    assert sat(eq(op("mul", n(2), X), n(-3)), n(-3, 2), eq(op("mul", n(2), n(-3, 2)), n(-3))).ok
    assert not sat(eq(op("mul", n(2), X), n(-3)), n(3, 2), eq(op("mul", n(2), n(3, 2)), n(-3))).ok


# ---- check_steps edges ---------------------------------------------------------------------------------------------------------------------------------------


def test_a_step_needs_both_usesStep_and_stepKind_and_the_claims_after_it_are_still_checked():
    ex, claims = check_chain()
    half1 = claim("h1", "equivalent", a="e0", b="e1", stepKind="rearrange")  # a kind and no claim to use
    half2 = claim("h2", "equivalent", a="e0", b="e1", usesStep="c.e0")  # a claim and no kind
    ghost = claim("h3", "equivalent", a="e0", b="e1", usesStep="nobody", stepKind="rearrange")
    r = run(ex, [half1, half2, ghost, *claims])
    steps = {c.id: c for c in r.checks if c.kind == "step"}
    assert steps["h1"].detail == steps["h2"].detail == "a step needs both usesStep and stepKind" and not steps["h1"].ok and not steps["h2"].ok
    assert steps["h3"].detail == "uses unknown claim nobody" and not steps["h3"].ok
    assert steps["c.e1"].ok and steps["c.e2"].ok and steps["c.chk"].ok  # the real chain behind them is still proved
    assert "c.e0" not in steps  # a claim with no step is not a step check


def test_an_unknown_step_kind_and_a_missing_expression_in_a_step_are_reported_and_the_next_step_is_still_checked():
    ex, claims = check_chain()
    claims[1]["stepKind"] = "teleport"
    r = run(ex, claims)
    steps = {c.id: c for c in r.checks if c.kind == "step"}
    assert not steps["c.e1"].ok and "teleport" in steps["c.e1"].detail
    assert "c.e2" in steps and "c.chk" in steps  # reached after the unknown kind
    ex, claims = check_chain()
    claims[1]["b"] = "nowhere"
    r = run(ex, claims)
    steps = {c.id: c for c in r.checks if c.kind == "step"}
    assert not steps["c.e1"].ok and steps["c.e1"].detail == "names an expression that does not exist: 'nowhere'"
    assert "c.e2" in steps and "c.chk" in steps


def test_a_check_may_use_only_a_roots_claim_that_states_its_value_and_a_wrong_use_does_not_stop_the_next_claim():
    reason = "substitute: a check uses a roots claim that states the value it puts back"
    ex, claims = check_chain()
    claims[3]["usesStep"] = "c.e1"
    claims.append(claim("after", "equivalent", a="e0", b="e1", usesStep="c.e0", stepKind="rearrange"))
    r = run(ex, claims)
    assert detail(r, "c.chk", "step") == reason
    assert next(c for c in r.checks if c.id == "after" and c.kind == "step").ok
    # the roots claim states two values and the check puts back the second one
    ex, claims = check_chain(**{"c.e2__values": [n(4), n(5)]})
    assert next(c for c in run(ex, claims).checks if c.id == "c.chk" and c.kind == "step").detail != reason
    # a value that is not one of the stated ones
    for wrong in (n(6), n(4), n(0)):
        ex, claims = check_chain(**{"c.chk__value": wrong})
        assert detail(run(ex, claims), "c.chk", "step") == reason
    # a stated value written as a fraction that equals the integer is the same value
    ex, claims = check_chain(**{"c.chk__value": n(10, 2)})
    assert detail(run(ex, claims), "c.chk", "step") != reason


def test_a_step_that_uses_a_claim_without_an_equation_names_the_missing_field():
    ex, claims = check_chain()
    claims.append(claim("s", "statement", statement="prose"))
    claims.append(claim("v", "equivalent", a="e0", b="e1", usesStep="s", stepKind="rearrange"))
    r = run(ex, claims)
    steps = {c.id: c for c in r.checks if c.kind == "step"}
    assert not steps["v"].ok and steps["v"].detail == "names an expression that does not exist: 'equation'"


def test_the_result_of_each_kind_of_claim_is_what_the_next_step_starts_from():
    ex = {"e0": LINEAR, "e1": eq(op("mul", n(3), X), n(15)), "q": QUAD, "p": eq(P, n(5)), "pp": eq(P, n(6))}
    claims = [
        claim("sum", "sum-of-roots", equation="q", equals="p"),
        claim("prod", "product-of-roots", equation="q", equals="pp", usesStep="sum", stepKind="rearrange"),
        claim("eqv", "equivalent", a="e0", b="e1"),
        claim("root", "roots", equation="e0", values=[n(5)], usesStep="eqv", stepKind="rearrange"),
    ]
    steps = {c.id: c for c in run(ex, claims).checks if c.kind == "step"}
    assert steps["root"].ok  # an equivalence ends with its second equation, the next step starts from it
    assert "prod" in steps  # a sum ends with its right-hand equation
