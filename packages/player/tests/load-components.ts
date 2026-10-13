import { SPLIT_COMPONENTS, loadComponents } from "@eve/components";

/** The player draws only components that have been loaded (ADR 0024). Tests exercise every component, so they load the split ones up front. */
await loadComponents(SPLIT_COMPONENTS);
