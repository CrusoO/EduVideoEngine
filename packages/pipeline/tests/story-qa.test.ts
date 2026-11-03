import { describe, expect, it } from "vitest";
import { sanitizeStory, storyQA, type Story } from "../index";

function make(overrides: Record<string, unknown>): Story {
  const base = {
    title: "Why springs bounce",
    scenes: [
      { role: "hook", heading: "The question", sentences: ["What makes the block come back?", "Why does it not just stop?"], visuals: [] },
      { role: "build", heading: "Restoring force", sentences: ["The spring pushes back harder the further it is stretched.", "That push is always directed toward the rest point."], visuals: [] },
      { role: "reveal", heading: "Simple harmonic motion", sentences: ["Because the force is proportional to the displacement.", "So the block keeps moving back and forth."], visuals: [] },
      { role: "wrap", heading: "What we learned", sentences: ["Any restoring force like this produces a repeating back and forth motion.", "That is all there is to it."], visuals: [] },
    ],
  };
  return sanitizeStory({ ...base, ...overrides }).story!;
}

describe("storyQA arc checks", () => {
  it("passes a well-formed arc with no notes", () => {
    const story = make({});
    expect(storyQA(story)).toEqual([]);
  });
  it("arc_hook_missing when no scene has role: hook", () => {
    const story = make({ scenes: [
      { role: "build", heading: "H1", sentences: ["One.", "Two."], visuals: [] },
      { role: "reveal", heading: "H2", sentences: ["Three.", "Four."], visuals: [] },
      { role: "wrap", heading: "H3", sentences: ["Five.", "Six."], visuals: [] },
    ]});
    const notes = storyQA(story);
    expect(notes.some((n) => n.kind === "arc_hook_missing")).toBe(true);
  });
  it("arc_reveal_missing when no scene has role: reveal", () => {
    const story = make({ scenes: [
      { role: "hook", heading: "H1", sentences: ["Why?", "Two."], visuals: [] },
      { role: "build", heading: "H2", sentences: ["Three.", "Four."], visuals: [] },
      { role: "wrap", heading: "H3", sentences: ["Five.", "Six."], visuals: [] },
    ]});
    const notes = storyQA(story);
    expect(notes.some((n) => n.kind === "arc_reveal_missing")).toBe(true);
  });
  it("hook_ends_statement when hook last sentence does not end with ?", () => {
    const story = make({ scenes: [
      { role: "hook", heading: "H1", sentences: ["Gravity is always down.", "It acts on everything."], visuals: [] },
      { role: "reveal", heading: "H2", sentences: ["Because acceleration is constant.", "Done."], visuals: [] },
      { role: "wrap", heading: "H3", sentences: ["We learned about gravity.", "Done."], visuals: [] },
    ]});
    expect(storyQA(story).some((n) => n.kind === "hook_ends_statement")).toBe(true);
  });
  it("no hook_ends_statement when hook last sentence ends with ?", () => {
    const story = make({});
    const hookNotes = storyQA(story).filter((n) => n.kind === "hook_ends_statement");
    expect(hookNotes).toHaveLength(0);
  });
});

describe("storyQA covariation check", () => {
  it("covariation_static when sentence uses change word but no t-expression in visuals", () => {
    const story = make({ scenes: [
      { role: "hook", heading: "H", sentences: ["Why?", "It falls."], visuals: [] },
      { role: "build", heading: "B", sentences: ["The speed increases.", "And grows further."], visuals: [{ kind: "circle", cx: 50, cy: 22, r: 4, in: { s: 0 } }] },
      { role: "reveal", heading: "R", sentences: ["Because force is constant.", "Done."], visuals: [] },
      { role: "wrap", heading: "W", sentences: ["We learned.", "Done."], visuals: [] },
    ]});
    expect(storyQA(story).some((n) => n.kind === "covariation_static")).toBe(true);
  });
  it("no covariation_static when t-expression is present", () => {
    const story = make({ scenes: [
      { role: "hook", heading: "H", sentences: ["Why?", "What is happening here?"], visuals: [] },
      { role: "build", heading: "B", sentences: ["The speed increases.", "It keeps going."],
        visuals: [{ kind: "circle", cx: "10+5*t", cy: 22, r: 4, in: { s: 0 } }] },
      { role: "reveal", heading: "R", sentences: ["Because force is constant.", "Done."], visuals: [] },
      { role: "wrap", heading: "W", sentences: ["We learned.", "Done."], visuals: [] },
    ]});
    const notes = storyQA(story);
    expect(notes.some((n) => n.kind === "covariation_static")).toBe(false);
  });
});

