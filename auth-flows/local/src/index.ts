import type { AuthFlowField, AuthPluginFactory } from "@sparky/auth-core";

export interface LocalFlowConfig {
  domain: string;
  provider: string;
  label: string;
  fields: AuthFlowField[];
}

export function createLocalFlow(config: LocalFlowConfig): AuthPluginFactory {
  return () => [{
    definition: {
      domain: config.domain,
      provider: config.provider,
      grant: "local",
      label: config.label,
      fields: config.fields,
    },

    async request() {
      return { grant: "local", display: [] };
    },

    async verify() {
      return { ok: true };
    },
  }];
}
