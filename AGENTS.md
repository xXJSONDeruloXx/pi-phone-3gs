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

`main` is sacred. It must always be in a known-good, tested state. A broken `main` means the user cannot even start pi until they manually revert — this has happened before and must never happen again.

### Rules

1. **Always cut a new branch from `main` BEFORE writing any code.**
   - No exceptions — not even for one-line fixes, not even for typos.
   - **Before editing any file, verify `git branch --show-current` is not `main`.**
   - If you are on `main`, stop and create a branch first.
2. **Never commit directly on `main`.**
   - If you realize you've started coding on `main`, stash, create a branch, pop the stash, then continue.
3. **Never push `main` yourself.**
   - Only the user may push to `main`.
   - The agent may push feature branches to `origin`, but `main` pushes are exclusively the user's decision.
4. **Merge to `main` only after explicit user confirmation.**
   - The user saying **"merge `<branch>` into `main` and push `main`"** (or equivalent) means they have tested the branch and approve.
   - Until those exact words (or clear equivalent), the branch stays separate.
   - **Special case:** If you are already on a feature branch and the user says "merge this branch into main and push main",
     you may merge the current branch into `main` and push `main` directly — no need to create a new branch.
5. **After merging to `main` and pushing, start fresh.**
   - After `main` is updated, the next feature starts with a **new branch from `main`**.
   - The cycle resets: `main` → new branch → implement → test → user approves → merge to `main` → push `main` → repeat.
6. **Keep `main` as the last known-good fallback.**
   - If a branch breaks something, the user can `git checkout main` and immediately have a working shell again.
7. **Type checks pass ≠ tested.**
   - `npm run check` only catches compile errors.
   - Runtime rendering bugs (off-by-one column math, hit region misalignment, layout blowups) will pass type checking but break the shell.
   - Only the user reloading pi counts as tested.

### Notes on Pi's interactive workflow

- **Pi's interactive session state lives outside this repo** in `~/.pi/agent/`:
  - Session files: `~/.pi/agent/sessions/<encoded-cwd>/`
  - Extension config: `~/.pi/agent/pi-phone-3gs/` (user overrides of config/layout/favorites/state)
  - Logs: `~/.pi/agent/logs/`
- Commands like `/recent` and `/ptree` are **extension commands** that run inside Pi's interactive TUI.
  - They are not shell commands, not repo scripts, and not part of the branch workflow.
  - The user may say "test `/ptree`" or "run `/recent`" — they mean *inside the running Pi session*, not in this repo.
- **Typical validated flow:**
  1. Agent creates branch `feat/foo` from `main`, implements, commits, pushes branch.
  2. User tests in Pi (`/reload`, tries the feature).
  3. User says: "looks good, merge `feat/foo` into `main` and push `main`".
  4. Agent merges `feat/foo` → `main`, pushes `main`.
  5. Now on `main` — next feature starts a NEW branch from `main`.
  6. Cleanup: delete merged branch (agent or user).

## Width-safety rules (no exceptions)

Pi's TUI system enforces a strict contract: every line returned from `render(width)` must not exceed `width` visible columns. Overflowing lines crash the TUI or cause visual corruption. Pi's own components (tree selector, select list, text, etc.) all follow this pattern, and the TUI renderer has a final-guard `sliceByColumn` as a backstop.

### The rule

Every `render(width)` method must ensure **every returned line** is clamped to `width` visible columns before returning. The approved mechanism is `padLineToWidth(line, width)` from `button-helpers.ts`, which:
1. Calls `truncateToWidth(line, width, "", true)` — ANSI-aware truncation with right-padding to exactly `width`
2. Appends `\x1b[0m` — full SGR reset to prevent ANSI bleed across lines

`truncateToWidth` alone is *not sufficient* — it truncates but does not reset ANSI state, so a trailing color code can bleed into the next line during differential rendering.

### Where to apply

- **All `render()` return values** — every Component in this project must clamp its output lines.
- **Overlay lines** — even though the TUI compositor has a defensive truncation guard, we clamp at the source to keep lines clean and avoid edge-case drift.
- **Viewport visible slice** — the `TouchViewport` clips chat content, but must also clamp each visible line since the underlying content may not respect our width.

### Current enforcement

| File | Component / function | Clamp method |
|---|---|---|
| `header.ts` | `HeaderBarComponent.render()` | `padLineToWidth` on each of 3 lines |
| `bar.ts` | `BottomBarComponent.render()` | `padLineToWidth` on each of 3 lines |
| `button-panel.ts` | `renderButtonGroups()` return | `.map(line => padLineToWidth(line, width))` |
| `nav.ts` | `NavigationPadComponent.render()` | `.map(line => padLineToWidth(line, width))` |
| `overlay.ts` | `ButtonDropdownOverlayComponent.render()` | `.map(line => padLineToWidth(line, width))` |
| `viewport.ts` | `TouchViewport.render()` | `.map(line => padLineToWidth(line, width))` on visible slice |
| `editor.ts` | `PhoneShellEditor.render()` | `padLineToWidth(result, width)` on each composed line |

