import { useEffect, useRef, useState } from "react";
import Modal, { modalStyles } from "./Modal";

interface RenameModalProps {
  currentName: string;
  onRename: (name: string) => void | Promise<void>;
  onClose: () => void;
}

export default function RenameModal({ currentName, onRename, onClose }: RenameModalProps) {
  const [name, setName] = useState(currentName);
  const inputRef = useRef<HTMLInputElement>(null);
  const valid = name.trim() !== "" && name.trim() !== currentName;

  useEffect(() => {
    inputRef.current?.select();
  }, []);

  const handleRename = async () => {
    if (valid) await onRename(name.trim());
    onClose();
  };

  return (
    <Modal
      title="Rename"
      onClose={onClose}
      actions={[
        { label: "Cancel", onClick: onClose },
        { label: "Rename", disabled: !valid, onClick: handleRename, primary: true },
      ]}
    >
      <div className={modalStyles.field}>
        <label className={modalStyles.label}>Name</label>
        <input
          ref={inputRef}
          className={modalStyles.input}
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && valid) handleRename(); }}
          autoFocus
        />
      </div>
    </Modal>
  );
}
