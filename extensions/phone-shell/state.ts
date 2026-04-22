import type { Theme } from "@mariozechner/pi-coding-agent";
import { promises as fs } from "node:fs";
import path from "node:path";
import { DEFAULT_AGENT_STATE, DEFAULT_CONFIG } from "./defaults.js";
import { getPhoneShellPaths, loadPhoneShellSettings } from "./config.js";
import type { Model } from "@mariozechner/pi-ai";
import type { Component, OverlayHandle } from "@mariozechner/pi-tui";
import type {
	ButtonHitRegion,
	MouseInput,
	PhoneShellConfig,
	PhoneShellLayout,
	PhoneShellRenderContext,
	PhoneShellRenderState,
	ViewportController,
} from "./types.js";
import type { AgentStateTracker } from "./header.js";

// ---------------------------------------------------------------------------
// Runtime state
// ---------------------------------------------------------------------------

export type RuntimeState = PhoneShellRenderState & {
	enabled: boolean;
	config: PhoneShellConfig;
	layout: PhoneShellLayout;
	paths: ReturnType<typeof getPhoneShellPaths>;
	loadErrors: string[];
	inputUnsubscribe?: () => void;
	logQueue: Promise<void>;
	renderQueued: boolean;
	lastInput?: string;
	lastMouse?: MouseInput;
	lastAction?: string;
	statusSink?: (key: string, text: string | undefined) => void;
	notify?: (text: string, type?: string) => void;
	setEditorText?: (text: string) => void;
	getEditorText?: () => string;
	setWidget?: (key: string, content: any, options?: any) => void;
	setEditorComponent?: (factory: ((tui: any, theme: any, keybindings: any) => any) | undefined) => void;
	modelRegistry?: { getAll(): Model<any>[]; getAvailable(): Model<any>[] };
	currentModel?: Model<any>;
	setModel?: (model: Model<any>) => Promise<boolean>;
	agentTracker?: AgentStateTracker;
	headerInstalled?: boolean;
	viewportDrag?: {
		anchorRow: number;
		anchorScrollTop: number;
		lastRow: number;
	};
};

export const state: RuntimeState = {
	enabled: false,
	config: DEFAULT_CONFIG,
	layout: { utilityButtons: [], bottomGroups: [] },
	paths: getPhoneShellPaths(),
	loadErrors: [],
	headerButtons: [],
	barRow: 0,
	barButtons: [],
	barActualHeight: 3,
	utilityOverlayVisible: false,
	utilityOverlayRow: 0,
	utilityOverlayCol: 0,
	utilityOverlayWidth: 0,
	utilityButtons: [],
	utilityButtonsHeight: 3,
	utilityActualHeight: 3,
	modelMenuVisible: false,
	modelMenuRow: 0,
	modelMenuCol: 0,
	modelMenuWidth: 0,
	modelMenuHeight: 0,
	modelMenuScope: "scoped",
	modelMenuScopeButtons: [],
	modelMenuProviderButtons: [],
	modelMenuModelButtons: [],
	promptMirrorVisible: DEFAULT_CONFIG.promptMirror.enabled,
	promptProxyInstalled: false,
	proxyOnly: false,
	viewportRow: 0,
	viewportHeight: 0,
	agentState: { ...DEFAULT_AGENT_STATE },
	logQueue: Promise.resolve(),
	renderQueued: false,
};

// ---------------------------------------------------------------------------
// Render context (shared by all phone-shell components)
// ---------------------------------------------------------------------------

export function getTheme(): Theme {
	if (!state.theme) throw new Error("phone-shell theme not initialized");
	return state.theme;
}

export const renderContext: PhoneShellRenderContext = {
	state,
	getConfig: () => state.config,
	getLayout: () => state.layout,
	getTheme,
	getPromptMirrorText: () => {
		try {
			return state.getEditorText?.() ?? "";
		} catch {
			return "";
		}
	},
};

// ---------------------------------------------------------------------------
// Shared utilities
// ---------------------------------------------------------------------------

