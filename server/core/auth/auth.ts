import type { AuthFlow, AuthFlowDefinition, AuthRequest, AuthVerdict } from "@sparky/auth-core";
import type { Logger } from "../../logger.types";
import type { Credentials } from "../cred";
import type { OAuthGateway } from "./oauth.gateway";
import type { Socket } from "node:net";

export interface AuthManager {
  definitions(): AuthFlowDefinition[];
  request(domain: string, provider: string, grant: string): Promise<AuthRequest>;
  verify(domain: string, provider: string, grant: string, params?: Record<string, string>): Promise<AuthVerdict>;
  dispose(): void;
}

export function createAuthManager(log: Logger, cred: Credentials, gateway: OAuthGateway, flows: AuthFlow[]): AuthManager {
  const pending = new Map<string, Promise<{ code: string; socket: Socket }>>();

  function resolve(domain: string, provider: string, grant: string): AuthFlow {
    const flow = flows.find((f) => {
      const d = f.definition;
      return d.domain === domain && d.provider === provider && d.grant === grant;
    });
    if (!flow) throw new Error(`No auth flow for ${domain}.${provider}.${grant}`);
    return flow;
  }

  return {
    definitions() {
      return flows.map((f) => f.definition);
    },

    async request(domain, provider, grant) {
      const flow = resolve(domain, provider, grant);
      const isOAuth = grant === "pkce" || grant === "oauth";

      if (isOAuth) {
        const sessionKey = `${domain}.${provider}.${grant}`;
        const { port, callbackPromise } = await gateway.listen();
        const redirectUri = `http://localhost:${port}/callback`;
        pending.set(sessionKey, callbackPromise);
        return flow.request(redirectUri);
      }

      return flow.request();
    },

    async verify(domain, provider, grant, params) {
      const flow = resolve(domain, provider, grant);
      const isOAuth = grant === "pkce" || grant === "oauth";

      let verdict: AuthVerdict;

      if (isOAuth) {
        const sessionKey = `${domain}.${provider}.${grant}`;
        const callbackPromise = pending.get(sessionKey);
        if (!callbackPromise) throw new Error("No pending OAuth flow. Call auth.request first.");

        const { code, socket } = await callbackPromise;
        pending.delete(sessionKey);

        verdict = await flow.verify({ ...params, code });

        if (verdict.ok) {
          gateway.respondSuccess(socket);
        } else {
          gateway.respondError(socket);
        }
      } else {
        verdict = await flow.verify(params);
      }

      if (verdict.ok && verdict.creds) {
        const { definition: def } = flow;
        for (const [field, value] of Object.entries(verdict.creds)) {
          if (value) {
            const key = `${def.domain}.${def.provider}.${def.grant}.${field}`;
            await cred.set(key, value);
            log.info("Stored credential", { key });
          }
        }
      }

      if (verdict.ok) {
        try { await flow.onSuccess?.(); } catch (err) { log.error("onSuccess failed", { error: String(err) }); }
      }

      return verdict;
    },

    dispose() {
      for (const flow of flows) {
        flow.dispose?.();
      }
    },
  };
}
