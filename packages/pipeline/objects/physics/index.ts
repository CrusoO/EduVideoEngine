import type { Drawer } from "../registry";
import { circularMotion, collisionFigure, freeBodyDrawer, inclinedPlane, leverFigure, pressureFigure, rotationFigure, vectorArrows } from "./diagrams";
import { energyGraph, gravityFigure, heatFigure, heatingCurveFigure, motionGraph, pendulumFigure, projectileFigure, springMassFigure, stressStrainFigure, thermoPv } from "./graphs";
import { dimensionFigure, soundFigure, waveFigure } from "./waves";

/**
 * The drawers of wave 1, Physics A: mechanics, waves, heat (ADR 0108). Each one is pure TypeScript with no tool and no new dependency, carries the licence of its own work, and is
 * `reviewed: false` until the owner records a physics teacher's review. Registered in this order; the free-body drawer takes the `free_body` request of wave 0, the rest take `physics`.
 */
export const physicsDrawers: ReadonlyArray<Drawer> = [
  vectorArrows, freeBodyDrawer, inclinedPlane, motionGraph, projectileFigure, circularMotion, pendulumFigure, springMassFigure, collisionFigure, energyGraph, rotationFigure, gravityFigure,
  leverFigure, pressureFigure, stressStrainFigure, thermoPv, heatFigure, heatingCurveFigure, waveFigure, soundFigure, dimensionFigure,
] as unknown as ReadonlyArray<Drawer>;

export * from "./params";
export { MIN_AREA, DEFAULT_AREA } from "./area";
export { sig, MIN_TEXT, LABEL_HOOKS, STROKE_COLOURS, layoutProblems } from "./kit";
export * as physicsCompute from "./compute";
