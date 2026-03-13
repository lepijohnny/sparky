import type { ServiceDef } from "../proxy/proxy.schema";

export interface SvcEvents {
  "svc.oauth.start":    { req: { service: string; authUrl: string; tokenUrl: string; clientId: string; clientSecret?: string; scopes: string[]; tokenKey: string }; res: { authorizeUrl: string } };
  "svc.oauth.finish":   { req: { service: string }; res: { ok: boolean; error?: string } };
  "svc.register":       { req: ServiceDef; res: { status: string; errors?: string; endpointCount?: number; summary?: string } };
  "svc.list":           { req: void; res: { services: unknown[] } };
  "svc.list.compact":   { req: void; res: { services: { id: string; label: string; baseUrl: string; auth: string; endpointCount: number; endpoints: string[] }[] } };
  "svc.describe":       { req: { service: string }; res: unknown };
  "svc.call":           { req: { service: string; action?: string; endpoint?: string; params?: Record<string, unknown>; input?: Record<string, unknown> }; res: string };
  "svc.test":           { req: { service: string }; res: { ok: boolean; error?: string; retry?: string } };
  "svc.delete":         { req: { service: string }; res: { ok: boolean } };
  "svc.updated":        { req: ServiceDef; res: void };
  "svc.guide":          { req: { service: string; content: string }; res: { ok: boolean } };
  "svc.guide.read":     { req: { service: string }; res: { content: string | null } };
}
