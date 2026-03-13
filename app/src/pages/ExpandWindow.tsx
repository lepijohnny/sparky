import { Check, Download, ListTree, Minus, Plus } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import MermaidBlock from "../components/chat/MermaidBlock";
import ChartBlock from "../components/chat/ChartBlock";
import SortableTable, { parseTable } from "../components/chat/SortableTable";
import katex from "katex";
import "katex/dist/katex.min.css";
import styles from "./ExpandWindow.module.css";

interface ExpandWindowProps {
  storageKey: string;
}

/**
 * Inline all computed styles into an SVG clone so the exported PNG
 * renders correctly without access to CSS variables or stylesheets.
 */
function inlineSvgStyles(source: SVGElement, clone: SVGElement) {
  const sourceEls = source.querySelectorAll("*");
  const cloneEls = clone.querySelectorAll("*");
  for (let i = 0; i < sourceEls.length; i++) {
    const cs = getComputedStyle(sourceEls[i]);
    const target = cloneEls[i] as SVGElement | HTMLElement;
    if (!target) continue;
    target.setAttribute("style",
      `fill:${cs.fill};stroke:${cs.stroke};stroke-width:${cs.strokeWidth};` +
      `font-family:${cs.fontFamily};font-size:${cs.fontSize};font-weight:${cs.fontWeight};` +
      `color:${cs.color};opacity:${cs.opacity}`
    );
  }
}

async function elementToPngBlob(el: HTMLElement): Promise<Blob | null> {
  const svg = el.querySelector("svg");
  if (svg) {
    const clone = svg.cloneNode(true) as SVGElement;
    const rect = svg.getBoundingClientRect();
    inlineSvgStyles(svg, clone);
    clone.setAttribute("width", String(rect.width * 2));
    clone.setAttribute("height", String(rect.height * 2));
    const bg = getComputedStyle(document.documentElement).getPropertyValue("--bg").trim();
    if (bg) {
      const bgRect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
      bgRect.setAttribute("width", "100%");
      bgRect.setAttribute("height", "100%");
      bgRect.setAttribute("fill", bg);
      clone.insertBefore(bgRect, clone.firstChild);
    }
    const xml = new XMLSerializer().serializeToString(clone);
    const blob = new Blob([xml], { type: "image/svg+xml" });
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.src = url;
    await new Promise((r) => { img.onload = r; });
    const canvas = document.createElement("canvas");
    canvas.width = rect.width * 2;
    canvas.height = rect.height * 2;
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(img, 0, 0);
    URL.revokeObjectURL(url);
    return new Promise((r) => canvas.toBlob(r, "image/png"));
  }

  const { default: html2canvas } = await import("html2canvas");
  const canvas = await html2canvas(el, {
    backgroundColor: getComputedStyle(document.documentElement).getPropertyValue("--bg").trim() || null,
    scale: 2,
  });
  return new Promise((r) => canvas.toBlob(r, "image/png"));
}

async function saveBlob(blob: Blob, defaultName: string, filterName: string, ext: string) {
  if (window.__TAURI_INTERNALS__) {
    try {
      const { save } = await import("@tauri-apps/plugin-dialog");
      const { writeFile } = await import("@tauri-apps/plugin-fs");
      const path = await save({
        defaultPath: defaultName,
        filters: [{ name: filterName, extensions: [ext] }],
      });
      if (path) {
        const buf = await blob.arrayBuffer();
        await writeFile(path, new Uint8Array(buf));
      }
      return;
    } catch { /* fall through */ }
  }
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = defaultName;
  a.click();
  URL.revokeObjectURL(a.href);
}

function tableToCsv(content: string): string {
  const { headers, rows } = parseTable(content);
  const escape = (v: string) => v.includes(",") || v.includes('"') ? `"${v.replace(/"/g, '""')}"` : v;
  const lines = [headers.map(escape).join(",")];
  for (const row of rows) lines.push(row.map(escape).join(","));
  return lines.join("\n");
}

const ZOOM_STEP = 25;
const ZOOM_MIN = 25;
const ZOOM_MAX = 300;

