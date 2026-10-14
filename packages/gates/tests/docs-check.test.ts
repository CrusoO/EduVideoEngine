import { describe, expect, it } from "vitest";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { checkDocs, docSetRows, sha256Lf } from "../../../scripts/docs-check-lib";

const repo = join(__dirname, "..", "..", "..");

/** A copy of what docs:check reads (the docs, the prompts and the two root files) with empty folders for the rest, to break one thing at a time. */
function sandbox(): string {
  const dir = mkdtempSync(join(tmpdir(), "eve-docs-"));
  for (const p of ["docs", "prompts", "CLAUDE.md", "README.md"]) cpSync(join(repo, p), join(dir, p), { recursive: true });
  for (const d of ["content", "config", ".githooks", "packages", "services/verifier", "scripts", "fixtures"]) mkdirSync(join(dir, d), { recursive: true });
  return dir;
}

describe("pnpm docs:check", () => {
  it("passes on this repository", () => {
    expect(checkDocs(repo)).toEqual([]);
  });

  it("reads the paths of the first column of the doc set table, and the state of each row", () => {
    const rows = docSetRows(readFileSync(join(repo, "docs", "ENGINE_WORKFLOW.md"), "utf8"));
    const paths = rows.flatMap((r) => r.paths);
    expect(paths).toContain("README.md");
    expect(paths).toContain("docs/ENGINE_WORKFLOW.md");
    expect(paths).toContain("docs/adr/NNNN-title.md");
    expect(rows.find((r) => r.paths.includes("ledger/"))!.state).toMatch(/local/);
  });

  it("reads the table in the plain-text layout (tab-separated, several paths to a cell) and in the Markdown layout, to the same rows", () => {
    const text = ["1. The doc set (and nothing else)", "Path\tWhat it is\tState", "README.md\tOverview\tcurrent", "packages/, services/verifier/, scripts/\tCode\tcurrent", "fixtures folder\tRecorded replies\tgenerated", "ledger/\tUsage ledger\tlocal", "", "Do not create: docs/INDEX.md", "2. Which source wins"].join("\n");
    const markdown = ["## 1. The doc set", "| Path | What it is | State |", "|---|---|---|", "| `README.md` | Overview | current |", "| `packages/`, `services/verifier/`, `scripts/` | Code | current |", "| fixtures folder | Recorded replies | generated |", "| `ledger/` | Usage ledger | local |", "", "## 2. Which source wins"].join("\n");
    const expected = [
      { paths: ["README.md"], state: "current" },
      { paths: ["packages/", "services/verifier/", "scripts/"], state: "current" },
      { paths: [], state: "generated" },
      { paths: ["ledger/"], state: "local" },
    ];
    expect(docSetRows(text)).toEqual(expected);
    expect(docSetRows(markdown)).toEqual(expected);
    expect(docSetRows("no table here")).toEqual([]);
  });

  it("finds the whole doc set table of the real workflow file", () => {
    const rows = docSetRows(readFileSync(join(repo, "docs", "ENGINE_WORKFLOW.md"), "utf8"));
    expect(rows.length).toBeGreaterThanOrEqual(15);
    expect(rows.flatMap((r) => r.paths)).toEqual(expect.arrayContaining(["README.md", "CLAUDE.md", "docs/ENGINE_PLAN.md", "docs/PEDAGOGY.md", "prompts/", "config/", ".githooks/"]));
  });

  it("fails, instead of passing without checking, when the workflow file has no doc set table", () => {
    const dir = sandbox();
    try {
      writeFileSync(join(dir, "docs", "ENGINE_WORKFLOW.md"), "Engine workflow\n\nNo table in this version.\n");
      expect(checkDocs(dir)).toEqual(["docs/ENGINE_WORKFLOW.md has no doc set table under section 1 (rows of Path, What it is, State), so the doc set cannot be checked"]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
  it("fails when a path of the doc set is missing, naming it", () => {
    const dir = sandbox();
    try {
      rmSync(join(dir, "docs", "PEDAGOGY.md"));
      expect(checkDocs(dir)).toEqual(["the doc set lists docs/PEDAGOGY.md, which is missing"]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("does not ask for local or generated folders, or for planned files", () => {
    const dir = sandbox();
    try {
      rmSync(join(dir, "fixtures"), { recursive: true, force: true });
      expect(checkDocs(dir)).toEqual([]); // fixtures and ledger/ are generated or local
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("fails when an ADR has no Status line", () => {
    const dir = sandbox();
    try {
      writeFileSync(join(dir, "docs", "adr", "9999-no-status.md"), "# ADR 9999: nothing\n\nNo status here.\n");
      expect(checkDocs(dir)).toEqual(["docs/adr/9999-no-status.md has no Status line"]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("fails when a frozen prompt no longer matches the hash in VERSIONS.md, and shows both", () => {
    const dir = sandbox();
    try {
      const file = join(dir, "prompts", "planner.v2.md");
      writeFileSync(file, readFileSync(file, "utf8") + "\nOne more line.\n");
      const problems = checkDocs(dir);
      expect(problems).toHaveLength(1);
      expect(problems[0]).toMatch(/^prompts\/planner\.v2\.md is frozen and its sha256 is [0-9a-f]{64}, but prompts\/VERSIONS\.md records af4323f1/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("fails when a prompt file is not listed in VERSIONS.md", () => {
    const dir = sandbox();
    try {
      writeFileSync(join(dir, "prompts", "planner.v9.md"), "# planner.v9\n");
      expect(checkDocs(dir)).toEqual(["prompts/planner.v9.md is not listed in prompts/VERSIONS.md"]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("hashes a file the same with LF and CRLF line endings", () => {
    expect(sha256Lf("a\r\nb\r\n")).toBe(sha256Lf("a\nb\n"));
    expect(sha256Lf(Buffer.from("a\r\nb\r\n"))).toBe(sha256Lf("a\nb\n"));
    expect(sha256Lf("a\nb\n")).not.toBe(sha256Lf("a\nb"));
  });
});
