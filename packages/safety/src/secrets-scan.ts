import { findSecrets } from "./index";

/**
 * The logic of `pnpm secrets:check`, without the git and file reading (those stay in scripts/secrets-check.ts), so it can be tested and mutation-tested.
 * Every function takes text and returns problem messages; none prints and none reads a file. A message names the file and the line and shows the start of
 * the match, never all of it.
 */

/**
 * Shapes of the keys this project has used or leaked, on top of the general scan in findSecrets. The AWS secret is matched when a value of 20 or more characters
 * is assigned to its name: the bare variable name is not a leak. Built from parts so this file never matches itself.
 */
export const EXTRA_KEY_PATTERNS: readonly RegExp[] = [
  new RegExp("AKIA" + "[0-9A-Z]{16}"),
  new RegExp("aws_secret" + "_access_key\\s*[=:]\\s*[\"']?[A-Za-z0-9/+=]{20,}", "i"),
  new RegExp("gsk" + "_[0-9A-Za-z]{20,}"),
  new RegExp("AIza" + "[0-9A-Za-z_-]{35}"),
];

export const BINARY_EXTENSIONS: ReadonlySet<string> = new Set([".wav", ".png", ".jpg", ".jpeg", ".gif", ".woff", ".woff2", ".zip", ".onnx", ".ico", ".pdf", ".mp3", ".mp4", ".ogg"]);
/** Files larger than this are not scanned (they are data, not source). */
export const MAX_SCAN_BYTES = 2 * 1024 * 1024;

const preview = (s: string): string => `${s.slice(0, 4)}...`;

/** An environment file is never committed; only the example file is allowed. */
export const isEnvFile = (name: string): boolean => /(^|\/)\.env(\.|$)/.test(name) && !name.endsWith(".env.example");

/** True for a file the scan skips: a known binary extension (case-insensitive), a file over the size limit, or one with a zero byte in it. */
export function isSkipped(name: string, bytes: Uint8Array): boolean {
  const dot = name.lastIndexOf(".");
  const extension = dot < 0 ? "" : name.slice(dot).toLowerCase();
  return BINARY_EXTENSIONS.has(extension) || bytes.length > MAX_SCAN_BYTES || bytes.includes(0);
}

/** Problems in one file: the general scan, then the known key shapes, line by line. */
export function scanText(name: string, text: string): string[] {
  const out: string[] = [];
  for (const f of findSecrets(text)) out.push(`${name}:${f.line}: looks like ${f.kind} ("${f.preview}")`);
  text.split("\n").forEach((line, i) => {
    for (const re of EXTRA_KEY_PATTERNS) {
      const m = re.exec(line);
      if (m) out.push(`${name}:${i + 1}: matches a known key pattern ("${preview(m[0])}")`);
    }
  });
  return out;
}

/** Problems in one file by name and content: an environment file, otherwise the text scan (a skipped file has none). */
export function scanFile(name: string, bytes: Uint8Array): string[] {
  if (isEnvFile(name)) return [`${name}: an environment file must never be committed`];
  if (isSkipped(name, bytes)) return [];
  return scanText(name, new TextDecoder().decode(bytes));
}

/** Problems in the output of `git log -p --format="commit <hash>"`: an added line that matches a known key shape, with the commit that added it. */
export function scanHistory(logLines: readonly string[]): string[] {
  const out: string[] = [];
  let commit = "";
  let file = "";
  for (const line of logLines) {
    if (line.startsWith("commit ")) commit = line.slice(7, 19);
    else if (line.startsWith("+++ ")) file = line.slice(6);
    else if (line.startsWith("+") && EXTRA_KEY_PATTERNS.some((re) => re.test(line))) {
      out.push(`history: commit ${commit} added a line in ${file} that matches a known key pattern. Rotate that key. History is NOT rewritten by this tool: ask the owner first.`);
    }
  }
  return out;
}
