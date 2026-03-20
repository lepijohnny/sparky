import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import type { Credentials } from "../cred";
import type { Logger } from "../../logger.types";
import {
  type ServiceDef,
  type EndpointDef,
  type FieldDef,
  buildZodObject,
  formatZodError,
} from "./proxy.schema";
import { executeRest } from "./proxy.rest";
import { connectMcp } from "./proxy.mcp";

export { buildRestRequest, normalizeUrl } from "./proxy.rest";
export { listMcpTools, mcpToolsToEndpoints, summarizeMcpTools, type McpTool } from "./proxy.mcp";

const MAX_RESPONSE = 50_000;
const FETCH_TIMEOUT = 30_000;

export interface ToolResult {
  ok: boolean;
  text: string;
}

export interface ServiceRouter {
  call(endpoint: string, params: Record<string, unknown>): Promise<ToolResult>;
  endpoints(): string[];
  dispose(): void;
}

export function createServiceRouter(
  def: ServiceDef,
  cred: Credentials,
  log: Logger,
): ServiceRouter {
  const endpointMap = new Map<string, EndpointDef>();
  for (const ep of def.endpoints) endpointMap.set(ep.name, ep);

  let mcpClient: Client | null = null;

  async function resolveAuth(): Promise<{ headers: Record<string, string>; query: Record<string, string>; error?: string }> {
    const ref = extractRef(def.auth.secretRef);
    const token = await cred.get(ref);

    if (!token) {
      return { headers: {}, query: {}, error: `Not connected. Token "${ref}" missing from credential store.` };
    }

    switch (def.auth.strategy) {
      case "bearer":
      case "oauth":
        return { headers: { Authorization: `Bearer ${token}` }, query: {} };
      case "bot":
        return { headers: { Authorization: `Bot ${token}` }, query: {} };
      case "url":
        return { headers: {}, query: {} };
      case "basic":
        return { headers: { Authorization: `Basic ${token}` }, query: {} };
      case "header":
        return { headers: { [def.auth.header]: token }, query: {} };
      case "query":
        return { headers: {}, query: { [def.auth.param]: token } };
    }
  }

  async function refreshToken(): Promise<boolean> {
    if (def.auth.strategy !== "oauth" || !def.oauth) return false;

    const refreshRef = def.oauth.refreshKey;
    if (!refreshRef) return false;

    const refreshTok = await cred.get(extractRef(refreshRef));
    if (!refreshTok) {
      log.warn("Router: refresh token missing", { service: def.id });
      return false;
    }

    const clientId = await cred.get(extractRef(def.oauth.clientIdKey));
    const clientSecret = def.oauth.clientSecretKey
      ? await cred.get(extractRef(def.oauth.clientSecretKey))
      : undefined;

    const body = new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshTok,
      ...(clientId ? { client_id: clientId } : {}),
      ...(clientSecret ? { client_secret: clientSecret } : {}),
    });

    try {
      const res = await fetch(def.oauth.tokenUrl, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: body.toString(),
        signal: AbortSignal.timeout(FETCH_TIMEOUT),
      });

      if (!res.ok) {
        const text = await res.text();
        log.error("Router: token refresh failed", { service: def.id, status: res.status, body: text.slice(0, 200) });
        return false;
      }

      const data = await res.json() as { access_token: string; refresh_token?: string };
      await cred.set(extractRef(def.auth.secretRef), data.access_token);
      if (data.refresh_token) await cred.set(extractRef(refreshRef), data.refresh_token);

      log.info("Router: token refreshed", { service: def.id });
      return true;
    } catch (err) {
      log.error("Router: token refresh error", { service: def.id, error: String(err) });
      return false;
    }
  }

  async function callEndpoint(ep: EndpointDef, params: Record<string, unknown>): Promise<ToolResult> {
    const cleaned = Object.fromEntries(Object.entries(params).filter(([, v]) => v !== null && v !== undefined));
    const inputSchema = buildZodObject(ep.input as Record<string, FieldDef>);
    const parsed = inputSchema.safeParse(cleaned);

    if (!parsed.success) {
      const msg = formatZodError(parsed.error);
      log.info("Router: input validation failed", { service: def.id, endpoint: ep.name, error: msg });
      return { ok: false, text: `Input validation failed: ${msg}` };
    }

    const auth = await resolveAuth();
    if (auth.error) return { ok: false, text: auth.error };

    if (ep.transport.type === "rest") {
      return callRest(ep, parsed.data as Record<string, unknown>, auth);
    }

    if (ep.transport.type === "mcp") {
      return callMcp(ep, parsed.data as Record<string, unknown>, auth);
    }

    return { ok: false, text: `Unknown transport "${ep.transport.type}"` };
  }

  async function callRest(
    ep: EndpointDef,
    params: Record<string, unknown>,
    auth: { headers: Record<string, string>; query: Record<string, string> },
  ): Promise<ToolResult> {
    try {
      const raw = ep.transport as { method: string; path: string; body: string };
      const resolvedPath = await resolveSecretRefs(raw.path, cred);
      const resolvedBase = await resolveSecretRefs(def.baseUrl, cred);
      const transport = { ...raw, path: resolvedPath };
      const result = await executeRest(resolvedBase, transport, params, auth);
      const ok = result.status >= 200 && result.status < 300;

      if (result.status === 401 && def.auth.strategy === "oauth") {
        log.info("Router: 401 received, attempting refresh", { service: def.id, endpoint: ep.name });
        const refreshed = await refreshToken();
        if (!refreshed) return { ok: false, text: "Token expired and refresh failed. Re-authenticate the service." };

        const retryAuth = await resolveAuth();
        if (retryAuth.error) return { ok: false, text: retryAuth.error };

        const retry = await executeRest(resolvedBase, transport, params, retryAuth);
        const retryOk = retry.status >= 200 && retry.status < 300;
        return { ok: retryOk, text: formatResult(retryOk, retry.status, retry.text) };
      }

      return { ok, text: formatResult(ok, result.status, result.text) };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      log.error("Router: network error", { service: def.id, endpoint: ep.name, error: msg });
      return { ok: false, text: `Network error: ${msg}` };
    }
  }

  async function callMcp(
    ep: EndpointDef,
    params: Record<string, unknown>,
    auth: { headers: Record<string, string> },
  ): Promise<ToolResult> {
    try {
      if (!mcpClient) {
        mcpClient = await connectMcp(def.baseUrl, auth.headers, log);
      }
      const result = await mcpClient.callTool({ name: ep.name, arguments: params });
      const text = JSON.stringify(result);
      return { ok: !result.isError, text: truncate(text) };
    } catch (err) {
      mcpClient = null;
      const msg = err instanceof Error ? err.message : String(err);
      log.error("Router: MCP error", { service: def.id, endpoint: ep.name, error: msg });
      return { ok: false, text: `MCP error: ${msg}` };
    }
  }

  return {
    async call(endpoint, params) {
      const ep = endpointMap.get(endpoint);
      if (!ep) {
        const available = [...endpointMap.keys()].join(", ");
        return { ok: false, text: `Unknown endpoint "${endpoint}". Available: ${available}` };
      }

      log.info("Router: call", { service: def.id, endpoint, params: Object.keys(params) });
      return callEndpoint(ep, params);
    },

    endpoints() {
      return [...endpointMap.keys()];
    },

    dispose() {
      endpointMap.clear();
      if (mcpClient) {
        mcpClient.close().catch(() => {});
        mcpClient = null;
      }
    },
  };
}

