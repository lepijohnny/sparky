import { mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync, rmSync } from "fs";
import { join, dirname } from "path";
import { homedir } from "os";
import type { Logger } from "../logger.types";

const DEFAULT_ROOT = join(homedir(), ".sparky");

export interface StorageProvider {
  read<T = any>(path: string): T;
  write(path: string, data: any): void;
  update(path: string, property: string, value: any): void;
  list(dir: string, ext?: string): string[];
  mkdir(path: string): void;
  remove(path: string): void;
  exists(path: string): boolean;
  root(path: string): string;
}

export interface EmptyStorage {
  seed(): StorageProvider;
}

export function createStorage(log: Logger, root: string = DEFAULT_ROOT): EmptyStorage {
  return {
    seed() {
      try {
        mkdirSync(root, { recursive: true });
        log.info("Initialized", { root });
      } catch (err) {
        log.error("Failed to initialize", { root, error: String(err) });
        throw err;
      }

      function resolve(path: string): string {
        return join(root, path);
      }

      function ensureDir(path: string): void {
        const dir = dirname(resolve(path));
        if (!existsSync(dir)) {
          mkdirSync(dir, { recursive: true });
          log.debug(`Created directory ${dir}`);
        }
      }

      return {
        read<T = any>(path: string): T {
          const full = resolve(path);
          if (!existsSync(full)) {
            log.error("File not found", { path });
            throw new Error(`File not found: ${path}`);
          }
          try {
            const raw = readFileSync(full, "utf-8");
            return JSON.parse(raw);
          } catch (err) {
            log.error("Failed to read", { path, error: String(err) });
            throw err;
          }
        },

        write(path: string, data: any): void {
          try {
            ensureDir(path);
            writeFileSync(resolve(path), JSON.stringify(data, null, 2) + "\n", "utf-8");
            log.debug(`Wrote ${path}`);
          } catch (err) {
            log.error("Failed to write", { path, error: String(err) });
            throw err;
          }
        },

        update(path: string, property: string, value: any): void {
          const full = resolve(path);
          let data: any = {};
          try {
            if (existsSync(full)) {
              data = JSON.parse(readFileSync(full, "utf-8"));
              if (typeof data !== "object" || data === null) {
                log.warn("Expected object, resetting", { path, was: typeof data });
                data = {};
              }
            }
            data[property] = value;
            ensureDir(path);
            writeFileSync(full, JSON.stringify(data, null, 2) + "\n", "utf-8");
            log.debug(`Updated ${path} → ${property}`);
          } catch (err) {
            log.error("Failed to update", { path, property, error: String(err) });
            throw err;
          }
        },

        list(dir: string, ext: string = ".json"): string[] {
          const full = resolve(dir);
          if (!existsSync(full)) {
            log.debug(`Directory not found, returning empty`, { dir });
            return [];
          }
          try {
            return readdirSync(full).filter((f) => f.endsWith(ext));
          } catch (err) {
            log.error("Failed to list", { dir, error: String(err) });
            throw err;
          }
        },

        mkdir(path: string): void {
          const full = resolve(path);
          if (!existsSync(full)) {
            mkdirSync(full, { recursive: true });
            log.debug(`Created directory ${path}`);
          }
        },

        remove(path: string): void {
          const full = resolve(path);
          if (existsSync(full)) {
            rmSync(full, { recursive: true, force: true });
            log.debug(`Removed ${path}`);
          }
        },

        exists(path: string): boolean {
          return existsSync(resolve(path));
        },

        root: resolve,
      };
    },
  };
}
