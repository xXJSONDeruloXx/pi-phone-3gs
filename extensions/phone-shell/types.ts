import type { Theme } from "@mariozechner/pi-coding-agent";
import type { Component, OverlayHandle, TUI } from "@mariozechner/pi-tui";
import type { DiscoveredEditorContainer } from "./pi-types.js";

export type ButtonPalette = "accent" | "warning" | "muted";

export type AgentPhase = "idle" | "thinking" | "streaming" | "tool_calling";

export type ThinkingLevel = "off" | "minimal" | "low" | "medium" | "high" | "xhigh";

export const THINKING_LEVEL_ORDER: ThinkingLevel[] = ["off", "minimal", "low", "medium", "high", "xhigh"];

export function thinkingLevelLabel(level: ThinkingLevel): string {
	const map: Record<ThinkingLevel, string> = {
		off: "OFF",
		minimal: "MIN",
		low: "LOW",
		medium: "MED",
		high: "HI",
		xhigh: "XHI",
	};
	return map[level] ?? "???";
}

export function nextThinkingLevel(current: ThinkingLevel): ThinkingLevel {
	const idx = THINKING_LEVEL_ORDER.indexOf(current);
	return THINKING_LEVEL_ORDER[(idx + 1) % THINKING_LEVEL_ORDER.length]!;
}

export interface AgentStateInfo {
	phase: AgentPhase;
	model: string;
	contextTokens: number | null;
	contextLimit: number | null;
	contextPercent: number | null;
	backgroundJobs: number;
	lastUpdate: number;
}

export type ShellAction =
	| "toggleUtilities"
	| "toggleViewMenu"
	| "toggleSkillsMenu"
	| "togglePromptsMenu"
	| "toggleBottomBar"
	| "toggleEditorPosition"
	| "toggleNavPad"
	| "toggleViewportJumpButtons"
	| "toggleViewportScrollDirection"
	| "toggleTopEditorSendButton"
	| "toggleTopEditorStashButton"
	| "toggleTopEditorFollowUpButton"
	| "toggleTopEditorEscButton"
	| "toggleTopEditorInterruptButton"
	| "togglePiFooter"
	| "stashEditor"
	| "scrollTop"
	| "pageUp"
	| "selectModel"
	| "showAllModels"
	| "cycleThinkingLevel"
	| "pageDown"
	| "scrollBottom"
	| "sendEscape"
	| "sendInterrupt"
	| "sendFollowUp"
	| "openSlash"
	| "arrowLeft"
	| "arrowUp"
	| "arrowDown"
	| "arrowRight"
	| "sendEnter"
	| "newTerminalTab"
	| "closeTerminalTab"
	| "nextTerminalTab"
	| "prevTerminalTab";

export type CommandMode =
	| "on"
	| "off"
	| "toggle"
	| "status"
	| "log"
	| "reload-config"
	| "show-config"
	| "show-layout"
	| "config-template"
	| "layout-template"
	| "favorites-template"
	| "paths"
	| "top"
	| "bottom"
	| "page-up"
	| "page-down";

export type ButtonSpec =
	| {
		kind: "command";
		id: string;
		label: string;
		command: string;
		palette?: ButtonPalette;
	}
	| {
		kind: "input";
		id: string;
		label: string;
		data: string;
		palette?: ButtonPalette;
	}
	| {
		kind: "editorKey";
		id: string;
		label: string;
		data: string;
		clearFirst?: boolean;
		setText?: string;
		palette?: ButtonPalette;
	}
	| {
		kind: "action";
		id: string;
		label: string;
		action: ShellAction;
		palette?: ButtonPalette;
	};

export interface PhoneShellLayout {
	utilityButtons: ButtonSpec[];
	bottomGroups: ButtonSpec[][];
}

