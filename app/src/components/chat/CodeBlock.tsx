import { Check, Copy } from "lucide-react";
import { memo, type ReactElement, useCallback, useMemo, useState } from "react";
import styles from "./CodeBlock.module.css";

interface CodeBlockProps {
  code: string;
  language?: string;
}

function parseCodeBlock(raw: string): { language: string; code: string } {
  const lines = raw.split("\n");
  let start = 0;
  let end = lines.length;
  let language = "";

  if (lines[0]?.trimStart().startsWith("```")) {
    language = lines[0].trimStart().slice(3).trim().split(/\s/)[0] ?? "";
    start = 1;
  }
  if (end > start && lines[end - 1]?.trim() === "```") {
    end -= 1;
  }

  return { language, code: lines.slice(start, end).join("\n") };
}

const CodeBlock = memo(function CodeBlock({ code, language }: CodeBlockProps): ReactElement {
  const [copied, setCopied] = useState(false);
  const parsed = useMemo(() => {
    if (language !== undefined) return { language, code };
    return parseCodeBlock(code);
  }, [code, language]);

  const codeLines = useMemo(() => parsed.code.split("\n"), [parsed.code]);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(parsed.code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }, [parsed.code]);

  return (
    <div className={styles.wrap}>
      <div className={styles.header}>
        <span className={styles.language}>{parsed.language || "text"}</span>
        <button className={styles.copyBtn} onClick={handleCopy} title="Copy code">
          {copied
            ? <><Check size={13} strokeWidth={1.5} /><span>Copied</span></>
            : <><Copy size={13} strokeWidth={1.5} /><span>Copy</span></>}
        </button>
      </div>
      <pre className={styles.pre}>
        <code>{codeLines.map((line, i) => (
          <span key={i} className={styles.line}>
            <span className={styles.lineNum}>{i + 1}</span>
            {line}
            {i < codeLines.length - 1 ? "\n" : ""}
          </span>
        ))}</code>
      </pre>
    </div>
  );
});

export default CodeBlock;
