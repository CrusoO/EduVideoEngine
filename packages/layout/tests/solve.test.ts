import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { quadraticRoots, type LayoutRule } from "@eve/schema";
import { GAP, LayoutError, PAD, referenceViewports, ROW_COLLAPSE_PX, solve, type LayoutObject, type SceneInput } from "../src";

const expressions = quadraticRoots.expressions;
const ctx = { expressions, locale: "en-IN" };
const text = (id: string, t: string, role: "title" | "label" | "body" = "label"): LayoutObject => ({ id, component: "text", props: { text: t, role } });
const eq = (id: string, ref = "eq1"): LayoutObject => ({ id, component: "equation", props: {}, exprRef: ref });
const graph: LayoutObject = { id: "g", component: "functionGraph", props: { xMin: 0, xMax: 5, yMin: -1, yMax: 7 }, exprRef: "f1" };
const steps: LayoutObject = { id: "s", component: "stepList", props: { steps: ["factored", "total", "fromRule"] } };
const ring: LayoutObject = { id: "ring", component: "highlight", props: { target: "g" } };
const at = (width: number, height = 2000) => ({ width, height });
const run = (objects: LayoutObject[], layout: LayoutRule[], width = 360, locale = "en-IN") => solve({ objects, layout }, at(width), { expressions, locale });

// Heights the size model gives (calibrated against the browser in tests/browser/layout.spec.ts).
const H = { label: 26, eq: 66, graph360: 208, steps: 112 };

