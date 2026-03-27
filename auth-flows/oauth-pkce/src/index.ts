import { randomBytes, createHash } from "node:crypto";
import type { AuthPluginFactory } from "@sparky/auth-core";

export interface OAuthPkceFlowConfig {
  domain: string;
  provider: string;
  label: string;
  authorizeUrl: string;
  tokenUrl: string;
  clientId: string;
  clientSecret?: string;
  scopes: string[];
  redirectPort?: number;
  redirectPath?: string;
  extraParams?: Record<string, string>;
  bodyEncoding?: "json" | "form";
  onSuccess?: () => Promise<void>;
}

function base64UrlEncode(buf: Buffer): string {
  return buf.toString("base64url");
}

export function createOAuthPkceFlow(config: OAuthPkceFlowConfig): AuthPluginFactory {
  return (ctx) => {
    let pendingVerifier = "";
    let pendingRedirectUri = "";
    let pendingState = "";

    return [{
      definition: {
        domain: config.domain,
        provider: config.provider,
        grant: "pkce",
        label: config.label,
      },
      redirectPort: config.redirectPort,
      redirectPath: config.redirectPath,

      async request(redirectUri) {
        if (!redirectUri) throw new Error("OAuth PKCE flow requires a redirectUri");

        const codeVerifier = base64UrlEncode(randomBytes(32));
        const codeChallenge = base64UrlEncode(createHash("sha256").update(codeVerifier).digest());
        const state = randomBytes(32).toString("hex");

        pendingVerifier = codeVerifier;
        pendingRedirectUri = redirectUri;
        pendingState = state;

        const params = new URLSearchParams({
          client_id: config.clientId,
          response_type: "code",
          redirect_uri: redirectUri,
          scope: config.scopes.join(" "),
          state,
          code_challenge: codeChallenge,
          code_challenge_method: "S256",
          ...config.extraParams,
        });

        const authorizeUrl = `${config.authorizeUrl}?${params.toString()}`;

        ctx.log.info("OAuth PKCE request", { provider: config.provider });
        return {
          grant: "pkce" as const,
          display: [{ type: "url" as const, label: "Authorize in browser", value: authorizeUrl }],
        };
      },

      async verify(params) {
        const code = params?.code;
        if (!code) throw new Error("No authorization code received");
        if (!pendingVerifier) throw new Error("No pending OAuth flow. Call auth.request first.");

        try {
          const tokens = await ctx.exchange({
            tokenUrl: config.tokenUrl,
            code,
            redirectUri: pendingRedirectUri,
            clientId: config.clientId,
            clientSecret: config.clientSecret,
            codeVerifier: pendingVerifier,
            state: pendingState,
            bodyEncoding: config.bodyEncoding,
          });

          ctx.log.info("OAuth PKCE completed", { provider: config.provider });
          return { ok: true, creds: { token: tokens.accessToken, refreshToken: tokens.refreshToken ?? "" } };
        } catch (err) {
          ctx.log.error("OAuth PKCE failed", { provider: config.provider, error: err instanceof Error ? err.message : String(err) });
          return { ok: false };
        } finally {
          pendingVerifier = "";
          pendingRedirectUri = "";
          pendingState = "";
        }
      },

      onSuccess: config.onSuccess,
    }];
  };
}
