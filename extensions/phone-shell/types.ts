import type { Theme } from "@mariozechner/pi-coding-agent";
import type { Component, OverlayHandle, TUI } from "@mariozechner/pi-tui";

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
	| "toggleBottomBar"
	| "toggleEditorPosition"
	| "toggleNavPad"
	| "toggleViewportJumpButtons"
	| "scrollTop"
	| "pageUp"
	| "cycleModel"
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
	| "sendEnter";

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
	utilityOverlay: {
		autoOpenOnEnable: boolean;
		keepOpenAfterButtonActivation: boolean;
	};
	viewOverlay: {
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
}

export interface FavoriteEntry {
	/** Short label shown on the rail button. Keep ≤ 6 chars. */
	label: string;
	/** Full slash command sent when tapped, e.g. "/skill:ralph-wiggum" or "/compact". */
	command: string;
	/** Optional palette override. Defaults to "accent". */
	palette?: ButtonPalette;
}

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
	phase: "press" | "release" | "move";
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
	toTop(): void;
	pageUp(): void;
	pageDown(): void;
	toBottom(): void;
	setScrollTop(scrollTop: number): void;
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

export interface ViewportLayoutState {
	row: number;
	height: number;
	buttons: ButtonHitRegion[];
	drag?: {
		anchorRow: number;
		anchorScrollTop: number;
		lastRow: number;
	};
}

export interface SessionRenderState {
	tui?: TUI;
	theme?: Theme;
	viewport?: ViewportController;
	/** Pi's editorContainer Container instance — selectors and dialogs inject here. */
	editorContainer?: object;
	/** Original index of editorContainer in tui.children before proxy mode moves it. */
	editorContainerOriginalIndex?: number;
	originalChat?: Component;
}

export interface ShellModeState {
	enabled: boolean;
	barVisible: boolean;
	navPadVisible: boolean;
	viewportJumpButtonsVisible: boolean;
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
	};
	viewport: ViewportLayoutState;
}

export interface PhoneShellRenderState {
	session: SessionRenderState;
	shell: ShellModeState;
	ui: PhoneShellUIState;
	thinkingLevel: ThinkingLevel;
}

export interface PhoneShellRenderContext {
	state: PhoneShellRenderState;
	getConfig(): PhoneShellConfig;
	getLayout(): PhoneShellLayout;
	getFavorites(): FavoriteEntry[];
	getTheme(): Theme;
}
