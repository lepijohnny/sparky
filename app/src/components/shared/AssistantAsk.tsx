import { GripHorizontal, Send } from "lucide-react";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import styles from "./AssistantAsk.module.css";

interface AssistantAskProps {
  onSubmit: (content: string) => void | Promise<void>;
  onClose: () => void;
  hint?: string;
  placeholder?: string;
  initialPos?: { x: number; y: number };
}

export default function AssistantAsk({ onSubmit, onClose, hint, placeholder, initialPos }: AssistantAskProps) {
  const [content, setContent] = useState("");
  const [pos, setPos] = useState(initialPos ?? { x: 78, y: 30 });
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const dragRef = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const dropdownRef = useRef<HTMLDivElement>(null);

  const handleDragStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    dragRef.current = { startX: e.clientX, startY: e.clientY, origX: pos.x, origY: pos.y };

    const el = dropdownRef.current;
    const elW = el?.offsetWidth ?? 320;
    const elH = el?.offsetHeight ?? 200;
    const maxX = window.innerWidth - elW;
    const maxY = window.innerHeight - elH;

    const handleMove = (ev: MouseEvent) => {
      if (!dragRef.current) return;
      const dx = ev.clientX - dragRef.current.startX;
      const dy = ev.clientY - dragRef.current.startY;
      const x = Math.max(0, Math.min(maxX, dragRef.current.origX + dx));
      const y = Math.max(30, Math.min(maxY, dragRef.current.origY + dy));
      setPos({ x, y });
    };

    const handleUp = () => {
      dragRef.current = null;
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleUp);
    };

    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleUp);
  }, [pos]);

  const valid = content.trim().length > 0;

  const handleSubmit = useCallback(async () => {
    if (!valid) return;
    await onSubmit(content.trim());
    onClose();
  }, [valid, content, onSubmit, onClose]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    }
    if (e.key === "Enter" && !e.shiftKey && valid) {
      e.preventDefault();
      handleSubmit();
    }
  }, [valid, handleSubmit, onClose]);

  const handleInput = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setContent(e.target.value);
    const el = e.target;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 240) + "px";
  }, []);

  return (
    <>
      <div className={styles.backdrop} onClick={onClose} />
      <div ref={dropdownRef} className={styles.dropdown} style={{ left: pos.x, top: pos.y }}>
        <div className={styles.dragHandle} onMouseDown={handleDragStart}>
          <GripHorizontal size={14} strokeWidth={1.5} />
        </div>
        <p className={styles.hint}>
          {hint ?? "Ask the assistant to change settings, manage chats — rename, flag, label, archive, and more."}
        </p>
        <div className={styles.inputRow}>
          <textarea
            ref={inputRef}
            className={styles.input}
            value={content}
            onChange={handleInput}
            onKeyDown={handleKeyDown}
            rows={4}
            placeholder={placeholder ?? "What would you like to do?"}
          />
          <button
            className={styles.sendBtn}
            onClick={handleSubmit}
            disabled={!valid}
          >
            <Send size={13} strokeWidth={1.5} />
          </button>
        </div>
      </div>
    </>
  );
}
