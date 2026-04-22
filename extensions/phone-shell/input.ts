import { Key, matchesKey } from "@mariozechner/pi-tui";
import { BAR_HEIGHT, HEADER_HEIGHT, VIEW_MENU_BUTTONS } from "./defaults.js";
import { queueLog, scheduleRender, setLastAction, state } from "./state.js";
import { toggleBottomBar, togglePromptProxyMode } from "./mode.js";
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
	return state.viewportRow > 0 && row >= state.viewportRow && row < state.viewportRow + state.viewportHeight;
}

function startViewportDrag(mouse: MouseInput): InputResponse {
	const debug = state.viewport?.getDebugState();
	if (!debug) return { consume: true };
	state.viewportDrag = {
		anchorRow: mouse.row,
		anchorScrollTop: debug.scrollTop,
		lastRow: mouse.row,
	};
	setLastAction("mouse:viewport-drag-start");
	return { consume: true };
}

function updateViewportDrag(mouse: MouseInput): InputResponse {
	if (!state.viewportDrag || !state.viewport) return { consume: true };
	const deltaRows = mouse.row - state.viewportDrag.anchorRow;
	state.viewportDrag.lastRow = mouse.row;
	state.viewport.setScrollTop(state.viewportDrag.anchorScrollTop - deltaRows);
	return { consume: true };
}

