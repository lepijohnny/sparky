import { Check, Copy } from "lucide-react";
import { memo, type ReactElement, useCallback, useMemo, useState } from "react";
import { highlight } from "../../lib/highlight.hljs";
import styles from "./CodeBlock.module.css";
import "./CodeBlock.highlight.css";

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

function diffLineClass(line: string): string {
  if (line.startsWith("+++") || line.startsWith("---")) return styles.diffMeta;
  if (line.startsWith("@@")) return styles.diffHunk;
  if (line.startsWith("+")) return styles.diffAdd;
  if (line.startsWith("-")) return styles.diffDel;
  return "";
}

const CodeBlock = memo(function CodeBlock({ code, language }: CodeBlockProps): ReactElement {
  const [copied, setCopied] = useState(false);
  const parsed = useMemo(() => {
    if (language !== undefined) return { language, code };
    return parseCodeBlock(code);
  }, [code, language]);

  const isDiff = parsed.language === "diff";
  const codeLines = useMemo(() => parsed.code.split("\n"), [parsed.code]);

  const highlighted = useMemo(() => {
    if (isDiff) return null;
    return highlight(parsed.code, parsed.language);
  }, [parsed.code, parsed.language, isDiff]);

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
      {highlighted ? (
        <pre className={styles.pre}>
          <code>
            {highlighted.split("\n").map((line, i, arr) => (
              <span key={i} className={styles.line}>
                <span className={styles.lineNum}>{i + 1}</span>
                <span dangerouslySetInnerHTML={{ __html: line }} />
                {i < arr.length - 1 ? "\n" : ""}
              </span>
            ))}
          </code>
        </pre>
      ) : (
        <pre className={styles.pre}>
          <code>{codeLines.map((line, i) => (
            <span key={i} className={`${styles.line} ${isDiff ? diffLineClass(line) : ""}`}>
              {!isDiff && <span className={styles.lineNum}>{i + 1}</span>}
              {line}
              {i < codeLines.length - 1 ? "\n" : ""}
            </span>
          ))}</code>
        </pre>
      )}
    </div>
  );
});

export default CodeBlock;
