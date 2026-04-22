Refactor `extensions/phone-shell/index.ts` into well-separated modules with no circular deps.

## Target module graph (no cycles)

```
state.ts → types, defaults, config, header
input.ts → state, types, defaults
mode.ts → state, input, types, components, header, defaults, config
commands.ts → state, mode, config, defaults
index.ts → state, mode, input, commands, header, defaults, config
```

## File responsibilities

### `state.ts` — State singleton + shared utilities
- `RuntimeState` type (extends PhoneShellRenderState)
- `state` singleton (initial values)
- `renderContext` object
- `getTheme()`, `queueLog()`, `scheduleRender()`, `setLastAction()`
- `captureUiBindings(ctx)`
- `reloadRuntimeSettings(ctx, notifyOnProblems?)`
- `getStatusReport()`, `getLogTail()`

### `input.ts` — Input handling + action dispatch
- `parseMouseInput()`, `isPrimaryPointerPress()`, `visualizeInput()`
- `performAction()`, `activateButton()`, `findHitRegion()`
- `registerInputHandler(ctx)`, `unregisterInputHandler()`

### `mode.ts` — Touch mode lifecycle
- `captureTui()`, `clearCapturedTui()`
- `installViewport()` / `uninstallViewport()`
- `installHeader()` / `uninstallHeader()`
- `showPanel()` / `hidePanel()` / `destroyPanel()`
- `showUtilityOverlay()` / `hideUtilityOverlay()` / `toggleUtilityOverlay()`
- `enableMouseTracking()` / `disableMouseTracking()`
- `enableTouchMode()` / `disableTouchMode()`

### `commands.ts` — Slash commands
- `parseCommandMode()`, `commandItems()`
- `handlePrimaryCommand()`

### `index.ts` — Extension entry point (~100 lines)
- `wireAgentEvents()`
- `phoneShellExtension()` default export
- Registers commands, shortcuts, session lifecycle events

## Checklist
- [ ] Create `state.ts`
- [ ] Create `input.ts`
- [ ] Create `mode.ts`
- [ ] Create `commands.ts`
- [ ] Rewrite `index.ts` as thin entry point
- [ ] Verify no circular imports
- [ ] Verify build passes
