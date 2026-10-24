import type { JsonSchema } from "@eve/adapters";
import { OFFERED_TO_MODELS } from "@eve/components";
import { PATTERN_IDS } from "@eve/patterns";
import { BEAT_KINDS, COLOR_NAMES, CUE_ACTIONS } from "@eve/schema";

/**
 * The request envelope: every message to the model has these seven sections, in this order, with these headings (prompts/envelope.md is the template; a test
 * keeps the file and this list in step). The system instruction (prompts/system.v1.md) is sent separately on every call. A pass supplies the content of each
 * section; nothing is optional, so a request cannot go out missing one.
 */
export const SECTIONS = ["TASK", "RULES", "ALLOWED VALUES", "INPUT", "OUTPUT SCHEMA", "ERROR OBJECTS", "EXAMPLE"] as const;

export class EnvelopeError extends Error {}

export type ErrorObject = { when: string; shape: Record<string, unknown> };

export type EnvelopeParts = {
  /** One sentence: what to produce, with the pass name and prompt version. */
  task: string;
  /** Numbered rules for this pass only. */
  rules: readonly string[];
  /** Closed lists, usually from `allowedValues`. */
  allowed: Readonly<Record<string, readonly string[]>>;
  /** The data: retrieved records, the plan, sentences. */
  input: unknown;
  schema: JsonSchema;
  errors: readonly ErrorObject[];
  example: { input: unknown; output: unknown };
};

/**
 * ALLOWED VALUES, generated from the real registries so it cannot drift from the code: the components that are built, the pattern ids, the colour names,
 * the cue actions and the beat kinds, plus the ids of this request's data (records, expressions, sentences, claims) when given.
 */
export function allowedValues(
  ids: { records?: readonly string[]; expressions?: readonly string[]; sentences?: readonly string[]; claims?: readonly string[] } = {},
  /** Lists a newer pass adds or replaces (planner.v4 gives the nine patterns, the arcs and the slots). Empty for the passes whose recorded requests must not change. */
  extra: Readonly<Record<string, readonly string[]>> = {},
): Record<string, string[]> {
  const out: Record<string, string[]> = {
    components: [...OFFERED_TO_MODELS],
    patterns: [...PATTERN_IDS],
    colours: [...COLOR_NAMES],
    cueActions: [...CUE_ACTIONS],
    beatKinds: [...BEAT_KINDS],
    ...(ids.records ? { recordIds: [...ids.records] } : {}),
    ...(ids.expressions ? { expressionIds: [...ids.expressions] } : {}),
    ...(ids.sentences ? { sentenceIds: [...ids.sentences] } : {}),
    ...(ids.claims ? { claimIds: [...ids.claims] } : {}),
  };
  for (const [name, values] of Object.entries(extra)) out[name] = [...values];
  return out;
}

const json = (v: unknown) => JSON.stringify(v, null, 2);

/** Builds the message. Throws `EnvelopeError`, naming the section, if any section is missing or empty. */
export function buildEnvelope(parts: Partial<EnvelopeParts>): string {
  const need = (section: (typeof SECTIONS)[number], ok: boolean) => {
    if (!ok) throw new EnvelopeError(`the request envelope is missing its ${section} section`);
  };
  need("TASK", typeof parts.task === "string" && parts.task.trim() !== "");
  need("RULES", Array.isArray(parts.rules) && parts.rules.length > 0 && parts.rules.every((r) => r.trim() !== ""));
  need("ALLOWED VALUES", !!parts.allowed && Object.keys(parts.allowed).length > 0);
  need("INPUT", parts.input !== undefined && parts.input !== null);
  need("OUTPUT SCHEMA", !!parts.schema && Object.keys(parts.schema).length > 0);
  need("ERROR OBJECTS", Array.isArray(parts.errors) && parts.errors.length > 0);
  need("EXAMPLE", !!parts.example && parts.example.input !== undefined && parts.example.output !== undefined);
  const p = parts as EnvelopeParts;
  return [
    `TASK\n${p.task.trim()}`,
    `RULES\n${p.rules.map((r, i) => `${i + 1}. ${r.trim()}`).join("\n")}`,
    `ALLOWED VALUES\n${json(p.allowed)}`,
    `INPUT\n${json(p.input)}`,
    `OUTPUT SCHEMA\n${json(p.schema)}`,
    `ERROR OBJECTS\n${p.errors.map((e) => `${e.when}: ${JSON.stringify(e.shape)}`).join("\n")}`,
    `EXAMPLE\ninput: ${JSON.stringify(p.example.input)}\noutput: ${JSON.stringify(p.example.output)}`,
  ].join("\n\n");
}

/** The sections of a request whose text never changes between the requests of one pass (the polisher, ADR 0088): everything before ALLOWED VALUES. */
export const STATIC_FIRST_SECTIONS = ["TASK", "RULES", "OUTPUT SCHEMA", "ERROR OBJECTS", "EXAMPLE", "ALLOWED VALUES", "INPUT"] as const;

/**
 * The same seven sections in an order that suits a provider that caches the start of a request: what is fixed for the pass (task, rules, schema, error objects, example)
 * first, what changes with the beat (the allowed ids, the data) last. Two requests of the pass then share a long identical start, which a provider may cache and which does
 * not count against its token limits where it does (Groq says so for cached tokens). `buildEnvelope` and the recorded requests of the older passes are untouched.
 */
export function buildStaticFirstEnvelope(parts: Partial<EnvelopeParts>): string {
  buildEnvelope(parts); // the same checks: a request cannot go out missing a section
  const p = parts as EnvelopeParts;
  return [
    `TASK\n${p.task.trim()}`,
    `RULES\n${p.rules.map((r, i) => `${i + 1}. ${r.trim()}`).join("\n")}`,
    `OUTPUT SCHEMA\n${json(p.schema)}`,
    `ERROR OBJECTS\n${p.errors.map((e) => `${e.when}: ${JSON.stringify(e.shape)}`).join("\n")}`,
    `EXAMPLE\ninput: ${JSON.stringify(p.example.input)}\noutput: ${JSON.stringify(p.example.output)}`,
    `ALLOWED VALUES\n${json(p.allowed)}`,
    `INPUT\n${json(p.input)}`,
  ].join("\n\n");
}
