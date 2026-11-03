import { isForward, type Law } from "@eve/content";
import type { BeatBuild } from "../lesson/beats";

const ONES = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen"];
const TENS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];
/** A whole number below a hundred in words (the script may carry no digit). */
export function numberWords(n: number): string {
  if (!Number.isInteger(n) || n < 0 || n > 99) throw new Error(`numberWords: ${n} is not a whole number from 0 to 99`);
  if (n < 20) return ONES[n]!;
  return n % 10 === 0 ? TENS[n / 10]! : `${TENS[Math.floor(n / 10)]} ${ONES[n % 10]}`;
}

type Sentence = { claimId: string; text: string };
type ComposedBeat = { beatId: string; sentences: Sentence[]; prompt?: string; note?: string };

/**
 * The narration of a lesson compiled from a law (ADR 0081): a template per beat, filled with the law's own labels, units and numbers, so it needs no model. Every number is
 * said in words, every placeholder is one of the claim it is said for, and the sentences are short. The scriptwriter's rules (`checkScript`) judge the result like any other.
 */
export function composeLawScript(law: Law, builds: readonly BeatBuild[]): { beats: ComposedBeat[] } {
  if (isForward(law)) return composeForwardScript(law, builds);
  const id = law.id.replace(/^law\./, "");
  const q = law.quantities;
  const total = Object.keys(law.example.given).find((s) => s in q && law.relation.op === "eq" && law.relation.a.op === "sym" && law.relation.a.name === s)!;
  const other = Object.keys(law.example.given).find((s) => s !== total)!;
  const unknown = q[law.solveFor]!;
  const totalQ = q[total]!;
  const otherQ = q[other]!;
  const say = (s: string, n: number) => `${numberWords(n)} ${q[s]!.unit}`;
  const claim = (b: BeatBuild, test: (cid: string) => boolean): string => {
    const c = b.claims.find((x) => test(x.id));
    if (!c) throw new Error(`beat ${b.beat.id}: no claim matches (${b.claims.map((x) => x.id).join(", ")})`);
    return c.id;
  };
  const beats: ComposedBeat[] = [];
  for (const b of builds.filter((x) => x.claims.length > 0)) {
    const sentences: Sentence[] = [];
    const add = (cid: string, text: string) => sentences.push({ claimId: cid, text });
    switch (b.beat.pattern) {
      case "plot-and-mark-roots": {
        const rel = claim(b, (c) => c.endsWith(".claim.relation"));
        const roots = claim(b, (c) => c.endsWith(".claim.roots"));
        const graph = claim(b, (c) => c.endsWith(".claim.graph"));
        add(rel, `The law says that {expr:${id}.law}, so the ${totalQ.label} is the ${unknown.label} times the ${otherQ.label}.`);
        add(rel, `Turn it round and it reads {expr:${id}.rearranged}, so the ${unknown.label} is the ${totalQ.label} divided by the ${otherQ.label}.`);
        add(rel, `For a fixed ${otherQ.label}, a larger ${totalQ.label} drives a larger ${unknown.label}, and a larger ${otherQ.label} lets less through.`);
        add(roots, `Take a ${otherQ.label} of ${say(other, law.example.given[other]!)} across ${say(total, law.example.given[total]!)}: the equation {expr:${id}.problem} has a single answer, and that answer is the ${unknown.label}.`);
        add(graph, `On the graph the line crosses zero at ${say(law.solveFor, law.example.answer)}, which is the answer to {expr:${id}.graphEq}.`);
        beats.push({ beatId: b.beat.id, sentences });
        break;
      }
      case "worked-sum-on-grid": {
        const eqv = claim(b, (c) => /steps\.equivalent\.1$/.test(c));
        const roots = claim(b, (c) => /steps\.roots$/.test(c));
        const check = claim(b, (c) => /steps\.check\.1$/.test(c));
        add(eqv, `The equation {expr:${id}.problem} says the same as {expr:${id}.divided}, so we divide the ${totalQ.label} by the ${otherQ.label}.`);
        add(roots, `That division gives ${say(law.solveFor, law.example.answer)}, which is the root of the equation.`);
        add(check, `Now we check it by putting the ${unknown.label} back into the law, which gives {expr:${id}.back}.`);
        add(check, `Both sides match, so ${say(law.solveFor, law.example.answer)} is right for ${say(other, law.example.given[other]!)} across ${say(total, law.example.given[total]!)}.`);
        beats.push({ beatId: b.beat.id, sentences, prompt: `Which quantity do we divide by?` });
        break;
      }
      case "statement-card": {
        const wrong = claim(b, (c) => c.endsWith(".claim.avoid"));
        add(wrong, `A tempting mistake is to multiply the ${totalQ.label} by the ${otherQ.label}, which gives {expr:${id}.wrong}.`);
        add(wrong, `But a larger ${otherQ.label} lets less ${unknown.label} through, so multiplying by it cannot be right.`);
        beats.push({ beatId: b.beat.id, sentences, note: `${otherQ.label.charAt(0).toUpperCase()}${otherQ.label.slice(1)} cuts the ${unknown.label}, never raises it` });
        break;
      }
      case "check-question": {
        const ans = claim(b, (c) => c.includes(".q.recall.answer"));
        const g = law.check.given;
        add(ans, `The answer is {expr:${id}.q.answer}, which is ${say(law.solveFor, law.check.answer)}.`);
        add(ans, `We divide the ${totalQ.label} of ${say(total, g[total]!)} by the ${otherQ.label} of ${say(other, g[other]!)}, as in {expr:${id}.q.eq}.`);
        add(ans, `So the ${unknown.label} comes out the same way as in the worked example, with new numbers.`);
        beats.push({ beatId: b.beat.id, sentences, prompt: `What ${unknown.label} flows through this resistor?` });
        break;
      }
      default:
        throw new Error(`composeLawScript has no template for the pattern ${b.beat.pattern}`);
    }
  }
  return { beats };
}

