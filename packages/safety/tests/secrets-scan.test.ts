import { describe, expect, it } from "vitest";
import { BINARY_EXTENSIONS, EXTRA_KEY_PATTERNS, MAX_SCAN_BYTES, isEnvFile, isSkipped, scanFile, scanHistory, scanText } from "../src/secrets-scan";

// Fake keys are built from parts, so this file never looks like a key to the scan that runs over it.
const aws = "AKIA" + "ABCDEFGHIJKLMNOP"; // 16 characters after AKIA
const google = "AIza" + "SyD-test-value-0123456789abcdefghij"; // 35 after AIza
const groq = "gsk" + "_" + "testvalue0123456789abcdefghij";
const awsSecretName = "aws_secret" + "_access_key";
const bytes = (text: string) => new TextEncoder().encode(text);
const known = (problems: string[]) => problems.filter((p) => p.includes("known key pattern"));

describe("the known key shapes", () => {
  it("match a key and nothing shorter or lookalike", () => {
    const [akia, secret, gsk, aiza] = EXTRA_KEY_PATTERNS;
    expect(akia!.test(aws)).toBe(true);
    expect(akia!.test("AKIA" + "ABCDEFGHIJKLMNO")).toBe(false); // 15 characters
    expect(akia!.test("akia" + "abcdefghijklmnop")).toBe(false);
    expect(gsk!.test(groq)).toBe(true);
    expect(gsk!.test("gsk" + "_short")).toBe(false);
    expect(aiza!.test(google)).toBe(true);
    expect(aiza!.test("AIza" + "tooshort")).toBe(false);
    expect(secret!.test(`${awsSecretName}=abcdefghijklmnopqrst`)).toBe(true);
  });
  it("the AWS secret is a leak only when a value of 20 or more characters is assigned, with or without spaces and quotes, in any case", () => {
    const secret = EXTRA_KEY_PATTERNS[1]!;
    for (const line of [`${awsSecretName} = abcdefghijklmnopqrst`, `${awsSecretName}: "abcdefghijklmnopqrst"`, `${awsSecretName.toUpperCase()}=abcdefghijklmnopqrst`, `${awsSecretName}='abcdefghijklmnopqrst`, `${awsSecretName}=abcdef/ghij+klmn=opqrst`]) expect(secret.test(line), line).toBe(true);
    for (const line of [awsSecretName, `${awsSecretName}=`, `${awsSecretName}=short`, `${awsSecretName}=abcdefghijklmnopqrs`]) expect(secret.test(line), line).toBe(false);
  });
});

describe("environment files", () => {
  it("are recognised anywhere in the tree, except the example file", () => {
    for (const name of [".env", "a/.env", "a/b/.env.local", ".env.production"]) expect(isEnvFile(name), name).toBe(true);
    for (const name of [".env.example", "a/.env.example", "environment.ts", "a/dotenv", "x.env", "a/.environment"]) expect(isEnvFile(name), name).toBe(false);
  });
  it("a tracked environment file is a problem whatever it holds, even if it is empty", () => {
    expect(scanFile("config/.env", bytes(""))).toEqual(["config/.env: an environment file must never be committed"]);
  });
});

describe("which files are skipped", () => {
  it("binary extensions, in any case, files over the size limit, and files with a zero byte", () => {
    for (const ext of BINARY_EXTENSIONS) expect(isSkipped(`a/file${ext}`, bytes("x")), ext).toBe(true);
    expect(isSkipped("a/IMAGE.PNG", bytes("x"))).toBe(true);
    expect(isSkipped("notes.txt", bytes("x"))).toBe(false);
    expect(isSkipped("png", bytes("x"))).toBe(false); // no extension
    expect(isSkipped("a.b/c", bytes("x"))).toBe(false); // the dot is in the folder
    expect(isSkipped("big.txt", new Uint8Array(MAX_SCAN_BYTES + 1))).toBe(true);
    expect(isSkipped("big.txt", new Uint8Array(MAX_SCAN_BYTES).fill(65))).toBe(false); // exactly the limit is scanned
    expect(isSkipped("zero.txt", new Uint8Array([65, 0, 66]))).toBe(true);
  });
  it("a skipped file has no problems even if it holds a key", () => {
    expect(scanFile("a.png", bytes(`key ${aws}`))).toEqual([]);
    expect(scanFile("a.txt", new Uint8Array([...bytes(`key ${aws}`), 0]))).toEqual([]);
  });
});

