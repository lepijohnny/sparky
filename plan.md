# Tools & Trust System — Plan

## Overview

Add system tools (`app_read`, `app_glob`, `app_grep`, `app_write`, `app_edit`, `app_bash`) with a permission system that gates tool visibility by mode and controls bash execution via an encrypted trust store.

## Permission Modes

| Mode | Tools exposed to LLM |
|------|---------------------|
| **Read** | `app_read`, `app_glob`, `app_grep` |
| **Write** | + `app_write`, `app_edit` |
| **Execute** | + `app_bash` |

- Default: **Read**
- Per-workspace setting, stored in `trust.enc`
- Mode selector: combo next to send button `[ Read ▾ ] [ Send ]`
- Color: Read = neutral, Write = amber, Execute = red

## Tools

### Read mode
- `app_read(path, offset?, limit?)` — read file contents, images as attachments
- `app_glob(pattern, cwd?)` — list files matching glob pattern
- `app_grep(pattern, path?, flags?)` — search file contents with regex

### Write mode
- `app_write(path, content)` — create/overwrite file
- `app_edit(path, oldText, newText)` — surgical find-and-replace

### Execute mode
- `app_bash(command, timeout?)` — run shell command, capture stdout/stderr

### Protected paths (hardcoded, unconditional)
```typescript
const PROTECTED = [/\.enc$/, /\.db$/, /\.db-wal$/, /\.db-shm$/];
```
These are blocked at tool level for `app_write`, `app_edit`, `app_bash` — no trust rules can override.

## Trust Store

### File: `~/.sparky/trust.enc`

Encrypted with same master key as `cred.enc`. Decrypted in memory by sidecar. LLM cannot read or write it — `app_read` returns gibberish, `app_write` would corrupt encryption.

### Schema

```json
{
  "mode": "read",
  "bash": {
    "allow": [
      { "label": "git status", "pattern": "^git\\s+status" },
      { "label": "npx vitest", "pattern": "^npx\\s+vitest" }
    ],
    "deny": [
      { "label": "sudo", "pattern": "\\bsudo\\b" },
      { "label": "rm -rf /", "pattern": "\\brm\\s+(-[rf]+\\s+)?/" },
      { "label": "git push --force", "pattern": "git\\s+push\\s+(-f|--force)" },
      { "label": "git reset --hard", "pattern": "git\\s+reset\\s+--hard" },
      { "label": "git clean", "pattern": "git\\s+clean\\s+-[fd]" },
      { "label": "curl pipe bash", "pattern": "curl.*\\|\\s*bash" },
      { "label": "dd", "pattern": "\\bdd\\b" },
      { "label": "mkfs", "pattern": "\\bmkfs\\b" },
      { "label": "eval", "pattern": "\\beval\\b" }
    ]
  },
  "write": {
    "deny": [
      { "label": "/etc/", "pattern": "^/etc/" },
      { "label": "/usr/", "pattern": "^/usr/" },
      { "label": "/System/", "pattern": "^/System/" },
      { "label": ".env", "pattern": "\\.env$" }
    ]
  }
}
```

### Resolution flow

```
command arrives
    ↓
mode check: tool requires write but mode=read? → tool not exposed, LLM can't call it
    ↓
protected path? → block unconditionally
    ↓
deny regex match? → block (show warning to LLM)
    ↓
allow regex match? → auto-approve, execute
    ↓
no match → prompt user:
    ┌─────────────────────────────────────┐
    │ 🛡️ app_bash                         │
    │                                     │
    │ npm install express                 │
    │                                     │
    │ [Allow Once] [Always Allow] [Deny]  │
    └─────────────────────────────────────┘
    ↓
    Allow Once  → execute, don't persist
    Always Allow → execute, append to trust.enc bash.allow
    Deny        → block, return error to LLM
```

## Bus API

