import { mkdir } from "fs/promises";
import { appendFileSync, readFileSync, readdirSync, unlinkSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import type { Logger, LogLevel, LogEntry } from "./logger.types";

const LEVEL_ORDER: LogLevel[] = ["debug", "info", "warn", "error"];
const LEVEL_LABELS: Record<LogLevel, string> = {
  debug: "DEBUG",
  info:  "INFO ",
  warn:  "WARN ",
  error: "ERROR",
};

/** Noop logger for testing — no output, no files */
export const noopLogger: Logger = {
  debug() {},
  info() {},
  warn() {},
  error() {},
};

type BroadcastFn = (route: string, data: any) => void;

export interface FileLogger {
  init(): Promise<void>;
  setBroadcaster(fn: BroadcastFn): void;
  createLogger(name: string): Logger;
  readTodayLinesSync(): string[];
}

function pruneOldLogs(logsDir: string, maxAgeDays: number): void {
  try {
    const cutoff = Date.now() - maxAgeDays * 24 * 60 * 60 * 1000;
    const files = readdirSync(logsDir).filter((f) => f.startsWith("sparky-") && f.endsWith(".log"));
    for (const file of files) {
      const match = file.match(/^sparky-(\d{4}-\d{2}-\d{2})\.log$/);
      if (!match) continue;
      const fileDate = new Date(match[1]).getTime();
      if (fileDate < cutoff) {
        unlinkSync(join(logsDir, file));
      }
    }
  } catch { /* ignore */ }
}

export function createFileLogger(minLevelName: LogLevel = "debug"): FileLogger {
  const minLevel = LEVEL_ORDER.indexOf(minLevelName);
  const logsDir = join(homedir(), ".sparky", "logs");
  let logFilePath = "";
  let broadcaster: BroadcastFn | null = null;

  function updateFilePath(): void {
    const today = new Date().toISOString().slice(0, 10);
    const expected = join(logsDir, `sparky-${today}.log`);
    if (logFilePath !== expected) {
      logFilePath = expected;
    }
  }

  function format(entry: LogEntry): string {
    const ts = entry.timestamp;
    const lvl = LEVEL_LABELS[entry.level];
    const scope = `[${entry.scope}]`.padEnd(36);
    const base = `${ts} [${lvl}] ${scope} ${entry.message}`;
    if (entry.data !== undefined) {
      return `${base} ${JSON.stringify(entry.data)}`;
    }
    return base;
  }

  function appendToFile(line: string): void {
    try {
      updateFilePath();
      appendFileSync(logFilePath, line + "\n");
    } catch {
      // Silently fail
    }
  }

  function log(level: LogLevel, scope: string, message: string, data?: any): void {
    const levelIdx = LEVEL_ORDER.indexOf(level);
    if (levelIdx < minLevel) return;

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      scope,
      message,
      data,
    };

    const line = format(entry);

    process.stderr.write(line + "\n");
    appendToFile(line);

    if (broadcaster && levelIdx >= LEVEL_ORDER.indexOf("info")) {
      try { broadcaster("log:entry", { line }); } catch {}
    }
  }

  updateFilePath();

  return {
    async init() {
      await mkdir(logsDir, { recursive: true });
      pruneOldLogs(logsDir, 3);
    },

    setBroadcaster(fn) {
      broadcaster = fn;
    },

    createLogger(name) {
      return {
        debug: (message: string, data?: any) => log("debug", name, message, data),
        info:  (message: string, data?: any) => log("info", name, message, data),
        warn:  (message: string, data?: any) => log("warn", name, message, data),
        error: (message: string, data?: any) => log("error", name, message, data),
      };
    },

    readTodayLinesSync() {
      try {
        return readFileSync(logFilePath, "utf-8").split("\n").filter(Boolean);
      } catch {
        return [];
      }
    },
  };
}