function GroupByMenu({ headers, groupCol, onGroup }: {
  headers: string[];
  groupCol: number | null;
  onGroup: (col: number | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const id = setTimeout(() => document.addEventListener("mousedown", handler), 0);
    return () => { clearTimeout(id); document.removeEventListener("mousedown", handler); };
  }, [open]);

  return (
    <div className={styles.menuWrap} ref={ref}>
      <button
        className={`${styles.groupBtn} ${groupCol !== null ? styles.groupBtnActive : ""}`}
        onClick={() => setOpen(!open)}
        title="Group by"
      >
        <ListTree size={14} strokeWidth={1.5} />
      </button>
      {open && (
        <div className={styles.menu}>
          <div
            className={styles.menuItem}
            onClick={() => { onGroup(null); setOpen(false); }}
          >
            <span>None</span>
            {groupCol === null && <Check size={12} strokeWidth={2} />}
          </div>
          {headers.map((h, i) => (
            <div
              key={i}
              className={styles.menuItem}
              onClick={() => { onGroup(i); setOpen(false); }}
            >
              <span>{h}</span>
              {groupCol === i && <Check size={12} strokeWidth={2} />}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function ExpandWindow({ storageKey }: ExpandWindowProps) {
  const [data, setData] = useState<{ type: string; content: string } | null>(null);
  const [zoom, setZoom] = useState(100);
  const [groupCol, setGroupCol] = useState<number | null>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  const tableHeaders = useMemo(() => {
    if (data?.type !== "table") return [];
    return parseTable(data.content).headers;
  }, [data]);

  useEffect(() => {
    const raw = localStorage.getItem(storageKey);
    if (raw) {
      try { setData(JSON.parse(raw)); } catch { /* ignore */ }
      localStorage.removeItem(storageKey);
    }
  }, [storageKey]);

  const handleSavePng = useCallback(async () => {
    if (!contentRef.current || !data) return;
    const blob = await elementToPngBlob(contentRef.current);
    if (blob) await saveBlob(blob, data.type === "mermaid" ? "diagram.png" : "equation.png", "PNG Image", "png");
  }, [data]);

  const handleSaveCsv = useCallback(async () => {
    if (!data) return;
    const csv = tableToCsv(data.content);
    const blob = new Blob([csv], { type: "text/csv" });
    await saveBlob(blob, "table.csv", "CSV File", "csv");
  }, [data]);

  const handleZoomIn = useCallback(() => setZoom((z) => Math.min(z + ZOOM_STEP, ZOOM_MAX)), []);
  const handleZoomOut = useCallback(() => setZoom((z) => Math.max(z - ZOOM_STEP, ZOOM_MIN)), []);

  const rendered = useMemo(() => {
    if (!data) return null;
    switch (data.type) {
      case "mermaid":
        return <MermaidBlock code={data.content} inline />;
      case "latex": {
        try {
          const html = katex.renderToString(data.content, { displayMode: true, throwOnError: false });
          return <div className={styles.latex} dangerouslySetInnerHTML={{ __html: html }} />;
        } catch {
          return <pre>{data.content}</pre>;
        }
      }
      case "chart":
        return null;
      default:
        return <pre>{data.content}</pre>;
    }
  }, [data]);

  const isTable = data?.type === "table";
  const isChart = data?.type === "chart";
  const isFullWidth = isTable || isChart;
  const hasPngSave = data?.type === "mermaid" || data?.type === "latex";

  return (
    <div className={isFullWidth ? styles.windowTop : styles.window}>
      <div className={isFullWidth ? styles.contentWrapFull : styles.contentWrap}>
        <div className={styles.toolbar}>
          {isTable ? (
            <>
              <GroupByMenu headers={tableHeaders} groupCol={groupCol} onGroup={setGroupCol} />
              <button className={styles.csvBtn} onClick={handleSaveCsv} title="Save as CSV">
                <Download size={13} strokeWidth={1.5} />
                Save as CSV
              </button>
            </>
          ) : isChart ? (
            <div className={styles.pill}>
              <button className={styles.btn} onClick={handleSavePng} title="Save as PNG">
                <Download size={14} strokeWidth={1.5} />
              </button>
            </div>
          ) : (
            <>
              <div className={styles.pill}>
                <button className={styles.btn} onClick={handleZoomOut} title="Zoom out">
                  <Minus size={14} strokeWidth={1.5} />
                </button>
                <span className={styles.zoomLabel}>{zoom}%</span>
                <button className={styles.btn} onClick={handleZoomIn} title="Zoom in">
                  <Plus size={14} strokeWidth={1.5} />
                </button>
              </div>
              {hasPngSave && (
                <div className={styles.pill}>
                  <button className={styles.btn} onClick={handleSavePng} title="Save as PNG">
                    <Download size={14} strokeWidth={1.5} />
                  </button>
                </div>
              )}
            </>
          )}
        </div>
        <div ref={contentRef} style={!isFullWidth ? { zoom: zoom / 100 } : undefined} className={isChart ? styles.chartFill : undefined}>
          {isChart
            ? <ChartBlock code={data!.content} />
            : isTable
              ? <SortableTable content={data!.content} groupCol={groupCol} />
              : rendered ?? <span className={styles.message}>Loading…</span>
          }
        </div>
      </div>
    </div>
  );
}
