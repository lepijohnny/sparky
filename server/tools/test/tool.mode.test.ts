import { describe, test, expect } from "vitest";
import { createRoleToolSet } from "../index";
import type { ToolContext } from "../tool.registry";
import { createEventBus } from "../../core/bus";
import { createNoopTrustStore } from "../../core/trust";
import type { PermissionMode } from "../../core/trust";
import { noopLogger } from "../../logger";
import { loadRole } from "../../prompts/prompt.role";

const mockApprovalCtx = { chatId: "c1", turnId: "t1", requestApproval: async () => true };

function makeCtx(mode: PermissionMode): ToolContext {
  const trust = createNoopTrustStore();
  trust.setMode(mode);
  return {
    bus: createEventBus(noopLogger),
    log: noopLogger,
    role: "sparky",
    signal: new AbortController().signal,
    approvalCtx: mockApprovalCtx,
    trust,
  };
}

function toolNames(mode: PermissionMode): string[] {
  const role = loadRole("sparky");
  const tools = createRoleToolSet(role, makeCtx(mode));
  return tools.defs.map((d) => d.name).sort();
}

describe("mode gating", () => {
  test("given read mode, then write and execute tools are excluded", () => {
    const names = toolNames("read");
    expect(names).toContain("app_read");
    expect(names).toContain("app_glob");
    expect(names).toContain("app_grep");
    expect(names).toContain("app_bus_emit");
    expect(names).not.toContain("app_write");
    expect(names).not.toContain("app_edit");
    expect(names).not.toContain("app_bash");
  });

  test("given write mode, then write tools are included but bash is excluded", () => {
    const names = toolNames("write");
    expect(names).toContain("app_read");
    expect(names).toContain("app_write");
    expect(names).toContain("app_edit");
    expect(names).not.toContain("app_bash");
  });

  test("given execute mode, then all tools are included", () => {
    const names = toolNames("execute");
    expect(names).toContain("app_read");
    expect(names).toContain("app_write");
    expect(names).toContain("app_edit");
    expect(names).toContain("app_bash");
    expect(names).toContain("app_bus_emit");
  });
});
