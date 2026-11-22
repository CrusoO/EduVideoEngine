/**
 * Soft QA for story videos (ADR 0092). Returns a list of notes — never fails a build; the caller
 * can log them, surface them in the API response, or gate publishing. Each check targets one of the
 * six 3Blue1Brown quality rules baked into the v2 prompts.
 *
 * 17 checks: 9 original + 5 spatial/motion + 3 visual quality
 * (shapes_unfilled, scale_imbalance, composition_clustered).
 */
import { STAGE, type ColourRole, type PlacedStory, type Story, type StoryVisual, type StoryNum } from "./story";
import { SPOKEN_TERMS } from "./source";
import { gridCells, gridOverlap } from "./story-grid";
import { PROP_NAMES, PROP_WORDS } from "./story-props";

/** A soft note: what is wrong, in which scene, and where when the engine knows: the id of the shape and the position (from 0) of the sentence, so a host can ask for a targeted repair without reading the message. */
export type QANote = { scene: number; kind: string; message: string; shape?: string; sentence?: number };

const COVARIATION_WORDS = /\b(increases?|decreases?|grows?|falls?|rises?|oscillates?|speeds?\s+up|slows?\s+down|changes?|varies?)\b/i;

/** After sanitization every t-expression becomes { src, js }; its presence means at least one shape is animated. */
function hasAnimation(visuals: unknown[]): boolean {
  return /"src"\s*:/.test(JSON.stringify(visuals));
}

/** Extract a static number from a StoryNum. Returns null for expressions. */
function staticNum(n: StoryNum): number | null {
  return typeof n === "number" ? n : null;
}

/** Best-effort static centre of a shape. Returns null when any coordinate is an expression. */
function centre(v: StoryVisual): { x: number; y: number } | null {
  switch (v.kind) {
    case "circle": { const x = staticNum(v.cx), y = staticNum(v.cy); return x !== null && y !== null ? { x, y } : null; }
    case "rect": { const x = staticNum(v.x), y = staticNum(v.y), w = staticNum(v.w), h = staticNum(v.h); return x !== null && y !== null && w !== null && h !== null ? { x: x + w / 2, y: y + h / 2 } : null; }
    case "line": case "arrow": { const x1 = staticNum(v.x1), y1 = staticNum(v.y1), x2 = staticNum(v.x2), y2 = staticNum(v.y2); return x1 !== null && y1 !== null && x2 !== null && y2 !== null ? { x: (x1 + x2) / 2, y: (y1 + y2) / 2 } : null; }
    case "text": case "math": { const x = staticNum(v.x), y = staticNum(v.y); return x !== null && y !== null ? { x, y } : null; }
    case "spring": { const x1 = staticNum(v.x1), y1 = staticNum(v.y1), x2 = staticNum(v.x2), y2 = staticNum(v.y2); return x1 !== null && y1 !== null && x2 !== null && y2 !== null ? { x: (x1 + x2) / 2, y: (y1 + y2) / 2 } : null; }
    case "numberline": return { x: v.x + v.w / 2, y: v.y };
    case "axes": case "plot": return { x: v.box.x + v.box.w / 2, y: v.box.y + v.box.h / 2 };
    case "angle": { const x = staticNum(v.cx), y = staticNum(v.cy); return x !== null && y !== null ? { x, y } : null; }
    default: return null;
  }
}

/** The radius of a round shape, or null for any other (a rule that needs the size then falls back to the centre distance). */
function radiusOf(v: StoryVisual | undefined): number | null {
  return v && (v.kind === "circle" || v.kind === "sun" || v.kind === "element" || v.kind === "fuzzy") ? staticNum(v.r) : null;
}

