import { useCallback } from "react";
import type { WsConnection } from "../lib/ws";
import type { Toast } from "../context/ToastContext";
import type { Source } from "../types/source";
import type { AppNavigation } from "./useAppNavigation";
import { useWsSubscriber } from "./useWsSubscriber";
import { useStore } from "../store";

let bgToastId = 0;

/**
 * All top-level WebSocket event → toast subscriptions.
 * Extracted from App to keep the root component focused on layout.
 */
export function useAppSubscriptions(
  conn: WsConnection | null,
  addToast: (t: Toast) => void,
  router: AppNavigation,
): void {
  const selectSkill = useStore((s) => s.selectSkill);
  const selectConnection = useStore((s) => s.selectConnection);

  useWsSubscriber<{ chatId: string; kind: string; type?: string }>(conn, "chat.event", useCallback((event) => {
    if (event.kind !== "activity") return;
    if (event.type !== "agent.done" && event.type !== "agent.error") return;
    const store = useStore.getState();
    if (event.chatId === store.anchorChat?.id) return;
    const name = store.getChatById(event.chatId)?.name || "Chat";

    addToast({
      id: `bg_${++bgToastId}`,
      kind: event.type === "agent.error" ? "error" : "info",
      title: `Reply ready, "${name}"`,
      expire: true,
    });
  }, [addToast]));

  useWsSubscriber<{ label: string }>(conn, "trust.rule.added", useCallback((data) => {
    addToast({
      id: `perm_${Date.now()}`,
      kind: "success",
      title: `Permission added: ${data.label}`,
      expire: false,
      action: {
        label: "Go to Permissions →",
        onClick: () => {
          router.handleSectionChange("settings");
          router.handleSettingsSubChange("permissions");
        },
      },
    });
  }, [addToast, router]));

  useWsSubscriber<{ id: string; name: string }>(conn, "skills.created", useCallback((data) => {
    addToast({
      id: `skill_created_${data.id}`,
      kind: "success",
      title: `Skill "${data.name}" created`,
      expire: false,
      action: {
        label: "Go to Skills →",
        onClick: () => {
          router.handleSectionChange("skills");
          selectSkill(data.id);
        },
      },
    });
  }, [addToast, router, selectSkill]));

  useWsSubscriber<{ service: string }>(conn, "svc.guide", useCallback((data) => {
    const label = data.service.replace(/[-_]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
    addToast({
      id: `svc_guide_${data.service}`,
      kind: "success",
      title: `${label} connected`,
      expire: false,
      action: {
        label: "Go to Connections →",
        onClick: () => {
          router.handleSectionChange("connections");
          selectConnection(data.service);
        },
      },
    });
  }, [addToast, router, selectConnection]));

  useWsSubscriber<{ source: Source }>(conn, "kt.source.updated", useCallback((data) => {
    if (data.source.status === "ready") {
      addToast({ id: `kt-done-${data.source.id}`, kind: "success", title: `"${data.source.name}" imported` });
    } else if (data.source.status === "error") {
      addToast({ id: `kt-fail-${data.source.id}`, kind: "error", title: `"${data.source.name}" import failed`, message: data.source.error });
    }
  }, [addToast]));
}
