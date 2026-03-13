const FETCH_TIMEOUT = 30_000;

export function buildRestRequest(
  baseUrl: string,
  transport: { method: string; path: string; body: string },
  params: Record<string, unknown>,
  authQuery: Record<string, string>,
): { url: string; body: string | undefined; contentType: string | undefined } {
  const pathParamNames = [...transport.path.matchAll(/\{(\w+)\}/g)].map((m) => m[1]);
  const urlParams: Record<string, string> = {};
  const queryParams: Record<string, string | string[]> = { ...authQuery };
  const bodyParams: Record<string, unknown> = {};
  const noBody = transport.method === "GET" || transport.method === "DELETE";

  for (const [key, val] of Object.entries(params)) {
    if (pathParamNames.includes(key)) {
      urlParams[key] = String(val);
    } else if (noBody) {
      queryParams[key] = Array.isArray(val) ? val.map(String) : String(val);
    } else {
      bodyParams[key] = val;
    }
  }

  let path = transport.path;
  for (const [key, val] of Object.entries(urlParams)) {
    path = path.replace(`{${key}}`, encodeURIComponent(val));
  }

  const missing = path.match(/\{(\w+)\}/);
  if (missing) {
    return { url: "", body: undefined, contentType: undefined };
  }

  const qs = buildQueryString(queryParams);
  const url = normalizeUrl(`${baseUrl}${path}${qs}`);

  let body: string | undefined;
  let contentType: string | undefined;

  if (!noBody && Object.keys(bodyParams).length > 0) {
    if (transport.body === "form") {
      const parts: string[] = [];
      for (const [k, v] of Object.entries(bodyParams)) {
        if (Array.isArray(v)) {
          for (const item of v) parts.push(`${encodeURIComponent(k)}=${encodeURIComponent(String(item))}`);
        } else {
          parts.push(`${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);
        }
      }
      body = parts.join("&");
      contentType = "application/x-www-form-urlencoded";
    } else if (transport.body === "multipart") {
      body = JSON.stringify(bodyParams);
      contentType = "multipart/form-data";
    } else {
      body = JSON.stringify(bodyParams);
      contentType = "application/json";
    }
  }

  return { url, body, contentType };
}

export function normalizeUrl(raw: string): string {
  const qIdx = raw.indexOf("?");
  const base = qIdx >= 0 ? raw.slice(0, qIdx) : raw;
  const query = qIdx >= 0 ? raw.slice(qIdx) : "";

  const protoEnd = base.indexOf("://");
  if (protoEnd < 0) return raw;

  const afterProto = base.slice(protoEnd + 3);
  const normalized = afterProto
    .replace(/\/{2,}/g, "/")
    .replace(/\/+$/, "");

  return base.slice(0, protoEnd + 3) + normalized + query;
}

function buildQueryString(params: Record<string, string | string[]>): string {
  const parts: string[] = [];
  for (const [k, v] of Object.entries(params)) {
    if (Array.isArray(v)) {
      for (const item of v) parts.push(`${encodeURIComponent(k)}=${encodeURIComponent(item)}`);
    } else {
      parts.push(`${encodeURIComponent(k)}=${encodeURIComponent(v)}`);
    }
  }
  return parts.length > 0 ? "?" + parts.join("&") : "";
}

export async function executeRest(
  baseUrl: string,
  transport: { method: string; path: string; body: string },
  params: Record<string, unknown>,
  auth: { headers: Record<string, string>; query: Record<string, string> },
): Promise<{ status: number; text: string }> {
  const { url, body, contentType } = buildRestRequest(baseUrl, transport, params, auth.query);
  const noBody = transport.method === "GET" || transport.method === "DELETE";

  const res = await fetch(url, {
    method: transport.method,
    headers: { ...auth.headers, ...(contentType && !noBody ? { "Content-Type": contentType } : {}) },
    body: noBody ? undefined : body,
    signal: AbortSignal.timeout(FETCH_TIMEOUT),
  });

  return { status: res.status, text: await res.text() };
}
