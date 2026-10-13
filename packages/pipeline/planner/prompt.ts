import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

const PROMPTS_DIR = resolve(__dirname, "..", "..", "..", "prompts");

/** A versioned prompt file: `prompts/<version>.md`, such as planner.v1. The version is the file name; changing the text means a new version. */
export function loadPrompt(version: string): { version: string; text: string } {
  return { version, text: readFileSync(join(PROMPTS_DIR, `${version}.md`), "utf8").replace(/\r\n/g, "\n").trim() };
}
