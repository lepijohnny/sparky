import { AlertTriangle, CheckCircle, Plus } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import NewConnectionModal from "../../components/modals/NewConnectionModal";
import Dropdown from "../../components/shared/Dropdown";
import { useStore } from "../../store";
import { useConnection } from "../../context/ConnectionContext";
import { getProviderIcon } from "../../lib/providerIcons";
import shared from "../../styles/shared.module.css";
import type { LlmConnection } from "../../types/llm";
import local from "./LlmDetailsPage.module.css";

export default function LlmDetailsPage() {
  const { conn } = useConnection();
  const connections = useStore((s) => s.llmConnections);
  const providers = useStore((s) => s.providers);
  const flows = useStore((s) => s.flows);
  const llmConnections = connections;
  const defaultLlm = useStore((s) => s.defaultLlm);
  const defaultConn = useMemo(() => useStore.getState().getDefaultConn(), [llmConnections, defaultLlm]);
  const models = useMemo(() => useStore.getState().getModels(), [llmConnections, providers]);
  const activeModelId = useMemo(() => useStore.getState().getActiveModelId(), [llmConnections, defaultLlm, providers]);
  const selectedModel = useMemo(() => useStore.getState().getSelectedModel(), [llmConnections, defaultLlm, providers]);
  const thinkingSupported = selectedModel?.supportsThinking ?? false;
  const toolsSupported = selectedModel?.supportsTools ?? false;

  const refresh = useCallback(() => {
    if (!conn) return;
    Promise.all([
      conn.request<{ connections: LlmConnection[] }>("settings.llm.connections.list"),
      conn.request<{ providers: any[]; flows: any[] }>("core.registry.list"),
      conn.request<{ default: any }>("settings.llm.default.get"),
    ]).then(([c, r, d]) => {
      useStore.getState().setLlmConnections(c.connections);
      useStore.getState().setProviders(r.providers);
      useStore.getState().setFlows(r.flows ?? []);
      useStore.getState().setDefaultLlm(d.default);
    }).catch(() => {});
  }, [conn]);

  useEffect(() => { refresh(); }, []);

  const [showModal, setShowModal] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);


  const handleRemove = async (connection: LlmConnection) => {
    setRemoving(connection.id);
    try {
      if (conn) {
        await conn.request("settings.llm.connections.remove", { id: connection.id });
      }
    } catch (err) {
      console.error("Failed to remove connection:", err);
    } finally {
      setRemoving(null);
      refresh();
    }
  };

  const handleSetDefault = async (connection: LlmConnection) => {
    if (!conn) return;
    try {
      await conn.request("settings.llm.default.set", {
        id: connection.id,
        name: connection.name,
      });
      refresh();
    } catch (err) {
      console.error("Failed to set default:", err);
    }
  };

  const handleUpdateConnection = async (id: string, updates: { model?: string; thinking?: number; knowledge?: boolean; assistant?: boolean }) => {
    if (!conn) return;
    try {
      await conn.request("settings.llm.connections.update", { id, ...updates });
      refresh();
    } catch (err) {
      console.error("Failed to update connection:", err);
    }
  };

  const THINKING_LABELS = ["Off", "Low", "Medium", "High", "Max"];

  const handleModelChange = (modelId: string) => {
    if (!defaultConn) return;
    const model = models.find((m) => m.id === modelId);
    // When switching to a model that supports thinking, default to medium (3)
    // When switching to one that doesn't, reset to 0
    const thinking = model?.supportsThinking ? (defaultConn.thinking || 2) : 0;
    handleUpdateConnection(defaultConn.id, { model: modelId, thinking });
  };

  const handleThinkingChange = (level: number) => {
    if (!defaultConn) return;
    handleUpdateConnection(defaultConn.id, { thinking: level });
  };

  const handleKnowledgeChange = (enabled: boolean) => {
    if (!defaultConn) return;
    handleUpdateConnection(defaultConn.id, { knowledge: enabled });
  };

  const handleConnectionAdded = () => {
    setShowModal(false);
    refresh();
  };

  const isDefault = (c: LlmConnection) => defaultConn?.id === c.id;

  return (
    <div className={shared.contentArea}>
      <div className={shared.card}>
        <div className={shared.cardHeader}>Default</div>
        <div className={shared.cardBodyRow}>
          <div className={shared.fieldText}>
            <label className={shared.fieldLabel}>Connection</label>
            <p className={shared.fieldHint}>Choose which LLM connection to use.</p>
          </div>
          {connections.length > 0 ? (
            <div className={local.dropdownWrap}>
              <Dropdown
                options={connections.map((c) => ({ value: c.id, label: c.name }))}
                value={defaultConn?.id ?? ""}
                onChange={(id) => {
                  const c = connections.find((conn) => conn.id === id);
                  if (c) handleSetDefault(c);
                }}
              />
            </div>
          ) : (
            <span className={shared.fieldHint}>No connections available.</span>
          )}
        </div>
        {defaultConn && models.length > 0 && (
          <>
            <div className={shared.cardBodyRow}>
              <div className={shared.fieldText}>
                <label className={shared.fieldLabel}>Model</label>
                <p className={shared.fieldHint}>Select which model to use for this connection.</p>
              </div>
              <div className={local.dropdownWrap}>
                <Dropdown
                  options={models.map((m) => ({ value: m.id, label: m.label }))}
                  value={activeModelId ?? ""}
                  onChange={handleModelChange}
                />
              </div>
            </div>
            <div className={shared.cardBodyRow}>
              <div className={shared.fieldText}>
                <label className={shared.fieldLabel}>Thinking</label>
                <p className={shared.fieldHint}>
                  {thinkingSupported
                    ? "Control how much the model reasons before answering."
                    : "Not available for the selected model."}
                </p>
              </div>
              <div className={local.sliderWrap}>
                <input
                  type="range"
                  min={0}
                  max={4}
                  step={1}
                  value={defaultConn.thinking ?? 0}
                  disabled={!thinkingSupported}
                  onChange={(e) => handleThinkingChange(Number(e.target.value))}
                  className={local.slider}
                  aria-label="Thinking level"
                />
                <div className={local.sliderTicks}>
                  {THINKING_LABELS.map((label, i) => (
                    <span
                      key={label}
                      className={`${local.sliderTick} ${i === (defaultConn.thinking ?? 0) ? local.sliderTickActive : ""}`}
                    >
                      {label}
                    </span>
                  ))}
                </div>
              </div>
            </div>
            <div className={shared.cardBodyRow}>
              <div className={shared.fieldText}>
                <label className={shared.fieldLabel}>Knowledge</label>
                <p className={shared.fieldHint}>
                  Search knowledge sources for relevant context when answering.
                </p>
              </div>
              <div className={local.toggleWrap}>
                <button
                  type="button"
                  className={`${local.toggle} ${defaultConn.knowledge !== false ? local.toggleOn : ""}`}
                  onClick={() => handleKnowledgeChange(defaultConn.knowledge === false)}
                  aria-label="Toggle knowledge"
                >
                  <span className={local.toggleKnob} />
                </button>
              </div>
            </div>

          </>
        )}
      </div>

      <div className={shared.card}>
        <div className={local.cardHeaderWithAction}>
          <span>Connections</span>
          <button className={local.addBtn} onClick={() => setShowModal(true)}>
            <Plus size={14} strokeWidth={1.5} />
            New Connection
          </button>
        </div>
        <div className={shared.cardBody}>
          {connections.length === 0 ? (
            <div className={shared.emptyState}>
              No connections configured. Add a connection to get started.
            </div>
          ) : (
            <div className={local.connectionList}>
              {connections.map((c) => {
                const prov = providers.find((p) => p.id === c.provider);
                const hasWarning = !!prov?.warning;
                return (
                <div key={c.id} className={local.connectionRow}>
                  <span className={local.statusBadge}>
                    {hasWarning
                      ? <AlertTriangle size={12} strokeWidth={2} style={{ color: "var(--warning, #e8a838)" }} title={prov?.warning} />
                      : <CheckCircle size={12} strokeWidth={2} style={{ color: "var(--success, #4caf50)" }} />
                    }
                  </span>
                  <span className={local.connectionIcon}>
                    {getProviderIcon(c.provider, 14)}
                  </span>
                  <div className={local.connectionInfo}>
                    <span className={local.connectionName}>
                      {c.name}
                      {isDefault(c) && <span className={local.defaultLabel}>[default]</span>}
                    </span>
                    <span className={local.connectionMeta}>
                      <span className={local.connectionDate}>{new Date(c.createdAt).toLocaleDateString()}</span>
                    </span>
                  </div>
                  <div className={local.connectionActions}>
                    <button
                      className={shared.btnDanger}
                      onClick={() => handleRemove(c)}
                      disabled={removing === c.id}
                    >
                      {removing === c.id ? "Removing…" : "Disconnect"}
                    </button>
                  </div>
                </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {showModal && (
        <NewConnectionModal
          conn={conn}
          providers={providers}
          flows={flows}
          onClose={() => setShowModal(false)}
          onAdded={handleConnectionAdded}
        />
      )}
    </div>
  );
}
