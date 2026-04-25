# pi-phone-3gs — Agent Notes

## Project overview

This is a Pi package (`pi install /path/to/pi-phone-3gs`) that provides a touch-optimized TUI shell for driving a coding agent from a phone. It is not a standalone app — it runs as an extension inside Pi's terminal UI.

## Pi documentation reference

Pi's own docs live at:
- Main README: `/opt/homebrew/lib/node_modules/@mariozechner/pi-coding-agent/README.md`
- All docs: `/opt/homebrew/lib/node_modules/@mariozechner/pi-coding-agent/docs/`
- Examples: `/opt/homebrew/lib/node_modules/@mariozechner/pi-coding-agent/examples/`

Key docs for this project:
- **Extensions**: `docs/extensions.md` — the ExtensionAPI, events, commands, tools, custom UI
- **TUI components**: `docs/tui.md` — the Component interface, rendering, overlays, focus
- **Packages**: `docs/packages.md` — how packages are structured, installed, and discovered
- **Skills**: `docs/skills.md` — skill files and how they're loaded
- **Themes**: `docs/themes.md` — theme API and color palettes

This project follows the conventions described in those docs. When in doubt about how Pi expects something to work, check the canonical docs first.

## Package structure

This repo is a standard Pi package. The `package.json` `pi` key declares the extension entry point:

```json
"pi": { "extensions": ["./extensions/phone-shell/index.ts"] }
```

User-facing config templates live in `extras/`. At runtime, per-user overrides are read from `~/.pi/agent/pi-phone-3gs/`.

On first `session_start`, the extension now bootstraps starter files if they do not exist yet:
- `phone-shell.config.json`
- `phone-shell.layout.json`
- `phone-shell.favorites.json`
- `phone-shell.state.json`

Existing user files are preserved on later reloads/updates.

## Extension source layout

All extension code lives under `extensions/phone-shell/`. The module graph is still intentionally layered, but it now has a few more concrete UI modules than the original sketch:

```
types.ts               — type definitions (no imports from this project)
defaults.ts            — constants, default config/layout/favorites/state templates
config.ts              — JSON parsing, validation, persistence, starter-file bootstrap
button-helpers.ts      — shared button sizing / palette / row-splitting helpers
button-panel.ts        — generic multi-row button group renderer with hit regions
viewport.ts            — TouchViewport component (scroll + page controls)
header.ts              — HeaderBarComponent + AgentStateTracker
bar.ts                 — favorites rail / bottom chip bar
nav.ts                 — optional nav pad panel (arrows, enter, slash, ^C, etc.)
overlay.ts             — generic dropdown overlay renderer (utility/view/skills)
editor.ts              — CustomEditor subclass that triggers shell re-renders on edits
state.ts               — mutable state singleton, render context, shared utils
input.ts               — mouse/keyboard routing, action dispatch, overlay management
mode.ts                — touch mode enable/disable lifecycle, TUI install/uninstall
commands.ts            — slash command parsing & handlers
index.ts               — extension entry point (agent events, bootstrap, registration)
```

### Dependency flow (high level)

```text
types/defaults
   ↓
config ───────────────┐
button-helpers        │
button-panel          │
viewport/header/bar/nav/overlay/editor
   ↓                  │
state ─ input ─ mode ─ commands ─ index
```

### File responsibilities

Each file has one job:

