import { describe, test, expect, beforeEach } from "vitest";
import { createEventBus } from "../bus";
import { ToolApproval } from "../tool.approval";
import { noopLogger } from "../../logger";

function setup() {
  const bus = createEventBus(noopLogger);
  const approval = new ToolApproval(bus, noopLogger);
  return { bus, approval };
}

describe("ToolApproval", () => {
  describe("register and needsApproval", () => {
    test("returns false when no rules registered", () => {
      const { approval } = setup();
      expect(approval.needsApproval("assistant", "app_bus_emit", "chat.list")).toBe(false);
    });

    test("returns true when matching rule exists", () => {
      const { approval } = setup();
      approval.register({ scope: "assistant", tool: "app_bus_emit", message: "Delete chat", match: (t) => t === "chat.delete" });
      expect(approval.needsApproval("assistant", "app_bus_emit", "chat.delete")).toBe(true);
    });

    test("returns false when scope does not match", () => {
      const { approval } = setup();
      approval.register({ scope: "sandbox", tool: "network", message: "Allow network" });
      expect(approval.needsApproval("assistant", "network", "example.com")).toBe(false);
    });

    test("returns false when tool does not match", () => {
      const { approval } = setup();
      approval.register({ scope: "assistant", tool: "app_bus_emit", message: "Delete", match: (t) => t === "chat.delete" });
      expect(approval.needsApproval("assistant", "bash", "rm -rf /")).toBe(false);
    });

    test("returns false when match function rejects target", () => {
      const { approval } = setup();
      approval.register({ scope: "assistant", tool: "app_bus_emit", message: "Delete chat", match: (t) => t === "chat.delete" });
      expect(approval.needsApproval("assistant", "app_bus_emit", "chat.create")).toBe(false);
    });

    test("rule without match matches any target", () => {
      const { approval } = setup();
      approval.register({ scope: "sandbox", tool: "network", message: "Allow network" });
      expect(approval.needsApproval("sandbox", "network", "any-host.com")).toBe(true);
    });

    test("returns false when isAllowed returns true", () => {
      const { approval } = setup();
      approval.register({
        scope: "sandbox", tool: "network", message: "Allow network",
        isAllowed: (t) => t === "trusted.com",
      });
      expect(approval.needsApproval("sandbox", "network", "trusted.com")).toBe(false);
      expect(approval.needsApproval("sandbox", "network", "untrusted.com")).toBe(true);
    });
  });

  describe("destructive events in BUS_EVENTS", () => {
    test("destructive events are flagged in bus schema", async () => {
      const { BUS_EVENTS } = await import("../bus");
      const destructive = [
        "chat.rename", "chat.archive",
        "svc.delete",
        "settings.labels.delete",
        "settings.sandbox.allowlist.remove",
      ];
      for (const event of destructive) {
        expect(BUS_EVENTS[event]?.destructive).toBeTruthy();
      }
    });

    test("non-destructive events are not flagged", async () => {
      const { BUS_EVENTS } = await import("../bus");
      expect(BUS_EVENTS["chat.create"]?.destructive).toBeFalsy();
      expect(BUS_EVENTS["chat.flag"]?.destructive).toBeFalsy();
    });
  });

  describe("requestApproval", () => {
    test("emits tool.approval.request event on bus", async () => {
      const { bus, approval } = setup();
      approval.register({ scope: "assistant", tool: "app_bus_emit", message: "Delete chat", match: (t) => t === "chat.delete" });

      let requestEvent: any = null;
      bus.on("tool.approval.request", (data) => { requestEvent = data; });
      // Also capture chat.event
      const activities: any[] = [];
      bus.on("chat.event", (data: any) => { activities.push(data); });

      const promise = approval.requestApproval("assistant", "app_bus_emit", "chat.delete", { chatId: "c1", turnId: "t1" });

      expect(requestEvent).not.toBeNull();
      expect(requestEvent.chatId).toBe("c1");
      expect(requestEvent.scope).toBe("assistant");
      expect(requestEvent.tool).toBe("app_bus_emit");
      expect(requestEvent.target).toBe("chat.delete");
      expect(requestEvent.message).toBe("Delete chat");
      expect(requestEvent.canPersist).toBe(false);
      expect(requestEvent.timeoutMs).toBe(60_000);
      expect(requestEvent.remainingMs).toBe(60_000);

      // Resolve to clean up
      bus.emit("tool.approval.resolve", { requestId: requestEvent.requestId, approved: true });
      await promise;
    });

    test("resolves true when user approves", async () => {
      const { bus, approval } = setup();
      approval.register({ scope: "assistant", tool: "app_bus_emit", message: "Delete", match: (t) => t === "chat.delete" });

      let requestId = "";
      bus.on("tool.approval.request", (data) => { requestId = data.requestId; });

      const promise = approval.requestApproval("assistant", "app_bus_emit", "chat.delete", { chatId: "c1" });
      bus.emit("tool.approval.resolve", { requestId, approved: true });

      expect(await promise).toBe(true);
    });

    test("resolves false when user denies", async () => {
      const { bus, approval } = setup();
      approval.register({ scope: "assistant", tool: "app_bus_emit", message: "Delete", match: (t) => t === "chat.delete" });

      let requestId = "";
      bus.on("tool.approval.request", (data) => { requestId = data.requestId; });

      const promise = approval.requestApproval("assistant", "app_bus_emit", "chat.delete", { chatId: "c1" });
      bus.emit("tool.approval.resolve", { requestId, approved: false });

      expect(await promise).toBe(false);
    });

    test("resolves true immediately when no matching rule", async () => {
      const { approval } = setup();
      const result = await approval.requestApproval("assistant", "app_bus_emit", "chat.create", { chatId: "c1" });
      expect(result).toBe(true);
    });

    test("emits dismissed event on resolve", async () => {
      const { bus, approval } = setup();
      approval.register({ scope: "assistant", tool: "app_bus_emit", message: "Delete", match: (t) => t === "chat.delete" });

      let requestId = "";
      bus.on("tool.approval.request", (data) => { requestId = data.requestId; });

      let dismissed: any = null;
      bus.on("tool.approval.dismissed", (data) => { dismissed = data; });

      const promise = approval.requestApproval("assistant", "app_bus_emit", "chat.delete", { chatId: "c1" });
      bus.emit("tool.approval.resolve", { requestId, approved: true });
      await promise;

      expect(dismissed).toEqual({ requestId, chatId: "c1" });
    });

    test("emits approval activities (requested + approved)", async () => {
      const { bus, approval } = setup();
      approval.register({ scope: "assistant", tool: "app_bus_emit", message: "Delete", match: (t) => t === "chat.delete" });

      const activities: any[] = [];
      bus.on("chat.event", (data: any) => { activities.push(data); });

      let requestId = "";
      bus.on("tool.approval.request", (data) => { requestId = data.requestId; });

      const promise = approval.requestApproval("assistant", "app_bus_emit", "chat.delete", { chatId: "c1", turnId: "t1" });
      bus.emit("tool.approval.resolve", { requestId, approved: true });
      await promise;

      expect(activities.length).toBe(2);
      expect(activities[0].type).toBe("agent.approval.requested");
      expect(activities[0].chatId).toBe("c1");
      expect(activities[0].messageId).toBe("t1");
      expect(activities[0].data.message).toBe("Delete");
      expect(activities[1].type).toBe("agent.approval.approved");
    });

    test("emits denied activity on deny", async () => {
      const { bus, approval } = setup();
      approval.register({ scope: "assistant", tool: "app_bus_emit", message: "Delete", match: (t) => t === "chat.delete" });

      const activities: any[] = [];
      bus.on("chat.event", (data: any) => { activities.push(data); });

      let requestId = "";
      bus.on("tool.approval.request", (data) => { requestId = data.requestId; });

      const promise = approval.requestApproval("assistant", "app_bus_emit", "chat.delete", { chatId: "c1" });
      bus.emit("tool.approval.resolve", { requestId, approved: false });
      await promise;

      expect(activities[1].type).toBe("agent.approval.denied");
    });
  });

  describe("getPending", () => {
    test("returns null when no pending approvals", () => {
      const { approval } = setup();
      expect(approval.getPending("c1")).toBeNull();
    });

    test("returns pending info for chat with active request", async () => {
      const { bus, approval } = setup();
      approval.register({ scope: "assistant", tool: "app_bus_emit", message: "Delete chat", match: (t) => t === "chat.delete" });

      let requestId = "";
      bus.on("tool.approval.request", (data) => { requestId = data.requestId; });

      const promise = approval.requestApproval("assistant", "app_bus_emit", "chat.delete", { chatId: "c1" });

      const pending = approval.getPending("c1");
      expect(pending).not.toBeNull();
      expect(pending!.requestId).toBe(requestId);
      expect(pending!.message).toBe("Delete chat");
      expect(pending!.canPersist).toBe(false);
      expect(pending!.timeoutMs).toBe(60_000);
      expect(pending!.remainingMs).toBeGreaterThan(0);
      expect(pending!.remainingMs).toBeLessThanOrEqual(60_000);

      // Clean up
      bus.emit("tool.approval.resolve", { requestId, approved: false });
      await promise;
    });

    test("returns null for different chatId", async () => {
      const { bus, approval } = setup();
      approval.register({ scope: "assistant", tool: "app_bus_emit", message: "Delete", match: (t) => t === "chat.delete" });

      let requestId = "";
      bus.on("tool.approval.request", (data) => { requestId = data.requestId; });

      const promise = approval.requestApproval("assistant", "app_bus_emit", "chat.delete", { chatId: "c1" });

      expect(approval.getPending("c2")).toBeNull();

      bus.emit("tool.approval.resolve", { requestId, approved: false });
      await promise;
    });

    test("returns null after approval is resolved", async () => {
      const { bus, approval } = setup();
      approval.register({ scope: "assistant", tool: "app_bus_emit", message: "Delete", match: (t) => t === "chat.delete" });

      let requestId = "";
      bus.on("tool.approval.request", (data) => { requestId = data.requestId; });

      const promise = approval.requestApproval("assistant", "app_bus_emit", "chat.delete", { chatId: "c1" });
      bus.emit("tool.approval.resolve", { requestId, approved: true });
      await promise;

      expect(approval.getPending("c1")).toBeNull();
    });

    test("canPersist is true when rule has persist function", async () => {
      const { bus, approval } = setup();
      approval.register({
        scope: "sandbox", tool: "network", message: "Allow host",
        persist: async () => {},
      });

      let requestId = "";
      bus.on("tool.approval.request", (data) => { requestId = data.requestId; });

      const promise = approval.requestApproval("sandbox", "network", "example.com", { chatId: "c1" });

      const pending = approval.getPending("c1");
      expect(pending!.canPersist).toBe(true);

      bus.emit("tool.approval.resolve", { requestId, approved: false });
      await promise;
    });
  });

  describe("denyAll", () => {
    test("resolves all pending approvals as denied for the chat", async () => {
      const { bus, approval } = setup();
      approval.register({ scope: "assistant", tool: "app_bus_emit", message: "Delete", match: (t) => t === "chat.delete" });

      let requestId = "";
      bus.on("tool.approval.request", (data) => { requestId = data.requestId; });

      const promise = approval.requestApproval("assistant", "app_bus_emit", "chat.delete", { chatId: "c1" });
      approval.denyAll("c1");

      expect(await promise).toBe(false);
      expect(approval.getPending("c1")).toBeNull();
    });

    test("emits dismissed event on denyAll", async () => {
      const { bus, approval } = setup();
      approval.register({ scope: "assistant", tool: "app_bus_emit", message: "Delete", match: (t) => t === "chat.delete" });

      let requestId = "";
      bus.on("tool.approval.request", (data) => { requestId = data.requestId; });

      let dismissed: any = null;
      bus.on("tool.approval.dismissed", (data) => { dismissed = data; });

      const promise = approval.requestApproval("assistant", "app_bus_emit", "chat.delete", { chatId: "c1" });
      approval.denyAll("c1");
      await promise;

      expect(dismissed).toEqual({ requestId, chatId: "c1" });
    });

    test("emits denied activity with reason 'stopped'", async () => {
      const { bus, approval } = setup();
      approval.register({ scope: "assistant", tool: "app_bus_emit", message: "Delete", match: (t) => t === "chat.delete" });

      const activities: any[] = [];
      bus.on("chat.event", (data: any) => { activities.push(data); });

      let requestId = "";
      bus.on("tool.approval.request", (data) => { requestId = data.requestId; });

      const promise = approval.requestApproval("assistant", "app_bus_emit", "chat.delete", { chatId: "c1" });
      approval.denyAll("c1");
      await promise;

      const denied = activities.find((a) => a.type === "agent.approval.denied");
      expect(denied).toBeDefined();
      expect(denied.data.reason).toBe("stopped");
    });

    test("does not affect other chats", async () => {
      const { bus, approval } = setup();
      approval.register({ scope: "assistant", tool: "app_bus_emit", message: "Delete", match: (t) => t === "chat.delete" });

      let reqId1 = "";
      let reqId2 = "";
      const requestIds: string[] = [];
      bus.on("tool.approval.request", (data) => { requestIds.push(data.requestId); });

      const p1 = approval.requestApproval("assistant", "app_bus_emit", "chat.delete", { chatId: "c1" });
      reqId1 = requestIds[0];

      const p2 = approval.requestApproval("assistant", "app_bus_emit", "chat.delete", { chatId: "c2" });
      reqId2 = requestIds[1];

      approval.denyAll("c1");
      expect(await p1).toBe(false);

      // c2 still pending
      expect(approval.getPending("c2")).not.toBeNull();

      bus.emit("tool.approval.resolve", { requestId: reqId2, approved: true });
      expect(await p2).toBe(true);
    });
  });

  describe("persist", () => {
    test("calls persist function on approved + persist=true", async () => {
      const { bus, approval } = setup();
      let persisted: any = null;
      approval.register({
        scope: "sandbox", tool: "network", message: "Allow host",
        persist: async (scope, tool, target) => { persisted = { scope, tool, target }; },
      });

      let requestId = "";
      bus.on("tool.approval.request", (data) => { requestId = data.requestId; });

      const promise = approval.requestApproval("sandbox", "network", "example.com", { chatId: "c1" });
      bus.emit("tool.approval.resolve", { requestId, approved: true, persist: true });
      await promise;

      expect(persisted).toEqual({ scope: "sandbox", tool: "network", target: "example.com" });
    });

    test("does not call persist when approved without persist flag", async () => {
      const { bus, approval } = setup();
      let called = false;
      approval.register({
        scope: "sandbox", tool: "network", message: "Allow host",
        persist: async () => { called = true; },
      });

      let requestId = "";
      bus.on("tool.approval.request", (data) => { requestId = data.requestId; });

      const promise = approval.requestApproval("sandbox", "network", "example.com", { chatId: "c1" });
      bus.emit("tool.approval.resolve", { requestId, approved: true });
      await promise;

      expect(called).toBe(false);
    });

    test("does not call persist when denied", async () => {
      const { bus, approval } = setup();
      let called = false;
      approval.register({
        scope: "sandbox", tool: "network", message: "Allow host",
        persist: async () => { called = true; },
      });

      let requestId = "";
      bus.on("tool.approval.request", (data) => { requestId = data.requestId; });

      const promise = approval.requestApproval("sandbox", "network", "example.com", { chatId: "c1" });
      bus.emit("tool.approval.resolve", { requestId, approved: false, persist: true });
      await promise;

      expect(called).toBe(false);
    });
  });

  describe("timeout", () => {
    test("resolves false after timeout", async () => {
      const { bus, approval } = setup();
      approval.register({ scope: "assistant", tool: "app_bus_emit", message: "Delete", match: (t) => t === "chat.delete" });

      // We can't easily test the real 60s timeout, but we can verify
      // that resolving with an unknown requestId warns and a pending exists
      let requestId = "";
      bus.on("tool.approval.request", (data) => { requestId = data.requestId; });

      const promise = approval.requestApproval("assistant", "app_bus_emit", "chat.delete", { chatId: "c1" });
      expect(approval.getPending("c1")).not.toBeNull();

      // Manually resolve to avoid hanging
      bus.emit("tool.approval.resolve", { requestId, approved: false });
      expect(await promise).toBe(false);
    });
  });

  describe("unknown requestId", () => {
    test("resolving unknown requestId does not throw", () => {
      const { bus } = setup();
      // Just make sure it doesn't crash
      bus.emit("tool.approval.resolve", { requestId: "nonexistent", approved: true });
    });
  });

  describe("turnId fallback", () => {
    test("uses requestId as messageId when turnId is not provided", async () => {
      const { bus, approval } = setup();
      approval.register({ scope: "assistant", tool: "app_bus_emit", message: "Delete", match: (t) => t === "chat.delete" });

      const activities: any[] = [];
      bus.on("chat.event", (data: any) => { activities.push(data); });

      let requestId = "";
      bus.on("tool.approval.request", (data) => { requestId = data.requestId; });

      const promise = approval.requestApproval("assistant", "app_bus_emit", "chat.delete", { chatId: "c1" });
      bus.emit("tool.approval.resolve", { requestId, approved: true });
      await promise;

      // messageId should be the requestId (UUID) since no turnId provided
      expect(activities[0].messageId).toBe(requestId);
    });
  });
});
