
# Codebase Audit Refactor — 8 Branches

Working directory: `/Users/danhimebauch/Developer/pi-phone-3gs`
All work happens in `extensions/phone-shell/`.

## Goal
Implement the 8 audit recommendations from the codebase audit, each on its own branch forked from `main`. After each branch, switch back to `main` before starting the next.

## Pre-flight
- Check `git status` and `git branch` to confirm clean state on `main`
- Run `npm run check` to confirm baseline type-check passes

## Branches (in order)

### Branch 1: `refactor/unify-button-rendering`
**Items: #1 + #2 — Unify button rendering, extract padLineToWidth**

Create a shared `renderBoxButton(spec, theme)` in `button-helpers.ts` that returns `{ lines: string[], width: number }`. Move `padLineToWidth` there too. Then update all 6 call sites:
- `button-panel.ts` → use `renderBoxButton` instead of inline rendering
- `header.ts` → `renderButtonRow()` uses `renderBoxButton`
- `overlay.ts` → `ButtonDropdownOverlayComponent.render()` uses `renderBoxButton`
- `viewport.ts` → `renderViewportButton()` uses `renderBoxButton`; imports `padLineToWidth` from `button-helpers`
- `editor.ts` → `renderInlineButton()` uses `renderBoxButton`; imports `padLineToWidth` from `button-helpers`
- `bar.ts` → inline rendering in `BottomBarComponent.render()` uses `renderBoxButton`

After changes: `npm run check` must pass. Commit with message like `refactor: unify button rendering into shared utility`.

### Branch 2: `refactor/parameterize-dropdown-drag`
**Item: #3 — Collapse skills/models drag handlers**

In `input.ts`, replace the 6 nearly-identical functions (`startSkillsDrag`, `updateSkillsDrag`, `finishSkillsDrag`, `startModelsDrag`, `updateModelsDrag`, `finishModelsDrag`) with a parameterized factory. Create helper functions like `createScrollableDragHandlers(kind: "skills" | "models")` that return `{ start, update, finish }` functions. Update all call sites in `registerInputHandler`.

After changes: `npm run check` must pass. Commit with message like `refactor: parameterize skills/models dropdown drag handlers`.

### Branch 3: `refactor/split-input-module`
**Item: #6 — Split input.ts into focused modules**

Split `input.ts` (~550 lines) into:
- `mouse.ts` — `parseMouseInput`, `visualizeInput`, `findHitRegion`, `isPrimaryPointerPress`, `isPrimaryPointerDrag`, `isViewportRow`, `InputResponse` type
- `dropdowns.ts` — all dropdown lifecycle (`showDropdown`, `hideDropdown`, `toggleDropdown`, all overlay aliases), `getSkillsMenuButtons`, `getModelMenuButtons`, `getAvailableModels`, `activateModelButton`, dropdown drag handlers (from branch 2), wheel handlers
- Keep `input.ts` as orchestrator — `registerInputHandler`, `performAction`, `activateButton`, bar/viewport drag

Update imports in `mode.ts`, `commands.ts`, `index.ts`, and `state.ts` as needed.

After changes: `npm run check` must pass. Commit with message like `refactor: split input.ts into mouse.ts, dropdowns.ts, and input.ts`.

### Branch 4: `feat/add-test-infra`
**Item: #8 — Add vitest + config parsing tests**

- Install vitest: `npm install -D vitest`
- Add `"test": "vitest run"` script to `package.json`
- Create `extensions/phone-shell/__tests__/config.test.ts` with tests for:
  - `parseConfig` — valid config, missing fields use defaults, invalid types fall back
  - `parseLayout` — valid layout, invalid buttons are skipped
  - `parseButtonSpec` — each kind (command, input, editorKey, action), invalid kind, missing label
  - `loadFavorites` — valid array, missing file returns defaults, invalid entries produce errors
- Create `extensions/phone-shell/__tests__/button-helpers.test.ts` with tests for:
  - `splitIntoRows` — fits in one row, wraps to multiple, empty input
  - `makeButtonWidth` — correct padding
