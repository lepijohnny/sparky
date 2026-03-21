# Workspace API

### `settings.workspace.list`
- **returns**: `{ workspaces: { id: string, name: string, path: string, createdAt: string }[] }`

### `settings.workspace.add`
- **params**: `{ name: string }`
- **returns**: `{ workspace: { id: string, name: string, path: string, createdAt: string } }`

### `settings.workspace.remove`
- **params**: `{ id: string }`
- **returns**: `{ removed: boolean }`

### `settings.workspace.active.get`
- **returns**: `{ activeWorkspace: string | null }`

### `settings.workspace.active.set`
- **params**: `{ id: string }`
- **returns**: `{ activeWorkspace: string }`
