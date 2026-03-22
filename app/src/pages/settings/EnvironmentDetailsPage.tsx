import {
  useCallback,
  useEffect,
  useState,
} from "react";
import { useConnection } from "../../context/ConnectionContext";
import { useStore } from "../../store";
import shared from "../../styles/shared.module.css";
import local from "./EnvironmentDetailsPage.module.css";

interface EnvEntry {
  key: string;
  name: string;
  skill: string;
}

export default function EnvironmentDetailsPage() {
  const { conn } = useConnection();
  const skills = useStore((s) => s.skills);
  const [entries, setEntries] = useState<EnvEntry[]>([]);
  const [varName, setVarName] = useState("");
  const [varValue, setVarValue] = useState("");
  const [varSkill, setVarSkill] = useState("");
  const [saving, setSaving] = useState(false);
  const [allowlist, setAllowlist] = useState<string[]>([]);
  const [hostInput, setHostInput] = useState("");

  const load = useCallback(async () => {
    if (!conn) return;
    try {
      const { keys } = await conn.request<{ keys: string[] }>("cred.list");
      const envKeys = keys.filter((k) => k.startsWith("env.") && !k.startsWith("env.meta."));
      const metaKeys = keys.filter((k) => k.startsWith("env.meta."));

      const metaMap: Record<string, string> = {};
      for (const mk of metaKeys) {
        const res = await conn.request<{ value: string | null }>("cred.get", { key: mk });
        if (res.value) metaMap[mk.slice(9)] = res.value;
      }

      setEntries(envKeys.map((k) => {
        const name = k.slice(4);
        return { key: k, name, skill: metaMap[name] ?? "" };
      }));
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
    const skill = varSkill.trim();
    if (!name || !value || !conn) return;
    setSaving(true);
    try {
      await conn.request("cred.set", { key: `env.${name}`, value });
      if (skill) {
        await conn.request("cred.set", { key: `env.meta.${name}`, value: skill });
      }
      setVarName("");
      setVarValue("");
      setVarSkill("");
      await load();
    } catch (err) {
      console.error("Failed to store variable:", err);
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteVariable = async (entry: EnvEntry) => {
    if (!conn) return;
    setSaving(true);
    try {
      await conn.request("cred.delete", { key: entry.key });
      if (entry.skill) {
        await conn.request("cred.delete", { key: `env.meta.${entry.name}` });
      }
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
          {entries.length > 0 ? (
            <div className={local.varList}>
              {entries.map((entry) => (
                <div key={entry.key} className={local.varRow}>
                  <span className={local.varKey}>{entry.name}</span>
                  {entry.skill && <span className={local.varSkill}>{entry.skill}</span>}
                  <span className={local.varValue}>••••••••</span>
                  <button
                    className={shared.btnDanger}
                    onClick={() => handleDeleteVariable(entry)}
                    disabled={saving}
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div className={shared.emptyState}>
              No variables configured. Add environment variables for tools and skills.
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
            />
            <input
              className={local.inputSkill}
              type="text"
              list="skill-suggestions"
              placeholder="Skill (optional)"
              value={varSkill}
              onChange={(e) => setVarSkill(e.target.value)}
            />
            <datalist id="skill-suggestions">
              {skills.map((s) => (
                <option key={s.id} value={s.id} />
              ))}
            </datalist>
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
