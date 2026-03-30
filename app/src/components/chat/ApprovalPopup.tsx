import { ExternalLink, FileText, Globe, KeyRound, Pencil, ShieldAlert, Terminal } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { open as shellOpen } from "@tauri-apps/plugin-shell";
import { useConnection } from "../../context/ConnectionContext";
import { useWsSubscriber } from "../../hooks/useWsSubscriber";
import styles from "./ApprovalPopup.module.css";

import { humanizeToolTarget } from "../../lib/activityUtils";

interface ApprovalField {
  name: string;
  label: string;
  type: string;
}

interface OAuthConfig {
  authUrl: string;
  tokenUrl: string;
  scopes: string[];
  tokenKey: string;
}

interface ApprovalRequest {
  requestId: string;
  type: "confirm:yesno" | "input:credentials" | "input:oauth";
  service?: string;
  tool?: string;
  target?: string;
  message: string;
  canPersist: boolean;
  alwaysAsk?: boolean;
  timeoutMs: number;
  remainingMs: number;
  description?: string;
  fields?: ApprovalField[];
  link?: string;
  oauth?: OAuthConfig;
}

function ApprovalItem({
  request,
  conn,
  onResolve,
  onExpired,
}: {
  request: ApprovalRequest;
  conn: import("../../lib/ws").WsConnection | null;
  onResolve: (requestId: string, approved: boolean, persist: boolean, chatLevel?: boolean) => void;
  onExpired: () => void;
}) {
  const totalS = Math.ceil(request.timeoutMs / 1000);
  const initialS = Math.ceil(request.remainingMs / 1000);
  const [remaining, setRemaining] = useState(initialS);
  const [animate, setAnimate] = useState(false);
  const [values, setValues] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [oauthPhase, setOauthPhase] = useState<"fields" | "waiting">("fields");
  const [oauthError, setOauthError] = useState<string | null>(null);
  const startRef = useRef(Date.now());
  const resolvedRef = useRef(false);
  const firstInputRef = useRef<HTMLInputElement>(null);

  const isConnection = request.type === "input:credentials" || request.type === "input:oauth";
  const isOAuth = request.type === "input:oauth" && !!request.oauth;
  const hasFields = request.fields && request.fields.length > 0;
  const svcPrefix = request.service ? `svc.${request.service}.` : "svc.";
  const fieldsFilled = !hasFields || request.fields!.every((f) => (values[f.name] ?? "").trim().length > 0);

  const allFilled = isOAuth
    ? fieldsFilled
    : !isConnection || request.fields!.every((f) => (values[f.name] ?? "").trim().length > 0);

  const handleStartOAuth = useCallback(async () => {
    if (!request.oauth || !fieldsFilled || !conn) return;
    setOauthError(null);
    setSubmitting(true);
    setOauthPhase("waiting");

    try {
      const clientIdField = request.fields?.find((f) => f.name.includes("CLIENT_ID"));
      const clientSecretField = request.fields?.find((f) => f.name.includes("CLIENT_SECRET"));

      const clientId = clientIdField ? values[clientIdField.name].trim() : "";
      const clientSecret = clientSecretField ? values[clientSecretField.name].trim() : undefined;

      const { authorizeUrl } = await conn.request<{ authorizeUrl: string }>(
        "svc.oauth.start",
        {
          service: request.service!,
          authUrl: request.oauth!.authUrl,
          tokenUrl: request.oauth!.tokenUrl,
          clientId,
          clientSecret,
          scopes: request.oauth!.scopes,
          tokenKey: request.oauth!.tokenKey,
        },
      );

      try { await shellOpen(authorizeUrl); } catch { window.open(authorizeUrl, "_blank"); }

      const result = await conn.request<{ ok: boolean; error?: string }>(
        "svc.oauth.finish",
        { service: request.service! },
        { timeout: 600_000 },
      );

      if (!result.ok) {
        setOauthError(result.error ?? "Authorization failed");
        setOauthPhase("fields");
        setSubmitting(false);
        return;
      }

      if (hasFields) {
        for (const field of request.fields!) {
          await conn.request("cred.set", { key: `${svcPrefix}${field.name}`, value: values[field.name].trim() });
        }
      }

      resolvedRef.current = true;
      onResolve(request.requestId, true, false);
    } catch (err) {
      setOauthError(err instanceof Error ? err.message : String(err));
      setOauthPhase("fields");
      setSubmitting(false);
    }
  }, [request.oauth, request.fields, request.service, request.requestId, values, fieldsFilled, hasFields, conn, svcPrefix, onResolve]);

  const handleResolve = useCallback(async (approved: boolean, persist: boolean, chatLevel?: boolean) => {
    if (resolvedRef.current) return;

    if (approved && isConnection && conn) {
      setSubmitting(true);
      try {
        if (request.type === "input:credentials") {
          for (const field of request.fields!) {
            await conn.request("cred.set", { key: `${svcPrefix}${field.name}`, value: values[field.name].trim() });
          }
        }
      } catch (err) {
        console.error("Failed to store secrets:", err);
        if (isOAuth) setOauthError(err instanceof Error ? err.message : String(err));
        setSubmitting(false);
        return;
      }
    }

    resolvedRef.current = true;
    onResolve(request.requestId, approved, persist, chatLevel);
  }, [request.requestId, request.type, request.fields, values, isConnection, conn, onResolve]);

  useEffect(() => {
    if (isConnection && !isOAuth) {
      requestAnimationFrame(() => firstInputRef.current?.focus());
    }
  }, [isConnection, isOAuth]);

  useEffect(() => {
    const raf = requestAnimationFrame(() => setAnimate(true));
    const interval = setInterval(() => {
      const elapsed = Math.floor((Date.now() - startRef.current) / 1000);
      const left = Math.max(0, initialS - elapsed);
      setRemaining(left);
      if (left === 0) {
        clearInterval(interval);
        onExpired();
      }
    }, 1000);
    return () => { cancelAnimationFrame(raf); clearInterval(interval); };
  }, [handleResolve, initialS, onExpired]);

  const pct = (remaining / totalS) * 100;

  const renderFields = () => {
    if (isOAuth && oauthPhase === "fields") {
      return (
        <div className={styles.fields}>
          {hasFields && request.fields!.map((field, i) => (
            <div key={field.name} className={styles.field}>
              <label className={styles.fieldLabel}>{field.label}</label>
              <input
                ref={i === 0 ? firstInputRef : undefined}
                className={styles.fieldInput}
                type={field.type === "password" ? "password" : "text"}
                value={values[field.name] ?? ""}
                onChange={(e) => setValues((v) => ({ ...v, [field.name]: e.target.value }))}
                onKeyDown={(e) => { if (e.key === "Enter" && fieldsFilled) handleStartOAuth(); }}
                placeholder={field.label}
              />
            </div>
          ))}
        </div>
      );
    }

    if (isOAuth && oauthPhase === "waiting") {
      return (
        <div className={styles.fields}>
          <div className={styles.detail}>Waiting for authorization in browser…</div>
          {oauthError && <div className={styles.oauthError}>{oauthError}</div>}
        </div>
      );
    }

    if (isConnection && hasFields) {
      return (
        <div className={styles.fields}>
          {request.fields!.map((field, i) => (
            <div key={field.name} className={styles.field}>
              <label className={styles.fieldLabel}>{field.label}</label>
              <input
                ref={i === 0 ? firstInputRef : undefined}
                className={styles.fieldInput}
                type={field.type === "password" ? "password" : "text"}
                value={values[field.name] ?? ""}
                onChange={(e) => setValues((v) => ({ ...v, [field.name]: e.target.value }))}
                placeholder={field.label}
              />
            </div>
          ))}
        </div>
      );
    }

    return null;
  };

  const renderActions = () => {
    if (isOAuth && oauthPhase === "fields") {
      return (
        <div className={styles.actions}>
          <button
            className={`${styles.btn} ${styles.approve}`}
            onClick={handleStartOAuth}
            disabled={!fieldsFilled || submitting}
          >
            {submitting ? "Connecting…" : "Submit"}
          </button>
          <button className={`${styles.btn} ${styles.deny}`} onClick={() => handleResolve(false, false)}>
            Cancel
          </button>
        </div>
      );
    }

    if (isOAuth && oauthPhase === "waiting") {
      return (
        <div className={styles.actions}>
          <button className={`${styles.btn} ${styles.deny}`} onClick={() => handleResolve(false, false)}>
            Cancel
          </button>
        </div>
      );
    }

    return (
      <div className={styles.actions}>
        <button
          className={`${styles.btn} ${styles.approve}`}
          onClick={() => handleResolve(true, false)}
          disabled={!allFilled || submitting}
        >
          {isConnection ? (submitting ? "Saving…" : "Submit") : "Approve once"}
        </button>
        {!isConnection && !request.alwaysAsk && (
          <button
            className={`${styles.btn} ${styles.approveChat}`}
            onClick={() => handleResolve(true, false, true)}
          >
            Approve all
          </button>
        )}
        <button
          className={`${styles.btn} ${styles.deny}`}
          onClick={() => handleResolve(false, false)}
        >
          {isConnection ? "Cancel" : "Deny"}
        </button>
      </div>
    );
  };

  return (
    <div
      className={styles.popup}
      onKeyDown={(e) => {
        if (e.key === "Escape") handleResolve(false, false);
      }}
    >
      <div className={styles.header}>
        {isConnection
          ? <KeyRound size={14} strokeWidth={1.5} className={styles.icon} />
          : <ShieldAlert size={14} strokeWidth={1.5} className={styles.icon} />
        }
        {isConnection ? request.message : "Approval Required"}
      </div>
      {request.description && <div className={styles.detail}>{request.description}</div>}
      {!isConnection && !request.description && request.tool === "app_bash" && (
        <div className={styles.targetBlock}>
          <div className={styles.targetHeader}>
            <Terminal size={12} strokeWidth={1.5} />
            <span className={styles.targetLabel}>Shell Command</span>
          </div>
          <pre className={styles.targetCode}>{(request.target ?? request.message).replace(/^\n+|\n+$/g, "")}</pre>
        </div>
      )}
      {!isConnection && !request.description && request.tool !== "app_bash" && (
        <div className={styles.detail}>{humanizeToolTarget(request.tool, request.target) || request.message}</div>
      )}
      {request.link && (
        <a
          className={styles.link}
          href="#"
          onClick={(e) => { e.preventDefault(); shellOpen(request.link!); }}
        >
          <ExternalLink size={11} strokeWidth={1.5} />
          Open setup page
        </a>
      )}
      {renderFields()}
      <div className={styles.timerBar}>
        <div
          className={styles.timerFill}
          style={{ width: `${pct}%`, transition: animate ? "width 1s linear" : "none" }}
        />
      </div>
      {renderActions()}
      <div className={styles.timer}>{remaining >= 60 ? `${Math.floor(remaining / 60)}m ${remaining % 60}s` : `${remaining}s`} remaining</div>
    </div>
  );
}

