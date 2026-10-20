import { resolve as resolvePath } from "node:path";
import { loadStore } from "@eve/content";
import { REFERENCE_ARC_PLAN, REFERENCE_LESSON_SCRIPT, lessonContext } from "../lesson";

/** What the lesson tests share: the store, the context of the sum-of-roots skill, and the plan and script of the reference lesson in the shape the passes produce. */
export const SKILL = "MATH.ALG.QUAD.SUM_OF_ROOTS";
export const FACTORISE = "MATH.ALG.QUAD.FACTORISE";
export const { records: STORE } = loadStore(resolvePath(__dirname, "..", "..", "..", "content"));
export const context = () => lessonContext(STORE, SKILL, "en-IN", "class-10");
export const REFERENCE_PLAN = REFERENCE_ARC_PLAN;
export const REFERENCE_SCRIPT = REFERENCE_LESSON_SCRIPT;
