import { useCallback, useEffect, useRef, useState } from "react";
import { useConnection } from "../../context/ConnectionContext";
import { useWsRequest } from "../../hooks/useWsRequest";
import shared from "../../styles/shared.module.css";
import styles from "./ProfileDetailsPage.module.css";
import type { Profile } from "../../types/profile";

export default function ProfileDetailsPage({ onboarding }: { onboarding?: boolean }) {
  const { conn } = useConnection();
  const { data } = useWsRequest<{ profile: Profile }>(conn, "settings.profile.get", undefined, []);
  const profile = data?.profile ?? {};

  const [nickname, setNickname] = useState("");
  const [timezone, setTimezone] = useState("");
  const [language, setLanguage] = useState("");
  const [contextPrompt, setContextPrompt] = useState("");
  const initialized = useRef(false);

  useEffect(() => {
    if (!data || initialized.current) return;
    initialized.current = true;
    setNickname(data.profile.nickname ?? "");
    setTimezone(data.profile.timezone ?? "");
    setLanguage(data.profile.language ?? "");
    setContextPrompt(data.profile.contextPrompt ?? "");
  }, [data]);

  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const save = useCallback((updates: Partial<Profile>) => {
    if (!conn) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      conn.request("settings.profile.set", updates);
    }, 500);
  }, [conn]);

  const handleNickname = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setNickname(val);
    save({ ...profile, nickname: val });
  }, [save, profile]);

  const handleTimezone = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setTimezone(val);
    save({ ...profile, timezone: val });
  }, [save, profile]);

  const handleLanguage = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setLanguage(val);
    save({ ...profile, language: val });
  }, [save, profile]);

  const handleContextPrompt = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setContextPrompt(val);
    save({ ...profile, contextPrompt: val });
  }, [save, profile]);

  if (onboarding) {
    const inputCls = `${styles.input} ${styles.onboardingInput}`;
    return (
      <div className={styles.onboarding}>
        <div className={styles.onboardingField}>
          <label className={styles.onboardingLabel}>Nickname</label>
          <input className={inputCls} type="text" value={nickname} onChange={handleNickname} placeholder="e.g. John" />
        </div>
        <div className={styles.onboardingField}>
          <label className={styles.onboardingLabel}>Language</label>
          <input className={inputCls} type="text" value={language} onChange={handleLanguage} placeholder="e.g. English" />
        </div>
        <div className={styles.onboardingField}>
          <label className={styles.onboardingLabel}>Timezone</label>
          <input className={inputCls} type="text" value={timezone} onChange={handleTimezone} placeholder="e.g. Europe/Amsterdam" />
        </div>
      </div>
    );
  }

  return (
    <div className={shared.contentArea} style={{ overflow: "hidden" }}>
      <div className={shared.card} style={{ flexShrink: 0 }}>
        <div className={shared.cardHeader}>Profile</div>
        <div className={shared.cardBody} style={{ overflowY: "auto", maxHeight: "none" }}>
          <div className={shared.cardBodyRow}>
            <div className={shared.fieldText}>
              <label className={shared.fieldLabel}>Nickname</label>
              <p className={shared.fieldHint}>How the assistant should address you.</p>
            </div>
            <input
              className={styles.input}
              type="text"
              value={nickname}
              onChange={handleNickname}
              placeholder="e.g. John"
            />
          </div>
          <div className={shared.cardBodyRow}>
            <div className={shared.fieldText}>
              <label className={shared.fieldLabel}>Language</label>
              <p className={shared.fieldHint}>Preferred language for responses.</p>
            </div>
            <input
              className={styles.input}
              type="text"
              value={language}
              onChange={handleLanguage}
              placeholder="e.g. English"
            />
          </div>
          <div className={shared.cardBodyRow}>
            <div className={shared.fieldText}>
              <label className={shared.fieldLabel}>Timezone</label>
              <p className={shared.fieldHint}>Your local timezone for time-aware responses.</p>
            </div>
            <input
              className={styles.input}
              type="text"
              value={timezone}
              onChange={handleTimezone}
              placeholder="e.g. Europe/Amsterdam"
            />
          </div>
        </div>
      </div>

      <div className={shared.card} style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
        <div className={shared.cardHeader}>Context Prompt</div>
        <div className={shared.cardBody} style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", maxHeight: "none" }}>
          <div className={styles.promptRow} style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
            <p className={shared.fieldHint}>
              Custom instructions appended to every chat's system prompt. Use this for preferences, role context, or recurring guidelines.
            </p>
            <textarea
              className={styles.promptTextarea}
              style={{ flex: 1, minHeight: 0 }}
              value={contextPrompt}
              onChange={handleContextPrompt}
              placeholder="e.g. I'm a senior frontend engineer. Prefer TypeScript and React. Be concise."
            />
          </div>
        </div>
      </div>
    </div>
  );
}
