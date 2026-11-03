import type { StoryColor } from "./story";

/**
 * Drawn objects a story can place by name (ADR 0098): a plant, a leaf, a brick wall, a door, the sun, a water drop, a battery. They are what a narrator's nouns turn into on
 * screen, so a sentence that says "wall" can show a wall with a dark border instead of a plain rectangle.
 *
 * Each prop is a list of simple parts in its own box (0 to w across, 0 to h down). The stage draws the box scaled to the size the story asks for and anchored where the story
 * says: a plant and a wall stand on their anchor (bottom middle), so growing one scales it about its base. A part's line width `sw` is in stage units, so the border of a wall
 * is the same weight whatever size the wall is. Colours are the stage's own palette names; "outline" is the one shared charcoal. Everything here is data: the same list is
 * sent to the page, which has no copy of it.
 */
export type PropPart = { fill?: StoryColor; fillOpacity?: number; stroke?: StoryColor | "outline"; sw?: number } & (
  | { tag: "path"; d: string }
  | { tag: "rect"; x: number; y: number; w: number; h: number; rx?: number }
  | { tag: "circle"; cx: number; cy: number; r: number }
  | { tag: "line"; x1: number; y1: number; x2: number; y2: number }
);
export type PropDef = { w: number; h: number; anchor: "bottom" | "center"; parts: PropPart[] };

export const PROP_NAMES = ["plant", "leaf", "wall", "door", "sun", "drop", "battery"] as const;
export type PropName = (typeof PROP_NAMES)[number];

const line = (x1: number, y1: number, x2: number, y2: number, stroke: StoryColor | "outline", sw: number): PropPart => ({ tag: "line", x1, y1, x2, y2, stroke, sw });

/** Rows of bricks, each row shifted half a brick from the one below, inside a wall with a heavier border. */
function brickParts(width: number, height: number, rows: number, brickW: number): PropPart[] {
  const rowH = height / rows;
  const parts: PropPart[] = [{ tag: "rect", x: 0, y: 0, w: width, h: height, fill: "red", fillOpacity: 0.22, stroke: "outline", sw: 0.22 }];
  for (let r = 0; r < rows; r++) {
    const shift = r % 2 === 0 ? 0 : brickW / 2;
    for (let x = shift - brickW; x < width; x += brickW) {
      const x0 = Math.max(0, x);
      const x1 = Math.min(width, x + brickW);
      if (x1 - x0 > 0.5) parts.push({ tag: "rect", x: x0, y: r * rowH, w: x1 - x0, h: rowH, fill: "red", fillOpacity: 0.32, stroke: "outline", sw: 0.1 });
    }
  }
  return parts;
}

/** Side veins of a leaf: where each leaves the midrib and how far out and up it reaches (the leaf is widest a little below its middle). */
const VEINS: PropPart[] = ([[20, 8], [30, 12], [40, 11], [48, 7]] as const).flatMap(([y, reach]): PropPart[] => [
  line(20, y, 20 + reach, y - 6, "outline", 0.06),
  line(20, y, 20 - reach, y - 6, "outline", 0.06),
]);

const RAYS: PropPart[] = Array.from({ length: 8 }, (_unused, i) => {
  const a = (Math.PI / 4) * i;
  return line(20 + Math.cos(a) * 11.5, 20 + Math.sin(a) * 11.5, 20 + Math.cos(a) * 17, 20 + Math.sin(a) * 17, "yellow", 0.35);
});

export const PROPS: Readonly<Record<PropName, PropDef>> = {
  plant: {
    w: 60, h: 100, anchor: "bottom",
    parts: [
      { tag: "path", d: "M 4,100 C 12,92 48,92 56,100 Z", fill: "soft", fillOpacity: 0.55, stroke: "outline", sw: 0.14 },
      { tag: "path", d: "M 30,96 C 28,78 32,52 30,26", stroke: "green", sw: 0.55 },
      { tag: "path", d: "M 30,70 C 17,68 7,58 5,44 C 19,44 28,54 30,70 Z", fill: "green", fillOpacity: 0.85, stroke: "outline", sw: 0.12 },
      { tag: "path", d: "M 30,54 C 43,52 53,42 55,28 C 41,28 32,38 30,54 Z", fill: "green", fillOpacity: 0.85, stroke: "outline", sw: 0.12 },
      { tag: "path", d: "M 30,28 C 24,20 25,10 30,2 C 35,10 36,20 30,28 Z", fill: "green", fillOpacity: 0.85, stroke: "outline", sw: 0.12 },
    ],
  },
  leaf: {
    w: 40, h: 64, anchor: "bottom",
    parts: [
      line(20, 64, 20, 54, "green", 0.3),
      { tag: "path", d: "M 20,2 C 33,13 37,33 20,56 C 3,33 7,13 20,2 Z", fill: "green", fillOpacity: 0.85, stroke: "outline", sw: 0.14 },
      line(20, 6, 20, 56, "outline", 0.08),
      ...VEINS,
    ],
  },
  wall: { w: 100, h: 40, anchor: "bottom", parts: brickParts(100, 40, 5, 20) },
  door: {
    w: 20, h: 30, anchor: "bottom",
    parts: [
      { tag: "path", d: "M 2,30 L 2,12 C 2,2 18,2 18,12 L 18,30 Z", fill: "orange", fillOpacity: 0.55, stroke: "outline", sw: 0.14 },
      { tag: "circle", cx: 14, cy: 19, r: 1.2, fill: "yellow", stroke: "outline", sw: 0.06 },
    ],
  },
  sun: { w: 40, h: 40, anchor: "center", parts: [...RAYS, { tag: "circle", cx: 20, cy: 20, r: 8.5, fill: "yellow", fillOpacity: 1, stroke: "outline", sw: 0.1 }] },
  drop: {
    w: 20, h: 28, anchor: "center",
    parts: [{ tag: "path", d: "M 10,2 C 14,10 18,15 18,19 C 18,24 14,27 10,27 C 6,27 2,24 2,19 C 2,15 6,10 10,2 Z", fill: "blue", fillOpacity: 0.85, stroke: "outline", sw: 0.1 }],
  },
  battery: {
    w: 40, h: 20, anchor: "center",
    parts: [
      { tag: "rect", x: 0, y: 3, w: 34, h: 14, rx: 2, stroke: "outline", sw: 0.15 },
      { tag: "rect", x: 34, y: 7, w: 5, h: 6, fill: "ink", stroke: "outline", sw: 0.06 },
      { tag: "rect", x: 2.5, y: 5.5, w: 8, h: 9, fill: "green", fillOpacity: 0.85 },
      { tag: "rect", x: 12, y: 5.5, w: 8, h: 9, fill: "green", fillOpacity: 0.85 },
      { tag: "rect", x: 21.5, y: 5.5, w: 8.5, h: 9, fill: "green", fillOpacity: 0.85 },
    ],
  },
};

/** The words a narrator uses for each prop, so a sentence that names one can be checked against the picture. */
export const PROP_WORDS: Readonly<Record<PropName, RegExp>> = {
  plant: /\bplants?\b/i,
  leaf: /\b(leaf|leaves)\b/i,
  wall: /\bwalls?\b/i,
  door: /\bdoors?\b/i,
  sun: /\b(sun|sunlight)\b/i,
  drop: /\bdrops?\b/i,
  battery: /\b(batter(y|ies)|power banks?)\b/i,
};
