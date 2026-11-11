import type { Drawer } from "../registry";
import { atomShells, bohrLevels, orbitalBoxes, orbitalShapes, periodicCell, periodicTrend } from "./atoms";
import { galvanicCell, electrolysisCell, labApparatus } from "./apparatus";
import { ionicBond, lewisStructure, vseprShape } from "./bonding";
import { alkaneIsomerSet, organicStructure } from "./organic";
import { energyDiagram, moleFigure, rateGraph, reactionEquation } from "./reactions";
import { gasGraph, phScale, solubilityGraph, titrationCurve } from "./solutions";

/**
 * The drawers of wave 3, Chemistry (ADR 0110). Each one is pure TypeScript with no tool and no new dependency, carries the licence of its own work, and is `reviewed: false` until the
 * owner records a chemistry teacher's review. All take the `chemistry` request kind; the figure inside the request says which one draws it.
 */
export const chemistryDrawers: ReadonlyArray<Drawer> = [
  atomShells, orbitalBoxes, bohrLevels, periodicCell, periodicTrend, orbitalShapes, ionicBond, lewisStructure, vseprShape, organicStructure, alkaneIsomerSet, reactionEquation, moleFigure,
  energyDiagram, rateGraph, gasGraph, titrationCurve, phScale, solubilityGraph, galvanicCell, electrolysisCell, labApparatus,
] as ReadonlyArray<Drawer>;
export { CHEMISTRY_FIGURES, parseChemistryParams, type ChemistryFigure } from "./params";
