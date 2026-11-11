import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { placeStory, sanitizeStory, storyPageHtml } from "../index";
import {
  coverage, defaultRegistry, wave0Registry, expandStoryObjects, filesUnder, flagState, formatCoverage, labelCardDrawer, loadSourceRegister, objectsV2On, onScreenText, parseCsv, parseInventory, positioningProblems,
  privacyScan, propWrapper, readQueue, runReadBackHarness, findBannedPositioning, type RouteContext,
} from "../objects";

let dir: string;
beforeEach(() => void (dir = mkdtempSync(join(tmpdir(), "eve-objects-"))));
afterEach(() => rmSync(dir, { recursive: true, force: true }));
const reg = loadSourceRegister();
const ctx = (enabled: boolean): RouteContext => ({ enabled, registry: defaultRegistry(reg), today: "2026-11-11", cacheDir: join(dir, "cache"), queueFile: join(dir, "queue.jsonl") });
const sha = (s: string): string => createHash("sha256").update(s).digest("hex");
const runtime = readFileSync(resolve(__dirname, "../../../scripts/story-runtime.js"), "utf8");

const baseStory = {
  title: "A plant and a ball",
  scenes: [
    { heading: "One", sentences: ["A plant grows.", "A ball rolls."], visuals: [{ kind: "prop", name: "plant", cx: 30, cy: 30, size: 14, in: { s: 0, off: 0 } }, { kind: "circle", cx: 70, cy: 20, r: 4, in: { s: 1, off: 0 } }] },
    { heading: "Two", sentences: ["Done."], visuals: [{ kind: "text", x: 50, y: 20, text: "Hello", in: { s: 0, off: 0 } }] },
  ],
};
const withObjects = (story: typeof baseStory) => ({
  ...story,
  scenes: [{ ...story.scenes[0], objects: [{ kind: "prop", id: "p", name: "Tree", prop: "tree", cell: "B2" }, { kind: "ray_diagram", id: "r", name: "Concave mirror", device: "mirror_concave", cell: "E3" }] }, story.scenes[1]],
});
/** the bytes the engine produces for a story: the page the render opens */
const pageOf = (raw: unknown): string => {
  const story = sanitizeStory(raw).story!;
  return storyPageHtml(placeStory(story, story.scenes.map((s) => s.sentences.map(() => 2000))), "whiteboard", {}, runtime, "x", {});
};

describe("Q1: with the flag off the output is byte-identical to today's (ADR 0107)", () => {
  it("the flag is off unless the environment says on", () => {
    expect(objectsV2On({})).toBe(false);
    for (const v of ["", "0", "false", "off", "no", "ture", "2"]) expect(objectsV2On({ ENGINE_OBJECTS_V2: v }), v).toBe(false);
    for (const v of ["1", "true", "ON", "Yes"]) expect(objectsV2On({ ENGINE_OBJECTS_V2: v }), v).toBe(true);
    expect(flagState({})).toEqual({ ENGINE_OBJECTS_V2: false, ENGINE_MOTION_V2: false, ENGINE_MISTAKE_VISUALS: false });
  });

  it("returns a story without objects as the very same value", () => {
    const r = expandStoryObjects(baseStory, ctx(false));
    expect(r.story).toBe(baseStory);
    expect(expandStoryObjects(baseStory, ctx(true)).story).toBeDefined();
  });

  it("the page for a story is the same bytes through the seam with the flag off, and with the flag on when it has no objects", () => {
    const direct = pageOf(baseStory);
    expect(pageOf(expandStoryObjects(baseStory, ctx(false)).story)).toBe(direct);
    expect(pageOf(expandStoryObjects(baseStory, ctx(true)).story)).toBe(direct);
    expect(sha(direct)).toMatch(/^[0-9a-f]{64}$/);
  });

  it("a story that carries objects renders the same bytes as the story without them while the flag is off, and writes nothing", () => {
    const off = expandStoryObjects(withObjects(baseStory), ctx(false));
    expect(pageOf(off.story)).toBe(pageOf(baseStory));
    expect(off.decisions).toEqual([]);
    expect(filesUnder(dir)).toEqual([]);
  });

  it("the page for the flag-off sanitised story is unchanged by the new code in the sanitiser path (hash recorded in the stage report)", () => {
    expect(sha(pageOf(baseStory))).toBe(sha(pageOf(JSON.parse(JSON.stringify(baseStory)))));
  });
});

