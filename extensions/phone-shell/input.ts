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

function showUtilityOverlay(): void {
	if (!state.tui || state.utilityOverlay) return;
	hideViewOverlay();
	const overlayWidth = getDropdownInnerWidth(state.layout.utilityButtons) + 2;
	const overlayRow = HEADER_HEIGHT;
	const etcButton = state.headerButtons.find((button) => button.button.id === "header-etc" && button.rowOffset === 0);
	const overlayCol = Math.max(1, etcButton?.colStart ?? (state.config.render.leadingColumns + 1));
	const overlayColZero = overlayCol - 1;
	state.utilityOverlayRow = overlayRow;
	state.utilityOverlayCol = overlayCol;
	state.utilityOverlayWidth = overlayWidth;
	state.utilityOverlay = state.tui.showOverlay(new ButtonDropdownOverlayComponent(
		state.tui,
		renderContext,
		state.layout.utilityButtons,
		() => state.utilityOverlayRow,
		() => state.utilityOverlayCol,
		(hitRegions, actualHeight) => {
			state.utilityButtons = hitRegions;
			state.utilityButtonsHeight = state.layout.utilityButtons.length * 3;
			state.utilityActualHeight = actualHeight;
		},
	), {
		anchor: "top-left",
		row: overlayRow,
		col: overlayColZero,
		width: overlayWidth,
		nonCapturing: true,
	});
	state.utilityOverlayVisible = true;
	queueLog("utility overlay shown");
}

function hideUtilityOverlay(): void {
	state.utilityOverlay?.hide();
	state.utilityOverlay = undefined;
	state.utilityOverlayVisible = false;
	state.utilityOverlayRow = 0;
	state.utilityOverlayCol = 0;
	state.utilityOverlayWidth = 0;
	state.utilityButtons = [];
	state.utilityButtonsHeight = BAR_HEIGHT;
	state.utilityActualHeight = BAR_HEIGHT;
	queueLog("utility overlay hidden");
}

function toggleUtilityOverlay(): void {
	if (state.utilityOverlayVisible) hideUtilityOverlay();
	else showUtilityOverlay();
}

function showViewOverlay(): void {
	if (!state.tui || state.viewOverlay) return;
	hideUtilityOverlay();
	const overlayWidth = getDropdownInnerWidth(VIEW_MENU_BUTTONS) + 2;
	const overlayRow = HEADER_HEIGHT;
	const viewButton = state.headerButtons.find((button) => button.button.id === "header-view" && button.rowOffset === 0);
	const overlayCol = Math.max(1, viewButton?.colStart ?? (state.config.render.leadingColumns + 1));
	const overlayColZero = overlayCol - 1;
	state.viewOverlayRow = overlayRow;
	state.viewOverlayCol = overlayCol;
	state.viewOverlayWidth = overlayWidth;
	state.viewOverlay = state.tui.showOverlay(new ButtonDropdownOverlayComponent(
		state.tui,
		renderContext,
		VIEW_MENU_BUTTONS,
		() => state.viewOverlayRow,
		() => state.viewOverlayCol,
		(hitRegions, actualHeight) => {
			state.viewButtons = hitRegions;
			state.viewButtonsHeight = VIEW_MENU_BUTTONS.length * 3;
			state.viewActualHeight = actualHeight;
		},
	), {
		anchor: "top-left",
		row: overlayRow,
		col: overlayColZero,
		width: overlayWidth,
		nonCapturing: true,
	});
	state.viewOverlayVisible = true;
	queueLog("view overlay shown");
}

function hideViewOverlay(): void {
	state.viewOverlay?.hide();
	state.viewOverlay = undefined;
	state.viewOverlayVisible = false;
	state.viewOverlayRow = 0;
	state.viewOverlayCol = 0;
	state.viewOverlayWidth = 0;
	state.viewButtons = [];
	state.viewButtonsHeight = BAR_HEIGHT;
	state.viewActualHeight = BAR_HEIGHT;
	queueLog("view overlay hidden");
}

function toggleViewOverlay(): void {
	if (state.viewOverlayVisible) hideViewOverlay();
	else showViewOverlay();
}

function hideModelMenu(): void {
	state.modelMenuVisible = false;
	state.modelMenuRow = 0;
	state.modelMenuCol = 0;
	state.modelMenuWidth = 0;
	state.modelMenuHeight = 0;
	state.modelMenuScopeButtons = [];
	state.modelMenuProviderButtons = [];
	state.modelMenuModelButtons = [];
}

// Exported for mode.ts to call during enableTouchMode
export { showUtilityOverlay, hideUtilityOverlay, toggleUtilityOverlay, showViewOverlay, hideViewOverlay, toggleViewOverlay, hideModelMenu };

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

			if (state.utilityOverlayVisible) {
				const inOverlayRows = mouse.row >= state.utilityOverlayRow + 1 && mouse.row <= state.utilityOverlayRow + state.utilityActualHeight;
				const inOverlayCols = mouse.col >= state.utilityOverlayCol && mouse.col <= state.utilityOverlayCol + state.utilityOverlayWidth - 1;
				if (inOverlayRows && inOverlayCols) {
					const button = findHitRegion(state.utilityButtons, mouse.row - 1, mouse.col);
					return button ? activateButton(button, "utility") : { consume: true };
				}
				hideUtilityOverlay();
				return { consume: true };
			}

			if (state.viewOverlayVisible) {
				const inOverlayRows = mouse.row >= state.viewOverlayRow + 1 && mouse.row <= state.viewOverlayRow + state.viewActualHeight;
				const inOverlayCols = mouse.col >= state.viewOverlayCol && mouse.col <= state.viewOverlayCol + state.viewOverlayWidth - 1;
				if (inOverlayRows && inOverlayCols) {
					const button = findHitRegion(state.viewButtons, mouse.row - 1, mouse.col);
					return button ? activateButton(button, "view") : { consume: true };
				}
				hideViewOverlay();
				return { consume: true };
			}

			const inBar = state.barVisible !== false && state.barRow > 0 && mouse.row >= state.barRow && mouse.row < state.barRow + state.barActualHeight;
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