describe("solve: the five rules, table-driven", () => {
  it("no rules: one column in declaration order with the normal gap, at the padding", () => {
    const l = run([text("a", "One"), eq("b"), text("c", "Two")], []);
    expect(l.boxes).toEqual({
      a: { x: PAD, y: 20, width: 320, height: H.label },
      b: { x: PAD, y: 20 + H.label + GAP.normal, width: 320, height: H.eq },
      c: { x: PAD, y: 20 + H.label + GAP.normal + H.eq + GAP.normal, width: 320, height: H.label },
    });
    expect(l.contentHeight).toBe(20 + H.label + 16 + H.eq + 16 + H.label + 20);
    expect(l.collapsed).toBe(true);
  });

  it.each([["tight", 8], ["normal", 16], ["loose", 28]] as const)("column gap token %s is %i px", (token, px) => {
    const l = run([text("a", "One"), text("b", "Two")], [{ rule: "column", items: ["a", "b"], gap: token }]);
    expect(l.boxes.b!.y - (l.boxes.a!.y + l.boxes.a!.height)).toBe(px);
  });

  it("a column rule keeps the listed order and groups its items where the first one stood", () => {
    const l = run([text("a", "A"), text("b", "B"), text("c", "C")], [{ rule: "column", items: ["c", "a"] }]);
    // c and a form a block at a's place; b follows
    expect(Object.entries(l.boxes).sort((x, y) => x[1].y - y[1].y).map(([id]) => id)).toEqual(["c", "a", "b"]);
  });

  it("row at 1280: two equal shares that fill the width exactly", () => {
    const l = run([text("a", "A"), text("b", "B")], [{ rule: "row", items: ["a", "b"] }], 1280);
    expect(l.collapsed).toBe(false);
    expect(l.boxes.a).toMatchObject({ x: 20, width: 612, y: 20 });
    expect(l.boxes.b).toMatchObject({ x: 20 + 612 + 16, width: 612, y: 20 });
    expect(l.boxes.b!.x + l.boxes.b!.width).toBe(1280 - PAD);
  });

  it("a row whose shares do not divide evenly hands the spare pixels to the first items, one each, and still fills the width", () => {
    const l = run([text("a", "A"), text("b", "B"), text("c", "C")], [{ rule: "row", items: ["a", "b", "c"] }], 500);
    expect(l.boxes.a!.width).toBe(143);
    expect(l.boxes.b!.width).toBe(143);
    expect(l.boxes.c!.width).toBe(142);
    expect(l.boxes.c!.x + l.boxes.c!.width).toBe(500 - PAD);
  });

  it("row height is the tallest child, and the next block starts below it", () => {
    const l = run([text("a", "Short"), eq("b"), text("c", "After")], [{ rule: "row", items: ["a", "b"] }], 1280);
    expect(l.boxes.c!.y).toBe(20 + H.eq + GAP.normal);
  });

  it.each([[479, true], [480, false], [481, false]])("a row at %i px: collapsed to a column is %s", (w, collapsed) => {
    const l = run([text("a", "A"), text("b", "B")], [{ rule: "row", items: ["a", "b"] }], w);
    expect(l.collapsed).toBe(w < ROW_COLLAPSE_PX);
    expect(l.collapsed).toBe(collapsed);
    if (collapsed) expect(l.boxes.b!.y).toBeGreaterThan(l.boxes.a!.y);
    else expect(l.boxes.b!.y).toBe(l.boxes.a!.y);
  });

  it("two-column is a row of two", () => {
    const l = run([graph, eq("e")], [{ rule: "row", items: ["g", "e"] }], 1280);
    expect(l.boxes.g!.y).toBe(l.boxes.e!.y);
    expect(l.boxes.g!.x).toBeLessThan(l.boxes.e!.x);
  });

  it("beside puts the item to the right or left of its anchor, and stacks under 480 px", () => {
    const right = run([text("a", "A"), text("b", "B")], [{ rule: "beside", item: "b", of: "a", side: "right" }], 1280);
    expect(right.boxes.a!.x).toBeLessThan(right.boxes.b!.x);
    const left = run([text("a", "A"), text("b", "B")], [{ rule: "beside", item: "b", of: "a", side: "left" }], 1280);
    expect(left.boxes.b!.x).toBeLessThan(left.boxes.a!.x);
    const phone = run([text("a", "A"), text("b", "B")], [{ rule: "beside", item: "b", of: "a", side: "left" }], 360);
    expect(phone.boxes.b!.y).toBeGreaterThan(phone.boxes.a!.y);
    expect(phone.boxes.a!.x).toBe(phone.boxes.b!.x);
  });

  it("below moves an item to directly after its anchor", () => {
    const l = run([text("a", "A"), text("b", "B"), text("c", "C")], [{ rule: "below", item: "a", of: "c" }]);
    expect(Object.entries(l.boxes).sort((x, y) => x[1].y - y[1].y).map(([id]) => id)).toEqual(["b", "c", "a"]);
  });

  it("center puts an object narrower than its slot in the middle (floor), and leaves a full-width one alone", () => {
    const l = run([graph, text("t", "Hello")], [{ rule: "center", item: "g" }, { rule: "center", item: "t" }], 700);
    expect(l.boxes.g).toMatchObject({ width: 480, x: 20 + Math.floor((660 - 480) / 2) });
    expect(l.boxes.t).toMatchObject({ x: 20, width: 660 });
    expect(l.centered.sort()).toEqual(["g", "t"]);
  });

  it("the graph is as wide as the stage allows up to 480 px, and as tall as its drawing (400 x 260)", () => {
    expect(run([graph], [], 360).boxes.g).toMatchObject({ width: 320, height: 208 });
    expect(run([graph], [], 1280).boxes.g).toMatchObject({ width: 480, height: 312 });
  });

  it("overlays are not laid out, and naming one in a rule is harmless", () => {
    const l = run([graph, ring], [{ rule: "column", items: ["g", "ring"] }]);
    expect(l.overlays).toEqual(["ring"]);
    expect(Object.keys(l.boxes)).toEqual(["g"]);
  });

  it("refuses a rule that names an unknown object, an object two rules place, or an object listed twice", () => {
    expect(() => run([text("a", "A")], [{ rule: "column", items: ["a", "ghost"] }])).toThrow(/unknown object ghost/);
    expect(() => run([text("a", "A"), text("b", "B")], [{ rule: "column", items: ["a", "b"] }, { rule: "row", items: ["a", "b"] }])).toThrow(/already placed/);
    expect(() => run([text("a", "A")], [{ rule: "column", items: ["a", "a"] }])).toThrow(LayoutError);
  });

  it("every number out is a whole pixel", () => {
    const l = run([text("a", "A long label for the stage"), eq("b", "rule"), graph, steps], [{ rule: "row", items: ["a", "b"] }], 777);
    const all = [...Object.values(l.boxes).flatMap((b) => [b.x, b.y, b.width, b.height]), l.contentHeight];
    expect(all.every(Number.isInteger)).toBe(true);
  });
});

