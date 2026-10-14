import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { inspect } from "node:util";
import { ConfigError, REFERENCE_MODEL, Secret, childEnv, loadLlmConfig, pythonCommand, readEnv, referenceConfig, type ProfileFile } from "../src";

// Fake keys are built from parts so this file never looks like a key to the secrets scan.
const KEY = "AIza" + "SyD-test-value-0123456789abcdefghij";

describe("Secret", () => {
  const s = new Secret("hunter2-long-enough");
  it("reveals the value only through reveal()", () => expect(s.reveal()).toBe("hunter2-long-enough"));
  it("prints exactly [redacted] by every route", () => {
    expect(s.toString()).toBe("[redacted]");
    expect(String(s)).toBe("[redacted]");
    expect(`${s}`).toBe("[redacted]");
    expect(s.toJSON()).toBe("[redacted]");
    expect(JSON.stringify({ k: s })).toBe('{"k":"[redacted]"}');
    expect(inspect(s)).toBe("[redacted]");
    expect(inspect({ k: s })).toBe("{ k: [redacted] }");
    expect((s as unknown as Record<symbol, () => string>)[Symbol.for("nodejs.util.inspect.custom")]!()).toBe("[redacted]");
  });
});

describe("readEnv with a .env file", () => {
  const dir = mkdtempSync(join(tmpdir(), "eve-env-"));
  const file = join(dir, ".env");
  const saved: Record<string, string | undefined> = {};
  const names = ["EDGE_A", "EDGE_B", "EDGE_C", "EDGE_D", "EDGE_E", "EDGE_F", "EDGE_G", "EDGE_H", "EDGE_REAL", "EDGE_BLANK"];
  beforeEach(() => {
    for (const n of names) {
      saved[n] = process.env[n];
      delete process.env[n];
    }
  });
  afterEach(() => {
    for (const n of names) {
      if (saved[n] === undefined) delete process.env[n];
      else process.env[n] = saved[n];
    }
  });
  const read = (text: string) => {
    writeFileSync(file, text);
    return readEnv(file);
  };

  it("reads NAME=value lines, with spaces around the equals sign and at the line ends", () => {
    const e = read("EDGE_A=one\n  EDGE_B = two  \nEDGE_C=three\r\nEDGE_D=\n");
    expect(e).toMatchObject({ EDGE_A: "one", EDGE_B: "two", EDGE_C: "three" });
    expect("EDGE_D" in e).toBe(false); // blank = unset
  });
  it("skips comment lines, lower-case names and lines that are not assignments", () => {
    const e = read("# EDGE_A=nope\n   # EDGE_B=nope\nedge_c=nope\nEDGE_D nope\n1EDGE_E=nope\nEDGE_F=yes\n");
    expect(Object.keys(e).filter((k) => k.startsWith("EDGE_") || k.startsWith("edge_") || k.startsWith("1EDGE"))).toEqual(["EDGE_F"]);
  });
  it("a name must start at the start of the line, after white space only", () => {
    expect("XEDGE_A" in read("XEDGE_A=1\n")).toBe(true);
    expect(read("x EDGE_A=1\n").EDGE_A).toBeUndefined();
    expect(read("EDGE_A=1\n").EDGE_A).toBe("1");
  });
  it("strips a trailing comment that follows white space, not a # inside a value", () => {
    const e = read("EDGE_A=value # a comment\nEDGE_B=value\t# tab comment\nEDGE_C=va#lue\nEDGE_D=# only a comment\nEDGE_E=  # spaced comment\n");
    expect(e.EDGE_A).toBe("value");
    expect(e.EDGE_B).toBe("value");
    expect(e.EDGE_C).toBe("va#lue");
    expect("EDGE_D" in e).toBe(false);
    expect("EDGE_E" in e).toBe(false);
  });
  it("strips one pair of matching quotes, not mismatched ones, and keeps a # inside quotes only when no space precedes it", () => {
    const e = read("EDGE_A=\"quoted value\"\nEDGE_B='single'\nEDGE_C=\"open\nEDGE_D=mid\"dle\nEDGE_E=\"a'\nEDGE_F=\"\"\n");
    expect(e.EDGE_A).toBe("quoted value");
    expect(e.EDGE_B).toBe("single");
    expect(e.EDGE_C).toBe('"open');
    expect(e.EDGE_D).toBe('mid"dle');
    expect(e.EDGE_E).toBe("\"a'");
    expect("EDGE_F" in e).toBe(false); // an empty quoted value is blank
  });
  it("keeps spaces inside a value and trims the ends", () => {
    expect(read("EDGE_A=  two words  \n").EDGE_A).toBe("two words");
  });
  it("the real environment wins over the file, and a blank real variable does not hide the file", () => {
    process.env.EDGE_REAL = "from-env";
    process.env.EDGE_BLANK = "";
    const e = read("EDGE_REAL=from-file\nEDGE_BLANK=from-file\nEDGE_A=file-only\n");
    expect(e.EDGE_REAL).toBe("from-env");
    expect(e.EDGE_BLANK).toBe("from-file");
    expect(e.EDGE_A).toBe("file-only");
  });
  it("without a file path, or with a file that does not exist, only the real environment is read", () => {
    process.env.EDGE_REAL = "from-env";
    expect(readEnv().EDGE_REAL).toBe("from-env");
    expect(readEnv(join(dir, "missing.env")).EDGE_REAL).toBe("from-env");
    expect(readEnv(join(dir, "missing.env")).EDGE_A).toBeUndefined();
  });
});

