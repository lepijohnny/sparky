import { describe, test, expect, beforeEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir, homedir } from "node:os";
import { createEventBus } from "../bus";
import { noopLogger } from "../../logger";
import { registerFsComplete } from "../fs.complete";

function setup() {
  const root = mkdtempSync(join(tmpdir(), "fs-complete-test-"));
  mkdirSync(join(root, "alpha"));
  mkdirSync(join(root, "alpha", "nested"));
  mkdirSync(join(root, "beta"));
  mkdirSync(join(root, ".hidden"));
  writeFileSync(join(root, "file1.ts"), "");
  writeFileSync(join(root, "file2.ts"), "");
  writeFileSync(join(root, "readme.md"), "");
  writeFileSync(join(root, "alpha", "deep.ts"), "");
  return root;
}

describe("fs.complete", () => {
  let bus: ReturnType<typeof createEventBus>;
  let root: string;

  beforeEach(() => {
    bus = createEventBus(noopLogger);
    registerFsComplete(bus);
    root = setup();
  });

  test("given directory path, when completing, then returns entries", async () => {
    const res = await bus.emit("fs.complete", { partial: root + "/" });
    expect(res.entries.length).toBeGreaterThan(0);
    expect(res.entries.some((e: any) => e.name === "alpha" && e.isDir)).toBe(true);
    expect(res.entries.some((e: any) => e.name === "file1.ts" && !e.isDir)).toBe(true);
  });

  test("given directory path, when completing, then hides dotfiles", async () => {
    const res = await bus.emit("fs.complete", { partial: root + "/" });
    expect(res.entries.every((e: any) => !e.name.startsWith("."))).toBe(true);
  });

  test("given directory path, when completing, then sorts dirs before files", async () => {
    const res = await bus.emit("fs.complete", { partial: root + "/" });
    const dirIdx = res.entries.findIndex((e: any) => e.name === "alpha");
    const fileIdx = res.entries.findIndex((e: any) => e.name === "file1.ts");
    expect(dirIdx).toBeLessThan(fileIdx);
  });

  test("given partial filename, when completing, then filters by prefix", async () => {
    const res = await bus.emit("fs.complete", { partial: root + "/file" });
    expect(res.entries.length).toBe(2);
    expect(res.entries.every((e: any) => e.name.startsWith("file"))).toBe(true);
  });

  test("given partial filename, when completing, then base excludes prefix", async () => {
    const res = await bus.emit("fs.complete", { partial: root + "/file" });
    expect(res.base).toBe(root + "/");
  });

  test("given partial dir name, when completing, then filters dirs", async () => {
    const res = await bus.emit("fs.complete", { partial: root + "/al" });
    expect(res.entries.length).toBe(1);
    expect(res.entries[0].name).toBe("alpha");
    expect(res.entries[0].isDir).toBe(true);
  });

  test("given nested path, when completing, then lists nested dir", async () => {
    const res = await bus.emit("fs.complete", { partial: root + "/alpha/" });
    expect(res.entries.some((e: any) => e.name === "nested" && e.isDir)).toBe(true);
    expect(res.entries.some((e: any) => e.name === "deep.ts" && !e.isDir)).toBe(true);
  });

  test("given no matches, when completing, then returns empty", async () => {
    const res = await bus.emit("fs.complete", { partial: root + "/zzz" });
    expect(res.entries).toEqual([]);
  });

  test("given case-insensitive prefix, when completing, then matches", async () => {
    const res = await bus.emit("fs.complete", { partial: root + "/READ" });
    expect(res.entries.length).toBe(1);
    expect(res.entries[0].name).toBe("readme.md");
  });

  test("given ~/ prefix, when completing, then resolves to home directory", async () => {
    const res = await bus.emit("fs.complete", { partial: "~/" });
    expect(res.base).toBe("~/");
    expect(res.entries.length).toBeGreaterThan(0);
  });

  test("given nonexistent directory, when completing, then returns empty", async () => {
    const res = await bus.emit("fs.complete", { partial: root + "/nonexistent/foo" });
    expect(res.entries).toEqual([]);
  });

  test("given directory path with trailing slash, when completing, then base keeps slash", async () => {
    const res = await bus.emit("fs.complete", { partial: root + "/alpha/" });
    expect(res.base).toBe(root + "/alpha/");
  });

  test("given directory with many entries, when completing, then caps at 100", async () => {
    const big = join(root, "big");
    mkdirSync(big);
    for (let i = 0; i < 150; i++) writeFileSync(join(big, `file${String(i).padStart(3, "0")}.txt`), "");
    const res = await bus.emit("fs.complete", { partial: big + "/" });
    expect(res.entries.length).toBe(100);
  });

  test("given directory with node_modules, when completing, then excludes node_modules", async () => {
    mkdirSync(join(root, "node_modules"));
    const res = await bus.emit("fs.complete", { partial: root + "/" });
    expect(res.entries.every((e: any) => e.name !== "node_modules")).toBe(true);
  });
});
