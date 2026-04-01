import { useState } from "react";
import { Download, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { save } from "@tauri-apps/plugin-dialog";
import { useConnection } from "../../context/ConnectionContext";
import { useToasts } from "../../context/ToastContext";
import { useStore } from "../../store";
import ContextMenu, { type ContextMenuAction } from "../../components/shared/ContextMenu";
import RenameModal from "../../components/modals/RenameModal";
import type { Skill } from "../../types/skill";
import { getSkillIcon } from "./skillIcons";
import styles from "./SkillsListPage.module.css";

interface SkillsListPageProps {
  selectedSkillId: string | null;
  onSelectSkill: (id: string) => void;
}

export default function SkillsListPage({ selectedSkillId, onSelectSkill }: SkillsListPageProps) {
  const { conn } = useConnection();
  const { addToast } = useToasts();
  const skills = useStore((s) => s.skills);
  const [renaming, setRenaming] = useState<Skill | null>(null);

  const handleDelete = async (id: string) => {
    if (!conn) return;
    await conn.request("skills.delete", { id });
    if (selectedSkillId === id) onSelectSkill("");
  };

  const handleExport = async (skill: Skill) => {
    if (!conn) return;
    try {
      const dest = await save({
        defaultPath: `${skill.id}.zip`,
        filters: [{ name: "Skill archive", extensions: ["zip"] }],
      });
      if (!dest) return;
      await conn.request("skills.export", { id: skill.id, dest });
      addToast({ id: `skill-export-${Date.now()}`, kind: "success", title: `Exported "${skill.name}"` });
    } catch (err: any) {
      addToast({ id: `skill-export-err-${Date.now()}`, kind: "error", title: err?.message ?? String(err) });
    }
  };

  const handleRename = async (name: string) => {
    if (!conn || !renaming) return;
    try {
      await conn.request("skills.rename", { id: renaming.id, name });
    } catch (err: any) {
      addToast({ id: `skill-rename-err-${Date.now()}`, kind: "error", title: err?.message ?? String(err) });
    }
  };

  const actions = (skill: Skill): ContextMenuAction[] => [
    {
      label: "Rename",
      icon: <Pencil size={14} strokeWidth={1.5} />,
      onClick: () => setRenaming(skill),
    },
    {
      label: "Export",
      icon: <Download size={14} strokeWidth={1.5} />,
      onClick: () => handleExport(skill),
    },
    { divider: true },
    {
      label: "Delete",
      icon: <Trash2 size={14} strokeWidth={1.5} />,
      danger: true,
      onClick: () => handleDelete(skill.id),
    },
  ];

  if (!skills.length) {
    return (
      <div className={styles.empty}>
        <span>No skills yet. Import or create one.</span>
      </div>
    );
  }

  return (
    <>
      <div className={styles.list}>
        {skills.map((skill) => (
          <div
            key={skill.id}
            className={`${styles.item} ${selectedSkillId === skill.id ? styles.selected : ""}`}
            onClick={() => onSelectSkill(skill.id)}
          >
            {(() => { const Icon = getSkillIcon(skill.icon); return <Icon size={16} strokeWidth={1.5} className={styles.skillIcon} />; })()}
            <div className={styles.info}>
              <span className={styles.name}>{skill.name}</span>
              <span className={styles.meta}>
                <span>{skill.state}</span>
                <span className={styles.dot}>·</span>
                <span>{skill.source}</span>
              </span>
            </div>
            <div className={styles.moreBtn} onClick={(e) => e.stopPropagation()}>
              <ContextMenu actions={actions(skill)}>
                <MoreHorizontal size={14} strokeWidth={1.5} />
              </ContextMenu>
            </div>
          </div>
        ))}
      </div>
      {renaming && (
        <RenameModal
          currentName={renaming.name}
          onRename={handleRename}
          onClose={() => setRenaming(null)}
        />
      )}
    </>
  );
}
