
# pi-phone-3gs audit fixes

Fix all issues identified in the audit. Run `npm run check && npm test` after each logical group of changes to keep the bar green throughout.

## Checklist

### 🔴 High
- [ ] **#1 Side-effectful render() calls** — Add a `getLastHeight()` helper to components that need measuring. In `TouchViewport.render()`, `NavigationPadComponent.render()` (top placement), `BottomBarComponent.render()`, and `getEditorRow()` in `editor.ts`, replace `.render(width).length` with a cached height lookup. Implement `lastRenderedHeight` fields in the relevant components, update them at the end of each `render()`, and expose a `getLastHeight()` method. The sibling callers should call `getLastHeight()` instead of re-rendering.

### 🟡 Medium
- [ ] **#2 Double destroyPanel()** — Remove the redundant second `destroyPanel()` call inside the `if (permanent)` block in `disableTouchMode()` (mode.ts:280).
- [ ] **#3 Viewport origin label** — Change `activateButton(viewportButton, "bar")` to `activateButton(viewportButton, "viewport")` in `input.ts:357`. Update the `activateButton` origin union type in both `input.ts` and `dropdowns.ts` to include `"viewport"`.
- [ ] **#4 centerToWidth dead code** — Delete the `centerToWidth` function from `overlay.ts`.
- [ ] **#5 getViewMenuButtons module** — Move `getViewMenuButtons` from `defaults.ts` to `dropdowns.ts`. Update imports.
- [ ] **#6 Nav row coupling** — In `NavigationPadComponent.render()`, always set `state.ui.nav.row` for "bottom" placement (don't delegate to bar). Remove the corresponding row-calculation from `BottomBarComponent.render()`. Nav row for "bottom" = `tui.terminal.rows - footerHeight - nav.actualHeight + 1`.
- [ ] **#7 Dead options** — Remove `middleLineSuffix` and `minHeight` from `RenderButtonGroupsOptions` in `button-panel.ts`. Clean up their usage.
- [ ] **#8 Non-atomic save** — Add a simple in-memory write queue (a chained promise) to `savePersistedShellState` so concurrent calls serialize naturally.

### 🟢 Low
- [ ] **#9 Mouse tests** — Add `__tests__/mouse.test.ts` with table-driven tests for `parseMouseInput`, `findHitRegion`, `isPrimaryPointerPress`, `isPrimaryPointerDrag`.
- [ ] **#10 Phase label** — Rename `"streaming"` phase to `"responding"` in `AgentStateTracker.onTurnEnd()` and update the `AgentPhase` type and `thinkingLevelLabel`-style header rendering that reads it.

### Final
- [ ] `npm run check` passes (0 errors)
- [ ] `npm test` passes (all tests green)
- [ ] Commit all changes
