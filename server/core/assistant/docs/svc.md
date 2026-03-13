# Service Guide

---

## 1. Before You Start

Always check if the service already exists:

```
bus_emit("svc.list.compact")
```

If a matching service is already registered, **tell the user** and ask if they still want to proceed:

> **{Service}** is already connected. Setting up again would create a duplicate. Would you like to use the existing connection, or set up a new one?

If the user wants the existing one, confirm and **stop** — do not continue setup:

> OK, using the existing **{Service}** connection.

Only continue to step 2 if the user explicitly confirms they want a new connection.

---

## 2. Research

**Never rush. Always research thoroughly before taking any action.**

### Known services

| Service | Guide | Recommended auth |
|---------|-------|-----------------|
| GitHub | `services/github.md` | bearer + PAT |
| Gmail | `services/gmail.md` | oauth |

If a guide exists, read it first: `docs_read("services/<name>.md")`

### Unknown services — investigation order

1. Check saved guide: `bus_emit("svc.guide.read", { "service": "<name>" })`
2. Check bundled guide: `docs_read("services/<name>.md")`
3. **Web search** — this is the primary research tool:
   - `web_search("[Service Name] REST API documentation")`
   - Read the top results with `web_read(url)` to find: base URL, endpoints, auth method, params
4. **Read API docs pages** — use `web_read` on the official docs URL:
   - Extract: base URL, endpoint paths, HTTP methods, request/response params, auth type
   - This is where you get the actual endpoint definitions to build `svc.register`
5. Optionally probe for machine-readable specs:
   - `/openapi.json`, `/swagger.json`, `/.well-known/openapi`
   - MCP: `{baseUrl}/mcp`, `{baseUrl}/sse`

**The goal is to build a complete ServiceDef with real endpoints.** Most APIs don't have OpenAPI/MCP — that's fine. Read the docs, extract endpoints, and build the definition manually. **Never give up just because there's no machine-readable spec.**

### Research workflow

```
1. web_search("todoist REST API documentation")
2. web_read("https://developer.todoist.com/api/v1/")    ← read the docs page
3. Extract from the page:
   - Base URL: https://api.todoist.com/api/v1
   - GET /tasks          → list_tasks
   - POST /tasks         → create_task(content, project_id?, due_string?)
   - GET /projects       → list_projects
   - Auth: Bearer token
4. Build svc.register with these endpoints
```

**Do not skip reading the docs page.** A search result snippet is not enough — always `web_read` the actual documentation to get endpoint details, params, and auth info.

---

## 3. Confirm With User

**You must always reach this step.** If web_search returns results, read the docs with web_read and extract endpoints. Never stop at "no OpenAPI/MCP found" — most APIs are plain REST and you build the definition from their docs.

After research, **always present your findings as a structured summary** before taking any action:

> **{Service} API — Research Summary**
>
> **API type:** REST / MCP / both
>
> **Base URL:** `https://api.example.com/v1`
>
> **Discovered endpoints:**
> - `GET /users/@me` — current user profile
> - `GET /channels/{id}/messages` — list messages
> - `POST /channels/{id}/messages` — send message
> - _(N more...)_
>
> **Auth options:**
> 1. **Bearer + PAT** — simplest, one token
> 2. **OAuth 2.0** — browser-based, automatic refresh
> 3. **Bot token** — for bot accounts (Discord, Telegram)
>
> Which auth method would you like to use?

Wait for user's choice. **Never assume** an auth method or proceed without confirmation.

**Prefer PAT/API key** over OAuth — simpler and more reliable. Only suggest OAuth when PAT isn't available (e.g. Gmail) or the user specifically asks.

---

## 4. Authentication

### Strategy overview

