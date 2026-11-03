import { z } from "zod";
import { findPersonalData, findSecrets } from "@eve/safety";

/**
 * A draft explainer (ADR 0090): the host hands the engine text it already has (a title and sections) and the engine voices it and draws it as cards in an MP4. Nothing here
 * is grounded in the knowledge base, so nothing here is a lesson: no gate judges it, no claim backs it, and sources.json says so. Everything in this file is pure;
 * scripts/source-video.ts does the work (voice, pictures, ffmpeg). No model is called.
 */
export const SOURCE_LIMITS = { title: 120, heading: 120, body: 2400, sections: 10, total: 9000, sentences: 140, sentenceChars: 320 } as const;

/** The plain shape of a source, so the functions below do not depend on the schema that calls them. */
export type SourceText = { title: string; sections: Array<{ heading: string; body: string }> };

export const SourceLesson = z
  .object({
    title: z.string().trim().min(3).max(SOURCE_LIMITS.title),
    sections: z
      .array(z.object({ heading: z.string().trim().min(1).max(SOURCE_LIMITS.heading), body: z.string().trim().min(1).max(SOURCE_LIMITS.body) }).strict())
      .min(1)
      .max(SOURCE_LIMITS.sections),
  })
  .strict()
  .superRefine((s, ctx) => {
    const text = [s.title, ...s.sections.flatMap((x) => [x.heading, x.body])].join("\n");
    if (text.length > SOURCE_LIMITS.total) ctx.addIssue({ code: "custom", path: ["sections"], message: `the source is ${text.length} characters; at most ${SOURCE_LIMITS.total}` });
    const found = [...findPersonalData(text), ...findSecrets(text)];
    if (found.length > 0) ctx.addIssue({ code: "custom", path: ["sections"], message: "the source holds personal data or a secret (" + [...new Set(found.map((f) => f.kind))].join(", ") + ")" });
    if (narrationOf(s).length > SOURCE_LIMITS.sentences + 1 + s.sections.length) ctx.addIssue({ code: "custom", path: ["sections"], message: `more than ${SOURCE_LIMITS.sentences} sentences to voice` });
  });
export type SourceLesson = z.infer<typeof SourceLesson>;

/** One thing the voice says and the card that shows while it is said. `section` is -1 for the title card. */
export type Unit = { id: string; kind: "title" | "heading" | "sentence"; section: number; text: string };

const ABBREVIATIONS: Array<[RegExp, string]> = [
  [/\be\.g\./gi, "e\u0001g\u0001"],
  [/\bi\.e\.\s/gi, "i\u0001e\u0001 "],
  [/\bvs\./gi, "vs\u0001"],
  [/\betc\./gi, "etc\u0001"],
];

