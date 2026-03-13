import { ChevronDown, ChevronRight, FileText, Package } from "lucide-react";
import { useCallback, useRef, useState } from "react";
import { useConnection } from "../../context/ConnectionContext";
import { useWsRequest } from "../../hooks/useWsRequest";
import shared from "../../styles/shared.module.css";
import type { InstalledExtractor, ExtractorOption } from "../../types/extractor";
import styles from "./ExtractorsDetailsPage.module.css";

function OptionControl({
  opt,
  value,
  onChange,
}: {
  opt: ExtractorOption;
  value: unknown;
  onChange: (key: string, val: unknown) => void;
}) {
  const current = value ?? opt.default;

  switch (opt.type) {
    case "boolean":
      return (
        <div className={shared.cardBodyRow}>
          <div className={shared.fieldText}>
            <label className={shared.fieldLabel}>{opt.label}</label>
            {opt.description && <p className={shared.fieldHint}>{opt.description}</p>}
          </div>
          <input
            type="checkbox"
            checked={current as boolean}
            onChange={(e) => onChange(opt.key, e.target.checked)}
          />
        </div>
      );
    case "number":
      return (
        <div className={shared.cardBodyRow}>
          <div className={shared.fieldText}>
            <label className={shared.fieldLabel}>{opt.label}</label>
            {opt.description && <p className={shared.fieldHint}>{opt.description}</p>}
          </div>
          <input
            type="number"
            className={styles.numberInput}
            value={current as number}
            min={opt.min}
            max={opt.max}
            step={opt.step}
            onChange={(e) => onChange(opt.key, Number(e.target.value))}
          />
        </div>
      );
    case "string":
      return (
        <div className={shared.cardBodyRow}>
          <div className={shared.fieldText}>
            <label className={shared.fieldLabel}>{opt.label}</label>
            {opt.description && <p className={shared.fieldHint}>{opt.description}</p>}
          </div>
          <input
            type="text"
            className={styles.textInput}
            value={current as string}
            placeholder={opt.placeholder}
            onChange={(e) => onChange(opt.key, e.target.value)}
          />
        </div>
      );
    case "select":
      return (
        <div className={shared.cardBodyRow}>
          <div className={shared.fieldText}>
            <label className={shared.fieldLabel}>{opt.label}</label>
            {opt.description && <p className={shared.fieldHint}>{opt.description}</p>}
          </div>
          <select
            className={styles.selectInput}
            value={current as string}
            onChange={(e) => onChange(opt.key, e.target.value)}
          >
            {opt.choices?.map((c) => (
              <option key={c.value} value={c.value}>{c.label}</option>
            ))}
          </select>
        </div>
      );
  }
}

function ExtractorCard({ extractor }: { extractor: InstalledExtractor }) {
  const { conn } = useConnection();
  const [expanded, setExpanded] = useState(false);
  const [values, setValues] = useState<Record<string, unknown>>({});
  const [loaded, setLoaded] = useState(false);
  const hasOptions = extractor.options.length > 0;
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadOptions = useCallback(async () => {
    if (loaded || !conn) return;
    const res = await conn.request<{ options: Record<string, unknown> }>("extractors.options.get", { name: extractor.name });
    if (res?.options) setValues(res.options);
    setLoaded(true);
  }, [extractor.name, loaded, conn]);

  const handleToggle = useCallback(() => {
    const next = !expanded;
    setExpanded(next);
    if (next && hasOptions) loadOptions();
  }, [expanded, hasOptions, loadOptions]);

  const handleChange = useCallback((key: string, val: unknown) => {
    if (!conn) return;
    setValues((prev) => {
      const next = { ...prev, [key]: val };
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => {
        conn.request("extractors.options.set", { name: extractor.name, options: next });
      }, 500);
      return next;
    });
  }, [extractor.name, conn]);

  const extensions = extractor.extensions.length > 0
    ? extractor.extensions.join(", ")
    : "";

  return (
    <div className={shared.card}>
      <div
        className={`${styles.extractorHeader} ${styles.clickable}`}
        onClick={handleToggle}
      >
        <div className={styles.headerLeft}>
          {expanded
            ? <ChevronDown size={14} className={styles.chevron} />
            : <ChevronRight size={14} className={styles.chevron} />
          }
          {extractor.builtIn
            ? <FileText size={16} className={styles.icon} />
            : <Package size={16} className={styles.icon} />
          }
          <div className={styles.headerInfo}>
            <span className={styles.extractorName}>{extractor.name}</span>
            {extensions && <span className={styles.extensions}>{extensions}</span>}
          </div>
        </div>
        <span className={styles.version}>{extractor.version}</span>
      </div>

      {expanded && (
        <div className={styles.extractorBody}>
          {extractor.description && (
            <div className={styles.descriptionRow}>
              <p className={shared.fieldHint}>{extractor.description}</p>
            </div>
          )}
          {extractor.options.map((opt) => (
            <OptionControl
              key={opt.key}
              opt={opt}
              value={values[opt.key]}
              onChange={handleChange}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default function ExtractorsDetailsPage() {
  const { conn } = useConnection();
  const { data } = useWsRequest<{ extractors: InstalledExtractor[] }>(conn, "extractors.list");
  const extractors = data?.extractors ?? [];

  return (
    <div className={shared.contentArea}>
      <div className={shared.card}>
        <div className={shared.cardHeader}>Installed Extractors</div>
        <div className={shared.cardBody}>
          {extractors.length === 0 ? (
            <div className={shared.emptyState}>
              No extractors found. Built-in extractors for .md and .txt are loaded automatically.
            </div>
          ) : (
            <div className={styles.extractorList}>
              {extractors.map((e) => (
                <ExtractorCard key={e.name} extractor={e} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
