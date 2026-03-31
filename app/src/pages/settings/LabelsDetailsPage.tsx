import { useState } from "react";
import ColorPicker from "../../components/shared/ColorPicker";
import { useConnection } from "../../context/ConnectionContext";
import { useStore } from "../../store";
import shared from "../../styles/shared.module.css";
import styles from "./LabelsDetailsPage.module.css";

export default function LabelsDetailsPage() {
  const { conn } = useConnection();
  const labels = useStore((s) => s.labels);
  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");

  const handleCreate = async () => {
    const trimmed = newName.trim();
    if (!trimmed || !conn) return;
    setNewName("");
    await conn.request("settings.labels.create", { name: trimmed }, { notify: true, message: `Label "${trimmed}" created`, expire: true  });
  };

  const handleRename = async (id: string) => {
    const trimmed = editName.trim();
    if (!trimmed || !conn) return;
    setEditingId(null);
    await conn.request("settings.labels.update", { id, name: trimmed });
  };

  const handleColorChange = async (id: string, color: string) => {
    if (!conn) return;
    await conn.request("settings.labels.update", { id, color });
  };

  const handleDelete = async (id: string) => {
    if (!conn) return;
    await conn.request("settings.labels.delete", { id });
  };

  return (
    <div className={shared.contentArea} style={{ overflow: "hidden" }}>
      <div className={shared.card} style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
        <div className={shared.cardHeader}>Labels</div>
        <div className={shared.cardBody} style={{ flex: 1, minHeight: 0, overflowY: "auto", maxHeight: "none" }}>
          {labels.length > 0 ? (
            <div className={styles.list}>
              {labels.map((label) => (
                <div key={label.id} className={styles.item}>
                  <div className={styles.itemLeft}>
                    <ColorPicker
                      current={label.color}
                      onSelect={(color) => handleColorChange(label.id, color)}
                      onClose={() => {}}
                    >
                      <button
                        className={styles.colorDot}
                        style={{ background: label.color }}
                      />
                    </ColorPicker>
                    {editingId === label.id ? (
                      <input
                        className={styles.editInput}
                        type="text"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") handleRename(label.id);
                          if (e.key === "Escape") setEditingId(null);
                        }}
                        onBlur={() => handleRename(label.id)}
                        autoFocus
                      />
                    ) : (
                      <span
                        className={styles.labelName}
                        onDoubleClick={() => {
                          setEditingId(label.id);
                          setEditName(label.name);
                        }}
                      >
                        {label.name}
                      </span>
                    )}
                  </div>
                  <button
                    className={shared.btnDanger}
                    onClick={() => handleDelete(label.id)}
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div className={shared.emptyState}>
              No labels defined. Add labels to organize your chats.
            </div>
          )}
          <div className={styles.addForm}>
            <input
              className={styles.addInput}
              type="text"
              placeholder="Label name"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleCreate(); }}
            />
            <button
              className={shared.btn}
              onClick={handleCreate}
              disabled={!newName.trim()}
            >
              Add
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
