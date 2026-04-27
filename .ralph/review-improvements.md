
# pi-phone-3gs Review Improvements

Improve all issues identified in the code review, working through the codebase systematically.

## Checklist

### 🔴 High priority
- [x] Replace `setInterval` with recursive `setTimeout` in viewport momentum animation (`viewport.ts`)
- [x] Prevent recursive render risk in `TouchViewport.render()` — avoid calling `child.render()` on siblings during own render; use cached/deferred height computation instead
- [x] Add defensive fallback for `editorContainer` capture — if scan fails, disable proxy mode gracefully with a user-visible warning

### 🟡 Medium priority
- [x] Add a `resetState()` helper to `state.ts` so `session_shutdown` doesn't need to manually clear ~15 fields (prevent leaks from missed fields)
- [x] Add vertical bounds check in `dropdowns.ts:showDropdown()` — clamp overlay height to available terminal rows
- [x] Make `BottomBarComponent` row calculation less fragile — avoid depending on rendering the footer child to compute position
- [x] Improve type safety for `editorContainer` — add a branded type or runtime guard instead of raw `as unknown as Component` cast
- [x] Add a dev-time guard for the `activateButton` circular dependency — log a warning if `_activateButton` is called while still the default no-op

### 🟢 Low priority / nits
- [x] Fix `MomentumState.AnimationFrame` PascalCase → `animationFrame` camelCase
- [x] Add in-memory cache for `savePersistedShellState` to avoid read-before-write on every toggle
- [x] Add basic render-level tests for viewport, header, bar, editor (at least smoke tests with mocked TUI)

## Rules
- Always run `npm run check` after changes to verify type safety
- Always run `npm test` after changes to verify existing tests pass
- Never commit directly on main
- Each logical group of changes should be a separate commit with semantic prefix
