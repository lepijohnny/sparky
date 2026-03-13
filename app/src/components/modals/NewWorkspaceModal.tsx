import { useState } from "react";
import Modal, { modalStyles } from "./Modal";

interface Props {
  onClose: () => void;
  onCreate: (name: string) => void;
}

export default function NewWorkspaceModal({ onClose, onCreate }: Props) {
  const [name, setName] = useState("");
  const valid = name.trim() !== "";

  const handleCreate = () => {
    if (valid) onCreate(name.trim());
  };

  return (
    <Modal
      title="New Workspace"
      onClose={onClose}
      actions={[
        { label: "Cancel", onClick: onClose },
        { label: "Create", disabled: !valid, onClick: handleCreate, primary: true },
      ]}
    >
      <div className={modalStyles.field}>
        <label className={modalStyles.label}>Name</label>
        <input
          className={modalStyles.input}
          type="text"
          placeholder="My Workspace"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && valid) handleCreate();
          }}
          autoFocus
        />
      </div>
    </Modal>
  );
}
