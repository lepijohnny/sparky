import { createContext, useContext, useCallback, useState, useEffect, type ReactNode } from "react";
import { useConnection } from "./ConnectionContext";

export interface Toast {
  id: string;
  kind: "success" | "error" | "info";
  title: string;
  message?: string;
  expire?: boolean;
  leaving?: boolean;
}

const AUTO_DISMISS_MS = 5000;
const FADE_OUT_MS = 400;
let nextToastId = 0;

interface ToastContextValue {
  toasts: Toast[];
  addToast: (toast: Toast) => void;
  dismissToast: (id: string) => void;
}

const ToastContext = createContext<ToastContextValue>({
  toasts: [],
  addToast: () => {},
  dismissToast: () => {},
});

export function useToasts() {
  return useContext(ToastContext);
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const { conn } = useConnection();
  const [toasts, setToasts] = useState<Toast[]>([]);

  const startLeaving = useCallback((id: string) => {
    setToasts((prev) => prev.map((t) => t.id === id ? { ...t, leaving: true } : t));
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, FADE_OUT_MS);
  }, []);

  const addToast = useCallback((toast: Toast) => {
    const t = { ...toast, expire: toast.expire ?? true };
    setToasts((prev) => [...prev, t]);
    if (t.expire) {
      setTimeout(() => startLeaving(t.id), AUTO_DISMISS_MS);
    }
  }, [startLeaving]);

  const dismissToast = useCallback((id: string) => {
    startLeaving(id);
  }, [startLeaving]);

  useEffect(() => {
    if (!conn) return;
    return conn.onMessage((msg) => {
      if (msg.type === "toast" && msg.title) {
        addToast({
          id: msg.id ?? `toast_${++nextToastId}`,
          kind: msg.kind ?? "info",
          title: msg.title,
          message: msg.message,
          expire: msg.expire,
        });
      }
    });
  }, [conn, addToast]);

  return (
    <ToastContext.Provider value={{ toasts, addToast, dismissToast }}>
      {children}
    </ToastContext.Provider>
  );
}