export function storyQA(story: Story): QANote[] {
  const notes: QANote[] = [];

  const hasRole = (role: string): boolean => story.scenes.some((s) => s.role === role);
  if (!hasRole("hook")) notes.push({ scene: 0, kind: "arc_hook_missing", message: "no scene has role: hook" });
  if (!hasRole("reveal")) notes.push({ scene: 0, kind: "arc_reveal_missing", message: "no scene has role: reveal" });

  // no_color_map: same concept appears in 2+ scenes with different colors
  if (story.color_map && Object.keys(story.color_map).length > 0) {
    // color_map is defined — check that shapes respect it
    for (const [si, sc] of story.scenes.entries()) {
      for (const v of sc.visuals) {
        if (v.label) {
          const key = Object.keys(story.color_map).find((k) => v.label!.toLowerCase().includes(k.toLowerCase()));
          if (key && story.color_map[key] !== v.color && v.color !== "none" && v.color !== "soft") {
            notes.push({ scene: si, kind: "no_color_map", shape: v.id, message: `shape "${v.id}" color "${v.color}" does not match color_map entry "${key}" → "${story.color_map[key]}"` });
          }
        }
      }
    }
  }

  for (const [si, sc] of story.scenes.entries()) {
    // hook must end with a question
    if (sc.role === "hook") {
      const last = sc.sentences[sc.sentences.length - 1];
      if (last && !last.text.trimEnd().endsWith("?")) {
        notes.push({ scene: si, kind: "hook_ends_statement", message: "hook scene's last sentence does not end with ?" });
      }
    }

    // covariation: sentence with increase/decrease word must have a t-expression somewhere in the scene
    for (const [qi, s] of sc.sentences.entries()) {
      if (COVARIATION_WORDS.test(s.text) && !hasAnimation(sc.visuals)) {
        notes.push({ scene: si, kind: "covariation_static", sentence: qi, message: `sentence ${qi + 1} uses a change word but no t-expression is visible in the scene` });
        break;
      }
    }

    // anchor: a labeled shape whose label word does not appear in any sentence
    const allText = sc.sentences.map((s) => s.text.toLowerCase()).join(" ");
    for (const v of sc.visuals) {
      if (v.label) {
        // the first word of three letters or more: "x marbles" is anchored by "marbles", a one-letter variable is not a word to find
        const word = v.label.split(/\s+/).find((w) => w.replace(/[^\p{L}\p{N}]/gu, "").length >= 3)?.toLowerCase() ?? "";
        if (word && !allText.includes(word)) {
          notes.push({ scene: si, kind: "anchor_missing", shape: v.id, message: `shape "${v.id}" has label "${v.label}" but its first word does not appear in any sentence` });
        }
      }
    }

    // Cowan (2001): visual working memory = 4±1 items; 6 is the ceiling
    if (sc.visuals.length > 6) {
      notes.push({ scene: si, kind: "scene_overloaded", message: `scene has ${sc.visuals.length} shapes (max recommended: 6)` });
    }

    // orphaned cross-references (should already be caught by the sanitizer, but double-check)
    const ids = new Set(sc.visuals.map((v) => v.id));
    for (const v of sc.visuals) {
      if (v.kind === "callout" && !ids.has(v.target)) {
        notes.push({ scene: si, kind: "callout_orphaned", shape: v.id, message: `callout target "${v.target}" not found in scene` });
      }
      if (v.kind === "trace" && !ids.has(v.sourceId)) {
        notes.push({ scene: si, kind: "trace_orphaned", shape: v.id, message: `trace sourceId "${v.sourceId}" not found in scene` });
      }
    }

    // no out set when many shapes are present
    const hasOut = sc.visuals.some((v) => v.out !== undefined);
    if (sc.visuals.length > 4 && !hasOut) {
      notes.push({ scene: si, kind: "no_out_set", message: `scene has ${sc.visuals.length} shapes but none have an "out" cue set` });
    }

    // --- NEW spatial/motion checks ---

    // shape_in_margin: centre outside usable area
    for (const v of sc.visuals) {
      const c = centre(v);
      if (c && (c.x < 4 || c.x > STAGE.w - 4 || c.y < 3 || c.y > STAGE.h - 2)) {
        notes.push({ scene: si, kind: "shape_in_margin", shape: v.id, message: `shape "${v.id}" centre (${c.x.toFixed(1)}, ${c.y.toFixed(1)}) is in the margin` });
      }
    }

    // shapes_too_close: two static centres within 6 units
    const byId = new Map(sc.visuals.map((v) => [v.id, v]));
    const centres: Array<{ id: string; x: number; y: number }> = [];
    for (const v of sc.visuals) {
      const c = centre(v);
      if (c) centres.push({ id: v.id, ...c });
    }
    for (let a = 0; a < centres.length; a++) {
      for (let b = a + 1; b < centres.length; b++) {
        const dx = centres[a]!.x - centres[b]!.x;
        const dy = centres[a]!.y - centres[b]!.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        // a deliberate row of equal shapes (marbles, dots) that do not touch is not a crowd: only shapes that touch or come within 0.3 units of touching are flagged
        const ra = radiusOf(byId.get(centres[a]!.id)), rb = radiusOf(byId.get(centres[b]!.id));
        const touching = ra === null || rb === null || dist < ra + rb + 0.3;
        // a label on a line or an arrow is meant to sit on it
        const onLine = ["line", "arrow", "spring"].includes(byId.get(centres[a]!.id)?.kind ?? "") || ["line", "arrow", "spring"].includes(byId.get(centres[b]!.id)?.kind ?? "");
        if (dist < 6 && touching && !onLine) {
          notes.push({ scene: si, kind: "shapes_too_close", shape: centres[a]!.id, message: `"${centres[a]!.id}" and "${centres[b]!.id}" are ${dist.toFixed(1)} units apart (min 8 recommended)` });
        }
      }
    }

    // labels_same_side: two nearby labeled shapes with the same labelPos
    const labeled = sc.visuals.filter((v) => v.label);
    for (let a = 0; a < labeled.length; a++) {
      for (let b = a + 1; b < labeled.length; b++) {
        if (labeled[a]!.labelPos !== labeled[b]!.labelPos) continue;
        const ca = centre(labeled[a]!);
        const cb = centre(labeled[b]!);
        if (!ca || !cb) continue;
        const dx = ca.x - cb.x;
        const dy = ca.y - cb.y;
        if (Math.sqrt(dx * dx + dy * dy) < 12) {
          notes.push({ scene: si, kind: "labels_same_side", shape: labeled[a]!.id, message: `"${labeled[a]!.id}" and "${labeled[b]!.id}" both use labelPos "${labeled[a]!.labelPos}" and are close together` });
        }
      }
    }

    // linear_ease_on_move: a move uses ease: "linear" (looks robotic)
    for (const v of sc.visuals) {
      for (const m of v.moves) {
        if (m.ease === "linear") {
          notes.push({ scene: si, kind: "linear_ease_on_move", shape: v.id, message: `shape "${v.id}" has a move with ease: "linear" — use "ease" or "smooth" instead` });
          break;
        }
      }
    }

    // shapes_unfilled: circle or rect representing a physical object has fill "none"
    for (const v of sc.visuals) {
      if ((v.kind === "circle" || v.kind === "rect") && v.fill === "none" && v.label && v.role === undefined) {
        notes.push({ scene: si, kind: "shapes_unfilled", shape: v.id, message: `shape "${v.id}" (${v.kind}) has a label but fill "none" — physical objects should have a fill color` });
      }
    }

    // scale_imbalance: one shape's radius or dimension is > 3x the median of its own kind (a bag drawn as a rectangle is not compared with the marbles drawn as circles)
    const dimOf = (v: StoryVisual): number | null => {
      if (v.kind === "circle") return staticNum(v.r);
      if (v.kind === "rect") { const w = staticNum(v.w), h = staticNum(v.h); return w !== null && h !== null ? Math.max(w, h) : null; }
      if (v.kind === "polygon" && Array.isArray((v as any).points) && (v as any).points.length >= 3) {
        const pts: [unknown, unknown][] = (v as any).points;
        const xs = pts.map((p) => (typeof p[0] === "number" ? p[0] : 0));
        const ys = pts.map((p) => (typeof p[1] === "number" ? p[1] : 0));
        const pw = Math.max(...xs) - Math.min(...xs);
        const ph = Math.max(...ys) - Math.min(...ys);
        return pw > 0 && ph > 0 ? Math.max(pw, ph) / 2 : null;
      }
      return null;
    };
    for (const kind of ["circle", "rect", "polygon"] as const) {
      const same = sc.visuals.filter((v) => v.kind === kind && dimOf(v) !== null);
      if (same.length < 3) continue;
      const sorted = same.map((v) => dimOf(v)!).sort((a, b) => a - b);
      const median = sorted[Math.floor(sorted.length / 2)]!;
      for (const v of same) {
        const dim = dimOf(v)!;
        if (median > 0 && dim > 3 * median) {
          notes.push({ scene: si, kind: "scale_imbalance", shape: v.id, message: `shape "${v.id}" size ${dim.toFixed(1)} is > 3× the scene median ${median.toFixed(1)} — creates visual imbalance` });
        }
      }
    }

    // shape_overflows: any polygon vertex outside the stage bounds (0–100 × 0–45)
    for (const v of sc.visuals) {
      if (v.kind === "polygon" && Array.isArray((v as any).points)) {
        for (const pt of (v as any).points) {
          if (Array.isArray(pt) && typeof pt[0] === "number" && typeof pt[1] === "number") {
            if (pt[0] < 0 || pt[0] > 100 || pt[1] < 0 || pt[1] > 45) {
              notes.push({ scene: si, kind: "shape_overflows", shape: v.id, message: `polygon "${v.id}" vertex (${pt[0]}, ${pt[1]}) is outside stage bounds (0–100 × 0–45)` });
              break;
            }
          }
        }
      }
    }

    // composition_clustered: all static centres fit within a 20×15 bounding box (no spatial spread)
    if (centres.length >= 3) {
      const xs = centres.map((c) => c.x);
      const ys = centres.map((c) => c.y);
      const spanX = Math.max(...xs) - Math.min(...xs);
      const spanY = Math.max(...ys) - Math.min(...ys);
      if (spanX < 20 && spanY < 15) {
        notes.push({ scene: si, kind: "composition_clustered", message: `all ${centres.length} shapes are clustered in a ${spanX.toFixed(1)}×${spanY.toFixed(1)} area — spread shapes across the stage` });
      }
    }
  }

  notes.push(...undrawnNouns(story));
  return notes;
}

