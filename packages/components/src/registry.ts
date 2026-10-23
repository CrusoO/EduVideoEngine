import type { ComponentName } from "@eve/schema";
import { equation } from "./equation";
import { functionGraph } from "./functionGraph";
import { highlight } from "./highlight";
import { stepList } from "./stepList";
import { text } from "./text";
import { numberLine } from "./numberLine";
import { arrowCallout } from "./arrowCallout";
import { shape } from "./shape";
import { table } from "./table";
import { circuit } from "./circuit";
import { magnetCoil } from "./magnetCoil";
import { waterAnalogy } from "./waterAnalogy";
import type { ComponentModule } from "./types";

/** Components built so far. The remaining names of the schema's closed list (fractionBar, areaModel, balanceScale) are not built. */
export const REGISTRY: Partial<Record<ComponentName, ComponentModule<never>>> = {
  text: text as ComponentModule<never>,
  equation: equation as ComponentModule<never>,
  functionGraph: functionGraph as ComponentModule<never>,
  stepList: stepList as ComponentModule<never>,
  highlight: highlight as ComponentModule<never>,
  numberLine: numberLine as ComponentModule<never>,
  arrowCallout: arrowCallout as ComponentModule<never>,
  shape: shape as ComponentModule<never>,
  table: table as ComponentModule<never>,
  circuit: circuit as ComponentModule<never>,
  magnetCoil: magnetCoil as ComponentModule<never>,
  waterAnalogy: waterAnalogy as ComponentModule<never>,
};

export const IMPLEMENTED = Object.keys(REGISTRY) as ComponentName[];

/**
 * The components a request to a model lists as allowed (the envelope). This list is part of every request, so a component added to it would change the key of every recorded
 * answer (ADR 0023) and the models that recorded them are gone. A component built after the recordings (table, ADR 0076; circuit, ADR 0082) is therefore not listed until a prompt version
 * that offers it is recorded; scenes made by a pattern are validated against IMPLEMENTED, which has it.
 */
export const OFFERED_TO_MODELS: readonly ComponentName[] = ["text", "equation", "functionGraph", "stepList", "highlight", "numberLine", "arrowCallout", "shape"];

export function componentFor(name: ComponentName): ComponentModule<never> {
  const c = REGISTRY[name];
  if (!c) throw new Error(`component ${name} is in the registry list but not implemented yet`);
  return c;
}
