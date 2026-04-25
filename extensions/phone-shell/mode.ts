import type { Component, TUI } from "@mariozechner/pi-tui";
import type { Theme } from "@mariozechner/pi-coding-agent";
import { BottomBarComponent } from "./bar.js";
import { savePersistedShellState } from "./config.js";
import {
	BAR_HEIGHT,
	BAR_WIDGET_KEY,
	BOOTSTRAP_WIDGET_KEY,
	CHAT_CHILD_INDEX,
	DISABLE_MOUSE,
	ENABLE_MOUSE,
	HEADER_CHILD_INDEX,
	NAV_WIDGET_KEY,
	STATUS_KEY,
} from "./defaults.js";
import { PhoneShellEditor } from "./editor.js";
import { HeaderBarComponent } from "./header.js";
import { hideModelsOverlay, hideSkillsOverlay, hideUtilityOverlay, hideViewOverlay, registerInputHandler, showUtilityOverlay, unregisterInputHandler } from "./input.js";
import { captureUiBindings, getTheme, queueLog, reloadRuntimeSettings, renderContext, state } from "./state.js";
import type { PersistedShellState } from "./types.js";
import { NavigationPadComponent } from "./nav.js";
import { TouchViewport } from "./viewport.js";
import type { PiExtensionCtx, EditorTheme, KeybindingsManager } from "./pi-types.js";
import {
	captureEditorContainer,
	installHeader,
	installPhoneShellEditor,
	installTopNavPad,
	installViewport,
	moveEditorToOriginalPosition,
	moveEditorToTop,
	resetNavLayout,
	restoreDefaultEditor,
	uninstallHeader,
	uninstallTopNavPad,
	uninstallViewport,
} from "./layout.js";

const EMPTY_COMPONENT: Component = {
	render: () => [],
	invalidate: () => {},
};

function persistShellState(patch: Partial<PersistedShellState> = {}): Promise<void> {
	return savePersistedShellState(state.paths, {
		enabled: state.shell.enabled,
		proxyOnly: state.shell.proxyOnly,
		barVisible: state.shell.barVisible,
		navPadVisible: state.shell.navPadVisible,
		viewportJumpButtonsVisible: state.shell.viewportJumpButtonsVisible,
		topEditorSendButtonVisible: state.shell.topEditorSendButtonVisible,
		topEditorStashButtonVisible: state.shell.topEditorStashButtonVisible,
		...patch,
	});
}

// ---------------------------------------------------------------------------
// TUI capture
// ---------------------------------------------------------------------------

export function clearCapturedTui(): void {
	state.session.tui = undefined;
	state.session.theme = undefined;
	state.bindings.setEditorText = undefined;
	state.bindings.getEditorText = undefined;
	state.bindings.setWidget = undefined;
	state.bindings.setEditorComponent = undefined;
	state.bindings.abort = undefined;
	state.bindings.isIdle = undefined;
	state.session.editorContainer = undefined;
	state.session.phoneShellEditor = undefined;
	state.session.editorContainerOriginalIndex = undefined;
	state.shell.editorAtTop = false;
	state.ui.overlays.view.visible = false;
	state.ui.overlays.skills.visible = false;
	state.ui.overlays.models.visible = false;
	state.ui.nav.row = 0;
	state.ui.nav.buttons = [];
	state.ui.nav.actualHeight = BAR_HEIGHT;
	state.ui.nav.placement = "hidden";
	state.ui.editor.row = 0;
	state.ui.editor.height = 0;
	state.ui.editor.buttons = [];
}

export function captureTui(ctx: PiExtensionCtx): boolean {
	if (state.session.tui) return true;
	ctx.ui.setWidget(
		BOOTSTRAP_WIDGET_KEY,
		(tui: TUI, theme: Theme) => {
			state.session.tui = tui;
			state.session.theme = theme;
			return EMPTY_COMPONENT;
		},
		{ placement: "belowEditor" },
	);
	ctx.ui.setWidget(BOOTSTRAP_WIDGET_KEY, undefined);
	return Boolean(state.session.tui);
}

// ---------------------------------------------------------------------------
// Editor position + visibility toggles (use layout.ts for TUI manipulation)
// ---------------------------------------------------------------------------

export function toggleEditorPosition(): void {
	if (!state.session.tui || !state.session.editorContainer) return;
	if (!state.shell.proxyOnly) {
		// Switch to proxy mode: move editor to top
		moveEditorToTop();
		state.shell.proxyOnly = true;
		syncNavPadPlacement();
		queueLog("proxy mode: editor at top");
		state.session.tui.requestRender(true);
		void persistShellState().catch((e) => queueLog(`persistShellState failed: ${e}`));
		return;
	}
	// Switch to native mode: restore editor to bottom
	uninstallTopNavPad();
	moveEditorToOriginalPosition();
	state.shell.proxyOnly = false;
	syncNavPadPlacement();
	queueLog("proxy mode: editor at bottom");
	state.session.tui.requestRender(true);
	void persistShellState().catch((e) => queueLog(`persistShellState failed: ${e}`));
}

// ---------------------------------------------------------------------------
// Toggle factory
// ---------------------------------------------------------------------------

type TogglableBooleanKey = "barVisible" | "navPadVisible" | "viewportJumpButtonsVisible" | "topEditorSendButtonVisible" | "topEditorStashButtonVisible";

function makeToggle(key: TogglableBooleanKey, syncFn: () => void = () => {}): () => void {
	return function toggle(): void {
		if (!state.shell.enabled) return;
		state.shell[key] = !state.shell[key];
		syncFn();
		void persistShellState().catch((e) => queueLog(`persistShellState failed: ${e}`));
		state.session.tui?.requestRender(true);
	};
}

