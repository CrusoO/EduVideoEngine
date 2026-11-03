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

export const PROP_NAMES = ["plant", "leaf", "wall", "door", "sun", "drop", "battery", "cloud", "tree", "flame", "bulb", "heart", "cell", "mountain", "house"] as const;
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
  cloud: {
    w: 60, h: 36, anchor: "center",
    parts: [{ tag: "path", d: "M 14,32 C 3,32 1,19 12,17 C 12,6 28,2 34,11 C 40,5 55,9 52,19 C 60,21 58,32 48,32 Z", fill: "blue", fillOpacity: 0.28, stroke: "outline", sw: 0.12 }],
  },
  tree: {
    w: 50, h: 80, anchor: "bottom",
    parts: [
      { tag: "path", d: "M 21,80 L 22,54 L 28,54 L 29,80 Z", fill: "orange", fillOpacity: 0.55, stroke: "outline", sw: 0.12 },
      { tag: "path", d: "M 25,3 C 40,3 48,18 42,31 C 50,40 44,55 30,52 L 20,52 C 6,55 0,40 8,31 C 2,18 10,3 25,3 Z", fill: "green", fillOpacity: 0.85, stroke: "outline", sw: 0.14 },
    ],
  },
  flame: {
    w: 30, h: 44, anchor: "bottom",
    parts: [
      { tag: "path", d: "M 15,2 C 18,14 28,20 28,32 C 28,40 22,43 15,43 C 8,43 2,40 2,32 C 2,22 10,16 15,2 Z", fill: "orange", fillOpacity: 0.9, stroke: "outline", sw: 0.12 },
      { tag: "path", d: "M 15,20 C 17,27 22,30 22,35 C 22,39 19,41 15,41 C 11,41 8,39 8,35 C 8,30 13,27 15,20 Z", fill: "yellow", fillOpacity: 0.95, stroke: "outline", sw: 0.07 },
    ],
  },
  bulb: {
    w: 30, h: 44, anchor: "center",
    parts: [
      { tag: "path", d: "M 15,2 C 25,2 29,10 27,18 C 26,23 21,25 20,31 L 10,31 C 9,25 4,23 3,18 C 1,10 5,2 15,2 Z", fill: "yellow", fillOpacity: 0.7, stroke: "outline", sw: 0.12 },
      { tag: "rect", x: 10, y: 31, w: 10, h: 9, rx: 1.5, fill: "soft", fillOpacity: 0.5, stroke: "outline", sw: 0.1 },
      { tag: "path", d: "M 11,23 L 13,14 L 15,21 L 17,14 L 19,23", stroke: "outline", sw: 0.09 },
      line(11, 35, 19, 35, "outline", 0.07),
    ],
  },
  heart: {
    w: 40, h: 36, anchor: "center",
    parts: [{ tag: "path", d: "M 20,34 C 4,22 2,12 8,7 C 14,2 20,6 20,11 C 20,6 26,2 32,7 C 38,12 36,22 20,34 Z", fill: "red", fillOpacity: 0.8, stroke: "outline", sw: 0.12 }],
  },
  cell: {
    w: 50, h: 40, anchor: "center",
    parts: [
      { tag: "path", d: "M 25,2 C 42,2 48,12 47,22 C 46,33 36,38 24,38 C 10,38 3,30 3,20 C 3,9 12,2 25,2 Z", fill: "green", fillOpacity: 0.2, stroke: "outline", sw: 0.14 },
      { tag: "circle", cx: 26, cy: 20, r: 8, fill: "purple", fillOpacity: 0.4, stroke: "outline", sw: 0.1 },
      { tag: "circle", cx: 28, cy: 18, r: 3, fill: "purple", fillOpacity: 0.8 },
      { tag: "circle", cx: 12, cy: 13, r: 2.4, fill: "orange", fillOpacity: 0.7, stroke: "outline", sw: 0.06 },
      { tag: "circle", cx: 39, cy: 28, r: 2.4, fill: "orange", fillOpacity: 0.7, stroke: "outline", sw: 0.06 },
      { tag: "circle", cx: 14, cy: 29, r: 2.4, fill: "orange", fillOpacity: 0.7, stroke: "outline", sw: 0.06 },
    ],
  },
  mountain: {
    w: 60, h: 36, anchor: "bottom",
    parts: [
      { tag: "path", d: "M 2,36 L 22,6 L 32,20 L 40,10 L 58,36 Z", fill: "soft", fillOpacity: 0.4, stroke: "outline", sw: 0.14 },
      { tag: "path", d: "M 22,6 L 27,13 L 22,11 L 17,14 Z", fill: "blue", fillOpacity: 0.25, stroke: "outline", sw: 0.07 },
    ],
  },
  house: {
    w: 50, h: 42, anchor: "bottom",
    parts: [
      { tag: "rect", x: 6, y: 20, w: 38, h: 22, fill: "yellow", fillOpacity: 0.4, stroke: "outline", sw: 0.12 },
      { tag: "path", d: "M 2,20 L 25,3 L 48,20 Z", fill: "red", fillOpacity: 0.55, stroke: "outline", sw: 0.14 },
      { tag: "rect", x: 21, y: 28, w: 9, h: 14, fill: "orange", fillOpacity: 0.6, stroke: "outline", sw: 0.08 },
      { tag: "rect", x: 10, y: 26, w: 8, h: 8, fill: "blue", fillOpacity: 0.35, stroke: "outline", sw: 0.08 },
      line(14, 26, 14, 34, "outline", 0.06),
      line(10, 30, 18, 30, "outline", 0.06),
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
  cloud: /\bclouds?\b/i,
  tree: /\btrees?\b/i,
  flame: /\b(flames?|fire)\b/i,
  bulb: /\b(bulbs?|lamps?)\b/i,
  heart: /\bhearts?\b/i,
  cell: /\bcells?\b/i,
  mountain: /\b(mountains?|hills?)\b/i,
  house: /\b(houses?|homes?)\b/i,
};
