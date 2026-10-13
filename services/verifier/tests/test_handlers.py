"""The exhaustiveness gate: every node type the TypeScript schema can produce has a handler here, and nothing else does."""

import json
from pathlib import Path

import pytest
from sympy import Add, Eq, Mul, Pow, Rational, Symbol

from eve_verifier import handlers
from eve_verifier.handlers import HANDLERS, UnknownNode, to_sympy

OPS = json.loads((Path(__file__).parents[3] / "packages" / "schema" / "expr-ops.json").read_text(encoding="utf-8"))


def test_every_node_type_has_exactly_the_handler_the_schema_names():
    assert sorted(HANDLERS) == sorted(OPS["ops"]), "a node type was added or removed on one side only"
    for op, name in OPS["handlers"].items():
        assert getattr(handlers, name) is HANDLERS[op], f"{op} must be handled by {name}"


def test_no_handler_without_a_node_type():
    names = {n for n in dir(handlers) if n.startswith("h_")}
    assert names == set(OPS["handlers"].values())


def test_a_node_type_added_to_the_schema_alone_fails_this_gate():
    fake = {**OPS, "ops": [*OPS["ops"], "sqrt"], "handlers": {**OPS["handlers"], "sqrt": "h_sqrt"}}
    assert sorted(HANDLERS) != sorted(fake["ops"])  # the first test above would fail
    with pytest.raises(AttributeError):
        getattr(handlers, fake["handlers"]["sqrt"])


def test_unknown_node_is_rejected_not_skipped():
    with pytest.raises(UnknownNode, match="sqrt"):
        to_sympy({"op": "sqrt", "a": {"op": "num", "n": 4}})
    with pytest.raises(UnknownNode):
        to_sympy({"a": 1})


@pytest.mark.parametrize(
    "node,want",
    [
        ({"op": "num", "n": 3}, Rational(3)),
        ({"op": "num", "n": -3, "d": 4}, Rational(-3, 4)),
        ({"op": "sym", "name": "x"}, Symbol("x")),
        ({"op": "neg", "a": {"op": "sym", "name": "x"}}, Mul(-1, Symbol("x"))),
        ({"op": "add", "a": {"op": "num", "n": 2}, "b": {"op": "num", "n": 3}}, Rational(5)),
        ({"op": "sub", "a": {"op": "num", "n": 2}, "b": {"op": "num", "n": 3}}, Rational(-1)),
        ({"op": "mul", "a": {"op": "num", "n": 2}, "b": {"op": "sym", "name": "x"}}, Mul(2, Symbol("x"))),
        ({"op": "div", "a": {"op": "num", "n": 1}, "b": {"op": "num", "n": 4}}, Rational(1, 4)),
        ({"op": "pow", "a": {"op": "sym", "name": "x"}, "b": {"op": "num", "n": 2}}, Pow(Symbol("x"), 2)),
    ],
)
def test_each_handler_builds_the_sympy_object_the_schema_documents(node, want):
    assert to_sympy(node) == want


def test_eq_keeps_both_sides():
    e = to_sympy({"op": "eq", "a": {"op": "add", "a": {"op": "num", "n": 2}, "b": {"op": "num", "n": 3}}, "b": {"op": "num", "n": 6}})
    assert isinstance(e, Eq) and e.lhs == 5 and e.rhs == 6  # not collapsed to False
    assert Add(e.lhs, 1) == 6
