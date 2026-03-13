import { describe, test, expect } from "vitest";
import { ServiceSchema, buildZodObject, formatZodError, type FieldDef } from "../proxy.schema";

const GITHUB_SERVICE = {
  id: "github",
  label: "GitHub",
  baseUrl: "https://api.github.com",
  icon: "https://github.githubassets.com/favicons/favicon.svg",
  auth: { strategy: "bearer", secretRef: "${svc.github.TOKEN}" },
  endpoints: [
    {
      name: "get_user",
      description: "Get the authenticated user profile",
      input: {},
      output: { login: { type: "string" }, id: { type: "number" }, name: { type: "string", optional: true } },
      transport: { type: "rest", method: "GET", path: "/user" },
    },
    {
      name: "list_repos",
      description: "List repositories for the authenticated user",
      input: {
        sort: { type: "enum", values: ["created", "updated", "pushed", "full_name"], optional: true, default: "full_name" },
        per_page: { type: "number", optional: true, default: 30, description: "Results per page (max 100)" },
        page: { type: "number", optional: true, default: 1 },
      },
      output: {},
      transport: { type: "rest", method: "GET", path: "/user/repos" },
    },
    {
      name: "get_repo",
      description: "Get a repository by owner and name",
      input: {
        owner: { type: "string", description: "Repository owner" },
        repo: { type: "string", description: "Repository name" },
      },
      output: {
        id: { type: "number" },
        full_name: { type: "string" },
        private: { type: "boolean" },
        description: { type: "string", optional: true },
      },
      transport: { type: "rest", method: "GET", path: "/repos/{owner}/{repo}" },
    },
    {
      name: "create_issue",
      description: "Create an issue in a repository",
      input: {
        owner: { type: "string" },
        repo: { type: "string" },
        title: { type: "string", description: "Issue title" },
        body: { type: "string", optional: true, description: "Issue body in markdown" },
        labels: { type: "array", items: "string", optional: true },
        assignees: { type: "array", items: "string", optional: true },
      },
      output: {
        id: { type: "number" },
        number: { type: "number" },
        html_url: { type: "string", format: "url" },
      },
      transport: { type: "rest", method: "POST", path: "/repos/{owner}/{repo}/issues", body: "json" },
    },
    {
      name: "search_code",
      description: "Search code across all repositories",
      input: {
        q: { type: "string", description: "Search query using GitHub search syntax" },
        per_page: { type: "number", optional: true, default: 30 },
      },
      output: {
        total_count: { type: "number" },
        items: { type: "array", items: "object", fields: {
          name: { type: "string" },
          path: { type: "string" },
          repository: { type: "object", fields: { full_name: { type: "string" } } },
        }},
      },
      transport: { type: "rest", method: "GET", path: "/search/code" },
    },
  ],
};

const GMAIL_SERVICE = {
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
      name: "list_emails",
      description: "List recent emails from the user inbox",
      input: {
        maxResults: { type: "number", default: 10, optional: true },
        q: { type: "string", optional: true, description: "Gmail search query" },
        pageToken: { type: "string", optional: true },
      },
      output: {
        messages: { type: "array", items: "object", fields: { id: { type: "string" }, threadId: { type: "string" } } },
        nextPageToken: { type: "string", optional: true },
        resultSizeEstimate: { type: "number" },
      },
      transport: { type: "rest", method: "GET", path: "/users/me/messages" },
    },
    {
      name: "get_email",
      description: "Fetch full content of a single email by ID",
      input: {
        id: { type: "string", description: "Message ID" },
        format: { type: "enum", values: ["full", "minimal", "raw", "metadata"], default: "full", optional: true },
      },
      output: {
        id: { type: "string" },
        threadId: { type: "string" },
        snippet: { type: "string" },
      },
      transport: { type: "rest", method: "GET", path: "/users/me/messages/{id}" },
    },
    {
      name: "send_email",
      description: "Send an email as base64url-encoded RFC 2822 message",
      input: {
        raw: { type: "string", format: "base64url", description: "Base64url-encoded RFC 2822 message" },
      },
      output: {
        id: { type: "string" },
        threadId: { type: "string" },
        labelIds: { type: "array", items: "string" },
      },
      transport: { type: "rest", method: "POST", path: "/users/me/messages/send", body: "json" },
    },
    {
      name: "archive_email",
      description: "Archive an email by removing the INBOX label",
      input: {
        id: { type: "string", description: "Message ID" },
        removeLabelIds: { type: "array", items: "string", default: ["INBOX"] },
      },
      output: { id: { type: "string" }, labelIds: { type: "array", items: "string" } },
      transport: { type: "rest", method: "POST", path: "/users/me/messages/{id}/modify", body: "json" },
    },
  ],
};

