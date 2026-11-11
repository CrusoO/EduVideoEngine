/**
 * The Objects section of the Pipeline Layer Inspector (scripts/lesson-inspector.ts, port 4323): the routes under /objects (ADR 0107, 0108, 0110, 0111). It lists the registered drawers,
 * draws their sample figures and the sample story requests through the same page the story video opens (scripts/objects-sheet.ts does the same for a contact sheet), shows the
 * coverage, and keeps a reviewer's notes in dist/objects-review-notes.json. Read-only everywhere else: no network, no model, no voice, nothing written outside dist/, and the plan
 * file of the owner is read only when it is there. The two switches of the page (ENGINE_OBJECTS_V2, ENGINE_OBJECTS_ALLOW_UNREVIEWED) arrive as query parameters and reach
 * `storyForRender` as an explicit record, so they change nothing outside this page. The data is assembled by packages/pipeline/objects/inspector-data.ts.
 */
import type { IncomingMessage, ServerResponse } from "node:http";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve, sep } from "node:path";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { REPO_ROOT } from "../packages/adapters/src";
import { FRAME, placeStory, sanitizeStory, storyForRender, storyPageHtml } from "../packages/pipeline";
import {
  BANNER_TEXT, NOMINAL_SENTENCE_MS, REVIEW_NOTES_FILE, addReviewNote, coverageView, defaultRegistry, drawerRows, figureResult, loadSamples, loadStories, parseInventory, parseReviewNotes,
  sampleStory, sceneSummaries, togglesEnv, togglesFromQuery, type CoverageView, type InspectorToggles,
} from "../packages/pipeline/objects";

const PORT = 4323;
const HOSTS = new Set([`127.0.0.1:${PORT}`, `localhost:${PORT}`]);
const here = __dirname;
const fixtures = resolve(REPO_ROOT, "fixtures", "objects");
const planPath = resolve(REPO_ROOT, "..", "EngineV2-E0", "OBJECT-COVERAGE-8-12.md");
const samplePath = resolve(REPO_ROOT, "packages", "pipeline", "objects", "sample-inventory.csv");
const notesPath = resolve(REPO_ROOT, "dist", REVIEW_NOTES_FILE);
const katexRoot = resolve(here, "../packages/components");
const katexCss = createRequire(join(katexRoot, "package.json")).resolve("katex/dist/katex.min.css");
const ASSET_DIRS: Record<string, string> = { kx: dirname(katexCss), pf: resolve(here, "../packages/pipeline/fonts"), cf: resolve(here, "../packages/components/fonts") };
const TYPES: Record<string, string> = { ".css": "text/css", ".woff2": "font/woff2", ".woff": "font/woff", ".ttf": "font/ttf" };

// what the drawers and the fixtures give; built on the first request
let loaded: ReturnType<typeof load> | null = null;
function load() {
  const registry = defaultRegistry();
  const samples = loadSamples(fixtures);
  const figures = samples.map((s) => figureResult(registry, s));
  const stories = loadStories(fixtures);
  return { registry, samples, figures, stories, tmp: mkdtempSync(join(tmpdir(), "eve-inspector-objects-")) };
}
const state = () => (loaded ??= load());
process.on("exit", () => {
  if (loaded) rmSync(loaded.tmp, { recursive: true, force: true });
});

/** The coverage of the registered drawers: from the owner's plan file when it is there (read-only), else from the small invented sample inventory. */
function coverageNow(): CoverageView {
  const { registry } = state();
  if (existsSync(planPath)) {
    try {
      return coverageView(parseInventory(readFileSync(planPath, "utf8")), registry, "OBJECT-COVERAGE-8-12.md (EngineV2-E0)", true);
    } catch {
      /* a plan file this reader cannot parse: fall back, and say so */
    }
  }
  return coverageView(parseInventory(readFileSync(samplePath, "utf8")), registry, "packages/pipeline/objects/sample-inventory.csv", false);
}
const readNotes = () => parseReviewNotes(existsSync(notesPath) ? readFileSync(notesPath, "utf8") : undefined);

