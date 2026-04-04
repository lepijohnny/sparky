import { open as shellOpen } from "@tauri-apps/plugin-shell";

import type { AuthFlowDefinition, AuthRequest, AuthRequestField, AuthVerdict } from "@sparky/auth-core";

const AUTH_TIMEOUT = 600_000;
import { X } from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import type { WsConnection } from "../../lib/ws";
import type { LlmConnection } from "../../types/llm";
import type { ProviderDefinition } from "../../types/registry";
import Dropdown from "../shared/Dropdown";
import styles from "./NewConnectionModal.module.css";

interface Props {
  conn: WsConnection | null;
  providers: ProviderDefinition[];
  flows: AuthFlowDefinition[];
  onClose: () => void;
  onAdded: () => void;
  /** Render without overlay/modal chrome — for embedding in pages */
  inline?: boolean;
  /** Optional parent-level back button when in select step */
  onBack?: () => void;
}

const POLL_INTERVAL = 1000;
const POLL_TIMEOUT = 15_000;

async function waitForModels(conn: WsConnection, provider: string): Promise<void> {
  const deadline = Date.now() + POLL_TIMEOUT;
  while (Date.now() < deadline) {
    try {
      const { models } = await conn.request<{ models: { id: string }[] }>(
        "core.registry.models", { provider },
      );
      if (models.length > 0) return;
    } catch { /* retry */ }
    await new Promise((r) => setTimeout(r, POLL_INTERVAL));
  }
}

interface CompanyGroup {
  company: string;
  flows: AuthFlowDefinition[];
}

