import { useState } from "react";
import Modal, { modalStyles } from "./Modal";

interface Props {
  currentName: string;
  onClose: () => void;
  onRename: (name: string) => void;
}

export default function RenameWorkspaceModal({ currentName, onClose, onRename }: Props) {
  const [name, setName] = useState(currentName);
  const valid = name.trim() !== "" && name.trim() !== currentName;

  const handleRename = () => {
    if (valid) onRename(name.trim());
  };

  return (
    <Modal
      title="Rename Workspace"
      onClose={onClose}
      actions={[
        { label: "Cancel", onClick: onClose },
        { label: "Rename", disabled: !valid, onClick: handleRename, primary: true },
      ]}
    >
      <div className={modalStyles.field}>
        <label className={modalStyles.label}>Name</label>
        <input
          className={modalStyles.input}
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && valid) handleRename();
          }}
          autoFocus
        />
      </div>
    </Modal>
  );
}
