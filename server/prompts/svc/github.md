# GitHub

## Recommended: Bearer + PAT

PAT is the simplest and most reliable auth for GitHub.

### Collect credentials

```json
{
  "service": "github",
  "title": "GitHub Setup",
  "description": "Create a Personal Access Token (classic) with repo and read:user scopes",
  "link": "https://github.com/settings/tokens/new?scopes=repo,read:user",
  "fields": [
    { "name": "TOKEN", "label": "Personal Access Token", "type": "password" }
  ]
}
```

### Register

```json
{
  "id": "github",
  "label": "GitHub",
  "baseUrl": "https://api.github.com",
  "icon": "https://github.githubassets.com/favicons/favicon.svg",
  "auth": { "strategy": "bearer", "secretRef": "${svc.github.TOKEN}" },
  "endpoints": [
    { "name": "get_user", "description": "Get the authenticated user profile", "input": {}, "output": {}, "transport": { "type": "rest", "method": "GET", "path": "/user" } },
    { "name": "list_repos", "description": "List repositories for the authenticated user", "input": { "sort": { "type": "enum", "values": ["created", "updated", "pushed", "full_name"], "optional": true, "default": "full_name" }, "per_page": { "type": "number", "optional": true, "default": 30 }, "page": { "type": "number", "optional": true, "default": 1 } }, "output": {}, "transport": { "type": "rest", "method": "GET", "path": "/user/repos" } },
    { "name": "get_repo", "description": "Get a repository by owner and name", "input": { "owner": { "type": "string" }, "repo": { "type": "string" } }, "output": {}, "transport": { "type": "rest", "method": "GET", "path": "/repos/{owner}/{repo}" } },
    { "name": "list_issues", "description": "List issues for a repository", "input": { "owner": { "type": "string" }, "repo": { "type": "string" }, "state": { "type": "enum", "values": ["open", "closed", "all"], "optional": true, "default": "open" }, "per_page": { "type": "number", "optional": true, "default": 30 } }, "output": {}, "transport": { "type": "rest", "method": "GET", "path": "/repos/{owner}/{repo}/issues" } },
    { "name": "get_issue", "description": "Get a single issue by number", "input": { "owner": { "type": "string" }, "repo": { "type": "string" }, "issue_number": { "type": "number" } }, "output": {}, "transport": { "type": "rest", "method": "GET", "path": "/repos/{owner}/{repo}/issues/{issue_number}" } },
    { "name": "create_issue", "description": "Create an issue in a repository", "input": { "owner": { "type": "string" }, "repo": { "type": "string" }, "title": { "type": "string" }, "body": { "type": "string", "optional": true }, "labels": { "type": "array", "items": "string", "optional": true }, "assignees": { "type": "array", "items": "string", "optional": true } }, "output": {}, "transport": { "type": "rest", "method": "POST", "path": "/repos/{owner}/{repo}/issues" } },
    { "name": "list_pulls", "description": "List pull requests for a repository", "input": { "owner": { "type": "string" }, "repo": { "type": "string" }, "state": { "type": "enum", "values": ["open", "closed", "all"], "optional": true, "default": "open" }, "per_page": { "type": "number", "optional": true, "default": 30 } }, "output": {}, "transport": { "type": "rest", "method": "GET", "path": "/repos/{owner}/{repo}/pulls" } },
    { "name": "get_pull", "description": "Get a single pull request by number", "input": { "owner": { "type": "string" }, "repo": { "type": "string" }, "pull_number": { "type": "number" } }, "output": {}, "transport": { "type": "rest", "method": "GET", "path": "/repos/{owner}/{repo}/pulls/{pull_number}" } },
    { "name": "list_commits", "description": "List commits for a repository", "input": { "owner": { "type": "string" }, "repo": { "type": "string" }, "per_page": { "type": "number", "optional": true, "default": 30 } }, "output": {}, "transport": { "type": "rest", "method": "GET", "path": "/repos/{owner}/{repo}/commits" } },
    { "name": "search_repos", "description": "Search repositories across GitHub", "input": { "q": { "type": "string", "description": "GitHub search query" }, "per_page": { "type": "number", "optional": true, "default": 30 } }, "output": {}, "transport": { "type": "rest", "method": "GET", "path": "/search/repositories" } },
    { "name": "search_issues", "description": "Search issues and pull requests across GitHub", "input": { "q": { "type": "string", "description": "GitHub search query" }, "per_page": { "type": "number", "optional": true, "default": 30 } }, "output": {}, "transport": { "type": "rest", "method": "GET", "path": "/search/issues" } },
    { "name": "search_code", "description": "Search code across all repositories", "input": { "q": { "type": "string", "description": "GitHub search query" }, "per_page": { "type": "number", "optional": true, "default": 30 } }, "output": {}, "transport": { "type": "rest", "method": "GET", "path": "/search/code" } },
    { "name": "list_notifications", "description": "List notifications for the authenticated user", "input": { "all": { "type": "boolean", "optional": true, "default": false, "description": "Show all notifications including read" }, "per_page": { "type": "number", "optional": true, "default": 30 } }, "output": {}, "transport": { "type": "rest", "method": "GET", "path": "/notifications" } },
    { "name": "list_gists", "description": "List gists for the authenticated user", "input": { "per_page": { "type": "number", "optional": true, "default": 30 } }, "output": {}, "transport": { "type": "rest", "method": "GET", "path": "/gists" } },
    { "name": "get_contents", "description": "Get file or directory contents from a repository", "input": { "owner": { "type": "string" }, "repo": { "type": "string" }, "path": { "type": "string", "description": "File or directory path" }, "ref": { "type": "string", "optional": true, "description": "Branch, tag, or commit SHA" } }, "output": {}, "transport": { "type": "rest", "method": "GET", "path": "/repos/{owner}/{repo}/contents/{path}" } }
  ]
}
```

