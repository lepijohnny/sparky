import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import { createServiceRouter, buildRestRequest, normalizeUrl, type ServiceRouter } from "../proxy.router";
import type { ServiceDef } from "../proxy.schema";
import type { Credentials } from "../../cred";
import type { Logger } from "../../../logger.types";

function mockCred(store: Record<string, string> = {}): Credentials {
  return {
    init: vi.fn(),
    get: vi.fn(async (key: string) => store[key] ?? null),
    set: vi.fn(async (key: string, value: string) => { store[key] = value; }),
    delete: vi.fn(),
    deletePrefix: vi.fn(),
    keys: vi.fn(() => Object.keys(store)),
    svcKey: vi.fn((svc: string, field: string) => `svc.${svc}.${field}`),
    deleteSvc: vi.fn(),
  };
}

function mockLog(): Logger {
  return { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() };
}

const GITHUB_DEF: ServiceDef = {
  id: "github",
  label: "GitHub",
  baseUrl: "https://api.github.com",
  auth: { strategy: "bearer", secretRef: "${svc.github.TOKEN}" },
  endpoints: [
    {
      name: "get_user",
      description: "Get the authenticated user profile",
      input: {},
      output: {},
      transport: { type: "rest", method: "GET", path: "/user", body: "json" },
      secretRefs: [],
      status: "unvalidated",
    },
    {
      name: "get_repo",
      description: "Get a repository by owner and name",
      input: {
        owner: { type: "string", optional: false },
        repo: { type: "string", optional: false },
      },
      output: {},
      transport: { type: "rest", method: "GET", path: "/repos/{owner}/{repo}", body: "json" },
      secretRefs: [],
      status: "unvalidated",
    },
    {
      name: "create_issue",
      description: "Create an issue in a repository",
      input: {
        owner: { type: "string", optional: false },
        repo: { type: "string", optional: false },
        title: { type: "string", optional: false },
        body: { type: "string", optional: true },
        labels: { type: "array", items: "string", optional: true },
      },
      output: {},
      transport: { type: "rest", method: "POST", path: "/repos/{owner}/{repo}/issues", body: "json" },
      secretRefs: [],
      status: "unvalidated",
    },
    {
      name: "search_code",
      description: "Search code across repositories",
      input: {
        q: { type: "string", optional: false },
        per_page: { type: "number", optional: true, default: 30 },
      },
      output: {},
      transport: { type: "rest", method: "GET", path: "/search/code", body: "json" },
      secretRefs: [],
      status: "unvalidated",
    },
  ],
};

const GMAIL_DEF: ServiceDef = {
  id: "gmail",
  label: "Gmail",
  baseUrl: "https://gmail.googleapis.com/gmail/v1",
  auth: { strategy: "oauth", secretRef: "${svc.gmail.TOKEN}" },
  oauth: {
    tokenUrl: "https://oauth2.googleapis.com/token",
    clientIdKey: "${svc.gmail.CLIENT_ID}",
    clientSecretKey: "${svc.gmail.CLIENT_SECRET}",
    refreshKey: "${svc.gmail.REFRESH_TOKEN}",
  },
  endpoints: [
    {
      name: "send_email",
      description: "Send an email as base64url-encoded RFC 2822",
      input: {
        raw: { type: "string", format: "base64url", optional: false },
      },
      output: {},
      transport: { type: "rest", method: "POST", path: "/users/me/messages/send", body: "json" },
      secretRefs: [],
      status: "unvalidated",
    },
  ],
};