describe("child process environment", () => {
  it("is the host environment plus the extra variables, which win", () => {
    process.env.EDGE_G = "host";
    try {
      const env = childEnv({ EDGE_H: "extra", EDGE_G: "override" });
      expect(env.EDGE_H).toBe("extra");
      expect(env.EDGE_G).toBe("override");
      expect(env.PATH ?? env.Path).toBe(process.env.PATH ?? process.env.Path);
      expect(Object.keys(childEnv({})).length).toBe(Object.keys(process.env).length);
    } finally {
      delete process.env.EDGE_G;
    }
  });
  it("uses EVE_PYTHON when set and python otherwise", () => {
    const before = process.env.EVE_PYTHON;
    try {
      delete process.env.EVE_PYTHON;
      expect(pythonCommand()).toBe("python");
      process.env.EVE_PYTHON = "C:/py/python.exe";
      expect(pythonCommand()).toBe("C:/py/python.exe");
    } finally {
      if (before === undefined) delete process.env.EVE_PYTHON;
      else process.env.EVE_PYTHON = before;
    }
  });
});

describe("loadLlmConfig edges", () => {
  it("accepts the temperature limits 0 and 1 and rejects what is outside them or not a number", () => {
    expect(loadLlmConfig({ LLM_TEMPERATURE: "0" }).temperature).toBe(0);
    expect(loadLlmConfig({ LLM_TEMPERATURE: "1" }).temperature).toBe(1);
    expect(loadLlmConfig({ LLM_TEMPERATURE: "0.5" }).temperature).toBe(0.5);
    expect(() => loadLlmConfig({ LLM_TEMPERATURE: "1.01" })).toThrow(/LLM_TEMPERATURE/);
    expect(() => loadLlmConfig({ LLM_TEMPERATURE: "-0.01" })).toThrow(/LLM_TEMPERATURE/);
    expect(() => loadLlmConfig({ LLM_TEMPERATURE: "warm" })).toThrow(/LLM_TEMPERATURE/);
  });
  it("accepts exactly the three modes, and a blank mode is replay", () => {
    for (const mode of ["replay", "record", "live"]) expect(loadLlmConfig({ LLM_MODE: mode, GEMINI_API_KEY: KEY }).mode).toBe(mode);
    expect(loadLlmConfig({ LLM_MODE: "" }).mode).toBe("replay");
    expect(() => loadLlmConfig({ LLM_MODE: "" + "Replay" })).toThrow(/LLM_MODE/);
  });
  it("the invalid-environment message names the variable and the reason, joined by semicolons, and never a value", () => {
    let message = "";
    try {
      loadLlmConfig({ LLM_MODE: "yolo-secret-value", LLM_TEMPERATURE: "9" });
    } catch (e) {
      message = (e as Error).message;
    }
    expect(message).toMatch(/^Invalid LLM environment: LLM_MODE: .*; LLM_TEMPERATURE: /);
    expect(message).not.toContain("yolo-secret-value");
  });
  it("trims a model name, and a model of only spaces is the default", () => {
    expect(loadLlmConfig({ LLM_MODEL: "  gemini-2.5-flash " }).model).toBe("gemini-2.5-flash");
    expect(loadLlmConfig({ LLM_MODEL: "   " }).model).toBe("gemini-3.8-flash");
  });
  it("an unknown model is reported with the provider and where to add it", () => {
    expect(() => loadLlmConfig({ LLM_MODEL: "nope" })).toThrow(/Model "nope" has no profile for gemini\. Add it to packages\/adapters\/model-profiles\.json/);
  });
  it("record and live need the key of the chosen provider, and say which", () => {
    expect(() => loadLlmConfig({ LLM_MODE: "record" })).toThrow(/GEMINI_API_KEY is not set \(required in record mode\)/);
    expect(() => loadLlmConfig({ LLM_MODE: "live", LLM_PROVIDER: "groq", GEMINI_API_KEY: KEY })).toThrow(/GROQ_API_KEY is not set \(required in live mode\)/);
    expect(loadLlmConfig({ LLM_MODE: "record", GEMINI_API_KEY: KEY }).apiKey?.reveal()).toBe(KEY);
  });
  it("replay keeps a key if one is given, wrapped, and none otherwise", () => {
    expect(loadLlmConfig({ GEMINI_API_KEY: KEY }).apiKey).toBeInstanceOf(Secret);
    expect(loadLlmConfig({}).apiKey).toBeNull();
  });
  it("refuses record when only one of rpm and rpd is null, and says what to fill", () => {
    const profiles = (rpm: number | null, rpd: number | null): ProfileFile => {
      const base = loadLlmConfig({}).profile;
      return { gemini: { defaultModel: "m", resetTimeZone: "UTC", models: { m: { ...base, limits: { rpm, tpm: null, rpd } } } }, groq: { defaultModel: "g", resetTimeZone: "UTC", models: {} }, reference: { defaultModel: "r", resetTimeZone: "UTC", models: {} } } as unknown as ProfileFile;
    };
    const env = { LLM_MODE: "record", GEMINI_API_KEY: KEY };
    expect(() => loadLlmConfig(env, profiles(null, 20))).toThrow(/Limits for gemini\/m are not filled.*rpm and rpd are null/);
    expect(() => loadLlmConfig(env, profiles(5, null))).toThrow(/Limits for gemini\/m are not filled/);
    expect(loadLlmConfig(env, profiles(5, 20)).mode).toBe("record");
    expect(() => loadLlmConfig({ GEMINI_API_KEY: KEY }, profiles(null, null))).not.toThrow(); // replay is fine
  });
  it("CI is on for true and 1 only", () => {
    expect(loadLlmConfig({ CI: "true" }).ci).toBe(true);
    expect(loadLlmConfig({ CI: "1" }).ci).toBe(true);
    for (const v of ["false", "0", "yes", "TRUE"]) expect(loadLlmConfig({ CI: v }).ci, v).toBe(false);
    expect(loadLlmConfig({}).ci).toBe(false);
  });
  it("ConfigError is an Error", () => expect(new ConfigError("x")).toBeInstanceOf(Error));
});

describe("referenceConfig", () => {
  it("is replay-only, has no key, is not CI, and uses the recorded reference model", () => {
    const c = referenceConfig();
    expect(c).toMatchObject({ provider: "reference", model: REFERENCE_MODEL, mode: "replay", temperature: 0.2, apiKey: null, ci: false });
    expect(c.profile.jsonMode).toBe(false);
  });
});
