import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { hashOf } from "@eve/schema";
import type { LlmResponse } from "./types";

export type FixtureKeyParts = { promptVersion: string; model: string; system: string; input: string };

/**
 * The key of a recorded answer: the hash of the prompt version, the model id and the input. The system text is part of the key too, so editing a
 * prompt file without bumping its version makes the fixture "missing" (and replay fails) instead of replaying an answer to an older prompt.
 */
export const fixtureKey = (p: FixtureKeyParts): string => hashOf({ promptVersion: p.promptVersion, model: p.model, system: p.system, input: p.input });

export type Fixture = { key: string; step: string; promptVersion: string; model: string; recordedAt: string; response: LlmResponse };

/** Recorded answers, one JSON file per key. Holds the model's answer and token counts, never the key, never the prompt. */
export class FixtureStore {
  constructor(readonly dir: string) {}
  private file(key: string) {
    return join(this.dir, `${key}.json`);
  }
  has(key: string): boolean {
    return existsSync(this.file(key));
  }
  read(key: string): Fixture | undefined {
    return this.has(key) ? (JSON.parse(readFileSync(this.file(key), "utf8")) as Fixture) : undefined;
  }
  write(f: Fixture): void {
    mkdirSync(this.dir, { recursive: true });
    writeFileSync(this.file(f.key), `${JSON.stringify(f, null, 2)}\n`, "utf8");
  }
}
