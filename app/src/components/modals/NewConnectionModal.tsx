import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { open as shellOpen } from "@tauri-apps/plugin-shell";

import type { AuthFlowDefinition, AuthRequest, AuthRequestField, AuthVerdict } from "@sparky/auth-core";

const AUTH_TIMEOUT = 600_000;
import {
  Check,
  Loader2,
  X,
} from "lucide-react";
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
  /** Back button callback — shown in footer when provided */
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
  const [step, setStep] = useState<"select" | "install" | "connect">("select");
  const [fieldValues, setFieldValues] = useState<Record<string, string>>({});
  const [display, setDisplay] = useState<AuthRequestField[]>([]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [installProgress, setInstallProgress] = useState(0);
  const [installStatus, setInstallStatus] = useState<"idle" | "installing" | "done" | "error">("idle");
  const [installError, setInstallError] = useState<string | null>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const mouseDownOnOverlay = useRef(false);

  const resetFlow = useCallback(() => {
    setSelectedCompany(inline ? "" : (groups[0]?.company ?? ""));
    setSelectedFlowIdx(0);
    setStep("select");
    setFieldValues({});
    setDisplay([]);
    setPending(false);
    setError(null);
    setSaving(false);
    setInstallProgress(0);
    setInstallStatus("idle");
    setInstallError(null);
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
  const selectedProvider = selectedFlow?.provider ?? "";
  const provider = providers.find((p) => p.id === selectedProvider);

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

  const requiredTool = (providerId: string): string | null => {
    if (providerId.startsWith("anthropic")) return "claude";
    if (providerId === "copilot") return "copilot";
    return null;
  };

  const toolLabel = (tool: string): string => {
    if (tool === "claude") return "Claude CLI";
    if (tool === "copilot") return "Copilot CLI";
    return tool;
  };

  const toolIcon = (tool: string): string => {
    if (tool === "claude") return "/icons/providers/anthropic.svg";
    if (tool === "copilot") return "/icons/providers/copilot.svg";
    return "";
  };

  const handleAuthFlow = async () => {
    if (!conn || !selectedFlow) return;
    const { domain, provider: prov, grant } = selectedFlow;

    setError(null);
    try {
      const request = await conn.request<AuthRequest>(
        "auth.start", { domain, provider: prov, grant },
        { timeout: AUTH_TIMEOUT },
      );

      setDisplay(request.display);
      setPending(true);

      for (const item of request.display) {
        if (item.type === "code") {
          try { await navigator.clipboard.writeText(item.value); } catch { /* ignore */ }
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

  const handleStartInstall = async () => {
    const tool = requiredTool(selectedProvider);
    if (!tool) return;

    setInstallStatus("installing");
    setInstallProgress(0);
    setInstallError(null);

    const unlisten = await listen<{ step: string; status: string; progress: number; message?: string }>(
      "vendor-progress",
      (event) => {
        if (event.payload.step === tool) {
          setInstallProgress(event.payload.progress);
          if (event.payload.status === "done") setInstallStatus("done");
          else if (event.payload.status === "error") {
            setInstallStatus("error");
            setInstallError(event.payload.message ?? "Installation failed");
          }
        }
      },
    );

    try {
      await invoke("vendor_install", { tool });
      setTimeout(() => {
        setStep("connect");
        const grant = selectedFlow?.grant;
        if (grant === "pkce" || grant === "oauth" || grant === "device") handleAuthFlow();
      }, 500);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setInstallStatus("error");
      setInstallError(msg);
    } finally {
      unlisten();
    }
  };

  const renderInstallStep = () => {
    const tool = requiredTool(selectedProvider);
    if (!tool) return null;

    return (
      <div className={styles.installSection}>
        <img src={toolIcon(tool)} alt={toolLabel(tool)} className={styles.installIcon} />
        <span className={styles.installTitle}>Install {toolLabel(tool)}</span>
        <span className={styles.installHint}>
          {toolLabel(tool)} is required to connect to {provider?.name ?? selectedCompany}. It will be installed into ~/.sparky/vendor/.
        </span>

        {installStatus === "installing" && (
          <>
            <div className={styles.installProgress}>
              <div className={styles.installProgressFill} style={{ width: `${installProgress}%` }} />
            </div>
            <span className={styles.installStatus}>
              <Loader2 size={12} className={styles.installSpinner} />
              Installing…
            </span>
          </>
        )}

        {installStatus === "done" && (
          <span className={styles.installStatus}>
            <Check size={12} strokeWidth={2.5} style={{ color: "var(--success, #4caf50)" }} />
            Installed
          </span>
        )}

        {installStatus === "error" && <span className={styles.errorText}>{installError}</span>}
      </div>
    );
  };

  const renderConnectStep = () => {
    if (!selectedFlow) return null;

    if (pending && display.length > 0) {
      return (
        <div className={styles.connectSection}>
          {saving ? (
            <>
              <div className={styles.spinnerRow}>
                <span className={styles.spinnerDot} />
                Setting up connection…
              </div>
            </>
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
                <button
                  className={styles.linkBtn}
                  onClick={async () => {
                    try { await shellOpen(field.url!); }
                    catch { window.open(field.url!, "_blank"); }
                  }}
                >
                  {field.label}
                </button>
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
          <div className={styles.spinnerRow}>
            <span className={styles.spinnerDot} />
            Connecting…
          </div>
        </div>
      );
    }

    return null;
  };

  const handleConnect = async () => {
    if (step === "select") {
      const tool = requiredTool(selectedProvider);
      if (tool) {
        try {
          const deps = await invoke<{ id: string; status: string }[]>("vendor_check");
          const dep = deps.find((d) => d.id === tool);
          if (dep && dep.status !== "installed") {
            setStep("install");
            return;
          }
        } catch { /* proceed */ }
      }

      const grant = selectedFlow?.grant;
      if (grant === "pkce" || grant === "oauth" || grant === "device") {
        setStep("connect");
        handleAuthFlow();
        return;
      }

      setStep("connect");
      return;
    }

    if (step === "install") {
      handleStartInstall();
      return;
    }

    if (selectedFlow?.fields?.length) {
      handleFieldSubmit();
    }
  };

  const canConnect = () => {
    if (step === "select") return !!selectedCompany && !!selectedFlow;
    if (step === "install") return installStatus === "idle" || installStatus === "error";
    if (pending) return false;
    const grant = selectedFlow?.grant;
    if (grant === "pkce" || grant === "oauth" || grant === "device") return false;
    if (selectedFlow?.fields?.length) {
      const requiredFilled = selectedFlow.fields.every((f) => {
        const val = fieldValues[f.name]?.trim();
        return !!val || !!f.placeholder;
      });
      return requiredFilled;
    }
    return true;
  };

  const connectLabel = () => {
    if (step === "select") {
      if (selectedFlow?.fields?.length) return "Next";
      return "Connect";
    }
    if (step === "install") {
      if (installStatus === "installing") return "Installing…";
      if (installStatus === "error") return "Retry";
      return "Install";
    }
    if (saving) return "Connecting…";
    return "Connect";
  };

  const body = (
    <>
      <div className={`${styles.modalBody} ${inline ? styles.inlineBody : ""}`}>
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

        {step === "install" && renderInstallStep()}
        {step === "connect" && renderConnectStep()}
      </div>
      <div className={`${styles.modalFooter} ${inline ? styles.inlineFooter : ""}`}>
        {onBack && (
          <button className={styles.btnMuted} onClick={onBack}>
            Back
          </button>
        )}
        {!inline && !onBack && (
          <button className={styles.btnMuted} onClick={onClose}>
            Cancel
          </button>
        )}
        {inline && <div style={{ flex: 1 }} />}
        {!(step === "install" && (installStatus === "installing" || installStatus === "done")) &&
         !(step === "connect" && pending) && (
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
