import {
  useEffect,
  useState,
} from "react";
import { useConnection } from "../../context/ConnectionContext";
import { useWsRequest } from "../../hooks/useWsRequest";
import shared from "../../styles/shared.module.css";
import local from "./DebugDetailsPage.module.css";

export default function DebugDetailsPage() {
  const { conn } = useConnection();
  const { data } = useWsRequest<{ enabled: boolean }>(conn, "debug.recording.get", undefined);
  const [recording, setRecording] = useState(false);

  useEffect(() => {
    if (data) setRecording(data.enabled);
  }, [data]);

  const handleToggle = async () => {
    if (!conn) return;
    const next = !recording;
    try {
      await conn.request("debug.recording.set", { enabled: next });
      setRecording(next);
    } catch (err) {
      console.error("Failed to toggle recording:", err);
    }
  };

  return (
    <div className={shared.contentArea}>
      <div className={shared.card}>
        <div className={shared.cardHeader}>Agent Recording</div>
        <div className={shared.cardBodyRow}>
          <div className={shared.fieldText}>
            <label className={shared.fieldLabel}>Record Sessions</label>
            <p className={shared.fieldHint}>
              {recording
                ? "Recording active. Agent responses are saved to the workspace recordings folder."
                : "When enabled, all agent responses are recorded to JSON files for replay in tests."}
            </p>
          </div>
          <div className={local.toggleWrap}>
            <button
              type="button"
              className={`${local.toggle} ${recording ? local.toggleOn : ""}`}
              onClick={handleToggle}
              aria-label="Toggle recording"
            >
              <span className={local.toggleKnob} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
