import type { AgentTools } from "../core/agent.types";
import type { PermissionMode } from "../core/trust";
import type { RoleDef } from "../prompts/prompt.role";
import { createToolSet } from "./tool.registry";
import type { ToolContext, ToolDef } from "./tool.registry";
import { busEmit } from "./tool.bus.emit";
import { read } from "./tool.read";
import { glob } from "./tool.glob";
import { grep } from "./tool.grep";
import { write } from "./tool.write";
import { edit } from "./tool.edit";
import { bash } from "./tool.bash";
import { webSearch } from "./tool.web.search";
import { webRead } from "./tool.web.read";

export type { ToolContext } from "./tool.registry";
export { createToolSet } from "./tool.registry";

const ALL_TOOLS: Record<string, ToolDef> = {
  app_bus_emit: busEmit,
  app_read: read,
  app_glob: glob,
  app_grep: grep,
  app_write: write,
  app_edit: edit,
  app_bash: bash,
  app_web_search: webSearch,
  app_web_read: webRead,
};

const MODE_TOOLS: Record<PermissionMode, Set<string>> = {
  read: new Set(["app_read", "app_glob", "app_grep", "app_bus_emit", "app_web_search", "app_web_read"]),
  write: new Set(["app_read", "app_glob", "app_grep", "app_write", "app_edit", "app_bus_emit", "app_web_search", "app_web_read"]),
  execute: new Set(["app_read", "app_glob", "app_grep", "app_write", "app_edit", "app_bash", "app_bus_emit", "app_web_search", "app_web_read"]),
};

export function createRoleToolSet(role: RoleDef, ctx: ToolContext, options?: { webSearch?: string }): AgentTools {
  const mode = ctx.trust.data().mode;
  const allowed = MODE_TOOLS[mode];

  const tools = role.meta.tools
    .filter((name) => {
      if (!allowed.has(name)) return false;

      return true;
    })
    .map((name) => ALL_TOOLS[name])
    .filter(Boolean);
  return createToolSet(tools, ctx);
}