describe("storyQA anchor check", () => {
  it("anchor_missing when label word not in any sentence", () => {
    const story = make({ scenes: [
      { role: "hook", heading: "H", sentences: ["Why?", "Gravity pulls."], visuals: [{ kind: "circle", id: "moon", cx: 80, cy: 10, r: 3, label: "moon", in: { s: 0 } }] },
      { role: "build", heading: "B", sentences: ["The force accelerates it.", "Speed builds."], visuals: [] },
      { role: "reveal", heading: "R", sentences: ["Because it keeps falling.", "Done."], visuals: [] },
      { role: "wrap", heading: "W", sentences: ["We learned.", "Done."], visuals: [] },
    ]});
    // "moon" is not in "Why? Gravity pulls." so anchor_missing fires
    expect(storyQA(story).some((n) => n.kind === "anchor_missing")).toBe(true);
  });
  it("no anchor_missing when label word appears in a sentence", () => {
    const story = make({ scenes: [
      { role: "hook", heading: "H", sentences: ["Why does the moon orbit?", "Gravity pulls."], visuals: [{ kind: "circle", id: "moon", cx: 80, cy: 10, r: 3, label: "moon", in: { s: 0 } }] },
      { role: "build", heading: "B", sentences: ["The force accelerates it.", "Speed builds."], visuals: [] },
      { role: "reveal", heading: "R", sentences: ["Because it keeps falling.", "Done."], visuals: [] },
      { role: "wrap", heading: "W", sentences: ["We learned.", "Done."], visuals: [] },
    ]});
    expect(storyQA(story).some((n) => n.kind === "anchor_missing")).toBe(false);
  });
});

describe("storyQA scene_overloaded check", () => {
  it("scene_overloaded when scene has more than 6 shapes", () => {
    const manyShapes = Array.from({ length: 8 }, (_, i) => ({ kind: "circle", cx: i * 10 + 10, cy: 22, r: 1, in: { s: 0 } }));
    const story = make({ scenes: [
      { role: "hook", heading: "H", sentences: ["Why?", "Gravity."], visuals: manyShapes },
      { role: "reveal", heading: "R", sentences: ["Because.", "Done."], visuals: [] },
      { role: "wrap", heading: "W", sentences: ["Done.", "Done."], visuals: [] },
    ]});
    expect(storyQA(story).some((n) => n.kind === "scene_overloaded")).toBe(true);
  });
  it("no scene_overloaded when scene has 6 or fewer shapes", () => {
    const shapes = Array.from({ length: 6 }, (_, i) => ({ kind: "circle", cx: i * 15 + 10, cy: 22, r: 1, in: { s: 0 } }));
    const story = make({ scenes: [
      { role: "hook", heading: "H", sentences: ["Why?", "Gravity."], visuals: shapes },
      { role: "reveal", heading: "R", sentences: ["Because.", "Done."], visuals: [] },
      { role: "wrap", heading: "W", sentences: ["Done.", "Done."], visuals: [] },
    ]});
    expect(storyQA(story).some((n) => n.kind === "scene_overloaded")).toBe(false);
  });
});

describe("storyQA no_out_set check", () => {
  it("no_out_set when scene has many shapes but none have out", () => {
    const shapes = Array.from({ length: 6 }, (_, i) => ({ kind: "circle", cx: i * 10 + 10, cy: 22, r: 2, in: { s: 0 } }));
    const story = make({ scenes: [
      { role: "hook", heading: "H", sentences: ["Why?", "Gravity."], visuals: shapes },
      { role: "reveal", heading: "R", sentences: ["Because.", "Done."], visuals: [] },
      { role: "wrap", heading: "W", sentences: ["Done.", "Done."], visuals: [] },
    ]});
    expect(storyQA(story).some((n) => n.kind === "no_out_set")).toBe(true);
  });
  it("no no_out_set when at least one shape has out", () => {
    const shapes = [
      { kind: "circle", cx: 20, cy: 22, r: 2, in: { s: 0 }, out: { s: 1 } },
      ...Array.from({ length: 5 }, (_, i) => ({ kind: "circle", cx: i * 10 + 30, cy: 22, r: 2, in: { s: 0 } })),
    ];
    const story = make({ scenes: [
      { role: "hook", heading: "H", sentences: ["Why?", "Gravity."], visuals: shapes },
      { role: "reveal", heading: "R", sentences: ["Because.", "Done."], visuals: [] },
      { role: "wrap", heading: "W", sentences: ["Done.", "Done."], visuals: [] },
    ]});
    expect(storyQA(story).some((n) => n.kind === "no_out_set")).toBe(false);
  });
});

