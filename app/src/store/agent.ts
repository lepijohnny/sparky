import type { StateCreator } from "zustand";
import type { LlmConnection, LlmDefault } from "../types/llm";
import type { AuthFlowDefinition } from "@sparky/auth-core";
import type { ModelDefinition, ProviderDefinition } from "../types/registry";

export interface AgentSlice {
  booted: boolean;
  llmConnections: LlmConnection[];
  providers: ProviderDefinition[];
  flows: AuthFlowDefinition[];
  defaultLlm: LlmDefault | null;

  setBooted: () => void;
  setLlmConnections: (conns: LlmConnection[]) => void;
  setProviders: (providers: ProviderDefinition[]) => void;
  setFlows: (flows: AuthFlowDefinition[]) => void;
  setDefaultLlm: (d: LlmDefault | null) => void;

  getDefaultConn: () => LlmConnection | undefined;
  getDefaultProvider: () => ProviderDefinition | undefined;
  getModels: () => ModelDefinition[];
  getActiveModelId: () => string;
  getSelectedModel: () => ModelDefinition | undefined;
}

export const createAgentSlice: StateCreator<AgentSlice, [], [], AgentSlice> = (_set, get) => ({
  booted: false,
  llmConnections: [],
  providers: [],
  flows: [],
  defaultLlm: null,

  setBooted: () => _set({ booted: true }),
  setLlmConnections: (conns) => _set({ llmConnections: conns }),
  setProviders: (providers) => _set({ providers }),
  setFlows: (flows) => _set({ flows }),
  setDefaultLlm: (d) => _set({ defaultLlm: d }),

  getDefaultConn: () => {
    const s = get();
    return s.llmConnections.find((c) => c.id === s.defaultLlm?.id);
  },

  getDefaultProvider: () => {
    const s = get();
    const conn = s.llmConnections.find((c) => c.id === s.defaultLlm?.id);
    return conn ? s.providers.find((p) => p.id === conn.provider) : undefined;
  },

  getModels: () => {
    const provider = get().getDefaultProvider();
    return provider?.models ?? [];
  },

  getActiveModelId: () => {
    const conn = get().getDefaultConn();
    const models = get().getModels();
    return conn?.model ?? models[0]?.id ?? "";
  },

  getSelectedModel: () => {
    const models = get().getModels();
    const activeId = get().getActiveModelId();
    return models.find((m) => m.id === activeId);
  },
});
