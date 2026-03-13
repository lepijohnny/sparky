import {
  File,
  FolderOpen,
  Globe,
  Plus,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import styles from "./SourceAddButton.module.css";

interface SourceAddButtonProps {
  onFile: () => void;
  onFolder: () => void;
  onUrl: () => void;
}

export default function SourceAddButton({ onFile, onFolder, onUrl }: SourceAddButtonProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <div className={styles.wrap} ref={ref}>
      <button className={styles.btn} onClick={() => setOpen((p) => !p)} title="Add source">
        <Plus size={14} strokeWidth={1.5} />
      </button>
      {open && (
        <div className={styles.popover}>
          <div className={styles.item} onClick={() => { setOpen(false); onFile(); }}>
            <File size={13} strokeWidth={1.5} />
            Add File
          </div>
          <div className={styles.item} onClick={() => { setOpen(false); onFolder(); }}>
            <FolderOpen size={13} strokeWidth={1.5} />
            Add Folder
          </div>
          <div className={styles.item} onClick={() => { setOpen(false); onUrl(); }}>
            <Globe size={13} strokeWidth={1.5} />
            Add URL
          </div>
        </div>
      )}
    </div>
  );
}
