import { TouchViewport } from "./viewport.js";
import { BottomBarComponent } from "./bar.js";
import { HeaderBarComponent } from "./header.js";
import { PhoneShellEditor, PromptProxyComponent } from "./editor.js";
import {
	BAR_HEIGHT,
	BAR_WIDGET_KEY,
	BOOTSTRAP_WIDGET_KEY,
	CHAT_CHILD_INDEX,
	DISABLE_MOUSE,
	ENABLE_MOUSE,
	HEADER_CHILD_INDEX,
	PRIMARY_COMMAND,
	STATUS_KEY,
	TOGGLE_ALIAS_COMMAND,
	TOGGLE_SHORTCUT,
} from "./defaults.js";
import { savePersistedShellState } from "./config.js";
import { captureUiBindings, getTheme, queueLog, reloadRuntimeSettings, renderContext, scheduleRender, state } from "./state.js";
import { hideModelMenu, hideUtilityOverlay, registerInputHandler, showUtilityOverlay, unregisterInputHandler } from "./input.js";
import type { Component, TUI } from "@mariozechner/pi-tui";

const EMPTY_COMPONENT: Component = {
	render: () => [],
	invalidate: () => {},
};

// ---------------------------------------------------------------------------
// TUI capture
// ---------------------------------------------------------------------------

export function clearCapturedTui(): void {
	state.tui = undefined;
	state.theme = undefined;
	state.setEditorText = undefined;
	state.getEditorText = undefined;
	state.setWidget = undefined;
	state.setEditorComponent = undefined;
	state.mirroredEditor = undefined;
	state.promptProxyInstalled = false;
}

export function captureTui(ctx: { ui: any }): boolean {
	if (state.tui) return true;
	ctx.ui.setWidget(
		BOOTSTRAP_WIDGET_KEY,
		(tui: TUI, theme: any) => {
			state.tui = tui;
			state.theme = theme;
			return EMPTY_COMPONENT;
		},
		{ placement: "belowEditor" },
	);
	ctx.ui.setWidget(BOOTSTRAP_WIDGET_KEY, undefined);
	return Boolean(state.tui);
}

// ---------------------------------------------------------------------------
// Viewport install / uninstall
// ---------------------------------------------------------------------------

function installViewport(): void {
	if (!state.tui) return;
	const current = state.tui.children[CHAT_CHILD_INDEX];
	if (!current) return;
	if (current instanceof TouchViewport) {
		state.viewport = current;
		return;
	}
	state.originalChat = current;
	state.viewport = new TouchViewport(state.tui, current, renderContext);
	state.tui.children[CHAT_CHILD_INDEX] = state.viewport;
	state.viewport.toBottom();
	state.tui.requestRender(true);
	queueLog("viewport installed");
}

function uninstallViewport(): void {
	if (!state.tui || !state.originalChat) return;
	if (state.tui.children[CHAT_CHILD_INDEX] === state.viewport) {
		state.tui.children[CHAT_CHILD_INDEX] = state.originalChat;
		state.tui.requestRender(true);
		queueLog("viewport uninstalled");
	}
	state.viewport = undefined;
	state.originalChat = undefined;
	state.viewportRow = 0;
	state.viewportHeight = 0;
	state.viewportDrag = undefined;
}

// ---------------------------------------------------------------------------
// Header install / uninstall
// ---------------------------------------------------------------------------

function installHeader(): void {
	if (!state.tui || state.headerInstalled) return;
	if (!state.config.header.enabled) return;
	const header = new HeaderBarComponent(renderContext);
	state.tui.children.splice(HEADER_CHILD_INDEX, 0, header);
	state.headerInstalled = true;
	state.tui.requestRender(true);
	queueLog("header installed");
}

function uninstallHeader(): void {
	if (!state.tui || !state.headerInstalled) return;
	const child = state.tui.children[HEADER_CHILD_INDEX];
	if (child instanceof HeaderBarComponent) {
		state.tui.children.splice(HEADER_CHILD_INDEX, 1);
		state.tui.requestRender(true);
		queueLog("header uninstalled");
	}
	state.headerButtons = [];
	state.headerInstalled = false;
}

// ---------------------------------------------------------------------------
// Prompt proxy + editor mirror
// ---------------------------------------------------------------------------

function installMirroredEditor(): void {
	if (!state.setEditorComponent || state.mirroredEditor) return;
	state.setEditorComponent((tui: TUI, theme: any, keybindings: any) => {
		const editor = new PhoneShellEditor(tui, theme, keybindings, () => tui.requestRender());
		state.mirroredEditor = editor;
		queueMicrotask(() => tui.requestRender());
		return editor;
	});
	queueLog("mirrored editor installed");
}

