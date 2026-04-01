import { memo, useCallback, useState } from "react";
import styles from "./AgentMessageBubble.module.css";

export interface MessageEditorProps {
  content: string;
  onSave: (content: string) => void;
  onCancel: () => void;
}

export const MessageEditor = memo(function MessageEditor({ content, onSave, onCancel }: MessageEditorProps) {
  const [value, setValue] = useState(content);

  const handleSave = useCallback(() => {
    onSave(value);
  }, [onSave, value]);

  return (
    <div className={styles.editWrap}>
      <textarea
        className={styles.editArea}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        autoFocus
      />
      <div className={styles.editActions}>
        <button className={styles.editSave} onClick={handleSave}>Save</button>
        <button className={styles.editCancel} onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
});
