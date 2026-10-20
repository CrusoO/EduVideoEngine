import { spokenLabel } from "@eve/components";
import { claimExpressions, claimsSpokenBy, isSideOf } from "@eve/gates";
import type { Claim, Cue, Expr, LessonBundle, NarrationSentence, SceneSpec } from "@eve/schema";

const ALT_MAX_CHARS = 400;

/** A title may be a static object only if it has no digit and no placeholder (spec 2.0.0, ADR 0032). */
const canBeStatic = (text: string): boolean => !/\d/.test(text) && !/[{}]/.test(text);

/**
 * What a scene shows, in words for a screen reader, made from the scene itself: text as written, an equation as the verbaliser reads it, a graph, a number
 * line and a step list by what they hold. Made by code, so it can never describe something the scene does not show.
 */
export function altTextFor(scene: SceneSpec, expressions: Readonly<Record<string, Expr>>, locale: string): string {
  const say = (id: string | undefined): string => (id !== undefined && expressions[id] ? spokenLabel(expressions[id]!, locale) : "an expression");
  const parts = scene.objects.map((o) => {
    const p = o.props as { text?: string; role?: string; roots?: boolean; hops?: unknown[]; steps?: string[] };
    switch (o.component) {
      case "text":
        return p.role === "title" ? `The title ${p.text}.` : `${p.text}.`;
      case "equation":
        return `An equation: ${say(o.exprRef)}.`;
      case "functionGraph":
        return `A graph of ${say(o.exprRef)}${p.roots ? ", with its roots marked" : ""}.`;
      case "numberLine":
        return `A number line${Array.isArray(p.hops) && p.hops.length > 0 ? ` with ${p.hops.length} hop${p.hops.length === 1 ? "" : "s"}` : ""}.`;
      case "stepList":
        return `The steps: ${(p.steps ?? []).map((s) => say(s)).join("; ")}.`;
      default:
        return `A ${o.component}.`;
    }
  });
  const text = parts.join(" ");
  return text.length <= ALT_MAX_CHARS ? text : `${text.slice(0, ALT_MAX_CHARS - 1).trimEnd()}…`;
}

/**
 * Turns the scene a pattern built into the scene of a lesson. Three things, none of which a model should do:
 *  1. a title without a digit becomes a static object (no cue needed, ADR 0032);
 *  2. every other object gets the cues G3 asks for: a cue at all (a), a cue on a sentence that carries a claim, in a beat that has claims (b), and, for an
 *     object that shows an expression, a cue on a sentence whose claim uses it (c). A pattern's own cues are kept; the missing one is added on the first fitting
 *     claim sentence after the object's last cue: a reveal when the object has no cue yet, otherwise a highlight;
 *  3. the alt text is described from the scene.
 * `claims` are the claims of the lesson that this scene's beat makes.
 */
export function finishScene(scene: SceneSpec, claims: readonly Claim[], sentences: readonly NarrationSentence[], expressions: Readonly<Record<string, Expr>>, locale: string): SceneSpec {
  const objects = scene.objects.map((o) => {
    const isTitle = o.component === "text" && (o.props as { role?: string }).role === "title" && canBeStatic((o.props as { text?: string }).text ?? "");
    return isTitle ? { ...o, role: "static" as const, textRole: "title" as const } : o;
  });
  const cues: Cue[] = [...scene.cues];
  const claimOf = new Map(claims.map((c) => [c.id, c] as const));
  const position = new Map(sentences.map((s, i) => [s.id, i] as const));
  const sentenceOf = new Map(sentences.map((s) => [s.id, s] as const));
  const bundleLike = { bundle: { expressions } as unknown as LessonBundle };

  for (const o of objects.filter((x) => x.role !== "static")) {
    const mine = () => cues.filter((c) => c.targetObject.split("#")[0] === o.id);
    const spoken = (sentenceId: string): Claim[] => {
      const s = sentenceOf.get(sentenceId);
      return s ? claimsSpokenBy(s).flatMap((id) => (claimOf.has(id) ? [claimOf.get(id)!] : [])) : [];
    };
    const uses = (claim: Claim): boolean => {
      if (o.exprRef === undefined) return true;
      const ids = claimExpressions(claim);
      return ids.includes(o.exprRef) || (o.component === "functionGraph" && ids.some((id) => isSideOf(bundleLike, o.exprRef!, id)));
    };
    const done = (): boolean => {
      const cs = mine();
      if (cs.length === 0) return false;
      if (claims.length === 0) return true;
      return cs.some((c) => spoken(c.anchor.sentenceId).length > 0) && (o.exprRef === undefined || cs.some((c) => spoken(c.anchor.sentenceId).some(uses)));
    };
    if (done()) continue;

    // a sentence the object is already cued on cannot be in the pool: the object would then be done
    const pool = claims.length === 0 ? sentences : sentences.filter((s) => spoken(s.id).some(uses));
    const last = Math.max(-1, ...mine().map((c) => position.get(c.anchor.sentenceId) ?? -1));
    const chosen = pool.find((s) => position.get(s.id)! > last) ?? pool[0];
    if (!chosen) continue; // nothing can carry it: G3 reports the object
    const had = mine().length > 0;
    cues.push({ targetObject: o.id, action: had ? "highlight" : "reveal", anchor: { sentenceId: chosen.id, at: "start" }, minHoldMs: had ? 800 : 1500 });
  }
  return { ...scene, objects, cues, a11y: { altText: altTextFor({ ...scene, objects }, expressions, locale) } };
}
