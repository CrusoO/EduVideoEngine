import { COLOUR_ROLES, type ColourRole, type PlacedStory, type PlacedVisual, type StoryColor } from "./story";
import type { Theme, VisualStyle } from "./story-page";

/**
 * Colour roles (ADR 0114): what a colour MEANS in a story, the same in every scene. `term` is the thing being explained, `key` the key element or result, `look-again` (amber) a caution or
 * common mistake, `checked` (green) something verified by code. One colour per role per palette. A role is never told apart by hue alone: look-again and checked also change the shape
 * (a dashed outline against a solid one) and put a short mark before a label or a line of text. Colours are chosen to be at least 4.5:1 against the stage background for text and 3:1 for graphics
 * (tested from these hexes in tests/story-roles.test.ts). A story that names no role is drawn exactly as before.
 */
export type RolePalette = Record<ColourRole, string>;
export const ROLE_PALETTES: Record<"whiteboard" | "dark" | "animated", RolePalette> = {
  whiteboard: { term: "#1a56c4", key: "#7a2fc7", "look-again": "#8f5500", checked: "#0a7a3d" },
  dark: { term: "#6cb6ff", key: "#c9a4ff", "look-again": "#ffc233", checked: "#5ee08f" },
  animated: { term: "#1a56c4", key: "#7a2fc7", "look-again": "#8f5500", checked: "#0a7a3d" },
};
/** The short text put before a label or a line of text, so a caution and a check do not depend on hue (colour-blind viewers). Term and key need none: they differ from the other roles in hue and lightness. */
export const ROLE_MARKS: Partial<Record<ColourRole, string>> = { "look-again": "! ", checked: "OK " };

/** Which role palette a page uses: the animated style has its own canvas whatever the theme; otherwise the theme decides. */
export const rolePaletteName = (theme: Theme, style: VisualStyle): keyof typeof ROLE_PALETTES => (style === "animated" ? "animated" : theme);
/** The palette key of a role colour in the page's palette (`role_look_again` for `look-again`). */
export const roleKey = (r: ColourRole): string => `role_${r.replace("-", "_")}`;

const lum = (hex: string): number => {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0]! + 0.7152 * c[1]! + 0.0722 * c[2]!;
};
/** WCAG contrast ratio of two #rrggbb colours (1 to 21). */
export function contrastRatio(a: string, b: string): number {
  const [x, y] = [lum(a), lum(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

/** Whether the story names any role (on a shape or on a sentence): only then does the page carry role colours. */
export const usesRoles = (story: PlacedStory): boolean => story.scenes.some((sc) => (sc.highlights?.length ?? 0) > 0 || sc.visuals.some((v) => v.role !== undefined));

/** The palette of the page with the four role colours added (only when the story uses roles). */
export function withRoleColours<P extends Record<string, string>>(palette: P, name: keyof typeof ROLE_PALETTES): P & Record<string, string> {
  const out: Record<string, string> = { ...palette };
  for (const r of COLOUR_ROLES) out[roleKey(r)] = ROLE_PALETTES[name][r];
  return out as P & Record<string, string>;
}

const asColour = (r: ColourRole): StoryColor => roleKey(r) as StoryColor;

/** A shape drawn in its role: the stroke, the text and any fill take the role's colour; a caution is dashed; a label or a line of text starts with the role's mark. A shape with no role is returned unchanged. */
export function applyRole(v: PlacedVisual): PlacedVisual {
  if (v.role === undefined) return v;
  const mark = ROLE_MARKS[v.role] ?? "";
  const c = asColour(v.role);
  const out = { ...v, color: c, ...(v.fill !== "none" ? { fill: c } : {}), ...(v.role === "look-again" ? { dash: true } : {}) } as PlacedVisual & { text?: string };
  if (mark) {
    if (out.label && !out.label.startsWith(mark)) out.label = mark + out.label;
    if (v.kind === "text" && out.text !== undefined && !out.text.startsWith(mark)) out.text = mark + out.text;
  }
  return out;
}