/**
 * The narration of a lesson compiled from a forward law (ADR 0083), such as Faraday's: the concept in the knowledge base's own words, the worked example, why the tempting
 * mistake fails, and the check. Numbers are words; every placeholder belongs to its claim.
 */
function composeForwardScript(law: Law, builds: readonly BeatBuild[]): { beats: ComposedBeat[] } {
  const id = law.id.replace(/^law\./, "");
  const q = law.quantities;
  const g = law.example.given;
  const unknown = q[law.solveFor]!;
  const unit = (s: string, n: number) => `${numberWords(n)} ${q[s]!.unit}`;
  const keys = Object.keys(g);
  const vary = law.vary ?? keys[0]!;
  const turns = keys.find((k) => q[k]!.unit === "turns") ?? keys[0]!;
  const time = keys.find((k) => k !== vary && k !== turns) ?? keys[0]!;
  const claim = (b: BeatBuild, test: (cid: string) => boolean): string => {
    const c = b.claims.find((x) => test(x.id));
    if (!c) throw new Error(`beat ${b.beat.id}: no claim matches (${b.claims.map((x) => x.id).join(", ")})`);
    return c.id;
  };
  const beats: ComposedBeat[] = [];
  for (const b of builds.filter((x) => x.claims.length > 0)) {
    const sentences: Sentence[] = [];
    const add = (cid: string, text: string) => sentences.push({ claimId: cid, text });
    switch (b.beat.pattern) {
      case "magnet-coil-scene": {
        const c = claim(b, (x) => x.endsWith(".claim.law"));
        add(c, `A magnet moves towards a coil, and the flux through the coil changes while it moves.`);
        add(c, `That changing flux gives an ${unknown.label}, and the ${unknown.label} equals the rate at which the flux changes.`);
        add(c, `A faster change in flux gives a larger ${unknown.label}, so the needle of the meter swings further.`);
        add(c, `When the magnet stops, the flux stops changing, and the needle falls back to rest.`);
        beats.push({ beatId: b.beat.id, sentences });
        break;
      }
      case "worked-sum-on-grid": {
        const roots = claim(b, (x) => /steps\.roots$/.test(x));
        const check = claim(b, (x) => /steps\.check\.1$/.test(x));
        add(roots, `The law multiplies the ${q[turns]!.label} by the ${q[vary]!.label} and divides by the ${q[time]!.label}, which gives {expr:${id}.problem}.`);
        add(roots, `Working it out, the ${unknown.label} is ${unit(law.solveFor, law.example.answer)}.`);
        add(check, `Now we check it by putting the ${unknown.label} back, which gives {expr:${id}.back}.`);
        add(check, `Both sides match, so ${unit(law.solveFor, law.example.answer)} is right for ${unit(turns, g[turns]!)}, ${unit(vary, g[vary]!)} and ${unit(time, g[time]!)}.`);
        beats.push({ beatId: b.beat.id, sentences, prompt: `What do we divide by?` });
        break;
      }
      case "statement-card": {
        const c = claim(b, (x) => x.endsWith(".claim.avoid"));
        add(c, `A tempting mistake is to divide the ${q[law.mistake.a]!.label} by the ${q[law.mistake.b]!.label} and stop, which gives {expr:${id}.wrong}.`);
        add(c, `But every turn of the coil adds its own ${unknown.label}, so leaving out the turns gives too small a value.`);
        beats.push({ beatId: b.beat.id, sentences, note: `Every turn adds to the ${unknown.label}` });
        break;
      }
      case "check-question": {
        const ans = claim(b, (x) => x.includes(".q.recall.answer"));
        add(ans, `The answer is {expr:${id}.q.answer}, which is ${unit(law.solveFor, law.check.answer)}.`);
        add(ans, `We multiply the turns by the change in flux and divide by the time, as in {expr:${id}.q.eq}.`);
        add(ans, `So the ${unknown.label} comes out the same way as in the worked example, with new numbers.`);
        beats.push({ beatId: b.beat.id, sentences, prompt: `What ${unknown.label} does the coil give?` });
        break;
      }
      default:
        throw new Error(`composeForwardScript has no template for the pattern ${b.beat.pattern}`);
    }
  }
  return { beats };
}
