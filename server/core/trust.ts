import { randomBytes, createCipheriv, createDecipheriv } from "node:crypto";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import type { Logger } from "../logger.types";
import type { KeychainProvider } from "./secrets";

const TRUST_FILE = "trust.enc";
const MASTER_KEY_ACCOUNT = "master-key";
const ALGO = "aes-256-gcm";
const NONCE_LEN = 12;
const TAG_LEN = 16;

export type PermissionMode = "read" | "write" | "execute";
export type Scope = "read" | "write" | "bash" | "bus";
export type RuleList = "allow" | "deny" | "ask";
export type Resolution = "deny" | "allow" | "prompt";

export interface TrustRule {
  label: string;
  pattern: string;
  addedAt?: number;
}

export interface ScopeRules {
  allow: TrustRule[];
  deny: TrustRule[];
  ask: TrustRule[];
}

export interface TrustData {
  mode: PermissionMode;
  read: ScopeRules;
  write: ScopeRules;
  bash: ScopeRules;
  bus: ScopeRules;
}

export interface TrustResolution {
  decision: Resolution;
  rule?: TrustRule;
}

export interface TrustStore {
  init(): Promise<void>;
  data(): TrustData;
  setMode(mode: PermissionMode): void;
  addRule(scope: Scope, list: RuleList, rule: TrustRule): void;
  removeRule(scope: Scope, list: RuleList, pattern: string): void;
  resolve(scope: Scope, input: string): TrustResolution;
  reset(): void;
  clear(): void;
}

const SCOPE_FALLBACK: Record<Scope, Resolution> = {
  read: "allow",
  write: "allow",
  bash: "prompt",
  bus: "allow",
};

const DEFAULT_READ_DENY: TrustRule[] = [
  { label: ".enc files", pattern: "\\.enc$", addedAt: 0 },
  { label: "Private keys", pattern: "\\.(key|pem)$", addedAt: 0 },
  { label: "SSH keys", pattern: "id_(rsa|ed25519|ecdsa)", addedAt: 0 },
];

const DEFAULT_WRITE_DENY: TrustRule[] = [
  { label: "/etc/", pattern: "^/etc/", addedAt: 0 },
  { label: "/usr/", pattern: "^/usr/", addedAt: 0 },
  { label: "/System/", pattern: "^/System/", addedAt: 0 },
  { label: ".env", pattern: "\\.env$", addedAt: 0 },
  { label: "Encrypted files", pattern: "\\.enc$", addedAt: 0 },
  { label: "SQLite database", pattern: "\\.db$", addedAt: 0 },
  { label: "SQLite WAL", pattern: "\\.db-wal$", addedAt: 0 },
  { label: "SQLite SHM", pattern: "\\.db-shm$", addedAt: 0 },
];

const DEFAULT_BASH_DENY: TrustRule[] = [
  { label: "sudo", pattern: "^sudo\\b", addedAt: 0 },
  { label: "rm -rf /", pattern: "^rm\\s+(-[rf]+\\s+)?/", addedAt: 0 },
  { label: "git push --force", pattern: "^git\\s+push\\s+(-f|--force)", addedAt: 0 },
  { label: "git reset --hard", pattern: "^git\\s+reset\\s+--hard", addedAt: 0 },
  { label: "git clean", pattern: "^git\\s+clean\\s+-[fd]", addedAt: 0 },
  { label: "curl pipe bash", pattern: "^curl.*\\|\\s*(ba)?sh", addedAt: 0 },
  { label: "dd", pattern: "^dd\\b", addedAt: 0 },
  { label: "mkfs", pattern: "^mkfs\\b", addedAt: 0 },
  { label: "eval", pattern: "^eval\\b", addedAt: 0 },
];

const DEFAULT_BASH_ASK: TrustRule[] = [
  { label: "rm", pattern: "\\brm\\b", addedAt: 0 },
];

const DEFAULT_BUS_DENY: TrustRule[] = [
  { label: "Delete workspace", pattern: "^settings\\.workspace\\.remove$", addedAt: 0 },
];

