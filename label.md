# System Labels

Invisible labels applied automatically by the app for UI purposes only.

## Motivation

System chats like "Permission Assistant" and "Connection Assistant" are created by the app, not the user. They should be visually distinguishable in the chat list without polluting the user's label system.

## Design

### System Label Properties
- Prefixed with `_` (e.g., `_permission`, `_connection`, `_skills`, `_routine`)
- Not shown in label filter/search sidebar
- Not shown in label picker when manually labeling chats
- Not editable or deletable by the user
- Rendered as a subtle badge in the chat list (muted color, no background)

### Assignment
- Auto-applied when system chats are created (`createSystem()`)
- `_permission` — Permission Assistant chats
- `_connection` — Connection setup chats
- `_skills` — Skills Assistant chats
- `_routine` — Routine-triggered chats (future)

### Storage
- Same `labels` JSON array on the chat row — no schema change
- Filter queries exclude `_` prefixed labels from counts and sidebar
- `getChatCounts()` skips system labels
- `getChats({ labelId })` never receives a system label ID

### UI Rendering
- Chat list: show system label as small italic text or icon, muted color
- Chat detail header (above rich input): hide system labels
- Label picker: filter out `_` prefixed labels
- Sidebar label section: filter out `_` prefixed labels
- Search: system labels not searchable

### Constants
```typescript
const SYSTEM_LABELS: Record<string, { id: string; name: string; icon?: string }> = {
  connection: { id: "_connection", name: "Connection" },
  permissions: { id: "_permission", name: "Permission" },
  skills: { id: "_skills", name: "Skills" },
  routine: { id: "_routine", name: "Routine" },
};

function isSystemLabel(id: string): boolean {
  return id.startsWith("_");
}
```

## Changes Required

### Server
- `chat.crud.ts` `createSystem()` — auto-assign system label based on kind
- `chat.db.ts` `getChatCounts()` — exclude `_` prefixed from label counts
- No new tables or migrations

### Frontend
- `ChatList.tsx` — render system labels differently (muted, no background)
- Label picker — filter out `isSystemLabel`
- Sidebar label filter — filter out `isSystemLabel`
- Store `getChatCounts()` — skip system labels in counts