describe("normalizeUrl", () => {
  test("given double slashes in path, when normalized, then collapses to single", () => {
    expect(normalizeUrl("https://api.github.com//user")).toBe("https://api.github.com/user");
  });

  test("given triple slashes in path, when normalized, then collapses to single", () => {
    expect(normalizeUrl("https://api.example.com///v1///tasks")).toBe("https://api.example.com/v1/tasks");
  });

  test("given trailing slash, when normalized, then removes it", () => {
    expect(normalizeUrl("https://api.github.com/user/")).toBe("https://api.github.com/user");
  });

  test("given trailing double slash, when normalized, then removes all", () => {
    expect(normalizeUrl("https://api.github.com/user//")).toBe("https://api.github.com/user");
  });

  test("given clean URL, when normalized, then returns unchanged", () => {
    expect(normalizeUrl("https://api.github.com/user")).toBe("https://api.github.com/user");
  });

  test("given root path only, when normalized, then returns without trailing slash", () => {
    expect(normalizeUrl("https://api.github.com/")).toBe("https://api.github.com");
  });

  test("given query params, when normalized, then preserves them", () => {
    expect(normalizeUrl("https://api.github.com//search//code?q=test&per_page=10"))
      .toBe("https://api.github.com/search/code?q=test&per_page=10");
  });

  test("given baseUrl trailing + path leading slash, when built together, then no double slash", () => {
    const result = buildRestRequest(
      "https://api.github.com/",
      { method: "GET", path: "/user", body: "json" },
      {},
      {},
    );
    expect(result.url).toBe("https://api.github.com/user");
  });

  test("given baseUrl double trailing + path slash, when built, then normalized", () => {
    const result = buildRestRequest(
      "https://api.github.com//",
      { method: "GET", path: "//user//repos", body: "json" },
      {},
      {},
    );
    expect(result.url).toBe("https://api.github.com/user/repos");
  });
});

describe("query param encoding", () => {
  test("given query value with spaces, when built, then percent-encodes", () => {
    const result = buildRestRequest(
      "https://api.github.com",
      { method: "GET", path: "/search/code", body: "json" },
      { q: "react hooks useState" },
      {},
    );
    expect(result.url).toContain("q=react%20hooks%20useState");
  });

  test("given query value with ampersand, when built, then percent-encodes", () => {
    const result = buildRestRequest(
      "https://api.example.com",
      { method: "GET", path: "/search", body: "json" },
      { q: "salt & pepper" },
      {},
    );
    expect(result.url).toContain("q=salt%20%26%20pepper");
    expect(result.url.split("&").length).toBe(1);
  });

  test("given query value with hash, when built, then percent-encodes", () => {
    const result = buildRestRequest(
      "https://api.example.com",
      { method: "GET", path: "/issues", body: "json" },
      { label: "#bug" },
      {},
    );
    expect(result.url).toContain("label=%23bug");
  });

  test("given query value with equals sign, when built, then percent-encodes", () => {
    const result = buildRestRequest(
      "https://api.example.com",
      { method: "GET", path: "/search", body: "json" },
      { filter: "status=open" },
      {},
    );
    expect(result.url).toContain("filter=status%3Dopen");
  });

  test("given query value with plus sign, when built, then percent-encodes", () => {
    const result = buildRestRequest(
      "https://api.example.com",
      { method: "GET", path: "/search", body: "json" },
      { q: "c++" },
      {},
    );
    expect(result.url).toContain("q=c%2B%2B");
  });

  test("given query value with unicode, when built, then percent-encodes", () => {
    const result = buildRestRequest(
      "https://api.example.com",
      { method: "GET", path: "/search", body: "json" },
      { q: "café" },
      {},
    );
    expect(result.url).toContain("q=caf%C3%A9");
  });

  test("given query key with special chars, when built, then encodes key too", () => {
    const result = buildRestRequest(
      "https://api.example.com",
      { method: "GET", path: "/filter", body: "json" },
      { "filter[status]": "open" },
      {},
    );
    expect(result.url).toContain("filter%5Bstatus%5D=open");
  });

  test("given auth query param with special chars, when built, then encodes", () => {
    const result = buildRestRequest(
      "https://api.example.com",
      { method: "GET", path: "/tasks", body: "json" },
      {},
      { api_key: "key=with+special&chars" },
    );
    expect(result.url).toContain("api_key=key%3Dwith%2Bspecial%26chars");
  });
});

