import { memo, useCallback, useMemo, useState } from "react";
import styles from "./SortableTable.module.css";

interface SortableTableProps {
  content: string;
  groupCol?: number | null;
}

export function parseTable(content: string): { headers: string[]; rows: string[][] } {
  const lines = content.trim().split("\n").filter((l) => l.trim());
  if (lines.length < 2) return { headers: [], rows: [] };

  const parseRow = (line: string): string[] =>
    line.split("|").slice(1, -1).map((cell) => cell.trim());

  const stripBold = (text: string): string =>
    text.replace(/\*\*(.+?)\*\*/g, "$1");

  const headers = parseRow(lines[0]).map(stripBold);
  const rows: string[][] = [];

  for (let i = 1; i < lines.length; i++) {
    if (/^\|[\s:-]+(\|[\s:-]+)+\|$/.test(lines[i].trim())) continue;
    rows.push(parseRow(lines[i]));
  }

  return { headers, rows };
}

function inlineMarkdown(text: string): string {
  let html = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/`(.+?)`/g, "<code>$1</code>");
  return html;
}

function compareValues(a: string, b: string): number {
  const numA = Number(a.replace(/[,%$€£¥]/g, ""));
  const numB = Number(b.replace(/[,%$€£¥]/g, ""));
  if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
  return a.localeCompare(b);
}

export default memo(function SortableTable({ content, groupCol = null }: SortableTableProps) {
  const { headers, rows } = useMemo(() => parseTable(content), [content]);
  const [sortCol, setSortCol] = useState<number | null>(null);
  const [sortAsc, setSortAsc] = useState(true);

  const handleSort = useCallback((col: number) => {
    setSortCol((prev) => {
      if (prev === col) {
        if (sortAsc) {
          setSortAsc(false);
          return col;
        }
        setSortAsc(true);
        return null;
      }
      setSortAsc(true);
      return col;
    });
  }, [sortAsc]);

  const sorted = useMemo(() => {
    if (sortCol === null) return rows;
    return [...rows].sort((a, b) => {
      const cmp = compareValues(a[sortCol] ?? "", b[sortCol] ?? "");
      return sortAsc ? cmp : -cmp;
    });
  }, [rows, sortCol, sortAsc]);

  const grouped = useMemo(() => {
    if (groupCol === null) return null;
    const groups = new Map<string, string[][]>();
    for (const row of sorted) {
      const key = row[groupCol] ?? "";
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(row);
    }
    return groups;
  }, [sorted, groupCol]);

  if (headers.length === 0) return null;

  const renderRows = (rowSet: string[][]) =>
    rowSet.map((row, ri) => (
      <tr key={ri} className={styles.row}>
        {row.map((cell, ci) => (
          <td key={ci} className={styles.td} dangerouslySetInnerHTML={{ __html: inlineMarkdown(cell) }} />
        ))}
      </tr>
    ));

  return (
    <div className={styles.wrap}>
      <table className={styles.table}>
        <thead>
          <tr>
            {headers.map((h, i) => (
              <th key={i} className={styles.th} onClick={() => handleSort(i)}>
                <span className={styles.thContent}>
                  {h}
                  {sortCol === i && (
                    <span className={styles.arrow}>{sortAsc ? "↑" : "↓"}</span>
                  )}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        {grouped ? (
          Array.from(grouped.entries()).map(([key, groupRows]) => (
            <tbody key={key}>
              <tr>
                <td colSpan={headers.length} className={styles.groupHeader}>
                  {headers[groupCol!]}: {key} ({groupRows.length})
                </td>
              </tr>
              {renderRows(groupRows)}
            </tbody>
          ))
        ) : (
          <tbody>{renderRows(sorted)}</tbody>
        )}
      </table>
    </div>
  );
});
