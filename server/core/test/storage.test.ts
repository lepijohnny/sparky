import { describe, test, expect, beforeEach, afterAll } from "vitest";
import { rmSync, writeFileSync, existsSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { createStorage } from "../storage";
import { noopLogger } from "../../logger";

const TEST_ROOT = join(tmpdir(), `sparky-test-${Date.now()}`);

function makeStorage() {
  return createStorage(noopLogger, TEST_ROOT).seed();
}

beforeEach(() => {
  rmSync(TEST_ROOT, { recursive: true, force: true });
});

afterAll(() => {
  rmSync(TEST_ROOT, { recursive: true, force: true });
});

describe("init", () => {
  test("given fresh root, when init is called, then root directory is created", () => {
    expect(existsSync(TEST_ROOT)).toBe(false);
    createStorage(noopLogger, TEST_ROOT).seed();
    expect(existsSync(TEST_ROOT)).toBe(true);
  });

  test("given existing root, when init is called again, then it succeeds", () => {
    createStorage(noopLogger, TEST_ROOT).seed();
    createStorage(noopLogger, TEST_ROOT).seed();
  });
});

describe("write and read", () => {
  test("given written JSON, when read is called, then returns the same data", () => {
    const s = makeStorage();
    s.write("test.json", { hello: "world" });
    expect(s.read<Record<string, unknown>>("test.json")).toEqual({ hello: "world" });
  });

  test("given existing file, when written again, then content is overwritten", () => {
    const s = makeStorage();
    s.write("test.json", { v: 1 });
    s.write("test.json", { v: 2 });
    expect(s.read<Record<string, unknown>>("test.json")).toEqual({ v: 2 });
  });

  test("given nested path, when written, then directories are created", () => {
    const s = makeStorage();
    s.write("a/b/c.json", { deep: true });
    expect(s.read<Record<string, unknown>>("a/b/c.json")).toEqual({ deep: true });
  });

  test("given missing file, when read is called, then it throws", () => {
    const s = makeStorage();
    expect(() => s.read("nope.json")).toThrow("File not found: nope.json");
  });

  test("given invalid JSON file, when read is called, then it throws", () => {
    const s = makeStorage();
    writeFileSync(join(TEST_ROOT, "bad.json"), "not json", "utf-8");
    expect(() => s.read("bad.json")).toThrow();
  });
});

describe("update", () => {
  test("given existing file, when updating with new property, then preserves existing keys", () => {
    const s = makeStorage();
    s.write("config.json", { a: 1 });
    s.update("config.json", "b", 2);
    expect(s.read<Record<string, unknown>>("config.json")).toEqual({ a: 1, b: 2 });
  });

  test("given existing file, when updating existing property, then overwrites it", () => {
    const s = makeStorage();
    s.write("config.json", { a: 1 });
    s.update("config.json", "a", 99);
    expect(s.read<Record<string, unknown>>("config.json")).toEqual({ a: 99 });
  });

  test("given missing file, when update is called, then file is created with property", () => {
    const s = makeStorage();
    s.update("new.json", "key", "val");
    expect(s.read<Record<string, unknown>>("new.json")).toEqual({ key: "val" });
  });

  test("given file with non-object content, when update is called, then content is reset to object", () => {
    const s = makeStorage();
    writeFileSync(join(TEST_ROOT, "str.json"), '"just a string"', "utf-8");
    s.update("str.json", "key", "val");
    expect(s.read<Record<string, unknown>>("str.json")).toEqual({ key: "val" });
  });
});

describe("list", () => {
  test("given directory with json files, when list is called, then returns json files", () => {
    const s = makeStorage();
    s.write("themes/a.json", {});
    s.write("themes/b.json", {});
    expect(s.list("themes").sort()).toEqual(["a.json", "b.json"]);
  });

  test("given missing directory, when list is called, then returns empty array", () => {
    const s = makeStorage();
    expect(s.list("nonexistent")).toEqual([]);
  });
});

describe("remove", () => {
  test("given existing file, when remove is called, then file is deleted", () => {
    const s = makeStorage();
    s.write("test.json", { a: 1 });
    expect(s.exists("test.json")).toBe(true);
    s.remove("test.json");
    expect(s.exists("test.json")).toBe(false);
  });

  test("given existing directory, when remove is called, then directory and contents are deleted", () => {
    const s = makeStorage();
    s.write("dir/a.json", {});
    s.write("dir/b.json", {});
    expect(s.exists("dir")).toBe(true);
    s.remove("dir");
    expect(s.exists("dir")).toBe(false);
  });

  test("given missing path, when remove is called, then nothing happens", () => {
    const s = makeStorage();
    s.remove("nonexistent");
  });
});

describe("mkdir", () => {
  test("given new path, when mkdir is called, then directory is created", () => {
    const s = makeStorage();
    s.mkdir("a/b/c");
    expect(s.exists("a/b/c")).toBe(true);
  });

  test("given existing path, when mkdir is called again, then it succeeds", () => {
    const s = makeStorage();
    s.mkdir("dir");
    s.mkdir("dir");
    expect(s.exists("dir")).toBe(true);
  });
});

describe("resolve", () => {
  test("given relative path, when resolve is called, then returns absolute path under root", () => {
    const s = makeStorage();
    const resolved = s.root("some/file.json");
    expect(resolved).toBe(join(TEST_ROOT, "some/file.json"));
  });
});

describe("exists", () => {
  test("given written file, when exists is called, then returns true", () => {
    const s = makeStorage();
    s.write("test.json", {});
    expect(s.exists("test.json")).toBe(true);
  });

  test("given missing file, when exists is called, then returns false", () => {
    const s = makeStorage();
    expect(s.exists("nope.json")).toBe(false);
  });
});