describe("buildRestRequest", () => {
  test("given GET with no params, when built, then returns clean URL", () => {
    const result = buildRestRequest("https://api.github.com", { method: "GET", path: "/user", body: "json" }, {}, {});
    expect(result.url).toBe("https://api.github.com/user");
    expect(result.body).toBeUndefined();
  });

  test("given GET with query params, when built, then appends query string", () => {
    const result = buildRestRequest(
      "https://api.github.com",
      { method: "GET", path: "/search/code", body: "json" },
      { q: "react hooks", per_page: 10 },
      {},
    );
    expect(result.url).toBe("https://api.github.com/search/code?q=react%20hooks&per_page=10");
  });

  test("given GET with URL params, when built, then interpolates path", () => {
    const result = buildRestRequest(
      "https://api.github.com",
      { method: "GET", path: "/repos/{owner}/{repo}", body: "json" },
      { owner: "lepijohnny", repo: "atelier" },
      {},
    );
    expect(result.url).toBe("https://api.github.com/repos/lepijohnny/atelier");
  });

  test("given POST with mixed URL and body params, when built, then separates correctly", () => {
    const result = buildRestRequest(
      "https://api.github.com",
      { method: "POST", path: "/repos/{owner}/{repo}/issues", body: "json" },
      { owner: "lepijohnny", repo: "atelier", title: "Bug fix", labels: ["bug"] },
      {},
    );
    expect(result.url).toBe("https://api.github.com/repos/lepijohnny/atelier/issues");
    expect(JSON.parse(result.body!)).toEqual({ title: "Bug fix", labels: ["bug"] });
    expect(result.contentType).toBe("application/json");
  });

  test("given POST with form body, when built, then encodes as form", () => {
    const result = buildRestRequest(
      "https://example.com",
      { method: "POST", path: "/token", body: "form" },
      { grant_type: "authorization_code", code: "abc123" },
      {},
    );
    expect(result.contentType).toBe("application/x-www-form-urlencoded");
    expect(result.body).toContain("grant_type=authorization_code");
    expect(result.body).toContain("code=abc123");
  });

  test("given GET with auth query params, when built, then merges with user params", () => {
    const result = buildRestRequest(
      "https://api.example.com",
      { method: "GET", path: "/tasks", body: "json" },
      { page: 1 },
      { api_key: "secret123" },
    );
    expect(result.url).toContain("api_key=secret123");
    expect(result.url).toContain("page=1");
  });

  test("given URL with special chars in param, when built, then encodes", () => {
    const result = buildRestRequest(
      "https://api.github.com",
      { method: "GET", path: "/repos/{owner}/{repo}", body: "json" },
      { owner: "my org", repo: "my/repo" },
      {},
    );
    expect(result.url).toBe("https://api.github.com/repos/my%20org/my%2Frepo");
  });

  test("given baseUrl with trailing slash, when built, then strips it", () => {
    const result = buildRestRequest("https://api.github.com/", { method: "GET", path: "/user", body: "json" }, {}, {});
    expect(result.url).toBe("https://api.github.com/user");
  });

  test("given GET with array query param, when built, then repeats keys", () => {
    const result = buildRestRequest(
      "https://api.example.com",
      { method: "GET", path: "/issues", body: "json" },
      { labels: ["bug", "urgent"] },
      {},
    );
    expect(result.url).toContain("labels=bug");
    expect(result.url).toContain("labels=urgent");
  });

  test("given DELETE with params, when built, then routes to query", () => {
    const result = buildRestRequest(
      "https://api.example.com",
      { method: "DELETE", path: "/tasks/{id}", body: "json" },
      { id: "123", force: true },
      {},
    );
    expect(result.url).toBe("https://api.example.com/tasks/123?force=true");
    expect(result.body).toBeUndefined();
  });
});

