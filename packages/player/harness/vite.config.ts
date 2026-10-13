import { createReadStream, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const fonts = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "components", "fonts");

/** Serve the bundled fonts at /fonts/<name>.woff2, the same URLs YourTutor uses (so a shared origin shares one cached copy). */
export default defineConfig({
  publicDir: false,
  plugins: [
    {
      name: "serve-bundled-fonts",
      configureServer(server) {
        server.middlewares.use("/fonts", (req, res, next) => {
          const file = join(fonts, decodeURIComponent((req.url ?? "").split("?")[0]!));
          if (!file.startsWith(fonts) || !existsSync(file)) return next();
          res.setHeader("content-type", "font/woff2");
          createReadStream(file).pipe(res);
        });
      },
    },
  ],
});