```
trust.mode.get      → { mode: "read" }
trust.mode.set      → { mode: "execute" }
trust.rules.get     → { bash: { allow: [...], deny: [...] }, write: { deny: [...] } }
trust.bash.allow    → { pattern: "^git\\s+status", label: "git status" }
trust.bash.deny     → { pattern: "\\bsudo\\b", label: "sudo" }
trust.bash.remove   → { list: "allow"|"deny", pattern: "^git\\s+status" }
trust.write.deny    → { pattern: "^\\.env$", label: ".env" }
trust.write.remove  → { list: "deny", pattern: "^\\.env$" }
trust.reset         → {}
```

## Approval Integration

Existing `ToolApproval` class in `server/core/tool.approval.ts` already supports:
- Rules with `match`, `isAllowed`, `persist` callbacks
- Bus events: `tool.approval.request` → `tool.approval.resolve`
- Frontend: `ApprovalPopup.tsx` already handles the dialog
- Timeout (60s), `denyAll` on chat stop

Wire up:
- `registerDefaultRules()` — register `app_bash` rule with `isAllowed` checking trust allow list, `persist` writing to `trust.enc`
- `app_write`/`app_edit` — check deny list in tool implementation, no approval prompt needed

## Frontend

### Mode selector (chat input area)
```
│                          [ Read ▾ ] [ Send ] │
```
- Dropdown: Read / Write / Execute
- Color reflects mode
- Changes per workspace via `trust.mode.set`

### Settings > Permissions page
```
Mode: [● Read] [ Write ] [ Execute ]

Bash — Allowed
┌──────────────────────────────────────────────────┐
│ git status                    ^git\s+status   ✕  │
│ npx vitest run                ^npx\s+vitest   ✕  │
└──────────────────────────────────────────────────┘

Bash — Denied
┌──────────────────────────────────────────────────┐
│ sudo                          \bsudo\b       🔒  │
│ rm -rf /                      \brm\s+...     🔒  │
└──────────────────────────────────────────────────┘

Write — Denied paths
┌──────────────────────────────────────────────────┐
│ /etc/                         ^/etc/         🔒  │
│ .env                          \.env$          ✕  │
└──────────────────────────────────────────────────┘

[Reset to defaults]
```

- ✕ = user-added, removable
- 🔒 = hardcoded default, not removable

## Implementation Order

1. Trust store — `server/core/trust.ts` (encrypt/decrypt, load/save, CRUD)
2. Bus events — `trust.mode.*`, `trust.rules.*`, `trust.bash.*`, `trust.write.*`
3. Tools — `app_read`, `app_glob`, `app_grep`, `app_write`, `app_edit`, `app_bash`
4. Approval wiring — register rules in `registerDefaultRules()`, hook trust store
5. Mode gating — filter tools exposed to LLM based on current mode
6. Frontend: mode selector next to send button
7. Frontend: Settings > Permissions page
8. Skills — load `SKILL.md`, inject into system prompt (depends on tools being available)

## Tool Consolidation

New system tools can replace existing specialized tools:

| Current tool | Replaced by | Notes |
|-------------|-------------|-------|
| `app_attachment_read` | `app_read` | `app_read` already handles text + images, path validation only |
| `app_docs_read` | `app_read` | Read from prompts dir, or `app_glob` + `app_read` for discovery |
| `app_format_read` | `app_read` | Read format files from prompts/formats/ |

### Keep as-is
| Tool | Reason |
|------|--------|
| `app_bus_emit` | Core bus interaction, not a file/shell tool |
| `app_web_search` | External API call, not filesystem |
| `app_web_read` | External HTTP fetch, not filesystem |

### Result
- 6 tools total: `app_read`, `app_glob`, `app_grep`, `app_write`, `app_edit`, `app_bash`
- Plus 2 unchanged: `app_bus_emit`, `app_web_search`, `app_web_read` (9 → 9 wait until we remove 3 → 9 total but cleaner)
- `app_read` becomes the universal file reader (text, images, docs, attachments, formats)
- Fewer tools = simpler system prompt, less token overhead

## Prerequisite for Skills

Skills need tools to be useful. A skill like "brave-search" needs `app_bash` to run scripts. A skill like "code-review" needs `app_read` and `app_grep`. The permission system ensures skills can't do more than the user allows.
