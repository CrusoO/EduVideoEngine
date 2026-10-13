import { describe, expect, it } from "vitest";
import { createRequire } from "node:module";
import { mkdtempSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { inspect } from "node:util";
import { join, relative, resolve } from "node:path";
import { ConfigError, FIXTURES_DIR, FixtureStore, Ledger, LlmClient, PROFILES, REFERENCE_MODEL, Secret, loadLlmConfig, readEnv, referenceConfig, sanitize } from "../src";

const KEY = "AIza" + "SyD-test-value-0123456789abcdefghij"; // built so this file never looks like a key to the scan
const GROQ = "gsk" + "_" + "testvalue0123456789abcdefghij";

describe("configuration comes from the environment alone", () => {
  it("replay needs no keys: nothing set gives the defaults", () => {
    const c = loadLlmConfig({});
    expect(c).toMatchObject({ provider: "gemini", model: "gemini-3.8-flash", mode: "replay", temperature: 0.2, apiKey: null, ci: false });
  });
  it("blank lines are treated as unset", () => {
    const c = loadLlmConfig({ LLM_PROVIDER: "", LLM_MODEL: "  ", LLM_MODE: "", LLM_TEMPERATURE: "", GEMINI_API_KEY: "", GROQ_API_KEY: "" });
    expect(c).toMatchObject({ provider: "gemini", model: "gemini-3.8-flash", mode: "replay", temperature: 0.2, apiKey: null });
  });
  it("blank model means the provider's default from the profile file", () => {
    expect(loadLlmConfig({ LLM_PROVIDER: "groq" }).model).toBe("openai/gpt-oss-120b");
  });
  it("an unknown provider, mode, model or temperature is rejected with a message", () => {
    expect(() => loadLlmConfig({ LLM_PROVIDER: "bedrock" })).toThrow(ConfigError);
    expect(() => loadLlmConfig({ LLM_PROVIDER: "reference" })).toThrow(/LLM_PROVIDER/);
    expect(() => loadLlmConfig({ LLM_MODE: "yolo" })).toThrow(/LLM_MODE/);
    expect(() => loadLlmConfig({ LLM_MODEL: "gemini-9-flash" })).toThrow(/no profile for gemini/);
    expect(() => loadLlmConfig({ LLM_TEMPERATURE: "3" })).toThrow(/LLM_TEMPERATURE/);
    expect(() => loadLlmConfig({ LLM_PROVIDER: "groq", LLM_MODEL: "gemini-3.8-flash" })).toThrow(/no profile for groq/);
  });
  it("record or live without the provider's key throws, and the message holds no value", () => {
    for (const mode of ["record", "live"]) {
      const e = (() => {
        try {
          loadLlmConfig({ LLM_MODE: mode, LLM_PROVIDER: "groq", GEMINI_API_KEY: KEY });
        } catch (x) {
          return x as Error;
        }
      })()!;
      expect(e.message).toContain("GROQ_API_KEY is not set");
      expect(e.message).not.toContain(KEY);
    }
  });
  it("record or live refuses to run while rpm or rpd is null in the profile file", () => {
    expect(() => loadLlmConfig({ LLM_MODE: "record", LLM_MODEL: "gemini-2.5-flash", GEMINI_API_KEY: KEY })).toThrow(/Limits for gemini\/gemini-2\.5-flash are not filled/);
    const filled = loadLlmConfig({ LLM_MODE: "record", LLM_PROVIDER: "groq", GROQ_API_KEY: GROQ });
    expect(filled.profile.limits).toMatchObject({ rpm: 30, rpd: 1000 });
  });
  it("replay with a null-limit profile is fine", () => expect(loadLlmConfig({ LLM_MODE: "replay", LLM_MODEL: "gemini-2.5-flash" }).profile.limits.rpm).toBeNull());
  it("CI is read as a flag", () => expect(loadLlmConfig({ CI: "true" }).ci).toBe(true));
});

describe("a key cannot be printed by accident", () => {
  const c = loadLlmConfig({ LLM_MODE: "record", LLM_PROVIDER: "groq", GROQ_API_KEY: GROQ });
  it("JSON.stringify, String, a template, util.inspect and console.log show [redacted]", () => {
    expect(c.apiKey).toBeInstanceOf(Secret);
    for (const shown of [JSON.stringify(c), String(c.apiKey), `${c.apiKey}`, inspect(c, { depth: 5 }), inspect(c.apiKey), JSON.stringify({ k: c.apiKey })]) {
      expect(shown).not.toContain(GROQ);
      expect(shown).not.toContain("gsk_");
    }
    expect(JSON.stringify(c)).toContain("[redacted]");
    expect(c.apiKey!.reveal()).toBe(GROQ);
  });
  it("console.log of the config writes no key", () => {
    const lines: string[] = [];
    const old = console.log;
    console.log = (...a: unknown[]) => void lines.push(a.map((x) => (typeof x === "string" ? x : inspect(x, { depth: 6 }))).join(" "));
    try {
      console.log(c);
      console.log("config", c.apiKey, { c });
    } finally {
      console.log = old;
    }
    expect(lines.join("\n")).not.toContain(GROQ);
  });
  it("sanitize strips key shapes by pattern from text it has never seen", () => {
    expect(sanitize(`bad key ${KEY} and ${GROQ} and Bearer abcdefghijklmnopqrstuvwxyz123456`)).toBe("bad key [key removed] and [key removed] and [key removed]");
  });
});

describe("readEnv", () => {
  it("reads a .env file under the real environment, ignoring blanks and comments", () => {
    const dir = mkdtempSync(join(tmpdir(), "eve-env-"));
    writeFileSync(join(dir, ".env"), "# comment\nLLM_MODEL=from-file\nLLM_MODE=            # replay, record or live\nLLM_PROVIDER='groq'\nGROQ_API_KEY=\nLLM_TEMPERATURE=0.3        # low\n");
    const env = readEnv(join(dir, ".env"));
    expect(env).toMatchObject({ LLM_MODEL: "from-file", LLM_PROVIDER: "groq", LLM_TEMPERATURE: "0.3" });
    expect("LLM_MODE" in env && env.LLM_MODE === "").toBe(false);
    expect(readEnv(join(dir, "missing"))).toBeDefined();
  });
});

describe("process.env is read in one file only", () => {
  const root = resolve(__dirname, "..", "..");
  const files = (dir: string): string[] => readdirSync(dir).flatMap((n) => (statSync(join(dir, n)).isDirectory() ? (n === "node_modules" ? [] : files(join(dir, n))) : n.endsWith(".ts") ? [join(dir, n)] : []));
  it("packages/*/src contains process.env only in adapters/src/env.ts", () => {
    const hits: string[] = [];
    for (const pkg of readdirSync(root)) {
      const src = join(root, pkg, "src");
      try {
        if (!statSync(src).isDirectory()) continue;
      } catch {
        continue;
      }
      for (const f of files(src)) if (readFileSync(f, "utf8").includes("process.env")) hits.push(relative(root, f).replaceAll("\\", "/"));
    }
    expect(hits).toEqual(["adapters/src/env.ts"]);
  });
  it("the pipeline package and the scripts do not read it either", () => {
    for (const dir of [join(root, "pipeline"), join(root, "..", "scripts")]) {
      for (const f of files(dir)) expect(readFileSync(f, "utf8").includes("process.env"), f).toBe(false);
    }
  });
});

describe("the Bedrock reference recordings are read-only and need no AWS packages", () => {
  it("no AWS or smithy package is a dependency, or resolvable from the adapters package", () => {
    const pkg = JSON.parse(readFileSync(join(root(), "adapters", "package.json"), "utf8"));
    expect(Object.keys({ ...pkg.dependencies, ...pkg.devDependencies }).filter((k) => /aws|smithy/i.test(k))).toEqual([]);
    const req = createRequire(join(root(), "adapters", "package.json"));
    expect(() => req.resolve("@aws-sdk/client-bedrock-runtime")).toThrow();
    for (const f of readdirSync(join(root(), "adapters", "src"))) expect(readFileSync(join(root(), "adapters", "src", f), "utf8")).not.toMatch(/@aws-sdk|@smithy/);
  });
  it("every reference fixture replays through the client with no key, no network and no adapter", async () => {
    const store = new FixtureStore(FIXTURES_DIR);
    const refs = readdirSync(FIXTURES_DIR).map((f) => JSON.parse(readFileSync(join(FIXTURES_DIR, f), "utf8"))).filter((f) => f.model === REFERENCE_MODEL);
    expect(refs.length).toBeGreaterThanOrEqual(10);
    expect(PROFILES.reference.models[REFERENCE_MODEL]).toBeDefined();
    const client = new LlmClient({ config: referenceConfig(), fixtures: store, ledger: new Ledger(join(mkdtempSync(join(tmpdir(), "eve-ref-")), "l.jsonl")) });
    expect(client.mode).toBe("replay");
    for (const f of refs) expect(store.read(f.key)!.response.text).toBe(f.response.text);
    expect(refs.every((f) => !/AKIA|aws_secret/i.test(JSON.stringify(f)))).toBe(true);
  });
});

function root() {
  return resolve(__dirname, "..", "..");
}
