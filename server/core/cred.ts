import { randomBytes, createCipheriv, createDecipheriv } from "node:crypto";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import type { Logger } from "../logger.types";
import type { KeychainProvider } from "./secrets";

const CRED_FILE = "cred.enc";
const MASTER_KEY_ACCOUNT = "master-key";
const ALGO = "aes-256-gcm";
const NONCE_LEN = 12;
const TAG_LEN = 16;

export interface Credentials {
  init(): Promise<void>;
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
  deletePrefix(prefix: string): Promise<void>;
  keys(): string[];
  getEnvVars(): Record<string, string>;
  getEnvVarsForSkill(skillId: string): Record<string, string>;
  svcKey(service: string, field: string): string;
  deleteSvc(service: string): Promise<void>;
}

/** @deprecated Use Credentials instead */
export type SecretsProvider = Credentials;

/** @deprecated Use createCredStore instead */
export type CredStore = Credentials;

export function createCredStore(log: Logger, basePath: string, keychain: KeychainProvider): Credentials {
  const map = new Map<string, string>();
  let masterKey: Buffer | null = null;
  const filePath = join(basePath, CRED_FILE);

  function encrypt(data: Buffer): Buffer {
    const nonce = randomBytes(NONCE_LEN);
    const cipher = createCipheriv(ALGO, masterKey!, nonce);
    const encrypted = Buffer.concat([cipher.update(data), cipher.final()]);
    const tag = cipher.getAuthTag();
    return Buffer.concat([nonce, encrypted, tag]);
  }

  function decrypt(data: Buffer): string {
    if (data.length < NONCE_LEN + TAG_LEN) throw new Error("cred.enc too short");
    const nonce = data.subarray(0, NONCE_LEN);
    const tag = data.subarray(data.length - TAG_LEN);
    const encrypted = data.subarray(NONCE_LEN, data.length - TAG_LEN);
    const decipher = createDecipheriv(ALGO, masterKey!, nonce);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf-8");
  }

  function flush(): void {
    if (!masterKey) throw new Error("Master key not loaded");
    const json = JSON.stringify(Object.fromEntries(map));
    const encrypted = encrypt(Buffer.from(json, "utf-8"));
    const dir = dirname(filePath);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    writeFileSync(filePath, encrypted);
  }

  function clearPrefix(prefix: string): void {
    let count = 0;
    for (const key of [...map.keys()]) {
      if (key.startsWith(prefix)) { map.delete(key); count++; }
    }
    if (count > 0) {
      flush();
      log.info("Credentials cleared", { prefix, count });
    }
  }

  async function loadOrCreateMasterKey(): Promise<Buffer> {
    try {
      const hex = await keychain.resolve(MASTER_KEY_ACCOUNT);
      const key = Buffer.from(hex, "hex");
      if (key.length === 32) {
        log.info("Master key loaded from keychain");
        return key;
      }
      log.warn("Invalid master key length, regenerating");
    } catch {
      log.info("No master key found, generating new one");
    }

    const key = randomBytes(32);
    await keychain.store(MASTER_KEY_ACCOUNT, key.toString("hex"));
    log.info("Master key generated and stored in keychain");
    return key;
  }

  return {
    async init() {
      masterKey = await loadOrCreateMasterKey();

      if (existsSync(filePath)) {
        try {
          const raw = readFileSync(filePath);
          const json = decrypt(raw);
          const parsed = JSON.parse(json);
          for (const [k, v] of Object.entries(parsed)) {
            if (typeof v === "string") map.set(k, v);
          }
          log.info("Loaded credentials", { count: map.size });
        } catch (err) {
          log.error("Failed to decrypt cred.enc, starting fresh", { error: String(err) });
          map.clear();
        }
      }
    },

    async get(key) {
      return map.get(key) ?? null;
    },

    async set(key, value) {
      map.set(key, value);
      flush();
      log.info("Credential stored", { key });
    },

    async delete(key) {
      if (map.delete(key)) {
        flush();
        log.info("Credential deleted", { key });
      }
    },

    async deletePrefix(prefix) {
      clearPrefix(prefix);
    },

    svcKey(service, field) {
      return `svc.${service}.${field}`;
    },

    async deleteSvc(service) {
      clearPrefix(`svc.${service}.`);
    },

    keys() {
      return [...map.keys()];
    },

    getEnvVars() {
      const vars: Record<string, string> = {};
      for (const [key, value] of map) {
        if (key.startsWith("env.") && !key.startsWith("env.meta.")) vars[key.slice(4)] = value;
      }
      return vars;
    },

    /** Returns env vars for a skill. If ANY vars are tagged to this skill,
     *  returns ONLY those — untagged globals are excluded. Otherwise returns
     *  all untagged globals. This prevents unwanted key mixing between skills. */
    getEnvVarsForSkill(skillId: string) {
      const all: Record<string, string> = {};
      const meta: Record<string, string> = {};

      for (const [key, value] of map) {
        if (key.startsWith("env.meta.")) {
          meta[key.slice(9)] = value;
        } else if (key.startsWith("env.")) {
          all[key.slice(4)] = value;
        }
      }

      const tagged: Record<string, string> = {};
      const untagged: Record<string, string> = {};
      for (const [name, value] of Object.entries(all)) {
        const tag = meta[name];
        if (tag === skillId) tagged[name] = value;
        else if (!tag) untagged[name] = value;
      }

      if (Object.keys(tagged).length > 0) return tagged;
      return untagged;
    },
  };
}
