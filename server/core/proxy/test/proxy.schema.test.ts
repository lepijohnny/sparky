import { describe, test, expect } from "vitest";
import {
  FieldSchema,
  AuthSchema,
  TransportSchema,
  EndpointSchema,
  ServiceSchema,
  buildZodObject,
  formatZodError,
  type FieldDef,
} from "../proxy.schema";
import { z } from "zod";

describe("FieldSchema", () => {
  test("given simple string field, when parsed, then succeeds", () => {
    const result = FieldSchema.safeParse({ type: "string", description: "A name" });
    expect(result.success).toBe(true);
  });

  test("given field with format, when parsed, then succeeds", () => {
    const result = FieldSchema.safeParse({ type: "string", format: "email" });
    expect(result.success).toBe(true);
  });

  test("given enum field with values, when parsed, then succeeds", () => {
    const result = FieldSchema.safeParse({ type: "enum", values: ["a", "b", "c"] });
    expect(result.success).toBe(true);
  });

  test("given array field with items, when parsed, then succeeds", () => {
    const result = FieldSchema.safeParse({ type: "array", items: "string" });
    expect(result.success).toBe(true);
  });

  test("given nested object field, when parsed, then succeeds", () => {
    const result = FieldSchema.safeParse({
      type: "object",
      fields: {
        name: { type: "string" },
        age: { type: "number", optional: true },
      },
    });
    expect(result.success).toBe(true);
  });

  test("given deeply nested fields, when parsed, then succeeds", () => {
    const result = FieldSchema.safeParse({
      type: "object",
      fields: {
        address: {
          type: "object",
          fields: {
            city: { type: "string" },
            zip: { type: "string" },
          },
        },
      },
    });
    expect(result.success).toBe(true);
  });

  test("given array of objects with fields, when parsed, then succeeds", () => {
    const result = FieldSchema.safeParse({
      type: "array",
      items: "object",
      fields: { id: { type: "string" }, name: { type: "string" } },
    });
    expect(result.success).toBe(true);
  });

  test("given invalid type, when parsed, then fails", () => {
    const result = FieldSchema.safeParse({ type: "invalid" });
    expect(result.success).toBe(false);
  });

  test("given invalid format, when parsed, then fails", () => {
    const result = FieldSchema.safeParse({ type: "string", format: "hex" });
    expect(result.success).toBe(false);
  });

  test("given optional with default, when parsed, then defaults applied", () => {
    const result = FieldSchema.safeParse({ type: "number", optional: true, default: 10 });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.optional).toBe(true);
      expect(result.data.default).toBe(10);
    }
  });
});

describe("AuthSchema", () => {
  test("given bearer strategy, when parsed, then succeeds", () => {
    expect(AuthSchema.safeParse({ strategy: "bearer", secretRef: "${svc.test.TOKEN}" }).success).toBe(true);
  });

  test("given basic strategy, when parsed, then succeeds", () => {
    expect(AuthSchema.safeParse({ strategy: "basic", secretRef: "${svc.test.TOKEN}" }).success).toBe(true);
  });

  test("given header strategy with header name, when parsed, then succeeds", () => {
    expect(AuthSchema.safeParse({ strategy: "header", header: "X-Api-Key", secretRef: "${svc.test.TOKEN}" }).success).toBe(true);
  });

  test("given query strategy with param name, when parsed, then succeeds", () => {
    expect(AuthSchema.safeParse({ strategy: "query", param: "api_key", secretRef: "${svc.test.TOKEN}" }).success).toBe(true);
  });

  test("given oauth strategy, when parsed, then succeeds", () => {
    expect(AuthSchema.safeParse({ strategy: "oauth", secretRef: "${svc.test.TOKEN}" }).success).toBe(true);
  });

  test("given header strategy without header name, when parsed, then fails", () => {
    expect(AuthSchema.safeParse({ strategy: "header", secretRef: "${svc.test.TOKEN}" }).success).toBe(false);
  });

  test("given secretRef with disallowed field name, when parsed, then fails", () => {
    expect(AuthSchema.safeParse({ strategy: "bearer", secretRef: "${svc.test.API_KEY}" }).success).toBe(false);
    expect(AuthSchema.safeParse({ strategy: "bearer", secretRef: "${svc.test.SECRET}" }).success).toBe(false);
    expect(AuthSchema.safeParse({ strategy: "bearer", secretRef: "${svc.test.CREDS}" }).success).toBe(false);
  });

  test("given secretRef with allowed field names, when parsed, then succeeds", () => {
    expect(AuthSchema.safeParse({ strategy: "bearer", secretRef: "${svc.test.TOKEN}" }).success).toBe(true);
    expect(AuthSchema.safeParse({ strategy: "bearer", secretRef: "${svc.test.CLIENT_ID}" }).success).toBe(true);
    expect(AuthSchema.safeParse({ strategy: "bearer", secretRef: "${svc.test.CLIENT_SECRET}" }).success).toBe(true);
    expect(AuthSchema.safeParse({ strategy: "bearer", secretRef: "${svc.test.REFRESH_TOKEN}" }).success).toBe(true);
  });
});

