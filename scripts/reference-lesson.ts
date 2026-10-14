/**
 * pnpm reference:build   writes the reference lesson (WP3) as sealed lesson JSON: packages/schema/src/fixtures/reference-lesson.en-IN.json.
 * The lesson is built from the stored records and the pattern library by packages/gates/src/reference.ts; the JSON is what the player harness, the voice
 * generator and the tests load, like a real lesson package. A test fails when the JSON is not what the builder makes now, so change the builder, then run this.
 */
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { buildReferenceLesson } from "../packages/gates/src";

const out = join(__dirname, "..", "packages", "schema", "src", "fixtures", "reference-lesson.en-IN.json");
const bundle = buildReferenceLesson().ctx.bundle;
writeFileSync(out, `${JSON.stringify(bundle, null, 2)}\n`);
console.log(`wrote ${out}\n${bundle.plan.beats.length} beats, ${bundle.script.length} sentences, ${bundle.scenes.length} scenes, ${bundle.claims?.length ?? 0} claims; bundle hash ${bundle.hashes.bundle}`);
