import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const dir = join(__dirname, "..", "fonts");
const lock = JSON.parse(readFileSync(join(dir, "fonts.lock.json"), "utf8")) as Record<string, string>;
const sha = (f: string) => createHash("sha256").update(readFileSync(f)).digest("hex");
const host = join("C:", "Users", "thakur", "YourTutor", "apps", "web", "public", "fonts");

describe("bundled fonts", () => {
  it("are exactly the files in the lock (nothing swapped silently)", () => {
    for (const [name, hash] of Object.entries(lock)) expect(sha(join(dir, name)), name).toBe(hash);
  });
  it("are byte-identical to YourTutor's, so one cached copy serves both (skipped where the sibling repo is absent)", () => {
    if (!existsSync(host)) return;
    for (const name of Object.keys(lock)) expect(sha(join(host, name)), name).toBe(lock[name]);
  });
  it("fonts.css points at /fonts/<name> for every file and ships no bold or italic face", () => {
    const css = readFileSync(join(__dirname, "..", "src", "fonts.css"), "utf8");
    for (const name of Object.keys(lock)) expect(css).toContain(`url("/fonts/${name}")`);
    expect(css).not.toMatch(/font-weight: (700|800|900)/);
    expect(css).not.toMatch(/font-style: italic/);
    expect(css.match(/unicode-range:/g)).toHaveLength(Object.keys(lock).length);
  });
});
