import type { StateCreator } from "zustand";

export type PermissionMode = "read" | "write" | "execute";
export type Scope = "read" | "write" | "bash" | "bus";
export type RuleList = "allow" | "deny" | "ask";

export interface TrustRule {
  label: string;
  pattern: string;
  alwaysAsk?: boolean;
}

export interface ScopeRules {
  allow: TrustRule[];
  deny: TrustRule[];
  ask: TrustRule[];
}

export interface TrustData {
  mode: PermissionMode;
  read: ScopeRules;
  write: ScopeRules;
  bash: ScopeRules;
  bus: ScopeRules;
}

export interface TrustSlice {
  trust: TrustData;
  setTrust: (data: TrustData) => void;
  setTrustMode: (mode: PermissionMode) => void;
}

function emptyScope(): ScopeRules {
  return { allow: [], deny: [], ask: [] };
}

export const createTrustSlice: StateCreator<TrustSlice, [], [], TrustSlice> = (set) => ({
  trust: { mode: "read", read: emptyScope(), write: emptyScope(), bash: emptyScope(), bus: emptyScope() },
  setTrust: (data) => set({ trust: data }),
  setTrustMode: (mode) => set((s) => ({ trust: { ...s.trust, mode } })),
});
