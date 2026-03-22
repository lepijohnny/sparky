import type { Logger } from "../../logger.types";
import type { OAuthTokens, OAuthExchangeParams } from "@sparky/auth-core";

export async function exchangeToken(log: Logger, params: OAuthExchangeParams): Promise<OAuthTokens> {
  const payload: Record<string, string> = {
    grant_type: "authorization_code",
    client_id: params.clientId,
    code: params.code,
    redirect_uri: params.redirectUri,
  };

  if (params.clientSecret) {
    payload.client_secret = params.clientSecret;
  }
  if (params.codeVerifier) {
    payload.code_verifier = params.codeVerifier;
  }
  log.info("Token exchange request", {
    tokenUrl: params.tokenUrl,
    redirectUri: params.redirectUri,
    usePkce: !!params.codeVerifier,
  });

  const useForm = params.bodyEncoding === "form";
  const res = await fetch(params.tokenUrl, {
    method: "POST",
    headers: {
      "Content-Type": useForm ? "application/x-www-form-urlencoded" : "application/json",
      "Accept": "application/json",
    },
    body: useForm ? new URLSearchParams(payload).toString() : JSON.stringify(payload),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Token exchange failed (${res.status}): ${text}`);
  }

  const contentType = res.headers.get("content-type") ?? "";
  let data: Record<string, unknown>;

  if (contentType.includes("application/json")) {
    data = await res.json() as Record<string, unknown>;
  } else {
    const text = await res.text();
    const parsed = new URLSearchParams(text);
    data = Object.fromEntries(parsed.entries());
  }
  const accessToken = data.access_token;
  if (typeof accessToken !== "string") {
    const detail = data.error_description ?? data.error ?? "unknown";
    throw new Error(`No access_token in response: ${detail}`);
  }

  return {
    accessToken,
    refreshToken: typeof data.refresh_token === "string" ? data.refresh_token : undefined,
  };
}
