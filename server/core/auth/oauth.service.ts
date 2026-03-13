import type { Socket } from "node:net";
import type { Logger } from "../../logger.types";
import type { EventBus } from "../bus";
import type { Credentials } from "../cred";
import type { OAuthGateway } from "./oauth.gateway";
import { exchangeToken } from "./oauth.exchange";

interface SvcOAuthSession {
  callbackPromise: Promise<{ code: string; socket: Socket }>;
  redirectUri: string;
  tokenKey: string;
  tokenUrl: string;
  clientId: string;
  clientSecret?: string;
}

export function registerServiceOAuth(bus: EventBus, cred: Credentials, gateway: OAuthGateway, log: Logger): void {
  const pending = new Map<string, SvcOAuthSession>();

  bus.on("svc.oauth.start", async (data) => {
    const { port, callbackPromise } = await gateway.listen();
    const redirectUri = `http://localhost:${port}/callback`;

    const params = new URLSearchParams({
      client_id: data.clientId,
      response_type: "code",
      redirect_uri: redirectUri,
      scope: data.scopes.join(" "),
    });

    const authorizeUrl = `${data.authUrl}?${params.toString()}`;
    pending.set(data.service, {
      callbackPromise,
      redirectUri,
      tokenKey: data.tokenKey,
      tokenUrl: data.tokenUrl,
      clientId: data.clientId,
      clientSecret: data.clientSecret,
    });

    log.info("Service OAuth started", { service: data.service });
    return { authorizeUrl };
  });

  bus.on("svc.oauth.finish", async (data) => {
    const session = pending.get(data.service);
    if (!session) return { ok: false, error: "No pending OAuth flow. Call svc.oauth.start first." };

    try {
      const { code, socket } = await session.callbackPromise;

      const tokens = await exchangeToken(log, {
        tokenUrl: session.tokenUrl,
        code,
        redirectUri: session.redirectUri,
        clientId: session.clientId,
        clientSecret: session.clientSecret,
        bodyEncoding: "form",
      });
      gateway.respondSuccess(socket);

      await cred.set(cred.svcKey(data.service, session.tokenKey), tokens.accessToken);
      if (tokens.refreshToken) {
        await cred.set(cred.svcKey(data.service, "REFRESH_TOKEN"), tokens.refreshToken);
      }

      log.info("Service OAuth completed", { service: data.service });
      return { ok: true };
    } catch (err) {
      log.error("Service OAuth failed", { service: data.service, error: String(err) });
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    } finally {
      pending.delete(data.service);
    }
  });
}