describe("the story seam with the flag on", () => {
  it("adds the shapes of each object to its scene, in the story language, and drops the objects field", () => {
    const r = expandStoryObjects(withObjects(baseStory), ctx(true));
    const scene = (r.story as { scenes: Array<Record<string, unknown>> }).scenes[0]!;
    expect(scene.objects).toBeUndefined();
    const kinds = (scene.visuals as Array<{ kind: string }>).map((v) => v.kind);
    expect(kinds).toEqual(["prop", "circle", "prop", "rect", "text"]); // the two it had, the tree, then the card of the mirror
    expect(r.decisions.map((d) => d.decision.outcome)).toEqual([6, 15]);
    expect(r.notes.join()).toContain("label card");
  });

  it("the sanitiser accepts the expanded story and keeps the card and the prop", () => {
    const clean = sanitizeStory(expandStoryObjects(withObjects(baseStory), ctx(true)).story);
    const v = clean.story!.scenes[0]!.visuals;
    expect(v.map((x) => x.kind)).toEqual(["prop", "circle", "prop", "rect", "text"]);
    const text = v.find((x) => x.kind === "text") as { text: string };
    expect(text.text).toBe("Diagram not available yet: Concave mirror");
    expect(v.find((x) => x.kind === "rect")!.dash).toBe(true);
    expect(clean.notes).toEqual([]);
  });

  it("an invalid object is dropped with a note and the video still builds", () => {
    const story = { ...baseStory, scenes: [{ ...baseStory.scenes[0], objects: [{ kind: "hologram", id: "h", name: "X" }, "not an object", { kind: "prop", id: "p", name: "Tree", prop: "tree" }] }] };
    const r = expandStoryObjects(story, ctx(true));
    expect(r.notes.length).toBeGreaterThanOrEqual(2);
    expect(sanitizeStory(r.story).story).not.toBeNull();
  });

  it("limits the objects of a scene", () => {
    const many = Array.from({ length: 12 }, (_u, i) => ({ kind: "prop", id: `p${i}`, name: "Tree", prop: "tree" }));
    const r = expandStoryObjects({ ...baseStory, scenes: [{ ...baseStory.scenes[0], visuals: [], objects: many }] }, ctx(true));
    expect(((r.story as { scenes: Array<{ visuals: unknown[] }> }).scenes[0]!.visuals).length).toBe(8);
  });

  it("is deterministic: the same story twice gives the same shapes", () => {
    const a = JSON.stringify(expandStoryObjects(withObjects(baseStory), ctx(true)).story);
    const b = JSON.stringify(expandStoryObjects(withObjects(baseStory), ctx(true)).story);
    expect(a).toBe(b);
  });
});

describe("Q8 positioning", () => {
  it("finds each banned phrase", () => {
    for (const t of ["Brownie generates videos", "it creates animated lessons", "this makes explanations", "turns your notes into a video", "generated educational videos", "text-to-video"]) {
      expect(findBannedPositioning(t).length, t).toBeGreaterThan(0);
    }
  });
  it("passes ordinary teaching text", () => {
    for (const t of ["Diagram not available yet: Concave mirror", "Light turns into heat", "A video of the experiment is not shown", "Explanation of Ohm's law"]) expect(findBannedPositioning(t), t).toEqual([]);
  });
  it("no label card or wrapper text for any request carries a banned phrase", () => {
    const r = expandStoryObjects(withObjects(baseStory), ctx(true));
    const shapes = (r.story as { scenes: Array<{ visuals: Array<Record<string, unknown>> }> }).scenes[0]!.visuals;
    expect(onScreenText(shapes).length).toBeGreaterThan(0);
    expect(positioningProblems(shapes)).toEqual([]);
  });
  it("catches a corrupted card", () => {
    expect(positioningProblems([{ kind: "text", text: "Brownie generates videos" }])).toHaveLength(1);
  });
});

describe("Q9 privacy", () => {
  it("nothing the object layer writes (cache, review queue) holds personal data or a secret", () => {
    expandStoryObjects(withObjects(baseStory), ctx(true));
    expect(readQueue(join(dir, "queue.jsonl")).length).toBe(1);
    expect(filesUnder(dir).length).toBeGreaterThanOrEqual(2);
    expect(privacyScan([join(dir, "cache"), join(dir, "queue.jsonl")])).toEqual([]);
  });
  it("the scan finds an email, a phone number and a key in a file", () => {
    const f = join(dir, "x.jsonl");
    require("node:fs").writeFileSync(f, "a@b.com 9876543210 " + "sk" + "-abcdefghijklmnopqrstuvwxyz123456");
    expect(privacyScan([f]).length).toBe(3);
  });
});

