import { useCallback, useEffect, useRef, useState } from "react";
import { useConnection } from "../../context/ConnectionContext";
import { useWsRequest } from "../../hooks/useWsRequest";
import shared from "../../styles/shared.module.css";
import styles from "./ConvertersDetailsPage.module.css";

interface ConverterSettings {
  maxOutputChars: number;
  urlMaxDepth: number;
  urlMaxPages: number;
  urlRespectRobots: boolean;
}

export default function ConvertersDetailsPage() {
  const { conn } = useConnection();
  const { data } = useWsRequest<{ settings: ConverterSettings }>(conn, "settings.converter.get", undefined, []);

  const [maxOutputChars, setMaxOutputChars] = useState(100000);
  const [urlMaxDepth, setUrlMaxDepth] = useState(3);
  const [urlMaxPages, setUrlMaxPages] = useState(200);
  const [urlRespectRobots, setUrlRespectRobots] = useState(true);
  const initialized = useRef(false);

  useEffect(() => {
    if (!data || initialized.current) return;
    initialized.current = true;
    setMaxOutputChars(data.settings.maxOutputChars);
    setUrlMaxDepth(data.settings.urlMaxDepth);
    setUrlMaxPages(data.settings.urlMaxPages);
    setUrlRespectRobots(data.settings.urlRespectRobots);
  }, [data]);

  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const save = useCallback((updates: Partial<ConverterSettings>) => {
    if (!conn) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      conn.request("settings.converter.set", updates);
    }, 500);
  }, [conn]);

  return (
    <div className={shared.contentArea}>
      <div className={shared.card}>
        <div className={shared.cardHeader}>Document</div>
        <div className={shared.cardBody}>
          <div className={shared.cardBodyRow}>
            <div className={shared.fieldText}>
              <label className={shared.fieldLabel}>Max output size</label>
              <p className={shared.fieldHint}>
                Maximum characters for converted documents in chat. Larger documents should be added to the Knowledge Base instead.
              </p>
            </div>
            <div className={styles.rangeGroup}>
              <input
                className={styles.range}
                type="range"
                min={10000}
                max={200000}
                step={10000}
                value={maxOutputChars}
                onChange={(e) => {
                  const val = Number(e.target.value);
                  setMaxOutputChars(val);
                  save({ maxOutputChars: val });
                }}
              />
              <span className={styles.rangeValue}>{(maxOutputChars / 1000).toFixed(0)}K</span>
            </div>
          </div>
        </div>
      </div>

      <div className={shared.card}>
        <div className={shared.cardHeader}>URL</div>
        <div className={shared.cardBody}>
          <div className={shared.cardBodyRow}>
            <div className={shared.fieldText}>
              <label className={shared.fieldLabel}>Respect robots.txt</label>
              <p className={shared.fieldHint}>
                Follow Disallow rules and Crawl-delay from the site's robots.txt.
              </p>
            </div>
            <label className={styles.toggle}>
              <input
                type="checkbox"
                checked={urlRespectRobots}
                onChange={(e) => {
                  setUrlRespectRobots(e.target.checked);
                  save({ urlRespectRobots: e.target.checked });
                }}
              />
              <span className={styles.toggleSlider} />
            </label>
          </div>

          <div className={shared.cardBodyRow}>
            <div className={shared.fieldText}>
              <label className={shared.fieldLabel}>Max crawl depth</label>
              <p className={shared.fieldHint}>
                How many links deep to follow from the starting URL.
              </p>
            </div>
            <div className={styles.rangeGroup}>
              <input
                className={styles.range}
                type="range"
                min={1}
                max={10}
                step={1}
                value={urlMaxDepth}
                onChange={(e) => {
                  const val = Number(e.target.value);
                  setUrlMaxDepth(val);
                  save({ urlMaxDepth: val });
                }}
              />
              <span className={styles.rangeValue}>{urlMaxDepth}</span>
            </div>
          </div>

          <div className={shared.cardBodyRow}>
            <div className={shared.fieldText}>
              <label className={shared.fieldLabel}>Max pages</label>
              <p className={shared.fieldHint}>
                Maximum number of pages to crawl per URL source.
              </p>
            </div>
            <div className={styles.rangeGroup}>
              <input
                className={styles.range}
                type="range"
                min={10}
                max={500}
                step={10}
                value={urlMaxPages}
                onChange={(e) => {
                  const val = Number(e.target.value);
                  setUrlMaxPages(val);
                  save({ urlMaxPages: val });
                }}
              />
              <span className={styles.rangeValue}>{urlMaxPages}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
