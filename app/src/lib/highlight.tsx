import { Fragment } from "react";

/**
 * Splits text by search terms and wraps matches in <mark> elements.
 * Returns the original string if no query is provided.
 */
export function highlightText(text: string, query: string | undefined): React.ReactNode {
  if (!query || !query.trim()) return text;

  const terms = query
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter((t) => t.length > 1);
  if (terms.length === 0) return text;

  const pattern = new RegExp(`(${terms.map(escapeRegex).join("|")})`, "gi");
  const parts = text.split(pattern);
  if (parts.length === 1) return text;

  return (
    <>
      {parts.map((part, i) =>
        pattern.test(part) ? (
          <mark key={i} style={{ background: "var(--highlight)", color: "inherit", borderRadius: 2, padding: "0 1px" }}>
            {part}
          </mark>
        ) : (
          <Fragment key={i}>{part}</Fragment>
        ),
      )}
    </>
  );
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
