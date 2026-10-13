import { describe, expect, it } from "vitest";
import { UnsafePromptError, assertPromptSafe, findPersonalData, findSecrets } from "../src";

// Fake keys are built at run time so that this file itself never looks like a leaked key to `pnpm secrets:check`.
const googleKey = `AI${"za"}${"Sy".padEnd(2, "x")}${"A1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6Q"}`;
const awsKey = `AK${"IA"}${"ABCDEFGHIJKLMNOP"}`;
const openai = `sk${"-"}${"proj_abcdefghijklmnopqrstuvwxyz0123456789"}`;
/** Built at run time too: a long run of letters assigned to a key name is exactly what the scan looks for. */
const longValue = ["abcdefghij", "klmnopqrst", "uvwxyz0123"].join("");
const github = `gh${"p_"}${"abcdefghijklmnopqrstuvwxyz0123456789ABCD"}`;

describe("personal data in a prompt", () => {
  it.each([
    ["an email", "Write to maria.k+test@example.co.in about it"],
    ["an email in a sentence", "ask teacher@school.org."],
    ["an Indian mobile", "call 9876543210 now"],
    ["an Indian mobile with +91", "call +91 98765 43210"],
    ["an Indian mobile with +91 and a dash", "call +91-9876543210"],
    ["an Indian mobile with a leading 0", "call 09876543210"],
    ["an international number", "ring +44 20 7946 0958 today"],
    ["a US number", "ring (415) 555-2671 today"],
    ["a US number with dots", "ring 415.555.2671 today"],
  ])("blocks %s", (_n, text) => {
    expect(findPersonalData(text).length).toBeGreaterThan(0);
    expect(() => assertPromptSafe(text)).toThrow(UnsafePromptError);
  });

  it.each([
    ["an equation", "x^2 - 5x + 6 = 0"],
    ["a sentence of maths", "The roots 2 and 3 add up to 5."],
    ["a year and a class", "In 2026, Class 12 learns integrals."],
    ["a nine digit number", "a number like 123456789 is large"],
    ["a decimal", "pi is 3.14159265358979"],
    ["a list of numbers", "1, 2, 3, 4, 5, 6, 7, 8, 9, 10"],
    ["a coordinate pair", "the point (2, 3) lies on the curve"],
    ["an expression id", "{expr:eq1} and src.quad.roots.001"],
    ["an at sign without a domain", "the user @ home"],
    ["Devanagari text", "विद्यार्थियों के लिए द्विघात समीकरण"],
  ])("lets %s through", (_n, text) => {
    expect(findPersonalData(text)).toEqual([]);
    expect(() => assertPromptSafe(text)).not.toThrow();
  });

  it("says what kind, on which line, and shows only the start of it", () => {
    const f = findPersonalData("line one\nmail me at someone@example.com please");
    expect(f).toEqual([{ kind: "email address", line: 2, preview: "some..." }]);
    expect(() => assertPromptSafe("a\nb@example.com")).toThrow(/email address \(line 2, "b@ex\.\.\."\)/);
  });

  it("a phone number is counted once even when two patterns see it", () => {
    expect(findPersonalData("call +91 98765 43210").filter((f) => f.kind === "phone number")).toHaveLength(1);
  });
});

describe("secrets", () => {
  it.each([
    ["a Google API key", `key is ${googleKey}`],
    ["an AWS key id", `id ${awsKey}`],
    ["an OpenAI-style key", `token ${openai}`],
    ["a GitHub token", `use ${github}`],
    ["a private key block", `${"-".repeat(5)}BEGIN RSA PRIVATE KEY${"-".repeat(5)}
abc`],
    ["a long value assigned to an API key", `GEMINI_API_KEY=${longValue}`],
    ["a quoted secret in code", `const secret = "${longValue}9";`],
    ["a JSON password", `{"password": "${longValue}"}`],
  ])("finds %s", (_n, text) => {
    expect(findSecrets(text).length).toBeGreaterThan(0);
    expect(() => assertPromptSafe(text)).toThrow(UnsafePromptError);
  });

  it.each([
    ["an empty key in an example file", "GEMINI_API_KEY="],
    ["a placeholder", "GEMINI_API_KEY=your-key-here-your-key-here"],
    ["a reference to the environment", "const key = process.env.GEMINI_API_KEY;"],
    ["an angle-bracket placeholder", "api_key: <paste-your-api-key-here-please>"],
    ["a short value", "token = abc123"],
    ["the word key in prose", "The key idea is that the roots add up."],
    ["a mention of the variable name", "Set GEMINI_API_KEY in your environment."],
  ])("lets %s through", (_n, text) => {
    expect(findSecrets(text)).toEqual([]);
  });

  it("never prints the whole secret", () => {
    const f = findSecrets(`key is ${googleKey}`);
    expect(f[0]!.preview).toBe("AIza...");
    expect(JSON.stringify(f)).not.toContain(googleKey);
  });
});