export function queueLog(message: string): void {
	state.logQueue = state.logQueue
		.catch(() => undefined)
		.then(async () => {
			await fs.mkdir(path.dirname(state.paths.log), { recursive: true });
			await fs.appendFile(state.paths.log, `${new Date().toISOString()} ${message}\n`, "utf8");
		})
		.catch(() => undefined);
}

export function scheduleRender(): void {
	if (state.renderQueued) return;
	state.renderQueued = true;
	queueMicrotask(() => {
		state.renderQueued = false;
		state.tui?.requestRender();
	});
}

export function setLastAction(label: string): void {
	state.lastAction = label;
	queueLog(`action ${label}`);
}

export function captureUiBindings(ctx: { ui: any }): void {
	state.statusSink = ctx.ui.setStatus.bind(ctx.ui);
	state.notify = ctx.ui.notify.bind(ctx.ui);
	state.theme = ctx.ui.theme;
	state.setEditorText = ctx.ui.setEditorText.bind(ctx.ui);
	state.getEditorText = ctx.ui.getEditorText.bind(ctx.ui);
	state.setWidget = ctx.ui.setWidget.bind(ctx.ui);
	state.setEditorComponent = ctx.ui.setEditorComponent?.bind(ctx.ui);
}

// ---------------------------------------------------------------------------
// Config reload
// ---------------------------------------------------------------------------

export async function reloadRuntimeSettings(ctx?: { ui: any }, notifyOnProblems = false): Promise<void> {
	const { config, layout, errors } = await loadPhoneShellSettings(state.paths);
	state.config = config;
	state.layout = layout;
	state.loadErrors = errors;
	state.promptMirrorVisible = config.promptMirror.enabled;
	if (notifyOnProblems && errors.length > 0) {
		ctx?.ui.notify(`phone-shell loaded with ${errors.length} config warning(s)`, "warning");
	}
	if (errors.length > 0) {
		queueLog(`config warnings: ${errors.join(" | ")}`);
	}
	scheduleRender();
}

// ---------------------------------------------------------------------------
// Status / debug reporting
// ---------------------------------------------------------------------------

export function getStatusReport(): string {
	const viewport = state.viewport?.getDebugState();
	const mouse = state.lastMouse
		? `phase=${state.lastMouse.phase} code=${state.lastMouse.code} row=${state.lastMouse.row} col=${state.lastMouse.col}`
		: "(none)";

	return [
		"# phone-shell status",
		"",
		`- enabled: ${state.enabled}`,
		`- state file: ${state.paths.state}`,
		`- config file: ${state.paths.config}`,
		`- layout file: ${state.paths.layout}`,
		`- log file: ${state.paths.log}`,
		state.tui ? `- terminal: ${state.tui.terminal.columns} cols × ${state.tui.terminal.rows} rows` : "- terminal: (not captured)",
		state.barRow > 0 ? `- bar: row=${state.barRow} buttons=${state.barButtons.length}` : "- bar: (not rendered)",
		`- utility overlay: ${state.utilityOverlayVisible}`,
		`- prompt mirror: ${state.promptMirrorVisible}`,
		`- config warnings: ${state.loadErrors.length === 0 ? "none" : state.loadErrors.join(" | ")}`,
		`- last action: ${state.lastAction ?? "(none)"}`,
		`- last input: ${state.lastInput ?? "(none)"}`,
		`- last mouse: ${mouse}`,
		viewport
			? `- viewport: scrollTop=${viewport.scrollTop} visibleHeight=${viewport.visibleHeight} totalLines=${viewport.totalLines} maxTop=${viewport.maxTop} followBottom=${viewport.followBottom} percent=${viewport.percent}`
			: "- viewport: (not installed)",
	].join("\n");
}

export async function getLogTail(lines = state.config.logging.tailLines): Promise<string> {
	try {
		const content = await fs.readFile(state.paths.log, "utf8");
		const tail = content.trimEnd().split(/\r?\n/).slice(-lines);
		return tail.length > 0 ? tail.join("\n") : "(log is empty)";
	} catch (error: unknown) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") return "(log file does not exist yet)";
		throw error;
	}
}
