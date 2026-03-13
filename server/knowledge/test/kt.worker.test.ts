import { describe, test, expect, afterEach } from "vitest";
import { fork, type ChildProcess } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dir = dirname(fileURLToPath(import.meta.url));
const WORKER = join(__dir, "..", "worker", "kt.worker.ts");
const MOCK_FN_DIR = __dir;
const TSX_LOADER = join(__dir, "..", "..", "node_modules", "tsx", "dist", "loader.mjs");
const DIMS = 768;

function spawnWorker(delayMs = 10): ChildProcess {
  const proc = fork(WORKER, [String(process.pid)], {
    execArgv: ["--import", TSX_LOADER],
    stdio: ["pipe", "inherit", "pipe", "ipc"],
    env: { ...process.env, NODE_NO_WARNINGS: "1", WORKER_FN_DIR: MOCK_FN_DIR, MOCK_DELAY_MS: String(delayMs) },
  });
  proc.setMaxListeners(50);
  return proc;
}

function initWorker(child: ChildProcess): Promise<void> {
  return new Promise((resolve, reject) => {
    const handler = (msg: any) => {
      if (msg.type === "ready") { child.removeListener("message", handler); resolve(); }
      if (msg.type === "error") { child.removeListener("message", handler); reject(new Error(msg.error)); }
    };
    child.on("message", handler);
    child.send({ type: "init", cacheDir: "/tmp/test-worker" });
  });
}

function sendCommand(child: ChildProcess, type: string, requestId: string, payload: Record<string, any> = {}): Promise<any> {
  return new Promise((resolve, reject) => {
    const handler = (msg: any) => {
      if (msg.requestId !== requestId) return;
      child.removeListener("message", handler);
      if (msg.type === "done") resolve(msg.result);
      else if (msg.type === "error") reject(new Error(msg.error));
      else if (msg.type === "skip") reject(new Error("cancelled"));
    };
    child.on("message", handler);
    child.send({ type, requestId, ...payload });
  });
}

function sendEmbed(child: ChildProcess, requestId: string, texts: string[]): Promise<Float32Array[]> {
  return sendCommand(child, "embed", requestId, { texts }).then(
    (result: number[][]) => result.map((v) => new Float32Array(v)),
  );
}

function waitForMessage(child: ChildProcess, type: string, timeoutMs = 5000): Promise<any> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { child.removeListener("message", handler); reject(new Error(`timeout waiting for ${type}`)); }, timeoutMs);
    const handler = (msg: any) => {
      if (msg.type === type) { clearTimeout(timer); child.removeListener("message", handler); resolve(msg); }
    };
    child.on("message", handler);
  });
}

function waitForExit(child: ChildProcess, timeoutMs = 5000): Promise<number | null> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("timeout waiting for exit")), timeoutMs);
    child.on("exit", (code) => { clearTimeout(timer); resolve(code); });
  });
}

function shutdownWorker(child: ChildProcess): Promise<number | null> {
  const exitPromise = waitForExit(child);
  child.send({ type: "shutdown" });
  return exitPromise;
}

