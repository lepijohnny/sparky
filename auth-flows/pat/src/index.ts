import type { AuthFlowField, AuthPluginFactory } from "@sparky/auth-core";

export interface PatFlowConfig {
  domain: string;
  provider: string;
  label: string;
  fields: AuthFlowField[];
  onSuccess?: () => Promise<void>;
}

export function createPatFlow(config: PatFlowConfig): AuthPluginFactory {
  return (ctx) => [{
    definition: {
      domain: config.domain,
      provider: config.provider,
      grant: "pat",
      label: config.label,
      fields: config.fields,
    },

    async request() {
      return { grant: "pat", display: [] };
    },

    async verify(params) {
      const key = params?.key;
      if (!key) {
        ctx.log.error("No API key provided", { provider: config.provider });
        return { ok: false };
      }

      ctx.log.info("API key stored", { provider: config.provider });
      return { ok: true, creds: { token: key } };
    },

    onSuccess: config.onSuccess,
  }];
}