describe("solve: the size model on hard text", () => {
  it("a long label wraps onto more lines as the stage narrows, and a word that fits nowhere still breaks", () => {
    const label = text("a", "A rather long label that has to wrap onto a second line on a phone, because it is long");
    expect(run([label], [], 1280).boxes.a!.height).toBeLessThan(run([label], [], 360).boxes.a!.height);
    const word = text("w", "x".repeat(200));
    const l = run([word], [], 360);
    expect(l.boxes.w!.height).toBeGreaterThan(H.label * 4);
    expect(l.boxes.w!.width).toBe(320);
  });

  it("Devanagari wraps with Hindi line heights, in clusters rather than code points", () => {
    const hi = text("h", "विद्यार्थियों के लिए द्विघात समीकरण", "title");
    const l = run([hi], [], 360, "hi-IN");
    expect(l.boxes.h!.height).toBe(77); // two lines of 25.6 px x 1.5 (Hindi line height), rounded up
    expect(run([{ ...hi, props: { text: hi.props.text, role: "title" } }], [], 360, "en-IN").boxes.h!.height).toBe(64); // the same words with the Latin line height: 2 x 32
    const en = run([text("h", "Quadratic equations for students", "title")], [], 360);
    expect(en.boxes.h!.height).toBeGreaterThan(0);
  });
});

// ---- properties -------------------------------------------------------------------------------------------------------

const hindi = "विद्यार्थियों के लिए द्विघात समीकरण और उनके मूल";
const latin = "Sum of the roots of a quadratic equation, with a worked check";
const label = fc.oneof(fc.constant("Hi"), fc.constant(latin), fc.constant(hindi), fc.constant("x".repeat(90)), fc.constant("Class 12 गणित: Integrals"));
const objectArb = (id: string): fc.Arbitrary<LayoutObject> =>
  fc.oneof(
    label.map((t) => text(id, t, "body")),
    label.map((t) => text(id, t, "title")),
    fc.constantFrom("eq1", "rule", "fromRule", "general").map((ref) => eq(id, ref)),
    fc.constant({ ...steps, id }),
    fc.constant({ ...graph, id }),
  );
const sceneArb: fc.Arbitrary<SceneInput> = fc.integer({ min: 1, max: 5 }).chain((n) =>
  fc.tuple(...Array.from({ length: n }, (_, i) => objectArb(`o${i}`))).chain((objects) => {
    const ids = objects.map((o) => o.id);
    return fc.record({ kind: fc.constantFrom("none", "column", "row", "beside", "below"), gap: fc.constantFrom<"tight" | "normal" | "loose">("tight", "normal", "loose") }).map(({ kind, gap }) => {
      const layout: LayoutRule[] =
        kind === "column" && ids.length > 1 ? [{ rule: "column", items: ids.slice(0, 3), gap }] : kind === "row" && ids.length > 1 ? [{ rule: "row", items: ids.slice(0, 3), gap }] : kind === "beside" && ids.length > 1 ? [{ rule: "beside", item: ids[1]!, of: ids[0]!, side: "right" }] : kind === "below" && ids.length > 2 ? [{ rule: "below", item: ids[0]!, of: ids[2]! }] : [];
      return { objects, layout };
    });
  }),
);
const widthArb = fc.oneof(fc.constantFrom(360, 479, 480, 481, 768, 1280), fc.integer({ min: 360, max: 1600 }));
const cfg = { numRuns: 300 };
const solveAt = (s: SceneInput, w: number) => solve(s, at(w), ctx);