describe("TransportSchema", () => {
  test("given REST transport, when parsed, then succeeds", () => {
    const result = TransportSchema.safeParse({ type: "rest", method: "GET", path: "/users" });
    expect(result.success).toBe(true);
  });

  test("given REST transport with body type, when parsed, then succeeds", () => {
    const result = TransportSchema.safeParse({ type: "rest", method: "POST", path: "/users", body: "form" });
    expect(result.success).toBe(true);
  });

  test("given REST transport without leading slash, when parsed, then fails", () => {
    const result = TransportSchema.safeParse({ type: "rest", method: "GET", path: "users" });
    expect(result.success).toBe(false);
  });

  test("given MCP transport, when parsed, then succeeds", () => {
    const result = TransportSchema.safeParse({ type: "mcp", url: "https://api.example.com/mcp" });
    expect(result.success).toBe(true);
  });

  test("given MCP transport with invalid URL, when parsed, then fails", () => {
    const result = TransportSchema.safeParse({ type: "mcp", url: "not-a-url" });
    expect(result.success).toBe(false);
  });
});

describe("EndpointSchema", () => {
  const validEndpoint = {
    name: "list_repos",
    description: "List repositories for the authenticated user",
    input: { per_page: { type: "number", optional: true, default: 30 } },
    output: { id: { type: "string" }, name: { type: "string" } },
    transport: { type: "rest", method: "GET", path: "/user/repos" },
  };

  test("given valid endpoint, when parsed, then succeeds with defaults", () => {
    const result = EndpointSchema.safeParse(validEndpoint);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.status).toBe("unvalidated");
      expect(result.data.secretRefs).toEqual([]);
    }
  });

  test("given endpoint with invalid name, when parsed, then fails", () => {
    const result = EndpointSchema.safeParse({ ...validEndpoint, name: "List-Repos" });
    expect(result.success).toBe(false);
  });

  test("given endpoint with short description, when parsed, then fails", () => {
    const result = EndpointSchema.safeParse({ ...validEndpoint, description: "List" });
    expect(result.success).toBe(false);
  });

  test("given endpoint with empty input, when parsed, then succeeds", () => {
    const result = EndpointSchema.safeParse({ ...validEndpoint, input: {} });
    expect(result.success).toBe(true);
  });
});

