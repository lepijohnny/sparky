
import { describe, expect, test } from "vitest";
import { humanizeToolTargetName } from "../userFriendlyActivityNaming";

describe("humanizeToolTargetName", () => {
  test("given svc.call:github, when humanized, then returns Calling Github", () => {
    expect(humanizeToolTargetName("app_bus_emit", "svc.call:github")).toBe("Calling Github");
  });

  test("given svc.call:brave, when humanized, then returns Calling Brave", () => {
    expect(humanizeToolTargetName("app_bus_emit", "svc.call:brave")).toBe("Calling Brave");
  });

  test("given svc.call:my_custom_service, when humanized, then returns Calling My Custom Service", () => {
    expect(humanizeToolTargetName("app_bus_emit", "svc.call:my_custom_service")).toBe("Calling My Custom Service");
  });

  test("given svc.describe:github, when humanized, then returns Exploring Github", () => {
    expect(humanizeToolTargetName("app_bus_emit", "svc.describe:github")).toBe("Exploring Github");
  });

  test("given svc.describe:another_service, when humanized, then returns Exploring Another Service", () => {
    expect(humanizeToolTargetName("app_bus_emit", "svc.describe:another_service")).toBe("Exploring Another Service");
  });

  test("given a non-service app_bus_emit target, when humanized, then returns event-friendly label", () => {
    expect(humanizeToolTargetName("app_bus_emit", "chat.list")).toBe("List Chat");
  });

  test("given a non-app_bus_emit tool, when humanized, then returns tool-friendly label", () => {
    expect(humanizeToolTargetName("app_read", "src/file.ts")).toBe("Read src/file.ts");
  });

  test("given undefined tool or target, when humanized, then returns fallback labels", () => {
    expect(humanizeToolTargetName(undefined, "target")).toBe("target");
    expect(humanizeToolTargetName("tool", undefined)).toBe("tool");
    expect(humanizeToolTargetName(undefined, undefined)).toBe("action");
  });
});