const json = (res: ServerResponse, code: number, body: unknown): void => {
  const text = JSON.stringify(body);
  res.writeHead(code, { "Content-Type": "application/json; charset=utf-8", "Content-Length": Buffer.byteLength(text), "Cache-Control": "no-store" });
  res.end(text);
};

/** The page the story video opens, for one sample figure or one sample story, drawn with the given switches. */
function buildPreview(type: string, id: string, t: InspectorToggles) {
  const s = state();
  let title: string;
  let raw: unknown;
  if (type === "sample") {
    const e = s.samples.find((x) => x.id === id);
    if (!e) return { error: "unknown sample" };
    title = e.name;
    raw = sampleStory(e.name, e.spec);
  } else if (type === "story") {
    const e = s.stories.find((x) => x.id === id);
    if (!e) return { error: "unknown story" };
    title = e.title;
    raw = e.story;
  } else return { error: "unknown type" };
  // the cache and the review queue of the router live in a temporary folder of this process, never in the engine's dist/
  const expanded = storyForRender(raw, togglesEnv(t), s.tmp);
  const clean = sanitizeStory(expanded.story);
  if (!clean.story) return { error: `not usable: ${clean.notes.join("; ")}` };
  const placed = placeStory(clean.story, clean.story.scenes.map((sc) => sc.sentences.map(() => NOMINAL_SENTENCE_MS)));
  const katex = createRequire(join(katexRoot, "package.json"))("katex") as { renderToString(x: string, o: object): string };
  const math: Record<string, string> = {};
  clean.story.scenes.forEach((sc, si) =>
    sc.visuals.forEach((v, vi) => {
      if (v.kind === "math") math[`${si}:${vi}`] = katex.renderToString(v.latex, { throwOnError: false, output: "html", trust: false, strict: "ignore", maxSize: 20, maxExpand: 200, displayMode: v.display === true });
    }),
  );
  const runtime = readFileSync(resolve(here, "story-runtime.js"), "utf8");
  let html = storyPageHtml(placed, "whiteboard", math, runtime, "/objects/asset/kx/katex.min.css", { visualStyle: "animated", chrome: "none", font: "atkinson" });
  // nothing is fetched from outside: web-font links are dropped, and the bundled fonts are served by this server instead of by file: URLs
  html = html.replace(/<link[^>]*(?:googleapis|gstatic)[^>]*>/g, "");
  for (const key of ["pf", "cf"]) html = html.split(`${pathToFileURL(ASSET_DIRS[key]!).href}/`).join(`/objects/asset/${key}/`);
  html = html.replace("</body>", `<script>window.__inspectorEnd=${JSON.stringify(placed.scenes.map((sc) => sc.endMs))};</script></body>`);
  return {
    html,
    info: {
      type,
      id,
      title,
      totalMs: placed.totalMs,
      scenes: placed.scenes.map((sc) => ({ heading: sc.heading, sentences: sc.sentences.map((x) => x.text), startMs: sc.startMs, endMs: sc.endMs })),
      notes: [...expanded.notes, ...clean.notes],
      decisions: expanded.decisions.map((d) => ({ scene: d.scene, index: d.index, outcome: d.decision.outcome, name: d.decision.name, action: d.decision.action, drawer: d.decision.drawer })),
      width: FRAME.width,
    },
  };
}

