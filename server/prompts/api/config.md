# Config API

Low-level config access. **Prefer dedicated bus events** (e.g. `settings.labels.create`) over raw config writes when available.

### `core.config.get`
- **params**: `{ key: string }` — e.g. `"llmDefault"`, `"labels"`, `"llms"`, `"activeTheme"`, `"activeWorkspace"`, `"workspaces"`, `"allowlist"`
- **returns**: The value for the key, or `null` if not set

### `core.config.set`
- **params**: `{ key: string, value: any }`
- **returns**: `{ ok: boolean }`
- **note**: Never use this for keys that have dedicated bus events.

## Environment

### `settings.environment.list`
- **returns**: `{ entries: { key: string, hasValue: boolean }[] }`