const DEFAULT_BUS_ASK: TrustRule[] = [
  { label: "Delete labels", pattern: "^settings\\.labels\\.delete$", addedAt: 0 },
  { label: "Delete chats", pattern: "^chat\\.delete$", addedAt: 0 },
  { label: "Delete sources", pattern: "^kt\\.sources\\.delete$", addedAt: 0 },
  { label: "Delete connections", pattern: "^svc\\.delete$", addedAt: 0 },
  { label: "Rename chats", pattern: "^chat\\.rename$", addedAt: 0 },
  { label: "Archive chats", pattern: "^chat\\.archive$", addedAt: 0 },
  { label: "Remove from allowlist", pattern: "^settings\\.sandbox\\.allowlist\\.remove$", addedAt: 0 },
];

function emptyScope(): ScopeRules {
  return { allow: [], deny: [], ask: [] };
}

function defaults(): TrustData {
  return {
    mode: "read",
    read: { allow: [], deny: [...DEFAULT_READ_DENY], ask: [] },
    write: { allow: [], deny: [...DEFAULT_WRITE_DENY], ask: [] },
    bash: { allow: [], deny: [...DEFAULT_BASH_DENY], ask: [...DEFAULT_BASH_ASK] },
    bus: { allow: [], deny: [...DEFAULT_BUS_DENY], ask: [...DEFAULT_BUS_ASK] },
  };
}

function matchesAny(rules: TrustRule[], value: string): TrustRule | null {
  for (const rule of rules) {
    try {
      if (new RegExp(rule.pattern).test(value)) return rule;
    } catch {}
  }
  return null;
}