export default function NewConnectionModal({ conn, providers, flows, onClose, onAdded, inline, onBack }: Props) {
  const groups = useMemo<CompanyGroup[]>(() => {
    const map = new Map<string, AuthFlowDefinition[]>();
    for (const flow of flows) {
      const prov = providers.find((p) => p.id === flow.provider);
      const company = prov?.name ?? flow.provider;
      const list = map.get(company) ?? [];
      list.push(flow);
      map.set(company, list);
    }
    return [...map.entries()].map(([company, f]) => ({ company, flows: f }));
  }, [providers, flows]);

  const [selectedCompany, setSelectedCompany] = useState(inline ? "" : (groups[0]?.company ?? ""));
  const [selectedFlowIdx, setSelectedFlowIdx] = useState(0);
  const [step, setStep] = useState<"select" | "connect">("select");
  const [direction, setDirection] = useState<"forward" | "backward">("forward");
  const [hasStepped, setHasStepped] = useState(false);
  const [fieldValues, setFieldValues] = useState<Record<string, string>>({});
  const [display, setDisplay] = useState<AuthRequestField[]>([]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const overlayRef = useRef<HTMLDivElement>(null);
  const mouseDownOnOverlay = useRef(false);

  const resetFlow = useCallback(() => {
    setHasStepped(true);
    setDirection("backward");
    setSelectedCompany(inline ? "" : (groups[0]?.company ?? ""));
    setSelectedFlowIdx(0);
    setStep("select");
    setFieldValues({});
    setDisplay([]);
    setPending(false);
    setError(null);
    setSaving(false);
  }, [inline, groups]);

  useEffect(() => {
    if (!inline) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && step !== "select") {
        e.preventDefault();
        resetFlow();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [inline, step, resetFlow]);

  const group = groups.find((g) => g.company === selectedCompany);
  const companyFlows = group?.flows ?? [];
  const selectedFlow = companyFlows[selectedFlowIdx] ?? null;

  const handleCompanyChange = (company: string) => {
    setSelectedCompany(company);
    setSelectedFlowIdx(0);
    setFieldValues({});
    setDisplay([]);
    setPending(false);
    setError(null);
  };

  const handleFlowIdxChange = (label: string) => {
    const idx = companyFlows.findIndex((f) => f.label === label);
    setSelectedFlowIdx(idx >= 0 ? idx : 0);
    setFieldValues({});
    setDisplay([]);
    setPending(false);
    setError(null);
  };

  const handleAuthFlow = async () => {
    if (!conn || !selectedFlow) return;
    const { domain, provider: prov, grant } = selectedFlow;

    setError(null);
    try {
      const request = await conn.request<AuthRequest>(
        "auth.start", { domain, provider: prov, grant, params: fieldValues },
        { timeout: AUTH_TIMEOUT },
      );

      setDisplay(request.display);
      setPending(true);

      for (const item of request.display) {
        if (item.type === "code") {
          try {
            const { writeText } = await import("@tauri-apps/plugin-clipboard-manager");
            await writeText(item.value);
          } catch (err) { console.error("Clipboard write failed:", err); }
        }
        if (item.type === "url") {
          try { await shellOpen(item.value); } catch { window.open(item.value, "_blank"); }
        }
      }

      const verdict = await conn.request<AuthVerdict>(
        "auth.finish", { domain, provider: prov, grant, params: fieldValues },
        { timeout: AUTH_TIMEOUT },
      );

      if (!verdict.ok) {
        setError("Authorization was not completed.");
        setPending(false);
        return;
      }

      setSaving(true);
      await conn.request("settings.llm.connections.add", {
        provider: prov,
        name: selectedFlow.label,
        grant,
      });

      await waitForModels(conn, prov);
      onAdded();
    } catch (err: any) {
      setError(typeof err === "string" ? err : err?.message ?? "Authorization failed");
      setPending(false);
    } finally {
      setSaving(false);
    }
  };

  const handleFieldSubmit = async () => {
    if (!conn || !selectedFlow) return;
    const { domain, provider: prov, grant } = selectedFlow;

    setSaving(true);
    setError(null);
    try {
      if (grant === "local") {
        const host = fieldValues.host?.trim() || selectedFlow.fields?.find((f) => f.name === "host")?.placeholder || "";

        const { ok, error: valErr } = await conn.request<{ ok: boolean; error?: string }>(
          "core.registry.validate", { provider: prov, host },
        );
        if (!ok) {
          setError(valErr ?? `Cannot reach server at ${host}. Is it running?`);
          setSaving(false);
          return;
        }

        const { connections: existing } = await conn.request<{ connections: LlmConnection[] }>(
          "settings.llm.connections.list", undefined,
        );
        if (existing.some((c) => c.provider === prov && c.host === host)) {
          setError(`A connection to ${host} already exists.`);
          setSaving(false);
          return;
        }

        await conn.request("settings.llm.connections.add", {
          provider: prov,
          name: selectedFlow.label,
          grant,
          host,
        });
      } else {
        await conn.request<AuthRequest>(
          "auth.start", { domain, provider: prov, grant },
          { timeout: AUTH_TIMEOUT },
        );

        const verdict = await conn.request<AuthVerdict>(
          "auth.finish", { domain, provider: prov, grant, params: fieldValues },
          { timeout: AUTH_TIMEOUT },
        );

        if (!verdict.ok) {
          setError("Failed to store credentials.");
          setSaving(false);
          return;
        }

        await conn.request("settings.llm.connections.add", {
          provider: prov,
          name: selectedFlow.label,
          grant,
        });
      }

      await waitForModels(conn, prov);
      onAdded();
    } catch (err: any) {
      setError(typeof err === "string" ? err : err?.message ?? "Failed to connect");
    } finally {
      setSaving(false);
    }
  };

  const renderSelectStep = () => (
    <>
      <div className={styles.field}>
        <label className={styles.label}>Provider</label>
        <Dropdown
          options={[
            ...(inline && !selectedCompany ? [{ value: "", label: "Select a provider…" }] : []),
            ...groups.map((g) => ({ value: g.company, label: g.company })),
          ]}
          value={selectedCompany}
          onChange={handleCompanyChange}
          disabled={step === "connect"}
        />
      </div>

      {companyFlows.length > 1 && (
        <div className={styles.field}>
          <label className={styles.label}>Authentication</label>
          <Dropdown
            options={companyFlows.map((f) => ({ value: f.label, label: f.label }))}
            value={selectedFlow?.label ?? ""}
            onChange={handleFlowIdxChange}
            disabled={step === "connect"}
          />
        </div>
      )}
    </>
  );

  const renderConnectStep = () => {
    if (!selectedFlow) return null;

    if (pending && display.length > 0) {
      return (
        <div className={styles.connectSection}>
          {saving ? (
            <div className={styles.spinnerRow}>
              <span className={styles.spinnerDot} />
              Setting up connection…
            </div>
          ) : (
            <>
              {display.map((item, i) => {
                if (item.type === "code") {
                  return (
                    <div key={i}>
                      <p className={styles.hint}>{item.label} (copied to clipboard)</p>
                      <div className={styles.deviceCode}>{item.value}</div>
                    </div>
                  );
                }
                if (item.type === "url") {
                  return (
                    <p key={i} className={styles.hint}>
                      A browser window has been opened. Complete authorization there.
                    </p>
                  );
                }
                return <p key={i} className={styles.hint}>{item.value}</p>;
              })}
              {error && <p className={styles.errorText}>{error}</p>}
              <div className={styles.spinnerRow}>
                <span className={styles.spinnerDot} />
                Waiting for authorization…
              </div>
            </>
          )}
        </div>
      );
    }

    const hasFields = selectedFlow.fields && selectedFlow.fields.length > 0;

    if (hasFields) {
      return (
        <div className={styles.connectSection}>
          {selectedFlow.fields!.map((field) => (
            <div key={field.name}>
              {field.url && (
                <p className={styles.hint}>
                  Not sure about it?{" "}
                  <button
                    className={styles.linkBtn}
                    onClick={async () => {
                      try { await shellOpen(field.url!); }
                      catch { window.open(field.url!, "_blank"); }
                    }}
                  >
                    Setup the new one <span className={styles.externalLinkIcon}>↗</span>
                  </button>
                </p>
              )}
              <input
                className={styles.input}
                type={field.name === "key" ? "password" : "text"}
                placeholder={field.placeholder}
                value={fieldValues[field.name] ?? ""}
                onChange={(e) => {
                  setFieldValues((prev) => ({ ...prev, [field.name]: e.target.value }));
                  setError(null);
                }}
                onKeyDown={(e) => e.key === "Enter" && handleFieldSubmit()}
                autoFocus
              />
            </div>
          ))}
          {error && <p className={styles.errorText}>{error}</p>}
        </div>
      );
    }

    if (selectedFlow.grant === "pkce" || selectedFlow.grant === "oauth" || selectedFlow.grant === "device") {
      return (
        <div className={styles.connectSection}>
          {error && <p className={styles.errorText}>{error}</p>}
          <p className={styles.hint}>Ready to connect this provider.</p>
        </div>
      );
    }

    return null;
  };

  const handleConnect = async () => {
    const autoConnect = ["pkce", "oauth", "device"].includes(selectedFlow?.grant ?? "");

    if (step === "select") {
      setHasStepped(true);
      setDirection("forward");
      setStep("connect");
      return;
    }

    if (autoConnect) handleAuthFlow();
    else handleFieldSubmit();
  };

  const canConnect = () => {
    if (step === "select") return !!selectedCompany && !!selectedFlow;
    if (pending) return false;
    const autoConnect = ["pkce", "oauth", "device"].includes(selectedFlow?.grant ?? "");
    const hasFields = !!selectedFlow?.fields?.length;

    if (hasFields) {
      return selectedFlow!.fields!.every((f) => {
        const val = fieldValues[f.name]?.trim();
        return !!val || !!f.placeholder;
      });
    }

    if (autoConnect) return true;
    return true;
  };

  const connectLabel = () => (step === "select" ? "Next" : saving ? "Connecting…" : "Connect");

  const body = (
    <>
      <div className={`${styles.modalBody} ${inline ? styles.inlineBody : ""}`}>
        <div
          key={`${step}-${direction}-${hasStepped ? "1" : "0"}`}
          className={`${styles.stepPane} ${hasStepped
            ? direction === "forward"
              ? styles.stepEnterFromRight
              : styles.stepEnterFromLeft
            : ""}`}
        >
          {step === "select" ? renderSelectStep() : renderConnectStep()}
        </div>
      </div>

      <div className={`${styles.modalFooter} ${inline ? styles.inlineFooter : ""}`}>
        {step === "connect" ? (
          <button className={styles.btnMuted} onClick={resetFlow}>
            Back
          </button>
        ) : onBack ? (
          <button className={styles.btnMuted} onClick={onBack}>
            Back
          </button>
        ) : (
          <button className={styles.btnMuted} onClick={onClose}>
            Cancel
          </button>
        )}

        {inline && <div style={{ flex: 1 }} />}

        {!(step === "connect" && pending) && (
          <button
            className={styles.btnPrimary}
            onClick={handleConnect}
            disabled={!canConnect() || saving}
          >
            {connectLabel()}
          </button>
        )}
      </div>
    </>
  );

  if (inline) return <div className={styles.inlineWrap}>{body}</div>;

  return (
    <div
      ref={overlayRef}
      className={styles.overlay}
      onMouseDown={(e) => { mouseDownOnOverlay.current = e.target === overlayRef.current; }}
      onMouseUp={(e) => {
        if (mouseDownOnOverlay.current && e.target === overlayRef.current) onClose();
        mouseDownOnOverlay.current = false;
      }}
    >
      <div className={styles.modal}>
        <div className={styles.modalHeader}>
          <span>New Connection</span>
          <button className={styles.closeBtn} onClick={onClose}>
            <X size={14} strokeWidth={1.5} />
          </button>
        </div>
        {body}
      </div>
    </div>
  );
}
