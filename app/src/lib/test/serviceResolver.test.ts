import { describe, it, expect } from "vitest";
import { resolveServiceMentions, resolveSkillMentions } from "../serviceResolver";
import type { ServiceInfo } from "../../types/service";
import type { Skill } from "../../types/skill";

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

function skill(id: string, name: string): Skill {
  return { id, name, description: "", version: "", license: "", author: "", icon: "puzzle", state: "active", source: "created", files: [], requirements: null, binsMissing: false, secretsMissing: false };
}

const skills = [
  skill("code-reviewer", "Code Reviewer"),
  skill("video-transcript-generator", "Video Transcript Generator"),
];

describe("resolveSkillMentions", () => {
  it("given no skills, when resolving, then returns empty", () => {
    expect(resolveSkillMentions("hello @Code Reviewer", [])).toEqual([]);
  });

  it("given inactive skill, when resolving, then returns empty", () => {
    const inactive = [{ ...skill("code-reviewer", "Code Reviewer"), state: "pending" as const }];
    expect(resolveSkillMentions("@Code Reviewer check this", inactive)).toEqual([]);
  });

  it("given @name mention, when resolving, then matches by name", () => {
    expect(resolveSkillMentions("@Code Reviewer check this", skills)).toEqual(["code-reviewer"]);
  });

  it("given @id mention, when resolving, then matches by id", () => {
    expect(resolveSkillMentions("@code-reviewer check this", skills)).toEqual(["code-reviewer"]);
  });

  it("given case-insensitive mention, when resolving, then matches", () => {
    expect(resolveSkillMentions("@code reviewer check", skills)).toEqual(["code-reviewer"]);
  });

  it("given no mention, when resolving, then returns empty", () => {
    expect(resolveSkillMentions("just a normal message", skills)).toEqual([]);
  });

  it("given longest name matched first, when resolving, then no partial overlap", () => {
    expect(resolveSkillMentions("@Video Transcript Generator please", skills)).toEqual(["video-transcript-generator"]);
  });
});
