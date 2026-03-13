import type { EventBus } from "../core/bus";
import type { StorageProvider } from "../core/storage";
import type { ConfigManager } from "../core/config";
import type { Logger } from "../logger.types";
import type { ThemeFile } from "./appearance.types";

const BUILTIN_THEMES: ThemeFile[] = [
  { name: "Midnight",    author: "Sparky", bg: "#1a1a2e", fg: "#e0e0e0", accent: "#7c8af5", mode: "dark" },
  { name: "Dracula",     author: "Sparky", bg: "#282a36", fg: "#f8f8f2", accent: "#bd93f9", mode: "dark" },
  { name: "Solarized",   author: "Sparky", bg: "#002b36", fg: "#839496", accent: "#268bd2", mode: "dark" },
  { name: "Nord",        author: "Sparky", bg: "#2e3440", fg: "#d8dee9", accent: "#88c0d0", mode: "dark" },
  { name: "Monokai",     author: "Sparky", bg: "#272822", fg: "#f8f8f2", accent: "#66d9ef", mode: "dark" },
  { name: "Gruvbox",     author: "Sparky", bg: "#282828", fg: "#ebdbb2", accent: "#83a598", mode: "dark" },
  { name: "Tokyo Night", author: "Sparky", bg: "#1a1b26", fg: "#a9b1d6", accent: "#7aa2f7", mode: "dark" },
  { name: "Catppuccin",  author: "Sparky", bg: "#1e1e2e", fg: "#cdd6f4", accent: "#89b4fa", mode: "dark" },
  { name: "Rosé Pine",   author: "Sparky", bg: "#191724", fg: "#e0def4", accent: "#c4a7e7", mode: "dark" },
  { name: "Ayu Dark",    author: "Sparky", bg: "#0a0e14", fg: "#b3b1ad", accent: "#e6b450", mode: "dark" },
  { name: "Light",       author: "Sparky", bg: "#fafafa", fg: "#383a42", accent: "#4078f2", mode: "light" },
  { name: "Paper",       author: "Sparky", bg: "#f5f0eb", fg: "#4a4543", accent: "#8b6547", mode: "light" },
];

function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

export class AppearanceSettings {
  private themes: ThemeFile[] = [];
  private active: string = "light";
  private log;

  constructor(
    private bus: EventBus,
    private storage: StorageProvider,
    private config: ConfigManager,
    logger: Logger,
  ) {
    this.log = logger;

    bus.on("storage.ready", () => {
      this.ensureBuiltInThemes();
      this.load();
    });

    bus.on("settings.appearance.theme.list", () => {
      this.log.debug("Listing themes", { count: this.themes.length });
      return { themes: this.themes };
    });

    bus.on("settings.appearance.theme.set", (payload) => this.set(payload));
    bus.on("settings.appearance.theme.save", (payload) => this.save(payload));
  }

  private ensureBuiltInThemes(): void {
    let seeded = 0;
    for (const theme of BUILTIN_THEMES) {
      const path = `themes/${slugify(theme.name)}.json`;
      if (!this.storage.exists(path)) {
        this.storage.write(path, theme);
        seeded++;
      }
    }
    if (seeded > 0) this.log.info(`Seeded ${seeded} built-in theme(s)`);
  }

  private load(): void {
    const files = this.storage.list("themes");
    this.themes = [];
    for (const file of files) {
      try {
        this.themes.push(this.storage.read<ThemeFile>(`themes/${file}`));
      } catch {}
    }
    this.themes.sort((a, b) => {
      if (a.mode !== b.mode) return a.mode === "light" ? -1 : 1;
      return a.name.localeCompare(b.name);
    });

    this.active = this.config.get("activeTheme") ?? "light";

    // Ensure activeTheme exists in config
    if (!this.config.get("activeTheme")) {
      this.config.set("activeTheme", "light");
    }

    this.log.info(`Loaded ${this.themes.length} theme(s), active: ${this.active}`);
  }

  private async set(payload: { name: string }): Promise<{ theme: ThemeFile }> {
    const slug = slugify(payload.name);
    const path = `themes/${slug}.json`;
    if (!this.storage.exists(path)) {
      throw new Error(`Theme not found: ${payload.name}`);
    }

    await this.config.set("activeTheme", slug);
    this.active = slug;

    const theme = this.storage.read<ThemeFile>(path);
    this.log.info(`Theme changed to "${theme.name}"`);
    this.bus.emit("settings.appearance.theme.changed", { theme });
    return { theme };
  }

  private save(payload: { theme: ThemeFile }): { theme: ThemeFile } {
    const theme = payload.theme;
    if (!theme.name || !theme.bg || !theme.fg) throw new Error("Theme must have name, bg, and fg");
    if (!theme.mode) theme.mode = this.luminance(theme.bg) < 0.5 ? "dark" : "light";
    if (!theme.author) theme.author = "User";
    if (theme.accent === undefined) theme.accent = null;

    const slug = slugify(theme.name);
    this.storage.write(`themes/${slug}.json`, theme);

    const idx = this.themes.findIndex((t) => slugify(t.name) === slug);
    if (idx >= 0) this.themes[idx] = theme;
    else this.themes.push(theme);

    this.log.info(`Theme saved: "${theme.name}"`);
    this.bus.emit("settings.appearance.theme.created", { theme });
    return { theme };
  }

  private luminance(hex: string): number {
    const r = parseInt(hex.slice(1, 3), 16) / 255;
    const g = parseInt(hex.slice(3, 5), 16) / 255;
    const b = parseInt(hex.slice(5, 7), 16) / 255;
    return 0.299 * r + 0.587 * g + 0.114 * b;
  }
}