describe("kt.worker protocol", () => {
  let child: ChildProcess;

  afterEach(async () => {
    if (child && child.exitCode === null) {
      child.kill("SIGKILL");
      await new Promise((r) => child.on("exit", r));
    }
  });

  test("given init message, when worker starts, then it sends ready", async () => {
    child = spawnWorker();
    await initWorker(child);
    await shutdownWorker(child);
  });

  test("given single text, when embed is sent, then result has correct dimensions", async () => {
    child = spawnWorker();
    await initWorker(child);
    const result = await sendEmbed(child, "r1", ["hello world"]);
    expect(result).toHaveLength(1);
    expect(result[0]).toBeInstanceOf(Float32Array);
    expect(result[0].length).toBe(DIMS);
    await shutdownWorker(child);
  });

  test("given multiple texts, when embed is sent, then result contains one vector per text", async () => {
    child = spawnWorker();
    await initWorker(child);
    const result = await sendEmbed(child, "r1", ["one", "two", "three"]);
    expect(result).toHaveLength(3);
    for (const vec of result) {
      expect(vec).toBeInstanceOf(Float32Array);
      expect(vec.length).toBe(DIMS);
    }
    await shutdownWorker(child);
  });

  test("given three queued requests, when processed, then all resolve in order", async () => {
    child = spawnWorker(50);
    await initWorker(child);
    const p1 = sendEmbed(child, "r1", ["a"]);
    const p2 = sendEmbed(child, "r2", ["b"]);
    const p3 = sendEmbed(child, "r3", ["c"]);
    const [res1, res2, res3] = await Promise.all([p1, p2, p3]);
    expect(res1).toHaveLength(1);
    expect(res2).toHaveLength(1);
    expect(res3).toHaveLength(1);
    await shutdownWorker(child);
  });

  test("given queued request, when processing completes, then drained is sent", async () => {
    child = spawnWorker();
    await initWorker(child);
    const drainPromise = waitForMessage(child, "drained");
    child.send({ type: "embed", requestId: "r1", texts: ["x"] });
    await drainPromise;
    await shutdownWorker(child);
  });

  test("given pending request, when cancel is sent before processing, then request is skipped", async () => {
    child = spawnWorker(200);
    await initWorker(child);
    const messages: any[] = [];
    child.on("message", (msg: any) => messages.push(msg));

    child.send({ type: "embed", requestId: "r1", texts: ["slow"] });
    child.send({ type: "embed", requestId: "r2", texts: ["will cancel"] });
    child.send({ type: "embed", requestId: "r3", texts: ["keep"] });
    child.send({ type: "cancel", requestId: "r2" });

    await waitForMessage(child, "drained");

    const done = messages.filter((m) => m.type === "done").map((m) => m.requestId);
    const skipped = messages.filter((m) => m.type === "skip").map((m) => m.requestId);
    expect(done).toContain("r1");
    expect(done).toContain("r3");
    expect(skipped).toContain("r2");
    expect(done).not.toContain("r2");
    await shutdownWorker(child);
  });

  test("given queued requests, when shutdown is sent, then remaining are skipped", async () => {
    child = spawnWorker(200);
    await initWorker(child);
    const messages: any[] = [];
    child.on("message", (msg: any) => messages.push(msg));

    child.send({ type: "embed", requestId: "r1", texts: ["processing"] });
    child.send({ type: "embed", requestId: "r2", texts: ["queued1"] });
    child.send({ type: "embed", requestId: "r3", texts: ["queued2"] });

    await new Promise((r) => setTimeout(r, 50));
    child.send({ type: "shutdown" });
    const code = await waitForExit(child);

    expect(code).toBe(0);
    const done = messages.filter((m) => m.type === "done").map((m) => m.requestId);
    const skipped = messages.filter((m) => m.type === "skip").map((m) => m.requestId);
    expect(done).toContain("r1");
    expect(skipped).toContain("r2");
    expect(skipped).toContain("r3");
  });

  test("given empty queue, when shutdown is sent, then worker exits immediately", async () => {
    child = spawnWorker();
    await initWorker(child);
    const code = await shutdownWorker(child);
    expect(code).toBe(0);
  });

  test("given running worker, when parent disconnects, then worker exits cleanly", async () => {
    child = spawnWorker();
    await initWorker(child);
    const exitPromise = waitForExit(child);
    child.disconnect();
    const code = await exitPromise;
    expect(code).toBe(0);
  });

  test("given same input twice, when embedded, then vectors are identical", async () => {
    child = spawnWorker();
    await initWorker(child);
    const res1 = await sendEmbed(child, "r1", ["hello"]);
    const res2 = await sendEmbed(child, "r2", ["hello"]);
    expect(Array.from(res1[0])).toEqual(Array.from(res2[0]));
    await shutdownWorker(child);
  });

  test("given different inputs, when embedded, then vectors differ", async () => {
    child = spawnWorker();
    await initWorker(child);
    const res1 = await sendEmbed(child, "r1", ["hello"]);
    const res2 = await sendEmbed(child, "r2", ["world"]);
    expect(Array.from(res1[0])).not.toEqual(Array.from(res2[0]));
    await shutdownWorker(child);
  });

  test("given unknown requestId, when cancel is sent, then worker continues normally", async () => {
    child = spawnWorker();
    await initWorker(child);
    child.send({ type: "cancel", requestId: "nonexistent" });
    const result = await sendEmbed(child, "r1", ["still works"]);
    expect(result).toHaveLength(1);
    await shutdownWorker(child);
  });

  test("given 20 concurrent requests, when processed, then all resolve with correct dimensions", async () => {
    child = spawnWorker(5);
    await initWorker(child);
    const promises = Array.from({ length: 20 }, (_, i) =>
      sendEmbed(child, `r${i}`, [`text-${i}`]),
    );
    const results = await Promise.all(promises);
    for (const res of results) {
      expect(res).toHaveLength(1);
      expect(res[0].length).toBe(DIMS);
    }
    await shutdownWorker(child);
  });

  test("given five queued requests, when two are cancelled, then only targeted requests are skipped", async () => {
    child = spawnWorker(100);
    await initWorker(child);
    const messages: any[] = [];
    child.on("message", (msg: any) => messages.push(msg));

    for (let i = 0; i < 5; i++) {
      child.send({ type: "embed", requestId: `r${i}`, texts: [`text-${i}`] });
    }
    child.send({ type: "cancel", requestId: "r1" });
    child.send({ type: "cancel", requestId: "r3" });

    await waitForMessage(child, "drained");

    const done = messages.filter((m) => m.type === "done").map((m) => m.requestId);
    const skipped = messages.filter((m) => m.type === "skip").map((m) => m.requestId);
    expect(done).toEqual(expect.arrayContaining(["r0", "r2", "r4"]));
    expect(skipped).toEqual(expect.arrayContaining(["r1", "r3"]));
    expect(done).toHaveLength(3);
    expect(skipped).toHaveLength(2);
    await shutdownWorker(child);
  });

  test("given mixed priority requests, when queued before processing, then high priority completes before low", async () => {
    child = spawnWorker(50);
    await initWorker(child);

    const order: string[] = [];
    child.on("message", (msg: any) => {
      if (msg.type === "done") order.push(msg.requestId);
    });

    child.send({ type: "embed", requestId: "low1", texts: ["a"], priority: "low" });
    child.send({ type: "embed", requestId: "low2", texts: ["b"], priority: "low" });
    child.send({ type: "embed", requestId: "high1", texts: ["c"], priority: "high" });
    child.send({ type: "embed", requestId: "low3", texts: ["d"], priority: "low" });
    child.send({ type: "embed", requestId: "high2", texts: ["e"], priority: "high" });

    await waitForMessage(child, "drained");

    expect(order).toHaveLength(5);
    const highIdx = order.indexOf("high1");
    const lowIdx = order.indexOf("low3");
    expect(highIdx).toBeLessThan(lowIdx);
    await shutdownWorker(child);
  });

  test("given active processing, when shutdown is sent mid-inference, then worker exits with code 0", async () => {
    child = spawnWorker(500);
    await initWorker(child);
    child.send({ type: "embed", requestId: "r1", texts: ["slow job"] });
    await new Promise((r) => setTimeout(r, 100));
    child.send({ type: "shutdown" });
    const code = await waitForExit(child);
    expect(code).toBe(0);
  });

  test("given keywords command, when sent, then returns array of keywords", async () => {
    child = spawnWorker();
    await initWorker(child);
    const result = await sendCommand(child, "keywords", "r1", { query: "what is ASML in Eindhoven" });
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBeGreaterThan(0);
    for (const kw of result) {
      expect(typeof kw).toBe("string");
      expect(kw.length).toBeGreaterThan(2);
    }
    await shutdownWorker(child);
  });

  test("given rewrite command, when sent, then returns rewritten query", async () => {
    child = spawnWorker();
    await initWorker(child);
    const result = await sendCommand(child, "rewrite", "r1", { query: "test query" });
    expect(result).toBe("rewritten: test query");
    await shutdownWorker(child);
  });

  test("given expand command, when sent, then returns array of expanded queries", async () => {
    child = spawnWorker();
    await initWorker(child);
    const result = await sendCommand(child, "expand", "r1", { query: "test query" });
    expect(result).toHaveLength(2);
    expect(result[0]).toContain("expanded-1");
    expect(result[1]).toContain("expanded-2");
    await shutdownWorker(child);
  });

  test("given rerank command, when sent, then returns scores array", async () => {
    child = spawnWorker();
    await initWorker(child);
    const result = await sendCommand(child, "rerank", "r1", {
      query: "test query",
      documents: ["doc1", "doc2", "doc3"],
    });
    expect(result).toHaveLength(3);
    expect(result[0]).toBeGreaterThan(result[1]);
    expect(result[1]).toBeGreaterThan(result[2]);
    await shutdownWorker(child);
  });

  test("given mixed command types, when queued, then all resolve correctly", async () => {
    child = spawnWorker();
    await initWorker(child);
    const embedP = sendEmbed(child, "r1", ["hello"]);
    const rewriteP = sendCommand(child, "rewrite", "r2", { query: "q" });
    const rerankP = sendCommand(child, "rerank", "r3", { query: "q", documents: ["a", "b"] });
    const [embedR, rewriteR, rerankR] = await Promise.all([embedP, rewriteP, rerankP]);
    expect(embedR).toHaveLength(1);
    expect(embedR[0].length).toBe(DIMS);
    expect(rewriteR).toBe("rewritten: q");
    expect(rerankR).toHaveLength(2);
    await shutdownWorker(child);
  });
});
