import Dropdown from "../../components/shared/Dropdown";
import { useConnection } from "../../context/ConnectionContext";
import { useTheme } from "../../context/ThemeContext";
import { useWsRequest } from "../../hooks/useWsRequest";
import shared from "../../styles/shared.module.css";
import styles from "./AppearanceDetailsPage.module.css";

interface ThemeEntry {
  name: string;
  bg: string;
  fg: string;
  accent: string | null;
  mode: "dark" | "light";
}

const isMac = /Mac|iPhone|iPad/.test(navigator.userAgent);
const mod = isMac ? "⌘" : "Ctrl";
const shift = isMac ? "⇧" : "Shift";
const del = isMac ? "⌫" : "Backspace";
const enter = isMac ? "↩" : "Enter";


const SHORTCUTS: { label: string; keys: string[] }[] = [
  { label: "New chat", keys: [mod, "N"] },
  { label: "Search chats", keys: [mod, "K"] },
  { label: "Delete chat", keys: [mod, del] },
  { label: "Toggle sidebar", keys: [mod, "B"] },
  { label: "Focus input", keys: [mod, "L"] },
  { label: "Print chat", keys: [mod, "P"] },
  { label: "Chats", keys: [mod, "1"] },
  { label: "Knowledge", keys: [mod, "2"] },
  { label: "Connections", keys: [mod, "3"] },
  { label: "Settings", keys: [mod, "4"] },
  { label: "New line", keys: [shift, enter] },
];

export default function AppearanceDetailsPage() {
  const { conn } = useConnection();
  const { bg, fg, setTheme } = useTheme();
  const { data, loading } = useWsRequest<{ themes: ThemeEntry[] }>(conn, "settings.appearance.theme.list");
  const themes = data?.themes ?? [];

  const currentTheme = themes.find((t) => t.bg === bg && t.fg === fg);
  const currentThemeName = currentTheme?.name ?? themes[0]?.name ?? "";

  const handleChange = async (name: string) => {
    if (!conn) return;
    const t = themes.find((t) => t.name === name);
    if (!t) return;
    setTheme(t.bg, t.fg, t.accent);
    try {
      await conn.request("settings.appearance.theme.set", { name });
    } catch (err) {
      console.error("Failed to persist theme:", err);
    }
  };

  return (
    <div className={shared.contentArea}>
      <div className={shared.card}>
        <div className={shared.cardHeader}>Theme</div>
        <div className={shared.cardBodyRow}>
          <div className={shared.fieldText}>
            <label className={shared.fieldLabel}>Color theme</label>
            <p className={shared.fieldHint}>Choose a color theme for the interface.</p>
          </div>
          <div className={shared.dropdownWrap}>
            {loading ? (
              <span className={shared.fieldHint}>Loading…</span>
            ) : (
              <Dropdown
                options={themes.map((t) => ({ value: t.name, label: t.name }))}
                value={currentThemeName}
                onChange={handleChange}
              />
            )}
          </div>
        </div>
      </div>

      <div className={shared.card}>
        <div className={shared.cardHeader}>Keyboard Shortcuts</div>
        <div className={styles.shortcutList}>
          {SHORTCUTS.map((s) => (
            <div key={s.label} className={styles.shortcutRow}>
              <span className={styles.shortcutLabel}>{s.label}</span>
              <span className={styles.shortcutKeys}>
                {s.keys.map((k, i) => (
                  <kbd key={i} className={styles.shortcutKey}>{k}</kbd>
                ))}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