describe("storyQA shape_in_margin check", () => {
  it("shape_in_margin when shape centre is in the margin zone", () => {
    const story = make({ scenes: [
      { role: "hook", heading: "H", sentences: ["Why?", "Gravity."], visuals: [
        { kind: "circle", cx: 2, cy: 22, r: 3, in: { s: 0 } },
      ]},
      { role: "reveal", heading: "R", sentences: ["Because.", "Done."], visuals: [] },
      { role: "wrap", heading: "W", sentences: ["Done.", "Done."], visuals: [] },
    ]});
    expect(storyQA(story).some((n) => n.kind === "shape_in_margin")).toBe(true);
  });
  it("no shape_in_margin when shape is inside usable area", () => {
    const story = make({ scenes: [
      { role: "hook", heading: "H", sentences: ["Why?", "Gravity."], visuals: [
        { kind: "circle", cx: 50, cy: 22, r: 3, in: { s: 0 } },
      ]},
      { role: "reveal", heading: "R", sentences: ["Because.", "Done."], visuals: [] },
      { role: "wrap", heading: "W", sentences: ["Done.", "Done."], visuals: [] },
    ]});
    expect(storyQA(story).some((n) => n.kind === "shape_in_margin")).toBe(false);
  });
});

describe("storyQA shapes_too_close check", () => {
  it("shapes_too_close when two shape centres are within 6 units", () => {
    const story = make({ scenes: [
      { role: "hook", heading: "H", sentences: ["Why?", "Gravity."], visuals: [
        { kind: "circle", cx: 50, cy: 22, r: 3, in: { s: 0 } },
        { kind: "circle", cx: 53, cy: 22, r: 3, in: { s: 0 } },
      ]},
      { role: "reveal", heading: "R", sentences: ["Because.", "Done."], visuals: [] },
      { role: "wrap", heading: "W", sentences: ["Done.", "Done."], visuals: [] },
    ]});
    expect(storyQA(story).some((n) => n.kind === "shapes_too_close")).toBe(true);
  });
  it("no shapes_too_close when shapes are well separated", () => {
    const story = make({ scenes: [
      { role: "hook", heading: "H", sentences: ["Why?", "Gravity."], visuals: [
        { kind: "circle", cx: 30, cy: 22, r: 3, in: { s: 0 } },
        { kind: "circle", cx: 70, cy: 22, r: 3, in: { s: 0 } },
      ]},
      { role: "reveal", heading: "R", sentences: ["Because.", "Done."], visuals: [] },
      { role: "wrap", heading: "W", sentences: ["Done.", "Done."], visuals: [] },
    ]});
    expect(storyQA(story).some((n) => n.kind === "shapes_too_close")).toBe(false);
  });
});

describe("storyQA labels_same_side check", () => {
  it("labels_same_side when two nearby labeled shapes share labelPos", () => {
    const story = make({ scenes: [
      { role: "hook", heading: "H", sentences: ["Why does the ball and block bounce?", "Gravity pulls."], visuals: [
        { kind: "circle", cx: 45, cy: 22, r: 3, label: "ball", labelPos: "above", in: { s: 0 } },
        { kind: "rect", x: 50, y: 20, w: 6, h: 6, label: "block", labelPos: "above", in: { s: 0 } },
      ]},
      { role: "reveal", heading: "R", sentences: ["Because.", "Done."], visuals: [] },
      { role: "wrap", heading: "W", sentences: ["Done.", "Done."], visuals: [] },
    ]});
    expect(storyQA(story).some((n) => n.kind === "labels_same_side")).toBe(true);
  });
  it("no labels_same_side when labelPos differs", () => {
    const story = make({ scenes: [
      { role: "hook", heading: "H", sentences: ["Why does the ball and block bounce?", "Gravity pulls."], visuals: [
        { kind: "circle", cx: 45, cy: 22, r: 3, label: "ball", labelPos: "above", in: { s: 0 } },
        { kind: "rect", x: 50, y: 20, w: 6, h: 6, label: "block", labelPos: "below", in: { s: 0 } },
      ]},
      { role: "reveal", heading: "R", sentences: ["Because.", "Done."], visuals: [] },
      { role: "wrap", heading: "W", sentences: ["Done.", "Done."], visuals: [] },
    ]});
    expect(storyQA(story).some((n) => n.kind === "labels_same_side")).toBe(false);
  });
});

