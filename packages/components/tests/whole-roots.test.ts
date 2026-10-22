import { describe, expect, it } from "vitest";
import { add, eq, mul, num, pow, sub, sym, type Expr } from "@eve/schema";
import { wholeRootsOfEquation } from "../src";

const x = sym("x");
const poly = (a: number, b: number, c: number): Expr => add(add(mul(num(a), pow(x, num(2))), mul(num(b), x)), num(c));

describe("wholeRootsOfEquation: roots found by code, each checked by exact substitution (ADR 0073)", () => {
  it("finds the two roots of x^2 - 7x + 10 = 0, smaller first", () => {
    expect(wholeRootsOfEquation(eq(add(sub(pow(x, num(2)), mul(num(7), x)), num(10)), num(0)))).toEqual([2, 5]);
  });
  it("reads a right-hand side that is not zero: x^2 = 4x - 3 has roots 1 and 3", () => {
    expect(wholeRootsOfEquation(eq(pow(x, num(2)), sub(mul(num(4), x), num(3))))).toEqual([1, 3]);
  });
  it("finds negative roots and a leading coefficient: 2x^2 + 2x - 12 = 0 has roots -3 and 2", () => {
    expect(wholeRootsOfEquation(eq(poly(2, 2, -12), num(0)))).toEqual([-3, 2]);
  });
  it("gives one root for a double root, and one for a linear equation", () => {
    expect(wholeRootsOfEquation(eq(poly(1, -6, 9), num(0)))).toEqual([3]);
    expect(wholeRootsOfEquation(eq(add(mul(num(3), x), num(5)), num(20)))).toEqual([5]);
  });
  it("gives nothing when a root is not a whole number, or there is none", () => {
    expect(wholeRootsOfEquation(eq(poly(1, -1, -1), num(0)))).toBeNull(); // the golden ratio
    expect(wholeRootsOfEquation(eq(poly(2, -3, 1), num(0)))).toBeNull(); // 1 and 1/2
    expect(wholeRootsOfEquation(eq(poly(1, 0, 1), num(0)))).toBeNull(); // no real root
  });
  it("gives nothing for what is not an equation in x of degree two or less", () => {
    expect(wholeRootsOfEquation(add(x, num(1)))).toBeNull(); // not an equation
    expect(wholeRootsOfEquation(eq(pow(x, num(3)), num(8)))).toBeNull(); // degree three
    expect(wholeRootsOfEquation(eq(add(x, sym("y")), num(0)))).toBeNull(); // another symbol
    expect(wholeRootsOfEquation(eq(num(1), num(1)))).toBeNull(); // no x at all
  });
});
