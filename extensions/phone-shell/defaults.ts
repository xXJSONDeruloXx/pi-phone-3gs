import type { AgentStateInfo, ButtonSpec, CommandMode, FavoriteEntry, PersistedShellState, PhoneShellConfig, PhoneShellLayout, ShellModeState } from "./types.js";

export const PRIMARY_COMMAND = "phone-shell";
export const TOGGLE_ALIAS_COMMAND = "touch";
export const COMPAT_COMMAND = "pi-touch";
export const TOGGLE_SHORTCUT = "ctrl+1";
export const STATUS_KEY = "phone-shell";
export const BOOTSTRAP_WIDGET_KEY = "phone-shell-bootstrap";
export const BAR_WIDGET_KEY = "phone-shell-bar";
export const NAV_WIDGET_KEY = "phone-shell-nav";
export const CHAT_CHILD_INDEX = 1;
export const BAR_HEIGHT = 3;
export const ENABLE_MOUSE = "\x1b[?1000h\x1b[?1002h\x1b[?1006h";
export const DISABLE_MOUSE = "\x1b[?1000l\x1b[?1002l\x1b[?1006l";

export const COMMANDS: readonly CommandMode[] = [
	"on",
	"off",
	"toggle",
	"status",
	"log",
	"reload-config",
	"show-config",
	"show-layout",
	"config-template",
	"layout-template",
	"favorites-template",
	"paths",
	"top",
	"bottom",
	"page-up",
	"page-down",
] as const;

export const HEADER_CHILD_INDEX = 0;
export const HEADER_HEIGHT = 3;

export const DEFAULT_AGENT_STATE: AgentStateInfo = {
	phase: "idle",
	model: "—",
	contextTokens: null,
	contextLimit: null,
	contextPercent: null,
	backgroundJobs: 0,
	lastUpdate: 0,
};

export const DEFAULT_CONFIG: PhoneShellConfig = {
	header: {
		enabled: true,
	},
	viewport: {
		pageOverlapLines: 20,
		minPageScrollLines: 3,
	},
	utilityOverlay: {
		autoOpenOnEnable: false,
		keepOpenAfterButtonActivation: true,
	},
	viewOverlay: {
		keepOpenAfterButtonActivation: true,
	},
	render: {
		buttonGap: 1,
		leadingColumns: 1,
	},
	inputs: {
		modelCycle: "\x10",
		followUp: "\x1b\r",
	},
	logging: {
		tailLines: 80,
	},
};

const utilityButtons: ButtonSpec[] = [
	{ kind: "command", id: "new", label: " /new  ", command: "/new", palette: "warning" },
	{ kind: "command", id: "reload", label: "/reload", command: "/reload", palette: "warning" },
	{ kind: "command", id: "compact", label: "/compact", command: "/compact", palette: "warning" },
	{ kind: "command", id: "resume", label: "/resume", command: "/resume", palette: "warning" },
	{ kind: "command", id: "tree", label: " /tree ", command: "/tree", palette: "warning" },
	{ kind: "input", id: "interrupt", label: "  ^C   ", data: "\u0003", palette: "warning" },
	{ kind: "action", id: "follow-up", label: " ⌥ ↵ ", action: "sendFollowUp", palette: "warning" },
];

/**
 * Returns VIEW dropdown buttons with palettes that reflect current toggle state.
 * accent = feature is ON, muted = feature is OFF.
 */
export function getViewMenuButtons(shell: ShellModeState): ButtonSpec[] {
	const on: ButtonSpec["palette"] = "accent";
	const off: ButtonSpec["palette"] = "muted";
	return [
		{ kind: "action", id: "view-editor-top", label: "  TOP  ", action: "toggleEditorPosition", palette: shell.proxyOnly ? on : off },
		{ kind: "action", id: "view-stash",      label: " STSH ", action: "toggleTopEditorStashButton", palette: shell.topEditorStashButtonVisible ? on : off },
		{ kind: "action", id: "view-send",       label: " SEND ", action: "toggleTopEditorSendButton", palette: shell.topEditorSendButtonVisible ? on : off },
		{ kind: "action", id: "view-rail",       label: "  FAV  ", action: "toggleBottomBar",       palette: shell.barVisible ? on : off },
		{ kind: "action", id: "view-keys",       label: "  KEYS ", action: "toggleNavPad",          palette: shell.navPadVisible ? on : off },
		{ kind: "action", id: "view-jump",       label: "  JUMP ", action: "toggleViewportJumpButtons", palette: shell.viewportJumpButtonsVisible ? on : off },
	];
}

export const DEFAULT_LAYOUT: PhoneShellLayout = {
	utilityButtons,
	bottomGroups: [
		[
			{ kind: "action", id: "utility-overlay", label: " ETC ", action: "toggleUtilities" },
			{ kind: "action", id: "top", label: " TOP ", action: "scrollTop" },
			{ kind: "action", id: "page-up", label: " PG↑ ", action: "pageUp" },
			{ kind: "action", id: "model", label: "MODEL", action: "cycleModel", palette: "warning" },
			{ kind: "action", id: "page-down", label: " PG↓ ", action: "pageDown" },
			{ kind: "action", id: "bottom", label: " BTM ", action: "scrollBottom" },
		],
		[
			{ kind: "action", id: "escape", label: " ESC ", action: "sendEscape" },
			{ kind: "command", id: "reload-bottom", label: "RLD", command: "/reload", palette: "warning" },
			{ kind: "action", id: "slash", label: "  /  ", action: "openSlash" },
			{ kind: "action", id: "up", label: " ↑ ", action: "arrowUp" },
			{ kind: "action", id: "down", label: " ↓ ", action: "arrowDown" },
			{ kind: "action", id: "left", label: " ← ", action: "arrowLeft" },
			{ kind: "action", id: "right", label: " → ", action: "arrowRight" },
			{ kind: "action", id: "enter", label: " ↵ ", action: "sendEnter" },
		],
	],
};

export const DEFAULT_PERSISTED_STATE: PersistedShellState = {
	enabled: true,
	autoEnable: true,
	proxyOnly: false,
	barVisible: true,
	navPadVisible: false,
	viewportJumpButtonsVisible: true,
	topEditorSendButtonVisible: true,
	topEditorStashButtonVisible: true,
};

export const DEFAULT_FAVORITES: FavoriteEntry[] = [
	{ label: "NEW", command: "/new", palette: "warning" },
	{ label: "CMPT", command: "/compact", palette: "warning" },
	{ label: "RLD", command: "/reload", palette: "warning" },
	{ label: "RSME", command: "/resume" },
	{ label: "TREE", command: "/tree" },
];

export const FAVORITES_TEMPLATE = JSON.stringify(DEFAULT_FAVORITES, null, 2);

export const CONFIG_TEMPLATE = JSON.stringify(DEFAULT_CONFIG, null, 2);
export const LAYOUT_TEMPLATE = JSON.stringify(DEFAULT_LAYOUT, null, 2);
