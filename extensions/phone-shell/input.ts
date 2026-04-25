import { Key, matchesKey } from "@mariozechner/pi-tui";
import { HEADER_HEIGHT } from "./defaults.js";
import { queueLog, scheduleRender, setLastAction, state } from "./state.js";
import { toggleBottomBar, toggleEditorPosition, toggleNavPad, toggleTopEditorSendButton, toggleTopEditorStashButton, toggleViewportJumpButtons } from "./mode.js";
import {
	parseMouseInput,
	visualizeInput,
	findHitRegion,
	isViewportRow,
	isPrimaryPointerPress,
	isPrimaryPointerDrag,
	type InputResponse,
} from "./mouse.js";
import {
	hideUtilityOverlay,
	hideViewOverlay,
	hideSkillsOverlay,
	hideModelsOverlay,
	toggleUtilityOverlay,
	toggleViewOverlay,
	toggleSkillsOverlay,
	toggleModelsOverlay,
	toggleModelsOverlay as selectModel,
	activateModelButton,
	handleSkillsDropdownWheel,
	handleModelsDropdownWheel,
	handleSkillsDropdownMouse,
	handleModelsDropdownMouse,
	handleDropdownMouse,
	setActivateButton,
	getSkillsDrag,
	getModelsDrag,
	hideDropdown,
	type DropdownKind,
} from "./dropdowns.js";
import type {
	ButtonSpec,
	MouseInput,
	ShellAction,
} from "./types.js";

// Wire activateButton back into dropdowns.ts (breaks circular dep)
setActivateButton(activateButton);

// ---------------------------------------------------------------------------
// Viewport wheel
// ---------------------------------------------------------------------------

const VIEWPORT_WHEEL_SCROLL_LINES = 3;

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
			selectModel();
			return { consume: true };
		case "cycleThinkingLevel": {
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
// Input handler registration
// ---------------------------------------------------------------------------

export function registerInputHandler(ctx: { ui: any }): void {
	unregisterInputHandler();

	const skillsDrag = getSkillsDrag();
	const modelsDrag = getModelsDrag();

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
			if (state.ui.overlays.skills.drag && mouse.phase === "release") return skillsDrag.finish(mouse);
			if (state.ui.overlays.skills.drag && isPrimaryPointerDrag(mouse)) return skillsDrag.update(mouse);
			if (state.ui.overlays.models.drag && mouse.phase === "release") return modelsDrag.finish(mouse);
			if (state.ui.overlays.models.drag && isPrimaryPointerDrag(mouse)) return modelsDrag.update(mouse);
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
				const clickedRow = Math.floor((mouse.row - state.ui.nav.row) / 3);
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
