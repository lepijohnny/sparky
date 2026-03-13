import {
  useCallback,
  useEffect,
  useState,
} from "react";
import { useConnection } from "../../context/ConnectionContext";
import shared from "../../styles/shared.module.css";
import local from "./EnvironmentDetailsPage.module.css";

export default function EnvironmentDetailsPage() {
  const { conn } = useConnection();
  const [envKeys, setEnvKeys] = useState<string[]>([]);
  const [varName, setVarName] = useState("");
  const [varValue, setVarValue] = useState("");
  const [saving, setSaving] = useState(false);
  const [allowlist, setAllowlist] = useState<string[]>([]);
  const [hostInput, setHostInput] = useState("");

  const load = useCallback(async () => {
    if (!conn) return;
    try {
      const { keys } = await conn.request<{ keys: string[] }>("cred.list");
      setEnvKeys(keys.filter((k) => k.startsWith("env.")));
    } catch (err) {
      console.error("Failed to list credentials:", err);
    }
  }, [conn]);

  const loadAllowlist = useCallback(async () => {
    if (!conn) return;
    try {
      const res = await conn.request<{ entries: string[] }>("settings.sandbox.allowlist.list");
      setAllowlist(res.entries);
    } catch (err) {
      console.error("Failed to load allowlist:", err);
    }
  }, [conn]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { loadAllowlist(); }, [loadAllowlist]);

  const handleAddHost = async () => {
    const host = hostInput.trim().toLowerCase();
    if (!host || !conn) return;
    setSaving(true);
    try {
      await conn.request("settings.sandbox.allowlist.add", { host });
      setHostInput("");
      await loadAllowlist();
    } catch (err) {
      console.error("Failed to add host:", err);
    } finally {
      setSaving(false);
    }
  };

  const handleRemoveHost = async (host: string) => {
    if (!conn) return;
    setSaving(true);
    try {
      await conn.request("settings.sandbox.allowlist.remove", { host });
      await loadAllowlist();
    } catch (err) {
      console.error("Failed to remove host:", err);
    } finally {
      setSaving(false);
    }
  };

  const handleAddVariable = async () => {
    const name = varName.trim();
    const value = varValue.trim();
    if (!name || !value || !conn) return;
    setSaving(true);
    try {
      await conn.request("cred.set", { key: `env.${name}`, value });
      setVarName("");
      setVarValue("");
      await load();
    } catch (err) {
      console.error("Failed to store variable:", err);
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteVariable = async (key: string) => {
    if (!conn) return;
    setSaving(true);
    try {
      await conn.request("cred.delete", { key });
      await load();
    } catch (err) {
      console.error("Failed to delete variable:", err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={shared.contentArea}>
      <div className={shared.card}>
        <div className={shared.cardHeader}>Variables</div>
        <div className={shared.cardBody}>
          {envKeys.length > 0 ? (
            <div className={local.varList}>
              {envKeys.map((key) => (
                <div key={key} className={local.varRow}>
                  <span className={local.varKey}>{key.replace(/^env\./, "")}</span>
                  <span className={local.varValue}>••••••••</span>
                  <button
                    className={shared.btnDanger}
                    onClick={() => handleDeleteVariable(key)}
                    disabled={saving}
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div className={shared.emptyState}>
              No variables configured. Add environment variables for use in sandboxes.
            </div>
          )}
          <div className={local.addForm}>
            <input
              className={local.input}
              type="text"
              placeholder="NAME"
              value={varName}
              onChange={(e) => setVarName(e.target.value.toUpperCase())}
            />
            <input
              className={local.input}
              type="password"
              placeholder="Value"
              value={varValue}
              onChange={(e) => setVarValue(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAddVariable()}
            />
            <button
              className={shared.btn}
              onClick={handleAddVariable}
              disabled={saving || !varName.trim() || !varValue.trim()}
            >
              Add
            </button>
          </div>
        </div>
      </div>

      {/* Network Allowlist */}
      <div className={shared.card}>
        <div className={shared.cardHeader}>Network Allowlist</div>
        <div className={shared.cardBody}>
          {allowlist.length > 0 ? (
            <div className={local.varList}>
              {allowlist.map((host) => (
                <div key={host} className={local.varRow}>
                  <span className={local.varKey}>{host}</span>
                  <button
                    className={shared.btnDanger}
                    onClick={() => handleRemoveHost(host)}
                    disabled={saving}
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div className={shared.emptyState}>
              No hosts allowed. Hosts added here will be accessible from sandboxes.
            </div>
          )}
          <div className={local.addForm}>
            <input
              className={local.input}
              type="text"
              placeholder="api.example.com"
              value={hostInput}
              onChange={(e) => setHostInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAddHost()}
              style={{ flex: 1 }}
            />
            <button
              className={shared.btn}
              onClick={handleAddHost}
              disabled={saving || !hostInput.trim()}
            >
              Add
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
