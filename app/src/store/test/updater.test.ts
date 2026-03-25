import { describe, test, expect, beforeEach, vi } from "vitest";
import { useStore } from "../index";

vi.mock("@tauri-apps/plugin-updater", () => ({
  check: vi.fn(),
}));

vi.mock("@tauri-apps/plugin-process", () => ({
  relaunch: vi.fn(),
}));

import { check } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";

const mockCheck = vi.mocked(check);
const mockRelaunch = vi.mocked(relaunch);

describe("updater slice", () => {
  beforeEach(() => {
    useStore.setState({ updater: { status: "idle" }, updaterCheckResult: null });
    vi.clearAllMocks();
    (window as any).__TAURI_INTERNALS__ = true;
  });

  test("given no tauri, when checkForUpdates, then stays idle", async () => {
    (window as any).__TAURI_INTERNALS__ = undefined;
    await useStore.getState().checkForUpdates();
    expect(useStore.getState().updater.status).toBe("idle");
  });

  test("given no update available, when checkForUpdates, then status is idle", async () => {
    mockCheck.mockResolvedValue(null as any);
    await useStore.getState().checkForUpdates();
    expect(useStore.getState().updater.status).toBe("idle");
    expect(useStore.getState().updaterCheckResult).toBeNull();
  });

  test("given update available, when checkForUpdates, then status is available with notes", async () => {
    mockCheck.mockResolvedValue({
      version: "1.2.3",
      body: "- Feature A\n- Bug fix B\n# Header",
      downloadAndInstall: vi.fn(),
    } as any);
    await useStore.getState().checkForUpdates();

    const { updater, updaterCheckResult } = useStore.getState();
    expect(updater.status).toBe("available");
    expect(updater.version).toBe("1.2.3");
    expect(updater.notes).toEqual(["Feature A", "Bug fix B"]);
    expect(updaterCheckResult).not.toBeNull();
  });

  test("given check throws, when checkForUpdates, then status is unavailable", async () => {
    mockCheck.mockRejectedValue(new Error("network error"));
    await useStore.getState().checkForUpdates();
    expect(useStore.getState().updater.status).toBe("unavailable");
  });

  test("given update available, when downloadAndInstall, then tracks progress", async () => {
    const mockDownload = vi.fn(async (cb: any) => {
      cb({ event: "Started", data: { contentLength: 1000 } });
      cb({ event: "Progress", data: { chunkLength: 500 } });
      cb({ event: "Progress", data: { chunkLength: 500 } });
      cb({ event: "Finished", data: {} });
    });
    mockCheck.mockResolvedValue({
      version: "1.2.3",
      body: "",
      downloadAndInstall: mockDownload,
    } as any);

    await useStore.getState().checkForUpdates();
    await useStore.getState().downloadAndInstall();

    expect(useStore.getState().updater.status).toBe("ready");
    expect(mockDownload).toHaveBeenCalledOnce();
  });

  test("given no check result, when downloadAndInstall, then no-op", async () => {
    await useStore.getState().downloadAndInstall();
    expect(useStore.getState().updater.status).toBe("idle");
  });

  test("given download fails, when downloadAndInstall, then status is error", async () => {
    const mockDownload = vi.fn().mockRejectedValue(new Error("disk full"));
    mockCheck.mockResolvedValue({
      version: "1.2.3",
      body: "",
      downloadAndInstall: mockDownload,
    } as any);

    await useStore.getState().checkForUpdates();
    await useStore.getState().downloadAndInstall();

    expect(useStore.getState().updater.status).toBe("error");
    expect(useStore.getState().updater.error).toBe("Error: disk full");
  });

  test("given ready, when restartApp, then calls relaunch", async () => {
    mockRelaunch.mockResolvedValue(undefined as any);
    await useStore.getState().restartApp();
    expect(mockRelaunch).toHaveBeenCalledOnce();
  });
});
