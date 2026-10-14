import type { LessonBundle } from "../bundle";
import data from "./reference-lesson.en-IN.json";

/**
 * The reference lesson (WP3): the sum of the roots of a quadratic, spec 2.0.0, problem_first arc, six beats. It is data: `pnpm reference:build` makes the JSON
 * from the stored records and the pattern library (packages/gates/src/reference.ts), and a test fails when the two differ.
 */
export const referenceLesson = data as unknown as LessonBundle;