| Strategy | Credential popup | ServiceDef `auth` |
|----------|-----------------|-------------------|
| `bearer` | 1 field: `TOKEN` | `{ "strategy": "bearer", "secretRef": "${svc.<id>.TOKEN}" }` |
| `bot` | 1 field: `TOKEN` | `{ "strategy": "bot", "secretRef": "${svc.<id>.TOKEN}" }` |
| `oauth` | 2 fields: `CLIENT_ID` + `CLIENT_SECRET` + `oauth` block | `{ "strategy": "oauth", "secretRef": "${svc.<id>.TOKEN}" }` |
| `header` | 1 field: `KEY` | `{ "strategy": "header", "header": "X-Api-Key", "secretRef": "${svc.<id>.KEY}" }` |
| `query` | 1 field: `KEY` | `{ "strategy": "query", "param": "api_key", "secretRef": "${svc.<id>.KEY}" }` |
| `basic` | 1 field: `CREDS` | `{ "strategy": "basic", "secretRef": "${svc.<id>.CREDS}" }` |

Use `bearer` for standard OAuth/API tokens (`Authorization: Bearer <token>`). Use `bot` for Discord/Telegram bot tokens (`Authorization: Bot <token>`).

### Token-based auth (bearer / bot / header / query / basic)

Emit `svc.request.input` with `fields` only — **no `oauth` block**:

```json
{
  "service": "github",
  "title": "GitHub Setup",
  "description": "Create a Personal Access Token with repo and read:user scopes",
  "link": "https://github.com/settings/tokens/new?scopes=repo,read:user",
  "fields": [
    { "name": "TOKEN", "label": "Personal Access Token", "type": "password" }
  ]
}
```

Popup shown to user:

```
┌─────────────────────────────────────┐
│ 🔑 GitHub Setup                     │
│                                     │
│ Create a Personal Access Token with │
│ repo and read:user scopes           │
│                                     │
│ 🔗 Open setup page                  │
│                                     │
│ Personal Access Token               │
│ ┌─────────────────────────────────┐ │
│ │ ••••••••••••••••                │ │
│ └─────────────────────────────────┘ │
│                                     │
│  [Submit]  [Cancel]                 │
└─────────────────────────────────────┘
```

User pastes token → clicks Submit → stored as `svc.github.TOKEN` → done.

### OAuth auth

Emit `svc.request.input` with `fields` **AND** an `oauth` block:

```json
{
  "service": "gmail",
  "title": "Gmail OAuth Setup",
  "description": "Create a Desktop OAuth app in Google Cloud Console, enable Gmail API",
  "link": "https://console.cloud.google.com/apis/credentials",
  "fields": [
    { "name": "CLIENT_ID", "label": "Client ID", "type": "text" },
    { "name": "CLIENT_SECRET", "label": "Client Secret", "type": "password" }
  ],
  "oauth": {
    "authUrl": "https://accounts.google.com/o/oauth2/v2/auth",
    "tokenUrl": "https://oauth2.googleapis.com/token",
    "scopes": ["https://www.googleapis.com/auth/gmail.modify"],
    "tokenKey": "TOKEN"
  }
}
```

Popup shown to user:

```
┌─────────────────────────────────────┐
│ 🔑 Gmail OAuth Setup                │
│                                     │
│ Create a Desktop OAuth app in       │
│ Google Cloud Console, enable Gmail  │
│                                     │
│ 🔗 Open setup page                  │
│                                     │
│ Client ID                           │
│ ┌─────────────────────────────────┐ │
│ │ 1234567890.apps.googleuser...   │ │
│ └─────────────────────────────────┘ │
│ Client Secret                       │
│ ┌─────────────────────────────────┐ │
│ │ ••••••••••••••••                │ │
│ └─────────────────────────────────┘ │
│                                     │
│  [Submit]  [Cancel]                 │
└─────────────────────────────────────┘
```

User fills in both fields → clicks Submit → popup handles the entire OAuth flow automatically. You just emit `svc.request.input` and wait for the response, then proceed to `svc.register`.

### Field rules

- UPPERCASE names: `TOKEN`, `CLIENT_ID`, `CLIENT_SECRET`
- `type: "password"` for secrets, `type: "text"` for IDs
- Always include `link` to the developer console / token creation page
- `secretRef` format: always `${svc.<service>.<FIELD>}`

---

## 5. ServiceDef Schema

### Top-level

