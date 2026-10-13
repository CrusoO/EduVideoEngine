import "@fontsource/noto-sans/latin-400.css";
import "@fontsource/noto-sans/latin-700.css";
import "@fontsource/noto-sans-devanagari/devanagari-400.css";
import "@fontsource/noto-sans-devanagari/devanagari-700.css";
import "@fontsource/noto-sans-devanagari/latin-400.css";
import "@fontsource/noto-sans-devanagari/latin-700.css";
import "katex/dist/katex.min.css";
import "../src/styles.css";
import { componentFor, type ObjectEvent, type Rect, type RenderContext } from "../src";
import { CASES, type Case } from "./cases";

/**
 * A deliberately naive stage: objects stacked in a column, highlights drawn on top. The real layout solver and the
 * player come in later steps; this exists to draw each component at an exact lesson time for the golden frames and
 * the seek tests. window.__render(t) redraws the SAME elements at any time, in any order.
 */
const params = new URLSearchParams(location.search);
const name = params.get("case") ?? "scene1-predict";
const c: Case = CASES[name]!;
const stage = document.getElementById("stage")!;
stage.style.width = `${params.get("w") ?? "360"}px`;
document.documentElement.lang = c.locale.startsWith("hi") ? "hi" : "en";

const els = new Map<string, HTMLElement>();
for (const o of c.objects) {
  const el = document.createElement("div");
  el.dataset.objectId = o.id;
  els.set(o.id, el);
  stage.append(el);
}

const rectOf = (id: string): Rect | null => {
  const el = els.get(id);
  if (!el) return null;
  const s = stage.getBoundingClientRect();
  const r = el.getBoundingClientRect();
  return { x: r.left - s.left, y: r.top - s.top, width: r.width, height: r.height };
};

function draw(t: number) {
  const ctx = (id: string, exprRef?: string): RenderContext => ({
    objectId: id,
    locale: c.locale,
    expressions: c.expressions,
    exprRef,
    events: (c.events[id] ?? []) as ObjectEvent[],
    rectOf,
  });
  // Two passes: flow objects first, so highlights can measure the objects they ring.
  for (const pass of ["flow", "overlay"] as const) {
    for (const o of c.objects) {
      if ((o.component === "highlight") !== (pass === "overlay")) continue;
      componentFor(o.component).render(els.get(o.id)!, o.props as never, t, ctx(o.id, o.exprRef));
    }
  }
}

const w = window as unknown as { __render: (t: number) => void; __ready: boolean };
w.__render = draw;
draw(Number(params.get("t") ?? c.t));
// Fonts load on first use: ask for every face the stage needs, then wait, so a capture never sees a fallback font.
Promise.all([
  document.fonts.load('400 18px "Noto Sans"'),
  document.fonts.load('700 18px "Noto Sans"'),
  document.fonts.load('400 18px "Noto Sans Devanagari"', "द्विघात"),
  document.fonts.load('700 18px "Noto Sans Devanagari"', "द्विघात"),
  document.fonts.load('400 18px "Noto Sans Devanagari"', "Class 12"),
  document.fonts.load('400 18px KaTeX_Main'),
  document.fonts.load('italic 400 18px KaTeX_Math'),
  document.fonts.load('400 18px KaTeX_Size2'),
]).then(() => document.fonts.ready).then(() => {
  draw(Number(params.get("t") ?? c.t)); // redraw: highlight rectangles depend on final text metrics
  w.__ready = true;
});
