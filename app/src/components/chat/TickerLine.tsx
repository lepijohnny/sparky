import { useEffect, useRef, useState } from "react";
import styles from "./TickerLine.module.css";

export default function TickerLine({ text }: { text: string | undefined }) {
  const [display, setDisplay] = useState<string | undefined>();
  const [fading, setFading] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    if (text) {
      if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = undefined; }
      setDisplay(text);
      setFading(false);
    } else if (!text) {
      setFading(true);
      timerRef.current = setTimeout(() => { setDisplay(undefined); setFading(false); }, 400);
    }
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [text]);

  if (!display) return null;
  return <div className={`${styles.ticker} ${fading ? styles.tickerOut : ""}`}>{display}</div>;
}