/**
 * When a sentence names something that has a drawn prop (a wall, a plant, a leaf) the scene should show it: a narrator saying "wall" over a picture with no wall leaves the
 * viewer to imagine it. A scene counts as showing the thing if it holds that prop, or any shape whose label or text uses the word.
 */
function undrawnNouns(story: Story): QANote[] {
  const notes: QANote[] = [];
  for (const [si, sc] of story.scenes.entries()) {
    const shown = (name: (typeof PROP_NAMES)[number]): boolean =>
      sc.visuals.some((v) => (v.kind === "prop" && v.name === name) || PROP_WORDS[name].test(v.label ?? "") || (v.kind === "text" && PROP_WORDS[name].test(v.text)));
    for (const name of PROP_NAMES) {
      const first = sc.sentences.findIndex((s) => PROP_WORDS[name].test(s.text));
      if (first >= 0 && !shown(name)) notes.push({ scene: si, kind: "noun_undrawn", sentence: first, message: `sentence ${first + 1} names a ${name} but the scene draws none (prop: "${name}")` });
    }
  }
  return notes;
}

/** Capital-letter abbreviations the voice may say wrongly (ATP, NADPH): any not in the pronunciation table is flagged to be listened to. */
const ABBREVIATION = /\b[A-Z]{2,6}\b/g;
/** More new shapes than this within one and a half seconds is more than a viewer can follow. */
const MOST_SHAPES_IN_A_WINDOW = 6;
const WINDOW_MS = 1500;