describe("storyQA linear_ease_on_move check", () => {
  it("linear_ease_on_move when a move uses ease linear", () => {
    const story = make({ scenes: [
      { role: "hook", heading: "H", sentences: ["Why?", "Gravity."], visuals: [
        { kind: "circle", cx: 30, cy: 22, r: 3, in: { s: 0 }, moves: [{ at: { s: 1 }, dur: 800, dx: 20, ease: "linear" }] },
      ]},
      { role: "reveal", heading: "R", sentences: ["Because.", "Done."], visuals: [] },
      { role: "wrap", heading: "W", sentences: ["Done.", "Done."], visuals: [] },
    ]});
    expect(storyQA(story).some((n) => n.kind === "linear_ease_on_move")).toBe(true);
  });
  it("no linear_ease_on_move when moves use non-linear easing", () => {
    const story = make({ scenes: [
      { role: "hook", heading: "H", sentences: ["Why?", "Gravity."], visuals: [
        { kind: "circle", cx: 30, cy: 22, r: 3, in: { s: 0 }, moves: [{ at: { s: 1 }, dur: 800, dx: 20, ease: "smooth" }] },
      ]},
      { role: "reveal", heading: "R", sentences: ["Because.", "Done."], visuals: [] },
      { role: "wrap", heading: "W", sentences: ["Done.", "Done."], visuals: [] },
    ]});
    expect(storyQA(story).some((n) => n.kind === "linear_ease_on_move")).toBe(false);
  });
});

describe("storyQA no_color_map check", () => {
  it("no_color_map when shape color contradicts the color_map", () => {
    const story = make({
      color_map: { velocity: "green", force: "red" },
      scenes: [
        { role: "hook", heading: "H", sentences: ["Why does velocity change?", "Force acts."], visuals: [
          { kind: "arrow", x1: 30, y1: 22, x2: 60, y2: 22, color: "blue", label: "velocity", in: { s: 0 } },
        ]},
        { role: "reveal", heading: "R", sentences: ["Because force is constant.", "Done."], visuals: [] },
        { role: "wrap", heading: "W", sentences: ["Done.", "Done."], visuals: [] },
      ],
    });
    expect(storyQA(story).some((n) => n.kind === "no_color_map")).toBe(true);
  });
  it("no no_color_map when shapes follow the color_map", () => {
    const story = make({
      color_map: { velocity: "green", force: "red" },
      scenes: [
        { role: "hook", heading: "H", sentences: ["Why does velocity change?", "Force acts."], visuals: [
          { kind: "arrow", x1: 30, y1: 22, x2: 60, y2: 22, color: "green", label: "velocity", in: { s: 0 } },
        ]},
        { role: "reveal", heading: "R", sentences: ["Because force is constant.", "Done."], visuals: [] },
        { role: "wrap", heading: "W", sentences: ["Done.", "Done."], visuals: [] },
      ],
    });
    expect(storyQA(story).some((n) => n.kind === "no_color_map")).toBe(false);
  });
});

