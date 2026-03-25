import type { StateCreator } from "zustand";
import type { AppState } from "./index";
import { throttle } from "../lib/throttle";
import { check } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";

interface UpdateState {
  status: "idle" | "checking" | "available" | "downloading" | "ready" | "error" | "unavailable";
  version?: string;
  notes?: string[];
  progress?: number;
  error?: string;
}

export interface UpdaterSlice {
  updater: UpdateState;
  updaterCheckResult: any;
  checkForUpdates: () => Promise<void>;
  downloadAndInstall: () => Promise<void>;
  restartApp: () => Promise<void>;
}

function parseNotes(body: string): string[] {
  return body
    .split("\n")
    .map((l) => l.replace(/^[-*]\s+/, "").trim())
    .filter((l) => l.length > 0 && !l.startsWith("#"));
}

export const createUpdaterSlice: StateCreator<AppState, [], [], UpdaterSlice> = (set, get) => ({
  updater: { status: "idle" },
  updaterCheckResult: null,

  async checkForUpdates() {
    if (!window.__TAURI_INTERNALS__) {
      set({ updater: { status: "idle" } });
      return;
    }
    set({ updater: { status: "checking" } });
    const res = await throttle(() => check(), 600);
    if (!res.ok) {
      set({ updater: { status: "unavailable" }, updaterCheckResult: null });
      return;
    }
    if (!res.result) {
      set({ updater: { status: "idle" }, updaterCheckResult: null });
      return;
    }
    const notes = res.result.body ? parseNotes(res.result.body) : [];
    set({ updater: { status: "available", version: res.result.version, notes }, updaterCheckResult: res.result });
  },

  async downloadAndInstall() {
    const result = get().updaterCheckResult;
    if (!result) return;
    set({ updater: { ...get().updater, status: "downloading", progress: 0 } });
    try {
      let total = 0;
      let downloaded = 0;
      await result.downloadAndInstall((event: any) => {
        if (event.event === "Started" && event.data.contentLength) {
          total = event.data.contentLength;
        } else if (event.event === "Progress") {
          downloaded += event.data.chunkLength;
          if (total > 0) set({ updater: { ...get().updater, progress: Math.round((downloaded / total) * 100) } });
        } else if (event.event === "Finished") {
          set({ updater: { ...get().updater, status: "ready" } });
        }
      });
    } catch (err) {
      set({ updater: { status: "error", error: String(err) } });
    }
  },

  async restartApp() {
    try {
      await relaunch();
    } catch {}
  },
});
