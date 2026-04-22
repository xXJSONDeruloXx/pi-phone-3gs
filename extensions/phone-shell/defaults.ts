import type { AgentStateInfo, ButtonSpec, CommandMode, PersistedShellState, PhoneShellConfig, PhoneShellLayout } from "./types.js";

export const PRIMARY_COMMAND = "phone-shell";
export const TOGGLE_ALIAS_COMMAND = "touch";
export const COMPAT_COMMAND = "pi-touch";
export const TOGGLE_SHORTCUT = "ctrl+1";
export const STATUS_KEY = "phone-shell";
export const BOOTSTRAP_WIDGET_KEY = "phone-shell-bootstrap";
export const BAR_WIDGET_KEY = "phone-shell-bar";
export const CHAT_CHILD_INDEX = 1;
export const BAR_HEIGHT = 3;
export const ENABLE_MOUSE = "\x1b[?1000h\x1b[?1006h";
export const DISABLE_MOUSE = "\x1b[?1000l\x1b[?1006l";

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
	"paths",
	"top",
	"bottom",
	"page-up",
	"page-down",
	"prompt-mirror",
] as const;

export const HEADER_CHILD_INDEX = 0;
export const HEADER_HEIGHT = 2;

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
		showContext: true,
		showJobs: true,
		showTimestamp: true,
		contextBarWidth: 10,
	},
	viewport: {
		pageOverlapLines: 20,
		minPageScrollLines: 3,
	},
	utilityOverlay: {
		autoOpenOnEnable: false,
		keepOpenAfterButtonActivation: true,
	},
	promptMirror: {
		enabled: true,
		placeholder: "(prompt empty)",
		prefix: " > ",
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
	{ kind: "input", id: "interrupt", label: "  ^C   ", data: "\x03", palette: "warning" },
	{ kind: "action", id: "follow-up", label: " ⌥ ↵ ", action: "sendFollowUp", palette: "warning" },
	{ kind: "action", id: "prompt-mirror", label: " MIR ", action: "togglePromptMirror", palette: "warning" },
];

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
	enabled: false,
	autoEnable: true,
};

export const CONFIG_TEMPLATE = JSON.stringify(DEFAULT_CONFIG, null, 2);
export const LAYOUT_TEMPLATE = JSON.stringify(DEFAULT_LAYOUT, null, 2);
