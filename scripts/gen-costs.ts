/** Writes packages/layout/component-costs.json for a 360 px stage: the pixel cost of every component, for the composer prompt. Run: pnpm gen:costs */
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { componentCosts } from "../packages/layout/src/costs";

const out = resolve(__dirname, "..", "packages", "layout", "component-costs.json");
writeFileSync(out, `${JSON.stringify(componentCosts(360), null, 2)}\n`);
console.log("wrote packages/layout/component-costs.json");