export function createTrustStore(log: Logger, basePath: string, keychain: KeychainProvider): TrustStore {
  let masterKey: Buffer | null = null;
  let trust: TrustData = defaults();
  const filePath = join(basePath, TRUST_FILE);

  function encrypt(data: Buffer): Buffer {
    const nonce = randomBytes(NONCE_LEN);
    const cipher = createCipheriv(ALGO, masterKey!, nonce);
    const encrypted = Buffer.concat([cipher.update(data), cipher.final()]);
    const tag = cipher.getAuthTag();
    return Buffer.concat([nonce, encrypted, tag]);
  }

  function decrypt(data: Buffer): string {
    if (data.length < NONCE_LEN + TAG_LEN) throw new Error("trust.enc too short");
    const nonce = data.subarray(0, NONCE_LEN);
    const tag = data.subarray(data.length - TAG_LEN);
    const encrypted = data.subarray(NONCE_LEN, data.length - TAG_LEN);
    const decipher = createDecipheriv(ALGO, masterKey!, nonce);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf-8");
  }

  function flush(): void {
    if (!masterKey) throw new Error("Master key not loaded");
    const json = JSON.stringify(trust);
    const encrypted = encrypt(Buffer.from(json, "utf-8"));
    const dir = dirname(filePath);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    writeFileSync(filePath, encrypted);
  }

  async function loadOrCreateMasterKey(): Promise<Buffer> {
    try {
      const hex = await keychain.resolve(MASTER_KEY_ACCOUNT);
      const key = Buffer.from(hex, "hex");
      if (key.length === 32) return key;
      log.warn("Invalid master key length in keychain");
    } catch {
      log.info("No master key found for trust store");
    }
    const key = randomBytes(32);
    await keychain.store(MASTER_KEY_ACCOUNT, key.toString("hex"));
    return key;
  }

  function loadScope(stored: Partial<ScopeRules> | undefined, fallback?: ScopeRules): ScopeRules {
    const base = fallback ?? emptyScope();
    if (!stored || (!stored.allow?.length && !stored.deny?.length && !stored.ask?.length)) {
      return base;
    }
    const mergeUnique = (defaults: TrustRule[], saved: TrustRule[]): TrustRule[] => {
      const patterns = new Set(saved.map((r) => r.pattern));
      const missing = defaults.filter((r) => !patterns.has(r.pattern));
      return [...missing, ...saved];
    };
    return {
      allow: mergeUnique(base.allow, stored.allow ?? []),
      deny: mergeUnique(base.deny, stored.deny ?? []),
      ask: mergeUnique(base.ask, stored.ask ?? []),
    };
  }

  return {
    async init() {
      masterKey = await loadOrCreateMasterKey();

      if (existsSync(filePath)) {
        try {
          const raw = readFileSync(filePath);
          const json = decrypt(raw);
          const parsed = JSON.parse(json) as Partial<TrustData>;
          const defs = defaults();
          trust = {
            mode: parsed.mode ?? "read",
            read: loadScope(parsed.read, defs.read),
            write: loadScope(parsed.write, defs.write),
            bash: loadScope(parsed.bash, defs.bash),
            bus: loadScope(parsed.bus, defs.bus),
          };
          log.info("Trust store loaded", { mode: trust.mode });
        } catch (err) {
          log.error("Failed to decrypt trust.enc, using defaults", { error: String(err) });
          trust = defaults();
        }
      }
    },

    data() {
      return trust;
    },

    setMode(mode) {
      trust.mode = mode;
      flush();
      log.info("Permission mode changed", { mode });
    },

    addRule(scope, list, rule) {
      const arr = trust[scope][list];
      if (arr.some((r) => r.pattern === rule.pattern)) return;
      arr.push({ ...rule, addedAt: rule.addedAt ?? Date.now() });
      flush();
    },

    removeRule(scope, list, pattern) {
      const arr = trust[scope][list];
      const idx = arr.findIndex((r) => r.pattern === pattern);
      if (idx >= 0) {
        arr.splice(idx, 1);
        flush();
      }
    },

    resolve(scope, input) {
      const denyMatch = matchesAny(trust[scope].deny, input);
      if (denyMatch) return { decision: "deny", rule: denyMatch };

      const allowMatch = matchesAny(trust[scope].allow, input);
      const askMatch = matchesAny(trust[scope].ask, input);

      const candidates: { decision: Resolution; rule: TrustRule }[] = [];
      if (allowMatch) candidates.push({ decision: "allow", rule: allowMatch });
      if (askMatch) candidates.push({ decision: "prompt", rule: askMatch });

      if (candidates.length === 0) return { decision: SCOPE_FALLBACK[scope] };
      if (candidates.length === 1) return { decision: candidates[0].decision, rule: candidates[0].rule };

      candidates.sort((a, b) => (b.rule.addedAt ?? 0) - (a.rule.addedAt ?? 0));
      return { decision: candidates[0].decision, rule: candidates[0].rule };
    },

    reset() {
      trust = defaults();
      flush();
      log.info("Trust store reset to defaults");
    },

    clear() {
      trust = {
        mode: "read",
        read: emptyScope(),
        write: emptyScope(),
        bash: emptyScope(),
        bus: emptyScope(),
      };
      flush();
      log.info("Trust store cleared");
    },
  };
}

/** Creates a trust store wrapper that overrides the permission mode. Mutations (addRule, removeRule, setMode) pass through to the underlying store — only mode is overridden for reads. */
export function withModeOverride(store: TrustStore, mode: PermissionMode): TrustStore {
  return {
    init: () => store.init(),
    data: () => ({ ...store.data(), mode }),
    setMode: (m) => store.setMode(m),
    addRule: (s, l, r) => store.addRule(s, l, r),
    removeRule: (s, l, p) => store.removeRule(s, l, p),
    resolve: (s, i) => store.resolve(s, i),
    reset: () => store.reset(),
    clear: () => store.clear(),
  };
}

export function createNoopTrustStore(): TrustStore {
  const data = defaults();
  return {
    async init() {},
    data: () => data,
    setMode(mode) { data.mode = mode; },
    addRule() {},
    removeRule() {},
    resolve: () => ({ decision: "allow" }),
    reset() {},
    clear() {},
  };
}