### When adding new components or render paths

1. **Always end `render()` with `.map(line => padLineToWidth(line, width))`** unless every line is already constructed with `padLineToWidth`.
2. **Never return raw concatenated strings** without a final `padLineToWidth` pass — even if the math looks right, ANSI codes and wide chars can cause visible-width drift.
3. **Never use `truncateToWidth` alone as the final step** — it does not reset ANSI state. Use `padLineToWidth` which does both truncate+pad+reset.
4. **Test narrow terminals** — a 20-column terminal should not crash or corrupt. The phone is the primary target; width can be very small.

### Why this matters

Pi's TUI does differential rendering — it compares old and new lines and only redraws changed lines. A line that is one column too wide causes the cursor to wrap, shifting all subsequent lines down by one row. This cascades into a visual blowup that is very hard to diagnose. The TUI has a final-guard `sliceByColumn` in its compositor, but that only handles overlays — component-level output has no automatic backstop.

## Build & type checking

```bash
npm run check    # tsc --noEmit — type check only, no emit
```

This is a Pi package, not a standalone build. There is no bundle step — Pi loads the TypeScript extension directly at runtime via the entry point declared in `package.json`.

## Testing changes

After any code change, the user must run `/reload` in pi to pick up the modified extension. The agent should always remind the user to `/reload` when changes are ready to test.

## User config files

Per-user files live at `~/.pi/agent/pi-phone-3gs/`:
- `phone-shell.config.json` — behavior settings (viewport paging, overlays, render/input behavior)
- `phone-shell.layout.json` — utility buttons and grouped panel layout
- `phone-shell.favorites.json` — favorites rail entries shown in the scrollable bottom bar
- `phone-shell.state.json` — session persistence (`enabled`, `autoEnable`, bar/nav visibility, proxy/editor position state)

Templates are in `extras/`, including `phone-shell.favorites.example.json`.

## Lessons learned / common pitfalls

### User layout files override defaults completely

When `~/.pi/agent/pi-phone-3gs/phone-shell.layout.json` exists, it **completely overrides** `defaults.ts`. Changes to `defaults.ts` alone will NOT show up for existing users.

**Fix**: Always update the user's layout file at `~/.pi/agent/pi-phone-3gs/phone-shell.layout.json` in addition to `defaults.ts`.

### Adding new button actions — full checklist

When adding a new `ShellAction` (button action handler), you must update **4 files**:

1. **`types.ts`** — Add to `ShellAction` type union
2. **`input.ts`** — Add case handler in `performAction()` function
3. **`config.ts`** — Add to `ACTIONS` array for config validation (critical!)
4. **`defaults.ts`** — Update `utilityButtons` or other button arrays for new installations

Also update the user's `~/.pi/agent/pi-phone-3gs/phone-shell.layout.json` for existing users.

**Common mistake**: Forgetting to add the action to `config.ts`'s `ACTIONS` array. The config loader will reject the action as invalid, and the button won't appear.

### Terminal key combos (Cmd, Ctrl) can't be sent as PTY input

macOS key combos like Cmd+T, Cmd+W, Ctrl+Tab are intercepted by the terminal app **before** they reach the PTY shell. There are no standard escape sequences for these.

**Correct approach for terminal app control**: Use AppleScript via `osascript`:
```typescript
import { execSync } from "child_process";
execSync(`osascript -e 'tell application "System Events" to keystroke "t" using command down'`);
```

Use `kind: "action"` buttons with a handler in `performAction()`, not `kind: "input"` with escape sequences.

**Requirements**: Terminal app needs Accessibility permissions (System Settings > Privacy & Security > Accessibility).

### Dropdown scrolling

The utility dropdown scrolls when there are more buttons than fit on screen. Look for:
- `▲` at top border = can scroll up
- `▼` at bottom border = can scroll down

New buttons may not be visible without scrolling.

### Button kind selection

| Goal | Button kind | Example |
|------|-------------|--------|
| Send slash command | `command` | `{ kind: "command", command: "/reload" }` |
| Send raw terminal bytes | `input` | `{ kind: "input", data: "\x03" }` (Ctrl+C) |
| Call action handler | `action` | `{ kind: "action", action: "scrollTop" }` |
| Editor-aware keystroke | `editorKey` | `{ kind: "editorKey", data: "\t" }` |