function uninstallMirroredEditor(): void {
	state.setEditorComponent?.(undefined);
	state.mirroredEditor = undefined;
	queueLog("mirrored editor uninstalled");
}

function installPromptProxy(): void {
	if (!state.tui || state.promptProxyInstalled) return;
	const viewportIndex = state.viewport ? state.tui.children.indexOf(state.viewport) : -1;
	if (viewportIndex < 0) return;
	state.tui.children.splice(viewportIndex, 0, new PromptProxyComponent(renderContext));
	state.promptProxyInstalled = true;
	state.tui.requestRender(true);
	queueLog("prompt proxy installed");
}

function uninstallPromptProxy(): void {
	if (!state.tui || !state.promptProxyInstalled) return;
	const index = state.tui.children.findIndex((child) => (child as any) instanceof PromptProxyComponent);
	if (index >= 0) {
		state.tui.children.splice(index, 1);
		state.tui.requestRender(true);
		queueLog("prompt proxy uninstalled");
	}
	state.promptProxyInstalled = false;
}

export function togglePromptProxyMode(): void {
	if (!state.tui) return;
	if (!state.proxyOnly) {
		// switch to proxy-only
		installMirroredEditor();
		if (!state.promptProxyInstalled) installPromptProxy();
		state.proxyOnly = true;
		queueLog("prompt proxy mode: proxy-only");
		state.tui.requestRender(true);
		// persist
		void savePersistedShellState(state.paths, state.enabled, state.proxyOnly).catch(() => undefined);
		return;
	}
	// switch to native-only
	uninstallPromptProxy();
	uninstallMirroredEditor();
	state.proxyOnly = false;
	queueLog("prompt proxy mode: native-only");
	state.tui.requestRender(true);
	// persist
	void savePersistedShellState(state.paths, state.enabled, state.proxyOnly).catch(() => undefined);
}

// ---------------------------------------------------------------------------
// Bottom bar widget
// ---------------------------------------------------------------------------

function showPanel(): void {
	if (!state.setWidget) return;
	state.setWidget(BAR_WIDGET_KEY, (tui: TUI) => new BottomBarComponent(tui, renderContext), { placement: "belowEditor" });
	queueLog("bar shown");
}

function hidePanel(): void {
	state.setWidget?.(BAR_WIDGET_KEY, undefined, { placement: "belowEditor" });
	state.barRow = 0;
	state.barButtons = [];
	state.barActualHeight = BAR_HEIGHT;
	queueLog("bar hidden");
}

function destroyPanel(): void {
	state.setWidget?.(BAR_WIDGET_KEY, undefined, { placement: "belowEditor" });
	state.barRow = 0;
	state.barButtons = [];
	state.barActualHeight = BAR_HEIGHT;
	queueLog("bar destroyed");
}

// ---------------------------------------------------------------------------
// Mouse tracking
// ---------------------------------------------------------------------------

function enableMouseTracking(): void {
	state.tui?.terminal.write(ENABLE_MOUSE);
	queueLog("mouse tracking enabled");
}

function disableMouseTracking(): void {
	state.tui?.terminal.write(DISABLE_MOUSE);
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
	if (!captureTui(ctx) || !state.tui) {
		ctx.ui.notify("phone-shell: failed to capture TUI instance", "error");
		queueLog("failed to capture TUI instance");
		return;
	}
	state.enabled = true;
	installMirroredEditor();
	installViewport();
	installHeader();
	installPromptProxy();
	showPanel();
	enableMouseTracking();
	registerInputHandler(ctx);
	if (state.config.utilityOverlay.autoOpenOnEnable) showUtilityOverlay();
	if (persist) await savePersistedShellState(state.paths, true).catch(() => undefined);
	ctx.ui.setStatus(STATUS_KEY, touchStatusText());
	if (state.loadErrors.length > 0) {
		ctx.ui.notify(`phone-shell enabled • ${state.loadErrors.length} config warning(s)`, "warning");
	} else {
		ctx.ui.notify("phone-shell enabled", "info");
	}
	queueLog("enabled");
}

export async function disableTouchMode(ctx?: { ui: any }, permanent = false, persist = true): Promise<void> {
	if (!state.enabled && !permanent) return;
	state.enabled = false;
	disableMouseTracking();
	unregisterInputHandler();
	hideModelMenu();
	hideUtilityOverlay();
	hidePanel();
	uninstallPromptProxy();
	uninstallHeader();
	uninstallViewport();
	uninstallMirroredEditor();
	state.statusSink?.(STATUS_KEY, undefined);
	if (permanent) {
		destroyPanel();
		clearCapturedTui();
	}
	if (persist) await savePersistedShellState(state.paths, false).catch(() => undefined);
	ctx?.ui.notify("phone-shell disabled", "info");
	queueLog(`disabled permanent=${permanent}`);
}
