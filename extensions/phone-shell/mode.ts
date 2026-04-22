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
	STATUS_KEY,
} from "./defaults.js";
import { PhoneShellEditor, PromptProxyComponent } from "./editor.js";
import { HeaderBarComponent } from "./header.js";
import { hideUtilityOverlay, hideViewOverlay, registerInputHandler, showUtilityOverlay, unregisterInputHandler } from "./input.js";
import { captureUiBindings, getTheme, queueLog, reloadRuntimeSettings, renderContext, state } from "./state.js";
import type { PersistedShellState } from "./types.js";
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
		viewportJumpButtonsVisible: state.shell.viewportJumpButtonsVisible,
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
	state.session.mirroredEditor = undefined;
	state.shell.promptProxyInstalled = false;
	state.ui.overlays.view.visible = false;
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
// Prompt proxy + editor mirror
// ---------------------------------------------------------------------------

function installMirroredEditor(): void {
	if (!state.bindings.setEditorComponent || state.session.mirroredEditor) return;
	state.bindings.setEditorComponent((tui: TUI, theme: any, keybindings: any) => {
		const editor = new PhoneShellEditor(tui, theme, keybindings, () => tui.requestRender(), () => state.shell.proxyOnly);
		state.session.mirroredEditor = editor;
		queueMicrotask(() => tui.requestRender());
		return editor;
	});
	queueLog("mirrored editor installed");
}

function uninstallMirroredEditor(): void {
	state.bindings.setEditorComponent?.(undefined);
	state.session.mirroredEditor = undefined;
	queueLog("mirrored editor uninstalled");
}

function installPromptProxy(): void {
	if (!state.session.tui || state.shell.promptProxyInstalled) return;
	const viewportIndex = state.session.viewport ? state.session.tui.children.indexOf(state.session.viewport) : -1;
	if (viewportIndex < 0) return;
	state.session.tui.children.splice(viewportIndex, 0, new PromptProxyComponent(renderContext));
	state.shell.promptProxyInstalled = true;
	state.session.tui.requestRender(true);
	queueLog("prompt proxy installed");
}

function uninstallPromptProxy(): void {
	if (!state.session.tui || !state.shell.promptProxyInstalled) return;
	const index = state.session.tui.children.findIndex((child) => (child as any) instanceof PromptProxyComponent);
	if (index >= 0) {
		state.session.tui.children.splice(index, 1);
		state.session.tui.requestRender(true);
		queueLog("prompt proxy uninstalled");
	}
	state.shell.promptProxyInstalled = false;
}

export function togglePromptProxyMode(): void {
	if (!state.session.tui) return;
	if (!state.shell.proxyOnly) {
		// switch to proxy-only
		installMirroredEditor();
		if (!state.shell.promptProxyInstalled) installPromptProxy();
		state.shell.proxyOnly = true;
		queueLog("prompt proxy mode: proxy-only");
		state.session.tui.requestRender(true);
		// persist
		void persistShellState().catch(() => undefined);
		return;
	}
	// switch to native-only
	uninstallPromptProxy();
	uninstallMirroredEditor();
	state.shell.proxyOnly = false;
	queueLog("prompt proxy mode: native-only");
	state.session.tui.requestRender(true);
	// persist
	void persistShellState().catch(() => undefined);
}

export function toggleBottomBar(): void {
	if (!state.shell.enabled) return;
	if (state.shell.barVisible) {
		hidePanel();
		state.shell.barVisible = false;
	} else {
		showPanel();
		state.shell.barVisible = true;
	}
	void persistShellState().catch(() => undefined);
	state.session.tui?.requestRender(true);
}

export function toggleViewportJumpButtons(): void {
	if (!state.shell.enabled) return;
	state.shell.viewportJumpButtonsVisible = !state.shell.viewportJumpButtonsVisible;
	void persistShellState().catch(() => undefined);
	state.session.tui?.requestRender(true);
}

// ---------------------------------------------------------------------------
// Bottom bar widget
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
	queueLog("bar hidden");
}

function destroyPanel(): void {
	state.bindings.setWidget?.(BAR_WIDGET_KEY, undefined, { placement: "belowEditor" });
	state.ui.bar.row = 0;
	state.ui.bar.buttons = [];
	state.ui.bar.actualHeight = BAR_HEIGHT;
	queueLog("bar destroyed");
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
	if (state.shell.barVisible) showPanel();
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
	hidePanel();
	uninstallPromptProxy();
	uninstallHeader();
	uninstallViewport();
	uninstallMirroredEditor();
	state.bindings.statusSink?.(STATUS_KEY, undefined);
	if (permanent) {
		destroyPanel();
		clearCapturedTui();
	}
	if (persist) await persistShellState().catch(() => undefined);
	ctx?.ui.notify("phone-shell disabled", "info");
	queueLog(`disabled permanent=${permanent}`);
}
