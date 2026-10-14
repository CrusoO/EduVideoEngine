/**
 * pnpm harness:hashes   writes packages/player/tests/browser/lesson-hashes.json: the bundle hash of each lesson the player harness can serve.
 * The browser specs read it to check that the harness they talk to serves the lesson of THIS folder (ADR 0050). A unit test fails when the file is out of date,
 * so change a lesson, then run this.
 */
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { hindiPreview, layoutStress, quadraticRootsV1, referenceLesson } from "../packages/schema/src";

const out = join(__dirname, "..", "packages", "player", "tests", "browser", "lesson-hashes.json");
const hashes = { reference: referenceLesson.hashes.bundle, v1: quadraticRootsV1.hashes.bundle, hindi: hindiPreview.hashes.bundle, stress: layoutStress.hashes.bundle };
writeFileSync(out, `${JSON.stringify(hashes, null, 2)}\n`);
console.log(`wrote ${out}\n${JSON.stringify(hashes, null, 2)}`);