- Create `extensions/phone-shell/__tests__/commands.test.ts` with tests for:
  - `parseCommandMode` — all known modes, aliases ("up" → "page-up"), unknown returns undefined

After changes: `npm run check` and `npm test` must pass. Commit with message like `feat: add vitest test infrastructure with config and helper tests`.

### Branch 5: `refactor/toggle-overlay-factories`
**Items: #4 + #5 — Toggle factory + overlay state factory**

In `mode.ts`:
- Replace the 5 toggle functions (`toggleBottomBar`, `toggleNavPad`, `toggleViewportJumpButtons`, `toggleTopEditorSendButton`, `toggleTopEditorStashButton`) with a single factory: `function makeToggle(key: keyof ShellModeState, syncFn: () => void)` that returns a toggle function.
- The factory should handle the `!state.shell.enabled` guard, toggle, sync, persist, and render.

In `state.ts`:
- Extract `createDropdownOverlayState(): DropdownOverlayState` factory function
- Use it for all 4 overlay initializers

After changes: `npm run check` must pass. Commit with message like `refactor: extract toggle factory and overlay state factory`.

### Branch 6: `refactor/type-pi-bindings`
**Item: #9 — Replace `any` with proper types**

Create a `pi-types.ts` file that declares the Pi SDK interfaces the extension actually depends on:
- `PiUIBindings` — shape of `state.bindings` (setEditorText, getEditorText, notify, setWidget, etc.)
- `PiEditorContainer` — `{ children: unknown[] }` or whatever shape is observed
- `PiModelRegistry` — `{ getAll(): Model[], getAvailable(): Model[] }`
- `PiExtensionContext` — the `ctx` shape from session_start (hasUI, ui, modelRegistry, model)

Replace all `any` casts in `state.ts`, `mode.ts`, `input.ts`, `editor.ts`, `index.ts` with these types. Remove `as any` casts where possible.

After changes: `npm run check` must pass. Commit with message like `refactor: replace any with typed Pi SDK interfaces`.

### Branch 7: `refactor/extract-layout-orchestration`
**Item: #7 — Extract TUI child manipulation from mode.ts**

Create `layout.ts` that handles all TUI children manipulation:
- `installViewport` / `uninstallViewport`
- `installHeader` / `uninstallHeader`
- `captureEditorContainer` / `moveEditorToTop` / `moveEditorToOriginalPosition`
- `installTopNavPad` / `uninstallTopNavPad`
- `resetNavLayout`

`mode.ts` should import and call these functions but not contain the implementation details. The enable/disable lifecycle, toggle functions, and widget management stay in `mode.ts`.

After changes: `npm run check` must pass. Commit with message like `refactor: extract TUI layout orchestration into layout.ts`.

### Branch 8: `refactor/consistent-error-logging`
**Item: #11 — Replace silent catches with queueLog**

Audit all `.catch(() => undefined)` and bare `try { } catch { }` blocks. Replace with `.catch((e) => queueLog(...))` where appropriate. Leave truly-expected silent catches (e.g., EEXIST on starter files) but document them with a comment.

After changes: `npm run check` must pass. Commit with message like `refactor: replace silent error catches with diagnostic logging`.

## Checklist
- [x] Pre-flight: clean `main`, passing type-check
- [x] Branch 1: unify button rendering (`refactor/unify-button-rendering`)
- [x] Branch 2: parameterize dropdown drag (`refactor/parameterize-dropdown-drag`)
- [x] Branch 3: split input module (`refactor/split-input-module`)
- [x] Branch 4: test infra (`feat/add-test-infra`) — 35 tests, all passing
- [x] Branch 5: toggle + overlay factories (`refactor/toggle-overlay-factories`)
- [x] Branch 6: type Pi bindings (`refactor/type-pi-bindings`)
- [x] Branch 7: extract layout orchestration (`refactor/extract-layout-orchestration`)
- [x] Branch 8: consistent error logging (`refactor/consistent-error-logging`)

All 8 branches type-check clean. `main` untouched.
