import { Clock, ExternalLink, Play, Sparkles, Trash2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useConnection } from "../../context/ConnectionContext";
import { useToasts } from "../../context/ToastContext";
import { useStore } from "../../store";
import type { RoutineRun } from "../../store/routines";
import sharedStyles from "../../styles/shared.module.css";
import styles from "./RoutinesDetailsPage.module.css";

interface RoutineAction {
  type: "chat" | "archive" | "flag" | "label";
  prompt?: string;
  provider?: string;
  model?: string;
  [key: string]: unknown;
}

interface Routine {
  id: string;
  name: string;
  description?: string;
  cron: string;
  once?: boolean;
  action: RoutineAction;
  enabled: boolean;
  lastRun?: string;
  nextRun?: string;
  createdAt: string;
}

interface RoutinesDetailsPageProps {
  routineId: string;
  onOpenChat?: (chatId: string) => void;
  onEditAssistant?: (routine: Routine) => void;
  onDeleted?: () => void;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

export default function RoutinesDetailsPage({ routineId, onOpenChat, onEditAssistant, onDeleted }: RoutinesDetailsPageProps) {
  const { conn } = useConnection();
  const { addToast } = useToasts();
  const routines = useStore((s) => s.routines);
  const routine = routines.find((r) => r.id === routineId) as (Routine & { action: RoutineAction }) | undefined ?? null;
  const runs = useStore((s) => s.routineRuns[routineId] ?? []) as RoutineRun[];

  const [draft, setDraft] = useState(() =>
    routine?.action?.type === "chat" ? routine.action.prompt ?? "" : ""
  );
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const prevIdRef = useRef(routineId);

  if (prevIdRef.current !== routineId) {
    prevIdRef.current = routineId;
    const prompt = routine?.action?.type === "chat" ? routine.action.prompt ?? "" : "";
    if (draft !== prompt) setDraft(prompt);
  }

  const handleToggle = useCallback(async () => {
    if (!conn || !routine) return;
    await conn.request("routine.toggle", { id: routine.id, enabled: !routine.enabled });
  }, [conn, routine]);

  const handleRunNow = useCallback(async () => {
    if (!conn || !routine) return;
    try {
      await conn.request("routine.run", { id: routine.id });
      addToast({ id: `run_${Date.now()}`, kind: "info", title: `Running "${routine.name}"` });
    } catch (err: any) {
      addToast({ id: `run_err_${Date.now()}`, kind: "error", title: err?.message ?? "Failed" });
    }
  }, [conn, routine, addToast]);

  const handleDelete = useCallback(async () => {
    if (!conn || !routine) return;
    await conn.request("routine.delete", { id: routine.id });
    onDeleted?.();
  }, [conn, routine, onDeleted]);

  const handleSavePrompt = useCallback(async () => {
    if (!conn || !routine || !draft.trim() || draft === routine.action.prompt) return;
    await conn.request("routine.update", {
      id: routine.id,
      action: { ...routine.action, prompt: draft.trim() },
    });
  }, [conn, routine, draft]);

  if (!routine) {
    return <div className={sharedStyles.contentArea}><div className={sharedStyles.emptyState}>Loading…</div></div>;
  }

  return (
    <div className={sharedStyles.contentArea}>
      <div className={styles.header}>
        <div className={styles.headerInfo}>
          <div className={styles.titleRow}>
            <h2 className={styles.title}>{routine.name}</h2>
            {onEditAssistant && (
              <button
                className={styles.sparkBtn}
                onClick={() => onEditAssistant(routine)}
                title="Edit with assistant"
              >
                <Sparkles size={14} strokeWidth={1.5} className={sharedStyles.sparkle} />
              </button>
            )}
          </div>
          {routine.description && <p className={styles.description}>{routine.description}</p>}
        </div>
        <button
          className={`${styles.toggle} ${routine.enabled ? styles.on : ""}`}
          onClick={handleToggle}
          title={routine.enabled ? "Pause" : "Enable"}
        >
          <div className={styles.toggleKnob} />
        </button>
      </div>

      {/* Schedule */}
      <div className={sharedStyles.card}>
        <div className={sharedStyles.cardHeader}>
          <div className={styles.cardHeaderLeft}>
            <Clock size={14} strokeWidth={1.5} />
            Schedule
          </div>
          <div className={styles.cardHeaderRight}>
            <button className={styles.headerBtn} onClick={handleRunNow} disabled={!routine.enabled} title="Run now">
              <Play size={12} strokeWidth={1.5} /> Run
            </button>
            <button className={`${styles.headerBtn} ${styles.headerBtnDanger}`} onClick={handleDelete} title="Delete routine">
              <Trash2 size={12} strokeWidth={1.5} /> Delete
            </button>
          </div>
        </div>
        <div className={sharedStyles.cardBody}>
          <div className={styles.scheduleRow}>
            <span className={styles.cronValue}>{routine.cron}</span>
            {routine.once && <span className={styles.badge}>One-time</span>}
          </div>
          {routine.nextRun && (
            <div className={styles.nextRun}>Next run: {formatDate(routine.nextRun)}</div>
          )}
        </div>
      </div>

      {/* Action */}
      <div className={`${sharedStyles.card} ${styles.actionCard}`}>
        <div className={sharedStyles.cardHeader}>
          <div className={styles.cardHeaderLeft}>Action</div>
        </div>
        <div className={styles.actionBody}>
          <div className={styles.actionType}>{routine.action.type}</div>
          {routine.action.type === "chat" && routine.action.prompt && (
            <textarea
              ref={textareaRef}
              className={styles.promptTextarea}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); handleSavePrompt(); }
                if (e.key === "Escape") { setDraft(routine.action.prompt ?? ""); }
              }}
              rows={6}
            />
          )}
          {routine.action.model && (
            <div className={styles.model}>{routine.action.model}</div>
          )}
        </div>
        {routine.action.type === "chat" && routine.action.prompt && (
          <div className={styles.promptActions}>
            <button className={styles.headerBtn} onClick={() => setDraft(routine.action.prompt ?? "")}>Cancel</button>
            <button
              className={`${styles.headerBtn} ${styles.headerBtnSave}`}
              disabled={!draft.trim() || draft === routine.action.prompt}
              onClick={handleSavePrompt}
            >
              Save
            </button>
          </div>
        )}
      </div>

      {/* History */}
      <div className={sharedStyles.card}>
        <div className={sharedStyles.cardHeader}>History</div>
        <div className={styles.runsBody}>
          {runs.length === 0 ? (
            <div className={styles.runsEmpty}>No runs yet</div>
          ) : (
            <>
              {[...runs].sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime()).map((run) => (
                <div key={run.id} className={styles.runRow}>
                  <span className={`${styles.runStatus} ${styles[`run_${run.status}`]}`}>
                    {run.status === "done" ? "✓" : run.status === "error" ? "✗" : "⋯"}
                  </span>
                  <span className={styles.runDate}>{formatDate(run.startedAt)}</span>
                  {run.durationMs != null && (
                    <span className={styles.runDuration}>{formatDuration(run.durationMs)}</span>
                  )}
                  {run.error && <span className={styles.runError}>{run.error}</span>}
                  <span className={styles.runSpacer} />
                  {run.chatId && onOpenChat && (
                    <button
                      className={styles.runLink}
                      onClick={() => onOpenChat(run.chatId!)}
                      title="Open Chat"
                    >
                      Go to Chat <ExternalLink size={11} strokeWidth={1.5} />
                    </button>
                  )}
                </div>
              ))}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
