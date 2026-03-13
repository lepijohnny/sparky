import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { emit } from "@tauri-apps/api/event";
import { Check, Loader2, Package, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useStore } from "../../store";
import styles from "./SplashScreen.module.css";

interface Dependency {
  name: string;
  id: string;
  status: "installed" | "missing" | "installing" | "done" | "error";
  message?: string;
  progress?: number;
}

interface ModelStatus {
  name: string;
  filename: string;
  present: boolean;
  size_bytes: number;
}

const AUTO_CONTINUE_MS = 2000;

export default function SplashScreen() {
  const [hidden, setHidden] = useState(false);
  const [deps, setDeps] = useState<Dependency[]>([]);
  const [installing, setInstalling] = useState(false);
  const [modelsReady, setModelsReady] = useState(false);
  const booted = useStore((s) => s.booted);

  const dismissPreload = useCallback(() => {
    const preload = document.getElementById("preload");
    if (!preload) return;
    preload.style.opacity = "0";
    preload.style.pointerEvents = "none";
    setTimeout(() => preload.remove(), 600);
  }, []);

  useEffect(() => {
    if (!booted || !modelsReady) return;
    emit("show-window");
    dismissPreload();
  }, [booted, modelsReady]);



  useEffect(() => {
    invoke<ModelStatus[]>("check_models").then((modelResult) => {
      const items: Dependency[] = [];
      const embed = modelResult.find((m) => m.name === "embed");
      if (embed) {
        items.push({
          id: "embed",
          name: "Embedding Model",
          status: embed.present ? "installed" : "missing",
        });
      }

      if (items.length === 0 || items.every((d) => d.status === "installed")) {
        setDeps(items);
        setModelsReady(true);
      } else {
        setDeps(items);
        emit("show-window");
      }
    }).catch(() => { setModelsReady(true); });
  }, []);



  useEffect(() => {
    const unlisten = listen<{ filename: string; downloaded: number; total: number }>("models:progress", (event) => {
      const { downloaded, total } = event.payload;
      const pct = total > 0 ? Math.round((downloaded / total) * 100) : 0;
      setDeps((prev) => prev.map((d) =>
        d.id === "embed" ? { ...d, status: "installing" as const, progress: pct } : d
      ));
    });
    return () => { unlisten.then((fn) => fn()); };
  }, []);

  useEffect(() => {
    const unlisten = listen("models:complete", () => {
      setDeps((prev) => prev.map((d) =>
        d.id === "embed" ? { ...d, status: "done" as const, progress: 100 } : d
      ));
    });
    return () => { unlisten.then((fn) => fn()); };
  }, []);

  useEffect(() => {
    const allReady = deps.length > 0 && deps.every((d) => d.status === "installed" || d.status === "done");
    if (!allReady || !installing) return;
    setModelsReady(true);
    setHidden(true);
  }, [deps, installing]);

  const handleInstall = useCallback(async () => {
    setInstalling(true);
    const embedDep = deps.find((d) => d.id === "embed");
    const needsEmbed = embedDep?.status === "missing" || embedDep?.status === "error";

    if (needsEmbed) {
      setDeps((prev) => prev.map((d) => d.id === "embed" ? { ...d, status: "installing" as const, progress: 0 } : d));
      try {
        const models = await invoke<ModelStatus[]>("check_models");
        const embed = models.find((m) => m.name === "embed");
        if (embed && !embed.present) {
          await invoke("download_models", { filenames: [embed.filename] });
        } else {
          setDeps((prev) => prev.map((d) => d.id === "embed" ? { ...d, status: "done" as const, progress: 100 } : d));
        }
      } catch (err) {
        setDeps((prev) => prev.map((d) => d.id === "embed" ? { ...d, status: "error" as const, message: String(err) } : d));
      }
    }
  }, [deps]);

  const handleQuit = useCallback(() => {
    document.body.style.opacity = "0";
    setTimeout(() => invoke("quit_app"), 200);
  }, []);

  if (hidden) return null;

  const hasMissing = deps.some((d) => d.status === "missing");
  const hasError = deps.some((d) => d.status === "error");
  const showDeps = deps.length > 0 && (hasMissing || installing || hasError);

  if (!showDeps) return null;

  return (
    <div className={styles.overlay}>
      <div className={styles.content}>
        <div className={styles.deps}>
          <div className={styles.depsLabel}>Setup</div>
          <div className={styles.depCards}>
            {deps.map((dep) => (
              <DepCard key={dep.id} dep={dep} />
            ))}
          </div>

          {installing && deps.some((d) => d.status === "installing") && (
            <div className={styles.progressBar}>
              <div
                className={styles.progressFill}
                style={{ width: `${deps.find((d) => d.status === "installing")?.progress ?? 0}%` }}
              />
            </div>
          )}

          {!installing && (hasMissing || hasError) && (
            <div className={styles.actions}>
              <button type="button" className={styles.installBtn} onClick={handleInstall}>
                {hasError ? "Retry" : "Install"}
              </button>
              <button type="button" className={styles.quitBtn} onClick={handleQuit}>
                Quit
              </button>
            </div>
          )}

          {deps.filter((d) => d.status === "error" && d.message).map((d) => (
            <div key={d.id} className={styles.errorMsg}>{d.message}</div>
          ))}
        </div>
      </div>
    </div>
  );
}

function DepCard({ dep }: { dep: Dependency }) {
  const isOk = dep.status === "installed" || dep.status === "done";
  const isErr = dep.status === "error";

  return (
    <div className={`${styles.depCard} ${isOk ? styles.depDone : ""} ${isErr ? styles.depError : ""}`}>
      <div className={styles.depIcon}>
        {isOk && <Check size={14} />}
        {isErr && <X size={14} />}
        {dep.status === "missing" && <Package size={14} />}
        {dep.status === "installing" && <Loader2 size={14} className={styles.depSpinner} />}
      </div>
      <span>{dep.name}</span>
    </div>
  );
}
