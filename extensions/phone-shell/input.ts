import { modelsAreEqual, type Model } from "@mariozechner/pi-ai";
import { Key, matchesKey } from "@mariozechner/pi-tui";
import { BAR_HEIGHT, getViewMenuButtons, HEADER_HEIGHT } from "./defaults.js";
import { queueLog, scheduleRender, setLastAction, state } from "./state.js";
import { toggleBottomBar, toggleEditorPosition, toggleNavPad, toggleTopEditorSendButton, toggleTopEditorStashButton, toggleViewportJumpButtons } from "./mode.js";
import type {
	ButtonHitRegion,
	ButtonSpec,
	MouseInput,
	ShellAction,
} from "./types.js";

// ---------------------------------------------------------------------------
// Mouse helpers
// ---------------------------------------------------------------------------

const VIEWPORT_WHEEL_SCROLL_LINES = 3;

export function parseMouseInput(data: string): MouseInput | undefined {
	const match = data.match(/^\x1b\[<(\d+);(\d+);(\d+)([Mm])$/);
	if (!match) return undefined;
	const code = Number.parseInt(match[1]!, 10);
	const isWheel = match[4] !== "m" && (code & 64) !== 0;
	const scrollDirection = isWheel
		? ((code & 0b11) === 0 ? "up"
			: (code & 0b11) === 1 ? "down"
				: (code & 0b11) === 2 ? "left"
					: "right")
		: undefined;
	return {
		raw: data,
		code,
		col: Number.parseInt(match[2]!, 10),
		row: Number.parseInt(match[3]!, 10),
		phase: match[4] === "m" ? "release" : isWheel ? "scroll" : ((code & 32) !== 0 ? "move" : "press"),
		scrollDirection,
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

function isDropdownRow(kind: DropdownKind, row: number, col: number): boolean {
	const overlay = getDropdownOverlayState(kind);
	return overlay.visible
		&& row >= overlay.row + 1
		&& row <= overlay.row + overlay.actualHeight
		&& col >= overlay.col
		&& col <= overlay.col + overlay.width - 1;
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

function adjustScrollableDropdownOffset(kind: "skills" | "models", delta: number): boolean {
	const overlay = state.ui.overlays[kind];
	const totalButtons = getDropdownButtons(kind).length;
	const maxOffset = Math.max(0, totalButtons - overlay.maxVisibleItems);
	const nextOffset = Math.max(0, Math.min(maxOffset, overlay.scrollOffset + delta));
	if (nextOffset === overlay.scrollOffset) return false;
	overlay.scrollOffset = nextOffset;
	scheduleRender();
	return true;
}

function handleSkillsDropdownWheel(mouse: MouseInput): InputResponse {
	const direction = mouse.scrollDirection;
	if (!direction) return { consume: true };
	if (!isDropdownRow("skills", mouse.row, mouse.col)) return undefined;
	if (direction === "left" || direction === "right") return { consume: true };
	if (adjustScrollableDropdownOffset("skills", direction === "up" ? -1 : 1)) {
		setLastAction(`mouse:skills-wheel-${direction}`);
	}
	return { consume: true };
}

function handleModelsDropdownWheel(mouse: MouseInput): InputResponse {
	const direction = mouse.scrollDirection;
	if (!direction) return { consume: true };
	if (!isDropdownRow("models", mouse.row, mouse.col)) return undefined;
	if (direction === "left" || direction === "right") return { consume: true };
	if (adjustScrollableDropdownOffset("models", direction === "up" ? -1 : 1)) {
		setLastAction(`mouse:models-wheel-${direction}`);
	}
	return { consume: true };
}

function handleViewportWheel(mouse: MouseInput): InputResponse {
	const direction = mouse.scrollDirection;
	if (!direction) return { consume: true };
	if (!isViewportRow(mouse.row)) return { consume: true };
	if (direction === "left" || direction === "right") return { consume: true };
	const delta = direction === "up" ? -VIEWPORT_WHEEL_SCROLL_LINES : VIEWPORT_WHEEL_SCROLL_LINES;
	state.session.viewport?.scrollLines(delta);
	setLastAction(`mouse:viewport-wheel-${direction}`);
	return { consume: true };
}

// ---------------------------------------------------------------------------
// Action dispatch
// ---------------------------------------------------------------------------

type InputResponse = { consume?: boolean; data?: string } | undefined;

function stashOrRestoreEditorText(): InputResponse {
	const currentText = state.bindings.getEditorText?.() ?? "";
	if (currentText.length > 0) {
		state.editorStash = currentText;
		state.bindings.setEditorText?.("");
		state.bindings.notify?.("phone-shell: prompt stashed", "info");
		scheduleRender();
		return { consume: true };
	}
	if (state.editorStash) {
		state.bindings.setEditorText?.(state.editorStash);
		state.editorStash = undefined;
		state.bindings.notify?.("phone-shell: prompt restored", "info");
		scheduleRender();
		return { consume: true };
	}
	state.bindings.notify?.("phone-shell: stash is empty", "info");
	return { consume: true };
}

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
		case "toggleTopEditorSendButton":
			toggleTopEditorSendButton();
			return { consume: true };
		case "toggleTopEditorStashButton":
			toggleTopEditorStashButton();
			return { consume: true };
		case "stashEditor":
			return stashOrRestoreEditorText();
		case "scrollTop":
			state.session.viewport?.toTop();
			return { consume: true };
		case "pageUp":
			state.session.viewport?.pageUp();
			return { consume: true };
		case "selectModel":
			toggleModelsOverlay();
			return { consume: true };
		case "cycleThinkingLevel": {
			// Send Shift+Tab so pi handles the full cycle including UI
			queueMicrotask(() => {
				state.thinkingLevel = state.getThinkingLevel?.() ?? state.thinkingLevel;
				scheduleRender();
			});
			return { data: "\x1b[Z" };
		}
		case "pageDown":
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

export function activateButton(button: ButtonSpec, origin: "utility" | "view" | "skills" | "bar" | "nav" | "header" | "editor"): InputResponse {
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

type DropdownKind = "utility" | "view" | "skills" | "models";

type AvailableModel = Model<any>;

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

function getAvailableModels(): AvailableModel[] {
	return state.modelRegistry?.getAvailable() ?? [];
}

function isCurrentModel(model: AvailableModel): boolean {
	return modelsAreEqual(state.currentModel, model);
}

function getModelButtonId(model: AvailableModel): string {
	return `model-${model.provider}-${model.id}`;
}

function getModelMenuButtons(): ButtonSpec[] {
	return getAvailableModels().map((model) => ({
		kind: "action" as const,
		id: getModelButtonId(model),
		label: ` ${model.provider} · ${model.id} `,
		action: "selectModel",
		palette: isCurrentModel(model) ? "warning" : "accent",
	}));
}

function findAvailableModelByButton(button: ButtonSpec): AvailableModel | undefined {
	return getAvailableModels().find((model) => getModelButtonId(model) === button.id);
}

function activateModelButton(button: ButtonSpec): InputResponse {
	setLastAction(`models:${button.id}`);
	const model = findAvailableModelByButton(button);
	hideModelsOverlay();
	if (!model) {
		state.bindings.notify?.("phone-shell: model no longer available", "warning");
		scheduleRender();
		return { consume: true };
	}
	const switchPromise = state.setModel?.(model);
	if (!switchPromise) {
		state.bindings.notify?.("phone-shell: model switching unavailable", "warning");
		scheduleRender();
		return { consume: true };
	}
	void switchPromise.then((changed) => {
		if (!changed) state.bindings.notify?.(`phone-shell: failed to switch to ${model.name}`, "warning");
		scheduleRender();
	}).catch(() => {
		state.bindings.notify?.(`phone-shell: failed to switch to ${model.name}`, "warning");
		scheduleRender();
	});
	return { consume: true };
}

function getDropdownOverlayState(kind: DropdownKind) {
	return state.ui.overlays[kind];
}

function getDropdownButtons(kind: DropdownKind): ButtonSpec[] {
	if (kind === "utility") return state.layout.utilityButtons;
	if (kind === "view") return getViewMenuButtons(state.shell);
	if (kind === "skills") return getSkillsMenuButtons();
	return getModelMenuButtons();
}

function getDropdownAnchorButtonId(kind: DropdownKind): string {
	if (kind === "utility") return "header-file";
	if (kind === "skills") return "header-skills";
	if (kind === "models") return "header-model";
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
	for (const k of ["utility", "view", "skills", "models"] as DropdownKind[]) {
		if (k !== except) hideDropdown(k);
	}
}

function computeScrollableDropdownMaxVisibleItems(): number {
	const terminalRows = state.session.tui?.terminal.rows ?? 24;
	const availableRows = terminalRows - HEADER_HEIGHT - 3; // 3-row bottom margin
	return Math.max(1, Math.floor((availableRows - 2) / 3)); // -2 for borders, 3 rows per button
}

function showDropdown(kind: DropdownKind): void {
	if (!state.session.tui || getDropdownHandle(kind)) return;
	hideOtherOverlays(kind);

	const buttons = getDropdownButtons(kind);
	if (buttons.length === 0) return;
	const overlayWidth = getDropdownInnerWidth(buttons) + 2;
	const overlayRow = HEADER_HEIGHT;
	const anchorButton = state.ui.headerButtons.find((button) => button.button.id === getDropdownAnchorButtonId(kind) && button.rowOffset === 0);
	const desiredCol = Math.max(1, (anchorButton?.colStart ?? (state.config.render.leadingColumns + 1)) - 1);
	const terminalCols = state.session.tui.terminal.columns;
	const overlayCol = Math.max(1, Math.min(desiredCol, terminalCols - overlayWidth + 1));
	setDropdownPlacement(kind, overlayRow, overlayCol, overlayWidth);

	const overlayState = getDropdownOverlayState(kind);

	// Compute max visible items for scrollable dropdowns
	if (kind === "skills" || kind === "models") {
		overlayState.maxVisibleItems = computeScrollableDropdownMaxVisibleItems();
		overlayState.scrollOffset = 0;
	}

	const scrollOpts = kind === "skills" || kind === "models" ? {
		getMaxVisibleItems: () => overlayState.maxVisibleItems,
		getScrollOffset: () => overlayState.scrollOffset,
	} : undefined;

	const overlay = state.session.tui.showOverlay(new ButtonDropdownOverlayComponent(
		renderContext,
		() => getDropdownButtons(kind),
		() => overlayState.row,
		() => overlayState.col,
		(hitRegions, actualHeight) => setDropdownLayoutState(kind, hitRegions, actualHeight),
		scrollOpts,
	), {
		anchor: "top-left",
		row: overlayRow,
		col: overlayCol,
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
	overlay.scrollOffset = 0;
	overlay.drag = undefined;
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
const showModelsOverlay = (): void => showDropdown("models");
const hideModelsOverlay = (): void => hideDropdown("models");
const toggleModelsOverlay = (): void => toggleDropdown("models");

// ---------------------------------------------------------------------------
// Skills dropdown scroll drag
// ---------------------------------------------------------------------------

function startSkillsDrag(mouse: MouseInput): InputResponse {
	const overlay = state.ui.overlays.skills;
	const button = findHitRegion(overlay.buttons, mouse.row - 1, mouse.col);
	overlay.drag = {
		anchorRow: mouse.row,
		anchorScrollOffset: overlay.scrollOffset,
		phase: "potential-tap",
		tapRow: mouse.row,
		tapCol: mouse.col,
		hitButton: button,
	};
	setLastAction("mouse:skills-drag-start");
	return { consume: true };
}

function updateSkillsDrag(mouse: MouseInput): InputResponse {
	const drag = state.ui.overlays.skills.drag;
	if (!drag) return { consume: true };
	const delta = mouse.row - drag.anchorRow;
	if (Math.abs(delta) > 2) drag.phase = "dragging";
	if (drag.phase === "dragging") {
		const overlay = state.ui.overlays.skills;
		const totalButtons = getSkillsMenuButtons().length;
		const maxOffset = Math.max(0, totalButtons - overlay.maxVisibleItems);
		const deltaButtons = Math.round(delta / 3);
		overlay.scrollOffset = Math.max(0, Math.min(maxOffset, drag.anchorScrollOffset - deltaButtons));
		scheduleRender();
	}
	return { consume: true };
}

function finishSkillsDrag(mouse: MouseInput): InputResponse {
	const drag = state.ui.overlays.skills.drag;
	if (!drag) return { consume: true };
	state.ui.overlays.skills.drag = undefined;
	if (drag.phase === "potential-tap" && drag.hitButton) {
		return activateButton(drag.hitButton, "skills");
	}
	setLastAction("mouse:skills-drag-end");
	return { consume: true };
}

function handleSkillsDropdownMouse(mouse: MouseInput): InputResponse | undefined {
	const overlay = state.ui.overlays.skills;
	if (!overlay.visible) return undefined;

	const { row, col, width, actualHeight } = overlay;
	const inOverlayRows = mouse.row >= row + 1 && mouse.row <= row + actualHeight;
	const inOverlayCols = mouse.col >= col && mouse.col <= col + width - 1;
	if (inOverlayRows && inOverlayCols) {
		return startSkillsDrag(mouse);
	}
	hideSkillsOverlay();
	return { consume: true };
}

function startModelsDrag(mouse: MouseInput): InputResponse {
	const overlay = state.ui.overlays.models;
	const button = findHitRegion(overlay.buttons, mouse.row - 1, mouse.col);
	overlay.drag = {
		anchorRow: mouse.row,
		anchorScrollOffset: overlay.scrollOffset,
		phase: "potential-tap",
		tapRow: mouse.row,
		tapCol: mouse.col,
		hitButton: button,
	};
	setLastAction("mouse:models-drag-start");
	return { consume: true };
}

function updateModelsDrag(mouse: MouseInput): InputResponse {
	const drag = state.ui.overlays.models.drag;
	if (!drag) return { consume: true };
	const delta = mouse.row - drag.anchorRow;
	if (Math.abs(delta) > 2) drag.phase = "dragging";
	if (drag.phase === "dragging") {
		const overlay = state.ui.overlays.models;
		const totalButtons = getModelMenuButtons().length;
		const maxOffset = Math.max(0, totalButtons - overlay.maxVisibleItems);
		const deltaButtons = Math.round(delta / 3);
		overlay.scrollOffset = Math.max(0, Math.min(maxOffset, drag.anchorScrollOffset - deltaButtons));
		scheduleRender();
	}
	return { consume: true };
}

function finishModelsDrag(mouse: MouseInput): InputResponse {
	const drag = state.ui.overlays.models.drag;
	if (!drag) return { consume: true };
	state.ui.overlays.models.drag = undefined;
	if (drag.phase === "potential-tap" && drag.hitButton) {
		return activateModelButton(drag.hitButton);
	}
	setLastAction("mouse:models-drag-end");
	return { consume: true };
}

function handleModelsDropdownMouse(mouse: MouseInput): InputResponse | undefined {
	const overlay = state.ui.overlays.models;
	if (!overlay.visible) return undefined;

	const { row, col, width, actualHeight } = overlay;
	const inOverlayRows = mouse.row >= row + 1 && mouse.row <= row + actualHeight;
	const inOverlayCols = mouse.col >= col && mouse.col <= col + width - 1;
	if (inOverlayRows && inOverlayCols) {
		return startModelsDrag(mouse);
	}
	hideModelsOverlay();
	return { consume: true };
}

function handleDropdownMouse(kind: "utility" | "view", mouse: MouseInput): InputResponse | undefined {
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
export {
	showUtilityOverlay,
	hideUtilityOverlay,
	toggleUtilityOverlay,
	showViewOverlay,
	hideViewOverlay,
	toggleViewOverlay,
	showSkillsOverlay,
	hideSkillsOverlay,
	toggleSkillsOverlay,
	showModelsOverlay,
	hideModelsOverlay,
	toggleModelsOverlay,
};

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
			if (mouse.phase === "scroll") {
				const skillsWheelResponse = state.ui.overlays.skills.visible ? handleSkillsDropdownWheel(mouse) : undefined;
				if (skillsWheelResponse) return skillsWheelResponse;
				const modelsWheelResponse = state.ui.overlays.models.visible ? handleModelsDropdownWheel(mouse) : undefined;
				if (modelsWheelResponse) return modelsWheelResponse;
				return handleViewportWheel(mouse);
			}
			if (state.ui.bar.drag && mouse.phase === "release") return finishBarDrag(mouse);
			if (state.ui.bar.drag && isPrimaryPointerDrag(mouse)) return updateBarDrag(mouse);
			if (state.ui.viewport.drag && mouse.phase === "release") return finishViewportDrag(mouse);
			if (state.ui.viewport.drag && isPrimaryPointerDrag(mouse)) return updateViewportDrag(mouse);
			if (state.ui.overlays.skills.drag && mouse.phase === "release") return finishSkillsDrag(mouse);
			if (state.ui.overlays.skills.drag && isPrimaryPointerDrag(mouse)) return updateSkillsDrag(mouse);
			if (state.ui.overlays.models.drag && mouse.phase === "release") return finishModelsDrag(mouse);
			if (state.ui.overlays.models.drag && isPrimaryPointerDrag(mouse)) return updateModelsDrag(mouse);
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

			const skillsDropdownResponse = handleSkillsDropdownMouse(mouse);
			if (skillsDropdownResponse) return skillsDropdownResponse;

			const modelsDropdownResponse = handleModelsDropdownMouse(mouse);
			if (modelsDropdownResponse) return modelsDropdownResponse;

			const editorChildren = (state.session.editorContainer as { children?: unknown[] } | undefined)?.children;
			const editorVisible = Array.isArray(editorChildren) && !!state.session.phoneShellEditor && editorChildren.includes(state.session.phoneShellEditor);
			const inEditor = editorVisible && state.ui.editor.row > 0 && mouse.row >= state.ui.editor.row && mouse.row < state.ui.editor.row + state.ui.editor.height;
			if (inEditor) {
				const button = findHitRegion(state.ui.editor.buttons, mouse.row - state.ui.editor.row, mouse.col);
				if (button) return activateButton(button, "editor");
			}

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
	state.ui.overlays.skills.drag = undefined;
	state.ui.overlays.models.drag = undefined;
}