```json
{
  "id":        "github",                       // /^[a-z][a-z0-9_]*$/
  "label":     "GitHub",
  "baseUrl":   "https://api.github.com",       // valid URL, no trailing slash
  "icon":      "https://...",                   // optional
  "auth":      { "strategy": "bearer", "secretRef": "${svc.github.TOKEN}" },
  "endpoints": [ ... ],
  "oauth":     { ... }                         // only for strategy "oauth"
}
```

### OAuth config (in ServiceDef)

Required when `auth.strategy` is `"oauth"`. Tells the router how to refresh tokens on 401:

```json
{
  "tokenUrl":        "https://oauth2.googleapis.com/token",
  "clientIdKey":     "${svc.gmail.CLIENT_ID}",
  "clientSecretKey": "${svc.gmail.CLIENT_SECRET}",
  "refreshKey":      "${svc.gmail.REFRESH_TOKEN}"
}
```

### Endpoints

```json
{
  "name":        "list_repos",                     // /^[a-z][a-z0-9_]+$/
  "description": "List repositories for the user", // min 10 chars
  "input":       { ... },
  "output":      {},
  "transport":   { ... }
}
```

### Transport

REST:
```json
{ "type": "rest", "method": "GET", "path": "/user/repos", "body": "json" }
```

MCP:
```json
{ "type": "mcp", "url": "https://example.com/mcp" }
```

### Param routing (REST, implicit)

No `"in"` field needed — params are routed automatically:

- `{name}` in path → **URL param**
- GET/DELETE → remaining → **query string**
- POST/PUT/PATCH → remaining → **request body**

### FieldDef

```json
{
  "type":        "string",            // string, number, boolean, array, enum, object
  "description": "Search query",
  "optional":    true,
  "default":     10,
  "format":      "email",            // base64url, base64, email, url, uuid, datetime, date, json
  "values":      ["open", "closed"], // enum only
  "items":       "string",           // array only
  "fields":      { ... }            // object / array-of-objects only
}
```

Use **real API param names**: `q` not `query`, `per_page` not `perPage`.

---

## 6. MCP Discovery

MCP endpoints are dynamic — tools are defined by the server, not by you.

### Step 1 — Discover

```
bus_emit("svc.register", { "id": "...", "baseUrl": "...", "auth": { ... }, "endpoints": [] })
```

Returns: `{ "status": "discovered", "endpointCount": 43, "summary": "- tool_name: description | required: a, b | optional: c\n..." }`

The summary lists each tool with its description, required and optional params.

### Step 2 — Register with full endpoints

Build EndpointDefs from the summary. Each endpoint needs:
- `name` — from the tool name
- `description` — from the summary (min 10 chars)
- `input` — FieldDef for each param. Required params get `optional: false`, optional get `optional: true`. Use `type: "string"` unless the name clearly indicates otherwise (e.g. `page` → `type: "number"`)
- `output` — `{}`
- `transport` — `{ "type": "mcp", "url": "<baseUrl>" }`

Then call `svc.register` again with full endpoints, then `svc.test`.

---

## 7. Test & Finalize

### Register

```
bus_emit("svc.register", { <ServiceDef> })
```

Returns `{ "status": "registered" }` or `{ "status": "error", "errors": "..." }`.

### Test

```
bus_emit("svc.test", { "service": "<id>" })
```

Returns `{ "ok": true }` or `{ "ok": false, "error": "..." }`.

Failures: 401 → bad token; 404 → wrong URL/path; network error → service down.

### Write guide

```
bus_emit("svc.guide", { "service": "<id>", "content": "<markdown>" })
```

Document: auth method, scopes, endpoints, failures and fixes, icon URL.

### Report

> ✓ **{Service}** is connected. You can now ask me to {list of capabilities}.

---

## 8. Rules

- **Research first, act second.** Never guess URLs, auth methods, or endpoints.
- **Always confirm auth choice** with the user before collecting credentials.
- Always check `svc.list.compact` first — don't re-register existing services.
- Always validate with `svc.test` before telling the user it's done.
- Always write a guide with `svc.guide` after successful connection.
- Never log, print, or include tokens in chat messages.
- Proxy is a dumb pipe — build API-native values (e.g. base64url for Gmail `raw`).
- `secretRef` format is always `${svc.<service>.<FIELD>}` — never plain strings.