### Verify

Endpoint: `get_user` — returns the authenticated user's profile. No parameters needed.

---

## Alternative: MCP Transport

GitHub also offers an MCP server. Use this when the user explicitly requests MCP.

### Auth options

**Option A — PAT (simpler)**: Same PAT as REST — collect TOKEN via `svc.request.input`.

**Option B — OAuth PKCE**: If the user wants OAuth, collect CLIENT_ID and CLIENT_SECRET, then run the full OAuth flow:

```json
{
  "service": "github_mcp",
  "title": "GitHub OAuth Setup",
  "description": "Create an OAuth App at GitHub Developer Settings",
  "link": "https://github.com/settings/developers",
  "fields": [
    { "name": "CLIENT_ID", "label": "Client ID", "type": "text" },
    { "name": "CLIENT_SECRET", "label": "Client Secret", "type": "password" }
  ],
  "oauth": {
    "authUrl": "https://github.com/login/oauth/authorize",
    "tokenUrl": "https://github.com/login/oauth/access_token",
    "scopes": ["repo", "read:user"],
    "tokenKey": "TOKEN"
  }
}
```

After user submits, the popup handles the browser OAuth flow automatically. Then proceed to register.

### Register (Step 1 — discover)

```json
{
  "id": "github_mcp",
  "label": "GitHub MCP",
  "baseUrl": "https://api.githubcopilot.com/mcp/",
  "auth": { "strategy": "bearer", "secretRef": "${svc.github_mcp.TOKEN}" },
  "endpoints": []
}
```

This returns `{ "status": "discovered", "tools": [...] }` with the full tool list.

### Register (Step 2 — build endpoints)

Convert each discovered tool to an endpoint. Map the tool's `inputSchema` to `FieldDef` format:

- JSON Schema `"type": "string"` → `{ "type": "string" }`
- `"type": "number"/"integer"` → `{ "type": "number" }`
- `"type": "boolean"` → `{ "type": "boolean" }`
- `"type": "array"` → `{ "type": "array", "items": "string" }`
- `"enum": [...]` → `{ "type": "enum", "values": [...] }`
- Required fields → `"optional": false`; all others → `"optional": true`

Each endpoint's transport is `{ "type": "mcp", "url": "https://api.githubcopilot.com/mcp/" }`.

Then `svc.test` as normal.