export interface PhoneShellConfig {
	header: {
		enabled: boolean;
	};
	viewport: {
		pageOverlapLines: number;
		minPageScrollLines: number;
	};
	kineticScroll: {
		enabled: boolean;
		/** Number of recent drag samples to use for velocity estimation. */
		velocitySampleCount: number;
		/** Friction multiplier applied each frame (< 1). Higher = slower deceleration. */
		friction: number;
		/** Minimum velocity (rows/frame) below which momentum stops. */
		stopThreshold: number;
		/** Animation frame interval in ms (~16 = 60fps). */
		frameIntervalMs: number;
	};
	utilityOverlay: {
		autoOpenOnEnable: boolean;
		keepOpenAfterButtonActivation: boolean;
	};
	viewOverlay: {
		keepOpenAfterButtonActivation: boolean;
	};
	skillsOverlay: {
		keepOpenAfterButtonActivation: boolean;
	};
	promptsOverlay: {
		keepOpenAfterButtonActivation: boolean;
	};
	render: {
		buttonGap: number;
		leadingColumns: number;
	};
	inputs: {
		modelCycle: string;
		followUp: string;
	};
	logging: {
		tailLines: number;
	};
}

export interface PersistedShellState {
	enabled: boolean;
	autoEnable: boolean;
	proxyOnly: boolean;
	barVisible: boolean;
	navPadVisible: boolean;
	viewportJumpButtonsVisible: boolean;
	viewportScrollDirectionInverted: boolean;
	topEditorSendButtonVisible: boolean;
	topEditorStashButtonVisible: boolean;
	topEditorFollowUpButtonVisible: boolean;
	topEditorEscButtonVisible: boolean;
	topEditorInterruptButtonVisible: boolean;
	piFooterVisible: boolean;
}

/**
 * A favorites rail entry. Exactly one of `command`, `action`, or `data` must be set.
 *
 * - `command` → sends a slash command through the editor
 * - `action`  → performs a shell action (arrows, escape, scroll, toggles, etc.)
 * - `data`    → sends raw terminal bytes (e.g. ctrl+c, escape sequences)
 *              Set `kind: "editorKey"` to use editorKey mode with clearFirst/setText.
 */
export type FavoriteEntry = {
	/** Short label shown on the rail button. Keep ≤ 6 chars. */
	label: string;
	/** Full slash command sent when tapped, e.g. "/skill:ralph-wiggum" or "/compact". */
	command?: string;
	/** Shell action to perform when tapped. */
	action?: ShellAction;
	/** Raw terminal bytes to send when tapped, e.g. "\u0003" for ctrl+c. */
	data?: string;
	/**
	 * Optional explicit kind override. Only needed when `data` is set:
	 * omit (or "input") for a raw input send, set to "editorKey" for
	 * editor-aware key sends with optional clearFirst/setText.
	 */
	kind?: "input" | "editorKey";
	/** (editorKey only) Clear editor before sending data. */
	clearFirst?: boolean;
	/** (editorKey only) Set editor text before sending data. */
	setText?: string;
	/** Optional palette override. Defaults to "accent". */
	palette?: ButtonPalette;
};

export interface PhoneShellPaths {
	config: string;
	layout: string;
	state: string;
	favorites: string;
	log: string;
}

export interface MouseInput {
	raw: string;
	code: number;
	col: number;
	row: number;
	phase: "press" | "release" | "move" | "scroll";
	scrollDirection?: "up" | "down" | "left" | "right";
}

export interface ViewportDebugState {
	scrollTop: number;
	visibleHeight: number;
	totalLines: number;
	maxTop: number;
	followBottom: boolean;
	percent: number;
}

export interface ViewportController extends Component {
	scrollLines(delta: number): void;
	toTop(): void;
	pageUp(): void;
	pageDown(): void;
	toBottom(): void;
	setScrollTop(scrollTop: number): void;
	setScrollTopSmooth(scrollTop: number): void;
	applyDragDamping(rawTarget: number, maxTop: number): number;
	isOverscrolled(): boolean;
	startMomentum(initialVelocity: number, allowSnapBack?: boolean): void;
	cancelMomentum(): void;
	getDebugState(): ViewportDebugState;
}

export interface ButtonHitRegion {
	button: ButtonSpec;
	colStart: number;
	colEnd: number;
	rowOffset: number;
}

