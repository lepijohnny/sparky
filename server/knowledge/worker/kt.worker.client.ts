/**
 * Worker client — single long-lived child process for model inference.
 * Child owns a queue and drains sequentially; parent pushes typed Work
 * items and controls lifecycle.
 *
 * Usage:
 *   const vectors = await queue(Embed(["hello", "world"]), cacheDir, log);
 *   const rewritten = await queue(Rewrite("test query"), cacheDir, log);
 *   const keywords = await queue(Keywords("test query"), cacheDir, log);
 *   const expanded = await queue(Expand("test query"), cacheDir, log);
 *   const scores = await queue(Rerank("query", ["doc1", "doc2"]), cacheDir, log);
 */
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn, type ChildProcess } from "node:child_process";
import { createInterface } from "node:readline";
import type { Logger } from "../../logger.types";


export const EMBEDDING_DIMS = 768;

const KILL_GRACE = 3_000;

export type WorkerPriority = "high" | "low";

/**
 * Typed work item. TIn is the payload shape sent to the worker,
 * TOut is the resolved type returned from queue().
 */
export interface Work<TIn, TOut> {
  readonly command: string;
  readonly input: TIn;
  readonly priority: WorkerPriority;
  readonly transform?: (raw: any) => TOut;
}

export function Embed(texts: string[], priority: WorkerPriority = "low"): Work<{ texts: string[] }, Float32Array[]> {
  return {
    command: "embed",
    input: { texts },
    priority,
    transform: (raw: number[][]) => raw.map((v) => new Float32Array(v)),
  };
}

export function EmbedOne(text: string, priority: WorkerPriority = "low"): Work<{ texts: string[] }, Float32Array> {
  return {
    command: "embed",
    input: { texts: [text] },
    priority,
    transform: (raw: number[][]) => new Float32Array(raw[0]),
  };
}

export function Keywords(query: string, priority: WorkerPriority = "high"): Work<{ query: string }, string[]> {
  return { command: "keywords", input: { query }, priority };
}

export function Rewrite(query: string, priority: WorkerPriority = "high"): Work<{ query: string }, string> {
  return { command: "rewrite", input: { query }, priority };
}

export function Expand(query: string, priority: WorkerPriority = "high"): Work<{ query: string }, string[]> {
  return { command: "expand", input: { query }, priority };
}

export function Rerank(query: string, documents: string[], priority: WorkerPriority = "high"): Work<{ query: string; documents: string[] }, number[]> {
  return { command: "rerank", input: { query, documents }, priority };
}

interface PendingRequest {
  requestId: string;
  command: string;
  payload: Record<string, any>;
  priority: WorkerPriority;
  transform?: (raw: any) => any;
  resolve: (v: any) => void;
  reject: (e: Error) => void;
}

let child: ChildProcess | null = null;
let initPromise: Promise<void> | null = null;
let log: Logger | null = null;
let requestCounter = 0;
let drainRequested = false;
let shutdownResolve: (() => void) | null = null;
let killTimer: ReturnType<typeof setTimeout> | null = null;

const parentQueue: PendingRequest[] = [];
const inflight = new Map<string, PendingRequest>();

function enqueuePending(req: PendingRequest) {
  if (req.priority === "high") parentQueue.unshift(req);
  else parentQueue.push(req);
}

function forceKill() {
  if (!child) return;
  log?.warn("sparky.worker: force killing child", { pid: child.pid });
  try { child.kill("SIGKILL"); } catch {}
  child = null;
  initPromise = null;
}

process.on("exit", forceKill);
process.on("uncaughtException", (err) => {
  log?.error("sparky.worker: uncaught exception, killing child", { error: String(err) });
  forceKill();
});

function ensureChild(): ChildProcess {
  if (child && child.exitCode === null && !child.killed) return child;

  if (child) {
    try { child.kill("SIGKILL"); } catch {}
    child = null;
    initPromise = null;
  }

  const dir = dirname(fileURLToPath(import.meta.url));
  const bundledWorker = join(dir, "kt.worker.mjs");
  const useBundled = existsSync(bundledWorker);

  const workerPath = useBundled ? bundledWorker : join(dir, "kt.worker.ts");
  const args = useBundled
    ? [workerPath, String(process.pid)]
    : ["--import", join(dir, "..", "..", "node_modules", "tsx", "dist", "loader.mjs"), workerPath, String(process.pid)];

  child = spawn(process.execPath, args, {
    stdio: ["pipe", "inherit", "pipe", "ipc"],
    env: { ...process.env, NODE_NO_WARNINGS: "1" },
  });

  log?.info("sparky.worker: spawned", { pid: child.pid });

  child.on("message", onMessage);

  if (child.stderr) {
    const rl = createInterface({ input: child.stderr });
    rl.on("line", (l) => { if (l.trim()) log?.debug("sparky.worker", { line: l }); });
  }

  child.on("error", (err) => {
    log?.error("sparky.worker: child error", { error: err.message });
    rejectAll(err.message);
    child = null;
    initPromise = null;
  });

  child.on("exit", (code, signal) => {
    const shuttingDown = drainRequested || shutdownResolve;
    if (code === 0 || (shuttingDown && signal === "SIGABRT")) {
      log?.info("sparky.worker: exited cleanly");
    } else if (signal) {
      log?.warn("sparky.worker: killed", { signal });
    } else {
      log?.warn("sparky.worker: exited unexpectedly", { code });
    }

    rejectAll("Worker process exited");
    child = null;
    initPromise = null;
    drainRequested = false;
    if (killTimer) { clearTimeout(killTimer); killTimer = null; }
    if (shutdownResolve) { shutdownResolve(); shutdownResolve = null; }
  });

  return child;
}

