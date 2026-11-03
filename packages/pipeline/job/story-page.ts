import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { STORY_STYLE, type PlacedStory } from "./story";
import { PROPS } from "./story-props";

/** The colours a story may name, for each theme. A host names a colour; it never writes one. */
export const PALETTES = {
  whiteboard: { bg: "#faf8f2", panel: "#ffffff", rule: "#e2ddd0", ink: "#1c2433", soft: "#7b8190", blue: "#1f6feb", red: "#d6336c", green: "#12a150", yellow: "#d99a00", orange: "#e8590c", purple: "#7048e8", teal: "#0c8599", pink: "#c2255c" },
  dark: { bg: "#10131a", panel: "#171b24", rule: "#2a3140", ink: "#f1f4f9", soft: "#8d97a8", blue: "#4cc0ff", red: "#ff6b81", green: "#51d88a", yellow: "#ffd43b", orange: "#ff922b", purple: "#b197fc", teal: "#38d9a9", pink: "#f783ac" },
} as const;
/** Semantic colour overrides for the animated style — premium studio palette on a warm cream canvas. */
export const ANIMATED_PALETTE_OVERRIDE = {
  bg: "#fdfbf7", panel: "#fdfbf7", rule: "#e8e3d8", ink: "#1a1a1a", soft: "#5a6270",
  red: "#e63946", yellow: "#ffd700", green: "#52b788", blue: "#48cae4",
  orange: "#f4a261", purple: "#8B5CF6", teal: "#4cc9f0", pink: "#f72585",
};
export type Theme = keyof typeof PALETTES;
export const FRAME = { width: 1920, height: 1080 } as const;

/** JSON that is safe inside a script element: no `</script>`, no line separators that end a string early. */
export const embedJson = (v: unknown): string => JSON.stringify(v).replace(/</g, "\\u003c").replace(/>/g, "\\u003e").replace(/&/g, "\\u0026").replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");

/**
 * Visual style for a story page.
 *   technical  — 3Blue1Brown-style: Inter font, moderate caption, neutral tones.
 *   animated   — L amine Labs-style: heavier heading weight, larger caption, slightly warmer panel background.
 */
export type VisualStyle = "technical" | "animated";

/**
 * The page that draws a story: a 1920 by 1080 frame holding the heading, the scene counter, the stage (one SVG, 100 by 45 units) and the caption. The runtime
 * (scripts/story-runtime.js) is put in as text; `math` holds the typeset formulas (KaTeX output) keyed `scene:shape`; `katexCss` is a file URL.
 * `visualStyle` controls typographic and colour treatment: "technical" (default) for 3Blue1Brown-style, "animated" for illustrated-explainer style.
 */
export type StoryPageOptions = { visualStyle?: VisualStyle; locale?: string; chrome?: "full" | "none"; captions?: "sentence" | "none"; font?: "inter" | "atkinson" };

