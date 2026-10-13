import type { ComponentName } from "@eve/schema";
import { equation } from "./equation";
import { functionGraph } from "./functionGraph";
import { highlight } from "./highlight";
import { stepList } from "./stepList";
import { text } from "./text";
import { numberLine } from "./numberLine";
import { arrowCallout } from "./arrowCallout";
import { shape } from "./shape";
import type { ComponentModule } from "./types";

/** Components built so far. The remaining names of the schema's closed list (fractionBar, areaModel, table, balanceScale) are not built. */
export const REGISTRY: Partial<Record<ComponentName, ComponentModule<never>>> = {
  text: text as ComponentModule<never>,
  equation: equation as ComponentModule<never>,
  functionGraph: functionGraph as ComponentModule<never>,
  stepList: stepList as ComponentModule<never>,
  highlight: highlight as ComponentModule<never>,
  numberLine: numberLine as ComponentModule<never>,
  arrowCallout: arrowCallout as ComponentModule<never>,
  shape: shape as ComponentModule<never>,
};

export const IMPLEMENTED = Object.keys(REGISTRY) as ComponentName[];

export function componentFor(name: ComponentName): ComponentModule<never> {
  const c = REGISTRY[name];
  if (!c) throw new Error(`component ${name} is in the registry list but not implemented yet`);
  return c;
}