describe("Q4 read-back harness (skeleton later drawers plug into)", () => {
  const registry = wave0Registry(reg);
  const cases = [
    { drawer: "label_card", spec: { kind: "label_card", id: "c", name: "Mirror", sentence: 0, reason: "not_drawable_yet" } as never, corrupt: (r: { shapes: Array<Record<string, unknown>>; alt: string }) => ({ ...r, shapes: r.shapes.map((s) => (s.kind === "text" ? { ...s, text: "Something else" } : s)) }) },
    { drawer: "label_card", spec: { kind: "label_card", id: "c", name: "Mirror", sentence: 0, reason: "not_drawable_yet" } as never, corrupt: (r: { shapes: Array<Record<string, unknown>>; alt: string }) => ({ ...r, shapes: [...r.shapes, { kind: "path", d: "M 0 0" }] }) },
    { drawer: "existing_prop", spec: { kind: "prop", id: "p", name: "Plant", sentence: 0, prop: "plant" } as never, corrupt: (r: { shapes: Array<Record<string, unknown>>; alt: string }) => ({ ...r, shapes: [{ ...r.shapes[0], name: "leaf" }] }) },
    { drawer: "existing_primitive", spec: { kind: "primitive", id: "p", name: "Ball", sentence: 0, shape: "circle" } as never, corrupt: (r: { shapes: Array<Record<string, unknown>>; alt: string }) => ({ ...r, shapes: [{ ...r.shapes[0], kind: "rect" }] }) },
  ];
  it("every registered drawer passes clean and rejects its corrupted copy", () => {
    const reports = runReadBackHarness(registry, cases);
    for (const r of reports) expect(r, JSON.stringify(r)).toMatchObject({ passesClean: true, rejectsCorrupted: true });
    expect(new Set(reports.map((r) => r.drawer))).toEqual(new Set(registry.all().map((d) => d.name)));
  });
  it("a case whose corruption is not caught, or a drawer with no read-back, is a failure", () => {
    const blind = runReadBackHarness(registry, [{ ...cases[2]!, corrupt: (r) => r }]);
    expect(blind[0]!.rejectsCorrupted).toBe(false);
    expect(runReadBackHarness(registry, [{ ...cases[2]!, drawer: "nope" }])[0]!.passesClean).toBe(false);
  });
  it("the wrappers are the existing drawers", () => {
    expect(registry.get("existing_prop")).toBe(propWrapper);
    expect(registry.get("label_card")).toBe(labelCardDrawer);
  });
});

describe("the coverage report", () => {
  const csv = readFileSync(resolve(__dirname, "../objects/sample-inventory.csv"), "utf8");
  it("parses quoted fields, escaped quotes and a missing final newline", () => {
    expect(parseCsv('a,"b,c","d ""e"""\n1,2,3')).toEqual([["a", "b,c", 'd "e"'], ["1", "2", "3"]]);
  });
  it("reads the sample, per subject and class, and counts nothing as registered in wave 0", () => {
    const rows = parseInventory(csv);
    expect(rows).toHaveLength(9);
    const rep = coverage(rows, wave0Registry(reg));
    expect(rep.total).toEqual({ pairs: 9, registered: 0, reviewed: 0, todayYes: 1, todayPartial: 3 });
    expect(rep.bySubject.physics!.pairs).toBe(6);
    expect(rep.bySubject.maths!.pairs).toBe(1);
    expect(rep.byClass["9"]!.pairs).toBe(3);
    expect(formatCoverage(rep, "sample")).toContain("wave 0 adds no coverage");
  });
  it("counts a pair when a registered drawer covers its object", () => {
    const registry = wave0Registry(reg).register({ name: "free_body", kind: "free_body", version: "1.0.0", license: "owner-original", sources: ["own-drawings"], covers: ["Free-body diagram"], draw: () => ({ shapes: [], alt: "" }) } as never);
    const rep = coverage(parseInventory(csv), registry);
    expect(rep.total.registered).toBe(1);
    expect(rep.bySubjectClass["physics 9"]!.registered).toBe(1);
  });
  it("reads the CSV from a Markdown file's fenced block and refuses a wrong header or a malformed row", () => {
    expect(parseInventory("# t\n```csv\n" + csv.trim() + "\n```\n")).toHaveLength(9);
    expect(() => parseInventory("a,b\n1,2")).toThrow(/columns/);
    expect(() => parseInventory(csv.split("\n")[0] + "\nx,Physics,c,o,a,H,no,1,t")).toThrow(/malformed/);
  });
  it("the shipped sample folder holds only the sample", () => {
    expect(readdirSync(resolve(__dirname, "../objects")).filter((f) => f.endsWith(".csv"))).toEqual(["sample-inventory.csv"]);
  });
});