/**
 * Soft checks on a story once its sentences have been timed (ADR 0097): where the picture and the voice drift apart, and what the voice may say wrongly. Like storyQA it only
 * returns notes. A shape that appears after the sentence it belongs to has ended is late; a sentence that starts nothing leaves the viewer listening to an unchanged picture.
 */
export function placedQA(placed: PlacedStory): QANote[] {
  const notes: QANote[] = [];
  const flagged = new Set<string>();
  for (const [si, sc] of placed.scenes.entries()) {
    for (const [i, s] of sc.sentences.entries()) {
      const end = s.startMs + s.durMs - (s.pauseMs ?? 0);
      const own = sc.visuals.filter((v) => v.inS === i);
      if (own.length === 0) notes.push({ scene: si, kind: "dead_air", sentence: i, message: `sentence ${i + 1} ("${s.text.slice(0, 40)}") starts no shape, so the picture does not change while it is said` });
      const starts = own.map((v) => v.inMs).sort((a, b) => a - b);
      const busiest = starts.reduce((most, from, k) => Math.max(most, starts.filter((t, j) => j >= k && t - from <= WINDOW_MS).length), 0);
      if (busiest > MOST_SHAPES_IN_A_WINDOW) notes.push({ scene: si, kind: "crowded_sentence", sentence: i, message: `sentence ${i + 1} starts ${busiest} shapes within ${WINDOW_MS / 1000} seconds` });
      for (const v of own) {
        for (const w of v.missingWords ?? []) notes.push({ scene: si, kind: "cue_word_missing", shape: v.id, sentence: i, message: `shape "${v.id}" names the word "${w}", which sentence ${i + 1} does not contain, so its time falls back to the offset` });
        if (v.inMs > end) notes.push({ scene: si, kind: "late_cue", shape: v.id, sentence: i, message: `shape "${v.id}" appears ${Math.round(v.inMs - end)} ms after sentence ${i + 1} has ended` });
      }
      for (const m of s.text.match(ABBREVIATION) ?? []) {
        if (!(m in SPOKEN_TERMS) && !flagged.has(m)) {
          flagged.add(m);
          notes.push({ scene: si, kind: "abbreviation_unheard", sentence: i, message: `"${m}" is not in the pronunciation table: listen to how it is said, and add it (SPOKEN_TERMS) if it is wrong` });
        }
      }
    }
    // two shapes that claim the same cell while both are on screen sit on top of each other (ADR 0102)
    const gridded = sc.visuals.flatMap((v) => {
      const cells = v.cells ? gridCells(v.cells) : null;
      return cells ? [{ v, cells, from: v.inMs, to: v.outMs ?? sc.endMs }] : [];
    });
    for (const [a, x] of gridded.entries()) {
      for (const y of gridded.slice(a + 1)) {
        if (gridOverlap(x.cells, y.cells) && x.from < y.to && y.from < x.to) {
          notes.push({ scene: si, kind: "cell_conflict", shape: y.v.id, message: `shapes "${x.v.id}" and "${y.v.id}" are both in ${x.v.cells === y.v.cells ? `cell ${x.v.cells}` : `cells ${x.v.cells} and ${y.v.cells}, which overlap`} while both are on screen` });
        }
      }
    }
  }
  return notes;
}

