import { modelsAreEqual, type Model } from "@mariozechner/pi-ai";
import { BAR_HEIGHT, getViewMenuButtons, HEADER_HEIGHT } from "./defaults.js";
import { ButtonDropdownOverlayComponent, getDropdownInnerWidth } from "./overlay.js";
import { renderContext, queueLog, scheduleRender, setLastAction, state } from "./state.js";
import { findHitRegion, isViewportRow, type InputResponse } from "./mouse.js";
import type {
	ButtonHitRegion,
	ButtonSpec,
	MouseInput,
} from "./types.js";

// ---------------------------------------------------------------------------
// Dropdown types
// ---------------------------------------------------------------------------

export type DropdownKind = "utility" | "view" | "skills" | "models";

// ---------------------------------------------------------------------------
// Model helpers
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Dropdown state helpers
// ---------------------------------------------------------------------------

export function getDropdownOverlayState(kind: DropdownKind) {
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

// ---------------------------------------------------------------------------
// Dropdown lifecycle (show / hide / toggle)
// ---------------------------------------------------------------------------

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

export function hideDropdown(kind: DropdownKind): void {
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

// ---------------------------------------------------------------------------
// Public overlay aliases
// ---------------------------------------------------------------------------

export const showUtilityOverlay = (): void => showDropdown("utility");
export const hideUtilityOverlay = (): void => hideDropdown("utility");
export const toggleUtilityOverlay = (): void => toggleDropdown("utility");
export const showViewOverlay = (): void => showDropdown("view");
export const hideViewOverlay = (): void => hideDropdown("view");
export const toggleViewOverlay = (): void => toggleDropdown("view");
export const showSkillsOverlay = (): void => showDropdown("skills");
export const hideSkillsOverlay = (): void => hideDropdown("skills");
export const toggleSkillsOverlay = (): void => toggleDropdown("skills");
export const showModelsOverlay = (): void => showDropdown("models");
export const hideModelsOverlay = (): void => hideDropdown("models");
export const toggleModelsOverlay = (): void => toggleDropdown("models");

// ---------------------------------------------------------------------------
// Model activation
// ---------------------------------------------------------------------------

export function activateModelButton(button: ButtonSpec): InputResponse {
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

// ---------------------------------------------------------------------------
// Scrollable dropdown drag (skills / models)
// ---------------------------------------------------------------------------

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

function createScrollableDragHandlers(
	kind: "skills" | "models",
	getButtons: () => ButtonSpec[],
	onTap: (button: ButtonSpec) => InputResponse,
	hideOverlay: () => void,
) {
	const start = (mouse: MouseInput): InputResponse => {
		const overlay = state.ui.overlays[kind];
		const button = findHitRegion(overlay.buttons, mouse.row - 1, mouse.col);
		overlay.drag = {
			anchorRow: mouse.row,
			anchorScrollOffset: overlay.scrollOffset,
			phase: "potential-tap",
			tapRow: mouse.row,
			tapCol: mouse.col,
			hitButton: button,
		};
		setLastAction(`mouse:${kind}-drag-start`);
		return { consume: true };
	};

	const update = (mouse: MouseInput): InputResponse => {
		const drag = state.ui.overlays[kind].drag;
		if (!drag) return { consume: true };
		const delta = mouse.row - drag.anchorRow;
		if (Math.abs(delta) > 2) drag.phase = "dragging";
		if (drag.phase === "dragging") {
			const overlay = state.ui.overlays[kind];
			const totalButtons = getButtons().length;
			const maxOffset = Math.max(0, totalButtons - overlay.maxVisibleItems);
			const deltaButtons = Math.round(delta / 3);
			overlay.scrollOffset = Math.max(0, Math.min(maxOffset, drag.anchorScrollOffset - deltaButtons));
			scheduleRender();
		}
		return { consume: true };
	};

	const finish = (mouse: MouseInput): InputResponse => {
		const drag = state.ui.overlays[kind].drag;
		if (!drag) return { consume: true };
		state.ui.overlays[kind].drag = undefined;
		if (drag.phase === "potential-tap" && drag.hitButton) {
			return onTap(drag.hitButton);
		}
		setLastAction(`mouse:${kind}-drag-end`);
		return { consume: true };
	};

	const handleMouse = (mouse: MouseInput): InputResponse | undefined => {
		const overlay = state.ui.overlays[kind];
		if (!overlay.visible) return undefined;
		const { row, col, width, actualHeight } = overlay;
		const inOverlayRows = mouse.row >= row + 1 && mouse.row <= row + actualHeight;
		const inOverlayCols = mouse.col >= col && mouse.col <= col + width - 1;
		if (inOverlayRows && inOverlayCols) return start(mouse);
		hideOverlay();
		return { consume: true };
	};

	return { start, update, finish, handleMouse };
}

const skillsDrag = createScrollableDragHandlers(
	"skills",
	getSkillsMenuButtons,
	(button) => activateButton(button, "skills"),
	hideSkillsOverlay,
);

const modelsDrag = createScrollableDragHandlers(
	"models",
	getModelMenuButtons,
	(button) => activateModelButton(button),
	hideModelsOverlay,
);

// ---------------------------------------------------------------------------
// Dropdown mouse dispatch (re-exported for input handler)
// ---------------------------------------------------------------------------

function isDropdownRow(kind: DropdownKind, row: number, col: number): boolean {
	const overlay = getDropdownOverlayState(kind);
	return overlay.visible
		&& row >= overlay.row + 1
		&& row <= overlay.row + overlay.actualHeight
		&& col >= overlay.col
		&& col <= overlay.col + overlay.width - 1;
}

export function handleSkillsDropdownWheel(mouse: MouseInput): InputResponse {
	const direction = mouse.scrollDirection;
	if (!direction) return { consume: true };
	if (!isDropdownRow("skills", mouse.row, mouse.col)) return undefined;
	if (direction === "left" || direction === "right") return { consume: true };
	if (adjustScrollableDropdownOffset("skills", direction === "up" ? -1 : 1)) {
		setLastAction(`mouse:skills-wheel-${direction}`);
	}
	return { consume: true };
}

export function handleModelsDropdownWheel(mouse: MouseInput): InputResponse {
	const direction = mouse.scrollDirection;
	if (!direction) return { consume: true };
	if (!isDropdownRow("models", mouse.row, mouse.col)) return undefined;
	if (direction === "left" || direction === "right") return { consume: true };
	if (adjustScrollableDropdownOffset("models", direction === "up" ? -1 : 1)) {
		setLastAction(`mouse:models-wheel-${direction}`);
	}
	return { consume: true };
}

export function handleSkillsDropdownMouse(mouse: MouseInput): InputResponse | undefined {
	return skillsDrag.handleMouse(mouse);
}

export function handleModelsDropdownMouse(mouse: MouseInput): InputResponse | undefined {
	return modelsDrag.handleMouse(mouse);
}

export function handleDropdownMouse(kind: "utility" | "view", mouse: MouseInput): InputResponse | undefined {
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

// ---------------------------------------------------------------------------
// Re-export activateButton from this module's circular-free position.
// activateButton is defined in input.ts but skills/models drag needs it.
// We break the cycle by having input.ts set this at registration time.
// ---------------------------------------------------------------------------

let _activateButton: (button: ButtonSpec, origin: "utility" | "view" | "skills" | "bar" | "nav" | "header" | "editor") => InputResponse = () => ({ consume: true });

export function setActivateButton(fn: typeof _activateButton): void {
	_activateButton = fn;
}

function activateButton(button: ButtonSpec, origin: "utility" | "view" | "skills" | "bar" | "nav" | "header" | "editor"): InputResponse {
	return _activateButton(button, origin);
}

// Export drag handler references for input handler
export function getSkillsDrag() { return skillsDrag; }
export function getModelsDrag() { return modelsDrag; }
