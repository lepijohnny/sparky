# Routines API

Scheduled tasks that run automatically on a cron schedule.

### `routine.list`
- **returns**: `{ routines: Routine[] }`
```
app_bus_emit("routine.list")
→ { "routines": [{ "id": "r-123", "name": "Daily Summary", "cron": "0 9 * * *", "enabled": true }] }
```

### `routine.get`
- **params**: `{ id: string }`
- **returns**: `{ routine: Routine; runs: RoutineRun[] }`

### `routine.create`
- **params**: `{ id: string; name: string; description?: string; cron: string; once?: boolean; action: RoutineAction; enabled: boolean }`
- **returns**: `{ routine: Routine }`
```
# Create a routine that sends a daily prompt at 9am
app_bus_emit("routine.create", {
  "id": "r-daily",
  "name": "Morning Brief",
  "cron": "0 9 * * *",
  "action": { "type": "chat", "prompt": "Good morning! What's on my schedule today?" },
  "enabled": true
})
```

### `routine.update`
- **params**: `{ id: string; name?: string; description?: string; cron?: string; once?: boolean; action?: RoutineAction; enabled?: boolean }`
- **returns**: `{ routine: Routine }`
```
app_bus_emit("routine.update", { "id": "r-daily", "cron": "0 8 * * *" })
```

### `routine.delete`
- **params**: `{ id: string }`
- **returns**: `{ deleted: boolean }`

### `routine.toggle`
- **params**: `{ id: string; enabled: boolean }`
- **returns**: `{ routine: Routine }`
```
app_bus_emit("routine.toggle", { "id": "r-daily", "enabled": false })
```

### `routine.run`
- **params**: `{ id: string }`
- **returns**: `{ runId: string }`
- **note**: Manually trigger a routine immediately.

### `routine.history`
- **params**: `{ id: string; limit?: number }`
- **returns**: `{ runs: RoutineRun[] }`

## Action Types

**Chat action**: `{ type: "chat", prompt: string, provider?: string, model?: string, role?: string }`
Creates a new chat and sends the prompt.

**Archive action**: `{ type: "archive", filter: RoutineFilter }`
Archives chats matching the filter.

**Flag action**: `{ type: "flag", flag: boolean, filter: RoutineFilter }`
Flags or unflags chats matching the filter.

**Label action**: `{ type: "label", labelId: string, remove?: boolean, filter: RoutineFilter }`
Adds or removes a label from chats matching the filter.

**RoutineFilter**: `{ olderThan?: number, nameContains?: string, hasLabel?: string, archived?: boolean, flagged?: boolean }`
- `olderThan` is in days.

## Types

**Routine**: `{ id, name, description?, cron, once?, action, enabled, lastRun?, nextRun?, createdAt, updatedAt }`

**RoutineRun**: `{ id, routineId, chatId?, status, error?, startedAt, finishedAt?, durationMs? }`
- `status`: `"running"`, `"done"`, or `"error"`