describe("ServiceSchema", () => {
  const validService = {
    id: "github",
    label: "GitHub",
    baseUrl: "https://api.github.com",
    auth: { strategy: "bearer", secretRef: "${svc.test.TOKEN}" },
    endpoints: [{
      name: "get_user",
      description: "Get the authenticated user profile",
      input: {},
      output: { login: { type: "string" } },
      transport: { type: "rest", method: "GET", path: "/user" },
    }],
  };

  test("given valid service, when parsed, then succeeds", () => {
    const result = ServiceSchema.safeParse(validService);
    expect(result.success).toBe(true);
  });

  test("given service with icon, when parsed, then succeeds", () => {
    const result = ServiceSchema.safeParse({ ...validService, icon: "https://github.com/favicon.ico" });
    expect(result.success).toBe(true);
  });

  test("given service with oauth, when parsed, then succeeds", () => {
    const result = ServiceSchema.safeParse({
      ...validService,
      oauth: { tokenUrl: "https://oauth2.googleapis.com/token", clientIdKey: "${svc.test.CLIENT_ID}" },
    });
    expect(result.success).toBe(true);
  });

  test("given service with no endpoints (MCP discovery), when parsed, then succeeds", () => {
    const result = ServiceSchema.safeParse({ ...validService, endpoints: [] });
    expect(result.success).toBe(true);
  });

  test("given service with invalid ID, when parsed, then fails", () => {
    const result = ServiceSchema.safeParse({ ...validService, id: "My-Service" });
    expect(result.success).toBe(false);
  });

  test("given service with invalid baseUrl, when parsed, then fails", () => {
    const result = ServiceSchema.safeParse({ ...validService, baseUrl: "not-a-url" });
    expect(result.success).toBe(false);
  });

  test("given full gmail service, when parsed, then succeeds", () => {
    const gmail = {
      id: "gmail",
      label: "Gmail",
      baseUrl: "https://gmail.googleapis.com/gmail/v1",
      auth: { strategy: "bearer", secretRef: "${svc.gmail.TOKEN}" },
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
          },
          output: {
            messages: { type: "array", items: "object", fields: { id: { type: "string" }, threadId: { type: "string" } } },
            nextPageToken: { type: "string", optional: true },
          },
          transport: { type: "rest", method: "GET", path: "/users/me/messages" },
        },
        {
          name: "get_email",
          description: "Fetch full content of a single email",
          input: {
            id: { type: "string" },
            format: { type: "enum", values: ["full", "minimal", "raw", "metadata"], default: "full", optional: true },
          },
          output: { id: { type: "string" }, snippet: { type: "string" } },
          transport: { type: "rest", method: "GET", path: "/users/me/messages/{id}" },
        },
        {
          name: "send_email",
          description: "Send an email as base64url-encoded RFC 2822",
          input: {
            raw: { type: "string", format: "base64url", description: "Base64url-encoded RFC 2822 message" },
          },
          output: { id: { type: "string" }, threadId: { type: "string" } },
          transport: { type: "rest", method: "POST", path: "/users/me/messages/send", body: "json" },
        },
      ],
    };
    const result = ServiceSchema.safeParse(gmail);
    expect(result.success).toBe(true);
  });
});

describe("buildZodObject", () => {
  test("given string field, when validating string, then succeeds", () => {
    const schema = buildZodObject({ name: { type: "string" } });
    expect(schema.safeParse({ name: "hello" }).success).toBe(true);
  });

  test("given string field, when validating number, then fails", () => {
    const schema = buildZodObject({ name: { type: "string" } });
    expect(schema.safeParse({ name: 42 }).success).toBe(false);
  });

  test("given required field, when missing, then fails", () => {
    const schema = buildZodObject({ name: { type: "string" } });
    expect(schema.safeParse({}).success).toBe(false);
  });

  test("given optional field, when missing, then succeeds", () => {
    const schema = buildZodObject({ name: { type: "string", optional: true } });
    expect(schema.safeParse({}).success).toBe(true);
  });

  test("given field with default, when missing, then applies default", () => {
    const schema = buildZodObject({ count: { type: "number", default: 10 } });
    const result = schema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.count).toBe(10);
  });

  test("given enum field, when valid value, then succeeds", () => {
    const schema = buildZodObject({ status: { type: "enum", values: ["open", "closed"] } });
    expect(schema.safeParse({ status: "open" }).success).toBe(true);
  });

  test("given enum field, when invalid value, then fails", () => {
    const schema = buildZodObject({ status: { type: "enum", values: ["open", "closed"] } });
    expect(schema.safeParse({ status: "pending" }).success).toBe(false);
  });

  test("given array of strings, when valid, then succeeds", () => {
    const schema = buildZodObject({ tags: { type: "array", items: "string" } });
    expect(schema.safeParse({ tags: ["a", "b"] }).success).toBe(true);
  });

  test("given array of numbers, when strings provided, then fails", () => {
    const schema = buildZodObject({ ids: { type: "array", items: "number" } });
    expect(schema.safeParse({ ids: ["a"] }).success).toBe(false);
  });

  test("given nested object, when valid, then succeeds", () => {
    const shape: Record<string, FieldDef> = {
      address: { type: "object", fields: { city: { type: "string" }, zip: { type: "string" } } },
    };
    const schema = buildZodObject(shape);
    expect(schema.safeParse({ address: { city: "NYC", zip: "10001" } }).success).toBe(true);
  });

  test("given nested object, when inner field wrong type, then fails", () => {
    const shape: Record<string, FieldDef> = {
      address: { type: "object", fields: { zip: { type: "number" } } },
    };
    const schema = buildZodObject(shape);
    expect(schema.safeParse({ address: { zip: "not-a-number" } }).success).toBe(false);
  });

  test("given array of objects, when valid, then succeeds", () => {
    const shape: Record<string, FieldDef> = {
      messages: { type: "array", items: "object", fields: { id: { type: "string" }, threadId: { type: "string" } } },
    };
    const schema = buildZodObject(shape);
    expect(schema.safeParse({ messages: [{ id: "1", threadId: "t1" }] }).success).toBe(true);
  });

  test("given array of objects, when inner field missing, then fails", () => {
    const shape: Record<string, FieldDef> = {
      messages: { type: "array", items: "object", fields: { id: { type: "string" } } },
    };
    const schema = buildZodObject(shape);
    expect(schema.safeParse({ messages: [{}] }).success).toBe(false);
  });
});