const TODOIST_SERVICE = {
  id: "todoist",
  label: "Todoist",
  baseUrl: "https://api.todoist.com/rest/v2",
  auth: { strategy: "bearer", secretRef: "${svc.todoist.TOKEN}" },
  endpoints: [
    {
      name: "list_projects",
      description: "Get all projects for the user",
      input: {},
      output: {},
      transport: { type: "rest", method: "GET", path: "/projects" },
    },
    {
      name: "create_task",
      description: "Create a new task in Todoist",
      input: {
        content: { type: "string", description: "Task content/title" },
        description: { type: "string", optional: true },
        project_id: { type: "string", optional: true },
        due_string: { type: "string", optional: true, description: "Natural language due date e.g. 'tomorrow'" },
        priority: { type: "number", optional: true, default: 1, description: "Priority 1-4, where 4 is urgent" },
        labels: { type: "array", items: "string", optional: true },
      },
      output: {
        id: { type: "string" },
        content: { type: "string" },
        is_completed: { type: "boolean" },
        due: { type: "object", optional: true, fields: { date: { type: "string" }, string: { type: "string" } } },
      },
      transport: { type: "rest", method: "POST", path: "/tasks", body: "json" },
    },
    {
      name: "complete_task",
      description: "Mark a task as completed",
      input: {
        id: { type: "string", description: "Task ID to complete" },
      },
      output: {},
      transport: { type: "rest", method: "POST", path: "/tasks/{id}/close" },
    },
  ],
};

const SLACK_SERVICE = {
  id: "slack",
  label: "Slack",
  baseUrl: "https://slack.com/api",
  auth: { strategy: "bearer", secretRef: "${svc.slack.TOKEN}" },
  endpoints: [
    {
      name: "post_message",
      description: "Post a message to a Slack channel",
      input: {
        channel: { type: "string", description: "Channel ID e.g. C01234567" },
        text: { type: "string", description: "Message text" },
        thread_ts: { type: "string", optional: true, description: "Thread timestamp for replies" },
      },
      output: {
        ok: { type: "boolean" },
        ts: { type: "string" },
        channel: { type: "string" },
      },
      transport: { type: "rest", method: "POST", path: "/chat.postMessage", body: "json" },
    },
    {
      name: "list_channels",
      description: "List all channels the bot has access to",
      input: {
        limit: { type: "number", optional: true, default: 100 },
        cursor: { type: "string", optional: true },
      },
      output: {
        ok: { type: "boolean" },
        channels: { type: "array", items: "object", fields: {
          id: { type: "string" },
          name: { type: "string" },
          is_private: { type: "boolean" },
        }},
      },
      transport: { type: "rest", method: "GET", path: "/conversations.list" },
    },
  ],
};

