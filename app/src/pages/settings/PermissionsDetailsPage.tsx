import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, Eye, Pencil, Plus, Sparkles, Terminal } from "lucide-react";
import { useConnection } from "../../context/ConnectionContext";
import { useStore } from "../../store";
import type { PermissionMode, Scope, RuleList, ScopeRules } from "../../store/trust";
import type { Chat } from "../../types/chat";
import AssistantAsk from "../../components/shared/AssistantAsk";
import shared from "../../styles/shared.module.css";
import styles from "./PermissionsDetailsPage.module.css";

const MODE_OPTIONS: { value: PermissionMode; label: string; icon: typeof Eye }[] = [
  { value: "read", label: "Read", icon: Eye },
  { value: "write", label: "Write", icon: Pencil },
  { value: "execute", label: "Execute", icon: Terminal },
];

const MODE_DESCRIPTIONS: Record<PermissionMode, string> = {
  read: "The assistant can only read files, search, and browse. No changes to your filesystem.",
  write: "The assistant can read and write files. It cannot run shell commands.",
  execute: "Full access — the assistant can read, write, and run shell commands.",
};

type RuleKind = `${Scope}-${RuleList}` & string;

interface FlatRule {
  kind: RuleKind;
  scope: Scope;
  list: RuleList;
  label: string;
  pattern: string;
  alwaysAsk?: boolean;
}

const KIND_META: Record<RuleKind, { scopeLabel: string; listLabel: string; scopeClass: string; listClass: string }> = {
  "read-allow":  { scopeLabel: "read",  listLabel: "allowed", scopeClass: "badgeRead",    listClass: "badgeAllow" },
  "read-deny":   { scopeLabel: "read",  listLabel: "denied",  scopeClass: "badgeRead",    listClass: "badgeDeny" },
  "read-ask":    { scopeLabel: "read",  listLabel: "ask",     scopeClass: "badgeRead",    listClass: "badgeAsk" },
  "write-allow": { scopeLabel: "write", listLabel: "allowed", scopeClass: "badgeWrite",   listClass: "badgeAllow" },
  "write-deny":  { scopeLabel: "write", listLabel: "denied",  scopeClass: "badgeWrite",   listClass: "badgeDeny" },
  "write-ask":   { scopeLabel: "write", listLabel: "ask",     scopeClass: "badgeWrite",   listClass: "badgeAsk" },
  "bash-allow":  { scopeLabel: "bash",  listLabel: "allowed", scopeClass: "badgeExecute", listClass: "badgeAllow" },
  "bash-deny":   { scopeLabel: "bash",  listLabel: "denied",  scopeClass: "badgeExecute", listClass: "badgeDeny" },
  "bash-ask":    { scopeLabel: "bash",  listLabel: "ask",     scopeClass: "badgeExecute", listClass: "badgeAsk" },
  "bus-allow":   { scopeLabel: "bus",   listLabel: "allowed", scopeClass: "badgeBus",     listClass: "badgeAllow" },
  "bus-deny":    { scopeLabel: "bus",   listLabel: "denied",  scopeClass: "badgeBus",     listClass: "badgeDeny" },
  "bus-ask":     { scopeLabel: "bus",   listLabel: "ask",     scopeClass: "badgeBus",     listClass: "badgeAsk" },
};

const KIND_OPTIONS: { value: RuleKind; label: string }[] = [
  { value: "read-allow",  label: "Read — Allowed" },
  { value: "read-deny",   label: "Read — Denied" },
  { value: "read-ask",    label: "Read — Ask" },
  { value: "write-allow", label: "Write — Allowed" },
  { value: "write-deny",  label: "Write — Denied" },
  { value: "write-ask",   label: "Write — Ask" },
  { value: "bash-deny",   label: "Bash — Denied" },
  { value: "bash-ask",    label: "Bash — Ask" },
  { value: "bash-allow",  label: "Bash — Allowed" },
  { value: "bus-deny",    label: "Bus — Denied" },
  { value: "bus-ask",     label: "Bus — Ask" },
  { value: "bus-allow",   label: "Bus — Allowed" },
];

function flattenRules(trust: Record<Scope, ScopeRules>): FlatRule[] {
  const out: FlatRule[] = [];
  for (const scope of ["read", "write", "bash", "bus"] as Scope[]) {
    for (const list of ["deny", "ask", "allow"] as RuleList[]) {
      for (const rule of trust[scope][list]) {
        out.push({ kind: `${scope}-${list}`, scope, list, label: rule.label, pattern: rule.pattern, alwaysAsk: rule.alwaysAsk });
      }
    }
  }
  return out;
}