/**
 * Advisory notes on the shape of a story as a lesson (ADR 0114). They are warnings for the host, never a failure, and they are kept apart from storyQA so the notes and the verdict of a
 * story that existed before are unchanged. qa.json carries them as entries with `severity: "advisory"` and one of these `kind`s; a consumer ignores a kind it does not know.
 *
 * The six-part template: a hook question, a named key term, one idea per scene, a worked example with the explained part highlighted, a one-line recap, and a hand-off to try one.
 * Heuristics (English cues are used only when the locale is English; the counts apply to every language):
 *  - key_term_unmarked: no shape and no highlighted word of the story has the role term or key (the author never said what the key term is).
 *  - key_term_unnamed: a shape with the role term or key has a label or text, and none of its words (3 letters or more) is spoken in its scene.
 *  - scene_many_ideas: a scene holds more than IDEA_LIMITS.definitions sentences that define a term ("is called", "we call", "is known as", "is defined as", "stands for"), or more than IDEA_LIMITS.labelled different labelled shapes (by first word).
 *  - worked_example_missing: no scene heading or sentence says "example", "for instance", "suppose", "let us try / solve / work / take" or the like.
 *  - worked_example_unmarked: such a scene exists but nothing in it is highlighted (no shape with a role, `focus` or `signal`, no highlighted word).
 *  - recap_missing: no scene has the role wrap; recap_long: the wrap scene has more than one sentence once its hand-off sentence is set aside.
 *  - handoff_missing: no sentence of the last scene invites the student to try one ("your turn", "try one", "now you", "can you solve", "have a go").
 *  - role_colour_shared / role_colour_varies: the colours the author wrote on shapes (not the engine's default for the kind) disagree about what a role means (the page draws roles in the role colours regardless; the note is for the host's prompts).
 */
