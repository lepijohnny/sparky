/**
 * Micro-framework for converting Zod schemas into EBNF grammars and
 * attaching them to role prompts.
 *
 * Supported Zod subset:
 *   object, enum, literal, string, number, boolean,
 *   array, union, discriminatedUnion, optional, default, record, lazy
 *
 * Usage:
 *   const g = defineGrammar("Rule model", [
 *     entry("rule_add", RuleAddSchema),
 *     entry("rule_remove", RuleRemoveSchema),
 *   ]);
 *   registerRoleGrammar("permissions", g);
 */

export interface GrammarEntry {
  name: string;
  schema: unknown;
}

export interface Grammar {
  title: string;
  entries: GrammarEntry[];
}

export function entry(name: string, schema: unknown): GrammarEntry {
  return { name, schema };
}

export function defineGrammar(title: string, entries: GrammarEntry[]): Grammar {
  return { title, entries };
}

const registry = new Map<string, Grammar[]>();

export function registerRoleGrammar(role: string, grammar: Grammar): void {
  const list = registry.get(role) ?? [];
  list.push(grammar);
  registry.set(role, list);
}

export function renderRoleGrammars(role: string): string | undefined {
  const grammars = registry.get(role);
  if (!grammars?.length) return undefined;

  return grammars.map((g) => {
    const body = g.entries.map((e) => schemaToEbnf(e.name, e.schema)).join("\n\n");
    return `### ${g.title} (EBNF — auto-generated from schema)\n\`\`\`ebnf\n${body}\n\`\`\``;
  }).join("\n\n");
}

interface Rule {
  name: string;
  def: string;
  comment?: string;
}

/** Convert a single Zod schema into EBNF rules. */
export function schemaToEbnf(rootName: string, schema: unknown): string {
  const rules: Rule[] = [];
  const seen = new Set<string>();

  function emit(name: string, def: string, comment?: string) {
    if (seen.has(name)) return;
    seen.add(name);
    rules.push({ name, def, comment });
  }

  function walk(name: string, s: any): string {
    const desc = getDesc(s);
    const inner = tryUnwrap(s);
    if (inner && inner !== s) return walk(name, inner);

    const type = typeName(s);

    if (type === "ZodObject" && s.shape) {
      const shape = s.shape as Record<string, unknown>;
      const fields = Object.entries(shape).map(([key, val]) => {
        const ref = walk(`${name}_${key}`, val);
        const opt = typeName(val) === "ZodOptional" || typeName(val) === "ZodDefault";
        const expr = `'"${key}":' , ${ref}`;
        return opt ? `[ ${expr} ]` : expr;
      });
      emit(name, `'{' , ${fields.join(" , ")} , '}'`, desc);
      return name;
    }

    if (type === "ZodEnum") {
      const vals = s.options ?? Object.values(s._def?.values ?? s._zod?.def?.entries ?? {});
      emit(name, `( ${(vals as string[]).map((v) => `'"${v}"'`).join(" | ")} )`, desc);
      return name;
    }

    if (type === "ZodLiteral") {
      const val = s._def?.value ?? s._zod?.def?.values?.[0];
      return `'"${val}"'`;
    }

    if (type === "ZodString") { emit(name, "string", desc); return name; }
    if (type === "ZodURL") { emit(name, "url", desc); return name; }
    if (type === "ZodNumber") { emit(name, "number", desc); return name; }
    if (type === "ZodBoolean") { emit(name, "( 'true' | 'false' )", desc); return name; }

    if (type === "ZodArray") {
      const el = s._def?.element ?? s._zod?.def?.element;
      if (el) {
        const ref = walk(`${name}_item`, el);
        emit(name, `'[' , { ${ref} , ',' } , ']'`, desc);
      }
      return name;
    }

    if (type === "ZodUnion" || type === "ZodDiscriminatedUnion") {
      const options = s._def?.options ?? s._zod?.def?.options ?? [];
      const branches = (options as unknown[]).map((opt, i) => walk(branchLabel(name, opt, i), opt));
      emit(name, branches.join(" | "), desc);
      return name;
    }

    if (type === "ZodRecord") { emit(name, `'{' , { string , ':' , value } , '}'`, desc); return name; }
    if (type === "ZodLazy") { emit(name, `${name} (* recursive *)`, desc); return name; }

    emit(name, "string", desc);
    return name;
  }

  walk(rootName, schema);

  const maxLen = Math.max(...rules.map((r) => r.name.length));
  return rules.map((r) => {
    const pad = " ".repeat(maxLen - r.name.length);
    const comment = r.comment ? `  (* ${r.comment} *)` : "";
    return `${r.name}${pad} = ${r.def} ;${comment}`;
  }).join("\n");
}

function typeName(s: any): string {
  return s?.constructor?.name ?? s?._def?.typeName ?? s?._zod?.def?.type ?? "";
}

function getDesc(s: any): string | undefined {
  return s?.description ?? s?._def?.description ?? s?._zod?.def?.description;
}

function tryUnwrap(s: any): any | null {
  const t = typeName(s);
  if (t === "ZodOptional" || t === "ZodDefault") {
    return s._def?.innerType ?? s._zod?.def?.innerType ?? null;
  }
  return null;
}

function branchLabel(parent: string, opt: any, idx: number): string {
  if (typeName(opt) === "ZodObject" && opt.shape) {
    for (const val of Object.values(opt.shape as Record<string, any>)) {
      if (typeName(val) === "ZodLiteral") {
        const v = val._def?.value ?? val._zod?.def?.values?.[0];
        if (v) return `${parent}_${v}`;
      }
    }
  }
  return `${parent}_${idx}`;
}