describe("storyQA shapes_unfilled check", () => {
  it("shapes_unfilled fires when a labeled circle has fill none", () => {
    const story = make({ scenes: [
      { role: "hook", heading: "H", sentences: ["Why does the proton repel?", "Charge matters."], visuals: [
        { kind: "circle", cx: 50, cy: 22, r: 5, color: "red", fill: "none", label: "proton", in: { s: 0 } },
      ]},
      { role: "reveal", heading: "R", sentences: ["Because same charges repel.", "Done."], visuals: [] },
      { role: "wrap", heading: "W", sentences: ["Done.", "Done."], visuals: [] },
    ]});
    expect(storyQA(story).some((n) => n.kind === "shapes_unfilled")).toBe(true);
  });
  it("shapes_unfilled silent when labeled circle has a fill color", () => {
    const story = make({ scenes: [
      { role: "hook", heading: "H", sentences: ["Why does the proton repel?", "Charge matters."], visuals: [
        { kind: "circle", cx: 50, cy: 22, r: 5, color: "red", fill: "red", label: "proton", in: { s: 0 } },
      ]},
      { role: "reveal", heading: "R", sentences: ["Because same charges repel.", "Done."], visuals: [] },
      { role: "wrap", heading: "W", sentences: ["Done.", "Done."], visuals: [] },
    ]});
    expect(storyQA(story).some((n) => n.kind === "shapes_unfilled")).toBe(false);
  });
});

describe("storyQA scale_imbalance check", () => {
  it("scale_imbalance fires when one shape is > 3x median", () => {
    const story = make({ scenes: [
      { role: "hook", heading: "H", sentences: ["Why?", "Force."], visuals: [
        { kind: "circle", cx: 20, cy: 22, r: 3, in: { s: 0 } },
        { kind: "circle", cx: 40, cy: 22, r: 3, in: { s: 0 } },
        { kind: "circle", cx: 60, cy: 22, r: 3, in: { s: 0 } },
        { kind: "circle", cx: 80, cy: 22, r: 12, in: { s: 0 } },
      ]},
      { role: "reveal", heading: "R", sentences: ["Because.", "Done."], visuals: [] },
      { role: "wrap", heading: "W", sentences: ["Done.", "Done."], visuals: [] },
    ]});
    expect(storyQA(story).some((n) => n.kind === "scale_imbalance")).toBe(true);
  });
  it("scale_imbalance silent when shapes are proportional", () => {
    const story = make({ scenes: [
      { role: "hook", heading: "H", sentences: ["Why?", "Force."], visuals: [
        { kind: "circle", cx: 20, cy: 22, r: 4, in: { s: 0 } },
        { kind: "circle", cx: 50, cy: 22, r: 5, in: { s: 0 } },
        { kind: "circle", cx: 80, cy: 22, r: 6, in: { s: 0 } },
      ]},
      { role: "reveal", heading: "R", sentences: ["Because.", "Done."], visuals: [] },
      { role: "wrap", heading: "W", sentences: ["Done.", "Done."], visuals: [] },
    ]});
    expect(storyQA(story).some((n) => n.kind === "scale_imbalance")).toBe(false);
  });
});

describe("storyQA composition_clustered check", () => {
  it("composition_clustered fires when all shapes are crammed in a small area", () => {
    const story = make({ scenes: [
      { role: "hook", heading: "H", sentences: ["Why?", "Force."], visuals: [
        { kind: "circle", cx: 48, cy: 20, r: 3, in: { s: 0 } },
        { kind: "circle", cx: 52, cy: 22, r: 3, in: { s: 0 } },
        { kind: "circle", cx: 50, cy: 25, r: 3, in: { s: 0 } },
        { kind: "circle", cx: 54, cy: 28, r: 3, in: { s: 0 } },
      ]},
      { role: "reveal", heading: "R", sentences: ["Because.", "Done."], visuals: [] },
      { role: "wrap", heading: "W", sentences: ["Done.", "Done."], visuals: [] },
    ]});
    expect(storyQA(story).some((n) => n.kind === "composition_clustered")).toBe(true);
  });
  it("composition_clustered silent when shapes are spread across the stage", () => {
    const story = make({ scenes: [
      { role: "hook", heading: "H", sentences: ["Why?", "Force."], visuals: [
        { kind: "circle", cx: 20, cy: 15, r: 3, in: { s: 0 } },
        { kind: "circle", cx: 50, cy: 22, r: 3, in: { s: 0 } },
        { kind: "circle", cx: 80, cy: 30, r: 3, in: { s: 0 } },
      ]},
      { role: "reveal", heading: "R", sentences: ["Because.", "Done."], visuals: [] },
      { role: "wrap", heading: "W", sentences: ["Done.", "Done."], visuals: [] },
    ]});
    expect(storyQA(story).some((n) => n.kind === "composition_clustered")).toBe(false);
  });
});
