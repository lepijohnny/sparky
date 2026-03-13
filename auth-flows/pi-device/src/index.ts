import { loginGitHubCopilot } from "@mariozechner/pi-ai/oauth";
import type { AuthPluginFactory } from "@sparky/auth-core";

export interface PiDeviceFlowConfig {
  domain: string;
  provider: string;
  label: string;
  onSuccess?: () => Promise<void>;
}

export function createPiDeviceFlow(config: PiDeviceFlowConfig): AuthPluginFactory {
  return (ctx) => {
    let pendingLogin: Promise<{ access: string; refresh: string }> | null = null;
    let abortController: AbortController | null = null;

    return [{
      definition: {
        domain: config.domain,
        provider: config.provider,
        grant: "device",
        label: config.label,
      },

      async request() {
        if (abortController) {
          abortController.abort();
        }
        abortController = new AbortController();

        let resolveAuth: (v: { url: string; code: string }) => void;
        const authReady = new Promise<{ url: string; code: string }>((r) => { resolveAuth = r; });

        pendingLogin = loginGitHubCopilot({
          onAuth: (url, instructions) => {
            const code = instructions?.replace(/^Enter code:\s*/i, "").trim() ?? "";
            resolveAuth({ url, code });
          },
          onPrompt: async () => "",
          signal: abortController.signal,
        }).then((creds) => ({ access: creds.access, refresh: creds.refresh }));

        pendingLogin.catch(() => {});

        const { url, code } = await authReady;

        ctx.log.info("Device code received", { provider: config.provider });
        return {
          grant: "device" as const,
          display: [
            { type: "code" as const, label: "Enter this code", value: code },
            { type: "url" as const, label: "Open authorization page", value: url },
          ],
        };
      },

      async verify() {
        if (!pendingLogin) {
          throw new Error("No pending device flow. Call request() first.");
        }

        try {
          const creds = await pendingLogin;
          pendingLogin = null;
          abortController = null;

          ctx.log.info("Copilot device flow completed", { provider: config.provider });
          return { ok: true, creds: { token: creds.refresh } };
        } catch (err) {
          ctx.log.error("Copilot device flow failed", {
            provider: config.provider,
            error: err instanceof Error ? err.message : String(err),
          });
          pendingLogin = null;
          abortController = null;
          return { ok: false };
        }
      },

      onSuccess: config.onSuccess,

      dispose() {
        if (abortController) {
          abortController.abort();
          abortController = null;
        }
        pendingLogin = null;
      },
    }];
  };
}
