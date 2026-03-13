import {
  Brain,
  Bug,
  FolderCog,
  Info,
  Palette,
  Plug,
  Tag,
  User,
  Variable,
} from "lucide-react";
import type {
  ReactNode,
} from "react";
import styles from "./SettingsContextPage.module.css";

export type { SettingsSub } from "../../store/types";

const ICON_SIZE = 16;
const ICON_STROKE = 1.5;

const ITEMS: { id: SettingsSub; label: string; icon: ReactNode }[] = [
  { id: "appearance", label: "Appearance", icon: <Palette size={ICON_SIZE} strokeWidth={ICON_STROKE} /> },
  { id: "llm", label: "LLM", icon: <Brain size={ICON_SIZE} strokeWidth={ICON_STROKE} /> },
  { id: "labels", label: "Labels", icon: <Tag size={ICON_SIZE} strokeWidth={ICON_STROKE} /> },
  { id: "environment", label: "Environment", icon: <Variable size={ICON_SIZE} strokeWidth={ICON_STROKE} /> },
  { id: "workspace", label: "Workspace", icon: <FolderCog size={ICON_SIZE} strokeWidth={ICON_STROKE} /> },
  { id: "extractors", label: "Extractors", icon: <Plug size={ICON_SIZE} strokeWidth={ICON_STROKE} /> },
  { id: "profile", label: "Profile", icon: <User size={ICON_SIZE} strokeWidth={ICON_STROKE} /> },
  { id: "about", label: "About", icon: <Info size={ICON_SIZE} strokeWidth={ICON_STROKE} /> },
];

const DEBUG_ITEM = { id: "debug" as SettingsSub, label: "Debug", icon: <Bug size={ICON_SIZE} strokeWidth={ICON_STROKE} /> };

interface Props {
  activeSub: SettingsSub;
  onSubChange: (sub: SettingsSub) => void;
  debugUnlocked?: boolean;
}

export default function SettingsContextPage({ activeSub, onSubChange, debugUnlocked }: Props) {
  const items = debugUnlocked ? [...ITEMS, DEBUG_ITEM] : ITEMS;

  return (
    <nav className={styles.menu}>
      {items.map((item) => (
        <div
          key={item.id}
          className={`${styles.menuItem} ${activeSub === item.id ? styles.menuItemActive : ""}`}
          onClick={() => onSubChange(item.id)}
        >
          <span className={styles.itemIcon}>{item.icon}</span>
          {item.label}
        </div>
      ))}
    </nav>
  );
}