describe("GitHub service", () => {
  test("given full GitHub service def, when parsed, then succeeds", () => {
    const result = ServiceSchema.safeParse(GITHUB_SERVICE);
    expect(result.success).toBe(true);
  });

  test("given list_repos input, when valid args, then passes validation", () => {
    const input = GITHUB_SERVICE.endpoints[1].input as Record<string, FieldDef>;
    const schema = buildZodObject(input);
    expect(schema.safeParse({ sort: "updated", per_page: 50 }).success).toBe(true);
  });

  test("given list_repos input, when empty args, then applies defaults", () => {
    const input = GITHUB_SERVICE.endpoints[1].input as Record<string, FieldDef>;
    const schema = buildZodObject(input);
    const result = schema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.sort).toBe("full_name");
      expect(result.data.per_page).toBe(30);
      expect(result.data.page).toBe(1);
    }
  });

  test("given list_repos input, when invalid sort enum, then fails with clear error", () => {
    const input = GITHUB_SERVICE.endpoints[1].input as Record<string, FieldDef>;
    const schema = buildZodObject(input);
    const result = schema.safeParse({ sort: "stars" });
    expect(result.success).toBe(false);
    if (!result.success) {
      const msg = formatZodError(result.error);
      expect(msg).toContain("sort");
    }
  });

  test("given list_repos input, when per_page is string, then fails", () => {
    const input = GITHUB_SERVICE.endpoints[1].input as Record<string, FieldDef>;
    const schema = buildZodObject(input);
    expect(schema.safeParse({ per_page: "fifty" }).success).toBe(false);
  });

  test("given get_repo input, when owner missing, then fails with required error", () => {
    const input = GITHUB_SERVICE.endpoints[2].input as Record<string, FieldDef>;
    const schema = buildZodObject(input);
    const result = schema.safeParse({ repo: "atelier" });
    expect(result.success).toBe(false);
    if (!result.success) {
      const msg = formatZodError(result.error);
      expect(msg).toContain("owner");
    }
  });

  test("given create_issue input, when valid with labels, then succeeds", () => {
    const input = GITHUB_SERVICE.endpoints[3].input as Record<string, FieldDef>;
    const schema = buildZodObject(input);
    expect(schema.safeParse({
      owner: "lepijohnny", repo: "atelier", title: "Fix bug", labels: ["bug", "urgent"],
    }).success).toBe(true);
  });

  test("given create_issue input, when title missing, then fails", () => {
    const input = GITHUB_SERVICE.endpoints[3].input as Record<string, FieldDef>;
    const schema = buildZodObject(input);
    const result = schema.safeParse({ owner: "lepijohnny", repo: "atelier" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(formatZodError(result.error)).toContain("title");
    }
  });

  test("given create_issue input, when labels is strings not array, then fails", () => {
    const input = GITHUB_SERVICE.endpoints[3].input as Record<string, FieldDef>;
    const schema = buildZodObject(input);
    expect(schema.safeParse({
      owner: "a", repo: "b", title: "c", labels: "bug",
    }).success).toBe(false);
  });

  test("given search_code output, when validating nested response, then succeeds", () => {
    const output = GITHUB_SERVICE.endpoints[4].output as Record<string, FieldDef>;
    const schema = buildZodObject(output);
    expect(schema.safeParse({
      total_count: 42,
      items: [{ name: "index.ts", path: "src/index.ts", repository: { full_name: "user/repo" } }],
    }).success).toBe(true);
  });

  test("given search_code output, when nested field wrong type, then fails", () => {
    const output = GITHUB_SERVICE.endpoints[4].output as Record<string, FieldDef>;
    const schema = buildZodObject(output);
    expect(schema.safeParse({
      total_count: "many",
      items: [],
    }).success).toBe(false);
  });
});

