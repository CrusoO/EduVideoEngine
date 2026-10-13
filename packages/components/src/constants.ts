/**
 * Numbers the layout solver needs about components, kept apart from the components themselves so that measuring a scene does not load them: a lesson
 * downloads only the components it uses (ADR 0024). The components import these; nothing here imports a component.
 */
export const CALLOUT_WORDS = 8;

export const SHAPE_HEIGHT = { s: 48, m: 96, l: 144 } as const;
export const SHAPE_LINE_HEIGHT = 24;
export const SHAPE_LABEL_WORDS = 4;

/** The ring colour and the stage colour it must stand out from (WCAG 1.4.11: 3:1 for graphical objects). */
export const HIGHLIGHT_COLOR = "#F5D547";
export const STAGE_COLOR = "#0B0D14";

/** WCAG contrast ratio of two #rrggbb colours. */
export function contrast(a: string, b: string): number {
  const lum = (hex: string) => {
    const n = parseInt(hex.slice(1), 16);
    const f = (v: number) => {
      const s = v / 255;
      return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * f((n >> 16) & 255) + 0.7152 * f((n >> 8) & 255) + 0.0722 * f(n & 255);
  };
  const [x, y] = [lum(a), lum(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}
