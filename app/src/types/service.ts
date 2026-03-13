export type EndpointStatus = "unvalidated" | "validated" | "healing" | "failed";

export interface EndpointInfo {
  name: string;
  description: string;
  status: EndpointStatus;
  transport: {
    type: "rest" | "mcp";
    method?: string;
    path?: string;
  };
}

export interface ServiceInfo {
  id: string;
  label: string;
  baseUrl: string;
  icon?: string;
  auth: { strategy: string };
  endpoints: EndpointInfo[];
  lastTestedAt?: number;
}

export function serviceTransport(svc: ServiceInfo): string {
  const types = new Set(svc.endpoints.map((ep) => ep.transport.type));
  if (types.size === 1) return [...types][0].toUpperCase();
  return "REST + MCP";
}
