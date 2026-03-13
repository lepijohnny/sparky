# Frontend — AGENTS.md

React 19, Vite 7, TypeScript 5.9, CSS Modules, Zustand 5.

## Directory Structure

```
src/
├── App.tsx              Root component — routing, layout composition
├── main.tsx             Entry point — provider tree, window routing (main / popup / expand)
├── store/               Zustand store — all shared application state
│   ├── index.ts         Store composition (slices + persist middleware)
│   ├── types.ts         Section, SettingsSub type definitions
│   ├── sync.ts          WS → store sync layer (single source of truth for server data)
│   ├── shortcuts.ts     Global keyboard shortcuts (Escape to clear multi-select)
│   ├── chats.ts         Chat list, CRUD, derived counts
│   ├── selection.ts     Chat multi-select (anchor, toggle, range, shift-click)
│   ├── sources.ts       Knowledge sources list, CRUD
│   ├── sourceSelection.ts  Source multi-select
│   ├── connections.ts   Service connections list, CRUD
│   ├── labels.ts        Labels list
│   ├── agent.ts         LLM connections, providers, default model, derived getters
│   ├── streams.ts       Active stream buffers (content, activities per chat)
│   └── navigation.ts    Section, settings sub, search state, collapsed groups
├── context/             React contexts — infrastructure only
│   ├── ConnectionContext.tsx  WS connection lifecycle, Tauri IPC
│   ├── ThemeContext.tsx       CSS variable application
│   └── ToastContext.tsx       Toast queue with auto-dismiss timers
├── hooks/               React hooks — rendering lifecycle, UI interactions
│   ├── useAgentReplyStream.ts  Per-chat streaming (entry synthesis, terminal events)
│   ├── useAppNavigation.ts     Thin wrapper over store navigation slice
│   ├── useChatAutoScroll.ts    Auto-scroll to bottom during streaming
│   ├── useLabelDragReorder.ts  Drag-and-drop label ordering
│   ├── useWsRequest.ts         One-shot WS request with loading state
│   └── useWsSubscriber.ts      WS event listener (page-specific concerns)
├── components/          Reusable UI components
│   ├── chat/            Chat-specific (bubbles, input, code blocks, lists)
│   ├── shared/          Generic (modals, menus, dropdowns, tooltips)
│   ├── modals/          Dialog windows (rename, new workspace, new connection)
│   └── knowledge/       Knowledge-specific (source add button)
├── pages/               Route-level page components
│   ├── chat/            ChatDetailsPage, ChatListPage, ChatWindow (popup)
│   ├── connections/     ConnectionsListPage, ConnectionsDetailsPage
│   ├── knowledge/       SourceListPage, SourceDetailsPage
│   └── settings/        Settings sub-pages (LLM, appearance, labels, etc.)
├── panels/              Layout panels (three-column)
│   ├── Layout.tsx       Three-column layout shell
│   ├── MenuPanel.tsx    Left sidebar — navigation, workspace switcher
│   ├── ContextPanel.tsx Middle column — lists (chats, sources, connections)
│   └── DetailsPanel.tsx Right column — detail views, settings pages
├── lib/                 Pure utilities — no React hooks, no state
│   ├── ws.ts            WebSocket client (WsConnection class)
│   ├── markdownLexer.ts Streaming-safe markdown tokenizer
│   ├── chatUtils.ts     Entry → Message collapse logic
│   ├── activityUtils.ts Activity labeling, filtering, merging
│   ├── chatActions.tsx   Context menu action builders (returns JSX icons)
│   ├── labelActions.tsx  Label submenu builder
│   ├── highlight.tsx     Search term highlighting (returns <mark> elements)
│   ├── providerIcons.tsx Provider → icon mapping
│   ├── dateGroups.ts     Date-based grouping for lists
│   ├── color.ts          Color utilities
│   ├── themes.ts         Theme CSS variable computation
│   ├── auth/             Auth strategy modules (API key, OAuth PKCE, Copilot CLI)
│   └── renderers/        Block renderers (code, mermaid, latex, chart, table)
├── types/               TypeScript interfaces (Chat, Source, Label, LlmConnection, etc.)
└── styles/              Global CSS, shared CSS modules
```

## State Management

### Zustand Store (single source of truth)

All shared application data lives in one Zustand store composed of slices:

```
useStore = create(persist(
  chats + selection + sources + sourceSelection +
  connections + labels + agent + streams + navigation
))
```

**Persist middleware** saves `section`, `settingsSub`, `selectedSourceId`, `selectedConnectionId`, `selectedLabel` to `localStorage`.

**Rules:**
- Components read from the store via `useStore((s) => s.field)` selectors.
- Store actions are the only way to mutate shared state.
- For multiple fields, destructure from a single `useStore((s) => s)` call.
- Derived data uses getter methods on slices (`getDefaultConn()`, `getChatCounts()`, `getSelectedModel()`).

