import type React from "react";
import {
  createContext,
  useCallback,
  useContext,
  useState,
} from "react";
import { computeCSSVars } from "../lib/themes";

// Fallback defaults (used before backend responds)
const DEFAULT_BG = "#fafafa";
const DEFAULT_FG = "#383a42";
const DEFAULT_ACCENT: string | null = "#4078f2";

interface ThemeState { bg: string; fg: string; accent?: string | null }

interface ThemeContextValue {
  bg: string;
  fg: string;
  setTheme: (bg: string, fg: string, accent?: string | null) => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  bg: DEFAULT_BG,
  fg: DEFAULT_FG,
  setTheme: () => {},
});

export const useTheme = () => useContext(ThemeContext);

function loadSaved(): ThemeState {
  // URL params take priority (popup windows pass theme inline)
  try {
    const params = new URLSearchParams(window.location.search);
    const bg = params.get("bg");
    const fg = params.get("fg");
    const accent = params.get("accent");
    if (bg && fg) {
      const theme: ThemeState = { bg, fg, accent };
      localStorage.setItem("sparky-theme", JSON.stringify(theme));
      return theme;
    }
  } catch {}
  try {
    const raw = localStorage.getItem("sparky-theme");
    if (raw) return JSON.parse(raw);
  } catch {}
  return { bg: DEFAULT_BG, fg: DEFAULT_FG, accent: DEFAULT_ACCENT };
}

function applyToDOM(bg: string, fg: string, accent?: string | null) {
  const vars = computeCSSVars(bg, fg, accent);
  const root = document.documentElement.style;
  for (const [k, v] of Object.entries(vars)) {
    root.setProperty(k, v);
  }
}

// Apply saved theme immediately on load
const initial = loadSaved();
applyToDOM(initial.bg, initial.fg, initial.accent);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState(initial);

  const setTheme = useCallback((bg: string, fg: string, accent?: string | null) => {
    applyToDOM(bg, fg, accent);
    localStorage.setItem("sparky-theme", JSON.stringify({ bg, fg, accent }));
    setState({ bg, fg, accent });
    try {
      new BroadcastChannel("sparky-theme").postMessage({ bg, fg, accent });
    } catch {}
  }, []);

  return (
    <ThemeContext.Provider value={{ bg: state.bg, fg: state.fg, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}
