/**
 * What may never leave this machine and what may never be committed.
 *  - Prompts go to a free-tier model whose terms let the provider use them to improve its products and let humans read them (ADR 0022).
 *    So a prompt may hold only content the owner wrote or that is openly licensed: never an email address, never a phone number.
 *  - A key must never be in git, in a log, in a fixture or in an ADR.
 * Pure functions, no dependencies, used by the LLM adapter (before every call) and by `pnpm secrets:check` (over every tracked file).
 */

export type SafetyFinding = { kind: string; line: number; /** the start of the match only, never all of it */ preview: string };

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g;

/** Phone numbers: Indian mobiles (with or without +91 or 0), international numbers with a plus, and the usual US layouts. A bare run of 10 digits starting 6 to 9 counts. */
const PHONES: RegExp[] = [
  /(?<![\d.])(?:\+91[\s-]?|0)?[6-9]\d{4}[\s-]?\d{5}(?![\d])/g,
  /(?<![\d.])\+\d{1,3}[\s.-]?\(?\d{1,4}\)?(?:[\s.-]?\d{2,4}){2,4}(?![\d])/g,
  /(?<![\d.])\(?\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}(?![\d])/g,
];

/** Shapes of keys and tokens. Each is specific enough that ordinary maths and prose never match. */
const SECRET_SHAPES: Array<[string, RegExp]> = [
  ["Google API key", /AIza[0-9A-Za-z_-]{35}/g],
  ["OpenAI-style secret key", /\bsk-[A-Za-z0-9_-]{20,}/g],
  ["GitHub token", /\bgh[pousr]_[A-Za-z0-9]{36,}/g],
  ["AWS access key id", /\bAKIA[0-9A-Z]{16}\b/g],
  ["private key block", /-----BEGIN (?:RSA |EC |OPENSSH |DSA |PGP )?PRIVATE KEY-----/g],
  ["Groq API key", /gsk_[A-Za-z0-9]{20,}/g],
  ["Slack token", /\bxox[abprs]-[A-Za-z0-9-]{10,}/g],
];

/** name = long-looking-value, with the value not an obvious placeholder or an environment lookup. */
const ASSIGNED = /\b(?:[A-Za-z_]*(?:api[_-]?key|secret|token|password|passwd)[A-Za-z_]*)\b["']?\s*[:=]\s*(["']?)([A-Za-z0-9_\-./+=]{20,})/gi;
/** Source code, not a secret: an unquoted member path such as usage.thinkingTokens (letters, underscores and dots only; real keys and JWTs contain digits). */
const MEMBER_PATH = /^[A-Za-z_]+(?:\.[A-Za-z_]+)+$/;
const PLACEHOLDER = /^(?:x+|\*+|<.*>|your[-_a-z0-9]*|changeme|example[-_a-z0-9]*|process\.env.*|env\..*|\$\{.*\}|[a-z_]+\(\)|undefined|null)$/i;

const lineOf = (text: string, index: number): number => text.slice(0, index).split("\n").length;
const preview = (s: string): string => `${s.slice(0, 4)}...`;

function scan(text: string, kind: string, re: RegExp): SafetyFinding[] {
  const out: SafetyFinding[] = [];
  for (const m of text.matchAll(new RegExp(re.source, re.flags.includes("g") ? re.flags : `${re.flags}g`))) out.push({ kind, line: lineOf(text, m.index!), preview: preview(m[0]) });
  return out;
}

export function findPersonalData(text: string): SafetyFinding[] {
  const out = scan(text, "email address", EMAIL);
  const seen = new Set<string>();
  for (const re of PHONES) {
    for (const m of text.matchAll(new RegExp(re.source, re.flags))) {
      const digits = m[0].replace(/\D/g, "");
      if (digits.length < 10 || digits.length > 15 || seen.has(`${m.index}`)) continue;
      seen.add(`${m.index}`);
      out.push({ kind: "phone number", line: lineOf(text, m.index!), preview: preview(m[0]) });
    }
  }
  return out;
}

export function findSecrets(text: string): SafetyFinding[] {
  const out: SafetyFinding[] = [];
  for (const [kind, re] of SECRET_SHAPES) out.push(...scan(text, kind, re));
  for (const m of text.matchAll(ASSIGNED)) {
    const value = m[2]!;
    if (PLACEHOLDER.test(value) || (m[1] === "" && MEMBER_PATH.test(value))) continue;
    out.push({ kind: "a long value assigned to a key, secret or token", line: lineOf(text, m.index!), preview: preview(value) });
  }
  return out;
}

export class UnsafePromptError extends Error {
  constructor(readonly findings: SafetyFinding[]) {
    super(`this prompt must not be sent: it contains ${findings.map((f) => `${f.kind} (line ${f.line}, "${f.preview}")`).join(", ")}`);
  }
}

/** Throws before a prompt leaves the machine if it holds personal data or something that looks like a secret. */
export function assertPromptSafe(prompt: string): void {
  const findings = [...findPersonalData(prompt), ...findSecrets(prompt)];
  if (findings.length > 0) throw new UnsafePromptError(findings);
}
