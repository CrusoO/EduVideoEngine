import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import type { ErrorObject } from "../envelope";

const PROMPTS_DIR = resolve(__dirname, "..", "..", "..", "prompts");

/** A versioned prompt file: `prompts/<version>.md`, such as system.v1. The version is the file name; changing the text means a new version. */
export function loadPrompt(version: string): { version: string; text: string } {
  return { version, text: readFileSync(join(PROMPTS_DIR, `${version}.md`), "utf8").replace(/\r\n/g, "\n").trim() };
}

export type PassPrompt = { version: string; task: string; rules: string[]; errors: ErrorObject[]; example: { input: unknown; output: unknown } };

/**
 * A pass prompt file holds the parts of its request that are prose: ## TASK, ## RULES (numbered), ## ERROR OBJECTS (one "- when ...: {json}" per line) and
 * ## EXAMPLE (an "input:" line and an "output:" line of JSON). ALLOWED VALUES, INPUT and OUTPUT SCHEMA are built by code, never typed here.
 */
export function loadPassPrompt(version: string): PassPrompt {
  const sections = new Map<string, string>();
  for (const part of loadPrompt(version).text.split(/^## /m).slice(1)) {
    const nl = part.indexOf("\n");
    sections.set(part.slice(0, nl).trim(), part.slice(nl + 1).trim());
  }
  const get = (name: string) => {
    const s = sections.get(name);
    if (!s) throw new Error(`prompt ${version} has no ${name} section`);
    return s;
  };
  const rules = get("RULES").split("\n").map((l) => l.replace(/^\d+\.\s*/, "").trim()).filter(Boolean);
  const errors = get("ERROR OBJECTS").split("\n").filter((l) => l.startsWith("- ")).map((l) => {
    const at = l.indexOf(": {");
    if (at < 0) throw new Error(`prompt ${version}: an error object line needs "- when ...: {json}": ${l}`);
    return { when: l.slice(2, at).trim(), shape: JSON.parse(l.slice(at + 2)) as Record<string, unknown> };
  });
  const ex = get("EXAMPLE").split("\n");
  const line = (key: string) => {
    const l = ex.find((x) => x.startsWith(`${key}:`));
    if (!l) throw new Error(`prompt ${version}: the EXAMPLE has no ${key}: line`);
    return JSON.parse(l.slice(key.length + 1)) as unknown;
  };
  return { version, task: get("TASK"), rules, errors, example: { input: line("input"), output: line("output") } };
}