export const toggleBottomBar = makeToggle("barVisible", syncBottomWidgets);
export const toggleNavPad = makeToggle("navPadVisible", syncNavPadPlacement);
export const toggleViewportJumpButtons = makeToggle("viewportJumpButtonsVisible");
export const toggleTopEditorSendButton = makeToggle("topEditorSendButtonVisible");
export const toggleTopEditorStashButton = makeToggle("topEditorStashButtonVisible");

// ---------------------------------------------------------------------------
// Bottom widgets (panel + nav pad below editor)
// ---------------------------------------------------------------------------

function showPanel(): void {
	if (!state.bindings.setWidget) return;
	state.bindings.setWidget(BAR_WIDGET_KEY, (tui: TUI) => new BottomBarComponent(tui, renderContext), { placement: "belowEditor" });
	queueLog("bar shown");
}

function hidePanel(): void {
	state.bindings.setWidget?.(BAR_WIDGET_KEY, undefined, { placement: "belowEditor" });
	state.ui.bar.row = 0;
	state.ui.bar.buttons = [];
	state.ui.bar.actualHeight = BAR_HEIGHT;
	state.ui.bar.drag = undefined;
	queueLog("bar hidden");
}

function showBottomNavPad(): void {
	if (!state.bindings.setWidget) return;
	state.bindings.setWidget(NAV_WIDGET_KEY, (tui: TUI) => new NavigationPadComponent(tui, renderContext, "bottom"), { placement: "belowEditor" });
	queueLog("nav shown bottom");
}

function hideBottomNavPad(): void {
	state.bindings.setWidget?.(NAV_WIDGET_KEY, undefined, { placement: "belowEditor" });
	if (state.ui.nav.placement === "bottom") resetNavLayout();
	queueLog("nav hidden bottom");
}

function syncBottomWidgets(): void {
	hideBottomNavPad();
	hidePanel();
	const shouldShowBottomNav = state.shell.enabled && state.shell.navPadVisible && !state.shell.proxyOnly;
	if (shouldShowBottomNav) showBottomNavPad();
	if (state.shell.enabled && state.shell.barVisible) showPanel();
}

function syncNavPadPlacement(): void {
	if (!state.shell.enabled) {
		uninstallTopNavPad();
		hideBottomNavPad();
		resetNavLayout();
		return;
	}
	const shouldShowTopNav = state.shell.navPadVisible && state.shell.proxyOnly && state.shell.editorAtTop;
	if (shouldShowTopNav) installTopNavPad();
	else uninstallTopNavPad();
	syncBottomWidgets();
	if (!shouldShowTopNav && !(state.shell.navPadVisible && !state.shell.proxyOnly)) resetNavLayout();
}

function destroyPanel(): void {
	hideBottomNavPad();
	hidePanel();
	resetNavLayout();
	queueLog("bottom widgets destroyed");
}

// ---------------------------------------------------------------------------
// Mouse tracking
// ---------------------------------------------------------------------------

function enableMouseTracking(): void {
	state.session.tui?.terminal.write(ENABLE_MOUSE);
	queueLog("mouse tracking enabled");
}

function disableMouseTracking(): void {
	state.session.tui?.terminal.write(DISABLE_MOUSE);
	queueLog("mouse tracking disabled");
}

// ---------------------------------------------------------------------------
// Touch mode enable / disable
// ---------------------------------------------------------------------------

function touchStatusText(): string {
	const theme = getTheme();
	return theme.fg("accent", "phone") + theme.fg("dim", " shell");
}

export async function enableTouchMode(ctx: PiExtensionCtx, persist = true): Promise<void> {
	captureUiBindings(ctx);
	await reloadRuntimeSettings(ctx, false);
	if (!captureTui(ctx) || !state.session.tui) {
		ctx.ui.notify("phone-shell: failed to capture TUI instance", "error");
		queueLog("failed to capture TUI instance");
		return;
	}
	state.shell.enabled = true;
	installViewport();
	installHeader();
	captureEditorContainer();
	installPhoneShellEditor();
	syncNavPadPlacement();
	enableMouseTracking();
	registerInputHandler(ctx);
	if (state.config.utilityOverlay.autoOpenOnEnable) showUtilityOverlay();
	if (persist) await persistShellState().catch((e) => queueLog(`persistShellState failed: ${e}`));
	ctx.ui.setStatus(STATUS_KEY, touchStatusText());
	if (state.diagnostics.loadErrors.length > 0) {
		ctx.ui.notify(`phone-shell enabled • ${state.diagnostics.loadErrors.length} config warning(s)`, "warning");
	} else {
		ctx.ui.notify("phone-shell enabled", "info");
	}
	queueLog("enabled");
}

export async function disableTouchMode(ctx?: PiExtensionCtx, permanent = false, persist = true): Promise<void> {
	if (!state.shell.enabled && !permanent) return;
	state.shell.enabled = false;
	disableMouseTracking();
	unregisterInputHandler();
	hideUtilityOverlay();
	hideViewOverlay();
	hideSkillsOverlay();
	hideModelsOverlay();
	restoreDefaultEditor();
	destroyPanel();
	uninstallTopNavPad();
	// Restore editorContainer position BEFORE uninstallHeader so uninstallViewport
	// finds the viewport at children[CHAT_CHILD_INDEX] as expected.
	moveEditorToOriginalPosition();
	state.shell.proxyOnly = false;
	uninstallHeader();
	uninstallViewport();
	state.bindings.statusSink?.(STATUS_KEY, undefined);
	if (permanent) {
		destroyPanel();
		clearCapturedTui();
	}
	if (persist) await persistShellState().catch((e) => queueLog(`persistShellState failed: ${e}`));
	ctx?.ui.notify("phone-shell disabled", "info");
	queueLog(`disabled permanent=${permanent}`);
}
