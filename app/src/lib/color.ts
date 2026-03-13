/** Convert an HSL color string to HSLA with the given alpha */
export function withAlpha(hsl: string, alpha: number): string {
  return hsl.replace("hsl(", "hsla(").replace(")", `, ${alpha})`);
}
