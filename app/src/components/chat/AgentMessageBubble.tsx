import {
  AlertCircle,
  Pin,
  BookOpen,
  Brain,
  ChevronRight,
  FileText,
  FilePlus,
  FolderOpen,
  Globe,
  MessageSquare,
  Palette,
  Pencil,
  Plug,
  Search,
  Settings,
  ShieldCheck,
  ShieldQuestion,
  ShieldX,
  Square,
  Tag,
  Terminal,
  Wrench,
} from "lucide-react";
import { memo, type ReactElement, useCallback, useMemo, useRef, useState } from "react";
import { tokenize, tokenizeStream, type BlockRenderer } from "../../lib/markdownLexer";
import { codeRenderer } from "../../lib/renderers/codeRenderer";
import { createMarkdownRenderer } from "../../lib/renderers/markdownRenderer";
import { mermaidRenderer } from "../../lib/renderers/mermaidRenderer";
import { latexRenderer } from "../../lib/renderers/latexRenderer";
import { tableRenderer } from "../../lib/renderers/tableRenderer";
import { chartRenderer } from "../../lib/renderers/chartRenderer";
import { useStreamDrip } from "../../hooks/useStreamDrip";
import type { ChatActivity } from "../../types/chat";
import {
  expandedGroups,
  filterActivities,
  getActivityLabel,
  mergeToolActivities,
} from "../../lib/activityUtils";

function isIncompleteBlock(pending: string): boolean {
  const t = pending.trimStart();
  return t.startsWith("```") || t.startsWith("$$") || t.startsWith("\\[") || t.startsWith("\\begin{") || t.startsWith("|");
}

import { useStore } from "../../store";
import TickerLine from "./TickerLine";
import styles from "./AgentMessageBubble.module.css";
import type { SpinnerStatus } from "./Spinner";
import Spinner from "./Spinner";

// ── Types ──

export interface AgentMessage {
  id: string;
  content: string;
  activities: ChatActivity[];
  status: SpinnerStatus;
  rowid?: number;
  anchored?: boolean;
  conversationTokens?: number;
  contextWindow?: number;
}

export interface AgentMessageBubbleProps {
  message: AgentMessage;
  role?: string;
  searchQuery?: string;
  chatId?: string;
  onToggleAnchor?: (rowid: number, anchored: boolean) => void;
}

const ICON_SIZE = 12;
const ICON_STROKE = 1.5;

const TOOL_ICONS: Record<string, typeof Wrench> = {
  "file-text": FileText,
  "file-plus": FilePlus,
  "pencil": Pencil,
  "terminal": Terminal,
  "search": Search,
  "globe": Globe,
  "settings": Settings,
};

const CATEGORY_ICONS: Record<string, typeof Wrench> = {
  chat: MessageSquare,
  label: Tag,
  connection: Plug,
  workspace: FolderOpen,
  theme: Palette,
  file: FileText,
  docs: FileText,
  execute: Terminal,
};

function getToolIcon(icon?: string, category?: string): ReactElement {
  const Icon = (icon && TOOL_ICONS[icon]) || (category && CATEGORY_ICONS[category]) || Wrench;
  return <Icon size={ICON_SIZE} strokeWidth={ICON_STROKE} />;
}

function getActivityIcon(activity: ChatActivity): ReactElement {
  const { type, data } = activity;
  if (type === "agent.approval.requested") return <ShieldQuestion size={ICON_SIZE} strokeWidth={ICON_STROKE} />;
  if (type === "agent.approval.approved") return <ShieldCheck size={ICON_SIZE} strokeWidth={ICON_STROKE} />;
  if (type === "agent.approval.denied") return <ShieldX size={ICON_SIZE} strokeWidth={ICON_STROKE} />;
  if (type === "agent.trust.denied") return <ShieldX size={ICON_SIZE} strokeWidth={ICON_STROKE} />;
  if (type === "agent.knowledge") return <BookOpen size={ICON_SIZE} strokeWidth={ICON_STROKE} />;
  if (type.includes("thinking")) return <Brain size={ICON_SIZE} strokeWidth={ICON_STROKE} />;
  if (type === "agent.tool.start" || type === "agent.tool.result") return getToolIcon(data?.icon, data?.category);
  if (type === "agent.error") return <AlertCircle size={ICON_SIZE} strokeWidth={ICON_STROKE} />;
  if (type === "agent.stopped") return <Square size={ICON_SIZE} strokeWidth={ICON_STROKE} />;
  return <ChevronRight size={ICON_SIZE} strokeWidth={ICON_STROKE} />;
}

// ── Sub-components ──

interface ActivitiesGroupProps {
  messageId: string;
  activities: ChatActivity[];
}