describe("Gmail service", () => {
  test("given full Gmail service def, when parsed, then succeeds", () => {
    const result = ServiceSchema.safeParse(GMAIL_SERVICE);
    expect(result.success).toBe(true);
  });

  test("given list_emails input, when search query provided, then succeeds", () => {
    const input = GMAIL_SERVICE.endpoints[0].input as Record<string, FieldDef>;
    const schema = buildZodObject(input);
    expect(schema.safeParse({ q: "from:boss@company.com is:unread", maxResults: 5 }).success).toBe(true);
  });

  test("given list_emails input, when empty, then applies defaults", () => {
    const input = GMAIL_SERVICE.endpoints[0].input as Record<string, FieldDef>;
    const schema = buildZodObject(input);
    const result = schema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.maxResults).toBe(10);
  });

  test("given get_email input, when valid enum format, then succeeds", () => {
    const input = GMAIL_SERVICE.endpoints[1].input as Record<string, FieldDef>;
    const schema = buildZodObject(input);
    expect(schema.safeParse({ id: "18abc123", format: "minimal" }).success).toBe(true);
  });

  test("given get_email input, when invalid format enum, then fails", () => {
    const input = GMAIL_SERVICE.endpoints[1].input as Record<string, FieldDef>;
    const schema = buildZodObject(input);
    const result = schema.safeParse({ id: "18abc123", format: "brief" });
    expect(result.success).toBe(false);
    if (!result.success) expect(formatZodError(result.error)).toContain("format");
  });

  test("given get_email input, when id missing, then fails", () => {
    const input = GMAIL_SERVICE.endpoints[1].input as Record<string, FieldDef>;
    const schema = buildZodObject(input);
    expect(schema.safeParse({}).success).toBe(false);
  });

  test("given send_email input, when valid base64url, then succeeds", () => {
    const input = GMAIL_SERVICE.endpoints[2].input as Record<string, FieldDef>;
    const schema = buildZodObject(input);
    const raw = "VG86IHVzZXJAZXhhbXBsZS5jb20KU3ViamVjdDogSGVsbG8KCkJvZHk";
    expect(schema.safeParse({ raw }).success).toBe(true);
  });

  test("given send_email input, when plain text instead of base64url, then fails", () => {
    const input = GMAIL_SERVICE.endpoints[2].input as Record<string, FieldDef>;
    const schema = buildZodObject(input);
    const result = schema.safeParse({ raw: "To: user@example.com\nSubject: Hello\n\nBody text" });
    expect(result.success).toBe(false);
    if (!result.success) expect(formatZodError(result.error)).toContain("raw");
  });

  test("given send_email input, when raw missing, then fails", () => {
    const input = GMAIL_SERVICE.endpoints[2].input as Record<string, FieldDef>;
    const schema = buildZodObject(input);
    expect(schema.safeParse({}).success).toBe(false);
  });

  test("given send_email input, when LLM sends structured object instead of raw, then fails", () => {
    const input = GMAIL_SERVICE.endpoints[2].input as Record<string, FieldDef>;
    const schema = buildZodObject(input);
    expect(schema.safeParse({ to: "user@example.com", subject: "Hello", body: "Hi" }).success).toBe(false);
  });

  test("given archive_email input, when only id provided, then applies default removeLabelIds", () => {
    const input = GMAIL_SERVICE.endpoints[3].input as Record<string, FieldDef>;
    const schema = buildZodObject(input);
    const result = schema.safeParse({ id: "18abc123" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.removeLabelIds).toEqual(["INBOX"]);
  });

  test("given list_emails output, when valid nested response, then succeeds", () => {
    const output = GMAIL_SERVICE.endpoints[0].output as Record<string, FieldDef>;
    const schema = buildZodObject(output);
    expect(schema.safeParse({
      messages: [{ id: "18abc", threadId: "18abc" }, { id: "18abd", threadId: "18abc" }],
      resultSizeEstimate: 2,
    }).success).toBe(true);
  });

  test("given list_emails output, when messages has wrong shape, then fails", () => {
    const output = GMAIL_SERVICE.endpoints[0].output as Record<string, FieldDef>;
    const schema = buildZodObject(output);
    expect(schema.safeParse({
      messages: ["id1", "id2"],
      resultSizeEstimate: 2,
    }).success).toBe(false);
  });
});