describe("ServiceRouter", () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, "fetch");
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  function jsonResponse(data: unknown, status = 200): Response {
    return new Response(JSON.stringify(data), {
      status,
      headers: { "Content-Type": "application/json" },
    });
  }

  test("given unknown endpoint, when called, then returns error with available list", async () => {
    const router = createServiceRouter(GITHUB_DEF, mockCred({ "svc.github.TOKEN": "ghp_test" }), mockLog());
    const result = await router.call("nonexistent", {});
    expect(result.ok).toBe(false);
    expect(result.text).toContain("Unknown endpoint");
    expect(result.text).toContain("get_user");
    router.dispose();
  });

  test("given missing token, when called, then returns auth error", async () => {
    const router = createServiceRouter(GITHUB_DEF, mockCred({}), mockLog());
    const result = await router.call("get_user", {});
    expect(result.ok).toBe(false);
    expect(result.text).toContain("missing");
    router.dispose();
  });

  test("given valid GET endpoint, when called, then makes fetch with bearer auth", async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse({ login: "lepijohnny" }));

    const router = createServiceRouter(GITHUB_DEF, mockCred({ "svc.github.TOKEN": "ghp_test" }), mockLog());
    const result = await router.call("get_user", {});

    expect(result.ok).toBe(true);
    expect(result.text).toContain("lepijohnny");
    expect(fetchSpy).toHaveBeenCalledWith(
      "https://api.github.com/user",
      expect.objectContaining({
        method: "GET",
        headers: expect.objectContaining({ Authorization: "Bearer ghp_test" }),
      }),
    );
    router.dispose();
  });

  test("given GET with URL params, when called, then interpolates path", async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse({ full_name: "lepijohnny/atelier" }));

    const router = createServiceRouter(GITHUB_DEF, mockCred({ "svc.github.TOKEN": "ghp_test" }), mockLog());
    const result = await router.call("get_repo", { owner: "lepijohnny", repo: "atelier" });

    expect(result.ok).toBe(true);
    expect(fetchSpy).toHaveBeenCalledWith(
      "https://api.github.com/repos/lepijohnny/atelier",
      expect.anything(),
    );
    router.dispose();
  });

  test("given GET with URL params missing, when called, then returns validation error", async () => {
    const router = createServiceRouter(GITHUB_DEF, mockCred({ "svc.github.TOKEN": "ghp_test" }), mockLog());
    const result = await router.call("get_repo", { owner: "lepijohnny" });

    expect(result.ok).toBe(false);
    expect(result.text).toContain("repo");
    expect(fetchSpy).not.toHaveBeenCalled();
    router.dispose();
  });

  test("given POST endpoint, when called, then sends JSON body", async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse({ id: 1, number: 42 }, 201));

    const router = createServiceRouter(GITHUB_DEF, mockCred({ "svc.github.TOKEN": "ghp_test" }), mockLog());
    const result = await router.call("create_issue", {
      owner: "lepijohnny",
      repo: "atelier",
      title: "Fix bug",
      labels: ["bug"],
    });

    expect(result.ok).toBe(true);
    const call = fetchSpy.mock.calls[0];
    expect(call[0]).toBe("https://api.github.com/repos/lepijohnny/atelier/issues");
    const opts = call[1] as RequestInit;
    expect(JSON.parse(opts.body as string)).toEqual({ title: "Fix bug", labels: ["bug"] });
    router.dispose();
  });

  test("given POST with missing required field, when called, then returns validation error without fetch", async () => {
    const router = createServiceRouter(GITHUB_DEF, mockCred({ "svc.github.TOKEN": "ghp_test" }), mockLog());
    const result = await router.call("create_issue", {
      owner: "lepijohnny",
      repo: "atelier",
    });

    expect(result.ok).toBe(false);
    expect(result.text).toContain("title");
    expect(fetchSpy).not.toHaveBeenCalled();
    router.dispose();
  });

  test("given GET endpoint, when defaults applied, then uses default values", async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse({ total_count: 5 }));

    const router = createServiceRouter(GITHUB_DEF, mockCred({ "svc.github.TOKEN": "ghp_test" }), mockLog());
    await router.call("search_code", { q: "hooks" });

    const url = fetchSpy.mock.calls[0][0] as string;
    expect(url).toContain("q=hooks");
    expect(url).toContain("per_page=30");
    router.dispose();
  });

  test("given HTTP 404 response, when called, then returns not ok with status", async () => {
    fetchSpy.mockResolvedValueOnce(new Response("Not Found", { status: 404 }));

    const router = createServiceRouter(GITHUB_DEF, mockCred({ "svc.github.TOKEN": "ghp_test" }), mockLog());
    const result = await router.call("get_repo", { owner: "x", repo: "nonexistent" });

    expect(result.ok).toBe(false);
    expect(result.text).toContain("404");
    router.dispose();
  });

  test("given network error, when called, then returns error message", async () => {
    fetchSpy.mockRejectedValueOnce(new Error("fetch failed: ECONNREFUSED"));

    const router = createServiceRouter(GITHUB_DEF, mockCred({ "svc.github.TOKEN": "ghp_test" }), mockLog());
    const result = await router.call("get_user", {});

    expect(result.ok).toBe(false);
    expect(result.text).toContain("Network error");
    expect(result.text).toContain("ECONNREFUSED");
    router.dispose();
  });

  test("given endpoints method, when called, then returns endpoint names", () => {
    const router = createServiceRouter(GITHUB_DEF, mockCred({}), mockLog());
    expect(router.endpoints()).toEqual(["get_user", "get_repo", "create_issue", "search_code"]);
    router.dispose();
  });
});

