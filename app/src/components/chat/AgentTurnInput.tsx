import { BookOpen, Check, Database, Loader2, Paperclip, Send, Square, X } from "lucide-react";
import { withAlpha } from "../../lib/color";
import { memo, useCallback, useEffect, useRef, useState, type ChangeEvent } from "react";
import { useStore } from "../../store";
import type { WsConnection } from "../../lib/ws";
import type { Chat } from "../../types/chat";
import ApprovalPopup from "./ApprovalPopup";
import ModeSelector from "./ModeSelector";
import ModelSelector from "./ModelSelector";
import ThinkingSelector from "./ThinkingSelector";
import RichInput, { type RichInputHandle, type TriggerInfo, type PathCompleteRequest } from "./RichInput";
import InputPopover, { type PopoverItem } from "./InputPopover";
import { generateThumbnail } from "../../lib/thumbnail";
import { setDropHandlers, initDragDrop } from "../../lib/dragdrop";
import type { PendingAttachment } from "../../types/attachment";
import { useToasts } from "../../context/ToastContext";
import styles from "./AgentTurnInput.module.css";

import { extractPathToken, pathBase, pathParent, normalizePath, pathFilter } from "../../lib/pathComplete";

function getPathTokenFromHandle(handle: RichInputHandle): string | null {
  return handle.getPathToken();
}

const MIME_MAP: Record<string, string> = {
  ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".gif": "image/gif",
  ".webp": "image/webp", ".svg": "image/svg+xml", ".pdf": "application/pdf",
  ".txt": "text/plain", ".md": "text/markdown", ".csv": "text/csv",
  ".json": "application/json", ".ts": "text/plain", ".js": "text/plain",
  ".py": "text/plain", ".sh": "text/plain", ".html": "text/html", ".css": "text/css",
};

function guessMime(filename: string): string {
  const ext = filename.slice(filename.lastIndexOf(".")).toLowerCase();
  return MIME_MAP[ext] ?? "application/octet-stream";
}

interface Draft {
  text: string;
  attachments: PendingAttachment[];
}

const drafts = new Map<string, Draft>();

interface ChatInputProps {
  chat: Chat;
  conn: WsConnection | null;
  streaming: boolean;
  chatProvider: string;
  chatModel: string;
  supportsThinking: boolean;
  supportsAttachments?: string[];
  contextTokens?: number;
  contextWindow?: number;
  onSend: (text: string, attachments: PendingAttachment[], knowledgeFilters?: string[]) => void;
  onStop: () => void;
  onModelChange: (provider: string, model: string) => void;
}

const MAX_SOURCE_ITEMS = 15;

function SourcePickerDropdown({ sources, selectedSources, onToggle, onClear, anchorEl, workspaceMode }: {
  sources: import("../../types/source").Source[];
  selectedSources: Set<string>;
  onToggle: (id: string) => void;
  onClear: () => void;
  anchorEl: HTMLElement;
  workspaceMode: "keyword" | "hybrid";
}) {
  const [filter, setFilter] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  const ready = sources.filter((s) => s.status === "ready");
  const filtered = filter
    ? ready.filter((s) => s.name.toLowerCase().includes(filter.toLowerCase()))
    : ready;
  const visible = filtered.slice(0, MAX_SOURCE_ITEMS);

  const rect = anchorEl.getBoundingClientRect();

  return (
    <div
      className={styles.sourcePickerDropdown}
      style={{ bottom: window.innerHeight - rect.top + 6, left: rect.left }}
    >
      <div className={styles.sourcePickerSearch}>
        <input
          ref={inputRef}
          className={styles.sourcePickerSearchInput}
          placeholder="Search sources…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
      </div>
      {visible.map((source) => {
        const disabled = workspaceMode === "hybrid" && source.mode === "keyword";
        const selected = selectedSources.has(source.id);
        return (
          <div
            key={source.id}
            className={`${styles.sourcePickerItem} ${selected ? styles.sourcePickerItemActive : ""} ${disabled ? styles.sourcePickerItemDisabled : ""}`}
            onClick={() => !disabled && onToggle(source.id)}
          >
            <span className={styles.sourcePickerCheck}>{selected && <Check size={12} strokeWidth={2} />}</span>
            <span className={styles.sourcePickerName}>{source.name}</span>
            <span className={styles.sourcePickerMode}>{source.mode === "hybrid" ? "Hybrid" : "BM25"}</span>
          </div>
        );
      })}
      {filtered.length > MAX_SOURCE_ITEMS && (
        <div className={styles.sourcePickerMore}>{filtered.length - MAX_SOURCE_ITEMS} more…</div>
      )}
      {visible.length === 0 && (
        <div className={styles.sourcePickerMore}>No sources found</div>
      )}
      {selectedSources.size > 0 && (
        <button className={styles.sourcePickerClear} onClick={onClear}>Clear filter</button>
      )}
    </div>
  );
}

