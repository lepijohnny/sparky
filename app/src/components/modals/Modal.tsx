import { X } from "lucide-react";
import {
  type ReactNode,
  useEffect,
  useRef,
} from "react";
import styles from "./Modal.module.css";

export { styles as modalStyles };

export interface ModalAction {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  primary?: boolean;
}

interface ModalProps {
  title: string;
  children: ReactNode;
  actions: ModalAction[];
  onClose: () => void;
}

export default function Modal({ title, children, actions, onClose }: ModalProps) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const mouseDownOnOverlay = useRef(false);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    <div
      ref={overlayRef}
      className={styles.overlay}
      onMouseDown={(e) => { mouseDownOnOverlay.current = e.target === overlayRef.current; }}
      onMouseUp={(e) => {
        if (mouseDownOnOverlay.current && e.target === overlayRef.current) onClose();
        mouseDownOnOverlay.current = false;
      }}
    >
      <div className={styles.modal}>
        <div className={styles.header}>
          <span>{title}</span>
          <button className={styles.closeBtn} onClick={onClose}>
            <X size={14} strokeWidth={1.5} />
          </button>
        </div>
        <div className={styles.body}>{children}</div>
        <div className={styles.footer}>
          {actions.map((action) => (
            <button
              key={action.label}
              className={`${styles.btn} ${action.primary ? styles.btnPrimary : ""}`}
              onClick={action.onClick}
              disabled={action.disabled}
            >
              {action.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
