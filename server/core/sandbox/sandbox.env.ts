import type { ConfigManager } from "../config";

/**
 * Manages sandbox allowlist via config.json (allowlist key).
 */
export class SandboxAllowlist {
  constructor(private config: ConfigManager) {}

  list(): string[] {
    return this.config.get("allowlist") ?? [];
  }

  async add(host: string): Promise<string> {
    const list = this.list();
    if (list.includes(host)) return host;
    list.push(host);
    await this.config.set("allowlist", list);
    return host;
  }

  async remove(host: string): Promise<boolean> {
    const list = this.list();
    const idx = list.indexOf(host);
    if (idx === -1) return false;
    list.splice(idx, 1);
    await this.config.set("allowlist", list);
    return true;
  }

  isHostAllowed(hostname: string): boolean {
    return this.list().some((entry) => {
      if (entry.startsWith("*.")) {
        const suffix = entry.slice(1); // ".example.com"
        return hostname.endsWith(suffix) || hostname === entry.slice(2);
      }
      return entry === hostname;
    });
  }
}