/**
 * Floating popup that intercepts destructive tool calls.
 * Fetches pending approval on mount, subscribes to real-time updates.
 */
export default function ApprovalPopup({ chatId }: { chatId: string }) {
  const { conn } = useConnection();
  const [request, setRequest] = useState<ApprovalRequest | null>(null);

  useEffect(() => {
    if (!conn) return;
    conn.request<ApprovalRequest | null>("tool.approval.pending", { chatId })
      .then((res) => { if (res) setRequest(res); })
      .catch(() => {});
  }, [conn, chatId]);

  useWsSubscriber<ApprovalRequest & { chatId: string }>(conn, "tool.approval.request", (data) => {
    if (data.chatId === chatId) {
      setRequest({ ...data, remainingMs: data.remainingMs ?? data.timeoutMs });
    }
  });

  useWsSubscriber<{ requestId: string }>(conn, "tool.approval.dismissed", (data) => {
    setRequest((prev) => prev?.requestId === data.requestId ? null : prev);
  });

  const resolve = useCallback(
    (requestId: string, approved: boolean, persist: boolean, chatLevel?: boolean) => {
      setRequest(null);
      conn?.request("tool.approval.resolve", { requestId, approved, persist, chatLevel }).catch(() => {});
    },
    [conn],
  );

  if (!request) return null;

  return (
    <div className={styles.overlay}>
      <ApprovalItem
        key={request.requestId}
        request={request}
        conn={conn}
        onResolve={resolve}
        onExpired={() => setRequest(null)}
      />
    </div>
  );
}
