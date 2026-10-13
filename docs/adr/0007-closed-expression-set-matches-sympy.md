# ADR 0007: the expression node set is closed and maps one-to-one onto SymPy

Status: accepted. Verifier: SymPy (school maths: algebra, trig, calculus, exact rationals).

`EXPR_OPS` is a closed list and `SYMPY_NODE` maps every node type to the SymPy construct that checks it. A test fails
if the two ever differ. A node type the verifier cannot check must not be added: "every number is verified" would
silently stop being true. Chemistry equations need a separate balancer and are out of scope until a chemistry lesson exists.
