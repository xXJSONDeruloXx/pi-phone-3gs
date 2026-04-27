/**
 * layout.ts — TUI child-tree manipulation for phone-shell.
 *
 * This module owns all direct mutations of `tui.children`. Mode lifecycle
 * (enable/disable/toggle) stays in mode.ts; this module just handles the
 * low-level install/uninstall/move operations.
 */
import type { Component } from "@mariozechner/pi-tui";
import {
	BAR_HEIGHT,
	CHAT_CHILD_INDEX,
	HEADER_CHILD_INDEX,
} from "./defaults.js";
import { PhoneShellEditor } from "./editor.js";
import { HeaderBarComponent } from "./header.js";
import { NavigationPadComponent } from "./nav.js";
import { TouchViewport } from "./viewport.js";
import { queueLog, renderContext, state } from "./state.js";

// ---------------------------------------------------------------------------
// Viewport install / uninstall
// ---------------------------------------------------------------------------

export function installViewport(): void {
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

export function uninstallViewport(): void {
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

// ---------------------------------------------------------------------------
// Nav layout reset (shared utility)
// ---------------------------------------------------------------------------

export function resetNavLayout(): void {
	state.ui.nav.row = 0;
	state.ui.nav.buttons = [];
	state.ui.nav.actualHeight = BAR_HEIGHT;
	state.ui.nav.placement = "hidden";
}

// ---------------------------------------------------------------------------
// Header install / uninstall
// ---------------------------------------------------------------------------

export function installHeader(): void {
	if (!state.session.tui || state.shell.headerInstalled) return;
	if (!state.config.header.enabled) return;
	const header = new HeaderBarComponent(renderContext);
	state.session.tui.children.splice(HEADER_CHILD_INDEX, 0, header);
	state.shell.headerInstalled = true;
	state.session.tui.requestRender(true);
	queueLog("header installed");
}

export function uninstallHeader(): void {
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

export function installPhoneShellEditor(): void {
	if (!state.bindings.setEditorComponent) return;
	state.bindings.setEditorComponent((tui, theme, keybindings) =>
		new PhoneShellEditor(tui, theme, keybindings, () => tui.requestRender()),
	);
	queueLog("phone-shell editor installed");
}

export function restoreDefaultEditor(): void {
	state.session.phoneShellEditor = undefined;
	state.ui.editor.row = 0;
	state.ui.editor.height = 0;
	state.ui.editor.buttons = [];
	state.bindings.setEditorComponent?.(undefined);
	queueLog("default editor restored");
}

/**
 * Branded type for a discovered editorContainer.
 *
 * We only depend on the Container having `children` and being usable as a
 * TUI child (for splice operations). The brand prevents accidental use of
 * an arbitrary object without going through the discovery function.
 */
export interface DiscoveredEditorContainer {
	readonly children: unknown[];
	readonly __brand: unique symbol;
}

function asTuiChild(ec: DiscoveredEditorContainer): Component {
	return ec as unknown as Component;
}

export function captureEditorContainer(): void {
	if (!state.session.tui || !state.bindings.setEditorComponent) return;
	if (state.session.editorContainer) return; // already captured

	let tempEditor: PhoneShellEditor | undefined;
	state.bindings.setEditorComponent((tui, theme, keybindings) => {
		tempEditor = new PhoneShellEditor(tui, theme, keybindings, () => tui.requestRender());
		return tempEditor;
	});

	// Pi has synchronously called our factory and done editorContainer.addChild(tempEditor)
	if (tempEditor) {
		for (const child of state.session.tui.children) {
			const c = child as { children?: unknown[] } | undefined;
			if (c && Array.isArray(c.children) && c.children.includes(tempEditor)) {
				state.session.editorContainer = c as unknown as DiscoveredEditorContainer;
				state.session.editorContainerOriginalIndex = state.session.tui.children.indexOf(child);
				queueLog(`editorContainer found at index ${state.session.editorContainerOriginalIndex}`);
				break;
			}
		}
	}

	if (!state.session.editorContainer) {
		queueLog("editorContainer not found — proxy mode disabled");
		state.bindings.notify?.("phone-shell: proxy mode unavailable (editor container not found)", "warning");
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
export function moveEditorToTop(): void {
	if (!state.session.tui || !state.session.editorContainer) return;
	const tui = state.session.tui;
	const ec = asTuiChild(state.session.editorContainer);
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
export function moveEditorToOriginalPosition(): void {
	if (!state.session.tui || !state.session.editorContainer) return;
	const tui = state.session.tui;
	const ec = asTuiChild(state.session.editorContainer);
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

// ---------------------------------------------------------------------------
// Top nav pad install / uninstall
// ---------------------------------------------------------------------------

export function installTopNavPad(): void {
	if (!state.session.tui) return;
	const existing = state.session.tui.children.find((child) => child instanceof NavigationPadComponent);
	if (existing instanceof NavigationPadComponent) return;
	const viewportIndex = state.session.viewport ? state.session.tui.children.indexOf(state.session.viewport) : -1;
	if (viewportIndex < 0) return;
	state.session.tui.children.splice(viewportIndex, 0, new NavigationPadComponent(state.session.tui, renderContext, "top"));
	queueLog("nav shown top");
}

export function uninstallTopNavPad(): void {
	if (!state.session.tui) return;
	const index = state.session.tui.children.findIndex((child) => child instanceof NavigationPadComponent);
	if (index >= 0) {
		state.session.tui.children.splice(index, 1);
		queueLog("nav hidden top");
	}
	if (state.ui.nav.placement === "top") resetNavLayout();
}
