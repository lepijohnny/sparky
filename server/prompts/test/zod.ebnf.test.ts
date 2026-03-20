import { describe, test, expect } from "vitest";
import { z } from "zod/v4";
import { schemaToEbnf, defineGrammar, entry, registerRoleGrammar, renderRoleGrammars } from "../zod.ebnf";

describe("schemaToEbnf", () => {
  test("given simple object, then produces correct EBNF", () => {
    const schema = z.object({
      name: z.string().describe("The name"),
      age: z.number().describe("The age"),
    });
    const ebnf = schemaToEbnf("person", schema);
    expect(ebnf).toContain("person");
    expect(ebnf).toContain('"name"');
    expect(ebnf).toContain('"age"');
    expect(ebnf).toContain("string");
    expect(ebnf).toContain("number");
  });

  test("given enum, then lists values", () => {
    const schema = z.object({
      mode: z.enum(["read", "write", "execute"]),
    });
    const ebnf = schemaToEbnf("config", schema);
    expect(ebnf).toContain('"read"');
    expect(ebnf).toContain('"write"');
    expect(ebnf).toContain('"execute"');
  });

  test("given optional field, then wraps in brackets", () => {
    const schema = z.object({
      name: z.string(),
      icon: z.string().optional(),
    });
    const ebnf = schemaToEbnf("item", schema);
    expect(ebnf).toContain('[ \'"icon":\'');
  });

  test("given discriminated union, then uses literal values as branch names", () => {
    const schema = z.discriminatedUnion("strategy", [
      z.object({ strategy: z.literal("bearer"), token: z.string() }),
      z.object({ strategy: z.literal("header"), header: z.string(), token: z.string() }),
    ]);
    const ebnf = schemaToEbnf("auth", schema);
    expect(ebnf).toContain("auth_bearer");
    expect(ebnf).toContain("auth_header");
  });

  test("given array, then produces list syntax", () => {
    const schema = z.object({
      tags: z.array(z.string()),
    });
    const ebnf = schemaToEbnf("doc", schema);
    expect(ebnf).toContain("'['");
    expect(ebnf).toContain("']'");
  });

  test("given trust rule schema, then produces valid EBNF with descriptions", () => {
    const TrustScope = z.enum(["read", "write", "bash", "bus"]).describe("Trust scope");
    const TrustList = z.enum(["allow", "deny", "ask"]).describe("Rule list");
    const schema = z.object({
      scope: TrustScope,
      list: TrustList,
      label: z.string().min(1).describe("Human-readable description"),
      pattern: z.string().min(1).describe("Regex pattern"),
    }).describe("Trust rule");

    const ebnf = schemaToEbnf("rule", schema);
    expect(ebnf).toContain('"scope"');
    expect(ebnf).toContain('"read"');
    expect(ebnf).toContain('"bash"');
    expect(ebnf).toContain('"allow"');
    expect(ebnf).toContain('"deny"');
    expect(ebnf).toContain("Trust scope");
    expect(ebnf).toContain("Regex pattern");
  });
});

describe("grammar registry", () => {
  test("given registered grammar, when rendering, then includes title and EBNF block", () => {
    const schema = z.object({
      name: z.string(),
      value: z.number(),
    });

    registerRoleGrammar("test_role", defineGrammar("Test model", [
      entry("item", schema),
    ]));

    const result = renderRoleGrammars("test_role");
    expect(result).toContain("### Test model (EBNF — auto-generated from schema)");
    expect(result).toContain("```ebnf");
    expect(result).toContain('"name"');
    expect(result).toContain('"value"');
  });

  test("given no registered grammar, when rendering, then returns undefined", () => {
    expect(renderRoleGrammars("nonexistent_role")).toBeUndefined();
  });

  test("given multiple grammars for role, when rendering, then includes all", () => {
    const a = z.object({ x: z.string() });
    const b = z.object({ y: z.number() });

    registerRoleGrammar("multi_role", defineGrammar("First", [entry("alpha", a)]));
    registerRoleGrammar("multi_role", defineGrammar("Second", [entry("beta", b)]));

    const result = renderRoleGrammars("multi_role")!;
    expect(result).toContain("### First");
    expect(result).toContain("### Second");
    expect(result).toContain('"x"');
    expect(result).toContain('"y"');
  });
});
