import type { Component, TUI } from "@mariozechner/pi-tui";
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
import { hideModelsOverlay, hideSkillsOverlay, hideUtilityOverlay, hideViewOverlay, showUtilityOverlay } from "./dropdowns.js";
import { registerInputHandler, unregisterInputHandler } from "./input.js";
import { captureUiBindings, getTheme, queueLog, reloadRuntimeSettings, renderContext, state } from "./state.js";
import type { PersistedShellState } from "./types.js";
import { NavigationPadComponent } from "./nav.js";
import { TouchViewport } from "./viewport.js";

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

export function captureTui(ctx: { ui: any }): boolean {
	if (state.session.tui) return true;
	ctx.ui.setWidget(
		BOOTSTRAP_WIDGET_KEY,
		(tui: TUI, theme: any) => {
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
// Viewport install / uninstall
// ---------------------------------------------------------------------------

function installViewport(): void {
	if (!state.session.tui) return;
	const current = state.session.tui.children[CHAT_CHILD_INDEX];
	if (!current) return;
	if (current instanceof TouchViewport) {
		state.session.viewport = current;
		return;
	}
	state.session.originalChat = current;
	state.session.viewport = new TouchViewport(state.session.tui, current, renderContext);
	state.session.tui.children[CHAT_CHILD_INDEX] = state.session.viewport;
	state.session.viewport.toBottom();
	state.session.tui.requestRender(true);
	queueLog("viewport installed");
}

function uninstallViewport(): void {
	if (!state.session.tui || !state.session.originalChat) return;
	if (state.session.tui.children[CHAT_CHILD_INDEX] === state.session.viewport) {
		state.session.tui.children[CHAT_CHILD_INDEX] = state.session.originalChat;
		state.session.tui.requestRender(true);
		queueLog("viewport uninstalled");
	}
	state.session.viewport = undefined;
	state.session.originalChat = undefined;
	state.ui.viewport.row = 0;
	state.ui.viewport.height = 0;
	state.ui.viewport.buttons = [];
	state.ui.viewport.drag = undefined;
	state.ui.editor.row = 0;
	state.ui.editor.height = 0;
	state.ui.editor.buttons = [];
}

function resetNavLayout(): void {
	state.ui.nav.row = 0;
	state.ui.nav.buttons = [];
	state.ui.nav.actualHeight = BAR_HEIGHT;
	state.ui.nav.placement = "hidden";
}

// ---------------------------------------------------------------------------
// Header install / uninstall
// ---------------------------------------------------------------------------

function installHeader(): void {
	if (!state.session.tui || state.shell.headerInstalled) return;
	if (!state.config.header.enabled) return;
	const header = new HeaderBarComponent(renderContext);
	state.session.tui.children.splice(HEADER_CHILD_INDEX, 0, header);
	state.shell.headerInstalled = true;
	state.session.tui.requestRender(true);
	queueLog("header installed");
}

function uninstallHeader(): void {
	if (!state.session.tui || !state.shell.headerInstalled) return;
	const child = state.session.tui.children[HEADER_CHILD_INDEX];
	if (child instanceof HeaderBarComponent) {
		state.session.tui.children.splice(HEADER_CHILD_INDEX, 1);
		state.session.tui.requestRender(true);
		queueLog("header uninstalled");
	}
	state.ui.headerButtons = [];
	state.shell.headerInstalled = false;
}

// ---------------------------------------------------------------------------
// Editor container management (proxy mode = editorContainer moved to top)
// ---------------------------------------------------------------------------

/**
 * Temporarily installs a custom editor to locate Pi's editorContainer in
 * tui.children, then immediately restores the default editor.
 * After this call Pi's default editor is active; we hold a reference to the
 * Container so we can reposition it for proxy mode.
 */
function installPhoneShellEditor(): void {
	if (!state.bindings.setEditorComponent) return;
	state.bindings.setEditorComponent((tui: TUI, theme: any, keybindings: any) =>
		new PhoneShellEditor(tui, theme, keybindings, () => tui.requestRender()),
	);
	queueLog("phone-shell editor installed");
}

function restoreDefaultEditor(): void {
	state.session.phoneShellEditor = undefined;
	state.ui.editor.row = 0;
	state.ui.editor.height = 0;
	state.ui.editor.buttons = [];
	state.bindings.setEditorComponent?.(undefined);
	queueLog("default editor restored");
}

function captureEditorContainer(): void {
	if (!state.session.tui || !state.bindings.setEditorComponent) return;
	if (state.session.editorContainer) return; // already captured

	let tempEditor: PhoneShellEditor | undefined;
	state.bindings.setEditorComponent((tui: TUI, theme: any, keybindings: any) => {
		tempEditor = new PhoneShellEditor(tui, theme, keybindings, () => tui.requestRender());
		return tempEditor;
	});

	// Pi has synchronously called our factory and done editorContainer.addChild(tempEditor)
	if (tempEditor) {
		for (const child of state.session.tui.children) {
			const c = child as any;
			if (c && Array.isArray(c.children) && c.children.includes(tempEditor)) {
				state.session.editorContainer = c;
				state.session.editorContainerOriginalIndex = state.session.tui.children.indexOf(c);
				queueLog(`editorContainer found at index ${state.session.editorContainerOriginalIndex}`);
				break;
			}
		}
	}

	if (!state.session.editorContainer) {
		queueLog("editorContainer not found — proxy mode disabled");
		return;
	}

	// Restore default editor; we only needed the temp to find the container
	restoreDefaultEditor();
	queueLog("editorContainer captured");
}

/**
 * Move editorContainer to index 1 (right after our HeaderBarComponent).
 * Pi's dialogs / selectors still inject into this Container object by
 * reference, so they automatically appear at the top of the screen.
 */
function moveEditorToTop(): void {
	if (!state.session.tui || !state.session.editorContainer) return;
	const tui = state.session.tui;
	const ec = state.session.editorContainer as any;
	const currentIndex = tui.children.indexOf(ec);
	if (currentIndex === -1) return;
	const targetIndex = state.shell.headerInstalled ? 1 : 0;
	if (currentIndex === targetIndex) {
		state.shell.editorAtTop = true;
		return;
	}
	tui.children.splice(currentIndex, 1);
	tui.children.splice(targetIndex, 0, ec);
	state.shell.editorAtTop = true;
	tui.requestRender(true);
	queueLog(`editorContainer moved to top (was ${currentIndex}, now ${targetIndex})`);
}

/**
 * Restore editorContainer to its original position.
 * Must be called before uninstallHeader so the viewport ends up at
 * children[CHAT_CHILD_INDEX] as expected by uninstallViewport.
 */
function moveEditorToOriginalPosition(): void {
	if (!state.session.tui || !state.session.editorContainer) return;
	const tui = state.session.tui;
	const ec = state.session.editorContainer as any;
	const currentIndex = tui.children.indexOf(ec);
	if (currentIndex === -1) {
		state.shell.editorAtTop = false;
		return;
	}
	const originalIndex = state.session.editorContainerOriginalIndex;
	if (originalIndex === undefined || currentIndex === originalIndex) {
		state.shell.editorAtTop = false;
		return;
	}
	tui.children.splice(currentIndex, 1);
	tui.children.splice(originalIndex, 0, ec);
	state.shell.editorAtTop = false;
	tui.requestRender(true);
	queueLog(`editorContainer restored to index ${originalIndex}`);
}

export function toggleEditorPosition(): void {
	if (!state.session.tui || !state.session.editorContainer) return;
	if (!state.shell.proxyOnly) {
		// Switch to proxy mode: move editor to top
		moveEditorToTop();
		state.shell.proxyOnly = true;
		syncNavPadPlacement();
		queueLog("proxy mode: editor at top");
		state.session.tui.requestRender(true);
		void persistShellState().catch(() => undefined);
		return;
	}
	// Switch to native mode: restore editor to bottom
	uninstallTopNavPad();
	moveEditorToOriginalPosition();
	state.shell.proxyOnly = false;
	syncNavPadPlacement();
	queueLog("proxy mode: editor at bottom");
	state.session.tui.requestRender(true);
	void persistShellState().catch(() => undefined);
}

export function toggleBottomBar(): void {
	if (!state.shell.enabled) return;
	state.shell.barVisible = !state.shell.barVisible;
	syncBottomWidgets();
	void persistShellState().catch(() => undefined);
	state.session.tui?.requestRender(true);
}

export function toggleNavPad(): void {
	if (!state.shell.enabled) return;
	state.shell.navPadVisible = !state.shell.navPadVisible;
	syncNavPadPlacement();
	void persistShellState().catch(() => undefined);
	state.session.tui?.requestRender(true);
}

export function toggleViewportJumpButtons(): void {
	if (!state.shell.enabled) return;
	state.shell.viewportJumpButtonsVisible = !state.shell.viewportJumpButtonsVisible;
	void persistShellState().catch(() => undefined);
	state.session.tui?.requestRender(true);
}

export function toggleTopEditorSendButton(): void {
	if (!state.shell.enabled) return;
	state.shell.topEditorSendButtonVisible = !state.shell.topEditorSendButtonVisible;
	void persistShellState().catch(() => undefined);
	state.session.tui?.requestRender(true);
}

export function toggleTopEditorStashButton(): void {
	if (!state.shell.enabled) return;
	state.shell.topEditorStashButtonVisible = !state.shell.topEditorStashButtonVisible;
	void persistShellState().catch(() => undefined);
	state.session.tui?.requestRender(true);
}

// ---------------------------------------------------------------------------
// Bottom widgets + nav pad placement
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

function installTopNavPad(): void {
	if (!state.session.tui) return;
	const existing = state.session.tui.children.find((child) => child instanceof NavigationPadComponent);
	if (existing instanceof NavigationPadComponent) return;
	const viewportIndex = state.session.viewport ? state.session.tui.children.indexOf(state.session.viewport) : -1;
	if (viewportIndex < 0) return;
	state.session.tui.children.splice(viewportIndex, 0, new NavigationPadComponent(state.session.tui, renderContext, "top"));
	queueLog("nav shown top");
}

function uninstallTopNavPad(): void {
	if (!state.session.tui) return;
	const index = state.session.tui.children.findIndex((child) => child instanceof NavigationPadComponent);
	if (index >= 0) {
		state.session.tui.children.splice(index, 1);
		queueLog("nav hidden top");
	}
	if (state.ui.nav.placement === "top") resetNavLayout();
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

export async function enableTouchMode(ctx: { ui: any }, persist = true): Promise<void> {
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
	if (persist) await persistShellState().catch(() => undefined);
	ctx.ui.setStatus(STATUS_KEY, touchStatusText());
	if (state.diagnostics.loadErrors.length > 0) {
		ctx.ui.notify(`phone-shell enabled • ${state.diagnostics.loadErrors.length} config warning(s)`, "warning");
	} else {
		ctx.ui.notify("phone-shell enabled", "info");
	}
	queueLog("enabled");
}

export async function disableTouchMode(ctx?: { ui: any }, permanent = false, persist = true): Promise<void> {
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
	if (persist) await persistShellState().catch(() => undefined);
	ctx?.ui.notify("phone-shell disabled", "info");
	queueLog(`disabled permanent=${permanent}`);
}
