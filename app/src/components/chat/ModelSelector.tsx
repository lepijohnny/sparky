import { ChevronDown } from "lucide-react";
import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { getProviderIcon } from "../../lib/providerIcons";
import type { LlmConnection } from "../../types/llm";
import type { ModelDefinition, ProviderDefinition } from "../../types/registry";
import styles from "./ModelSelector.module.css";

function formatContextWindow(tokens?: number): string | null {
  if (!tokens) return null;
  if (tokens >= 1_000_000) return `${Math.round(tokens / 1_000_000)}M`;
  return `${Math.round(tokens / 1_000)}k`;
}

interface ModelOption {
  providerId: string;
  providerName: string;
  model: ModelDefinition;
}

interface ModelGroup {
  providerId: string;
  providerName: string;
  models: ModelDefinition[];
}

interface Props {
  connections: LlmConnection[];
  providers: ProviderDefinition[];
  activeProvider: string;
  activeModel: string;
  onChange: (provider: string, model: string) => void;
  disabled?: boolean;
}

export default memo(function ModelSelector({
  connections,
  providers,
  activeProvider,
  activeModel,
  onChange,
  disabled,
}: Props) {
  const [open, setOpen] = useState(false);
  const [focusIdx, setFocusIdx] = useState(-1);
  const [pos, setPos] = useState<React.CSSProperties | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const groups = useMemo(() => {
    const seen = new Set<string>();
    const result: ModelGroup[] = [];

    for (const conn of connections) {
      if (seen.has(conn.provider)) continue;
      seen.add(conn.provider);
      const provider = providers.find((p) => p.id === conn.provider);
      if (!provider) continue;
      result.push({
        providerId: provider.id,
        providerName: provider.name,
        models: provider.models,
      });
    }

    return result;
  }, [connections, providers]);

  const flatOptions = useMemo(() => {
    const result: ModelOption[] = [];
    for (const g of groups) {
      for (const m of g.models) {
        result.push({ providerId: g.providerId, providerName: g.providerName, model: m });
      }
    }
    return result;
  }, [groups]);

  const activeOption = flatOptions.find(
    (o) => o.providerId === activeProvider && o.model.id === activeModel,
  );
  const activeLabel = activeOption?.model.label;

  const activeIdx = flatOptions.findIndex(
    (o) => o.providerId === activeProvider && o.model.id === activeModel,
  );

  useLayoutEffect(() => {
    if (!open || !triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    setPos({
      bottom: window.innerHeight - rect.top + 4,
      left: rect.left,
      minWidth: 220,
    });
    setFocusIdx(activeIdx >= 0 ? activeIdx : 0);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (
        triggerRef.current?.contains(e.target as Node) ||
        listRef.current?.contains(e.target as Node)
      ) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  useEffect(() => {
    if (!open || !listRef.current) return;
    const focused = listRef.current.querySelector(`[data-idx="${focusIdx}"]`);
    focused?.scrollIntoView({ block: "nearest" });
  }, [focusIdx, open]);

  const handleSelect = useCallback((providerId: string, modelId: string) => {
    onChange(providerId, modelId);
    setOpen(false);
  }, [onChange]);

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
      setFocusIdx((i) => Math.min(i + 1, flatOptions.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setFocusIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      const opt = flatOptions[focusIdx];
      if (opt) handleSelect(opt.providerId, opt.model.id);
    }
  }, [open, focusIdx, flatOptions, handleSelect]);

  const flatIndexMap = useMemo(() => {
    const map = new Map<string, number>();
    let idx = 0;
    for (const g of groups) {
      for (const m of g.models) {
        map.set(`${g.providerId}:${m.id}`, idx++);
      }
    }
    return map;
  }, [groups]);

  return (
    <>
      <button
        ref={triggerRef}
        className={`${styles.trigger} ${disabled ? styles.triggerDisabled : ""}`}
        onClick={() => !disabled && setOpen((prev) => !prev)}
        onKeyDown={disabled ? undefined : handleKeyDown}
        type="button"
        role="combobox"
        aria-expanded={open}
        aria-haspopup="listbox"
      >
        <span className={styles.triggerIcon}>
          {getProviderIcon(activeProvider, 14)}
        </span>
        <span className={styles.triggerLabel}>
          {activeLabel ?? "Select model"}
          {activeOption?.model.contextWindow && (
            <span className={styles.contextBadge}>
              {formatContextWindow(activeOption.model.contextWindow)}
            </span>
          )}
        </span>
        <ChevronDown size={10} strokeWidth={1.5} className={styles.chevron} />
      </button>
      {open && pos && createPortal(
        <div
          ref={listRef}
          className={styles.list}
          style={pos}
          role="listbox"
          onKeyDown={handleKeyDown}
        >
          {groups.map((group) => (
            <div key={group.providerId}>
              <div className={styles.group}>
                <span className={styles.groupIcon}>
                  {getProviderIcon(group.providerId, 12)}
                </span>
                <span className={styles.groupLabel}>{group.providerName}</span>
              </div>
              {group.models.map((model) => {
                const idx = flatIndexMap.get(`${group.providerId}:${model.id}`) ?? 0;
                const selected = group.providerId === activeProvider && model.id === activeModel;
                const focused = idx === focusIdx;

                return (
                  <div
                    key={model.id}
                    data-idx={idx}
                    className={`${styles.item} ${selected ? styles.itemSelected : ""} ${focused ? styles.itemFocused : ""}`}
                    role="option"
                    aria-selected={selected}
                    tabIndex={-1}
                    onClick={() => handleSelect(group.providerId, model.id)}
                    onMouseEnter={() => setFocusIdx(idx)}
                  >
                    <span>{model.label}</span>
                    {model.contextWindow && (
                      <span className={styles.contextBadge}>
                        {formatContextWindow(model.contextWindow)}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
          {flatOptions.length === 0 && (
            <div className={styles.empty}>No connections configured</div>
          )}
        </div>,
        document.body,
      )}
    </>
  );
})
