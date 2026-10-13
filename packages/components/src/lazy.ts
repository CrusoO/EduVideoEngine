import type { ComponentName } from "@eve/schema";
import { arrowCallout } from "./arrowCallout";
import { equation } from "./equation";
import { highlight } from "./highlight";
import { shape } from "./shape";
import { stepList } from "./stepList";
import { text } from "./text";
import type { ComponentModule } from "./types";

/**
 * The player's way to get components (ADR 0024). The two heavy components, the graph and the number line (each over 2 KB gzipped), are separate chunks,
 * fetched only when a lesson uses them. The six small ones are part of the core: measured, a chunk of 1 KB costs more in per-file overhead than it saves,
 * so splitting them made lessons that use several of them larger, not smaller. `loadComponents` is called once with the component names of the bundle's
 * scenes, before the first draw; `loadedComponent` is then a plain lookup, so rendering stays synchronous. Build tools and tests that want every
 * component at once use `componentFor` from the registry instead.
 */
const CORE: Partial<Record<ComponentName, ComponentModule<never>>> = {
  text: text as ComponentModule<never>,
  equation: equation as ComponentModule<never>,
  stepList: stepList as ComponentModule<never>,
  highlight: highlight as ComponentModule<never>,
  arrowCallout: arrowCallout as ComponentModule<never>,
  shape: shape as ComponentModule<never>,
};

type Loader = () => Promise<ComponentModule<never>>;
const SPLIT: Partial<Record<ComponentName, Loader>> = {
  functionGraph: () => import("./functionGraph").then((m) => m.functionGraph as ComponentModule<never>),
  numberLine: () => import("./numberLine").then((m) => m.numberLine as ComponentModule<never>),
};

const loaded = new Map<ComponentName, ComponentModule<never>>();

/** The components fetched on demand. */
export const SPLIT_COMPONENTS = Object.keys(SPLIT) as ComponentName[];

/** Fetches the named components that are not in the core (once each). Rejects, naming the component, if one cannot be fetched or is not built. */
export async function loadComponents(names: Iterable<ComponentName>): Promise<void> {
  await Promise.all(
    [...new Set(names)].map(async (name) => {
      if (name in CORE || loaded.has(name)) return;
      const load = SPLIT[name];
      if (!load) throw new Error(`component ${name} is in the registry list but not built`);
      try {
        loaded.set(name, await load());
      } catch (e) {
        throw new Error(`component ${name} could not be loaded: ${(e as Error).message}`);
      }
    }),
  );
}

/** A component of the core, or one that `loadComponents` has fetched. Throws, naming it, if a scene uses a component the lesson did not load. */
export function loadedComponent(name: ComponentName): ComponentModule<never> {
  const c = CORE[name] ?? loaded.get(name);
  if (!c) throw new Error(`component ${name} was not loaded: call loadComponents with the lesson's component names first`);
  return c;
}

/** The component names the scenes of a bundle use. */
export const componentsUsedBy = (bundle: { scenes: ReadonlyArray<{ objects: ReadonlyArray<{ component: ComponentName }> }> }): ComponentName[] => [...new Set(bundle.scenes.flatMap((s) => s.objects.map((o) => o.component)))];