| File | Role |
|---|---|
| `index.ts` | Extension entry — wires agent events, registers commands/shortcuts, session lifecycle |
| `state.ts` | State singleton (`RuntimeState`), render context, shared utilities (`queueLog`, `scheduleRender`, `captureUiBindings`, config reload, status reports) |
| `input.ts` | Terminal input handling — mouse parsing, hit testing, keyboard routing, action dispatch (`performAction`, `activateButton`), utility overlay show/hide, input handler registration |
| `mode.ts` | Touch mode lifecycle — TUI capture, viewport/header/bar install/uninstall, mouse tracking, `enableTouchMode`/`disableTouchMode` |
| `commands.ts` | Slash commands — parsing, tab completions, all `/phone-shell` subcommand handlers |
| `header.ts` | Sticky 3-line header bar component + `AgentStateTracker` (phase/context/jobs/model/thinking state) |
| `viewport.ts` | `TouchViewport` — wraps the chat component, clips to available height, handles scroll/page/pgup/pgdn |
| `bar.ts` | `BottomBarComponent` — renders the horizontally scrollable favorites rail |
| `nav.ts` | `NavigationPadComponent` — renders the optional arrow/nav key pad |
| `overlay.ts` | Generic dropdown overlay component used for utility/view/skills menus |
| `editor.ts` | `PhoneShellEditor` — editor wrapper that keeps shell UI in sync with edits |
| `button-panel.ts` | Shared renderer for grouped button panels with hit regions |
| `button-helpers.ts` | Shared pure functions for button layout: `splitIntoRows`, `makeButtonWidth`, `buttonPalette`, `tailToWidth` |
| `config.ts` | JSON config/layout/favorites parsing, validation, persistence, and starter-file bootstrap (`ensureStarterFiles`, `loadPhoneShellSettings`, `loadFavorites`, `loadPersistedShellState`, `savePersistedShellState`) |
| `defaults.ts` | All constants, default config/layout/favorites/state objects, and JSON templates |
| `types.ts` | All TypeScript type definitions for the extension |

### TUI child order (during touch mode)

When touch mode is enabled, `tui.children` is arranged as:

1. `HeaderBarComponent` — spliced into index 0 (sticky, always rendered)
2. *(original pi child)* — pi's own chrome
3. `TouchViewport` — replaces the original chat at `CHAT_CHILD_INDEX`, clips to `rows - fixedHeight`

The favorites rail (`BottomBarComponent`) lives as a `belowEditor` widget. Dropdown overlays are non-capturing overlays anchored relative to the header. The optional nav pad can render above the editor area or near the bottom depending on current shell state.

**Install order matters**: viewport is installed first (grabbing `children[CHAT_CHILD_INDEX]`), then header is spliced at index 0. Reverse order on teardown.

## Key patterns

- **Render context**: All components receive `PhoneShellRenderContext` — a `{ state, getConfig, getLayout, getFavorites, getTheme }` bag. No component should need to import ad-hoc config globals; they read through the context.
- **State is centralized**: One mutable `state` object in `state.ts`. Components write to it during render (e.g. `BottomBarComponent` sets `barRow`, `barButtons`). Input handlers and mode functions mutate it directly.
- **Schedule render**: `scheduleRender()` batches renders via `queueMicrotask`. Always use this instead of calling `tui.requestRender()` directly, unless forcing an immediate render.
- **Logging**: `queueLog()` serializes log writes to `~/.pi/agent/logs/pi-phone-3gs-phone-shell.log`. Useful for debugging touch/input issues.
- **Bootstrap-first install UX**: the extension creates starter config/layout/favorites/state files on first load if they are missing, but never overwrites existing user files.
- **Config hot-reload**: `/phone-shell reload-config` re-reads the user's config/layout/favorites JSON files without restarting the session.

## Branching + merge workflow

- For **new feature work** in this repo, always create a new branch from `main` before implementing.
- Keep `main` as the last known-good fallback so the user can quickly switch back if a rendering/input experiment breaks the shell.
- After implementing a feature, let the user reload and test it before merging.
- Do **not** merge the feature branch back into `main` until the user explicitly gives the final go-ahead.

## Build & type checking

```bash
npm run check    # tsc --noEmit — type check only, no emit
```

This is a Pi package, not a standalone build. There is no bundle step — Pi loads the TypeScript extension directly at runtime via the entry point declared in `package.json`.

## User config files

Per-user files live at `~/.pi/agent/pi-phone-3gs/`:
- `phone-shell.config.json` — behavior settings (viewport paging, overlays, render/input behavior)
- `phone-shell.layout.json` — utility buttons and grouped panel layout
- `phone-shell.favorites.json` — favorites rail entries shown in the scrollable bottom bar
- `phone-shell.state.json` — session persistence (`enabled`, `autoEnable`, bar/nav visibility, proxy/editor position state)

Templates are in `extras/`, including `phone-shell.favorites.example.json`.
