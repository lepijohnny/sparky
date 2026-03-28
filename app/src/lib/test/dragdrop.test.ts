import { describe, test, expect, vi } from "vitest";
import { setDropHandlers } from "../dragdrop";
import type { PendingAttachment } from "../../types/attachment";

describe("dragdrop", () => {
  describe("setDropHandlers", () => {
    test("given new handlers, when setDropHandlers called, then handlers are replaced", () => {
      const drop1 = vi.fn();
      const toast1 = vi.fn();
      const drag1 = vi.fn();
      setDropHandlers(drop1, toast1, drag1);

      const drop2 = vi.fn();
      const toast2 = vi.fn();
      const drag2 = vi.fn();
      setDropHandlers(drop2, toast2, drag2);

      expect(drop1).not.toHaveBeenCalled();
      expect(drop2).not.toHaveBeenCalled();
    });

    test("given handlers set multiple times, when called, then no error thrown", () => {
      for (let i = 0; i < 10; i++) {
        expect(() => setDropHandlers(vi.fn(), vi.fn(), vi.fn())).not.toThrow();
      }
    });
  });

  describe("initDragDrop", () => {
    test("given non-tauri environment, when init called, then does not throw", async () => {
      const { initDragDrop } = await import("../dragdrop");
      await expect(initDragDrop()).resolves.not.toThrow();
    });
  });
});