describe("ServiceRouter OAuth refresh", () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, "fetch");
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  test("given 401 with oauth strategy, when refresh succeeds, then retries with new token", async () => {
    const store: Record<string, string> = {
      "svc.gmail.TOKEN": "expired_token",
      "svc.gmail.CLIENT_ID": "cid",
      "svc.gmail.CLIENT_SECRET": "csec",
      "svc.gmail.REFRESH_TOKEN": "refresh_tok",
    };

    fetchSpy
      .mockResolvedValueOnce(new Response("Unauthorized", { status: 401 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: "new_token" }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: "msg1" }), { status: 200 }));

    const cred = mockCred(store);
    const router = createServiceRouter(GMAIL_DEF, cred, mockLog());
    const result = await router.call("send_email", { raw: "SGVsbG8" });

    expect(result.ok).toBe(true);
    expect(store["svc.gmail.TOKEN"]).toBe("new_token");
    expect(fetchSpy).toHaveBeenCalledTimes(3);
    router.dispose();
  });

  test("given 401 with oauth strategy, when refresh fails, then returns auth error", async () => {
    const store: Record<string, string> = {
      "svc.gmail.TOKEN": "expired_token",
      "svc.gmail.CLIENT_ID": "cid",
      "svc.gmail.REFRESH_TOKEN": "refresh_tok",
    };

    fetchSpy
      .mockResolvedValueOnce(new Response("Unauthorized", { status: 401 }))
      .mockResolvedValueOnce(new Response("Bad Request", { status: 400 }));

    const router = createServiceRouter(GMAIL_DEF, mockCred(store), mockLog());
    const result = await router.call("send_email", { raw: "SGVsbG8" });

    expect(result.ok).toBe(false);
    expect(result.text).toContain("refresh failed");
    router.dispose();
  });

  test("given 401 with bearer strategy (no oauth), when called, then does not attempt refresh", async () => {
    fetchSpy.mockResolvedValueOnce(new Response("Unauthorized", { status: 401 }));

    const router = createServiceRouter(GITHUB_DEF, mockCred({ "svc.github.TOKEN": "bad_tok" }), mockLog());
    const result = await router.call("get_user", {});

    expect(result.ok).toBe(false);
    expect(result.text).toContain("401");
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    router.dispose();
  });

  test("given 401 with oauth but no refresh key, when called, then fails without token exchange", async () => {
    const noRefreshDef: ServiceDef = {
      ...GMAIL_DEF,
      oauth: {
        tokenUrl: "https://oauth2.googleapis.com/token",
        clientIdKey: "${svc.gmail.CLIENT_ID}",
      },
    };

    fetchSpy.mockResolvedValueOnce(new Response("Unauthorized", { status: 401 }));

    const router = createServiceRouter(noRefreshDef, mockCred({ "svc.gmail.TOKEN": "expired" }), mockLog());
    const result = await router.call("send_email", { raw: "SGVsbG8" });

    expect(result.ok).toBe(false);
    expect(result.text).toContain("refresh failed");
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    router.dispose();
  });
});