/** Text with the markup a model leaves in it taken out, so it can be read aloud and drawn: bold marks, italic marks, list markers, heading hashes. */
export function cleanLine(line: string): string {
  return line
    .replace(/\*\*|__|`/g, "")
    .replace(/^\s*(?:[-*•]|\d+[.)])\s+/, "")
    .replace(/^#{1,6}\s+/, "")
    .replace(/\*([^*\n]+)\*/g, "$1")
    .replace(/_([^_\n]+)_/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

/** The sentences of a body: one list item or one line is a unit of its own; a long line is cut at its full stops. A sentence with no words in it is dropped. */
export function splitSentences(body: string): string[] {
  const out: string[] = [];
  for (const raw of body.split(/\r?\n/)) {
    const line = cleanLine(raw);
    if (!line) continue;
    let protectedLine = line;
    for (const [re, to] of ABBREVIATIONS) protectedLine = protectedLine.replace(re, to);
    for (const piece of protectedLine.split(/(?<=[.!?])\s+(?=[A-Z0-9("‘])/)) {
      let s = piece.replace(/\u0001/g, ".").trim();
      while (s.length > SOURCE_LIMITS.sentenceChars) {
        const at = s.lastIndexOf(", ", SOURCE_LIMITS.sentenceChars);
        const cut = at > 80 ? at + 1 : SOURCE_LIMITS.sentenceChars;
        out.push(s.slice(0, cut).trim());
        s = s.slice(cut).trim();
      }
      if (/[\p{L}\p{N}]/u.test(s)) out.push(s);
    }
  }
  return out;
}

/** The title, then for each section its heading and its sentences, in the order they are said. */
export function narrationOf(source: SourceText): Unit[] {
  const units: Unit[] = [{ id: "u000", kind: "title", section: -1, text: source.title }];
  const add = (kind: Unit["kind"], section: number, text: string) => units.push({ id: `u${String(units.length).padStart(3, "0")}`, kind, section, text });
  source.sections.forEach((s, i) => {
    add("heading", i, cleanLine(s.heading));
    for (const sentence of splitSentences(s.body)) add("sentence", i, sentence);
  });
  return units;
}

/**
 * Words the voice gets wrong as written, and what to give it instead (ADR 0097). Each was played to the real voice and heard back: plain NADPH is said "NADF", plain RuBisCO
 * "Rubus CO", "A T P" with spaces loses its first letter, and "A-T-P" is said "A, T, pie" by af_kore at 0.75. Dotted initials were heard back as ATP in all 18 voice and speed
 * combinations tried; NADPH had every letter said in all of them but some voices pause after the N. A term is added here only after it has been heard back. The caption keeps the author's spelling.
 */
export const SPOKEN_TERMS: Readonly<Record<string, string>> = { ATP: "A.T.P.", NADPH: "N.A.D.P.H.", RuBisCO: "Rubisco" };
const SPOKEN_TERM_RES = Object.entries(SPOKEN_TERMS).map(([term, said]) => [new RegExp(String.raw`\b${term}\b`, "g"), said] as const);

/**
 * What the voice is given: maths signs written as words, so a voice that does not know them says them; abbreviations spelled the way the voice says them; and no ellipsis or
 * dash, each of which makes the voice stop (a real pause is the job of [pause] in the story, not of punctuation).
 */
export function speechText(text: string): string {
  const said = SPOKEN_TERM_RES.reduce((t, [re, to]) => t.replace(re, to), text);
  return said
    .replace(/\s*(?:\.{3}|…)\s*$/, ".")
    .replace(/\s*(?:\.{3}|…)\s*/g, ", ")
    .replace(/\s*[–—]\s*/g, ", ")
    .replace(/²/g, " squared")
    .replace(/³/g, " cubed")
    .replace(/\^\(?(-?\d+)\)?/g, " to the power $1")
    .replace(/√/g, "square root of ")
    .replace(/±/g, " plus or minus ")
    .replace(/≠/g, " is not equal to ")
    .replace(/≤/g, " is less than or equal to ")
    .replace(/≥/g, " is greater than or equal to ")
    .replace(/×/g, " times ")
    .replace(/÷/g, " divided by ")
    .replace(/ψ/g, " psi ")
    .replace(/κ/g, " kappa ")
    .replace(/ħ/g, " h-bar ")
    .replace(/≈/g, " approximately ")
    .replace(/∝/g, " proportional to ")
    .replace(/(?<=\S)\s*=\s*(?=\S)/g, " equals ")
    .replace(/(?<=\w)\s*\+\s*(?=[\w(])/g, " plus ")
    .replace(/\s+/g, " ")
    .trim();
}

export type Placed = Unit & { startMs: number; durMs: number };

/** Pauses (milliseconds): after a sentence, and before the voice starts on a new section. */
export const GAPS = { lead: 600, sentence: 380, section: 900, tail: 1200 } as const;

/** Start times for voiced units: each starts when the one before it ends plus a pause, a longer one before a new section. */
export function placeUnits(units: readonly Unit[], durations: readonly number[]): { placed: Placed[]; totalMs: number } {
  if (units.length !== durations.length) throw new Error("one duration for every unit");
  const placed: Placed[] = [];
  let t: number = GAPS.lead;
  units.forEach((u, i) => {
    const prev = units[i - 1];
    if (prev && prev.section !== u.section) t += GAPS.section - GAPS.sentence;
    placed.push({ ...u, startMs: t, durMs: durations[i]! });
    t += durations[i]! + GAPS.sentence;
  });
  return { placed, totalMs: t - GAPS.sentence + GAPS.tail };
}

const esc = (s: string): string => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
export const CARD = { width: 1280, height: 720 } as const;

/**
 * The card shown while a unit is said, as one self-contained HTML page (1280 by 720). The title card shows the title; a section card shows the section's heading and the
 * sentences said so far, the one being said strong and the earlier ones soft, trimmed from the top to fit.
 */
export function cardHtml(units: readonly Unit[], index: number, theme: "whiteboard" | "dark"): string {
  const u = units[index]!;
  const sections = Math.max(0, ...units.map((x) => x.section + 1));
  const palette = theme === "dark" ? { bg: "#10131a", ink: "#f1f4f9", soft: "#8d97a8", accent: "#4cc0ff", rule: "#2a3140" } : { bg: "#faf8f2", ink: "#1c2433", soft: "#8a8f99", accent: "#0b6bd3", rule: "#e2ddd0" };
  const head = `<div class="bar"><span>Draft explainer · written by AI</span><span>${u.section >= 0 ? `${String(u.section + 1).padStart(2, "0")} / ${String(sections).padStart(2, "0")}` : ""}</span></div>`;
  let body: string;
  if (u.kind === "title") body = `<div class="title"><h1>${esc(u.text)}</h1><p>Explained from first principles</p></div>`;
  else {
    const heading = units.find((x) => x.section === u.section && x.kind === "heading")!;
    const said = units.slice(0, index + 1).filter((x) => x.section === u.section && x.kind === "sentence");
    const size = said.reduce((n, x) => n + x.text.length, 0) > 520 ? 28 : 34;
    const shown: Unit[] = [];
    let budget = 700;
    for (const s of [...said].reverse()) {
      if (shown.length > 0 && budget - s.text.length < 0) break;
      shown.unshift(s);
      budget -= s.text.length;
    }
    body = `<div class="section"><h2>${esc(heading.text)}</h2>${shown.map((s) => `<p class="${s.id === u.id ? "now" : "past"}" style="font-size:${size}px">${esc(s.text)}</p>`).join("")}</div>`;
  }
  return `<!doctype html><html><head><meta charset="utf-8"><style>
*{box-sizing:border-box}html,body{margin:0;width:${CARD.width}px;height:${CARD.height}px;background:${palette.bg};color:${palette.ink};font-family:"Segoe UI","Helvetica Neue",Arial,sans-serif;overflow:hidden}
.bar{position:absolute;left:64px;right:64px;top:36px;display:flex;justify-content:space-between;font-size:18px;letter-spacing:.04em;color:${palette.soft};border-bottom:1px solid ${palette.rule};padding-bottom:14px}
.title{position:absolute;inset:0;display:flex;flex-direction:column;justify-content:center;padding:0 110px}
.title h1{margin:0;font-size:68px;line-height:1.12;font-weight:600;letter-spacing:-.02em}.title p{margin:26px 0 0;padding:0;border:0;font-size:28px;color:${palette.accent}}
.section{position:absolute;left:64px;right:64px;top:104px;bottom:56px;display:flex;flex-direction:column;justify-content:flex-start}
h2{margin:0 0 30px;font-size:46px;font-weight:600;letter-spacing:-.015em;color:${palette.accent};line-height:1.15}
p{margin:0 0 20px;line-height:1.42;padding-left:22px;border-left:5px solid transparent}.now{color:${palette.ink};border-left-color:${palette.accent};font-weight:500}.past{color:${palette.soft}}
</style></head><body>${head}${body}</body></html>`;
}

export type SourceQaFacts = { mp4Bytes: number; hasVideo: boolean; hasAudio: boolean; mp4DurationS: number | null; expectedS: number | null };

/** Delivery checks for a draft explainer: the file exists, has a picture and a voice and lasts as long as the timeline says. (No gates and no SymPy: nothing here is a lesson.) */
export function sourceQaChecks(f: SourceQaFacts): Array<{ id: string; ok: boolean; message: string }> {
  const drift = f.mp4DurationS !== null && f.expectedS !== null ? Math.abs(f.mp4DurationS - f.expectedS) : null;
  return [
    { id: "file", ok: f.mp4Bytes > 10_000, message: `the file is ${f.mp4Bytes} bytes` },
    { id: "video-stream", ok: f.hasVideo, message: f.hasVideo ? "has a picture" : "has no picture stream" },
    { id: "audio-stream", ok: f.hasAudio, message: f.hasAudio ? "has a voice" : "has no audio stream" },
    { id: "duration", ok: drift !== null && drift <= Math.max(1.5, (f.expectedS ?? 0) * 0.02), message: drift === null ? "the length could not be read" : `${f.mp4DurationS!.toFixed(1)} s against ${f.expectedS!.toFixed(1)} s in the timeline` },
  ];
}

/** sources.json for a draft explainer: what it is built on (text the host supplied) and, plainly, what it is not. */
export function sourceSheet(requestId: string, source: SourceText, facts: { sentences: number; lengthS: number | null; voice: { id: string; status: string } }) {
  return {
    schema: 1,
    requestId,
    kind: "host-source",
    topic: { title: source.title, sections: source.sections.map((s) => s.heading) },
    book: null,
    claims: [],
    lesson: { sentences: facts.sentences, lengthS: facts.lengthS, passesEveryGate: null, verifiedBySymPy: null, publishable: false },
    caveats: [
      "This video was made from text written by an AI model. It is not from a textbook and no person has checked it.",
      "It was not matched to the knowledge base, and none of the engine's gates or the SymPy proof were run on it.",
      `The voice is AI-generated (${facts.voice.id}, ${facts.voice.status}).`,
    ],
  };
}
