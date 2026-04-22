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

## Extension source layout

All extension code lives under `extensions/phone-shell/`. The module graph is strictly layered with no circular dependencies:

```
types.ts               — type definitions (no imports from this project)
defaults.ts            — constants, defaults, templates
config.ts              — config/layout JSON parsing & file persistence
button-helpers.ts      — shared button rendering utilities
viewport.ts            — TouchViewport component (scroll + page controls)
bar.ts                 — BottomBarComponent (touch button bar)
overlay.ts             — UtilityOverlayComponent (floating utility-button overlay)
header.ts              — HeaderBarComponent + AgentStateTracker
state.ts               — mutable state singleton, render context, shared utils
input.ts               — mouse/keyboard routing, action dispatch, overlay management
mode.ts                — touch mode enable/disable lifecycle
commands.ts            — slash command parsing & handlers
index.ts               — extension entry point (agent events, registration)
```

### Dependency flow (acyclic)

```
types, defaults → config → state → input → mode → commands → index
                  header ↗        ↗        ↗
            button-helpers → bar, overlay ↗
            viewport ↗
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
| `header.ts` | Sticky 2-line header bar component + `AgentStateTracker` (listens to agent events, drives phase/context/jobs display) |
| `viewport.ts` | `TouchViewport` — wraps the chat component, clips to available height, handles scroll/page/pgup/pgdn |
| `bar.ts` | `BottomBarComponent` — renders the bottom button groups with hit regions |
| `overlay.ts` | `UtilityOverlayComponent` — floating overlay with utility buttons |
| `button-helpers.ts` | Shared pure functions for button layout: `splitIntoRows`, `makeButtonWidth`, `buttonPalette`, `tailToWidth` |
| `config.ts` | JSON config/layout parsing, validation, file persistence (`loadPhoneShellSettings`, `loadPersistedShellState`, `savePersistedShellState`) |
| `defaults.ts` | All constants (`CHAT_CHILD_INDEX`, `BAR_HEIGHT`, sequences), default config/layout objects, templates |
| `types.ts` | All TypeScript type definitions for the extension |

### TUI child order (during touch mode)

When touch mode is enabled, `tui.children` is arranged as:

1. `HeaderBarComponent` — spliced into index 0 (sticky, always rendered)
2. *(original pi child)* — pi's own chrome
3. `TouchViewport` — replaces the original chat at `CHAT_CHILD_INDEX`, clips to `rows - fixedHeight`

The `BottomBarComponent` lives as a `belowEditor` widget. The `UtilityOverlayComponent` is a non-capturing overlay anchored top-left.

**Install order matters**: viewport is installed first (grabbing `children[CHAT_CHILD_INDEX]`), then header is spliced at index 0. Reverse order on teardown.

## Key patterns

- **Render context**: All components receive `PhoneShellRenderContext` — a `{ state, getConfig, getLayout, getTheme }` bag. No component imports the state singleton directly; they read through the context.
- **State is centralized**: One mutable `state` object in `state.ts`. Components write to it during render (e.g. `BottomBarComponent` sets `barRow`, `barButtons`). Input handlers and mode functions mutate it directly.
- **Schedule render**: `scheduleRender()` batches renders via `queueMicrotask`. Always use this instead of calling `tui.requestRender()` directly, unless forcing an immediate render.
- **Logging**: `queueLog()` serializes log writes to `~/.pi/agent/logs/pi-phone-3gs-phone-shell.log`. Useful for debugging touch/input issues.
- **Config hot-reload**: `/phone-shell reload-config` re-reads the user's config/layout JSON files without restarting the session.

## Build & type checking

```bash
npm run check    # tsc --noEmit — type check only, no emit
```

This is a Pi package, not a standalone build. There is no bundle step — Pi loads the TypeScript extension directly at runtime via the entry point declared in `package.json`.

## User config files

Per-user files live at `~/.pi/agent/pi-phone-3gs/`:
- `phone-shell.config.json` — behavior settings (viewport paging, overlay, header toggles)
- `phone-shell.layout.json` — button layout (utility buttons, bottom groups)
- `phone-shell.state.json` — session persistence (enabled/autoEnable)

Templates are in `extras/`.
