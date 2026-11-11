import type { Drawer } from "../registry";
import { cellFigure, endocrineFigure, membraneFigure, microbeFigure, neuronFigure, organelleFigure, plantFigure, tissueFigure } from "./cells";
import { biotechFigure, enzymeFigure, populationFigure, pyramidFigure } from "./ecology";
import { cycleFigure, heartFigure, nephronFigure, pathwayFigure, systemFigure, taxonomyFigure, treeFigure, webFigure } from "./flowfigs";
import { divisionFigure, dnaFigure, dogmaFigure, pedigreeFigure, punnettFigure } from "./genetics";

/**
 * The drawers of wave 4, Biology (ADR 0111). Each one is pure TypeScript with no tool and no new dependency, carries the licence of its own work, draws only our own geometry (no one else's
 * artwork), and is `reviewed: false` until the owner records a biology teacher's review. All take the `biology` request kind; the figure inside the request says which one draws it.
 */
export const biologyDrawers: ReadonlyArray<Drawer> = [
  cellFigure, organelleFigure, membraneFigure, tissueFigure, microbeFigure, divisionFigure, dnaFigure, dogmaFigure, punnettFigure, pedigreeFigure, pathwayFigure, systemFigure, heartFigure, neuronFigure,
  nephronFigure, endocrineFigure, plantFigure, webFigure, pyramidFigure, populationFigure, cycleFigure, treeFigure, taxonomyFigure, enzymeFigure, biotechFigure,
] as ReadonlyArray<Drawer>;
export { BIOLOGY_FIGURES, BIO_MIN_AREA, parseBiologyParams, type BiologyFigure } from "./params";
