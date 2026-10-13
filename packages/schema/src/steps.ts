import type { IDENTITIES, STEP_KINDS } from "./bundle";

/**
 * The verifier function (Python, services/verifier/eve_verifier/steps.py) that checks each step kind (ADR 0034). Typed as a Record over every kind:
 * adding a kind to STEP_KINDS without a line here is a COMPILE ERROR, and the generated step-kinds.json is compared with the Python side by a test.
 */
export const STEP_HANDLERS: Record<(typeof STEP_KINDS)[number], string> = {
  rearrange: "s_rearrange",
  factorise: "s_factorise",
  expand: "s_expand",
  substitute: "s_substitute",
  evaluate: "s_evaluate",
  simplify: "s_simplify",
  take_root: "s_take_root",
  apply_identity: "s_apply_identity",
};
/** The proof function for each named identity. */
export const IDENTITY_HANDLERS: Record<(typeof IDENTITIES)[number], string> = {
  vieta_sum: "i_vieta_sum",
  vieta_product: "i_vieta_product",
  difference_of_squares: "i_difference_of_squares",
};
