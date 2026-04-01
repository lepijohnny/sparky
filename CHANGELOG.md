# Changelog

All notable changes to this project are documented in this file.

## [0.7.4] — 2026-03-30

### Added
- **System labels** — Auto-assigned `_connection`, `_permission`, `_skill`, `_routine` labels on assistant chats; accent-colored, not user-removable, hidden from label management
- Context menu on routine list items (Disable/Enable, Run Now, Delete)
- Connection test toast feedback (success/error)

### Changed
- **Code blocks redesigned** — Theme-aware background, accent-colored line numbers with vertical separator, dynamic width, trimmed empty lines
- Context menu (`...`) moved to absolute top-right on skills and connections list items (matches chat list pattern)
- Divider line above Delete in skills and connections context menus
- Connection "Test connection" renamed to "Test" with Play icon
- Routines detail shows "Paused" instead of next run date when disabled
- Error bubble restyled — red left accent border, normal text color, softer background
- OAuth redirect pages use Sparky app icon
- `bump.sh` replaces `tag.sh` — supports `--patch`, `--minor`, `--major` with annotated tags

### Fixed
- No retry on 4xx client errors (400, 429, etc.) — immediate bail out
- `lastTestedAt` updates on both successful and failed connection tests
- `trustScope` added to `ApprovalExtra` interface
- `ContentBlockEvent` citations `label` made required (matches `MappedEvent`)
- Tool registry test types updated (missing `label`, `icon`, `isChatAllowed`)
- Removed post-commit tag hook (bump.sh handles versioning)

## [0.7.0] — 2026-03-30

### Added
- **Routines** — Scheduled automation with cron triggers and multiple action types (chat, archive, flag, label)
- Routine Assistant — guided questionnaire for creating routines via conversation
- Routine scheduler with minute-aligned ticks (Croner)
- Routine detail page with Schedule, Action, and History cards
- Manual "Run Now" trigger for routines
- **Steering messages** — Send messages to the agent while it's working; displayed as activity entries
- **Tool output dedup** — MinHash signatures skip near-identical outputs (85% Jaccard threshold)
- **Disk usage pie chart** in workspace settings with hover-to-expand slices
- Skill files cached in Zustand store — instant switching, no flicker
- Routine data and runs prefetched and stored in Zustand
- Section-level fade transitions for smooth detail panel switching
- Per-chat trust scope for Approve All
- Chat sizeBytes tracking (refreshed at turn end)

### Changed
- Approval popup shows real action name instead of generic "Approval Required"
- Detail panel content key is now section-level (no per-item remount animations)
- Consistent list styling across all sidebar pages (chats, routines, skills, connections, settings)
- Skill details layout — fixed header/status height, scrollable file card
- Updated website landing page (tagline, screenshots, CTA)

### Fixed
- Approve All scope matching (`trustScope` instead of role name)
- Steering injection skipped on cancellation or error
- ECharts JS function stripping handles nested functions via balanced brace counting
- Stale mermaid SVG blobs cleaned from workspace DB

## [0.6.0] — 2026-03-28

### Added
- Document conversion via [markit](https://github.com/Michaelliv/markit) — attach PDF, DOCX, PPTX, XLSX, CSV, HTML, EPUB, code files, and more to chat messages
- Drag and drop file attachments onto the chat input
- Toast notification when knowledge import completes or fails
- Converters settings page (max output size, URL crawl depth/pages, robots.txt toggle)
- Attachments documentation page on website
- `VACUUM` on knowledge DB startup to reclaim disk space

### Changed
- Replaced extractor plugin system with built-in markit converter for all file types
- URL extractor moved from npm plugin to built-in with configurable options
- Provider adapters report only image formats; markit extensions merged at registry level
- Upgraded `@mariozechner/pi-ai` 0.57.1 → 0.63.1 (1M context for Claude 4.6, faster startup, better error handling)
- Node 22.22.0 → 22.22.2
- Removed Extractors settings page

### Fixed
- Paste now replaces selected text in rich input
- Cut (Cmd+X) now removes selected text from rich input
- Attachment path uses correct workspace after switching
- Stop all active chats before workspace switch (prevents FOREIGN KEY errors)
- Workspace switch subscriber made async for proper agent cleanup
- Bubble padding and pin flash around whole bubble

## [0.5.1] — 2026-03-26

### Fixed
- Add state parameter to OAuth PKCE token exchange

## [0.5.0] — 2026-03-25

### Changed
- Version bump for release

## [0.4.12] — 2026-03-24

### Added
- Move status and context into bubble footer

### Fixed
- Print page break protection
- Knowledge delete shadow table cleanup
- UI polishing

## [0.4.11] — 2026-03-23

### Added
- Async updater state

### Fixed
- Initial load on select
- Print view style
- Pin button and UI tweaks

## [0.4.10] — 2026-03-22

### Added
- Chat.ask mode override
- Enable DDG web search for Mistral models

### Changed
- Rename system chat titles to assistant
- Sparky.ts cleanup, prompt builder refactor

## [0.4.9] — 2026-03-21

### Added
- Mistral provider integration (API key)

## [0.4.8] — 2026-03-20

### Added
- Unread chat, retitle, context menu improvements
- Text highlighter

## [0.4.7] — 2026-03-19

### Added
- Async agent toasts

### Fixed
- Window zoom
- Improve skills workflow
- Labels visible when searching

## [0.4.6] — 2026-03-18

### Added
- Labels per workspace

### Fixed
- Agent stream retry
- Service icon download

## [0.4.5] — 2026-03-17

### Fixed
- Separate PrintDetailsPage, agent stream retry, hooks order

## [0.4.4] — 2026-03-16

### Fixed
- Bundle built-in extractors as JS for production builds
- Clarify requirements.json in skills prompt

## [0.4.3] — 2026-03-15

### Added
- Skill rename, consolidate state into meta
- Skill import/export, chat cwd, what's new card

### Fixed
- Clean up chat directories on delete
- Terminal path macOS

## [0.4.2] — 2026-03-14

### Fixed
- Resolve full PATH from login shell on macOS

## [0.4.1] — 2026-03-13

### Added
- OpenAI provider support (OAuth + API key)
- Tool activity labels and icons
- Show release notes in About page

### Fixed
- White flash during macOS window zoom
- Smooth window zoom on macOS titlebar
- Prevent text selection on double-click in panel title bars

## [0.4.0] — 2026-03-12

### Added
- Agent skills specification
- app_web_read always available regardless of native search

### Fixed
- Debounce tooltip on skill status pipeline
- Skill-crud SKILL.md and use storage
- Chat scroll flicker on older message load
- ECharts tooltips inflating scroll height
- Path nav dotfiles, cursor-aware token, async glob/grep

## [0.3.0]

- Initial release
