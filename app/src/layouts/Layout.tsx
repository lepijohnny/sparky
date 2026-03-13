import {
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import styles from "./Layout.module.css";
import { useStore } from "../store";
import WindowControls from "../components/platform-win/WindowControls";

const LEFT_DEFAULT = 180;
const LEFT_MIN = 150;
const LEFT_MAX = 210;
const MIDDLE_DEFAULT = 250;
const MIDDLE_MIN = 200;
const MIDDLE_MAX = 450;

interface LayoutProps {
  menu: ReactNode;
  context: ReactNode;
  details: ReactNode;

}



export default function Layout({ menu, context, details }: LayoutProps) {
  const focusMode = useStore((s) => s.focusMode);
  const [leftWidth, setLeftWidth] = useState(LEFT_DEFAULT);
  const [middleWidth, setMiddleWidth] = useState(MIDDLE_DEFAULT);
  const [activeHandle, setActiveHandle] = useState<"left" | "middle" | null>(null);
  const dragging = useRef<"left" | "middle" | null>(null);
  const startX = useRef(0);
  const startWidth = useRef(0);

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (!dragging.current) return;
      const dx = e.clientX - startX.current;
      const newWidth = startWidth.current + dx;
      if (dragging.current === "left") {
        setLeftWidth(Math.max(LEFT_MIN, Math.min(LEFT_MAX, newWidth)));
      } else {
        setMiddleWidth(Math.max(MIDDLE_MIN, Math.min(MIDDLE_MAX, newWidth)));
      }
    };
    const onMouseUp = () => {
      if (dragging.current) {
        dragging.current = null;
        setActiveHandle(null);
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
      }
    };
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, []);

  const startResize = useCallback((which: "left" | "middle", e: React.MouseEvent) => {
    dragging.current = which;
    setActiveHandle(which);
    startX.current = e.clientX;
    startWidth.current = which === "left" ? leftWidth : middleWidth;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    e.preventDefault();
  }, [leftWidth, middleWidth]);



  return (
    <div
      className={styles.app}
      style={{
        gridTemplateColumns: focusMode
          ? `0px 0px 0px 0px 1fr`
          : `${leftWidth}px 4px ${middleWidth}px 4px 1fr`,
      }}
    >
      {/* Left */}
      <aside className={`${styles.left} ${focusMode ? styles.leftHidden : ""}`}>
        <div className={styles.leftHeader} data-tauri-drag-region />
        {menu}
      </aside>

      {/* Resize: left | middle */}
      <div
        className={`${styles.resizeHandle} ${activeHandle === "left" ? styles.resizeHandleActive : ""} ${focusMode ? styles.hidden : ""}`}
        onMouseDown={(e) => !focusMode && startResize("left", e)}
      />

      {/* Middle */}
      <div className={`${styles.middle} ${focusMode ? styles.hidden : ""}`}>
        {context}
      </div>

      {/* Resize: middle | right */}
      <div
        className={`${styles.resizeHandle} ${activeHandle === "middle" ? styles.resizeHandleActive : ""} ${focusMode ? styles.hidden : ""}`}
        onMouseDown={(e) => !focusMode && startResize("middle", e)}
      />

      {/* Right */}
      {details}

      {focusMode && (
        <div className={styles.focusDrag} data-tauri-drag-region />
      )}
      <WindowControls />
    </div>
  );
}
