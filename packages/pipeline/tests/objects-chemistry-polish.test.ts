import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { placeStory, sanitizeStory, storyPageHtml } from "../index";
import { defaultRegistry, parseObjectRequest } from "../objects";
import { readoutText } from "../objects/physics/kit";

/** Polish found by looking at the real frames of the wave 3 chemistry samples. */
const reg = defaultRegistry();
const draw = (figure: string, params: Record<string, unknown>) => {
  const r = parseObjectRequest({ kind: "chemistry", id: "x", name: "A figure", figure, params, area: "A1:F6" });
  if (!r.ok) throw new Error(r.refusal.reason);
  const d = reg.find(r.spec)!;
  const res = d.draw(r.spec as never, { idPrefix: "qa" });
  return { res, back: d.readBack!(r.spec as never, res) };
};
const texts = (shapes: Array<Record<string, unknown>>, re: RegExp) => shapes.filter((s) => s.kind === "text" && re.test(String(s.id)));

describe("orbital boxes draw every occupied subshell up to the configuration, in filling order", () => {
  it("nitrogen shows 1s, 2s and 2p, with the 2p row picked out", () => {
    const { res, back } = draw("c_orbital_boxes", { z: 7 });
    expect(back.mismatches).toEqual([]);
    const rows = texts(res.shapes, /_sl\d+$/);
    expect(rows.map((s) => s.text)).toEqual(["1s", "2s", "2p"]);
    expect(rows.map((s) => s.bold === true)).toEqual([false, false, true]);
  });
  it("iron fills 4s before 3d and reads back clean", () => {
    const { res, back } = draw("c_orbital_boxes", { z: 26 });
    expect(back.mismatches).toEqual([]);
    expect(texts(res.shapes, /_sl\d+$/).map((s) => s.text)).toEqual(["1s", "2s", "2p", "3s", "3p", "4s", "3d"]);
  });
  it("a chosen subshell stops the rows there, and krypton fits the shape budget", () => {
    expect(texts(draw("c_orbital_boxes", { z: 8, subshell: "2s" }).res.shapes, /_sl\d+$/).map((s) => s.text)).toEqual(["1s", "2s"]);
    const kr = draw("c_orbital_boxes", { z: 36 });
    expect(kr.back.mismatches).toEqual([]);
    expect(kr.res.shapes.length).toBeLessThanOrEqual(24);
  });
  it("read-back notices a missing row of boxes", () => {
    const { res } = draw("c_orbital_boxes", { z: 7 });
    const r = parseObjectRequest({ kind: "chemistry", id: "x", name: "A figure", figure: "c_orbital_boxes", params: { z: 7 }, area: "A1:F6" });
    if (!r.ok) throw new Error("bad");
    const cut = { ...res, shapes: res.shapes.map((s) => (String(s.id).endsWith("_bx") ? { ...s, d: String(s.d).slice(0, String(s.d).indexOf("M", 1)) } : s)) };
    expect(reg.find(r.spec)!.readBack!(r.spec as never, cut).ok).toBe(false);
  });
});

describe("the period-trend figure", () => {
  it("says 'Steps down', a count of falling steps, never 'Dips'", () => {
    const { res, back } = draw("c_trend", { property: "ionisation", series: "period3" });
    expect(back.mismatches).toEqual([]);
    const lines = texts(res.shapes, /_r\d+$/).map((s) => String(s.text));
    expect(lines).toContain("Steps down = 2");
    expect(lines.some((l) => l.startsWith("Dips"))).toBe(false);
    expect(readoutText({ key: "Steps down", value: 2, unit: "" })).toBe("Steps down = 2");
  });
  it("puts every element label off the curve: above a peak, below a dip, to the free side of a slope", () => {
    for (const [property, series] of [["ionisation", "period2"], ["ionisation", "period3"], ["radius", "period3"], ["radius", "group1"], ["electronegativity", "period2"]] as const) {
      const { res, back } = draw("c_trend", { property, series });
      expect(back.mismatches, `${property} ${series}`).toEqual([]);
      const curve = res.shapes.find((s) => String(s.id).endsWith("_c0"))!;
      const pts = (String(curve.d).match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number);
      const xy: Array<[number, number]> = [];
      for (let i = 0; i + 1 < pts.length; i += 2) xy.push([pts[i]!, pts[i + 1]!]);
      const labels = texts(res.shapes, /_t\d+$/);
      expect(labels.length).toBe(xy.length);
      // the label's box (about 2.4 high and as wide as its text) never contains a vertex of the curve or crosses one of its segments
      for (const t of labels) {
        const w = String(t.text).length * 2.4 * 0.56;
        const [x0, x1, y0, y1] = [Number(t.x) - w / 2, Number(t.x) + w / 2, Number(t.y) - 1.1, Number(t.y) + 1.1];
        for (let i = 0; i + 1 < xy.length; i++) {
          for (let k = 0; k <= 20; k++) {
            const x = xy[i]![0] + ((xy[i + 1]![0] - xy[i]![0]) * k) / 20;
            const y = xy[i]![1] + ((xy[i + 1]![1] - xy[i]![1]) * k) / 20;
            expect(x >= x0 && x <= x1 && y >= y0 && y <= y1, `${property} ${series}: ${String(t.text)} sits on the curve`).toBe(false);
          }
        }
      }
    }
  });
});

describe("captions of a scene that carries an object stay off the bottom edge of the frame", () => {
  const runtime = readFileSync(resolve(__dirname, "../../../scripts/story-runtime.js"), "utf8");
  const story = (withObject: boolean) => ({
    title: "Test story",
    scenes: [
      { heading: "One", sentences: ["First sentence of the first scene, long enough to run onto a second line of the caption when it is drawn."], visuals: [{ kind: "text", id: "plain", x: 50, y: 20, text: "Hello", in: { s: 0, off: 0 } }] },
      { heading: "Two", sentences: ["Second."], visuals: withObject ? [{ kind: "circle", id: "obj_fig_a", cx: 50, cy: 20, r: 4, in: { s: 0, off: 0 } }] : [{ kind: "circle", id: "fig_a", cx: 50, cy: 20, r: 4, in: { s: 0, off: 0 } }] },
    ],
  });
  const page = (raw: unknown, chrome: "full" | "none") => {
    const s = sanitizeStory(raw).story!;
    return storyPageHtml(placeStory(s, s.scenes.map((sc) => sc.sentences.map(() => 2000))), "whiteboard", {}, runtime, "x", { chrome });
  };
  it("adds a lift for the scenes with an object, and only those", () => {
    const html = page(story(true), "none");
    expect(html).toContain("#caption.objs{bottom:30px;line-height:1.25}");
    expect(html).toContain("var objs=[false,true]");
  });
  it("leaves the page byte for byte as it was when no scene carries an object", () => {
    const html = page(story(false), "none");
    expect(html).not.toContain("caption.objs");
    expect(html).not.toContain("var objs=");
    expect(html.endsWith("</script></body></html>")).toBe(true);
  });
  it("does not touch the boxed layout, whose caption already clears the edge", () => {
    expect(page(story(true), "full")).not.toContain("caption.objs");
  });
});