describe("ServiceRouter format validation", () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, "fetch");
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  test("given base64url format, when plain text sent, then rejects without fetch", async () => {
    const router = createServiceRouter(GMAIL_DEF, mockCred({ "svc.gmail.TOKEN": "tok" }), mockLog());
    const result = await router.call("send_email", { raw: "To: user@example.com\nSubject: Hello\n\nBody" });

    expect(result.ok).toBe(false);
    expect(result.text).toContain("validation failed");
    expect(fetchSpy).not.toHaveBeenCalled();
    router.dispose();
  });

  test("given base64url format, when valid base64url sent, then makes request", async () => {
    fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify({ id: "msg1" }), { status: 200 }));

    const router = createServiceRouter(GMAIL_DEF, mockCred({ "svc.gmail.TOKEN": "tok" }), mockLog());
    const result = await router.call("send_email", { raw: "VG86IHVzZXJAZXhhbXBsZS5jb20" });

    expect(result.ok).toBe(true);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    router.dispose();
  });
});

describe("ServiceRouter auth strategies", () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, "fetch");
    fetchSpy.mockResolvedValue(new Response("{}", { status: 200 }));
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  test("given header auth strategy, when called, then sends custom header", async () => {
    const def: ServiceDef = {
      ...GITHUB_DEF,
      auth: { strategy: "header", header: "X-Api-Key", secretRef: "${svc.github.TOKEN}" },
    };

    const router = createServiceRouter(def, mockCred({ "svc.github.TOKEN": "mykey" }), mockLog());
    await router.call("get_user", {});

    const headers = (fetchSpy.mock.calls[0][1] as RequestInit).headers as Record<string, string>;
    expect(headers["X-Api-Key"]).toBe("mykey");
    expect(headers["Authorization"]).toBeUndefined();
    router.dispose();
  });

  test("given query auth strategy, when called, then appends query param", async () => {
    const def: ServiceDef = {
      ...GITHUB_DEF,
      auth: { strategy: "query", param: "api_key", secretRef: "${svc.github.TOKEN}" },
    };

    const router = createServiceRouter(def, mockCred({ "svc.github.TOKEN": "mykey" }), mockLog());
    await router.call("get_user", {});

    const url = fetchSpy.mock.calls[0][0] as string;
    expect(url).toContain("api_key=mykey");
    router.dispose();
  });

  test("given basic auth strategy, when called, then sends Basic header", async () => {
    const def: ServiceDef = {
      ...GITHUB_DEF,
      auth: { strategy: "basic", secretRef: "${svc.github.TOKEN}" },
    };

    const router = createServiceRouter(def, mockCred({ "svc.github.TOKEN": "dXNlcjpwYXNz" }), mockLog());
    await router.call("get_user", {});

    const headers = (fetchSpy.mock.calls[0][1] as RequestInit).headers as Record<string, string>;
    expect(headers["Authorization"]).toBe("Basic dXNlcjpwYXNz");
    router.dispose();
  });
});


