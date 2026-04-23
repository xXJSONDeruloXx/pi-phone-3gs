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
		case "toggleSkillsMenu":
			toggleSkillsOverlay();
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
		case "cycleThinkingLevel": {
			// Send Shift+Tab so pi handles the full cycle including UI
			queueMicrotask(() => {
				state.thinkingLevel = state.getThinkingLevel?.() ?? state.thinkingLevel;
				scheduleRender();
			});
			return { data: "\x1b[Z" };
		}
			state.session.viewport?.pageDown();
			return { consume: true };
		case "scrollBottom":
			state.session.viewport?.toBottom();
			return { consume: true };
		case "sendEscape":
			if (state.bindings.isIdle && !state.bindings.isIdle()) {
				state.bindings.abort?.();
				return { consume: true };
			}
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

export function activateButton(button: ButtonSpec, origin: "utility" | "view" | "skills" | "bar" | "nav" | "header"): InputResponse {
	setLastAction(`${origin}:${button.id}`);

	const isOverlay = origin === "utility" || origin === "view" || origin === "skills";
	const keepOpen = origin === "view"
		? state.config.viewOverlay.keepOpenAfterButtonActivation
		: state.config.utilityOverlay.keepOpenAfterButtonActivation;
	const shouldAutoHideOverlay = isOverlay && !keepOpen;
	const maybeHideOverlay = () => {
		if (!shouldAutoHideOverlay) return;
		if (origin === "utility") hideUtilityOverlay();
		if (origin === "view") hideViewOverlay();
		if (origin === "skills") hideSkillsOverlay();
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
	maybeHideOverlay();
	return result;
}

// ---------------------------------------------------------------------------
// Utility overlay management
// (lives here because performAction needs toggleUtilityOverlay and mode.ts
//  imports from this module — no circular dep since input.ts never imports mode)
// ---------------------------------------------------------------------------

import { ButtonDropdownOverlayComponent, getDropdownInnerWidth } from "./overlay.js";
import { renderContext } from "./state.js";

type DropdownKind = "utility" | "view" | "skills";

function getSkillsMenuButtons(): ButtonSpec[] {
	const commands = state.pi?.getCommands() ?? [];
	return commands
		.filter((c) => c.source === "skill")
		.map((c) => ({
			kind: "command" as const,
			id: `skill-${c.name}`,
			label: ` /${c.name} `,
			command: `/${c.name}`,
		}));
}

function getDropdownOverlayState(kind: DropdownKind) {
	return state.ui.overlays[kind];
}

function getDropdownButtons(kind: DropdownKind): ButtonSpec[] {
	if (kind === "utility") return state.layout.utilityButtons;
	if (kind === "view") return getViewMenuButtons(state.shell);
	return getSkillsMenuButtons();
}

function getDropdownAnchorButtonId(kind: DropdownKind): string {
	if (kind === "utility") return "header-file";
	if (kind === "skills") return "header-skills";
	return "header-view";
}

function getDropdownHandle(kind: DropdownKind) {
	return getDropdownOverlayState(kind).handle;
}

function setDropdownLayoutState(kind: DropdownKind, hitRegions: ButtonHitRegion[], actualHeight: number): void {
	const overlay = getDropdownOverlayState(kind);
	overlay.buttons = hitRegions;
	overlay.actualHeight = actualHeight;
}

function setDropdownPlacement(kind: DropdownKind, row: number, col: number, width: number): void {
	const overlay = getDropdownOverlayState(kind);
	overlay.row = row;
	overlay.col = col;
	overlay.width = width;
}

function hideOtherOverlays(except?: DropdownKind): void {
	for (const k of ["utility", "view", "skills"] as DropdownKind[]) {
		if (k !== except) hideDropdown(k);
	}
}

function showDropdown(kind: DropdownKind): void {
	if (!state.session.tui || getDropdownHandle(kind)) return;
	hideOtherOverlays(kind);

	const buttons = getDropdownButtons(kind);
	if (buttons.length === 0) return;
	const overlayWidth = getDropdownInnerWidth(buttons) + 2;
	const overlayRow = HEADER_HEIGHT;
	const anchorButton = state.ui.headerButtons.find((button) => button.button.id === getDropdownAnchorButtonId(kind) && button.rowOffset === 0);
	const overlayCol = Math.max(1, anchorButton?.colStart ?? (state.config.render.leadingColumns + 1));
	setDropdownPlacement(kind, overlayRow, overlayCol, overlayWidth);

	const overlayState = getDropdownOverlayState(kind);
	const overlay = state.session.tui.showOverlay(new ButtonDropdownOverlayComponent(
		renderContext,
		() => getDropdownButtons(kind),
		() => overlayState.row,
		() => overlayState.col,
		(hitRegions, actualHeight) => setDropdownLayoutState(kind, hitRegions, actualHeight),
	), {
		anchor: "top-left",
		row: overlayRow,
		col: overlayCol - 1,
		width: overlayWidth,
		nonCapturing: true,
	});

	overlayState.handle = overlay;
	overlayState.visible = true;
	queueLog(`${kind} overlay shown`);
}

function hideDropdown(kind: DropdownKind): void {
	const overlay = getDropdownOverlayState(kind);
	overlay.handle?.hide();
	overlay.handle = undefined;
	overlay.visible = false;
	overlay.row = 0;
	overlay.col = 0;
	overlay.width = 0;
	overlay.buttons = [];
	overlay.actualHeight = BAR_HEIGHT;
	queueLog(`${kind} overlay hidden`);
}

function toggleDropdown(kind: DropdownKind): void {
	if (getDropdownOverlayState(kind).visible) hideDropdown(kind);
	else showDropdown(kind);
}

const showUtilityOverlay = (): void => showDropdown("utility");
const hideUtilityOverlay = (): void => hideDropdown("utility");
const toggleUtilityOverlay = (): void => toggleDropdown("utility");
const showViewOverlay = (): void => showDropdown("view");
const hideViewOverlay = (): void => hideDropdown("view");
const toggleViewOverlay = (): void => toggleDropdown("view");
const showSkillsOverlay = (): void => showDropdown("skills");
const hideSkillsOverlay = (): void => hideDropdown("skills");
const toggleSkillsOverlay = (): void => toggleDropdown("skills");

function handleDropdownMouse(kind: DropdownKind, mouse: MouseInput): InputResponse | undefined {
	const overlay = getDropdownOverlayState(kind);
	if (!overlay.visible) return undefined;

	const { row, col, width, actualHeight, buttons } = overlay;
	const inOverlayRows = mouse.row >= row + 1 && mouse.row <= row + actualHeight;
	const inOverlayCols = mouse.col >= col && mouse.col <= col + width - 1;
	if (inOverlayRows && inOverlayCols) {
		const button = findHitRegion(buttons, mouse.row - 1, mouse.col);
		return button ? activateButton(button, kind) : { consume: true };
	}
	hideDropdown(kind);
	return { consume: true };
}

// Exported for mode.ts to call during enableTouchMode
export { showUtilityOverlay, hideUtilityOverlay, toggleUtilityOverlay, showViewOverlay, hideViewOverlay, toggleViewOverlay, showSkillsOverlay, hideSkillsOverlay, toggleSkillsOverlay };

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

			const skillsDropdownResponse = handleDropdownMouse("skills", mouse);
			if (skillsDropdownResponse) return skillsDropdownResponse;

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