describe("text scan", () => {
  it("finds a known key on its own line, with the file, the line and only the start of the match", () => {
    const problems = known(scanText("src/a.ts", `fine
const k = "${aws}";
fine`));
    expect(problems).toEqual(['src/a.ts:2: matches a known key pattern ("AKIA...")']);
    expect(problems[0]).not.toContain(aws);
  });
  it("reports each pattern that matches a line, and each line", () => {
    const problems = known(scanText("f", `${aws}
nothing
${groq} and ${google}`));
    expect(problems).toEqual(['f:1: matches a known key pattern ("AKIA...")', 'f:3: matches a known key pattern ("gsk_...")', 'f:3: matches a known key pattern ("AIza...")']);
  });
  it("the general scan also reports an AWS key id, so a key is reported twice, once by each scan", () => {
    expect(scanText("f", aws).map((p) => p.includes("looks like") ? "general" : "known").sort()).toEqual(["general", "known"]);
  });
  it("also runs the general scan of the safety package (an assigned secret, a private key block)", () => {
    const block = "-----BEGIN " + "RSA PRIVATE KEY-----";
    const problems = scanText("k.pem", `${block}\nabc`);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatch(/^k\.pem:1: looks like private key block \("----\.\.\."\)$/);
  });
  it("does not complain about ordinary text, the bare variable name, or an example file", () => {
    expect(scanText("a.md", `plain prose\n${awsSecretName} is read from the environment\nGEMINI_API_KEY=`)).toEqual([]);
    expect(scanFile(".env.example", bytes("GEMINI_API_KEY=\n"))).toEqual([]);
  });
  it("scanFile decodes UTF-8 and scans it", () => {
    expect(known(scanFile("a.txt", bytes(`é ${aws}`)))).toEqual(['a.txt:1: matches a known key pattern ("AKIA...")']);
  });
});

describe("history scan", () => {
  const log = ["commit 0123456789abcdef0123456789abcdef01234567", "+++ b/src/leak.ts", `+const k = "${aws}";`, "-removed line", " context", "commit fedcba9876543210fedcba9876543210fedcba98", "+++ b/ok.ts", "+nothing here"];
  it("names the commit (12 characters) and the file that added a key, and does not print the key", () => {
    const problems = scanHistory(log);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain("commit 0123456789ab added a line in src/leak.ts");
    expect(problems[0]).toContain("Rotate that key");
    expect(problems[0]).toContain("NOT rewritten");
    expect(problems[0]).not.toContain(aws);
  });
  it("only added lines count: a removed or unchanged line with a key is not a new leak", () => {
    expect(scanHistory(["commit 0123456789abcdef0123456789abcdef01234567", "+++ b/x", `-${aws}`, ` ${aws}`])).toEqual([]);
  });
  it("the file header line is not an added line", () => {
    expect(scanHistory(["commit 0123456789abcdef0123456789abcdef01234567", `+++ b/${aws}.ts`])).toEqual([]);
  });
  it("reports every added key line, each with its own file", () => {
    const problems = scanHistory(["commit aaaaaaaaaaaa1111", "+++ b/a.ts", `+${aws}`, "+++ b/b.ts", `+${groq}`]);
    expect(problems.map((p) => p.match(/in (\S+)/)![1])).toEqual(["a.ts", "b.ts"]);
  });
});
