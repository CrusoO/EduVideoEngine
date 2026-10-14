import type { LessonBundle } from "./bundle";

/**
 * The verification label a package carries (AM-3, ADR 0031). It is DERIVED from the claims when the package is built and written to package metadata, never
 * stored in the bundle, so it cannot drift from the claims or change a hash. `computed_only`: every claim is proved by the maths verifier. `mixed`: at least one
 * claim is grounded (prose a person approved). The UI wording for either is "numbers and equations checked by code" (it never says "reviewed").
 */
export type VerificationLabel = "computed_only" | "mixed";
export const verificationLabel = (bundle: Pick<LessonBundle, "claims">): VerificationLabel => ((bundle.claims ?? []).some((c) => c.claimMode === "grounded") ? "mixed" : "computed_only");