export default function PermissionsDetailsPage() {
  const { conn } = useConnection();
  const trust = useStore((s) => s.trust);
  const [filter, setFilter] = useState("");
  const [filterKind, setFilterKind] = useState<RuleKind | "all">("all");
  const [newLabel, setNewLabel] = useState("");
  const [newPattern, setNewPattern] = useState("");
  const [newKind, setNewKind] = useState<RuleKind>("bash-deny");
  const [newAlwaysAsk, setNewAlwaysAsk] = useState(false);
  const [showAsk, setShowAsk] = useState(false);
  const [askPos, setAskPos] = useState<{ x: number; y: number }>({ x: 78, y: 30 });

  const setMode = async (m: PermissionMode) => {
    if (!conn || m === trust.mode) return;
    useStore.getState().setTrustMode(m);
    await conn.request("trust.mode.set", { mode: m });
  };

  const handleAdd = async () => {
    const label = newLabel.trim();
    const pattern = newPattern.trim();
    if (!label || !pattern || !conn) return;
    try { new RegExp(pattern); } catch { return; }
    const [scope, list] = newKind.split("-") as [Scope, RuleList];
    const alwaysAsk = newAlwaysAsk && list === "ask";
    await conn.request("trust.rule.add", { scope, list, label, pattern, ...(alwaysAsk ? { alwaysAsk: true } : {}) });
    setNewLabel("");
    setNewPattern("");
    setNewAlwaysAsk(false);
  };

  const handleRemove = async (rule: FlatRule) => {
    if (!conn) return;
    await conn.request("trust.rule.remove", { scope: rule.scope, list: rule.list, pattern: rule.pattern });
  };

  const handleClear = async () => {
    if (!conn) return;
    await conn.request("trust.clear", {});
  };

  const handleRecommended = async () => {
    if (!conn) return;
    await conn.request("trust.reset", {});
  };

  const handleAskOpen = useCallback((e: React.MouseEvent) => {
    const rect = (e.target as HTMLElement).getBoundingClientRect();
    setAskPos({ x: rect.right - 320, y: rect.bottom + 8 });
    setShowAsk(true);
  }, []);

  const handleAskSubmit = useCallback(async (content: string) => {
    if (!conn) return;
    const res = await conn.request<{ chatId: string }>("chat.system.ask", { content, kind: "permissions" });
    const r = await conn.request<{ chat: Chat }>("chat.get.id", { id: res.chatId });
    if (r?.chat) {
      useStore.getState().setSection("chats");
      useStore.getState().selectChat(r.chat);
    }
  }, [conn]);

  const allRules = flattenRules(trust);
  const flat = allRules.filter((f) => {
    if (filterKind !== "all" && f.kind !== filterKind) return false;
    if (filter) {
      const q = filter.toLowerCase();
      return f.label.toLowerCase().includes(q) || f.pattern.toLowerCase().includes(q);
    }
    return true;
  });

  return (
    <div className={shared.contentArea}>
      <div className={shared.card}>
        <div className={shared.cardHeader}>Mode</div>
        <div className={shared.cardBody}>
          <div className={styles.modeRow}>
            <p className={styles.modeHint}>{MODE_DESCRIPTIONS[trust.mode]}</p>
            <ModeDropdown value={trust.mode} onChange={setMode} />
          </div>
        </div>
      </div>

      <div className={shared.card}>
        <div className={shared.cardHeader}>
          Rules
          <button className={styles.askBtn} onClick={handleAskOpen} title="Ask assistant to create rules">
            <Sparkles size={14} strokeWidth={2} className={shared.sparkle} />
          </button>
        </div>
        <div className={shared.cardBody}>
          <div className={styles.filterRow}>
            <input
              className={styles.filterInput}
              type="text"
              placeholder="Filter rules…"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            />
            <select
              className={styles.kindSelect}
              value={filterKind}
              onChange={(e) => setFilterKind(e.target.value as RuleKind | "all")}
            >
              <option value="all">All ({allRules.length})</option>
              {KIND_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label} ({allRules.filter((r) => r.kind === o.value).length})</option>
              ))}
            </select>
          </div>
          {flat.length === 0 ? (
            <div className={shared.emptyState}>{allRules.length === 0 ? "No rules configured." : "No rules match filter."}</div>
          ) : (
            <div className={styles.list}>
              {flat.map((f) => {
                const meta = KIND_META[f.kind];
                return (
                  <div key={`${f.kind}:${f.pattern}`} className={styles.item}>
                    <div className={styles.itemLeft}>
                      <span className={styles.ruleLabel}>{f.label}</span>
                      <span className={styles.rulePattern}>{f.pattern}</span>
                    </div>
                    <div className={styles.itemRight}>
                      <span className={`${styles.badge} ${styles.badgeScope} ${styles[meta.scopeClass]}`}>{meta.scopeLabel}</span>
                      <span className={`${styles.badge} ${styles.badgeList} ${styles[meta.listClass]}`}>{meta.listLabel}</span>
                      {f.alwaysAsk && <span className={`${styles.badge} ${styles.badgeAlwaysAsk}`}>always ask</span>}
                      <button className={`${shared.btnDanger} ${styles.removeBtn}`} onClick={() => handleRemove(f)}>Remove</button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          <div className={styles.addForm}>
            <input
              className={styles.addInput}
              type="text"
              placeholder="Label"
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleAdd(); }}
            />
            <input
              className={styles.addInputMono}
              type="text"
              placeholder="Regex pattern"
              value={newPattern}
              onChange={(e) => setNewPattern(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleAdd(); }}
            />
            <select
              className={styles.kindSelect}
              value={newKind}
              onChange={(e) => setNewKind(e.target.value as RuleKind)}
            >
              {KIND_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
            {newKind.endsWith("-ask") && (
              <label className={styles.alwaysAskLabel}>
                <input type="checkbox" checked={newAlwaysAsk} onChange={(e) => setNewAlwaysAsk(e.target.checked)} />
                Always ask
              </label>
            )}
            <button className={shared.btn} onClick={handleAdd} disabled={!newLabel.trim() || !newPattern.trim()}>
              Add
            </button>
          </div>
        </div>
      </div>

      <div className={styles.footer}>
        <button className={shared.btnDanger} onClick={handleClear}>Clear All</button>
        <button className={shared.btn} onClick={handleRecommended}>Recommended</button>
      </div>

      {showAsk && (
        <AssistantAsk
          onSubmit={handleAskSubmit}
          onClose={() => setShowAsk(false)}
          hint="Describe what the assistant should or shouldn't be allowed to do."
          placeholder="Don't allow reading my secrets..."
          initialPos={askPos}
        />
      )}
    </div>
  );
}

function ModeDropdown({ value, onChange }: { value: PermissionMode; onChange: (m: PermissionMode) => void }) {
  const [open, setOpen] = useState(false);
  const [focusIdx, setFocusIdx] = useState(-1);
  const [pos, setPos] = useState<React.CSSProperties | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const activeIdx = MODE_OPTIONS.findIndex((m) => m.value === value);
  const active = MODE_OPTIONS[activeIdx] ?? MODE_OPTIONS[0];
  const Icon = active.icon;

  useLayoutEffect(() => {
    if (!open || !triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    setPos({ top: rect.bottom + 4, left: rect.left, minWidth: rect.width });
    setFocusIdx(activeIdx >= 0 ? activeIdx : 0);
  }, [open, activeIdx]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (triggerRef.current?.contains(e.target as Node) || listRef.current?.contains(e.target as Node)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (!open) {
      if (e.key === "Enter" || e.key === " " || e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        setOpen(true);
      }
      return;
    }
    if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
      triggerRef.current?.focus();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setFocusIdx((i) => Math.min(i + 1, MODE_OPTIONS.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setFocusIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      const m = MODE_OPTIONS[focusIdx];
      if (m) { onChange(m.value); setOpen(false); }
    }
  }, [open, focusIdx, onChange]);

  return (
    <>
      <button
        ref={triggerRef}
        className={`${styles.modeSelect} ${styles[`mode_${value}`]}`}
        onClick={() => setOpen((p) => !p)}
        onKeyDown={handleKeyDown}
        type="button"
      >
        <Icon size={14} strokeWidth={1.5} />
        <span>{active.label}</span>
        <ChevronDown size={10} strokeWidth={1.5} style={{ opacity: 0.6 }} />
      </button>
      {open && pos && createPortal(
        <div ref={listRef} className={styles.modeList} style={pos} onKeyDown={handleKeyDown}>
          {MODE_OPTIONS.map((o, idx) => {
            const OIcon = o.icon;
            return (
              <div
                key={o.value}
                className={`${styles.modeItem} ${o.value === value ? styles.modeItemSelected : ""} ${idx === focusIdx ? styles.modeItemFocused : ""}`}
                onClick={() => { onChange(o.value); setOpen(false); }}
                onMouseEnter={() => setFocusIdx(idx)}
              >
                <OIcon size={14} strokeWidth={1.5} />
                <span>{o.label}</span>
              </div>
            );
          })}
        </div>,
        document.body,
      )}
    </>
  );
}
