import type { Drawer } from "../registry";
import { conicFigure, invTrigFigure, lpFigure } from "./curves";
import { flowFigure, mappingFigure, proofFigure } from "./diagrams";
import { blocksFigure, fracBarFigure, identityFigure, realTreeFigure } from "./models";
import { limitFigure, optimFigure, riemannFigure, tangentFigure } from "./calculus";
import { argandFigure, matrixFigure, seqFigure } from "./seqmat";
import { sampleFigure, treeFigure, vennFigure } from "./chance";
import { binomFigure, centreFigure, freqFigure, normalFigure, scatterFigure } from "./stats";

/**
 * The drawers of wave 6, Maths B (ADR 0113). Same method as wave 5: pure TypeScript, no tool, no new dependency, licence owner-original, `reviewed: false`, all of the `maths` request kind.
 */
export const mathsBDrawers: ReadonlyArray<Drawer> = [freqFigure, centreFigure, scatterFigure, normalFigure, binomFigure, treeFigure, vennFigure, sampleFigure, tangentFigure, riemannFigure, optimFigure, limitFigure, seqFigure, matrixFigure, argandFigure, conicFigure, lpFigure, invTrigFigure, flowFigure, mappingFigure, proofFigure, blocksFigure, fracBarFigure, identityFigure, realTreeFigure] as unknown as ReadonlyArray<Drawer>;
