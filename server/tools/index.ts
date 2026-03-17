import type { AgentTools } from "../core/agent.types";
import type { RoleDef } from "../prompts/prompt.role";
import { createToolSet } from "./tool.registry";
import type { ToolContext, ToolDef } from "./tool.registry";
import { busEmit } from "./tool.bus.emit";
import { read } from "./tool.read";
import { glob } from "./tool.glob";
import { grep } from "./tool.grep";
import { webSearch } from "./tool.web.search";
import { webRead } from "./tool.web.read";

export type { ToolContext } from "./tool.registry";
export { createToolSet } from "./tool.registry";

const ALL_TOOLS: Record<string, ToolDef> = {
  app_bus_emit: busEmit,
  app_read: read,
  app_glob: glob,
  app_grep: grep,
  app_web_search: webSearch,
  app_web_read: webRead,
};

const WEB_SEARCH_TOOLS = new Set(["app_web_search", "app_web_read"]);

export function createRoleToolSet(role: RoleDef, ctx: ToolContext, options?: { webSearch?: string }): AgentTools {
  const tools = role.meta.tools
    .filter((name) => {
      if (!WEB_SEARCH_TOOLS.has(name)) return true;
      return options?.webSearch === "local";
    })
    .map((name) => ALL_TOOLS[name])
    .filter(Boolean);
  return createToolSet(tools, ctx);
}
