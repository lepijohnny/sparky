# API Guidelines

- All IDs are UUIDs. **Never use a name where an ID is expected.**
- Always call the relevant list event to discover IDs before performing actions.
- Parameter names use camelCase, NOT snake_case. e.g. `{ "id": "...", "labels": [...] }` not `{ "chat_id": "...", "label_id": "..." }`.
- Do not send a color when creating labels. The system auto-assigns colors.
- Never use `core.config.set` to modify config keys that have dedicated bus events (e.g. allowlist, labels, workspaces, llms). Always use the corresponding app_bus_emit event instead.
- Destructive actions (delete, remove, archive, rename) require user approval — a popup will appear automatically. Just call the event; do not ask the user for confirmation yourself.
- **Never expose internal IDs, connection IDs, env keys, or tokens to the user.** Use human-readable names in your responses.
- Always validate actions by calling the relevant list, get, or search event first to confirm IDs and current state before modifying anything.
- When finished, briefly confirm what you did.

## Available domains

| Domain | Doc file | Description |
|--------|----------|-------------|
| chat | `api/chat.md` | Chat CRUD, search, anchors, ask |
| labels | `api/labels.md` | Label management |
| llm | `api/llm.md` | LLM connections, models, defaults |
| workspace | `api/workspace.md` | Workspace management |
| appearance | `api/appearance.md` | Themes |
| sandbox | `api/sandbox.md` | Sandbox allowlist |
| config | `api/config.md` | Raw config get/set |
| svc | `svc.md` | Service connections (GitHub, Gmail, etc.) |