function ActivitiesGroup({ messageId, activities: raw }: ActivitiesGroupProps): ReactElement | null {
  const isStreaming = messageId === "streaming";
  const thinkStarts = raw.filter((a) => a.type === "agent.thinking.start").length;
  const thinkDones = raw.filter((a) => a.type === "agent.thinking.done").length;
  const isThinking = isStreaming && thinkStarts > thinkDones;
  const thinkCount = Math.min(thinkStarts, 10);

  const [restored] = useState(() => {
    if (expandedGroups.has(messageId)) return true;
    if (messageId !== "streaming" && expandedGroups.has("streaming")) {
      expandedGroups.delete("streaming");
      expandedGroups.add(messageId);
      return true;
    }
    return false;
  });
  const [expanded, setExpanded] = useState(restored);
  const animate = !restored;
  const filtered = filterActivities(raw);
  const activities = mergeToolActivities(filtered);
  const count = activities.length;
  const hasError = activities.some((a) => a.type === "agent.error");
  const toggleRef = useRef<HTMLDivElement>(null);

  const handleToggle = useCallback(() => {
    if (expanded) {
      expandedGroups.delete(messageId);
    } else {
      expandedGroups.add(messageId);
      const el = toggleRef.current;
      if (el) {
        const scroller = el.closest("[class*=messages]") as HTMLElement | null;
        if (scroller) {
          const toggleRect = el.getBoundingClientRect();
          const scrollerRect = scroller.getBoundingClientRect();
          const spaceBelow = scrollerRect.bottom - toggleRect.bottom;
          const needed = count * 24 + 20;
          if (spaceBelow < needed) {
            scroller.scrollBy({ top: needed - spaceBelow, behavior: "smooth" });
          }
        }
      }
    }
    setExpanded(!expanded);
  }, [expanded, messageId, count]);

  if (count === 0 && !isThinking && thinkCount === 0) return null;

  const groupClass = `${styles.activitiesGroup} ${hasError ? styles.activitiesGroupError : ""}`;

  return (
    <div className={groupClass}>
      <div
        ref={toggleRef}
        className={`${styles.activitiesToggle} ${count === 0 ? styles.activitiesTogglePassive : ""}`}
        onClick={count > 0 ? handleToggle : undefined}
      >
        {count > 0 && (
          <span className={animate ? styles.activitiesCountIn : undefined}>
            <ChevronRight
              size={ICON_SIZE}
              strokeWidth={ICON_STROKE}
              className={`${styles.activitiesChevron} ${expanded ? styles.activitiesChevronOpen : ""}`}
            />
            <span className={styles.activitiesBadge}>{count}</span>
            <span className={styles.activitiesLabel}>
              {count === 1 ? "activity" : "activities"}
            </span>
          </span>
        )}
        {thinkCount > 0 && (
          <span className={styles.thinkingTrail}>
            {Array.from({ length: thinkCount }, (_, i) => {
              const isPulsing = !restored && isThinking && i === thinkCount - 1;
              const opacity = isPulsing ? undefined : 0.5 + (i / Math.max(thinkCount - 1, 1)) * 0.5;
              return (
                <Brain
                  key={i}
                  size={ICON_SIZE}
                  strokeWidth={ICON_STROKE}
                  className={isPulsing ? styles.thinkingPulse : styles.thinkingBrain}
                  style={opacity !== undefined ? { opacity } : undefined}
                />
              );
            })}
          </span>
        )}
      </div>
      {count > 0 && (
        <div className={`${styles.activitiesListWrap} ${!expanded ? styles.activitiesListWrapOut : ""}`}>
          <div className={styles.activitiesList}>
            {activities.map((a, i) => (
              <div
                key={`${a.type}-${i}`}
                className={`${styles.activityRow}${
                  a.type === "agent.error" || a.type === "agent.approval.denied" || a.type === "agent.trust.denied" ? ` ${styles.activityError}` :
                  a.type === "agent.approval.approved" ? ` ${styles.activityApproved}` :
                  a.type === "agent.approval.requested" ? ` ${styles.activityPending}` : ""
                }`}
              >
                {getActivityIcon(a)}
                <span className={styles.activityLabel}>{a.data?.mergedLabel ?? getActivityLabel(a)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

const STATUS_COLORS: Record<string, string> = {
  done: "#34c759",
  stopped: "#f5a623",
  error: "#ef4444",
};

const STATUS_LABELS: Record<string, string> = {
  done: "Done",
  stopped: "Stopped",
  error: "Error",
};

function formatTokens(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);
}

function AgentMessageBubbleStatus({ status, conversationTokens, contextWindow }: { status: SpinnerStatus; conversationTokens?: number; contextWindow?: number }): ReactElement {
  const usage = conversationTokens != null && contextWindow
    ? Math.min(Math.round(conversationTokens / contextWindow * 100), 100)
    : undefined;

  return (
    <div className={styles.statusRow}>
      <div className={styles.statusDot} style={{ background: STATUS_COLORS[status] }} />
      <span className={styles.statusLabel}>{STATUS_LABELS[status]}</span>
      {usage != null && (
        <span className={styles.usageGroup} title={`${formatTokens(conversationTokens!)} / ${formatTokens(contextWindow!)} tokens`}>
          <span className={styles.statusLabel}>Context</span>
          <span className={styles.usageBar}>
            <span className={styles.usageFill} style={{ width: `${usage}%` }} />
          </span>
          <span className={styles.statusLabel}>{usage}%</span>
        </span>
      )}
    </div>
  );
}

// ── Main ──

const AgentMessageBubble = memo(
  function AgentMessageBubble({ message, role, searchQuery, chatId, onToggleAnchor }: AgentMessageBubbleProps): ReactElement {
    const { content: rawContent, activities, status } = message;
    const streaming = status === "streaming";
    const ticker = useStore((s) => {
      if (!streaming || !chatId) return undefined;
      const c = s.streamBuffers.get(chatId)?.content;
      return c ? c.slice(-80) : undefined;
    });
    const content = useStreamDrip(rawContent, streaming);
    const errorActivity = activities.find((a) => a.type === "agent.error");
    const errorMessage = errorActivity?.data?.message as string | undefined;

    const rendererMap = useMemo(() => {
      const md = createMarkdownRenderer(searchQuery);
      const map = new Map<string, BlockRenderer>();
      map.set("markdown", md);
      map.set("code", codeRenderer);
      map.set("mermaid", mermaidRenderer);
      map.set("latex", latexRenderer);
      map.set("table", tableRenderer);
      map.set("chart", chartRenderer);
      map.set("echart", chartRenderer);
      return map;
    }, [searchQuery]);

    const seenBlocksRef = useRef(new Set<string>());

    const rendered = useMemo(() => {
      const md = rendererMap.get("markdown")!;
      if (streaming) {
        const { blocks, pending } = tokenizeStream(content);
        const elements: ReactElement[] = [];
        for (let i = 0; i < blocks.length; i++) {
          const block = blocks[i];
          const key = `${block.type}-${i}`;
          const renderer = rendererMap.get(block.type) ?? md;
          const isNew = !seenBlocksRef.current.has(key);
          if (isNew) seenBlocksRef.current.add(key);
          elements.push(
            <div key={key} className={isNew ? styles.blockFadeIn : undefined}>
              {renderer.render(block.content, key)}
            </div>
          );
        }
        if (pending && !isIncompleteBlock(pending)) {
          elements.push(md.render(pending, "pending"));
        }
        return elements;
      }
      seenBlocksRef.current.clear();
      const blocks = tokenize(content);
      return blocks.map((block, i) => {
        const renderer = rendererMap.get(block.type) ?? md;
        return renderer.render(block.content, `${block.type}-${i}`);
      });
    }, [content, streaming, rendererMap]);

    return (
      <div className={styles.wrap}>
        {activities.length > 0 && <ActivitiesGroup messageId={message.id} activities={activities} />}
        <TickerLine text={ticker} />
        {errorMessage && content.length === 0 && (
          <div className={`${styles.bubble} ${styles.bubbleError} ${styles.fadeIn}`}>
            <AlertCircle size={14} strokeWidth={1.5} />
            <span>{errorMessage}</span>
          </div>
        )}
        {content.length > 0 && (
          <div className={styles.bubble} data-bubble data-streaming={streaming || undefined}>
            {rendered}
          </div>
        )}
        {streaming && <Spinner status={status} />}
        {!streaming && <AgentMessageBubbleStatus status={status} conversationTokens={message.conversationTokens} contextWindow={message.contextWindow} />}
        {!streaming && onToggleAnchor && message.rowid != null && (
          <button
            className={`${styles.anchorBtn} ${message.anchored ? styles.anchorBtnActive : ""}`}
            onClick={() => onToggleAnchor(message.rowid!, !message.anchored)}
            title={message.anchored ? "Unpin from context" : "Pin to context"}
          >
            <Pin size={12} strokeWidth={1.5} />
          </button>
        )}
      </div>
    );
  },
  (prev, next) =>
    prev.message.content === next.message.content &&
    prev.message.status === next.message.status &&
    prev.message.activities.length === next.message.activities.length &&
    prev.message.anchored === next.message.anchored &&
    prev.message.rowid === next.message.rowid &&
    prev.message.conversationTokens === next.message.conversationTokens &&
    prev.role === next.role &&
    prev.searchQuery === next.searchQuery,
);

export default AgentMessageBubble;
