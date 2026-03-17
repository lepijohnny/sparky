import { z } from "zod";

export const FieldSchema: z.ZodType = z.object({
  type: z.enum(["string", "number", "boolean", "array", "enum", "object"]),
  description: z.string().optional(),
  default: z.unknown().optional(),
  optional: z.boolean().default(false),
  format: z.enum([
    "base64", "base64url",
    "email", "url", "uri",
    "uuid",
    "date", "datetime", "iso8601",
    "json",
  ]).optional(),
  values: z.array(z.string()).optional(),
  items: z.enum(["string", "number", "boolean", "object"]).optional(),
  fields: z.record(z.string(), z.lazy(() => FieldSchema)).optional(),
});

export type FieldDef = {
  type: "string" | "number" | "boolean" | "array" | "enum" | "object";
  description?: string;
  default?: unknown;
  optional?: boolean;
  format?: "base64" | "base64url" | "email" | "url" | "uri" | "uuid" | "date" | "datetime" | "iso8601" | "json";
  values?: string[];
  items?: "string" | "number" | "boolean" | "object";
  fields?: Record<string, FieldDef>;
};

const ALLOWED_SECRET_FIELDS = ["TOKEN", "CLIENT_ID", "CLIENT_SECRET", "REFRESH_TOKEN"];

const SecretRef = z.string().regex(
  /^\$\{svc\.[a-z][a-z0-9_]*\.(TOKEN|CLIENT_ID|CLIENT_SECRET|REFRESH_TOKEN)\}$/,
  `Secret ref must be \${svc.<service>.<FIELD>} where FIELD is one of: ${ALLOWED_SECRET_FIELDS.join(", ")}`,
);

export const AuthSchema = z.discriminatedUnion("strategy", [
  z.object({ strategy: z.literal("bearer"), secretRef: SecretRef }),
  z.object({ strategy: z.literal("bot"), secretRef: SecretRef }),
  z.object({ strategy: z.literal("url"), secretRef: SecretRef }),
  z.object({ strategy: z.literal("basic"), secretRef: SecretRef }),
  z.object({ strategy: z.literal("header"), header: z.string(), secretRef: SecretRef }),
  z.object({ strategy: z.literal("query"), param: z.string(), secretRef: SecretRef }),
  z.object({ strategy: z.literal("oauth"), secretRef: SecretRef }),
]);

export type AuthDef = z.infer<typeof AuthSchema>;

export const RestTransportSchema = z.object({
  type: z.literal("rest"),
  method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE"]),
  path: z.string().refine((p) => p.startsWith("/"), { message: "Path must start with /" }),
  body: z.enum(["json", "form", "multipart"]).default("json"),
});

export const McpTransportSchema = z.object({
  type: z.literal("mcp"),
  url: z.url(),
});

export const TransportSchema = z.discriminatedUnion("type", [
  RestTransportSchema,
  McpTransportSchema,
]);

export type TransportDef = z.infer<typeof TransportSchema>;

export const EndpointSchema = z.object({
  name: z.string().regex(/^[a-z][a-z0-9_]+$/, "Endpoint name must be lowercase with underscores"),
  description: z.string().min(10, "Description must be at least 10 characters"),
  input: z.record(z.string(), FieldSchema),
  output: z.record(z.string(), FieldSchema),
  transport: TransportSchema,
  secretRefs: z.array(SecretRef).default([]),
  status: z.enum(["unvalidated", "validated", "healing", "failed"]).default("unvalidated"),
});

export type EndpointDef = z.infer<typeof EndpointSchema>;

export const OAuthSchema = z.object({
  tokenUrl: z.url(),
  clientIdKey: SecretRef,
  clientSecretKey: SecretRef.optional(),
  refreshKey: SecretRef.optional(),
});

export type OAuthDef = z.infer<typeof OAuthSchema>;

export const ServiceSchema = z.object({
  id: z.string().regex(/^[a-z][a-z0-9_]*$/, "Service ID must be lowercase with underscores"),
  label: z.string(),
  baseUrl: z.url(),
  icon: z.url().optional(),
  auth: AuthSchema,
  endpoints: z.array(EndpointSchema).default([]),
  oauth: OAuthSchema.optional(),
  lastTestedAt: z.number().optional(),
});

export type ServiceDef = z.infer<typeof ServiceSchema>;

function buildZodField(def: FieldDef): z.ZodTypeAny {
  let field: z.ZodTypeAny;

  switch (def.type) {
    case "string": {
      switch (def.format) {
        case "base64":    field = z.base64(); break;
        case "base64url": field = z.base64url(); break;
        case "email":     field = z.email(); break;
        case "url":
        case "uri":       field = z.url(); break;
        case "uuid":      field = z.uuid(); break;
        case "datetime":
        case "iso8601":   field = z.iso.datetime(); break;
        case "date":      field = z.iso.date(); break;
        case "json":      field = z.string().refine(
          (s) => { try { JSON.parse(s); return true; } catch { return false; } },
          { message: "Must be valid JSON" },
        ); break;
        default:          field = z.string(); break;
      }
      break;
    }
    case "number":
      field = z.number();
      break;
    case "boolean":
      field = z.boolean();
      break;
    case "enum":
      field = z.enum((def.values ?? []) as [string, ...string[]]);
      break;
    case "object":
      field = def.fields ? buildZodObject(def.fields) : z.record(z.string(), z.unknown());
      break;
    case "array":
      if (def.items === "object" && def.fields) field = z.array(buildZodObject(def.fields));
      else if (def.items === "number") field = z.array(z.number());
      else if (def.items === "boolean") field = z.array(z.boolean());
      else field = z.array(z.string());
      break;
  }

  if (def.description) field = field.describe(def.description);
  if (def.default !== undefined) field = field.default(def.default);
  if (def.optional) field = field.optional();

  return field;
}

export function buildZodObject(shape: Record<string, FieldDef>): z.ZodObject<any> {
  const obj: Record<string, z.ZodTypeAny> = {};
  for (const [key, def] of Object.entries(shape)) {
    obj[key] = buildZodField(def);
  }
  return z.object(obj);
}

export function getDefaults(shape: Record<string, FieldDef>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, def] of Object.entries(shape)) {
    if (def.optional) continue;
    const val = getFieldDefault(def);
    if (val !== undefined) result[key] = val;
  }
  return result;
}

function getFieldDefault(def: FieldDef): unknown {
  if (def.default !== undefined) return def.default;

  switch (def.type) {
    case "string":
      if (def.values?.[0]) return def.values[0];
      if (def.format === "email") return "test@test.com";
      if (def.format === "url" || def.format === "uri") return "https://example.com";
      if (def.format === "uuid") return "00000000-0000-0000-0000-000000000000";
      if (def.format === "date") return "2025-01-01";
      if (def.format === "datetime" || def.format === "iso8601") return "2025-01-01T00:00:00Z";
      if (def.format === "json") return "{}";
      return "test";
    case "number":
      return 1;
    case "boolean":
      return true;
    case "enum":
      return def.values?.[0];
    case "array":
      return [];
    case "object":
      if (def.fields) return getDefaults(def.fields);
      return {};
  }
}

export function formatZodError(error: z.ZodError): string {
  return error.issues.map((i) => {
    const path = i.path.length > 0 ? i.path.join(".") : "(root)";
    return `${path}: ${i.message}`;
  }).join("; ");
}