describe("Todoist service", () => {
  test("given full Todoist service def, when parsed, then succeeds", () => {
    expect(ServiceSchema.safeParse(TODOIST_SERVICE).success).toBe(true);
  });

  test("given create_task input, when minimal args, then succeeds", () => {
    const input = TODOIST_SERVICE.endpoints[1].input as Record<string, FieldDef>;
    const schema = buildZodObject(input);
    expect(schema.safeParse({ content: "Buy groceries" }).success).toBe(true);
  });

  test("given create_task input, when full args, then succeeds", () => {
    const input = TODOIST_SERVICE.endpoints[1].input as Record<string, FieldDef>;
    const schema = buildZodObject(input);
    expect(schema.safeParse({
      content: "Fix login bug",
      description: "Users can't log in with SSO",
      project_id: "2203456",
      due_string: "tomorrow at 3pm",
      priority: 4,
      labels: ["bug", "urgent"],
    }).success).toBe(true);
  });

  test("given create_task input, when content missing, then fails", () => {
    const input = TODOIST_SERVICE.endpoints[1].input as Record<string, FieldDef>;
    const schema = buildZodObject(input);
    const result = schema.safeParse({ due_string: "tomorrow" });
    expect(result.success).toBe(false);
    if (!result.success) expect(formatZodError(result.error)).toContain("content");
  });

  test("given create_task input, when priority is string, then fails", () => {
    const input = TODOIST_SERVICE.endpoints[1].input as Record<string, FieldDef>;
    const schema = buildZodObject(input);
    expect(schema.safeParse({ content: "Test", priority: "high" }).success).toBe(false);
  });

  test("given create_task output, when valid with nested due, then succeeds", () => {
    const output = TODOIST_SERVICE.endpoints[1].output as Record<string, FieldDef>;
    const schema = buildZodObject(output);
    expect(schema.safeParse({
      id: "12345",
      content: "Buy groceries",
      is_completed: false,
      due: { date: "2026-03-09", string: "tomorrow" },
    }).success).toBe(true);
  });

  test("given create_task output, when due is null (no due date), then succeeds", () => {
    const output = TODOIST_SERVICE.endpoints[1].output as Record<string, FieldDef>;
    const schema = buildZodObject(output);
    expect(schema.safeParse({ id: "12345", content: "Buy groceries", is_completed: false }).success).toBe(true);
  });

  test("given complete_task input, when id missing, then fails", () => {
    const input = TODOIST_SERVICE.endpoints[2].input as Record<string, FieldDef>;
    const schema = buildZodObject(input);
    expect(schema.safeParse({}).success).toBe(false);
  });
});

describe("Slack service", () => {
  test("given full Slack service def, when parsed, then succeeds", () => {
    expect(ServiceSchema.safeParse(SLACK_SERVICE).success).toBe(true);
  });

  test("given post_message input, when valid, then succeeds", () => {
    const input = SLACK_SERVICE.endpoints[0].input as Record<string, FieldDef>;
    const schema = buildZodObject(input);
    expect(schema.safeParse({ channel: "C01234567", text: "Hello team!" }).success).toBe(true);
  });

  test("given post_message input, when channel missing, then fails", () => {
    const input = SLACK_SERVICE.endpoints[0].input as Record<string, FieldDef>;
    const schema = buildZodObject(input);
    const result = schema.safeParse({ text: "Hello" });
    expect(result.success).toBe(false);
    if (!result.success) expect(formatZodError(result.error)).toContain("channel");
  });

  test("given post_message input, when text missing, then fails", () => {
    const input = SLACK_SERVICE.endpoints[0].input as Record<string, FieldDef>;
    const schema = buildZodObject(input);
    expect(schema.safeParse({ channel: "C01234567" }).success).toBe(false);
  });

  test("given post_message input, when thread reply, then succeeds", () => {
    const input = SLACK_SERVICE.endpoints[0].input as Record<string, FieldDef>;
    const schema = buildZodObject(input);
    expect(schema.safeParse({
      channel: "C01234567", text: "Good point!", thread_ts: "1710000000.000001",
    }).success).toBe(true);
  });

  test("given list_channels output, when valid nested response, then succeeds", () => {
    const output = SLACK_SERVICE.endpoints[1].output as Record<string, FieldDef>;
    const schema = buildZodObject(output);
    expect(schema.safeParse({
      ok: true,
      channels: [
        { id: "C01234567", name: "general", is_private: false },
        { id: "C01234568", name: "random", is_private: false },
      ],
    }).success).toBe(true);
  });

  test("given list_channels output, when channel missing name, then fails", () => {
    const output = SLACK_SERVICE.endpoints[1].output as Record<string, FieldDef>;
    const schema = buildZodObject(output);
    expect(schema.safeParse({
      ok: true,
      channels: [{ id: "C01234567", is_private: false }],
    }).success).toBe(false);
  });
});