export const IDEA_LIMITS = { definitions: 1, labelled: 5 } as const;
export const ADVISORY_KINDS = ["key_term_unmarked", "key_term_unnamed", "scene_many_ideas", "worked_example_missing", "worked_example_unmarked", "recap_missing", "recap_long", "handoff_missing", "role_colour_shared", "role_colour_varies"] as const;
const DEFINITION_RE = /\b(is called|are called|we call|is known as|are known as|is defined as|stands? for)\b/i;
const EXAMPLE_RE = /\b(for example|for instance|worked example|an example|example|suppose|let(?:'s| us) (?:try|work|solve|take|see|look at)|say we have)\b/i;
const HANDOFF_RE = /\b(your turn|try (?:one|it|this|another|a similar|solving)|now you|can you (?:solve|try|work|find|do)|have a go|give it a go)\b/i;

export function storyAdvisories(story: Story, options: { locale?: string } = {}): QANote[] {
  const english = (options.locale ?? "en-IN") === "en-IN";
  const notes: QANote[] = [];
  const marked = (v: StoryVisual): boolean => v.role !== undefined || v.focus || v.signal === true;
  const keyRole = (r: ColourRole | undefined): boolean => r === "term" || r === "key";

  // the key term: marked at all, and spoken
  const anyKey = story.scenes.some((sc) => sc.visuals.some((v) => keyRole(v.role)) || (sc.highlights ?? []).some((h) => keyRole(h.role)));
  if (!anyKey) notes.push({ scene: 0, kind: "key_term_unmarked", message: "no shape or highlighted word has the role term or key, so the key term is not marked" });
  for (const [si, sc] of story.scenes.entries()) {
    const said = sc.sentences.map((s) => s.text.toLowerCase()).join(" ");
    for (const v of sc.visuals) {
      if (!keyRole(v.role)) continue;
      const own = (v.label ?? (v.kind === "text" ? v.text : "")).toLowerCase();
      const words = own.split(/[^\p{L}\p{N}]+/u).filter((w) => w.length >= 3);
      if (words.length > 0 && !words.some((w) => said.includes(w))) notes.push({ scene: si, kind: "key_term_unnamed", shape: v.id, message: `shape "${v.id}" is marked ${v.role} ("${own.slice(0, 30)}") but its words are not spoken in the scene` });
    }
    // one idea per scene
    const definitions = sc.sentences.filter((s) => english && DEFINITION_RE.test(s.text)).length;
    const labelled = new Set(sc.visuals.filter((v) => v.label).map((v) => v.label!.split(/\s+/)[0]!.toLowerCase())).size;
    if (definitions > IDEA_LIMITS.definitions || labelled > IDEA_LIMITS.labelled) {
      notes.push({ scene: si, kind: "scene_many_ideas", message: `scene holds ${definitions} term definition(s) and ${labelled} labelled shape(s) (one idea per scene: at most ${IDEA_LIMITS.definitions} and ${IDEA_LIMITS.labelled})` });
    }
  }

  // the worked example
  if (english) {
    const worked = story.scenes.flatMap((sc, si) => (EXAMPLE_RE.test(sc.heading) || sc.sentences.some((s) => EXAMPLE_RE.test(s.text)) ? [si] : []));
    if (worked.length === 0) notes.push({ scene: 0, kind: "worked_example_missing", message: "no scene works an example (none says example, for instance, suppose or let us try)" });
    else if (!worked.some((si) => story.scenes[si]!.visuals.some(marked) || (story.scenes[si]!.highlights ?? []).length > 0)) notes.push({ scene: worked[0]!, kind: "worked_example_unmarked", message: "the worked example highlights nothing: give the part being explained a role, focus or a highlighted word" });
  }

  // the recap and the hand-off
  const last = story.scenes[story.scenes.length - 1];
  const wrapAt = story.scenes.map((s) => s.role).lastIndexOf("wrap");
  if (wrapAt < 0) notes.push({ scene: Math.max(0, story.scenes.length - 1), kind: "recap_missing", message: "no scene has role: wrap, so there is no one-line recap" });
  else {
    const recap = story.scenes[wrapAt]!.sentences.filter((s) => !(english && HANDOFF_RE.test(s.text)));
    if (recap.length > 1) notes.push({ scene: wrapAt, kind: "recap_long", message: `the wrap scene has ${recap.length} sentences besides the hand-off: the recap should be one line` });
  }
  if (english && last && !last.sentences.some((s) => HANDOFF_RE.test(s.text))) notes.push({ scene: story.scenes.length - 1, kind: "handoff_missing", message: "the last scene never invites the student to try one (a your-turn sentence)" });

  // colours that disagree about a role
  const byRole = new Map<ColourRole, Map<string, number>>();
  const byColour = new Map<string, Map<ColourRole, number>>();
  for (const [si, sc] of story.scenes.entries()) {
    for (const v of sc.visuals) {
      // a colour the author never wrote is the engine's default for the kind (ink for text and formulas, blue for the rest): it says nothing about what the author meant
      const isDefault = v.color === (v.kind === "text" || v.kind === "math" ? "ink" : "blue");
      if (!v.role || v.color === "none" || isDefault) continue;
      const roleColours = byRole.get(v.role) ?? new Map<string, number>();
      if (!roleColours.has(v.color)) roleColours.set(v.color, si);
      byRole.set(v.role, roleColours);
      const colourRoles = byColour.get(v.color) ?? new Map<ColourRole, number>();
      if (!colourRoles.has(v.role)) colourRoles.set(v.role, si);
      byColour.set(v.color, colourRoles);
    }
  }
  for (const [role, colours] of byRole) if (colours.size > 1) notes.push({ scene: Math.max(...colours.values()), kind: "role_colour_varies", message: `role ${role} is written in ${colours.size} colours (${[...colours.keys()].join(", ")}): one colour per role` });
  for (const [colour, roles] of byColour) if (roles.size > 1) notes.push({ scene: Math.max(...roles.values()), kind: "role_colour_shared", message: `colour ${colour} is written for ${roles.size} roles (${[...roles.keys()].join(", ")}): one role per colour` });
  return notes;
}
