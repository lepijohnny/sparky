// CSS variable derivation from bg + fg. Theme data now lives on the backend.

function hexToHSL(hex: string): [number, number, number] {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
      case g: h = ((b - r) / d + 2) / 6; break;
      case b: h = ((r - g) / d + 4) / 6; break;
    }
  }
  return [Math.round(h * 360), Math.round(s * 100), Math.round(l * 100)];
}

function luminance(hex: string): number {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

function mix(hex1: string, hex2: string, t: number): string {
  const r = Math.round(parseInt(hex1.slice(1, 3), 16) * (1 - t) + parseInt(hex2.slice(1, 3), 16) * t);
  const g = Math.round(parseInt(hex1.slice(3, 5), 16) * (1 - t) + parseInt(hex2.slice(3, 5), 16) * t);
  const b = Math.round(parseInt(hex1.slice(5, 7), 16) * (1 - t) + parseInt(hex2.slice(5, 7), 16) * t);
  return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
}

/** Parse hex (#rrggbb) to { r, g, b } */
export function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const h = hex.replace("#", "");
  return {
    r: parseInt(h.substring(0, 2), 16) || 0,
    g: parseInt(h.substring(2, 4), 16) || 0,
    b: parseInt(h.substring(4, 6), 16) || 0,
  };
}

/** Mix two hex colors by ratio t (0–1) → { r, g, b, a } */
export function mixColors(hex1: string, hex2: string, t: number): { r: number; g: number; b: number; a: number } {
  const a = hexToRgb(hex1);
  const b = hexToRgb(hex2);
  return {
    r: Math.round(a.r * (1 - t) + b.r * t),
    g: Math.round(a.g * (1 - t) + b.g * t),
    b: Math.round(a.b * (1 - t) + b.b * t),
    a: 255,
  };
}

export function computeCSSVars(bg: string, fg: string, accent?: string | null): Record<string, string> {
  const isDark = luminance(bg) < 0.5;
  const [fgH] = hexToHSL(fg);
  const accentColor = accent
    ? accent
    : isDark ? `hsl(${fgH}, 60%, 65%)` : `hsl(${fgH}, 45%, 52%)`;
  const [accentH, accentS] = accent ? hexToHSL(accent) : [fgH, 60];
  return {
    "--bg":          isDark ? bg : mix(bg, fg, 0.06),
    "--fg":          fg,
    "--bg-raised":   isDark ? mix(bg, fg, 0.07) : mix(bg, fg, 0.02),
    "--bg-surface":  isDark ? mix(bg, fg, 0.12) : bg,
    "--bg-overlay":  mix(bg, fg, 0.10),
    "--border":      mix(bg, fg, isDark ? 0.15 : 0.12),
    "--fg-muted":    mix(bg, fg, isDark ? 0.55 : 0.55),
    "--fg-subtle":   mix(bg, fg, isDark ? 0.35 : 0.35),
    "--accent":      accentColor,
    "--accent-soft": `hsla(${accentH}, ${accentS}%, ${isDark ? 65 : 52}%, ${isDark ? 0.15 : 0.12})`,
    "--shadow":      isDark ? "rgba(0,0,0,0.4)" : "rgba(0,0,0,0.12)",
  };
}
