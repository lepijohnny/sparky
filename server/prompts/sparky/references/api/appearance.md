# Appearance API

### `settings.appearance.theme.list`
- **returns**: `{ themes: { name, author, bg, fg, accent, mode }[] }`
```
app_bus_emit("settings.appearance.theme.list")
→ { "themes": [{ "name": "Default Dark", "mode": "dark" }, { "name": "Nord", "mode": "dark" }] }
```

### `settings.appearance.theme.set`
- **params**: `{ name: string }`
- **returns**: `{ theme: { name, author, bg, fg, accent, mode } }`
- **note**: Only use for themes already in the list.
```
app_bus_emit("settings.appearance.theme.list")  →  verify "Nord" exists
app_bus_emit("settings.appearance.theme.set", { "name": "Nord" })
```

### `settings.appearance.theme.save`
- **params**: `{ theme: { name, author, bg, fg, accent, mode } }`
- **returns**: `{ theme: { name, author, bg, fg, accent, mode } }`
- **note**: `mode` is `"dark"` or `"light"`. `accent` can be `null` (auto-derived). Use **accurate, well-known colors** — do not guess.
```
app_bus_emit("settings.appearance.theme.save", {
  "theme": { "name": "GitHub Light", "bg": "#ffffff", "fg": "#1f2328", "accent": "#0969da", "mode": "light" }
})
app_bus_emit("settings.appearance.theme.set", { "name": "GitHub Light" })
```
