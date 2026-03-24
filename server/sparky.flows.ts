import type { AuthPluginContext, AuthFlow } from "@sparky/auth-core";
import { createOAuthPkceFlow } from "@sparky/auth-flow-oauth-pkce";
import { createPatFlow } from "@sparky/auth-flow-pat";
import { createLocalFlow } from "@sparky/auth-flow-local";
import { createPiDeviceFlow } from "@sparky/auth-flow-pi-device";
import { exchangeToken } from "./core/auth/oauth.exchange";
import type { Credentials } from "./core/cred";
import type { FileLogger } from "./logger";
import type { ProviderAdapter } from "./core/registry.types";

export function buildAuthFlows(lg: FileLogger, cred: Credentials, copilot: ProviderAdapter | undefined): AuthFlow[] {
  const log = lg.createLogger("auth");
  const ctx: AuthPluginContext = {
    log,
    exchange: (params) => exchangeToken(log, params),
  };

  return [
    ...createOAuthPkceFlow({
      domain: "llm",
      provider: "anthropic-oauth",
      label: "Claude Pro / Max (OAuth)",
      authorizeUrl: "https://claude.ai/oauth/authorize",
      tokenUrl: "https://console.anthropic.com/v1/oauth/token",
      clientId: "9d1c250a-e61b-44d9-88ed-5944d1962f5e",
      scopes: ["org:create_api_key", "user:profile", "user:inference"],
    })(ctx),
    ...createPatFlow({
      domain: "llm",
      provider: "anthropic-api",
      label: "Claude (API Key)",
      fields: [
        { name: "key", label: "API Key", placeholder: "sk-ant-…", url: "https://console.anthropic.com/settings/keys" },
      ],
    })(ctx),
    ...createOAuthPkceFlow({
      domain: "llm",
      provider: "google",
      label: "Google Gemini (OAuth)",
      authorizeUrl: "https://accounts.google.com/o/oauth2/v2/auth",
      tokenUrl: "https://oauth2.googleapis.com/token",
      clientId: Buffer.from("NjgxMjU1ODA5Mzk1LW9vOGZ0Mm9wcmRybnA5ZTNhcWY2YXYzaG1kaWIxMzVqLmFwcHMuZ29vZ2xldXNlcmNvbnRlbnQuY29t", "base64").toString(),
      clientSecret: Buffer.from("R09DU1BYLTR1SGdNUG0tMW83U2stZ2VWNkN1NWNsWEZzeGw=", "base64").toString(),
      scopes: ["https://www.googleapis.com/auth/cloud-platform", "https://www.googleapis.com/auth/userinfo.email"],
      onSuccess: async () => {
        const token = await cred.get("llm.google.pkce.token");
        if (!token) { log.warn("Google onSuccess: no token found"); return; }
        log.info("Google onSuccess: discovering project...");
        try {
          const res = await fetch("https://cloudcode-pa.googleapis.com/v1internal:loadCodeAssist", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              metadata: { ideType: "IDE_UNSPECIFIED", platform: "PLATFORM_UNSPECIFIED", pluginType: "GEMINI" },
            }),
          });
          if (res.ok) {
            const data = await res.json() as any;
            log.info("Google loadCodeAssist response", { keys: Object.keys(data) });
            const proj = data?.response?.cloudaicompanionProject ?? data?.cloudaicompanionProject;
            const projectId = typeof proj === "string" ? proj : proj?.id;
            if (projectId) {
              await cred.set("llm.google.pkce.projectId", projectId);
              log.info("Google project discovered", { projectId });
            } else {
              log.warn("Google project not found in response", {
              project: JSON.stringify(data?.cloudaicompanionProject ?? null).slice(0, 500),
            });
            }
          } else {
            const body = await res.text();
            log.warn("Google loadCodeAssist failed", { status: res.status, body: body.slice(0, 500) });
          }
        } catch (err) {
          log.warn("Google project discovery failed", { error: String(err) });
        }
      },
    })(ctx),
    ...createPiDeviceFlow({
      domain: "llm",
      provider: "copilot",
      label: "Copilot (GitHub)",
      onSuccess: async () => {
        if (!copilot) return;
        if (await copilot.reconnect?.()) {
          try { await copilot.models(); } catch { /* best effort */ }
        }
      },
    })(ctx),
    ...createLocalFlow({
      domain: "llm",
      provider: "ollama",
      label: "Local (Ollama)",
      fields: [{ name: "host", label: "Host", placeholder: "http://localhost:11434" }],
    })(ctx),
    ...createOAuthPkceFlow({
      domain: "llm",
      provider: "openai-oauth",
      label: "OpenAI (OAuth)",
      authorizeUrl: "https://auth.openai.com/oauth/authorize",
      tokenUrl: "https://auth.openai.com/oauth/token",
      clientId: Buffer.from("YXBwX0VNb2FtRUVaNzNmMENrWGFYcDdocmFubg==", "base64").toString(),
      scopes: ["openid", "profile", "email", "offline_access"],
      redirectPort: 1455,
      redirectPath: "/auth/callback",
      extraParams: { id_token_add_organizations: "true", codex_cli_simplified_flow: "true", originator: "sparky" },
      bodyEncoding: "form",
    })(ctx),
    ...createPatFlow({
      domain: "llm",
      provider: "openai-api",
      label: "OpenAI (API Key)",
      fields: [
        { name: "key", label: "API Key", placeholder: "sk-…", url: "https://platform.openai.com/api-keys" },
      ],
    })(ctx),
    ...createPatFlow({
      domain: "llm",
      provider: "mistral",
      label: "Mistral (API Key)",
      fields: [
        { name: "key", label: "API Key", placeholder: "…", url: "https://console.mistral.ai/api-keys" },
      ],
    })(ctx),
  ];
}