/** Handles a request under /objects. Returns false for any other path, so the inspector's own routes are untouched. */
export function handleObjectsRoute(req: IncomingMessage, res: ServerResponse, url: URL): boolean {
  if (!url.pathname.startsWith("/objects")) return false;
  // a page of another site must not be able to reach this server through a name that points at 127.0.0.1
  if (!HOSTS.has(String(req.headers.host ?? "").toLowerCase())) {
    res.writeHead(403, { "Content-Type": "text/plain" });
    res.end("forbidden");
    return true;
  }
  const t = togglesFromQuery(url.searchParams);
  try {
    if (req.method === "GET" && url.pathname === "/objects/client.js") {
      const js = readFileSync(resolve(here, "objects-inspector-client.js"), "utf8");
      res.writeHead(200, { "Content-Type": "text/javascript; charset=utf-8", "Cache-Control": "no-store" });
      res.end(js);
      return true;
    }
    if (req.method === "GET" && url.pathname === "/objects/api/overview") {
      const s = state();
      json(res, 200, { banner: BANNER_TEXT, drawers: drawerRows(s.registry), figures: s.figures, coverage: coverageNow(), stories: s.stories.map((x) => ({ id: x.id, folder: x.folder, title: x.title, scenes: sceneSummaries(x.story) })), notes: readNotes() });
      return true;
    }
    if (req.method === "GET" && url.pathname === "/objects/api/preview") {
      const p = buildPreview(url.searchParams.get("type") ?? "", url.searchParams.get("id") ?? "", t);
      if ("error" in p) json(res, 404, { error: p.error });
      else json(res, 200, { ...p.info, pageUrl: `/objects/page?type=${encodeURIComponent(p.info.type)}&id=${encodeURIComponent(p.info.id)}&v2=${t.objectsV2 ? 1 : 0}&unrev=${t.allowUnreviewed ? 1 : 0}` });
      return true;
    }
    if (req.method === "GET" && url.pathname === "/objects/page") {
      const p = buildPreview(url.searchParams.get("type") ?? "", url.searchParams.get("id") ?? "", t);
      if ("error" in p) {
        res.writeHead(404, { "Content-Type": "text/plain" });
        res.end(p.error);
        return true;
      }
      res.writeHead(200, {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
        // the page may run its own inline script and load what this server serves; nothing else
        "Content-Security-Policy": "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline' 'self'; font-src 'self'; img-src 'self' data:; frame-ancestors 'self'",
      });
      res.end(p.html);
      return true;
    }
    if (req.method === "GET" && url.pathname.startsWith("/objects/asset/")) {
      const [, , , key, ...rest] = url.pathname.split("/");
      const dir = ASSET_DIRS[key ?? ""];
      const rel = rest.map((x) => decodeURIComponent(x)).join("/");
      const file = dir ? resolve(dir, rel) : "";
      if (!dir || rel === "" || /(^|\/)\.\.?(\/|$)/.test(rel) || !file.startsWith(dir + sep) || !TYPES[file.slice(file.lastIndexOf("."))] || !existsSync(file)) {
        res.writeHead(404, { "Content-Type": "text/plain" });
        res.end("not found");
        return true;
      }
      res.writeHead(200, { "Content-Type": TYPES[file.slice(file.lastIndexOf("."))]!, "Cache-Control": "max-age=3600" });
      res.end(readFileSync(file));
      return true;
    }
    if (req.method === "POST" && url.pathname === "/objects/api/notes") {
      let raw = "";
      req.on("data", (c: Buffer) => {
        raw += c.toString("utf8");
        if (raw.length > 20_000) req.destroy();
      });
      req.on("end", () => {
        try {
          if (!/^application\/json/i.test(String(req.headers["content-type"] ?? ""))) return json(res, 415, { error: "send JSON" });
          const added = addReviewNote(readNotes(), JSON.parse(raw) as Record<string, unknown>, state().registry.all().map((d) => d.name), new Date().toISOString());
          if (!added.ok) return json(res, 400, { error: added.error });
          // the only file this section writes; dist/ is ignored by git. The registry code is never touched.
          mkdirSync(dirname(notesPath), { recursive: true });
          const tmp = `${notesPath}.tmp`;
          writeFileSync(tmp, `${JSON.stringify(added.notes, null, 2)}\n`);
          renameSync(tmp, notesPath);
          json(res, 200, { notes: added.notes });
        } catch (e) {
          json(res, 400, { error: e instanceof SyntaxError ? "not JSON" : "could not save the note" });
        }
      });
      return true;
    }
  } catch (e) {
    json(res, 500, { error: e instanceof Error ? e.message : "error" });
    return true;
  }
  res.writeHead(404, { "Content-Type": "text/plain" });
  res.end("not found");
  return true;
}
