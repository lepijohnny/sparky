import { memo, useMemo } from "react";
import { renderMermaidSVG } from "beautiful-mermaid";
import styles from "./MermaidBlock.module.css";

function renderMermaidThemed(code: string) {
  const cs = getComputedStyle(document.documentElement);
  const bg = cs.getPropertyValue("--bg").trim() || "#1e1e2e";
  const fg = cs.getPropertyValue("--fg").trim() || "#cdd6f4";
  const muted = cs.getPropertyValue("--fg-muted").trim() || "#6c7086";
  const theme = {
    bg,
    fg,
    accent: cs.getPropertyValue("--accent").trim() || "#fab387",
    muted,
    line: muted,
    border: muted,
    surface: cs.getPropertyValue("--bg-surface").trim() || "#313244",
    transparent: true,
  };
  try {
    const svg = renderMermaidSVG(code, theme);
    return { svg, error: null as string | null };
  } catch (err) {
    return { svg: null, error: err instanceof Error ? err.message : String(err) };
  }
}

const MermaidBlock = memo(function MermaidBlock({ code }: { code: string; inline?: boolean }) {
  const entry = useMemo(() => renderMermaidThemed(code), [code]);

  if (entry.error) {
    return (
      <pre className={styles.error}>
        <code>{code}</code>
      </pre>
    );
  }

  return (
    <div
      className={styles.rendered}
      dangerouslySetInnerHTML={{ __html: entry.svg! }}
    />
  );
});

export default MermaidBlock;
