import { z } from "zod/v4";
import type { EventBus } from "./bus";
import type { TrustStore } from "./trust";

const TrustScope = z.enum(["read", "write", "bash", "bus"]).describe("Trust scope: read/write gate file paths, bash gates shell commands, bus gates app events");
const TrustList = z.enum(["allow", "deny", "ask"]).describe("Rule list: allow auto-approves, deny blocks, ask prompts the user");
const TrustMode = z.enum(["read", "write", "execute"]).describe("Permission mode: read = browse only, write = read + file edits, execute = full access including shell");

const RuleAddSchema = z.object({
  scope: TrustScope,
  list: TrustList,
  label: z.string().min(1).describe("Human-readable description of what this rule does, e.g. 'Block .env files'"),
  pattern: z.string().min(1).describe("Regex pattern matched against the target — file paths for read/write, command strings for bash, event names for bus"),
}).describe("Add a trust rule to control what the agent can access");

const RuleRemoveSchema = z.object({
  scope: TrustScope,
  list: TrustList,
  pattern: z.string().min(1).describe("Exact pattern string of the rule to remove"),
}).describe("Remove an existing trust rule by its pattern");

export function registerTrustBus(bus: EventBus, trust: TrustStore, broadcast: (route: string, data: unknown) => void) {
  const changed = () => broadcast("trust.changed", trust.data());

  bus.on("trust.mode.get", () => {
    return { mode: trust.data().mode };
  });

  bus.on("trust.mode.set", (data) => {
    const { mode } = z.object({ mode: TrustMode }).parse(data);
    trust.setMode(mode);
    changed();
    return { ok: true };
  });

  bus.on("trust.data.get", () => {
    return trust.data();
  });

  bus.on("trust.rule.add", (data) => {
    const { scope, list, label, pattern } = RuleAddSchema.parse(data);
    trust.addRule(scope, list, { label, pattern, addedAt: Date.now() });
    changed();
    broadcast("trust.rule.added", { scope, list, label, pattern });
    return { ok: true };
  });

  bus.on("trust.rule.remove", (data) => {
    const { scope, list, pattern } = RuleRemoveSchema.parse(data);
    trust.removeRule(scope, list, pattern);
    changed();
    return { ok: true };
  });

  bus.on("trust.reset", () => {
    trust.reset();
    changed();
    return { ok: true };
  });

  bus.on("trust.clear", () => {
    trust.clear();
    changed();
    return { ok: true };
  });
}
