import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import type { Logger } from "../../logger.types";
import type { EndpointDef, FieldDef } from "./proxy.schema";

const FETCH_TIMEOUT = 30_000;

export interface McpTool {
  name: string;
  description?: string;
  inputSchema: Record<string, unknown>;
}

function jsonSchemaFieldToFieldDef(prop: Record<string, unknown>, required: boolean): FieldDef {
  const desc = typeof prop.description === "string" ? prop.description : undefined;

  if (Array.isArray(prop.enum)) {
    return { type: "enum", values: prop.enum.map(String), optional: !required, ...(desc && { description: desc }) };
  }

  switch (prop.type) {
    case "integer":
    case "number":
      return { type: "number", optional: !required, ...(desc && { description: desc }) };
    case "boolean":
      return { type: "boolean", optional: !required, ...(desc && { description: desc }) };
    case "array": {
      const items = (prop.items as Record<string, unknown>)?.type;
      const itemType = items === "number" || items === "integer" ? "number"
        : items === "boolean" ? "boolean"
        : items === "object" ? "object"
        : "string";
      return { type: "array", items: itemType as FieldDef["items"], optional: !required, ...(desc && { description: desc }) };
    }
    case "object": {
      const nested = prop.properties as Record<string, Record<string, unknown>> | undefined;
      if (nested) {
        const reqSet = new Set(Array.isArray(prop.required) ? prop.required as string[] : []);
        const fields: Record<string, FieldDef> = {};
        for (const [k, v] of Object.entries(nested)) fields[k] = jsonSchemaFieldToFieldDef(v, reqSet.has(k));
        return { type: "object", fields, optional: !required, ...(desc && { description: desc }) };
      }
      return { type: "object", optional: !required, ...(desc && { description: desc }) };
    }
    default:
      return { type: "string", optional: !required, ...(desc && { description: desc }) };
  }
}

export function summarizeMcpTools(tools: McpTool[]): string {
  const lines = tools.map((t) => {
    const schema = t.inputSchema ?? {};
    const props = Object.keys((schema.properties ?? {}) as Record<string, unknown>);
    const required = new Set(Array.isArray(schema.required) ? schema.required as string[] : []);
    const req = props.filter((p) => required.has(p));
    const opt = props.filter((p) => !required.has(p));

    let line = `- ${t.name}`;
    if (t.description) line += `: ${t.description.split("\n")[0].slice(0, 80)}`;
    if (req.length) line += ` | required: ${req.join(", ")}`;
    if (opt.length) line += ` | optional: ${opt.join(", ")}`;
    return line;
  });
  return lines.join("\n");
}

export function mcpToolsToEndpoints(tools: McpTool[], mcpUrl: string): EndpointDef[] {
  return tools.map((tool) => {
    const schema = tool.inputSchema ?? {};
    const properties = (schema.properties ?? {}) as Record<string, Record<string, unknown>>;
    const required = new Set(Array.isArray(schema.required) ? schema.required as string[] : []);

    const input: Record<string, FieldDef> = {};
    for (const [key, prop] of Object.entries(properties)) {
      input[key] = jsonSchemaFieldToFieldDef(prop, required.has(key));
    }

    return {
      name: tool.name,
      description: tool.description ?? tool.name,
      input,
      output: {},
      transport: { type: "mcp" as const, url: mcpUrl },
      secretRefs: [],
      status: "unvalidated" as const,
    };
  });
}

export async function connectMcp(
  url: string,
  headers: Record<string, string>,
  log: Logger,
): Promise<Client> {
  const client = new Client({ name: "sparky", version: "1.0.0" });
  const reqInit = { headers, signal: AbortSignal.timeout(FETCH_TIMEOUT) } as RequestInit;

  try {
    await client.connect(new StreamableHTTPClientTransport(new URL(url), { requestInit: reqInit }));
    log.info("MCP connected via StreamableHTTP", { url });
  } catch {
    const sseUrl = url.endsWith("/sse") ? url : `${url}/sse`;
    await client.connect(new SSEClientTransport(new URL(sseUrl), { requestInit: reqInit }));
    log.info("MCP connected via SSE", { url });
  }

  return client;
}

export async function listMcpTools(
  baseUrl: string,
  headers: Record<string, string>,
  log: Logger,
): Promise<McpTool[]> {
  const client = await connectMcp(baseUrl, headers, log);

  try {
    const { tools } = await client.listTools();
    log.info("MCP tools listed", { url: baseUrl, count: tools.length });

    return tools.map((tool) => ({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema as Record<string, unknown>,
    }));
  } finally {
    await client.close().catch(() => {});
  }
}
