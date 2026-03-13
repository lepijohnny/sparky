import ReactMarkdown from "react-markdown";
import { Globe } from "lucide-react";
import { useStore } from "../../store";

import { serviceTransport, type EndpointStatus, type ServiceInfo } from "../../types/service";
import shared from "../../styles/shared.module.css";
import styles from "./ConnectionsDetailsPage.module.css";

interface ConnectionsDetailsPageProps {
  connectionId: string;
}

const METHOD_COLORS: Record<string, string> = {
  DELETE: "var(--accent-red, #ef4444)",
};

function formatDate(ts: number): string {
  const d = new Date(ts);
  const date = d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })
    + " " + d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  const days = Math.floor((Date.now() - ts) / 86_400_000);
  return `${date} (${days} day${days !== 1 ? "s" : ""} ago)`;
}

const STATUS_CLASS: Record<EndpointStatus, string> = {
  unvalidated: styles.statusUnvalidated,
  validated: styles.statusValidated,
  healing: styles.statusHealing,
  failed: styles.statusFailed,
};

export default function ConnectionsDetailsPage({ connectionId }: ConnectionsDetailsPageProps) {
  const connections = useStore((s) => s.connections);
  const guide = useStore((s) => s.connectionGuides.get(connectionId) ?? null);

  const service = connections.find((s) => s.id === connectionId);

  if (!service) {
    return (
      <div className={styles.empty}>
        <span>Connection not found.</span>
      </div>
    );
  }

  const transport = serviceTransport(service);

  return (
    <div className={styles.page}>
      <div className={styles.inner}>
        <div className={styles.fixed}>
          <div className={styles.header}>
            {service.icon ? (
              <img src={service.icon} alt="" className={styles.icon} />
            ) : (
              <div className={styles.iconPlaceholder}>
                <Globe size={20} strokeWidth={1.5} />
              </div>
            )}
            <span className={styles.name}>{service.label}</span>
            <span className={styles.badge}>{transport}</span>
          </div>

          <div className={shared.card}>
            <div className={shared.cardHeader}>Connection</div>
            <div className={shared.cardBody}>
              <div className={styles.rows}>
                <div className={styles.row}>
                  <span className={styles.rowLabel}>Transport</span>
                  <span className={styles.rowValue}>{transport}</span>
                </div>
                <div className={styles.row}>
                  <span className={styles.rowLabel}>Auth</span>
                  <span className={styles.rowValue}>{service.auth.strategy}</span>
                </div>
                <div className={styles.row}>
                  <span className={styles.rowLabel}>URL</span>
                  <span className={styles.rowValueMono}>{service.baseUrl}</span>
                </div>
                {service.lastTestedAt && (
                  <div className={styles.row}>
                    <span className={styles.rowLabel}>Last tested</span>
                    <span className={styles.rowValue}>{formatDate(service.lastTestedAt)}</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className={shared.card}>
            <div className={shared.cardHeader}>Endpoints ({service.endpoints.length})</div>
            <div className={`${shared.cardBody} ${styles.toolsScroll}`}>
              {service.endpoints.length > 0 ? (
                <div className={styles.actions}>
                  {service.endpoints.map((ep) => (
                    <div key={ep.name} className={styles.action}>
                      <div className={`${styles.statusDot} ${STATUS_CLASS[ep.status] ?? styles.statusUnvalidated}`} />
                      {ep.transport.type === "rest" && ep.transport.method && (
                        <span
                          className={styles.method}
                          style={{ color: METHOD_COLORS[ep.transport.method] ?? "var(--fg-muted)" }}
                        >
                          {ep.transport.method}
                        </span>
                      )}
                      <span className={styles.actionName}>{ep.name}</span>
                      {ep.transport.type === "rest" && ep.transport.path && (
                        <span className={styles.actionPath}>{ep.transport.path}</span>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <span className={styles.hint}>No endpoints defined.</span>
              )}
            </div>
          </div>
        </div>

        {guide && (
          <div className={shared.card} style={{ margin: "16px 20px 20px", flex: 1, minHeight: 0, display: "flex", flexDirection: "column", overflow: "hidden" }}>
            <div className={shared.cardHeader}>Documentation</div>
            <div className={`${shared.cardBody} ${styles.guide} ${styles.docsScroll}`}>
              <ReactMarkdown>{guide}</ReactMarkdown>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