function extractRef(secretRef: string): string {
  const match = secretRef.match(/^\$\{(.+)\}$/);
  return match ? match[1] : secretRef;
}

async function resolveSecretRefs(text: string, credStore: Credentials): Promise<string> {
  const refs = [...text.matchAll(/\$\{([^}]+)\}/g)];
  if (refs.length === 0) return text;
  let result = text;
  for (const m of refs) {
    const val = await credStore.get(m[1]);
    if (val) result = result.replaceAll(m[0], val);
  }
  return result;
}

function truncate(text: string): string {
  return text.length > MAX_RESPONSE ? text.slice(0, MAX_RESPONSE) + "\n...(truncated)" : text;
}

function formatResult(ok: boolean, status: number, body: string): string {
  const text = truncate(body);
  if (ok) return text;

  const hint = statusHint(status);
  return `HTTP ${status}: ${text}${hint ? `\n\nHint: ${hint}` : ""}`;
}

function statusHint(status: number): string | null {
  switch (status) {
    case 301:
    case 302:
    case 307:
    case 308: return "Redirect — the endpoint path is wrong. The API is redirecting to a different URL. Read the API docs with app_web_read to find the correct path, fix the endpoint, and re-register the service with svc.register.";
    case 400: return "Bad request — check param names and types match the API docs. Re-read the docs with app_web_read and fix the endpoint definition.";
    case 401: return "Unauthorized — token may be invalid or expired. Ask user to re-enter credentials.";
    case 403: return "Forbidden — token lacks required scopes/permissions. Check API docs for required scopes.";
    case 404: return "Not found — the path is wrong. Verify the baseUrl and endpoint path against the API docs using app_web_read. Common issues: wrong API version, missing /v1/ or /v2/ prefix, wrong resource name.";
    case 405: return "Method not allowed — wrong HTTP method for this endpoint. Check if it should be GET, POST, PUT, etc.";
    case 429: return "Rate limited — wait a moment and retry.";
    case 500:
    case 502:
    case 503: return "Server error — the API is having issues. Retry in a moment.";
    default: return null;
  }
}
