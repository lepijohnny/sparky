# Labels API

### `settings.labels.list`
- **returns**: `{ labels: { id: string, name: string, color: string }[] }`
```
app_bus_emit("settings.labels.list")
→ { "labels": [{ "id": "aaa-111", "name": "bug" }, { "id": "bbb-222", "name": "feature" }] }
```

### `settings.labels.create`
- **params**: `{ name: string; color?: string }`
- **returns**: `{ label: { id: string, name: string, color: string } }`
- **note**: Do not send a color — the system auto-assigns one.
```
app_bus_emit("settings.labels.create", { "name": "urgent" })
→ { "label": { "id": "ghi-789", "name": "urgent", "color": "#e06c75" } }
```

### `settings.labels.update`
- **params**: `{ id: string; name?: string; color?: string }`
- **returns**: `{ label: { id: string, name: string, color: string } }`

### `settings.labels.delete`
- **params**: `{ id: string }`
- **returns**: `{ deleted: boolean }`
```
app_bus_emit("settings.labels.list")  →  bug="abc-123"
app_bus_emit("settings.labels.delete", { "id": "abc-123" })
→ { "deleted": true }
```

### `settings.labels.reorder`
- **params**: `{ ids: string[] }`
- **returns**: `{ labels: { id: string, name: string, color: string }[] }`
