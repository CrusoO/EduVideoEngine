import { createReadStream, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, type Plugin } from "vite";

const here = dirname(fileURLToPath(import.meta.url));

/** Serve a folder at a URL prefix, read-only. */
const serve = (prefix: string, dir: string, type: (file: string) => string): Plugin => ({
  name: `serve-${prefix}`,
  configureServer(server) {
    server.middlewares.use(prefix, (req, res, next) => {
      const file = join(dir, decodeURIComponent((req.url ?? "").split("?")[0]!));
      if (!file.startsWith(dir) || !existsSync(file)) return next();
      res.setHeader("content-type", type(file));
      createReadStream(file).pipe(res);
    });
  },
});

/**
 * /fonts: the bundled fonts at the same URLs the host application uses (so a shared origin shares one cached copy).
 * /voice: the pinned development voice files of the reference lesson.
 */
export default defineConfig({
  publicDir: false,
  plugins: [
    serve("/fonts", join(here, "..", "..", "components", "fonts"), () => "font/woff2"),
    serve("/voice", join(here, "..", "..", "voice", "fixtures", "reference.en-IN"), (f) => (f.endsWith(".json") ? "application/json" : "audio/wav")),
  ],
});
