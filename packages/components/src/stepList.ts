import { z } from "zod";
import { formulaLatex } from "./latex";
import { spokenLabel } from "./spoken";
import { objectStateAt } from "./state";
import { applyState } from "./text";
import type { ComponentModule } from "./types";

/** Each step is the id of an authored expression: steps map one-to-one onto the authored solution steps. */
export const StepListProps = z.object({ steps: z.array(z.string().min(1)).min(1).max(5) }).strict();
export type StepListProps = z.infer<typeof StepListProps>;

export const stepList: ComponentModule<StepListProps> = {
  name: "stepList",
  propsSchema: StepListProps as never,
  render(host, props, t, ctx) {
    const p = StepListProps.parse(props);
    host.className = "eve-obj eve-steps";
    const sig = JSON.stringify([p.steps, p.steps.map((s) => ctx.expressions[s] ?? null)]);
    if (host.dataset.sig !== sig) {
      host.dataset.sig = sig;
      const ol = document.createElement("ol");
      ol.className = "eve-steps-list";
      for (const id of p.steps) {
        const expr = ctx.expressions[id];
        if (!expr) throw new Error(`stepList ${ctx.objectId}: unknown step expression ${id}`);
        const li = document.createElement("li");
        const math = document.createElement("span");
        math.innerHTML = ctx.math(formulaLatex(expr, ctx.colors), false);
        math.setAttribute("role", "img");
        math.setAttribute("aria-label", spokenLabel(expr, ctx.locale));
        li.append(math);
        ol.append(li);
      }
      host.replaceChildren(ol);
    }
    applyState(host, objectStateAt(ctx.events, t));
  },
  cueTargets: () => ["whole"],
  altText: (props, ctx) => props.steps.map((id, i) => `Step ${i + 1}: ${ctx.expressions[id] ? spokenLabel(ctx.expressions[id]!, ctx.locale) : id}`).join(". "),
  verify(props, ctx) {
    const problems: string[] = [];
    for (const id of props.steps) if (!(id in ctx.expressions)) problems.push(`step ${id} is not an authored expression`);
    if (new Set(props.steps).size !== props.steps.length) problems.push("a step is listed twice");
    return problems;
  },
};