describe("buildZodObject format validation", () => {
  test("given base64url format, when valid base64url, then succeeds", () => {
    const schema = buildZodObject({ raw: { type: "string", format: "base64url" } });
    expect(schema.safeParse({ raw: "SGVsbG8" }).success).toBe(true);
  });

  test("given base64url format, when plain text with spaces, then fails", () => {
    const schema = buildZodObject({ raw: { type: "string", format: "base64url" } });
    expect(schema.safeParse({ raw: "hello world" }).success).toBe(false);
  });

  test("given email format, when valid email, then succeeds", () => {
    const schema = buildZodObject({ to: { type: "string", format: "email" } });
    expect(schema.safeParse({ to: "user@example.com" }).success).toBe(true);
  });

  test("given email format, when invalid email, then fails", () => {
    const schema = buildZodObject({ to: { type: "string", format: "email" } });
    expect(schema.safeParse({ to: "not-an-email" }).success).toBe(false);
  });

  test("given url format, when valid URL, then succeeds", () => {
    const schema = buildZodObject({ link: { type: "string", format: "url" } });
    expect(schema.safeParse({ link: "https://example.com" }).success).toBe(true);
  });

  test("given url format, when invalid URL, then fails", () => {
    const schema = buildZodObject({ link: { type: "string", format: "url" } });
    expect(schema.safeParse({ link: "not-a-url" }).success).toBe(false);
  });

  test("given uuid format, when valid UUID, then succeeds", () => {
    const schema = buildZodObject({ id: { type: "string", format: "uuid" } });
    expect(schema.safeParse({ id: "550e8400-e29b-41d4-a716-446655440000" }).success).toBe(true);
  });

  test("given uuid format, when invalid UUID, then fails", () => {
    const schema = buildZodObject({ id: { type: "string", format: "uuid" } });
    expect(schema.safeParse({ id: "not-a-uuid" }).success).toBe(false);
  });

  test("given json format, when valid JSON string, then succeeds", () => {
    const schema = buildZodObject({ data: { type: "string", format: "json" } });
    expect(schema.safeParse({ data: '{"key":"value"}' }).success).toBe(true);
  });

  test("given json format, when invalid JSON string, then fails", () => {
    const schema = buildZodObject({ data: { type: "string", format: "json" } });
    expect(schema.safeParse({ data: "{broken" }).success).toBe(false);
  });

  test("given base64 format, when valid base64, then succeeds", () => {
    const schema = buildZodObject({ data: { type: "string", format: "base64" } });
    expect(schema.safeParse({ data: "SGVsbG8gV29ybGQ=" }).success).toBe(true);
  });

  test("given base64 format, when contains spaces, then fails", () => {
    const schema = buildZodObject({ data: { type: "string", format: "base64" } });
    expect(schema.safeParse({ data: "not base64!" }).success).toBe(false);
  });
});

describe("formatZodError", () => {
  test("given single field error, when formatted, then shows path and message", () => {
    const schema = z.object({ name: z.string() });
    const result = schema.safeParse({ name: 42 });
    expect(result.success).toBe(false);
    if (!result.success) {
      const msg = formatZodError(result.error);
      expect(msg).toContain("name");
    }
  });

  test("given multiple errors, when formatted, then joins with semicolons", () => {
    const schema = z.object({ name: z.string(), age: z.number() });
    const result = schema.safeParse({});
    expect(result.success).toBe(false);
    if (!result.success) {
      const msg = formatZodError(result.error);
      expect(msg).toContain(";");
      expect(msg).toContain("name");
      expect(msg).toContain("age");
    }
  });

  test("given nested error, when formatted, then shows dotted path", () => {
    const schema = z.object({ address: z.object({ zip: z.number() }) });
    const result = schema.safeParse({ address: { zip: "abc" } });
    expect(result.success).toBe(false);
    if (!result.success) {
      const msg = formatZodError(result.error);
      expect(msg).toContain("address.zip");
    }
  });
});