describe("solve: properties", () => {
  it("is deterministic and whole-pixel", () => {
    fc.assert(
      fc.property(sceneArb, widthArb, (s, w) => {
        const a = solveAt(s, w);
        expect(JSON.stringify(solveAt(s, w))).toBe(JSON.stringify(a));
        expect([...Object.values(a.boxes).flatMap((b) => [b.x, b.y, b.width, b.height]), a.contentHeight].every(Number.isInteger)).toBe(true);
      }),
      cfg,
    );
  });

  it("no two objects overlap, whatever the rules and the width", () => {
    fc.assert(
      fc.property(sceneArb, widthArb, (s, w) => {
        const boxes = Object.entries(solveAt(s, w).boxes);
        for (let i = 0; i < boxes.length; i++) {
          for (let j = i + 1; j < boxes.length; j++) {
            const a = boxes[i]![1];
            const b = boxes[j]![1];
            const hit = a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
            expect(hit, `${boxes[i]![0]} vs ${boxes[j]![0]}`).toBe(false);
          }
        }
      }),
      cfg,
    );
  });

  it("every box is inside the stage, and the stage is as tall as its content plus padding", () => {
    fc.assert(
      fc.property(sceneArb, widthArb, (s, w) => {
        const l = solveAt(s, w);
        for (const b of Object.values(l.boxes)) {
          expect(b.x).toBeGreaterThanOrEqual(PAD);
          expect(b.y).toBeGreaterThanOrEqual(PAD);
          expect(b.x + b.width).toBeLessThanOrEqual(w - PAD);
          expect(b.y + b.height).toBeLessThanOrEqual(l.contentHeight - PAD);
        }
      }),
      cfg,
    );
  });

  it("a wider stage never makes the layout taller (within one side of the 480 px collapse; objects whose height follows their width, the graph, are the one exception)", () => {
    fc.assert(
      fc.property(
        sceneArb.filter((s) => s.objects.every((o) => o.component !== "functionGraph")),
        fc.integer({ min: 360, max: 1600 }),
        fc.integer({ min: 0, max: 400 }),
        (s, w, extra) => {
          const w2 = w + extra;
          fc.pre((w < ROW_COLLAPSE_PX) === (w2 < ROW_COLLAPSE_PX));
          expect(solveAt(s, w2).contentHeight).toBeLessThanOrEqual(solveAt(s, w).contentHeight);
        },
      ),
      { numRuns: 500 },
    );
  });

  it("the graph is the only thing that grows with width, and exactly in proportion until 480 px", () => {
    for (const w of [360, 400, 480, 520, 700]) {
      const b = run([graph], [], w).boxes.g!;
      expect(b.height).toBe(Math.ceil((Math.min(w - 40, 480) * 260) / 400));
    }
  });

  it("with rows, some layouts are taller at 480 px than at 479 px: the collapse boundary is the one place monotonicity breaks (documented, ADR 0017)", () => {
    const words = "alpha beta gamma delta epsilon zeta eta theta iota kappa lambda mu nu xi omicron pi rho sigma tau".split(" ");
    let found: { n: number; at479: number; at480: number } | null = null;
    for (let n = 3; n <= words.length && !found; n++) {
      const t = words.slice(0, n).join(" ");
      const scene: SceneInput = { objects: [text("a", t, "body"), text("b", t, "body")], layout: [{ rule: "row", items: ["a", "b"] }] };
      const a = solveAt(scene, 479).contentHeight;
      const b = solveAt(scene, 480).contentHeight;
      if (b > a) found = { n, at479: a, at480: b };
    }
    expect(found, "at least one pair of captions is taller as a row at 480 px than stacked at 479 px").not.toBeNull();
  });
});

describe("solve: boundary scenes", () => {
  it("one object", () => {
    const l = run([text("a", "Only")], []);
    expect(Object.keys(l.boxes)).toEqual(["a"]);
    expect(l.contentHeight).toBe(PAD + H.label + PAD);
  });

  it.each([[360], [479], [480], [481], [1280]])("five objects at %i px: solved without overlap", (w) => {
    const l = run([text("t", "Title of the scene", "title"), eq("e"), graph, steps, text("b", latin, "body")], [], w);
    expect(Object.keys(l.boxes)).toHaveLength(5);
    expect(l.contentHeight).toBeGreaterThan(0);
  });

  it("a very long unbroken label stays inside its box", () => {
    const l = run([text("a", "y".repeat(500))], [], 360);
    expect(l.boxes.a!.width).toBe(320);
  });
});

describe("the reference viewports", () => {
  it("are a 360 x 640 phone and a 1280 x 720 window, phone height less the sheet chrome (a parameter, 184 px by default), desktop 16:9", () => {
    expect(referenceViewports().map((v) => v.viewport)).toEqual([{ width: 360, height: 456 }, { width: 1280, height: 720 }]);
  });
});
