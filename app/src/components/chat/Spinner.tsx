import { useEffect, useRef, useState } from "react";
import styles from "./Spinner.module.css";

const PHRASES = [
  "Pondering…",
  "Sketching ideas…",
  "Bumbling along…",
  "Connecting dots…",
  "Brewing thoughts…",
  "Scribbling…",
  "Daydreaming…",
  "Mulling it over…",
  "Tinkering…",
  "Doodling…",
  "Hatching a plan…",
  "Chewing on it…",
  "Rummaging…",
  "Conjuring…",
  "Noodling…",
];

function Sparks() {
  return (
    <div className={styles.sparks}>
      <div className={styles.spark} />
      <div className={styles.spark} />
      <div className={styles.spark} />
      <div className={styles.spark} />
      <div className={styles.spark} />
      <div className={styles.spark} />
    </div>
  );
}

export type SpinnerStatus = "streaming" | "done" | "stopped" | "error";

const STATUS_LABELS: Record<Exclude<SpinnerStatus, "streaming">, string> = {
  done: "Done",
  stopped: "Stopped",
  error: "Error",
};

const STATUS_COLORS: Record<Exclude<SpinnerStatus, "streaming">, string> = {
  done: "#34c759",
  stopped: "#f5a623",
  error: "#ef4444",
};

/**
 * Streaming indicator with spark particle animation.
 * Shows spinning sparks while active, a colored dot when settled.
 */
function useElapsed(active: boolean): string {
  const [seconds, setSeconds] = useState(0);
  const startRef = useRef(Date.now());

  useEffect(() => {
    if (!active) return;
    startRef.current = Date.now();
    setSeconds(0);
    const id = setInterval(() => {
      setSeconds(Math.floor((Date.now() - startRef.current) / 1000));
    }, 1000);
    return () => clearInterval(id);
  }, [active]);

  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}m ${s}s`;
}

export default function Spinner({ status = "streaming", showText = true }: { status?: SpinnerStatus; size?: number; showText?: boolean }) {
  const active = status === "streaming";
  const elapsed = useElapsed(active);
  const [index, setIndex] = useState(() => Math.floor(Math.random() * PHRASES.length));
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => {
      setIndex((i) => (i + 1) % PHRASES.length);
    }, 3000);
    return () => clearInterval(id);
  }, [active]);

  const label = active ? PHRASES[index] : STATUS_LABELS[status];

  return (
    <div className={`${styles.indicator} ${!active ? styles.settled : ""}`}>
      {active ? (
        <Sparks />
      ) : (
        <div
          className={styles.statusDot}
          style={{ width: 8, height: 8, background: STATUS_COLORS[status] }}
        />
      )}
      {showText && <span key={label} className={styles.phrase}>{label}</span>}
      {active && <span className={styles.timer}>{elapsed}</span>}
    </div>
  );
}
