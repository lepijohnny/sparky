# LLM Connections API

### `settings.llm.connections.list`
- **returns**: `{ connections: { id, provider, name, grant, host?, model?, thinking?, knowledge?, assistant?, createdAt }[] }`

### `settings.llm.connections.add`
- **params**: `{ provider: string, name: string, grant: "pkce" | "oauth" | "device" | "pat" | "local", host?: string }`
- **returns**: `{ connection: { id, provider, name, grant, host?, model?, thinking?, createdAt } }`

### `settings.llm.connections.update`
- **params**: `{ id: string; model?: string; thinking?: number; knowledge?: boolean; assistant?: boolean }`
- **returns**: `{ connection: { id, provider, name, grant, host?, model?, thinking?, knowledge?, assistant?, createdAt } }`

### `settings.llm.connections.remove`
- **params**: `{ id: string }`
- **returns**: `{ removed: boolean }`

### `settings.llm.default.get`
- **returns**: `{ default: { id: string, name: string } | null }`

### `settings.llm.default.set`
- **params**: `{ id: string, name: string }`
- **returns**: `{ default: { id: string, name: string } }`

## Registry

### `core.registry.list`
- **returns**: `{ providers: { id, name, authFlows, models }[] }`

### `core.registry.models`
- **params**: `{ provider: string; connectionId?: string }`
- **returns**: `{ models: { id, label, contextWindow?, supportsThinking? }[] }`

### `core.registry.validate`
- **params**: `{ provider: string; host?: string }`
- **returns**: `{ ok: boolean; error?: string }`
