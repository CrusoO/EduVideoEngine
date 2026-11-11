import type { Drawer } from "../registry";
import { coordFigure, functionFigure, lineFigure, numberLineFigure, trigFigure, unitCircleFigure } from "./graphs";
import { transformFigure, vectorFigure } from "./moves";
import { anglesFigure, circleFigure, constructFigure, elevationFigure, polygonFigure, quadFigure, rightFigure, sectorFigure, similarFigure, triangleFigure } from "./planar";
import { netFigure, sectionFigure, solidFigure, spaceFigure } from "./solids";

/**
 * The drawers of wave 5, Maths A: geometry and graphs (ADR 0112). Each one is pure TypeScript with no tool and no new dependency, carries the licence of its own work, and is `reviewed: false` until the owner
 * records a maths teacher's review. All take the `maths` request kind; the figure inside the request says which one draws it. The numbers come from `compute.ts`; what the figure may claim of an
 * equation (roots, a point on a line) is also written as a claim for the existing SymPy verifier by `claims.ts`.
 */
export const mathsDrawers: ReadonlyArray<Drawer> = [
  coordFigure, lineFigure, functionFigure, trigFigure, unitCircleFigure, numberLineFigure, transformFigure, vectorFigure, triangleFigure, rightFigure, similarFigure, circleFigure, quadFigure, polygonFigure,
  anglesFigure, sectorFigure, constructFigure, elevationFigure, solidFigure, netFigure, sectionFigure, spaceFigure,
] as unknown as ReadonlyArray<Drawer>;
export { MATHS_FIGURES, MATHS_MIN_AREA, parseMathsParams, type MathsFigure } from "./params";
export * as mathsCompute from "./compute";
export { figureClaims, NOT_EXPRESSIBLE, rational, type FigureClaims, type MiniBundle } from "./claims";