export function storyPageHtml(story: PlacedStory, theme: Theme, math: Record<string, string>, runtime: string, katexCss: string, options: StoryPageOptions = {}): string {
  const { visualStyle = "technical", locale = "en-IN", chrome = "full", captions = "sentence", font = "inter" } = options;
  const baseP = PALETTES[theme];
  const isAnimated = visualStyle === "animated";
  // chrome "none" (ADR 0096): one plain white frame holding only the stage and the caption, with no heading, counter, card border or progress bar
  const clean = chrome === "none";
  const fullBleed = isAnimated || clean;
  // animated style gets the quantum.mp4 semantic palette (bright yellows, vivid reds, punchy purples)
  const p = isAnimated ? { ...baseP, ...ANIMATED_PALETTE_OVERRIDE } : baseP;
  const isDevanagari = locale === "hi-IN" || locale === "ne-NP";
  const langAttr = locale === "hi-IN" ? "hi" : locale === "ne-NP" ? "ne" : "en";
  const data = { title: story.title, scenes: story.scenes, totalMs: story.totalMs, palette: p, math, visualStyle, locale, style: STORY_STYLE, props: PROPS, chrome };
  const fontDir = resolve(__dirname, "../../components/fonts");
  const inter400 = pathToFileURL(resolve(fontDir, "inter-latin-400.woff2")).href;
  const inter600 = pathToFileURL(resolve(fontDir, "inter-latin-600.woff2")).href;
  // Atkinson Hyperlegible (ADR 0098): a face made so that look-alike characters, such as the O in CO2 and a zero, can be told apart. Bundled, so nothing is fetched.
  const atkinsonDir = resolve(__dirname, "../fonts");
  const atkinson400 = pathToFileURL(resolve(atkinsonDir, "atkinson-hyperlegible-latin-400.woff2")).href;
  const atkinson700 = pathToFileURL(resolve(atkinsonDir, "atkinson-hyperlegible-latin-700.woff2")).href;
  const atkinsonFace = font === "atkinson"
    ? `@font-face{font-family:"Atkinson Hyperlegible";src:url("${atkinson400}") format("woff2");font-weight:400;font-display:block}
@font-face{font-family:"Atkinson Hyperlegible";src:url("${atkinson700}") format("woff2");font-weight:700;font-display:block}`
    : "";
  // animated style: Montserrat ExtraBold (geometric, premium, cognitive-transparency brief)
  // technical: clean Inter with moderate weight (3Blue1Brown-style)
  const headingWeight = font === "atkinson" ? "700" : isAnimated ? "800" : "650";
  const captionSize = isAnimated || clean ? "34px" : "40px";
  const captionWeight = font === "atkinson" ? "400" : "500";
  // animated: dark cinematic canvas — Kurzgesagt/Lamine-style deep background
  // the clean frame is the theme's own panel colour (white for the whiteboard) in every style: the animated palette's cream is for its full frame, not for this one (ADR 0099)
  const panelBg = clean ? baseP.panel : isAnimated ? p.bg : p.panel;
  const pageBg = clean ? baseP.panel : p.bg;
  // animated: Montserrat gives the geometric, premium-studio feel the brief demands; Devanagari always uses Noto
  const animatedFontStack = '"Plus Jakarta Sans","Montserrat","Inter","Segoe UI",system-ui,sans-serif';
  const fontStack = isDevanagari
    ? '"Noto Sans Devanagari","Inter","Segoe UI",Arial,sans-serif'
    : font === "atkinson" ? '"Atkinson Hyperlegible","Inter","Segoe UI",system-ui,sans-serif'
    : isAnimated ? animatedFontStack : '"Inter","Segoe UI","Helvetica Neue",Arial,sans-serif';
  // Devanagari: positive letter-spacing breaks matras; optimizeLegibility enables kerning/ligatures
  const captionLetterSpacing = isDevanagari ? "0" : isAnimated ? "0.02em" : "-0.01em";
  const headingLetterSpacing = isDevanagari ? "0" : isAnimated ? "-0.025em" : "-.01em";
  const devanagariExtra = isDevanagari ? "text-rendering:optimizeLegibility;font-feature-settings:\"kern\" 1,\"liga\" 1;" : "";
  // Noto Sans Devanagari + Baloo 2 loaded from Google Fonts; Playwright can reach the network for screenshots
  const googleFontLinks = [
    isDevanagari ? '<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Noto+Sans+Devanagari:wght@400;600&display=swap">' : "",
    isAnimated && !isDevanagari ? '<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@600;700;800&display=swap">' : "",
  ].join("");
  // animated: heading strip sits at top-center with a translucent cream background so content shows through
  const topJustify = isAnimated ? "center" : "space-between";
  const headingAlign = isAnimated ? "center" : "left";
  // animated: no panel border or radius — edge-to-edge premium studio canvas
  const panelBorder = fullBleed ? "none" : `1px solid ${p.rule}`;
  const panelRadius = fullBleed ? "0" : "24px";
  // animated: heading strip overlays the top with a translucent cream wash; caption at bottom with matching wash
  const captionWash = clean ? "rgba(255,255,255,0.94)" : "rgba(253,251,247,0.94)";
  const captionCss = fullBleed
    ? `left:0;width:${FRAME.width}px;bottom:0;height:110px;z-index:20;justify-content:center;text-align:center;padding:0 120px;background:linear-gradient(transparent,${captionWash});`
    : `left:120px;width:1680px;top:906px;height:132px;`;
  return `<!doctype html><html lang="${langAttr}"><head><meta charset="utf-8">${googleFontLinks}<link rel="stylesheet" href="${katexCss}"><style>
@font-face{font-family:"Inter";src:url("${inter400}") format("woff2");font-weight:400;font-display:block}
@font-face{font-family:"Inter";src:url("${inter600}") format("woff2");font-weight:600;font-display:block}
${atkinsonFace}
*{box-sizing:border-box}html,body{margin:0;width:${FRAME.width}px;height:${FRAME.height}px;background:${pageBg};overflow:hidden;font-family:${fontStack};color:${p.ink};${devanagariExtra}}
#frame{position:relative;width:${FRAME.width}px;height:${FRAME.height}px;background:${pageBg}}
#top{position:absolute;${isAnimated ? `left:0;right:0;top:0;height:48px;z-index:30;background:rgba(253,251,247,0.82);` : `left:120px;right:120px;top:33px;height:75px;`}display:flex;align-items:center;justify-content:${topJustify}}
${clean ? "#top{display:none}" : ""}
#heading{font-size:${isAnimated ? "36px" : "48px"};font-weight:${headingWeight};letter-spacing:${headingLetterSpacing};text-align:${headingAlign};text-transform:${isAnimated ? "uppercase" : "none"};color:${isAnimated ? "#1a1a1a" : p.ink}}
#count{font-size:28px;color:${p.soft};letter-spacing:.06em;${isAnimated ? "display:none" : ""}}
#panel{position:absolute;left:${fullBleed ? "0" : "120px"};top:${fullBleed ? "0" : "126px"};width:${fullBleed ? FRAME.width + "px" : "1680px"};height:${fullBleed ? FRAME.height + "px" : "756px"};background:${panelBg};border:${panelBorder};border-radius:${panelRadius};overflow:hidden}
svg{position:absolute;inset:0;width:${fullBleed ? FRAME.width + "px" : "1680px"};height:${fullBleed ? FRAME.height + "px" : "756px"};font-family:${fontStack}}
#caption{position:absolute;${captionCss}display:flex;align-items:center;font-size:${isAnimated ? captionSize : captionSize};line-height:1.6;letter-spacing:${captionLetterSpacing};font-weight:${captionWeight};color:${isAnimated ? "#334155" : p.ink};${devanagariExtra}}
#caption span{display:block;max-width:1200px}
${captions === "none" ? "#caption{display:none}" : ""}
#bar{position:absolute;left:0;bottom:0;height:7px;background:${p.blue};width:0;${clean ? "display:none;" : ""}}
.math{color:${p.ink}}
</style></head><body><div id="frame"><div id="top"><div id="heading"></div><div id="count"></div></div><div id="panel"><svg id="stage" viewBox="0 0 100 45" preserveAspectRatio="xMidYMid meet"></svg></div><div id="caption"><span id="cap-text"></span></div><div id="bar"></div></div>
<script>window.__STORY=${embedJson(data)};</script><script>${runtime.replace(/<\/script/gi, "<\\/script")}</script></body></html>`;
}