describe("LLM common mistakes", () => {
  test("given service ID with uppercase, when parsed, then fails with clear message", () => {
    const result = ServiceSchema.safeParse({ ...GITHUB_SERVICE, id: "GitHub" });
    expect(result.success).toBe(false);
    if (!result.success) expect(formatZodError(result.error)).toContain("id");
  });

  test("given service ID with dashes, when parsed, then fails", () => {
    const result = ServiceSchema.safeParse({ ...GITHUB_SERVICE, id: "my-service" });
    expect(result.success).toBe(false);
  });

  test("given baseUrl with trailing slash, when parsed, then succeeds", () => {
    const result = ServiceSchema.safeParse({ ...GITHUB_SERVICE, baseUrl: "https://api.github.com/" });
    expect(result.success).toBe(true);
  });

  test("given baseUrl as not a URL, when parsed, then fails", () => {
    const result = ServiceSchema.safeParse({ ...GITHUB_SERVICE, baseUrl: "api.github.com" });
    expect(result.success).toBe(false);
  });

  test("given endpoint with path missing leading slash, when parsed, then fails", () => {
    const bad = {
      ...GITHUB_SERVICE,
      endpoints: [{
        name: "get_user",
        description: "Get user profile from the API",
        input: {},
        output: {},
        transport: { type: "rest", method: "GET", path: "user" },
      }],
    };
    const result = ServiceSchema.safeParse(bad);
    expect(result.success).toBe(false);
  });

  test("given endpoint with short description, when parsed, then fails", () => {
    const bad = {
      ...GITHUB_SERVICE,
      endpoints: [{
        name: "get_user",
        description: "Get user",
        input: {},
        output: {},
        transport: { type: "rest", method: "GET", path: "/user" },
      }],
    };
    const result = ServiceSchema.safeParse(bad);
    expect(result.success).toBe(false);
  });

  test("given empty endpoints array (MCP discovery), when parsed, then succeeds", () => {
    const result = ServiceSchema.safeParse({ ...GITHUB_SERVICE, endpoints: [] });
    expect(result.success).toBe(true);
  });

  test("given unknown auth strategy, when parsed, then fails", () => {
    const result = ServiceSchema.safeParse({ ...GITHUB_SERVICE, auth: { strategy: "apikey", secretRef: "${svc.test.TOKEN}" } });
    expect(result.success).toBe(false);
  });

  test("given header auth without header name, when parsed, then fails", () => {
    const result = ServiceSchema.safeParse({ ...GITHUB_SERVICE, auth: { strategy: "header", secretRef: "${svc.test.TOKEN}" } });
    expect(result.success).toBe(false);
  });

  test("given query auth strategy, when parsed, then succeeds", () => {
    const result = ServiceSchema.safeParse({
      ...GITHUB_SERVICE,
      auth: { strategy: "query", param: "api_key", secretRef: "${svc.test.TOKEN}" },
    });
    expect(result.success).toBe(true);
  });
});
