import { describe, it, expect } from "vitest";
import { resolveServiceMentions } from "../serviceResolver";
import type { ServiceInfo } from "../../types/service";

function svc(id: string, label: string): ServiceInfo {
  return { id, label, baseUrl: "", auth: { strategy: "bearer" }, endpoints: [] };
}

const services = [
  svc("telegram", "Telegram"),
  svc("github_mcp", "Github MCP"),
  svc("gmail", "Gmail"),
  svc("github_mcp_2", "Github MCP 2"),
];

describe("resolveServiceMentions", () => {
  it("given empty services, when resolving, then returns empty", () => {
    expect(resolveServiceMentions("hello @telegram", [])).toEqual([]);
  });

  it("given no mentions, when resolving, then returns empty", () => {
    expect(resolveServiceMentions("hello world", services)).toEqual([]);
  });

  it("given @Telegram mention, when resolving, then matches by label", () => {
    expect(resolveServiceMentions("send Hi to @Telegram", services)).toEqual(["telegram"]);
  });

  it("given case-insensitive mention, when resolving, then matches", () => {
    expect(resolveServiceMentions("send Hi to @telegram", services)).toEqual(["telegram"]);
  });

  it("given multi-word label, when resolving, then matches longest first", () => {
    expect(resolveServiceMentions("list repos on @Github MCP", services)).toEqual(["github_mcp"]);
  });

  it("given longer label present, when resolving, then matches only the longer one", () => {
    expect(resolveServiceMentions("use @Github MCP 2 for this", services)).toEqual(["github_mcp_2"]);
  });

  it("given label without @, when resolving, then still matches", () => {
    expect(resolveServiceMentions("check Gmail inbox", services)).toEqual(["gmail"]);
  });

  it("given multiple mentions, when resolving, then returns all matched", () => {
    expect(resolveServiceMentions("send Telegram message and check Gmail", services)).toEqual(["telegram", "gmail"]);
  });

  it("given partial label, when resolving, then does not match", () => {
    expect(resolveServiceMentions("send tele message", services)).toEqual([]);
  });

  it("given empty message, when resolving, then returns empty", () => {
    expect(resolveServiceMentions("", services)).toEqual([]);
  });
});