function ensureInit(cacheDir: string): Promise<void> {
  const proc = ensureChild();
  if (!initPromise) {
    initPromise = new Promise<void>((resolve, reject) => {
      const handler = (msg: any) => {
        if (msg.type === "ready") { proc.removeListener("message", handler); resolve(); }
      };
      proc.on("message", handler);
      try { proc.send({ type: "init", cacheDir }); }
      catch { reject(new Error("Failed to send init to worker child")); }
    });
    initPromise.then(() => log?.info("sparky.worker: initialized", { cacheDir }));
  }
  return initPromise;
}

function onMessage(msg: any) {
  const { type, requestId, result, error } = msg;

  if (type === "ready") return;

  if (type === "drained") {
    if (parentQueue.length > 0) { flush(); return; }
    if (drainRequested) { drainRequested = false; sendShutdown(); }
    return;
  }

  const req = inflight.get(requestId);
  if (!req) return;
  inflight.delete(requestId);

  if (type === "done") {
    req.resolve(req.transform ? req.transform(result) : result);
  } else if (type === "error") {
    req.reject(new Error(error));
  } else if (type === "skip") {
    req.reject(new Error("Worker request cancelled"));
  }
}

function flush() {
  if (!child) return;
  while (parentQueue.length > 0) {
    const req = parentQueue.shift()!;
    inflight.set(req.requestId, req);
    try {
      child.send({ type: req.command, requestId: req.requestId, priority: req.priority, ...req.payload });
    } catch {
      inflight.delete(req.requestId);
      req.reject(new Error("Failed to send to worker child"));
    }
  }
}

function rejectAll(reason: string) {
  const err = new Error(reason);
  for (const [, req] of inflight) req.reject(err);
  inflight.clear();
  for (const req of parentQueue.splice(0)) req.reject(err);
}

function sendShutdown() {
  if (!child) {
    if (shutdownResolve) { shutdownResolve(); shutdownResolve = null; }
    return;
  }

  log?.info("sparky.worker: sending shutdown", { pid: child.pid });
  const c = child;

  try { c.send({ type: "shutdown" }); }
  catch { try { c.kill("SIGKILL"); } catch {} return; }

  killTimer = setTimeout(() => {
    killTimer = null;
    if (c.exitCode === null) {
      log?.warn("sparky.worker: grace period expired, sending SIGKILL", { pid: c.pid });
      try { c.kill("SIGKILL"); } catch {}
    }
  }, KILL_GRACE);
}

export function queue<TIn, TOut>(
  work: Work<TIn, TOut>,
  cacheDir: string,
  logger: Logger,
): Promise<TOut> {
  log = logger;
  return new Promise<TOut>(async (resolve, reject) => {
    try {
      await ensureInit(cacheDir);
    } catch (err) {
      reject(err);
      return;
    }
    const requestId = `${work.command}_${++requestCounter}`;
    enqueuePending({
      requestId,
      command: work.command,
      payload: work.input as Record<string, any>,
      priority: work.priority,
      transform: work.transform,
      resolve,
      reject,
    });
    flush();
  });
}

export function cancelWorkerRequest(requestId: string): void {
  const idx = parentQueue.findIndex((r) => r.requestId === requestId);
  if (idx !== -1) {
    const [removed] = parentQueue.splice(idx, 1);
    removed.reject(new Error("Worker request cancelled"));
    return;
  }
  if (child && inflight.has(requestId)) {
    try { child.send({ type: "cancel", requestId }); } catch {}
  }
}

export function terminateWorker(): void {
  if (!child) return;
  drainRequested = true;
  if (inflight.size === 0 && parentQueue.length === 0) sendShutdown();
}

export async function shutdownWorker(): Promise<void> {
  if (!child) return;

  const promise = new Promise<void>((resolve) => {
    shutdownResolve = resolve;
  });

  drainRequested = true;
  if (inflight.size === 0 && parentQueue.length === 0) sendShutdown();

  await promise;
}
