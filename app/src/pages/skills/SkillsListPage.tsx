import { MoreHorizontal, Trash2 } from "lucide-react";
import { useConnection } from "../../context/ConnectionContext";
import { useStore } from "../../store";
import ContextMenu, { type ContextMenuAction } from "../../components/shared/ContextMenu";
import type { Skill } from "../../types/skill";
import { getSkillIcon } from "./skillIcons";
import styles from "./SkillsListPage.module.css";

interface SkillsListPageProps {
  selectedSkillId: string | null;
  onSelectSkill: (id: string) => void;
}

export default function SkillsListPage({ selectedSkillId, onSelectSkill }: SkillsListPageProps) {
  const { conn } = useConnection();
  const skills = useStore((s) => s.skills);

  const handleDelete = async (id: string) => {
    if (!conn) return;
    await conn.request("skills.delete", { id });
    if (selectedSkillId === id) onSelectSkill("");
  };

  const actions = (skill: Skill): ContextMenuAction[] => [
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
  );
}
