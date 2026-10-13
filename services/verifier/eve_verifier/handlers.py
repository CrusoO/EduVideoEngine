"""Expression tree (JSON, as the TypeScript schema writes it) to SymPy.

One handler per node type. The set of node types is CLOSED and lives in packages/schema/expr-ops.json, generated from the
TypeScript source: adding a node type there without a handler here fails the build (tests/test_handlers.py). This is what
keeps "every number in a lesson is verified" honest: a node the verifier cannot check cannot exist.
"""

from __future__ import annotations

from typing import Any, Callable

from sympy import Add, Eq, Mul, Pow, Rational, Symbol

Node = dict[str, Any]
Rec = Callable[[Node], Any]


class UnknownNode(ValueError):
    """A node type with no handler: the lesson is rejected, never skipped."""


def h_num(node: Node, rec: Rec) -> Any:
    return Rational(node["n"], node.get("d", 1))


def h_sym(node: Node, rec: Rec) -> Any:
    return Symbol(node["name"])


def h_neg(node: Node, rec: Rec) -> Any:
    return Mul(-1, rec(node["a"]))


def h_add(node: Node, rec: Rec) -> Any:
    return Add(rec(node["a"]), rec(node["b"]))


def h_sub(node: Node, rec: Rec) -> Any:
    return Add(rec(node["a"]), Mul(-1, rec(node["b"])))


def h_mul(node: Node, rec: Rec) -> Any:
    return Mul(rec(node["a"]), rec(node["b"]))


def h_div(node: Node, rec: Rec) -> Any:
    return Mul(rec(node["a"]), Pow(rec(node["b"]), -1))


def h_pow(node: Node, rec: Rec) -> Any:
    return Pow(rec(node["a"]), rec(node["b"]))


def h_eq(node: Node, rec: Rec) -> Any:
    # evaluate=False keeps both sides: Eq(2 + 3, 5) must not collapse to True before it is checked
    return Eq(rec(node["a"]), rec(node["b"]), evaluate=False)


HANDLERS: dict[str, Callable[[Node, Rec], Any]] = {
    "num": h_num,
    "sym": h_sym,
    "neg": h_neg,
    "add": h_add,
    "sub": h_sub,
    "mul": h_mul,
    "div": h_div,
    "pow": h_pow,
    "eq": h_eq,
}


def to_sympy(node: Node) -> Any:
    op = node.get("op")
    handler = HANDLERS.get(op)  # type: ignore[arg-type]
    if handler is None:
        raise UnknownNode(f"no verifier handler for node type {op!r}")
    return handler(node, to_sympy)
