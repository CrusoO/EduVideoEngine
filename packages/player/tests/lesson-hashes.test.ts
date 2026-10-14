import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { hindiPreview, layoutStress, quadraticRootsV1, referenceLesson } from "@eve/schema";

/** The browser specs compare what the harness serves with browser/lesson-hashes.json. This keeps that file current (run pnpm harness:hashes to update it). */
describe("the expected bundle hashes of the browser specs", () => {
  it("are the hashes of the lessons the harness serves", () => {
    const file = JSON.parse(readFileSync(join(__dirname, "browser", "lesson-hashes.json"), "utf8"));
    expect(file).toEqual({ reference: referenceLesson.hashes.bundle, v1: quadraticRootsV1.hashes.bundle, hindi: hindiPreview.hashes.bundle, stress: layoutStress.hashes.bundle });
  });
});