export interface DropdownDragState {
	anchorRow: number;
	anchorScrollOffset: number;
	phase: "potential-tap" | "dragging";
	tapRow: number;
	tapCol: number;
	hitButton?: ButtonSpec;
}

export interface DropdownOverlayState {
	handle?: OverlayHandle;
	visible: boolean;
	row: number;
	col: number;
	width: number;
	buttons: ButtonHitRegion[];
	actualHeight: number;
	scrollOffset: number;
	maxVisibleItems: number;
	drag?: DropdownDragState;
}

export interface BarDragState {
	anchorCol: number;
	anchorScrollX: number;
	phase: "potential-tap" | "dragging";
	tapCol: number;
	tapRow: number;
}

export interface BarLayoutState {
	row: number;
	buttons: ButtonHitRegion[];
	actualHeight: number;
	scrollX: number;
	maxScrollX: number;
	drag?: BarDragState;
}

export interface NavLayoutState {
	row: number;
	buttons: ButtonHitRegion[];
	actualHeight: number;
	placement: "hidden" | "top" | "bottom";
}

export interface ViewportDragState {
	anchorRow: number;
	anchorScrollTop: number;
	lastRow: number;
}

export interface VelocitySample {
	row: number;
	time: number;
}

export interface MomentumState {
	velocity: number;
	animationFrame: ReturnType<typeof setTimeout> | undefined;
}

export interface ViewportLayoutState {
	row: number;
	height: number;
	/** Total rendered height including jump bars. */
	renderedHeight: number;
	buttons: ButtonHitRegion[];
	drag?: ViewportDragState;
	velocitySamples: VelocitySample[];
	momentum?: MomentumState;
}

export interface EditorLayoutState {
	row: number;
	height: number;
	buttons: ButtonHitRegion[];
}

export interface SessionRenderState {
	tui?: TUI;
	theme?: Theme;
	viewport?: ViewportController;
	/** Discovered editorContainer — a Container-like object that holds the active editor. */
	editorContainer?: DiscoveredEditorContainer;
	/** Active phone-shell custom editor instance, when installed. */
	phoneShellEditor?: Component;
	/** Original index of editorContainer in tui.children before proxy mode moves it. */
	editorContainerOriginalIndex?: number;
	originalChat?: Component;
}

export interface ShellModeState {
	enabled: boolean;
	barVisible: boolean;
	navPadVisible: boolean;
	viewportJumpButtonsVisible: boolean;
	viewportScrollDirectionInverted: boolean;
	topEditorSendButtonVisible: boolean;
	topEditorStashButtonVisible: boolean;
	topEditorFollowUpButtonVisible: boolean;
	topEditorEscButtonVisible: boolean;
	topEditorInterruptButtonVisible: boolean;
	/** When false, the Pi footer is replaced with a zero-height component to reclaim screen rows. */
	piFooterVisible: boolean;
	proxyOnly: boolean;
	/** True while editorContainer has been moved to the top of the TUI children array. */
	editorAtTop: boolean;
	headerInstalled: boolean;
}

export interface PhoneShellUIState {
	headerButtons: ButtonHitRegion[];
	bar: BarLayoutState;
	nav: NavLayoutState;
	overlays: {
		utility: DropdownOverlayState;
		view: DropdownOverlayState;
		skills: DropdownOverlayState;
		prompts: DropdownOverlayState;
		models: DropdownOverlayState;
		allModels: DropdownOverlayState;
	};
	viewport: ViewportLayoutState;
	editor: EditorLayoutState;
}

export interface PhoneShellRenderState {
	session: SessionRenderState;
	shell: ShellModeState;
	ui: PhoneShellUIState;
	thinkingLevel: ThinkingLevel;
	/** Whether the models overlay shows scoped (default) or all models. */
	modelsScopeFilter: "scoped" | "all";
}

export interface PhoneShellRenderContext {
	state: PhoneShellRenderState;
	getConfig(): PhoneShellConfig;
	getLayout(): PhoneShellLayout;
	getFavorites(): FavoriteEntry[];
	getTheme(): Theme;
}
