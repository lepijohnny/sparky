import { useCallback, useEffect, useState } from "react";
import { useConnection } from "../../context/ConnectionContext";
import { useStore } from "../../store";
import NewConnectionModal from "../../components/modals/NewConnectionModal";
import ProfileDetailsPage from "../settings/ProfileDetailsPage";
import styles from "./OnboardingPage.module.css";

type Step = "profile" | "llm";

export default function OnboardingPage() {
  const { conn } = useConnection();
  const providers = useStore((s) => s.providers);
  const flows = useStore((s) => s.flows);
  const [step, setStep] = useState<Step>("profile");
  const [fadeOut, setFadeOut] = useState(false);
  const [hidden, setHidden] = useState(false);

  const handleAdded = useCallback(() => {
    if (conn) conn.request("core.prefetch", {}).catch(() => {});
    setFadeOut(true);
  }, [conn]);

  useEffect(() => {
    if (!fadeOut) return;
    const t = setTimeout(() => setHidden(true), 500);
    return () => clearTimeout(t);
  }, [fadeOut]);

  if (hidden) return null;

  return (
    <div className={`${styles.overlay} ${fadeOut ? styles.fadeOut : ""}`}>
      <div className={styles.container}>
        <div className={styles.header}>
          <img src="/icons/app-icon-128.png" alt="Sparky" className={styles.logo} />
          <h1 className={styles.title}>Welcome to Sparky</h1>
        </div>

        <div className={styles.content}>
          {step === "profile" && (
            <ProfileDetailsPage onboarding />
          )}
          {step === "llm" && (
            <NewConnectionModal
              conn={conn}
              providers={providers}
              flows={flows}
              onClose={() => {}}
              onAdded={handleAdded}
              onBack={() => setStep("profile")}
              inline
            />
          )}
        </div>

        {step === "profile" && (
          <div className={styles.footer}>
            <div className={styles.spacer} />
            <button className={styles.btnNext} onClick={() => setStep("llm")}>
              Next
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