function finishViewportDrag(mouse: MouseInput): InputResponse {
	if (!state.viewportDrag) return { consume: true };
	const moved = Math.abs(mouse.row - state.viewportDrag.anchorRow);
	state.viewportDrag = undefined;
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
		case "togglePromptProxy":
			togglePromptProxyMode();
			return { consume: true };
		case "scrollTop":
			state.viewport?.toTop();
			return { consume: true };
		case "pageUp":
			state.viewport?.pageUp();
			return { consume: true };
		case "cycleModel":
			return { data: state.config.inputs.modelCycle };
		case "pageDown":
			state.viewport?.pageDown();
			return { consume: true };
		case "scrollBottom":
			state.viewport?.toBottom();
			return { consume: true };
		case "sendEscape":
			return { data: "\x1b" };
		case "sendInterrupt":
			return { data: "\x03" };
		case "sendFollowUp":
			return { data: state.config.inputs.followUp };
		case "openSlash":
			state.setEditorText?.("");
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

export function activateButton(button: ButtonSpec, origin: "utility" | "view" | "bar" | "header"): InputResponse {
	setLastAction(`${origin}:${button.id}`);

	const shouldAutoHideOverlay = (origin === "utility" || origin === "view") && !state.config.utilityOverlay.keepOpenAfterButtonActivation;
	const maybeHideOverlay = (force = false) => {
		if (!force && !shouldAutoHideOverlay) return;
		if (origin === "utility") hideUtilityOverlay();
		if (origin === "view") hideViewOverlay();
	};

	if (button.kind === "command") {
		state.setEditorText?.(button.command);
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
			state.setEditorText?.(button.setText ?? "");
		} else if (button.setText !== undefined) {
			state.setEditorText?.(button.setText);
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
	return kind === "utility" ? state.layout.utilityButtons : VIEW_MENU_BUTTONS;
}

function getDropdownAnchorButtonId(kind: DropdownKind): string {
	return kind === "utility" ? "header-etc" : "header-view";
}

function getDropdownHandle(kind: DropdownKind) {
	return kind === "utility" ? state.utilityOverlay : state.viewOverlay;
}

function setDropdownLayoutState(kind: DropdownKind, hitRegions: ButtonHitRegion[], actualHeight: number): void {
	if (kind === "utility") {
		state.utilityButtons = hitRegions;
		state.utilityActualHeight = actualHeight;
		return;
	}
	state.viewButtons = hitRegions;
	state.viewActualHeight = actualHeight;
}

function setDropdownPlacement(kind: DropdownKind, row: number, col: number, width: number): void {
	if (kind === "utility") {
		state.utilityOverlayRow = row;
		state.utilityOverlayCol = col;
		state.utilityOverlayWidth = width;
		return;
	}
	state.viewOverlayRow = row;
	state.viewOverlayCol = col;
	state.viewOverlayWidth = width;
}

function showDropdown(kind: DropdownKind): void {
	if (!state.tui || getDropdownHandle(kind)) return;
	if (kind === "utility") hideViewOverlay();
	else hideUtilityOverlay();

	const buttons = getDropdownButtons(kind);
	const overlayWidth = getDropdownInnerWidth(buttons) + 2;
	const overlayRow = HEADER_HEIGHT;
	const anchorButton = state.headerButtons.find((button) => button.button.id === getDropdownAnchorButtonId(kind) && button.rowOffset === 0);
	const overlayCol = Math.max(1, anchorButton?.colStart ?? (state.config.render.leadingColumns + 1));
	setDropdownPlacement(kind, overlayRow, overlayCol, overlayWidth);

	const overlay = state.tui.showOverlay(new ButtonDropdownOverlayComponent(
		renderContext,
		buttons,
		() => (kind === "utility" ? state.utilityOverlayRow : state.viewOverlayRow),
		() => (kind === "utility" ? state.utilityOverlayCol : state.viewOverlayCol),
		(hitRegions, actualHeight) => setDropdownLayoutState(kind, hitRegions, actualHeight),
	), {
		anchor: "top-left",
		row: overlayRow,
		col: overlayCol - 1,
		width: overlayWidth,
		nonCapturing: true,
	});

	if (kind === "utility") {
		state.utilityOverlay = overlay;
		state.utilityOverlayVisible = true;
	} else {
		state.viewOverlay = overlay;
		state.viewOverlayVisible = true;
	}
	queueLog(`${kind} overlay shown`);
}

function hideDropdown(kind: DropdownKind): void {
	if (kind === "utility") {
		state.utilityOverlay?.hide();
		state.utilityOverlay = undefined;
		state.utilityOverlayVisible = false;
		state.utilityOverlayRow = 0;
		state.utilityOverlayCol = 0;
		state.utilityOverlayWidth = 0;
		state.utilityButtons = [];
		state.utilityActualHeight = BAR_HEIGHT;
	} else {
		state.viewOverlay?.hide();
		state.viewOverlay = undefined;
		state.viewOverlayVisible = false;
		state.viewOverlayRow = 0;
		state.viewOverlayCol = 0;
		state.viewOverlayWidth = 0;
		state.viewButtons = [];
		state.viewActualHeight = BAR_HEIGHT;
	}
	queueLog(`${kind} overlay hidden`);
}

function toggleDropdown(kind: DropdownKind): void {
	if (kind === "utility" ? state.utilityOverlayVisible : state.viewOverlayVisible) hideDropdown(kind);
	else showDropdown(kind);
}

const showUtilityOverlay = (): void => showDropdown("utility");
const hideUtilityOverlay = (): void => hideDropdown("utility");
const toggleUtilityOverlay = (): void => toggleDropdown("utility");
const showViewOverlay = (): void => showDropdown("view");
const hideViewOverlay = (): void => hideDropdown("view");
const toggleViewOverlay = (): void => toggleDropdown("view");

function handleDropdownMouse(kind: DropdownKind, mouse: MouseInput): InputResponse | undefined {
	const visible = kind === "utility" ? state.utilityOverlayVisible : state.viewOverlayVisible;
	if (!visible) return undefined;

	const row = kind === "utility" ? state.utilityOverlayRow : state.viewOverlayRow;
	const col = kind === "utility" ? state.utilityOverlayCol : state.viewOverlayCol;
	const width = kind === "utility" ? state.utilityOverlayWidth : state.viewOverlayWidth;
	const actualHeight = kind === "utility" ? state.utilityActualHeight : state.viewActualHeight;
	const buttons = kind === "utility" ? state.utilityButtons : state.viewButtons;
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
		state.lastInput = visualizeInput(data);

		const mouse = parseMouseInput(data);
		if (mouse) {
			state.lastMouse = mouse;
			if (mouse.phase !== "move") {
				queueLog(`mouse ${mouse.phase} code=${mouse.code} row=${mouse.row} col=${mouse.col}`);
			}
			if (!state.enabled) return { consume: true };
			if (state.viewportDrag && mouse.phase === "release") return finishViewportDrag(mouse);
			if (state.viewportDrag && isPrimaryPointerDrag(mouse)) return updateViewportDrag(mouse);
			if (!isPrimaryPointerPress(mouse)) return { consume: true };

			const inHeader = state.headerInstalled && mouse.row >= 1 && mouse.row <= HEADER_HEIGHT;
			if (inHeader) {
				const clickedRow = mouse.row - 1;
				const button = findHitRegion(state.headerButtons, clickedRow, mouse.col);
				return button ? activateButton(button, "header") : { consume: true };
			}

			const utilityDropdownResponse = handleDropdownMouse("utility", mouse);
			if (utilityDropdownResponse) return utilityDropdownResponse;

			const viewDropdownResponse = handleDropdownMouse("view", mouse);
			if (viewDropdownResponse) return viewDropdownResponse;

			const inBar = state.barVisible && state.barRow > 0 && mouse.row >= state.barRow && mouse.row < state.barRow + state.barActualHeight;
			if (inBar) {
				const clickedRow = Math.floor((mouse.row - state.barRow) / BAR_HEIGHT);
				const button = findHitRegion(state.barButtons, clickedRow, mouse.col);
				return button ? activateButton(button, "bar") : { consume: true };
			}

			if (isViewportRow(mouse.row)) {
				return startViewportDrag(mouse);
			}

			return { consume: true };
		}

		if (state.enabled && state.utilityOverlayVisible) scheduleRender();
		if (!state.enabled) return undefined;

		if (matchesKey(data, Key.pageUp)) {
			setLastAction("keyboard:pageUp");
			state.viewport?.pageUp();
			return { consume: true };
		}
		if (matchesKey(data, Key.pageDown)) {
			setLastAction("keyboard:pageDown");
			state.viewport?.pageDown();
			return { consume: true };
		}
		if (matchesKey(data, Key.home)) {
			setLastAction("keyboard:top");
			state.viewport?.toTop();
			return { consume: true };
		}
		if (matchesKey(data, Key.end)) {
			setLastAction("keyboard:bottom");
			state.viewport?.toBottom();
			return { consume: true };
		}

		return undefined;
	});
}

export function unregisterInputHandler(): void {
	state.inputUnsubscribe?.();
	state.inputUnsubscribe = undefined;
	state.viewportDrag = undefined;
}
