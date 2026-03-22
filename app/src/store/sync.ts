import type { WsConnection } from "../lib/ws";
import type { Chat, ChatEvent, ChatActivity } from "../types/chat";
import type { Source } from "../types/source";
import type { ServiceInfo } from "../types/service";
import type { Label } from "../types/label";
import type { LlmConnection, LlmDefault } from "../types/llm";
import type { AuthFlowDefinition } from "@sparky/auth-core";
import type { ProviderDefinition } from "../types/registry";
import type { Workspace } from "../types/workspace";
import type { TrustData } from "./trust";
import { useStore } from "./index";

type Unsubscribe = () => void;

/**
 * Fetches initial data and subscribes to WS events.
 * Returns a cleanup function that removes all subscriptions.
 */
export function syncStore(conn: WsConnection): Unsubscribe {
  const store = useStore.getState();
  const unsubs: Unsubscribe[] = [];

  const sub = <T>(event: string, handler: (data: T) => void) => {
    const unsub = conn.subscribe<T>(event, handler);
    unsubs.push(unsub);
  };

  fetchInitialData(conn);

  sub<{ chat: Chat }>("chat.created", ({ chat }) => {
    useStore.getState().addChat(chat);
  });

  sub<{ chat: Chat }>("chat.updated", ({ chat }) => {
    useStore.getState().patchChat(chat);
    useStore.getState().patchSelection(chat);
  });

  sub<{ id: string }>("chat.deleted", ({ id }) => {
    useStore.getState().removeChat(id);
    useStore.getState().removeSelection(id);
  });

  sub<ChatEvent>("chat.event", (event) => {
    if (event.kind !== "activity") return;
    const chatId = event.chatId;
    const type = (event as ChatActivity).type;

    if (type === "agent.start") {
      useStore.getState().startStream(chatId);
    } else if (type === "agent.text.delta") {
      const content = (event as any).data?.content ?? "";
      useStore.getState().appendDelta(chatId, content);
    } else if (type === "agent.tool.start") {
      useStore.getState().resetContent(chatId);
      useStore.getState().addActivity(chatId, event as unknown as ChatActivity);
    } else if (type === "agent.done" || type === "agent.stopped" || type === "agent.error") {
      useStore.getState().endStream(chatId);
    } else {
      useStore.getState().addActivity(chatId, event as unknown as ChatActivity);
    }
  });

  sub<{ source: Source }>("kt.source.created", ({ source }) => {
    useStore.getState().patchSource(source);
  });

  sub<{ source: Source }>("kt.source.updated", ({ source }) => {
    useStore.getState().patchSource(source);
  });

  sub<{ id: string }>("kt.source.deleted", ({ id }) => {
    useStore.getState().removeSource(id);
  });

  const refetchConnections = () => {
    conn.request<{ services: ServiceInfo[] }>("svc.list").then((res) => {
      useStore.getState().setConnections(res.services);
      refetchConnectionGuides(conn, res.services);
    }).catch(() => {});
  };
  sub("svc.register", refetchConnections);
  sub("svc.delete", refetchConnections);
  sub("svc.test", refetchConnections);
  sub("svc.updated", refetchConnections);
  sub("svc.guide", refetchConnections);

  sub("settings.labels.created", () => refetchLabels(conn));
  sub("settings.labels.updated", () => refetchLabels(conn));
  sub("settings.labels.deleted", () => refetchLabels(conn));

  sub("core.models.ready", () => refetchAgent(conn));

  sub<TrustData>("trust.changed", (data) => {
    useStore.getState().setTrust(data);
  });

  sub("skills.changed", () => {
    conn.request<{ skills: any[] }>("skills.list").then((res) => {
      useStore.getState().setSkills(res.skills);
    }).catch(() => {});
  });

  sub("settings.workspace.changed", () => {
    fetchInitialData(conn);
    useStore.setState({ selectedSourceId: null });
    useStore.getState().selectChat(null);
    useStore.getState().clearSourceSelection();
  });

  return () => {
    for (const unsub of unsubs) unsub();
  };
}

/**
 * Lightweight sync for popup windows — fetches only labels + agent data.
 */
export function syncPopup(conn: WsConnection): void {
  refetchLabels(conn);
  refetchAgent(conn);
}

async function fetchInitialData(conn: WsConnection) {
  try {
    const [chats, sources, connections, labels, skills] = await Promise.all([
      conn.request<{ chats: Chat[] }>("chat.list.all"),
      conn.request<{ sources: Source[] }>("kt.sources.list"),
      conn.request<{ services: ServiceInfo[] }>("svc.list"),
      conn.request<{ labels: Label[] }>("settings.labels.list"),
      conn.request<{ skills: any[] }>("skills.list"),
    ]);

    const store = useStore.getState();
    store.setChats(chats.chats);
    store.setSources(sources.sources);
    store.setConnections(connections.services);
    store.setLabels(labels.labels);
    store.setSkills(skills.skills);

    refetchWorkspace(conn);
    refetchTrust(conn);

    if (!store.anchorChat && chats.chats.length > 0) {
      const first = chats.chats.find((c) => !c.archived);
      if (first) store.selectChat(first);
    }

    refetchConnectionGuides(conn, connections.services);
  } catch (err) {
    console.error("Failed to fetch initial data:", err);
  }

  await refetchAgent(conn);
  useStore.getState().setBooted();
}

async function refetchConnectionGuides(conn: WsConnection, services: ServiceInfo[]) {
  for (const svc of services) {
    conn.request<{ content?: string }>("svc.guide.read", { service: svc.id }).then((res) => {
      useStore.getState().setConnectionGuide(svc.id, res?.content ?? null);
    }).catch(() => {
      useStore.getState().setConnectionGuide(svc.id, null);
    });
  }
}

async function refetchLabels(conn: WsConnection) {
  try {
    const res = await conn.request<{ labels: Label[] }>("settings.labels.list");
    useStore.getState().setLabels(res.labels);
  } catch {}
}

async function refetchWorkspace(conn: WsConnection) {
  try {
    const [activeRes, listRes] = await Promise.all([
      conn.request<{ activeWorkspace: string | null }>("settings.workspace.active.get"),
      conn.request<{ workspaces: Workspace[] }>("settings.workspace.list"),
    ]);
    const ws = listRes.workspaces.find((w) => w.id === activeRes.activeWorkspace) ?? null;
    useStore.getState().setWorkspace(ws);
  } catch {}
}

async function refetchTrust(conn: WsConnection) {
  try {
    const data = await conn.request<TrustData>("trust.data.get");
    useStore.getState().setTrust(data);
  } catch {}
}

async function refetchAgent(conn: WsConnection) {
  try {
    const [conns, defaults, registry] = await Promise.all([
      conn.request<{ connections: LlmConnection[] }>("settings.llm.connections.list"),
      conn.request<{ default: LlmDefault | null }>("settings.llm.default.get"),
      conn.request<{ providers: ProviderDefinition[]; flows: AuthFlowDefinition[] }>("core.registry.list"),
    ]);
    const store = useStore.getState();
    store.setLlmConnections(conns.connections);
    store.setDefaultLlm(defaults.default);
    store.setProviders(registry.providers);
    store.setFlows(registry.flows ?? []);
  } catch {}
}