export default memo(function ChatInput({
  chat,
  conn,
  streaming,
  chatProvider,
  chatModel,
  supportsThinking,
  supportsAttachments,
  contextTokens,
  contextWindow,
  onSend,
  onStop,
  onModelChange,
}: ChatInputProps) {
  const connections = useStore((s) => s.llmConnections);
  const providers = useStore((s) => s.providers);
  const services = useStore((s) => s.connections);
  const skills = useStore((s) => s.skills);
  const labels = useStore((s) => s.labels);
  const [hasContent, setHasContent] = useState(false);
  const [sending, setSending] = useState(false);
  const [trigger, setTrigger] = useState<TriggerInfo | null>(null);
  const [pathPopover, setPathPopover] = useState<{ items: PopoverItem[]; position: { x: number; y: number }; filter: string } | null>(null);
  const [attachments, setAttachments] = useState<PendingAttachment[]>([]);
  const { addToast } = useToasts();
  const inputRef = useRef<RichInputHandle>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const useKnowledge = chat.knowledge !== false;
  const chatLabels = (chat.labels ?? [])
    .map((id) => labels.find((l) => l.id === id))
    .filter(Boolean) as typeof labels;

  useEffect(() => {
    const draft = drafts.get(chat.id);
    const handle = inputRef.current;
    if (handle) {
      handle.setText(draft?.text ?? "");
      handle.focus();
    }
    setHasContent(!!draft?.text);
    setAttachments(draft?.attachments ?? []);
  }, [chat.id]);

  const saveDraft = useCallback((text?: string, atts?: PendingAttachment[]) => {
    const current = drafts.get(chat.id);
    const t = text ?? current?.text ?? "";
    const a = atts ?? current?.attachments ?? [];
    if (t || a.length > 0) {
      drafts.set(chat.id, { text: t, attachments: a });
    } else {
      drafts.delete(chat.id);
    }
  }, [chat.id]);

  const pathNavRef = useRef(false);

  const handleInputChange = useCallback(() => {
    const handle = inputRef.current;
    if (!handle) return;
    saveDraft(handle.getText());
    setHasContent(!handle.isEmpty());
    if (pathNavRef.current) return;
    setPathPopover((prev) => {
      if (!prev) return null;
      const token = getPathTokenFromHandle(handle);
      if (!token) return null;
      return { ...prev, filter: pathFilter(token) };
    });
  }, [saveDraft]);

  useEffect(() => {
    if (!streaming) setSending(false);
  }, [streaming]);

  const sendingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleSend = useCallback(() => {
    const handle = inputRef.current;
    if (!handle || handle.isEmpty()) return;
    if (sending && !streaming) return;
    const text = handle.getText();
    if (!text.trim()) return;
    const currentAttachments = streaming ? [] : [...attachments];
    handle.clear();
    setHasContent(false);
    drafts.delete(chat.id);
    if (!streaming) {
      setAttachments([]);
      setSending(true);
      if (sendingTimer.current) clearTimeout(sendingTimer.current);
      sendingTimer.current = setTimeout(() => setSending(false), 5000);
    }
    const filters = !streaming && selectedSources.size > 0 ? [...selectedSources] : undefined;
    onSend(text.trim(), currentAttachments, filters);
    handle.focus();
  }, [sending, streaming, chat.id, onSend, attachments]);

  const handleTrigger = useCallback((info: TriggerInfo | null) => {
    setTrigger(info);
  }, []);

  const handlePopoverSelect = useCallback((item: PopoverItem) => {
    const handle = inputRef.current;
    if (!handle || !trigger) return;

    if (trigger.type === "@") {
      handle.insertSvcChip(item.name);
    } else if (trigger.type === "#") {
      handle.clearTriggerText();
      const assigned = new Set(chat.labels ?? []);
      const next = assigned.has(item.id)
        ? [...assigned].filter((id) => id !== item.id)
        : [...assigned, item.id];
      conn?.request("chat.label", { id: chat.id, labels: next });
    }
    setTrigger(null);
  }, [trigger, chat.id, chat.labels, conn]);

  const handlePopoverClose = useCallback(() => {
    inputRef.current?.dismissTrigger();
    setTrigger(null);
  }, []);

  const pathPosRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  const fetchPathEntries = useCallback(async (partial: string, position: { x: number; y: number }) => {
    if (!conn) return;
    pathPosRef.current = position;
    try {
      const res = await conn.request<{ entries: { name: string; isDir: boolean }[]; base: string }>("fs.complete", { partial });
      if (res.entries.length === 0) {
        setPathPopover(null);
        return;
      }
      setPathPopover({
        items: res.entries.map((e) => ({ id: e.name, name: e.isDir ? e.name + "/" : e.name })),
        position,
        filter: "",
      });
    } catch {
      setPathPopover(null);
    }
  }, [conn]);

  const handlePathComplete = useCallback(async (req: PathCompleteRequest) => {
    fetchPathEntries(req.partial, req.position);
  }, [fetchPathEntries]);

  const navigatePath = useCallback((newPath: string) => {
    const handle = inputRef.current;
    if (!handle) return;
    const clean = normalizePath(newPath);
    pathNavRef.current = true;
    handle.replacePathToken(clean);
    pathNavRef.current = false;
    fetchPathEntries(clean, pathPosRef.current);
  }, [fetchPathEntries]);

  const handlePathSelect = useCallback((item: PopoverItem) => {
    const handle = inputRef.current;
    if (!handle) return;
    const token = getPathTokenFromHandle(handle);
    const base = token ? pathBase(token) : "";
    const newPath = base + item.name;
    if (item.name.endsWith("/")) {
      navigatePath(newPath);
    } else {
      pathNavRef.current = true;
      handle.replacePathToken(newPath);
      pathNavRef.current = false;
      setPathPopover(null);
    }
  }, [navigatePath]);

  const handlePathRight = useCallback((item: PopoverItem) => {
    if (!item.name.endsWith("/")) return;
    const handle = inputRef.current;
    if (!handle) return;
    const token = getPathTokenFromHandle(handle);
    const base = token ? pathBase(token) : "";
    navigatePath(base + item.name);
  }, [navigatePath]);

  const handlePathLeft = useCallback(() => {
    const handle = inputRef.current;
    if (!handle) return;
    const token = getPathTokenFromHandle(handle);
    if (!token) return;
    const parent = pathParent(token);
    if (!parent) return;
    navigatePath(parent);
  }, [navigatePath]);

  const activeSkills = skills.filter((s) => s.state === "active");
  const popoverItems: PopoverItem[] = trigger
    ? trigger.type === "@"
      ? [
          ...services.map((s) => ({ id: s.id, name: s.label, icon: s.icon, kind: "service" as const })),
          ...activeSkills.map((s) => ({ id: s.id, name: s.name, icon: s.icon, kind: "skill" as const })),
        ]
      : labels.map((l) => ({
          id: l.id,
          name: l.name,
          color: l.color,
          checked: (chat.labels ?? []).includes(l.id),
          kind: "label" as const,
        }))
    : [];

  const MAX_FILE_SIZE = 10 * 1024 * 1024;

  const addFiles = useCallback(async (files: FileList | File[]) => {
    for (const file of Array.from(files)) {
      if (file.size > MAX_FILE_SIZE) {
        addToast({ id: `file-too-large-${Date.now()}`, kind: "error", title: `${file.name} exceeds 10 MB limit` });
        continue;
      }
      const thumb = await generateThumbnail(file);
      const att: PendingAttachment = {
        id: crypto.randomUUID(),
        filename: file.name,
        mimeType: file.type || "application/octet-stream",
        size: file.size,
        thumbnailUrl: thumb ? URL.createObjectURL(thumb) : null,
        filePath: (file as any).path ?? "",
      };
      setAttachments((prev) => {
        const next = [...prev, att];
        saveDraft(undefined, next);
        return next;
      });
    }
  }, [saveDraft, addToast]);

  const allowedExtensions = supportsAttachments;

  const handleAttachClick = useCallback(async () => {
    try {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const selected = await open({
        multiple: true,
        filters: allowedExtensions
          ? [{ name: "Supported files", extensions: allowedExtensions }]
          : undefined,
      });
      if (!selected) return;
      const paths = Array.isArray(selected) ? selected : [selected];
      for (const filePath of paths) {
        const { stat, readFile } = await import("@tauri-apps/plugin-fs");
        const meta = await stat(filePath);
        if (!meta.size || meta.size > MAX_FILE_SIZE) {
          if (meta.size && meta.size > MAX_FILE_SIZE) {
            const name = filePath.split("/").pop() ?? filePath;
            addToast({ id: `file-too-large-${Date.now()}`, kind: "error", title: `${name} exceeds 10 MB limit` });
          }
          continue;
        }
        const filename = filePath.split("/").pop() ?? filePath;
        const bytes = await readFile(filePath);
        const mimeType = guessMime(filename);
        const file = new File([bytes], filename, { type: mimeType });
        const thumb = await generateThumbnail(file);
        const att: PendingAttachment = {
          id: crypto.randomUUID(),
          filename,
          mimeType,
          size: meta.size,
          thumbnailUrl: thumb ? URL.createObjectURL(thumb) : null,
          filePath,
        };
        setAttachments((prev) => {
          const next = [...prev, att];
          saveDraft(undefined, next);
          return next;
        });
      }
    } catch {
      fileInputRef.current?.click();
    }
  }, [saveDraft, addToast]);

  const handleFileChange = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) addFiles(e.target.files);
    e.target.value = "";
  }, [addFiles]);

  const [dragOver, setDragOver] = useState(false);
  const [showSourcePicker, setShowSourcePicker] = useState(false);
  const [selectedSources, setSelectedSources] = useState<Set<string>>(new Set());
  const sources = useStore((s) => s.sources);
  const workspaceMode = useStore((s) => s.workspace?.knowledgeSearch ?? "keyword");
  const sourcePickerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setDropHandlers(
      (files: PendingAttachment[]) => setAttachments((prev) => {
        const next = [...prev, ...files];
        saveDraft(undefined, next);
        return next;
      }),
      addToast,
      setDragOver,
    );
    initDragDrop();
  }, [addToast, saveDraft]);

  useEffect(() => {
    if (!showSourcePicker) return;
    const handler = (e: MouseEvent) => {
      if (sourcePickerRef.current && !sourcePickerRef.current.contains(e.target as Node)) {
        setShowSourcePicker(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showSourcePicker]);

  const removeAttachment = useCallback((id: string) => {
    setAttachments((prev) => {
      const removed = prev.find((a) => a.id === id);
      if (removed?.thumbnailUrl) URL.revokeObjectURL(removed.thumbnailUrl);
      const next = prev.filter((a) => a.id !== id);
      saveDraft(undefined, next);
      return next;
    });
  }, [saveDraft]);

  const handleThinkingChange = useCallback(async (level: number) => {
    if (!conn) return;
    try {
      await conn.request("chat.thinking", { id: chat.id, thinking: level });
    } catch (err) {
      console.error("Failed to set thinking level:", err);
    }
  }, [conn, chat.id]);

  return (
    <div className={styles.inputArea}>
      <ApprovalPopup chatId={chat.id} />
      {chatLabels.length > 0 && (
        <div className={styles.labelBar}>
          {chatLabels.slice(0, 5).map((l) => (
            <span
              key={l.id}
              className={styles.labelBadge}
              style={{
                background: withAlpha(l.color, 0.15),
                borderColor: withAlpha(l.color, 0.3),
                color: l.color,
              }}
              onClick={() => {
                const next = (chat.labels ?? []).filter((id) => id !== l.id);
                conn?.request("chat.label", { id: chat.id, labels: next });
              }}
            >
              <span className={styles.labelText}>{l.name}</span>
              <span className={styles.labelX}>×</span>
            </span>
          ))}
          {chatLabels.length > 5 && (
            <span className={styles.labelOverflow}>+{chatLabels.length - 5}</span>
          )}
        </div>
      )}
      <div
        className={`${styles.inputCard} ${dragOver ? styles.inputCardDragOver : ""}`}
        style={contextTokens != null && contextWindow != null && contextWindow > 0
          ? {
              "--context-pct": `${Math.min(Math.round(contextTokens / contextWindow * 100), 100)}%`,
              "--context-color": Math.round(contextTokens / contextWindow * 100) >= 80 ? "#ef4444" : Math.round(contextTokens / contextWindow * 100) >= 50 ? "#f5a623" : undefined,
            } as React.CSSProperties
          : undefined}
        title={contextTokens != null && contextWindow != null && contextWindow > 0
          ? `Context ${Math.min(Math.round(contextTokens / contextWindow * 100), 100)}%`
          : undefined}
      >
        {attachments.length > 0 && (
          <div className={styles.attachRow}>
            {attachments.map((att) => (
              <div key={att.id} className={styles.attachThumb} title={att.filename}>
                {att.thumbnailUrl ? (
                  <img src={att.thumbnailUrl} alt={att.filename} className={styles.attachImg} />
                ) : (
                  <div className={styles.attachIcon}>
                    <Paperclip size={16} strokeWidth={1.5} />
                  </div>
                )}
                <button className={styles.attachRemove} onClick={() => removeAttachment(att.id)}>
                  <X size={10} strokeWidth={2} />
                </button>
                <span className={styles.attachName}>{att.filename}</span>
              </div>
            ))}
          </div>
        )}
        <RichInput
          ref={inputRef}
          onSend={handleSend}
          onChange={handleInputChange}
          onTrigger={handleTrigger}
          onPathComplete={handlePathComplete}
        />
        {trigger && (
          <InputPopover
            items={popoverItems}
            position={trigger.position}
            filter={trigger.filter}
            emptyLabel={trigger.type === "@" ? "No services" : "No labels"}
            onSelect={handlePopoverSelect}
            onClose={handlePopoverClose}
          />
        )}
        {pathPopover && !trigger && (
          <InputPopover
            items={pathPopover.items}
            position={pathPopover.position}
            filter={pathPopover.filter}
            emptyLabel="No matches"
            onSelect={handlePathSelect}
            onClose={() => setPathPopover(null)}
            onRight={handlePathRight}
            onLeft={handlePathLeft}
          />
        )}
        <div className={styles.toolbar} key={chat.id}>
          <div className={styles.toolbarLeft}>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept="image/*,.pdf,.txt,.md,.csv"
              onChange={handleFileChange}
              style={{ display: "none" }}
            />
            {(!chat.role || chat.role === "sparky") && <button
              className={styles.attachBtn}
              onClick={handleAttachClick}
              title="Attach file"
              disabled={!allowedExtensions || allowedExtensions.length === 0}
            >
              <Paperclip size={12} strokeWidth={1.5} />
            </button>}
            {(!chat.role || chat.role === "sparky") && <button
              className={`${styles.knowledgeToggle} ${useKnowledge ? styles.knowledgeToggleActive : ""}`}
              onClick={() => conn?.request("chat.knowledge", { id: chat.id, knowledge: !useKnowledge }).catch(() => {})}
              title={useKnowledge ? "Knowledge sources enabled" : "Knowledge sources disabled"}
            >
              <BookOpen size={12} strokeWidth={1.5} />
              <span className={styles.toggleTrack}>
                <span className={styles.toggleThumb} />
              </span>
            </button>}
            {(!chat.role || chat.role === "sparky") && useKnowledge && sources.length > 0 && (
              <div className={styles.sourcePickerWrap} ref={sourcePickerRef}>
                <button
                  className={`${styles.sourcePickerBtn} ${selectedSources.size > 0 ? styles.sourcePickerBtnActive : ""}`}
                  onClick={() => setShowSourcePicker((v) => !v)}
                  title={selectedSources.size > 0 ? `${selectedSources.size} source(s) selected` : "Filter knowledge sources"}
                >
                  <Database size={12} strokeWidth={1.5} />
                  {selectedSources.size > 0 && <span className={styles.sourcePickerCount}>{selectedSources.size}</span>}
                </button>
                {showSourcePicker && sourcePickerRef.current && (
                  <SourcePickerDropdown
                    anchorEl={sourcePickerRef.current}
                    workspaceMode={workspaceMode}
                    sources={sources}
                    selectedSources={selectedSources}
                    onToggle={(id) => setSelectedSources((prev) => {
                      const next = new Set(prev);
                      if (next.has(id)) next.delete(id);
                      else next.add(id);
                      return next;
                    })}
                    onClear={() => setSelectedSources(new Set())}
                  />
                )}
              </div>
            )}
            {(!chat.role || chat.role === "sparky") && <ThinkingSelector
              value={chat.thinking ?? 0}
              onChange={handleThinkingChange}
              disabled={!supportsThinking}
            />}
            <ModelSelector
              connections={connections}
              providers={providers}
              activeProvider={chatProvider}
              activeModel={chatModel}
              onChange={onModelChange}
            />

          </div>
          <div className={styles.toolbarRight}>
            <ModeSelector chat={chat} />
            {streaming || sending ? (
              <button className={`${styles.sendBtn} ${styles.stopBtn}`} onClick={onStop} disabled={!streaming}>
                {sending && !streaming ? (
                  <Loader2 size={14} strokeWidth={1.5} className={styles.spinner} />
                ) : (
                  <Square size={12} strokeWidth={1.5} />
                )}
                Stop
              </button>
            ) : (
              <button
                className={styles.sendBtn}
                onClick={handleSend}
                disabled={!hasContent}
              >
                <Send size={14} strokeWidth={1.5} />
                Send
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
});
