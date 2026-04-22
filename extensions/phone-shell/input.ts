import { Key, matchesKey } from "@mariozechner/pi-tui";
import { BAR_HEIGHT, HEADER_HEIGHT } from "./defaults.js";
import { queueLog, scheduleRender, setLastAction, state } from "./state.js";
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
	return {
		raw: data,
		code: Number.parseInt(match[1]!, 10),
		col: Number.parseInt(match[2]!, 10),
		row: Number.parseInt(match[3]!, 10),
		phase: match[4] === "M" ? "press" : "release",
	};
}

function isPrimaryPointerPress(mouse: MouseInput): boolean {
	if (mouse.phase !== "press") return false;
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

// ---------------------------------------------------------------------------
// Action dispatch
// ---------------------------------------------------------------------------

type InputResponse = { consume?: boolean; data?: string } | undefined;

export function performAction(action: ShellAction): InputResponse {
	switch (action) {
		case "toggleUtilities":
			toggleUtilityOverlay();
			return { consume: true };
		case "togglePromptMirror":
			state.promptMirrorVisible = !state.promptMirrorVisible;
			scheduleRender();
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

export function activateButton(button: ButtonSpec, origin: "utility" | "bar" | "header"): InputResponse {
	setLastAction(`${origin}:${button.id}`);

	if (button.kind === "command") {
		state.setEditorText?.(button.command);
		if (origin === "utility" && !state.config.utilityOverlay.keepOpenAfterButtonActivation) {
			hideUtilityOverlay();
		}
		scheduleRender();
		return { data: "\r" };
	}

	if (button.kind === "input") {
		if (origin === "utility" && !state.config.utilityOverlay.keepOpenAfterButtonActivation) {
			hideUtilityOverlay();
		}
		return { data: button.data };
	}

	if (button.kind === "editorKey") {
		if (button.clearFirst) {
			state.setEditorText?.(button.setText ?? "");
		} else if (button.setText !== undefined) {
			state.setEditorText?.(button.setText);
		}
		if (origin === "utility" && !state.config.utilityOverlay.keepOpenAfterButtonActivation) {
			hideUtilityOverlay();
		}
		scheduleRender();
		return { data: button.data };
	}

	return performAction(button.action);
}

// ---------------------------------------------------------------------------
// Utility overlay management
// (lives here because performAction needs toggleUtilityOverlay and mode.ts
//  imports from this module — no circular dep since input.ts never imports mode)
// ---------------------------------------------------------------------------

import { UtilityOverlayComponent } from "./overlay.js";
import { renderContext } from "./state.js";

function showUtilityOverlay(): void {
	if (!state.tui || state.utilityOverlay) return;
	state.utilityOverlay = state.tui.showOverlay(new UtilityOverlayComponent(state.tui, renderContext), {
		anchor: "top-left",
		row: 0,
		col: 0,
		width: "100%",
		nonCapturing: true,
	});
	state.utilityOverlayVisible = true;
	queueLog("utility overlay shown");
}

function hideUtilityOverlay(): void {
	state.utilityOverlay?.hide();
	state.utilityOverlay = undefined;
	state.utilityOverlayVisible = false;
	state.utilityButtons = [];
	state.utilityButtonsHeight = BAR_HEIGHT;
	state.utilityActualHeight = BAR_HEIGHT;
	queueLog("utility overlay hidden");
}

function toggleUtilityOverlay(): void {
	if (state.utilityOverlayVisible) hideUtilityOverlay();
	else showUtilityOverlay();
}

// Exported for mode.ts to call during enableTouchMode
export { showUtilityOverlay, hideUtilityOverlay, toggleUtilityOverlay };

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
			queueLog(`mouse ${mouse.phase} code=${mouse.code} row=${mouse.row} col=${mouse.col}`);
			if (!state.enabled || !isPrimaryPointerPress(mouse)) return { consume: true };

			if (state.utilityOverlayVisible && mouse.row >= 1 && mouse.row <= state.utilityActualHeight) {
				if (mouse.row > state.utilityButtonsHeight) return { consume: true };
				const clickedRow = Math.floor((mouse.row - 1) / BAR_HEIGHT);
				const button = findHitRegion(state.utilityButtons, clickedRow, mouse.col);
				return button ? activateButton(button, "utility") : { consume: true };
			}

			const inHeader = state.headerInstalled && mouse.row >= 1 && mouse.row <= HEADER_HEIGHT;
			if (inHeader) {
				const clickedRow = mouse.row - 1;
				const button = findHitRegion(state.headerButtons, clickedRow, mouse.col);
				return button ? activateButton(button, "header") : { consume: true };
			}

			const inBar = state.barRow > 0 && mouse.row >= state.barRow && mouse.row < state.barRow + state.barActualHeight;
			if (!inBar) return { consume: true };
			const clickedRow = Math.floor((mouse.row - state.barRow) / BAR_HEIGHT);
			const button = findHitRegion(state.barButtons, clickedRow, mouse.col);
			return button ? activateButton(button, "bar") : { consume: true };
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
}