### Sync Layer (`store/sync.ts`)

Single function `syncStore(conn)` that:
1. Fetches all initial data (chats, sources, connections, labels, LLM config) on connect.
2. Subscribes to WS broadcasts (`chat.created`, `chat.updated`, `chat.deleted`, `chat.event`, `kt.source.*`, `svc.*`, `settings.*`).
3. Pushes updates into the store — no component-level WS listeners needed for data.

Called once from `ConnectionContext` when the WS connection opens.

### Contexts (infrastructure only, not data)

Three React contexts remain — each wraps infrastructure that can't be plain state:

| Context | Why not store |
|---------|--------------|
| `ConnectionContext` | `WsConnection` is a class with methods — not serializable |
| `ThemeContext` | Mutates `document.documentElement.style` — DOM side effect |
| `ToastContext` | Manages `setTimeout` chains for auto-dismiss animation |

### Hooks (rendering lifecycle)

Hooks are for React-specific concerns that depend on component mount/unmount:

| Hook | Purpose |
|------|---------|
| `useAgentReplyStream` | Per-chat streaming: accumulates deltas, synthesizes partial messages on stop, calls `onEntry`/`onEnd` callbacks |
| `useAppNavigation` | Thin wrapper over store navigation; adds multi-select collapse on section change |
| `useChatAutoScroll` | Tracks scroll position, auto-scrolls during streaming |
| `useLabelDragReorder` | Drag-and-drop with pointer events |
| `useWsRequest` | One-shot server request with `data`/`loading`/`error` lifecycle |
| `useWsSubscriber` | WS event listener scoped to component lifecycle |

`useWsSubscriber` is still used in leaf components for **page-specific** concerns (not global data):
- `ChatDetailsPage` — model readiness refetch
- `SourceDetailsPage` — source + files detail update
- `ChatWindow` — popup window with its own WS connection
- `ApprovalPopup` — tool approval request/dismiss events
- `App.tsx` — background completion toast notifications

### Module-Level State (intentional exceptions)

Two module-level `Map`/`Set` values exist — both intentionally ephemeral:

| Location | What | Why not store |
|----------|------|--------------|
| `ChatList.tsx: dateCache` | Date formatting cache | Pure memoization, no side effects |
| `AgentTurnInput.tsx: drafts` | Unsent message text per chat | Per-session UX, would be noise in store |
| `activityUtils.ts: expandedGroups` | Expanded activity sections | Ephemeral toggle state, survives remount but not refresh |

## Component Patterns

### `.tsx` Files in `lib/`

Four `.tsx` files in `lib/` are **pure functions** that return JSX — not components:
- `chatActions.tsx` — builds `ContextMenuAction[]` arrays with icon elements
- `labelActions.tsx` — builds label submenu with colored dots
- `highlight.tsx` — wraps matched text in `<mark>` elements
- `providerIcons.tsx` — maps provider ID to SVG/img element

No hooks, no state, no effects. They happen to return JSX but are called as functions, not rendered as components.

### Layout

Three-column layout: `MenuPanel | ContextPanel | DetailsPanel`

- `App.tsx` composes content into panels based on `section` (from store navigation slice).
- `ContextPanel` renders lists (chats, sources, connections) or settings navigation.
- `DetailsPanel` renders detail views, settings pages, or batch action UI.
- `ChatWindow.tsx` is a standalone popup window with its own `ConnectionContext` — does not share the main store.

### Rendering Pipeline

Markdown rendering uses a custom streaming-safe pipeline:
1. `markdownLexer.ts` tokenizes raw text (handles incomplete blocks during streaming)
2. `markdownRenderer.tsx` maps tokens to React elements
3. Block renderers (`codeRenderer`, `mermaidRenderer`, `latexRenderer`, `chartRenderer`, `tableRenderer`) handle specialized content
4. `isIncompleteBlock()` hides blocks that haven't closed yet during streaming

## Testing

```sh
cd app && pnpm test
```

**Test naming**: `given <precondition>, when <action>, then <expected result>`

**Store tests** are pure — no React, no DOM:
```ts
useStore.setState({ chats: [] });
useStore.getState().addChat(chat);
expect(useStore.getState().chats).toHaveLength(1);
```

**Hook tests** use `renderHook` from `@testing-library/react`.

**Test files** live next to source in `test/` subdirectories.

## Conventions

- **CSS Modules** for all component styles (`.module.css`).
- **No inline comments**. Only top-level doc comments (`/** */`) when needed.
- **pnpm** as package manager.
- **Scrollbar styling**: native CSS (`scrollbar-width: thin; scrollbar-color`) in `global.css` — no per-element JS hooks.
- **Icons**: Lucide React, 14px default, 1.5 strokeWidth.
- **Types**: shared interfaces in `types/`, store types co-located with slices.
