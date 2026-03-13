# Chat API

### `chat.counts`
- **returns**: `{ chats: number; flagged: number; archived: number; labeled: number; labels: Record<string, number> }`

### `chat.list`
- **returns**: `{ chats: Chat[] }`
```
app_bus_emit("chat.list")
→ { "chats": [{ "id": "chat-123", "name": "Travel Plans" }, { "id": "chat-456", "name": "SQLite Tips" }] }
```

### `chat.list.flagged` / `chat.list.archived` / `chat.list.labeled`
- **params** (labeled only): `{ labelId?: string }`
- **returns**: `{ chats: Chat[] }`

### `chat.create`
- **params**: `{ name?: string }`
- **returns**: `{ chat: Chat }`
```
app_bus_emit("chat.create", { "name": "Project Ideas" })
→ { "chat": { "id": "chat-789", "name": "Project Ideas" } }
```

### `chat.delete`
- **params**: `{ id: string }`
- **returns**: `{ deleted: boolean }`
```
app_bus_emit("chat.list")  →  find ID for "Travel Plans"  →  "chat-456"
app_bus_emit("chat.delete", { "id": "chat-456" })
→ { "deleted": true }
```

### `chat.rename`
- **params**: `{ id: string; name: string }`
- **returns**: `{ chat: Chat }`
```
app_bus_emit("chat.list")  →  find ID  →  "chat-456"
app_bus_emit("chat.rename", { "id": "chat-456", "name": "Trip to Japan" })
```

### `chat.flag`
- **params**: `{ id: string; flagged: boolean }`
- **returns**: `{ chat: Chat }`
```
app_bus_emit("chat.flag", { "id": "chat-456", "flagged": true })
app_bus_emit("chat.flag", { "id": "chat-456", "flagged": false })
```

### `chat.archive`
- **params**: `{ id: string; archived: boolean }`
- **returns**: `{ chat: Chat }`
```
app_bus_emit("chat.archive", { "id": "chat-456", "archived": true })
```

### `chat.label`
- **params**: `{ id: string; labels: string[] }`
- **returns**: `{ chat: Chat }`
- **note**: `labels` is an array of **label IDs (UUIDs)**, never names. Use `settings.labels.list` to get IDs. To add a label, include all existing IDs plus the new one. To remove, omit it.
```
# Add labels — keep existing, append new
app_bus_emit("settings.labels.list")  →  bug="aaa-111", urgent="bbb-222"
app_bus_emit("chat.list")  →  "Travel Plans" id="chat-456", existing labels=["ccc-333"]
app_bus_emit("chat.label", { "id": "chat-456", "labels": ["ccc-333", "aaa-111", "bbb-222"] })

# Remove a label — omit it from array
app_bus_emit("chat.label", { "id": "chat-456", "labels": ["ccc-333"] })
```

### `chat.model`
- **params**: `{ id: string; provider: string; model: string }`
- **returns**: `{ chat: Chat }`

### `chat.get.id`
- **params**: `{ id: string }`
- **returns**: `{ chat: Chat; entries: ChatEntry[]; hasMore: boolean; streaming: boolean }`

### `chat.entries`
- **params**: `{ chatId: string; before?: number }`
- **returns**: `{ entries: ChatEntry[]; hasMore: boolean }`

### `chat.ask`
- **params**: `{ chatId: string; content: string }`
- **returns**: `{ ok: boolean }`

### `chat.stop`
- **params**: `{ chatId: string }`
- **returns**: `{ ok: boolean }`

### `chat.search`
- **params**: `{ query: string; flagged?: boolean; archived?: boolean; labelId?: string }`
- **returns**: `{ results: { chat: Chat; matchCount: number }[] }`

### `chat.system.ask`
- **params**: `{ content: string }`
- **returns**: `{ chatId: string }`

## Anchors

### `chat.anchor.add`
- **params**: `{ chatId: string; rowid: number }`
- **returns**: `{ ok: true }`
- **note**: Pins a message — always included in context window.
```
app_bus_emit("chat.get.id", { "id": "chat-456" })  →  find rowid 12
app_bus_emit("chat.anchor.add", { "chatId": "chat-456", "rowid": 12 })
```

### `chat.anchor.remove`
- **params**: `{ chatId: string; rowid: number }`
- **returns**: `{ ok: true }`
```
app_bus_emit("chat.anchored", { "chatId": "chat-456" })  →  find rowid
app_bus_emit("chat.anchor.remove", { "chatId": "chat-456", "rowid": 12 })
```

### `chat.anchored`
- **params**: `{ chatId: string }`
- **returns**: `{ entries: ChatEntry[] }`

## Types

**Chat**: `{ id, name, model, provider, flagged?, archived?, role?, labels?, createdAt, updatedAt }`
