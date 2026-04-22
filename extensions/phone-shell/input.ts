import { Key, matchesKey } from "@mariozechner/pi-tui";
import { BAR_HEIGHT, getViewMenuButtons, HEADER_HEIGHT } from "./defaults.js";
import { queueLog, scheduleRender, setLastAction, state } from "./state.js";
import { toggleBottomBar, toggleEditorPosition, toggleNavPad, toggleViewportJumpButtons } from "./mode.js";
import type {
	ButtonHitRegion,
	ButtonSpec,
	MouseInput,
	ShellAction,
} from "./types.js";

// ---------------------------------------------------------------------------
// Mouse helpers
// ---------------------------------------------------------------------------

export function parseMouseInput(data: string): MouseInput | undefined {
	const match = data.match(/^\x1b\[<(\d+);(\d+);(\d+)([Mm])$/);
	if (!match) return undefined;
	const code = Number.parseInt(match[1]!, 10);
	return {
		raw: data,
		code,
		col: Number.parseInt(match[2]!, 10),
		row: Number.parseInt(match[3]!, 10),
		phase: match[4] === "m" ? "release" : ((code & 32) !== 0 ? "move" : "press"),
	};
}

function isPrimaryPointerPress(mouse: MouseInput): boolean {
	if (mouse.phase !== "press") return false;
	if ((mouse.code & 64) !== 0) return false;
	return (mouse.code & 0b11) === 0;
}

function isPrimaryPointerDrag(mouse: MouseInput): boolean {
	if (mouse.phase !== "move") return false;
	if ((mouse.code & 64) !== 0) return false;
	return (mouse.code & 0b11) === 0;
}

export function visualizeInput(data: string): string {
	return JSON.stringify(
		data.replace(/\x1b/g, "<ESC>").replace(/[\x00-\x1f\x7f]/g, (char) => {
			if (char === "\n") return "<LF>";
			if (char === "\r") return "<CR>";
			if (char === "\t") return "<TAB>";
			const code = char.charCodeAt(0).toString(16).padStart(2, "0");
			return `<0x${code}>`;
		}),
	);
}

// ---------------------------------------------------------------------------
// Hit testing
// ---------------------------------------------------------------------------

export function findHitRegion(buttons: ButtonHitRegion[], rowOffset: number, col: number): ButtonSpec | undefined {
	for (const region of buttons) {
		if (region.rowOffset === rowOffset && col >= region.colStart && col <= region.colEnd) return region.button;
	}
	return undefined;
}

function isViewportRow(row: number): boolean {
	return state.ui.viewport.row > 0 && row >= state.ui.viewport.row && row < state.ui.viewport.row + state.ui.viewport.height;
}

// ---------------------------------------------------------------------------
// Bar horizontal drag (panning strip)
// ---------------------------------------------------------------------------

function startBarDrag(mouse: MouseInput): InputResponse {
	state.ui.bar.drag = {
		anchorCol: mouse.col,
		anchorScrollX: state.ui.bar.scrollX,
		phase: "potential-tap",
		tapCol: mouse.col,
		tapRow: mouse.row,
	};
	setLastAction("mouse:bar-drag-start");
	return { consume: true };
}

function updateBarDrag(mouse: MouseInput): InputResponse {
	if (!state.ui.bar.drag) return { consume: true };
	const delta = mouse.col - state.ui.bar.drag.anchorCol;
	if (Math.abs(delta) > 2) state.ui.bar.drag.phase = "dragging";
	if (state.ui.bar.drag.phase === "dragging") {
		state.ui.bar.scrollX = Math.max(0, Math.min(state.ui.bar.maxScrollX, state.ui.bar.drag.anchorScrollX - delta));
		scheduleRender();
	}
	return { consume: true };
}

function finishBarDrag(mouse: MouseInput): InputResponse {
	if (!state.ui.bar.drag) return { consume: true };
	const drag = state.ui.bar.drag;
	state.ui.bar.drag = undefined;
	if (drag.phase === "potential-tap") {
		const button = findHitRegion(state.ui.bar.buttons, 0, drag.tapCol);
		if (button) return activateButton(button, "bar");
	}
	setLastAction("mouse:bar-drag-end");
	return { consume: true };
}

// ---------------------------------------------------------------------------
// Viewport drag
// ---------------------------------------------------------------------------

function startViewportDrag(mouse: MouseInput): InputResponse {
	const debug = state.session.viewport?.getDebugState();
	if (!debug) return { consume: true };
	state.ui.viewport.drag = {
		anchorRow: mouse.row,
		anchorScrollTop: debug.scrollTop,
		lastRow: mouse.row,
	};
	setLastAction("mouse:viewport-drag-start");
	return { consume: true };
}

function updateViewportDrag(mouse: MouseInput): InputResponse {
	if (!state.ui.viewport.drag || !state.session.viewport) return { consume: true };
	const deltaRows = mouse.row - state.ui.viewport.drag.anchorRow;
	state.ui.viewport.drag.lastRow = mouse.row;
	state.session.viewport.setScrollTop(state.ui.viewport.drag.anchorScrollTop - deltaRows);
	return { consume: true };
}

function finishViewportDrag(mouse: MouseInput): InputResponse {
	if (!state.ui.viewport.drag) return { consume: true };
	const moved = Math.abs(mouse.row - state.ui.viewport.drag.anchorRow);
	state.ui.viewport.drag = undefined;
	if (moved > 0) setLastAction("mouse:viewport-drag-end");
	return { consume: true };
}

// ---------------------------------------------------------------------------
// Action dispatch
// ---------------------------------------------------------------------------

type InputResponse = { consume?: boolean; data?: string } | undefined;

export function performAction(action: ShellAction): InputResponse {
	switch (action) {
		case "toggleUtilities":
			toggleUtilityOverlay();
			return { consume: true };
		case "toggleViewMenu":
			toggleViewOverlay();
			return { consume: true };
		case "toggleBottomBar":
			toggleBottomBar();
			return { consume: true };
		case "toggleEditorPosition":
			toggleEditorPosition();
			return { consume: true };
		case "toggleNavPad":
			toggleNavPad();
			return { consume: true };
		case "toggleViewportJumpButtons":
			toggleViewportJumpButtons();
			return { consume: true };
		case "scrollTop":
			state.session.viewport?.toTop();
			return { consume: true };
		case "pageUp":
			state.session.viewport?.pageUp();
			return { consume: true };
		case "cycleModel":
			return { data: state.config.inputs.modelCycle };
		case "pageDown":
			state.session.viewport?.pageDown();
			return { consume: true };
		case "scrollBottom":
			state.session.viewport?.toBottom();
			return { consume: true };
		case "sendEscape":
			return { data: "\x1b" };
		case "sendInterrupt":
			return { data: "\x03" };
		case "sendFollowUp":
			return { data: state.config.inputs.followUp };
		case "openSlash":
			state.bindings.setEditorText?.("");
			scheduleRender();
			return { data: "/" };
		case "arrowLeft":
			return { data: "\x1b[D" };
		case "arrowUp":
			return { data: "\x1b[A" };
		case "arrowDown":
			return { data: "\x1b[B" };
		case "arrowRight":
			return { data: "\x1b[C" };
		case "sendEnter":
			return { data: "\r" };
	}
}

export function activateButton(button: ButtonSpec, origin: "utility" | "view" | "bar" | "nav" | "header"): InputResponse {
	setLastAction(`${origin}:${button.id}`);

	const shouldAutoHideOverlay = (origin === "utility" || origin === "view") && !state.config.utilityOverlay.keepOpenAfterButtonActivation;
	const maybeHideOverlay = (force = false) => {
		if (!force && !shouldAutoHideOverlay) return;
		if (origin === "utility") hideUtilityOverlay();
		if (origin === "view") hideViewOverlay();
	};

	if (button.kind === "command") {
		state.bindings.setEditorText?.(button.command);
		maybeHideOverlay();
		scheduleRender();
		return { data: "\r" };
	}

	if (button.kind === "input") {
		maybeHideOverlay();
		return { data: button.data };
	}

	if (button.kind === "editorKey") {
		if (button.clearFirst) {
			state.bindings.setEditorText?.(button.setText ?? "");
		} else if (button.setText !== undefined) {
			state.bindings.setEditorText?.(button.setText);
		}
		maybeHideOverlay();
		scheduleRender();
		return { data: button.data };
	}

	const result = performAction(button.action);
	if (origin === "view") maybeHideOverlay(true);
	else maybeHideOverlay();
	return result;
}

// ---------------------------------------------------------------------------
// Utility overlay management
// (lives here because performAction needs toggleUtilityOverlay and mode.ts
//  imports from this module — no circular dep since input.ts never imports mode)
// ---------------------------------------------------------------------------

import { ButtonDropdownOverlayComponent, getDropdownInnerWidth } from "./overlay.js";
import { renderContext } from "./state.js";

type DropdownKind = "utility" | "view";

function getDropdownButtons(kind: DropdownKind): ButtonSpec[] {
	return kind === "utility" ? state.layout.utilityButtons : getViewMenuButtons(state.shell);
}

function getDropdownAnchorButtonId(kind: DropdownKind): string {
	return kind === "utility" ? "header-file" : "header-view";
}

function getDropdownHandle(kind: DropdownKind) {
	return kind === "utility" ? state.ui.overlays.utility.handle : state.ui.overlays.view.handle;
}

function setDropdownLayoutState(kind: DropdownKind, hitRegions: ButtonHitRegion[], actualHeight: number): void {
	if (kind === "utility") {
		state.ui.overlays.utility.buttons = hitRegions;
		state.ui.overlays.utility.actualHeight = actualHeight;
		return;
	}
	state.ui.overlays.view.buttons = hitRegions;
	state.ui.overlays.view.actualHeight = actualHeight;
}

function setDropdownPlacement(kind: DropdownKind, row: number, col: number, width: number): void {
	if (kind === "utility") {
		state.ui.overlays.utility.row = row;
		state.ui.overlays.utility.col = col;
		state.ui.overlays.utility.width = width;
		return;
	}
	state.ui.overlays.view.row = row;
	state.ui.overlays.view.col = col;
	state.ui.overlays.view.width = width;
}

function showDropdown(kind: DropdownKind): void {
	if (!state.session.tui || getDropdownHandle(kind)) return;
	if (kind === "utility") hideViewOverlay();
	else hideUtilityOverlay();

	const buttons = getDropdownButtons(kind);
	const overlayWidth = getDropdownInnerWidth(buttons) + 2;
	const overlayRow = HEADER_HEIGHT;
	const anchorButton = state.ui.headerButtons.find((button) => button.button.id === getDropdownAnchorButtonId(kind) && button.rowOffset === 0);
	const overlayCol = Math.max(1, anchorButton?.colStart ?? (state.config.render.leadingColumns + 1));
	setDropdownPlacement(kind, overlayRow, overlayCol, overlayWidth);

	const overlay = state.session.tui.showOverlay(new ButtonDropdownOverlayComponent(
		renderContext,
		() => getDropdownButtons(kind),
		() => (kind === "utility" ? state.ui.overlays.utility.row : state.ui.overlays.view.row),
		() => (kind === "utility" ? state.ui.overlays.utility.col : state.ui.overlays.view.col),
		(hitRegions, actualHeight) => setDropdownLayoutState(kind, hitRegions, actualHeight),
	), {
		anchor: "top-left",
		row: overlayRow,
		col: overlayCol - 1,
		width: overlayWidth,
		nonCapturing: true,
	});

	if (kind === "utility") {
		state.ui.overlays.utility.handle = overlay;
		state.ui.overlays.utility.visible = true;
	} else {
		state.ui.overlays.view.handle = overlay;
		state.ui.overlays.view.visible = true;
	}
	queueLog(`${kind} overlay shown`);
}

function hideDropdown(kind: DropdownKind): void {
	if (kind === "utility") {
		state.ui.overlays.utility.handle?.hide();
		state.ui.overlays.utility.handle = undefined;
		state.ui.overlays.utility.visible = false;
		state.ui.overlays.utility.row = 0;
		state.ui.overlays.utility.col = 0;
		state.ui.overlays.utility.width = 0;
		state.ui.overlays.utility.buttons = [];
		state.ui.overlays.utility.actualHeight = BAR_HEIGHT;
	} else {
		state.ui.overlays.view.handle?.hide();
		state.ui.overlays.view.handle = undefined;
		state.ui.overlays.view.visible = false;
		state.ui.overlays.view.row = 0;
		state.ui.overlays.view.col = 0;
		state.ui.overlays.view.width = 0;
		state.ui.overlays.view.buttons = [];
		state.ui.overlays.view.actualHeight = BAR_HEIGHT;
	}
	queueLog(`${kind} overlay hidden`);
}

function toggleDropdown(kind: DropdownKind): void {
	if (kind === "utility" ? state.ui.overlays.utility.visible : state.ui.overlays.view.visible) hideDropdown(kind);
	else showDropdown(kind);
}

const showUtilityOverlay = (): void => showDropdown("utility");
const hideUtilityOverlay = (): void => hideDropdown("utility");
const toggleUtilityOverlay = (): void => toggleDropdown("utility");
const showViewOverlay = (): void => showDropdown("view");
const hideViewOverlay = (): void => hideDropdown("view");
const toggleViewOverlay = (): void => toggleDropdown("view");

function handleDropdownMouse(kind: DropdownKind, mouse: MouseInput): InputResponse | undefined {
	const visible = kind === "utility" ? state.ui.overlays.utility.visible : state.ui.overlays.view.visible;
	if (!visible) return undefined;

	const row = kind === "utility" ? state.ui.overlays.utility.row : state.ui.overlays.view.row;
	const col = kind === "utility" ? state.ui.overlays.utility.col : state.ui.overlays.view.col;
	const width = kind === "utility" ? state.ui.overlays.utility.width : state.ui.overlays.view.width;
	const actualHeight = kind === "utility" ? state.ui.overlays.utility.actualHeight : state.ui.overlays.view.actualHeight;
	const buttons = kind === "utility" ? state.ui.overlays.utility.buttons : state.ui.overlays.view.buttons;
	const inOverlayRows = mouse.row >= row + 1 && mouse.row <= row + actualHeight;
	const inOverlayCols = mouse.col >= col && mouse.col <= col + width - 1;
	if (inOverlayRows && inOverlayCols) {
		const button = findHitRegion(buttons, mouse.row - 1, mouse.col);
		return button ? activateButton(button, kind) : { consume: true };
	}
	if (visible) hideDropdown(kind);
	return { consume: true };
}

// Exported for mode.ts to call during enableTouchMode
export { showUtilityOverlay, hideUtilityOverlay, toggleUtilityOverlay, showViewOverlay, hideViewOverlay, toggleViewOverlay };

// ---------------------------------------------------------------------------
// Input handler registration
// ---------------------------------------------------------------------------

export function registerInputHandler(ctx: { ui: any }): void {
	unregisterInputHandler();
	state.inputUnsubscribe = ctx.ui.onTerminalInput((data: string) => {
		state.diagnostics.lastInput = visualizeInput(data);

		const mouse = parseMouseInput(data);
		if (mouse) {
			state.diagnostics.lastMouse = mouse;
			if (mouse.phase !== "move") {
				queueLog(`mouse ${mouse.phase} code=${mouse.code} row=${mouse.row} col=${mouse.col}`);
			}
			if (!state.shell.enabled) return { consume: true };
			if (state.ui.bar.drag && mouse.phase === "release") return finishBarDrag(mouse);
			if (state.ui.bar.drag && isPrimaryPointerDrag(mouse)) return updateBarDrag(mouse);
			if (state.ui.viewport.drag && mouse.phase === "release") return finishViewportDrag(mouse);
			if (state.ui.viewport.drag && isPrimaryPointerDrag(mouse)) return updateViewportDrag(mouse);
			if (!isPrimaryPointerPress(mouse)) return { consume: true };

			const inHeader = state.shell.headerInstalled && mouse.row >= 1 && mouse.row <= HEADER_HEIGHT;
			if (inHeader) {
				const clickedRow = mouse.row - 1;
				const button = findHitRegion(state.ui.headerButtons, clickedRow, mouse.col);
				return button ? activateButton(button, "header") : { consume: true };
			}

			const utilityDropdownResponse = handleDropdownMouse("utility", mouse);
			if (utilityDropdownResponse) return utilityDropdownResponse;

			const viewDropdownResponse = handleDropdownMouse("view", mouse);
			if (viewDropdownResponse) return viewDropdownResponse;

			const inNav = state.ui.nav.row > 0 && mouse.row >= state.ui.nav.row && mouse.row < state.ui.nav.row + state.ui.nav.actualHeight;
			if (inNav) {
				const clickedRow = Math.floor((mouse.row - state.ui.nav.row) / BAR_HEIGHT);
				const button = findHitRegion(state.ui.nav.buttons, clickedRow, mouse.col);
				return button ? activateButton(button, "nav") : { consume: true };
			}

			const inBar = state.shell.barVisible && state.ui.bar.row > 0 && mouse.row >= state.ui.bar.row && mouse.row < state.ui.bar.row + state.ui.bar.actualHeight;
			if (inBar) return startBarDrag(mouse);

			if (isViewportRow(mouse.row)) {
				const viewportButton = findHitRegion(state.ui.viewport.buttons, mouse.row - state.ui.viewport.row, mouse.col);
				if (viewportButton) return activateButton(viewportButton, "bar");
				return startViewportDrag(mouse);
			}

			return { consume: true };
		}

		if (state.shell.enabled && state.ui.overlays.utility.visible) scheduleRender();
		if (!state.shell.enabled) return undefined;

		if (matchesKey(data, Key.pageUp)) {
			setLastAction("keyboard:pageUp");
			state.session.viewport?.pageUp();
			return { consume: true };
		}
		if (matchesKey(data, Key.pageDown)) {
			setLastAction("keyboard:pageDown");
			state.session.viewport?.pageDown();
			return { consume: true };
		}
		if (matchesKey(data, Key.home)) {
			setLastAction("keyboard:top");
			state.session.viewport?.toTop();
			return { consume: true };
		}
		if (matchesKey(data, Key.end)) {
			setLastAction("keyboard:bottom");
			state.session.viewport?.toBottom();
			return { consume: true };
		}

		return undefined;
	});
}

export function unregisterInputHandler(): void {
	state.inputUnsubscribe?.();
	state.inputUnsubscribe = undefined;
	state.ui.viewport.drag = undefined;
	state.ui.bar.drag = undefined;
}
