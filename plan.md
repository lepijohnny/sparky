# Routines

Scheduled tasks that run automatically while the app is running.

## Architecture

### Tick Engine
- Server-side timer aligned to clock minute boundaries (`:00`, `:01`, `:02`, ...)
- `setInterval` with drift correction — calculates ms until next minute boundary
- Runs only while sidecar is alive — no background daemon
- On each tick: scan all routines, check if any should fire
- Missed ticks (app was closed) are NOT retroactively run

### Trigger Types

| Type | Description | Example |
|------|-------------|---------|
| `cron` | Cron expression (minute granularity) | `*/15 * * * *` (every 15 min) |
| `interval` | Every N minutes | `every: 60` (hourly) |
| `daily` | Specific time each day | `at: "09:00"` |
| `weekly` | Specific day + time | `day: "monday", at: "09:00"` |
| `once` | One-shot at specific datetime | `at: "2026-04-01T10:00"` |

### Routine Definition

```typescript
interface Routine {
  id: string;
  name: string;
  description?: string;
  trigger: RoutineTrigger;
  action: RoutineAction;
  enabled: boolean;
  lastRun?: string;       // ISO timestamp
  nextRun?: string;       // ISO timestamp (precomputed)
  createdAt: string;
  updatedAt: string;
}

type RoutineAction =
  | { type: "chat"; prompt: string; provider?: string; model?: string; role?: string }
  | { type: "archive"; filter: RoutineFilter }
  | { type: "flag"; flag: boolean; filter: RoutineFilter }
  | { type: "label"; labelId: string; remove?: boolean; filter: RoutineFilter };

interface RoutineFilter {
  olderThan?: number;     // days
  nameContains?: string;
  hasLabel?: string;
  archived?: boolean;
  flagged?: boolean;
}
```

### Storage
- `routines` table in `workspace.db`
- Per-workspace — each workspace has its own routines
- Run history: `routine_runs` table (routine_id, started_at, chat_id, status)

## Server

### Tick Loop (`server/routines/routine.tick.ts`)
- On startup: compute next minute boundary, `setTimeout` to align
- Then `setInterval(tick, 60_000)` with drift correction each tick
- `tick()`: query all enabled routines where `nextRun <= now`
- For each matching routine:
  1. Create a new chat (or reuse existing if configured)
  2. Send the prompt via `chat.ask`
  3. Update `lastRun`, compute + store `nextRun`
  4. Log to `routine_runs`

### Bus Events
- `routine.list` → `{ routines: Routine[] }`
- `routine.create` → `{ routine: Routine }`
- `routine.update` → `{ routine: Routine }`
- `routine.delete` → `{ id: string }`
- `routine.toggle` → `{ id: string, enabled: boolean }`
- `routine.run` → `{ id: string }` (manual trigger)
- `routine.history` → `{ id: string }` → `{ runs: RoutineRun[] }`

## Frontend

### Navigation
- New tab in sidebar below Skills: "Routines"
- Icon: `Timer` or `Clock` from lucide

### Creation Flow (Questionnaire)
- "New Routine" → opens **Routine Assistant** chat
- Agent walks through step by step:
  1. *"What should this routine do?"* → user describes the task
  2. *"How often? (every N minutes, daily, weekly)"* → user picks frequency
  3. *"What time?"* → user gives time/day
  4. *"Which model?"* → user picks or accepts default
  5. Agent shows summary: *"Got it — every day at 9:00 AM, check email and summarize, using Claude Sonnet 4. Create this routine?"*
  6. User confirms → agent calls `routine.create`
- Skips steps when user gives everything upfront: *"Check email daily at 9AM"* → jumps to summary
- Editing: same flow with pre-filled context from existing routine

### List View
- Shows all routines with: name, trigger summary, last run, next run, enabled toggle
- Empty state: "No routines yet. Create one to automate tasks."

### Detail View (read-only)
- Name + description
- Schedule: human-readable text (e.g., "Every day at 9:00 AM")
- Next run timestamp
- Action: type + prompt text + model
- Run history: timestamp, duration, status, link to chat
- "Run Now" and "Delete" buttons
- Enable/disable toggle

## Decisions

- **Chat per run**: New chat each time — keeps history clean, each run is isolated
- **Concurrency**: Unlimited — no cap on parallel routines
- **Timeout**: Same as agent turn timeout (existing config)
- **Labeling**: Deferred — will use system labels (`_routine`) once implemented
- **Notifications**: On failure only — no notification on success
