/**
 * Soft QA for story videos (ADR 0092). Returns a list of notes — never fails a build; the caller
 * can log them, surface them in the API response, or gate publishing. Each check targets one of the
 * six 3Blue1Brown quality rules baked into the v2 prompts.
 *
 * 17 checks: 9 original + 5 spatial/motion + 3 visual quality
 * (shapes_unfilled, scale_imbalance, composition_clustered).
 */
import { STAGE, type PlacedStory, type Story, type StoryVisual, type StoryNum } from "./story";
import { SPOKEN_TERMS } from "./source";
import { PROP_NAMES, PROP_WORDS } from "./story-props";

export type QANote = { scene: number; kind: string; message: string };

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
            notes.push({ scene: si, kind: "no_color_map", message: `shape "${v.id}" color "${v.color}" does not match color_map entry "${key}" → "${story.color_map[key]}"` });
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
        notes.push({ scene: si, kind: "covariation_static", message: `sentence ${qi + 1} uses a change word but no t-expression is visible in the scene` });
        break;
      }
    }

    // anchor: a labeled shape whose label word does not appear in any sentence
    const allText = sc.sentences.map((s) => s.text.toLowerCase()).join(" ");
    for (const v of sc.visuals) {
      if (v.label) {
        const word = v.label.split(/\s+/)[0]?.toLowerCase() ?? "";
        if (word && !allText.includes(word)) {
          notes.push({ scene: si, kind: "anchor_missing", message: `shape "${v.id}" has label "${v.label}" but its first word does not appear in any sentence` });
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
        notes.push({ scene: si, kind: "callout_orphaned", message: `callout target "${v.target}" not found in scene` });
      }
      if (v.kind === "trace" && !ids.has(v.sourceId)) {
        notes.push({ scene: si, kind: "trace_orphaned", message: `trace sourceId "${v.sourceId}" not found in scene` });
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
        notes.push({ scene: si, kind: "shape_in_margin", message: `shape "${v.id}" centre (${c.x.toFixed(1)}, ${c.y.toFixed(1)}) is in the margin` });
      }
    }

    // shapes_too_close: two static centres within 6 units
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
        if (dist < 6) {
          notes.push({ scene: si, kind: "shapes_too_close", message: `"${centres[a]!.id}" and "${centres[b]!.id}" are ${dist.toFixed(1)} units apart (min 8 recommended)` });
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
          notes.push({ scene: si, kind: "labels_same_side", message: `"${labeled[a]!.id}" and "${labeled[b]!.id}" both use labelPos "${labeled[a]!.labelPos}" and are close together` });
        }
      }
    }

    // linear_ease_on_move: a move uses ease: "linear" (looks robotic)
    for (const v of sc.visuals) {
      for (const m of v.moves) {
        if (m.ease === "linear") {
          notes.push({ scene: si, kind: "linear_ease_on_move", message: `shape "${v.id}" has a move with ease: "linear" — use "ease" or "smooth" instead` });
          break;
        }
      }
    }

    // shapes_unfilled: circle or rect representing a physical object has fill "none"
    for (const v of sc.visuals) {
      if ((v.kind === "circle" || v.kind === "rect") && v.fill === "none" && v.label) {
        notes.push({ scene: si, kind: "shapes_unfilled", message: `shape "${v.id}" (${v.kind}) has a label but fill "none" — physical objects should have a fill color` });
      }
    }

    // scale_imbalance: one shape's radius or dimension is > 3× the median (creates visual noise)
    const radii: number[] = [];
    for (const v of sc.visuals) {
      if (v.kind === "circle") { const r = staticNum(v.r); if (r !== null) radii.push(r); }
      else if (v.kind === "rect") { const w = staticNum(v.w), h = staticNum(v.h); if (w !== null && h !== null) radii.push(Math.max(w, h)); }
      else if (v.kind === "polygon" && Array.isArray((v as any).points) && (v as any).points.length >= 3) {
        const pts: [unknown, unknown][] = (v as any).points;
        const xs = pts.map((p) => (typeof p[0] === "number" ? p[0] : 0));
        const ys = pts.map((p) => (typeof p[1] === "number" ? p[1] : 0));
        const pw = Math.max(...xs) - Math.min(...xs);
        const ph = Math.max(...ys) - Math.min(...ys);
        if (pw > 0 && ph > 0) radii.push(Math.max(pw, ph) / 2);
      }
    }
    if (radii.length >= 3) {
      const sorted = [...radii].sort((a, b) => a - b);
      const median = sorted[Math.floor(sorted.length / 2)]!;
      for (const v of sc.visuals) {
        let dim: number | null = null;
        if (v.kind === "circle") dim = staticNum(v.r);
        else if (v.kind === "rect") { const w = staticNum(v.w), h = staticNum(v.h); dim = w !== null && h !== null ? Math.max(w, h) : null; }
        else if (v.kind === "polygon" && Array.isArray((v as any).points) && (v as any).points.length >= 3) {
          const pts: [unknown, unknown][] = (v as any).points;
          const xs = pts.map((p) => (typeof p[0] === "number" ? p[0] : 0));
          const ys = pts.map((p) => (typeof p[1] === "number" ? p[1] : 0));
          const pw = Math.max(...xs) - Math.min(...xs);
          const ph = Math.max(...ys) - Math.min(...ys);
          if (pw > 0 && ph > 0) dim = Math.max(pw, ph) / 2;
        }
        if (dim !== null && median > 0 && dim > 3 * median) {
          notes.push({ scene: si, kind: "scale_imbalance", message: `shape "${v.id}" size ${dim.toFixed(1)} is > 3× the scene median ${median.toFixed(1)} — creates visual imbalance` });
        }
      }
    }

    // shape_overflows: any polygon vertex outside the stage bounds (0–100 × 0–45)
    for (const v of sc.visuals) {
      if (v.kind === "polygon" && Array.isArray((v as any).points)) {
        for (const pt of (v as any).points) {
          if (Array.isArray(pt) && typeof pt[0] === "number" && typeof pt[1] === "number") {
            if (pt[0] < 0 || pt[0] > 100 || pt[1] < 0 || pt[1] > 45) {
              notes.push({ scene: si, kind: "shape_overflows", message: `polygon "${v.id}" vertex (${pt[0]}, ${pt[1]}) is outside stage bounds (0–100 × 0–45)` });
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
      if (first >= 0 && !shown(name)) notes.push({ scene: si, kind: "noun_undrawn", message: `sentence ${first + 1} names a ${name} but the scene draws none (prop: "${name}")` });
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
      if (own.length === 0) notes.push({ scene: si, kind: "dead_air", message: `sentence ${i + 1} ("${s.text.slice(0, 40)}") starts no shape, so the picture does not change while it is said` });
      const starts = own.map((v) => v.inMs).sort((a, b) => a - b);
      const busiest = starts.reduce((most, from, k) => Math.max(most, starts.filter((t, j) => j >= k && t - from <= WINDOW_MS).length), 0);
      if (busiest > MOST_SHAPES_IN_A_WINDOW) notes.push({ scene: si, kind: "crowded_sentence", message: `sentence ${i + 1} starts ${busiest} shapes within ${WINDOW_MS / 1000} seconds` });
      for (const v of own) {
        if (v.inMs > end) notes.push({ scene: si, kind: "late_cue", message: `shape "${v.id}" appears ${Math.round(v.inMs - end)} ms after sentence ${i + 1} has ended` });
      }
      for (const m of s.text.match(ABBREVIATION) ?? []) {
        if (!(m in SPOKEN_TERMS) && !flagged.has(m)) {
          flagged.add(m);
          notes.push({ scene: si, kind: "abbreviation_unheard", message: `"${m}" is not in the pronunciation table: listen to how it is said, and add it (SPOKEN_TERMS) if it is wrong` });
        }
      }
    }
  }
  return notes;
}
