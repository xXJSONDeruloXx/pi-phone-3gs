import type { Theme } from "@mariozechner/pi-coding-agent";
import type { Component, OverlayHandle, TUI } from "@mariozechner/pi-tui";

export type ButtonPalette = "accent" | "warning" | "muted";

export type AgentPhase = "idle" | "thinking" | "streaming" | "tool_calling";

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
	| "toggleBottomBar"
	| "togglePromptProxy"
	| "toggleNavPad"
	| "toggleViewportJumpButtons"
	| "scrollTop"
	| "pageUp"
	| "cycleModel"
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

export interface PhoneShellPaths {
	config: string;
	layout: string;
	state: string;
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

export interface DropdownOverlayState {
	handle?: OverlayHandle;
	visible: boolean;
	row: number;
	col: number;
	width: number;
	buttons: ButtonHitRegion[];
	actualHeight: number;
}

export interface BarLayoutState {
	row: number;
	buttons: ButtonHitRegion[];
	actualHeight: number;
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
	mirroredEditor?: { getProxyLines(width: number): string[] };
	originalChat?: Component;
}

export interface ShellModeState {
	enabled: boolean;
	barVisible: boolean;
	navPadVisible: boolean;
	viewportJumpButtonsVisible: boolean;
	proxyOnly: boolean;
	promptProxyInstalled: boolean;
	headerInstalled: boolean;
}

export interface PhoneShellUIState {
	headerButtons: ButtonHitRegion[];
	bar: BarLayoutState;
	nav: NavLayoutState;
	overlays: {
		utility: DropdownOverlayState;
		view: DropdownOverlayState;
	};
	viewport: ViewportLayoutState;
}

export interface PhoneShellRenderState {
	session: SessionRenderState;
	shell: ShellModeState;
	ui: PhoneShellUIState;
}

export interface PhoneShellRenderContext {
	state: PhoneShellRenderState;
	getConfig(): PhoneShellConfig;
	getLayout(): PhoneShellLayout;
	getTheme(): Theme;
}
