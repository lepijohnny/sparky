# API References

Bus event documentation for managing the app through `app_bus_emit`. Each file documents one domain — its available events, parameters, and return types.

**Usage:** Always read `guidelines.md` first, then the domain-specific file before calling any bus event.

| File | Domain | Description |
|------|--------|-------------|
| [guidelines.md](guidelines.md) | General | Rules and conventions for all bus events |
| [chat.md](chat.md) | Chat | Create, rename, archive, flag, delete chats |
| [labels.md](labels.md) | Labels | Create, rename, delete, assign labels |
| [llm.md](llm.md) | LLM | List and manage LLM connections |
| [workspace.md](workspace.md) | Workspace | List, create, switch workspaces |
| [appearance.md](appearance.md) | Appearance | Themes and UI customization |
| [config.md](config.md) | Config | Low-level config reads/writes |
