import type { Theme } from "@mariozechner/pi-coding-agent";
import type { Model } from "@mariozechner/pi-ai";
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
	| "toggleModelMenu"
	| "setModelScopeScoped"
	| "setModelScopeAll"
	| "togglePromptMirror"
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
	| "page-down"
	| "prompt-mirror";

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
		showContext: boolean;
		showJobs: boolean;
		showTimestamp: boolean;
		contextBarWidth: number;
	};
	viewport: {
		pageOverlapLines: number;
		minPageScrollLines: number;
	};
	utilityOverlay: {
		autoOpenOnEnable: boolean;
		keepOpenAfterButtonActivation: boolean;
	};
	promptMirror: {
		enabled: boolean;
		placeholder: string;
		prefix: string;
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

export type ModelMenuScope = "scoped" | "all";

export interface ProviderHitRegion {
	provider: string;
	colStart: number;
	colEnd: number;
	rowOffset: number;
}

export interface ModelHitRegion {
	model: Model<any>;
	colStart: number;
	colEnd: number;
	rowOffset: number;
}

export interface PhoneShellRenderState {
	tui?: TUI;
	theme?: Theme;
	viewport?: ViewportController;
	headerButtons: ButtonHitRegion[];
	barRow: number;
	barButtons: ButtonHitRegion[];
	barActualHeight: number;
	utilityOverlay?: OverlayHandle;
	utilityOverlayVisible: boolean;
	utilityOverlayRow: number;
	utilityOverlayCol: number;
	utilityOverlayWidth: number;
	utilityButtons: ButtonHitRegion[];
	utilityButtonsHeight: number;
	utilityActualHeight: number;
	modelMenuOverlay?: OverlayHandle;
	modelMenuVisible: boolean;
	modelMenuRow: number;
	modelMenuCol: number;
	modelMenuWidth: number;
	modelMenuHeight: number;
	modelMenuScope: ModelMenuScope;
	modelMenuScopeButtons: ButtonHitRegion[];
	modelMenuProviderButtons: ProviderHitRegion[];
	modelMenuModelButtons: ModelHitRegion[];
	modelMenuSelectedProvider?: string;
	promptMirrorVisible: boolean;
	originalChat?: Component;
	viewportRow: number;
	viewportHeight: number;
	agentState: AgentStateInfo;
}

export interface PhoneShellRenderContext {
	state: PhoneShellRenderState;
	getConfig(): PhoneShellConfig;
	getLayout(): PhoneShellLayout;
	getTheme(): Theme;
	getPromptMirrorText(): string;
}
