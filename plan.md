# Skills System — Plan

## Overview

Add a Skills system that lets users create, import, review, and activate agent skills following the [agentskills.io](https://agentskills.io/home) specification. Skills are reusable prompt+config bundles that give the agent specialized capabilities (e.g. "code-reviewer", "data-analyst", "devops-assistant").

## Concepts

### What is a Skill?

A skill is a folder containing a `SKILL.md` file with YAML frontmatter + a system prompt. Skills can also include `references/` subfolders with supporting docs the agent reads on demand.

```
~/.sparky/skills/
  code-reviewer/
    SKILL.md          # frontmatter + prompt
    references/
      guidelines.md   # coding standards the agent reads via app_read
  data-analyst/
    SKILL.md
    references/
      chart-guide.md
```

Built-in roles use `AGENT.md` (in `server/prompts/`). User/imported skills use `SKILL.md` (in `~/.sparky/skills/`). `loadRole()` looks for both — `SKILL.md` first, then `AGENT.md`.

### Skill Sources

| Source | Flow |
|--------|------|
| **Built-in** | Ships with app (`server/prompts/sparky`, `connect`, `trust`) — not editable |
| **Created** | User asks skills agent in a system chat — same checklist as imported |
| **Imported** | Fetched from a URL (clawhub.ai, GitHub raw, any HTTP) — same checklist |

### Skills System Chat

The Skills section has a dedicated system chat (like Connections has for service setup). The skills agent lives here permanently — one chat per workspace, always accessible.

```
┌─────────────────────────────────────────────────┐
│ Skills                              [+ Import]  │
├─────────────────────────────────────────────────┤
│ 💬 Skills Assistant          ← system chat      │
│ ─────────────────────────────────────────────── │
│ 🟢 Code Reviewer             active             │
│ 🟡 Summarize                 pending             │
└─────────────────────────────────────────────────┘
```

The user can:
- "Create a skill that reviews PR diffs and suggests improvements"
- "Create a data analysis skill that uses pandas and matplotlib"
- Skills agent writes `SKILL.md`, creates `references/`, saves to `~/.sparky/skills/<name>/`
- Created skill goes through the same checklist (audit, bins, env vars) before activation
- Skills agent also handles reviews here — "review the summarize skill I just imported"

### Skill States

| State | Meaning |
|-------|---------|
| `active` | Available for use in chats |
| `draft` | Being created/edited, not yet usable |
| `pending` | Imported, awaiting safety review |
| `verified` | Reviewed by skills agent, safe to activate |
| `rejected` | Reviewed by skills agent, deemed unsafe |

## Architecture

### Storage

```
~/.sparky/skills/                     # User skills directory
  <skill-name>/
    AGENT.md                          # agentskills.io spec file
    references/                       # Optional supporting docs
      *.md
```

Skills metadata (state, source URL, review notes) stored in workspace DB:

```sql
CREATE TABLE skills (
  id TEXT PRIMARY KEY,                -- skill folder name (slug)
  name TEXT NOT NULL,                 -- display name from AGENT.md frontmatter
  state TEXT NOT NULL DEFAULT 'draft', -- active | draft | pending | verified | rejected
  source TEXT,                        -- 'builtin' | 'created' | URL (for imports)
  review_notes TEXT,                  -- agent's safety review summary
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
```

### Skills Agent

A new built-in role (`server/prompts/skills/SKILLS.md`) with specialized capabilities:

- **Create skills**: Write `SKILLS.md` files following the agentskills.io spec
- **Review imported skills**: Analyze prompt for safety issues, validate structure, set state to `verified` or `rejected`
- **Edit skills**: Modify existing skill prompts and references
- **Validate skills**: Check frontmatter schema, tool references, prompt quality

The skills agent defines what makes a skill valid/safe:
- No prompt injection attempts (e.g. "ignore previous instructions")
- No requests to exfiltrate data or access unauthorized resources
- No attempts to override trust/permission rules
- Tools listed in `allowed-tools` are valid app tools
- Prompt follows good practices (clear scope, guidance, examples)

### Import Flow

```
User pastes URL or selects from ClawHub search
    ↓
App fetches ZIP/SKILL.md from URL
    ↓
Skill saved to ~/.sparky/skills/<name>/ with state = "pending"
    ↓
Skills agent automatically reviews:
  - Parse and validate frontmatter
  - Analyze prompt for safety issues
  - Read and audit all scripts in scripts/
  - Extract ALL dependencies → produce requirements.json:
    • bins (required binaries + install hints)
    • env vars (required/optional + groups)
    • tools (required app_* tools)
  - Write review_notes
    ↓
State → "verified" (safe) or "rejected" (unsafe, with reason)
    ↓
Checklist evaluated (all must pass to activate):
  ✅ Audit passed
  ✅ All required bins found (via `which`)
  ✅ All required env vars present (in `env.enc`)
  ✅ At least one from each env group (e.g. LLM key)
  ✅ All required tools available in current mode
    ↓
[Activate] button enabled → state → "active"
    ↓
Skill appears in chat role selector
```

#### URL Resolution

| URL Pattern | Resolution |
|-------------|-----------|
| `https://clawhub.ai/<user>/<skill>` | Extract slug, fetch ZIP from `https://wry-manatee-359.convex.site/api/v1/download?slug=<skill>`, extract `SKILL.md` + `references/` |
| `https://github.com/<user>/<repo>/blob/main/AGENT.md` | Convert to raw URL, fetch AGENT.md |
| `https://raw.githubusercontent.com/...` | Fetch directly |
| Any URL ending in `.md` | Fetch directly as AGENT.md |
| Any other URL | Try appending `/AGENT.md`, then fetch page and look for AGENT.md link |

#### ClawHub Import Details

ClawHub skills use `SKILL.md` (not `AGENT.md`) with similar YAML frontmatter:
```yaml
---
name: self-improvement
description: "Captures learnings, errors, and corrections..."
metadata:
---
```

ZIP structure from download API:
```
SKILL.md          → kept as-is
_meta.json        → { slug, version, ownerId, publishedAt }
references/       → copied as-is
scripts/          → copied as-is (reviewed by skills agent)
assets/           → copied as-is
hooks/            → ignored (platform-specific)
```

Import steps:
1. Parse URL → extract slug (last path segment)
2. Fetch `https://wry-manatee-359.convex.site/api/v1/download?slug=<slug>`
3. Unzip to `~/.sparky/skills/<slug>/`
4. Keep `SKILL.md` as-is (no renaming)
5. Save `_meta.json` as source metadata
6. Set state to `pending`, trigger skills agent review

### Bus Events

```
skills.list          → { skills: Skill[] }
skills.get           → { id } → { skill: Skill, content: string }
skills.create        → { id, name } → { skill: Skill }
skills.update        → { id, content } → { skill: Skill }
skills.delete        → { id } → { ok: true }
skills.import        → { url } → { skill: Skill }         // fetches + saves as pending
skills.import.hub    → { slug } → { skill: Skill }        // imports from ClawHub by slug
skills.search        → { query } → { results: HubResult[] } // search ClawHub
skills.review        → { id } → { skill: Skill }          // triggers agent review
skills.activate      → { id } → { skill: Skill }          // state → active
skills.deactivate    → { id } → { skill: Skill }          // state → draft
skills.state.set     → { id, state } → { skill: Skill }   // manual state override
```

### ClawHub API

| Endpoint | Method | Description |
|----------|--------|-------------|
| `https://wry-manatee-359.convex.site/api/v1/search?q=<term>` | GET | Search skills (no auth, returns top 10) |
| `https://wry-manatee-359.convex.site/api/v1/download?slug=<slug>` | GET | Download skill ZIP (no auth) |

Search response:
```json
{
  "results": [
    {
      "score": 3.69,
      "slug": "code-review",
      "displayName": "Code Review",
      "summary": "Systematic code review patterns...",
      "version": null,
      "updatedAt": 1772065836042
    }
  ]
}
```

### Chat Integration

When creating a new chat, user can select a skill as the chat's role. The skill's `AGENT.md` becomes the system prompt, and its `allowed-tools` determines available tools.

```
Chat role selector: [Sparky ▾]
  → Sparky (default)
  → Connect (service setup)
  → Trust (permissions)
  → Code Reviewer (skill)
  → Data Analyst (skill)
  → [+ Create Skill]
```

Active skills appear in the role dropdown alongside built-in roles. The existing `chat.role` field stores the skill ID.

## Frontend

### Menu: Skills section

New nav item between Connections and Settings:

```
📦 Chats
⭐ Flagged
🏷️ Labels
📁 Archived
📚 Sources
🔌 Connections
🧩 Skills          ← NEW
⚙️ Settings
```

### Skills List Page

```
┌─────────────────────────────────────────────────┐
│ Skills                              [+ Import]  │
├─────────────────────────────────────────────────┤
│ 🟢 Code Reviewer          created    [Edit]     │
│ 🟢 Data Analyst           created    [Edit]     │
│ 🟡 Self-Improving Agent   imported   [Review]   │
│ 🔴 Prompt Injector        rejected   [Details]  │
│ ⚪ My New Skill            draft      [Edit]     │
└─────────────────────────────────────────────────┘
```

State indicators:
- 🟢 `active` / `verified` — green dot
- 🟡 `pending` — yellow dot
- 🔴 `rejected` — red dot
- ⚪ `draft` — gray dot

### Skill Details Page

```
┌─────────────────────────────────────────────────┐
│ ← YouTube Watcher                    [Activate] │
│                                                 │
│ 📺 Fetch transcripts from YouTube videos        │
│ by michael gathara · v1.0.0 · ClawHub           │
│                                                 │
│ ┌─ Checklist ──────────────────────────────────┐│
│ │ ✅ Audit       Reviewed by skills agent      ││
│ │ ❌ yt-dlp      Not found — brew install yt-dlp│
│ │ ✅ python3     Found at /usr/bin/python3     ││
│ │ ✅ Scripts      1 script reviewed (safe)      ││
│ └──────────────────────────────────────────────┘│
│                                                 │
│ ┌─ SKILL.md ──────────────────────────────────┐ │
│ │ (rendered markdown preview of the prompt)   │ │
│ └─────────────────────────────────────────────┘ │
│                                                 │
│ ┌─ Review Notes ──────────────────────────────┐ │
│ │ ✓ Valid frontmatter                         │ │
│ │ ✓ Script get_transcript.py: uses yt-dlp     │ │
│ │   subprocess, no network calls, no file     │ │
│ │   writes outside tempdir. Safe.             │ │
│ │ ✓ No prompt injection patterns              │ │
│ │ ⚠ Requires yt-dlp binary (not installed)    │ │
│ └─────────────────────────────────────────────┘ │
│                                                 │
│ [Edit] [Delete]                                 │
└─────────────────────────────────────────────────┘
```

### Activation Checklist

Before a skill can be activated, all checklist items must pass. The checklist is generated from the skill's metadata and review:

| Check | Source | How |
|-------|--------|-----|
| **Audit** | `skills.review` | Skills agent reviews SKILL.md + scripts for safety |
| **Binaries** | manifest `bins` | Check each binary exists in PATH (`which <bin>`) |
| **Env vars** | manifest `env` | Check each var exists in `env.enc` |
| **Scripts** | `scripts/` folder | Skills agent reviews each script for safety |
| **Permissions** | `allowed-tools` | Check required tools are available in current mode |

#### Requirements Manifest

During review, the skills agent produces a `requirements.json` in the skill folder:

```json
{
  "bins": [
    { "name": "yt-dlp", "install": "brew install yt-dlp", "required": true }
  ],
  "env": [
    { "name": "GEMINI_API_KEY", "required": false, "hint": "Google AI API key" },
    { "name": "OPENAI_API_KEY", "required": false, "hint": "OpenAI API key" }
  ],
  "safe": true,
  "notes": "Script uses yt-dlp subprocess, no network calls outside yt-dlp."
}
```

Sources for the manifest (merged, deduplicated):
1. **Structured metadata** — `metadata.clawdbot.requires.bins` + `metadata.clawdbot.install` (machine-readable, from ClawHub)
2. **SKILL.md body** — skills agent scans for `*_API_KEY`, `*_TOKEN` patterns, required tools, install instructions
3. **Scripts analysis** — skills agent reads scripts, extracts imports, subprocess calls, env var access (`os.environ`, `$ENV_VAR`)

The manifest is the single source of truth for the checklist. The skills agent generates it once during review, and the app uses it for activation checks.

Checklist states:
- ✅ Pass — requirement met
- ❌ Fail — requirement not met (shows install hint if available)
- ⏳ Pending — not yet checked (audit in progress)
- ⚠️ Warning — non-blocking issue (e.g. optional dependency missing)

A skill can only be activated when all required checks pass. The "Activate" button is disabled with a tooltip explaining what's missing.

#### API Keys

Some skills require API keys as environment variables (e.g. `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`). The checklist detects these by:
1. Parsing the SKILL.md prompt for `*_API_KEY` / `*_TOKEN` patterns
2. Skills agent extracting key requirements during review

```
┌─ Checklist ──────────────────────────────────────┐
│ ✅ Audit       Reviewed by skills agent          │
│ ❌ summarize   Not found — brew install steipete/tap/summarize │
│ ⚠️ GEMINI_API_KEY  Not set                       │
│   💡 Available in your connections: Google Gemini │
│      [Use from connection]                       │
│ ⚠️ OPENAI_API_KEY  Not set                       │
│ ⚠️ ANTHROPIC_API_KEY  Not set                    │
│   💡 Available in your connections: Anthropic    │
│      [Use from connection]                       │
└──────────────────────────────────────────────────┘
```

When the user has a matching provider configured in Connections (e.g. Anthropic API key for LLM), offer to reuse that key. Otherwise, prompt the user to enter it — stored securely in the keychain.

**Secret storage**: `env.skills.<skill>.<VAR>` in keychain (same mechanism as `svc.<service>.<FIELD>`)

```
env.skills.summarize.GEMINI_API_KEY
env.skills.summarize.OPENAI_API_KEY
env.skills.youtube-watcher.APIFY_API_TOKEN
```

**Env vars are stored in `env.enc`** (existing encrypted env store at `~/.sparky/env.enc`). Skills declare what they need, the checklist checks if the vars exist. No special skill-scoped storage — everything lives in the shared `env.enc`.

**Runtime injection**: When `app_bash` executes a command, all vars from `env.enc` are injected into the child process env:
```ts
exec(command, {
  env: { ...process.env, ...envEncVars }
});
```

This already works for connections. Skills just reuse the same mechanism. If a skill needs `GEMINI_API_KEY` and it's in `env.enc`, it's available. If not, the checklist shows ❌ and the skill can't be activated.

**Checklist flow**:
```
┌─ Checklist ──────────────────────────────────────┐
│ ✅ Audit       Reviewed by skills agent          │
│ ❌ summarize   Not found                         │
│    brew install steipete/tap/summarize            │
│ ✅ GEMINI_API_KEY  Found in env.enc              │
│ ❌ OPENAI_API_KEY  Not in env.enc                │
│ ❌ ANTHROPIC_API_KEY  Not in env.enc             │
└──────────────────────────────────────────────────┘
│              [Activate] (disabled)               │
```

- All checks must pass for activation
- Binaries: checked with `which`
- Env vars: checked against `env.enc`
- User manages `env.enc` via Settings > Environment and installs binaries themselves
- No prompting from the LLM — purely declarative checklist

#### Binary detection

The `metadata` field in ClawHub skills contains structured requirements:
```json
{
  "clawdbot": {
    "emoji": "📺",
    "requires": { "bins": ["yt-dlp"] },
    "install": [
      { "id": "brew", "kind": "brew", "formula": "yt-dlp", "bins": ["yt-dlp"], "label": "Install yt-dlp (brew)" },
      { "id": "pip", "kind": "pip", "package": "yt-dlp", "bins": ["yt-dlp"], "label": "Install yt-dlp (pip)" }
    ]
  }
}
```

On import, parse this metadata to:
1. Extract required binaries → check with `which`
2. Extract install instructions → show as hints on failed checks
3. Extract emoji → use as skill icon

### Import Modal

```
┌─────────────────────────────────────────────────┐
│ Import Skill                                    │
│                                                 │
│ [🔍 Search ClawHub...                     ]     │
│                                                 │
│  📦 Code Review               ⭐ 3.69          │
│  📦 Requesting Code Review    ⭐ 3.58          │
│  📦 Code Review Fix           ⭐ 3.54          │
│                                                 │
│ ── or paste URL ──                              │
│ [https://...                              ]     │
│                                                 │
│              [Cancel]  [Import]                  │
└─────────────────────────────────────────────────┘
```

- Search queries ClawHub API in real-time (debounced)
- Click a result → imports that skill
- URL field accepts ClawHub URLs, GitHub raw URLs, or any `.md` URL
- After import → navigates to skill detail page showing "pending" state → auto-triggers review

## Implementation Order

### Phase 1: Core (server)
1. `skills` table in workspace DB (migration v2)
2. `server/skills/skills.ts` — CRUD, file I/O for `~/.sparky/skills/`
3. `server/skills/skills.import.ts` — URL fetching, AGENT.md extraction
4. Bus event handlers registration
5. `server/prompts/skills/AGENT.md` — skills agent role

### Phase 2: Integration (server)
6. Extend `loadRole()` to resolve skills from `~/.sparky/skills/` (not just `server/prompts/`)
7. Extend `listRoles()` to include active skills
8. Chat role selector includes skills

### Phase 3: Frontend
9. `Section` type: add `"skills"`
10. `MenuPanel`: add Skills nav item with icon
11. `SkillsListPage` — list with state indicators
12. `SkillDetailsPage` — view/edit/activate/deactivate
13. `ImportSkillModal` — URL input + import
14. Role selector in chat: show active skills

### Phase 4: Review system
15. Auto-review on import via skills agent
16. Review results displayed on detail page
17. Manual override for rejected skills (with warning)

## Key Decisions

- **Skills stored in `~/.sparky/skills/`** — shared across workspaces, not per-workspace
- **Metadata in workspace DB** — state, source, review notes are per-workspace
- **Built-in roles are NOT skills** — they stay in `server/prompts/`, skills are user-created/imported
- **Skills agent reviews imports** — automated safety check, not manual regex
- **clawhub.ai integration via HTTP fetch** — no SDK/API dependency, just fetch the AGENT.md
- **Skills follow agentskills.io spec** — same YAML frontmatter format as existing roles
- **Active skills appear in role dropdown** — reuses existing `chat.role` infrastructure
- **No skill marketplace/registry** — import by URL only (simple, no auth needed)
