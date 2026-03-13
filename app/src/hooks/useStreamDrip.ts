import { useEffect, useRef, useState } from "react";

const WORDS_PER_SECOND = 12;

/**
 * Word-by-word typing buffer for streaming content.
 * Releases words at a fixed rate, frame-rate independent.
 * Non-streaming content returned as-is.
 */
export function useStreamDrip(content: string, active: boolean): string {
  const [wordCount, setWordCount] = useState(0);
  const wordCountRef = useRef(0);
  const rafRef = useRef<number>(0);
  const lastFrameRef = useRef(0);
  const accumRef = useRef(0);
  const activeRef = useRef(active);

  activeRef.current = active;

  useEffect(() => {
    if (!active) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = 0;
      return;
    }

    wordCountRef.current = 0;
    accumRef.current = 0;
    setWordCount(0);
    lastFrameRef.current = performance.now();

    const tick = (now: number) => {
      const elapsed = Math.max(0, now - lastFrameRef.current);
      lastFrameRef.current = now;
      accumRef.current += (elapsed / 1000) * WORDS_PER_SECOND;

      const step = Math.floor(accumRef.current);
      if (step > 0) {
        accumRef.current -= step;
        wordCountRef.current += step;
        setWordCount(wordCountRef.current);
      }

      if (activeRef.current) {
        rafRef.current = requestAnimationFrame(tick);
      }
    };

    rafRef.current = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = 0;
    };
  }, [active]);

  if (!active) return content;

  let count = 0;
  let end = 0;
  let inWord = false;
  for (let i = 0; i < content.length; i++) {
    const isSpace = content[i] === " " || content[i] === "\n" || content[i] === "\t";
    if (!isSpace && !inWord) {
      count++;
      if (count > wordCount) break;
      inWord = true;
    } else if (isSpace) {
      inWord = false;
    }
    end = i + 1;
  }

  return content.slice(0, end);
}
