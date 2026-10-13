import { verbalise, type Expr } from "@eve/schema";
import { toPlain } from "./latex";

/**
 * The spoken form of an expression for screen readers. Where a language has no reviewed speech vocabulary it falls back
 * to the ASCII reading (never a guess in words), and the caller still has MathML from KaTeX.
 */
export function spokenLabel(expr: Expr, locale: string): string {
  try {
    return verbalise(expr, locale);
  } catch {
    return toPlain(expr);
  }
}
