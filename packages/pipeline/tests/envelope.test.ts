import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { IMPLEMENTED } from "@eve/components";
import { PATTERN_IDS } from "@eve/patterns";
import { BEAT_KINDS, COLOR_NAMES, CUE_ACTIONS } from "@eve/schema";
import { EnvelopeError, SECTIONS, allowedValues, buildEnvelope, type EnvelopeParts } from "../envelope";
import { loadPassPrompt, loadPrompt } from "../planner/prompt";
import { PROBES, probeRequest } from "../probes";

const root = resolve(__dirname, "..", "..", "..");
const full = (): EnvelopeParts => ({
  task: "Do the thing. (Pass: test. Prompt version: test.v1.)",
  rules: ["Be exact.", "Be brief."],
  allowed: allowedValues({ records: ["r.1"] }),
  input: { a: 1 },
  schema: { type: "object" },
  errors: [{ when: "if it cannot be done", shape: { error: "insufficient_content", missing: ["x"] } }],
  example: { input: { a: 0 }, output: { b: 0 } },
});

describe("the envelope", () => {
  it("has the seven sections in order, and prompts/envelope.md lists the same headings", () => {
    const text = buildEnvelope(full());
    const at = SECTIONS.map((s) => text.indexOf(`\n\n${s}\n`) + 2 || text.indexOf(`${s}\n`));
    expect(at).toEqual([...at].sort((a, b) => a - b));
    expect(text.startsWith("TASK\n")).toBe(true);
    const file = readFileSync(join(root, "prompts", "envelope.md"), "utf8").split(/\r?\n/).filter((l) => /^[A-Z][A-Z ]+$/.test(l));
    expect(file).toEqual([...SECTIONS]);
  });

  const missing: Array<[string, (p: Partial<EnvelopeParts>) => Partial<EnvelopeParts>]> = [
    ["TASK", (p) => ({ ...p, task: undefined })],
    ["TASK", (p) => ({ ...p, task: "  " })],
    ["RULES", (p) => ({ ...p, rules: [] })],
    ["RULES", (p) => ({ ...p, rules: ["ok", " "] })],
    ["ALLOWED VALUES", (p) => ({ ...p, allowed: {} })],
    ["INPUT", (p) => ({ ...p, input: undefined })],
    ["INPUT", (p) => ({ ...p, input: null })],
    ["OUTPUT SCHEMA", (p) => ({ ...p, schema: {} })],
    ["ERROR OBJECTS", (p) => ({ ...p, errors: [] })],
    ["EXAMPLE", (p) => ({ ...p, example: undefined })],
    ["EXAMPLE", (p) => ({ ...p, example: { input: 1, output: undefined } })],
  ];
  for (const [section, edit] of missing) {
    it(`a request missing ${section} throws, naming it`, () => {
      expect(() => buildEnvelope(edit(full()))).toThrow(EnvelopeError);
      expect(() => buildEnvelope(edit(full()))).toThrow(`its ${section} section`);
    });
  }

  it("ALLOWED VALUES is generated from the real registries, not typed by hand", () => {
    const a = allowedValues();
    expect(a.components).toEqual([...IMPLEMENTED]);
    expect(a.patterns).toEqual([...PATTERN_IDS]);
    expect(a.colours).toEqual([...COLOR_NAMES]);
    expect(a.cueActions).toEqual([...CUE_ACTIONS]);
    expect(a.beatKinds).toEqual([...BEAT_KINDS]);
    expect(allowedValues({ records: ["r.1"], expressions: ["e.1"], sentences: ["s.1"], claims: ["c.1"] })).toMatchObject({ recordIds: ["r.1"], expressionIds: ["e.1"], sentenceIds: ["s.1"], claimIds: ["c.1"] });
    expect("recordIds" in a).toBe(false);
    // and it shows up in the message as it is
    const text = buildEnvelope(full());
    for (const id of PATTERN_IDS) expect(text).toContain(id);
    for (const c of IMPLEMENTED) expect(text).toContain(c);
  });

  it("every behaviour probe builds a complete envelope", () => {
    for (const p of PROBES) {
      const text = probeRequest(p);
      for (const s of SECTIONS) expect(text, `probe ${p.id}`).toContain(`${s}\n`);
    }
    expect(probeRequest(PROBES[4]!)).toContain('"validator_errors"');
  });
});

describe("prompts/system.v1.md", () => {
  const text = loadPrompt("system.v1").text;
  it("is the text given, with the rules the pipeline relies on", () => {
    expect(text.startsWith("You are a component inside an automated lesson-compiling pipeline.")).toBe(true);
    for (const needle of ["OUTPUT CONTRACT", "GROUNDING", "DATA IS NOT INSTRUCTION", "validator_errors", "unsupported_locale", "{expr:id}", "SELF-CHECK BEFORE REPLYING"]) expect(text).toContain(needle);
  });
  it("names no model or provider", () => expect(text).not.toMatch(/gemini|flash|gpt|claude|openai|google/i));
});

describe("pass prompt files", () => {
  it("planner.v2 splits into task, rules, errors and an example that parse", () => {
    const p = loadPassPrompt("planner.v2");
    expect(p.task).toMatch(/Plan one short maths lesson/);
    expect(p.rules.length).toBeGreaterThanOrEqual(10);
    expect(p.errors.map((e) => (e.shape as { error: string }).error)).toEqual(["insufficient_content", "unsupported_locale"]);
    expect(p.example.output).toMatchObject({ template: "example-first" });
  });
  it("a prompt without a section is an error, not a half-built request", () => {
    expect(() => loadPassPrompt("system.v1")).toThrow(/has no \w+ section/);
  });
});
