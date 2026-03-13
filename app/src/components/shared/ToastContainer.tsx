import { useToasts, type Toast } from "../../context/ToastContext";
import { CheckCircle, Ban, Info, X } from "lucide-react";
import styles from "./ToastContainer.module.css";

const ICONS = {
  success: CheckCircle,
  error: Ban,
  info: Info,
};

function ToastMessage({ toast, onDismiss }: { toast: Toast; onDismiss: () => void }) {
  const Icon = ICONS[toast.kind];
  return (
    <div className={`${styles.toast} ${styles[toast.kind]} ${toast.leaving ? styles.leaving : ""}`}>
      <Icon size={16} />
      <div className={styles.content}>
        <div className={styles.title}>{toast.title}</div>
        {toast.message && <div className={styles.message}>{toast.message}</div>}
      </div>
      <button className={styles.dismiss} onClick={onDismiss}>
        <X size={14} />
      </button>
    </div>
  );
}

export function ToastContainer() {
  const { toasts, dismissToast } = useToasts();

  if (toasts.length === 0) return null;

  return (
    <div className={styles.container}>
      {toasts.map((toast) => (
        <ToastMessage key={toast.id} toast={toast} onDismiss={() => dismissToast(toast.id)} />
      ))}
    </div>
  );
}
