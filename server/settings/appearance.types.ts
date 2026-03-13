export interface ThemeFile {
  name: string;
  author: string;
  bg: string;
  fg: string;
  accent: string | null;
  mode: "dark" | "light";
}
