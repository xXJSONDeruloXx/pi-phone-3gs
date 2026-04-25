import type { Theme } from "@mariozechner/pi-coding-agent";
import type { Model } from "@mariozechner/pi-ai";
import { promises as fs } from "node:fs";
import path from "node:path";
import { DEFAULT_CONFIG } from "./defaults.js";
import { getPhoneShellPaths, loadFavorites, loadPhoneShellSettings } from "./config.js";
import type {
	FavoriteEntry,
	MouseInput,
	PhoneShellConfig,
	PhoneShellLayout,
	PhoneShellRenderContext,
	PhoneShellRenderState,
	ThinkingLevel,
} from "./types.js";
import type { AgentStateTracker } from "./header.js";

// ---------------------------------------------------------------------------
// Runtime state
// ---------------------------------------------------------------------------

export type RuntimeState = PhoneShellRenderState & {
	config: PhoneShellConfig;
	layout: PhoneShellLayout;
	favorites: FavoriteEntry[];
	paths: ReturnType<typeof getPhoneShellPaths>;
	pi?: { getCommands(): { name: string; description?: string; source: string }[] };
	diagnostics: {
		loadErrors: string[];
		logQueue: Promise<void>;
		renderQueued: boolean;
		lastInput?: string;
		lastMouse?: MouseInput;
		lastAction?: string;
	};
	bindings: {
		statusSink?: (key: string, text: string | undefined) => void;
		notify?: (text: string, type?: string) => void;
		setEditorText?: (text: string) => void;
		getEditorText?: () => string;
		setWidget?: (key: string, content: any, options?: any) => void;
		setEditorComponent?: (factory: ((tui: any, theme: any, keybindings: any) => any) | undefined) => void;
		abort?: () => void;
		isIdle?: () => boolean;
	};
	inputUnsubscribe?: () => void;
	modelRegistry?: { getAll(): Model<any>[]; getAvailable(): Model<any>[] };
	currentModel?: Model<any>;
	setModel?: (model: Model<any>) => Promise<boolean>;
	thinkingLevel: ThinkingLevel;
	editorStash?: string;
	getThinkingLevel?: () => ThinkingLevel;
	setThinkingLevel?: (level: ThinkingLevel) => void;
	agentTracker?: AgentStateTracker;
};

export const state: RuntimeState = {
	session: {
		tui: undefined,
		theme: undefined,
		viewport: undefined,
		editorContainer: undefined,
		phoneShellEditor: undefined,
		editorContainerOriginalIndex: undefined,
		originalChat: undefined,
	},
	shell: {
		enabled: false,
		barVisible: true,
		navPadVisible: false,
		viewportJumpButtonsVisible: true,
		topEditorSendButtonVisible: true,
		topEditorStashButtonVisible: true,
		proxyOnly: false,
		editorAtTop: false,
		headerInstalled: false,
	},
	ui: {
		headerButtons: [],
		bar: {
			row: 0,
			buttons: [],
			actualHeight: 3,
			scrollX: 0,
			maxScrollX: 0,
			drag: undefined,
		},
		nav: {
			row: 0,
			buttons: [],
			actualHeight: 3,
			placement: "hidden",
		},
		overlays: {
			utility: {
				handle: undefined,
				visible: false,
				row: 0,
				col: 0,
				width: 0,
				buttons: [],
				actualHeight: 3,
				scrollOffset: 0,
				maxVisibleItems: 0,
				drag: undefined,
			},
			view: {
				handle: undefined,
				visible: false,
				row: 0,
				col: 0,
				width: 0,
				buttons: [],
				actualHeight: 3,
				scrollOffset: 0,
				maxVisibleItems: 0,
				drag: undefined,
			},
			skills: {
				handle: undefined,
				visible: false,
				row: 0,
				col: 0,
				width: 0,
				buttons: [],
				actualHeight: 3,
				scrollOffset: 0,
				maxVisibleItems: 0,
				drag: undefined,
			},
			models: {
				handle: undefined,
				visible: false,
				row: 0,
				col: 0,
				width: 0,
				buttons: [],
				actualHeight: 3,
				scrollOffset: 0,
				maxVisibleItems: 0,
				drag: undefined,
			},
		},
		viewport: {
			row: 0,
			height: 0,
			buttons: [],
			drag: undefined,
		},
		editor: {
			row: 0,
			height: 0,
			buttons: [],
		},
	},
	config: DEFAULT_CONFIG,
	layout: { utilityButtons: [], bottomGroups: [] },
	favorites: [],
	paths: getPhoneShellPaths(),
	diagnostics: {
		loadErrors: [],
		logQueue: Promise.resolve(),
		renderQueued: false,
		lastInput: undefined,
		lastMouse: undefined,
		lastAction: undefined,
	},
	bindings: {
		statusSink: undefined,
		notify: undefined,
		setEditorText: undefined,
		getEditorText: undefined,
		setWidget: undefined,
		setEditorComponent: undefined,
		abort: undefined,
		isIdle: undefined,
	},
	inputUnsubscribe: undefined,
	modelRegistry: undefined,
	currentModel: undefined,
	setModel: undefined,
	thinkingLevel: "off",
	editorStash: undefined,
	getThinkingLevel: undefined,
	setThinkingLevel: undefined,
	agentTracker: undefined,
	pi: undefined,
};

// ---------------------------------------------------------------------------
// Render context (shared by all phone-shell components)
// ---------------------------------------------------------------------------

export function getTheme(): Theme {
	if (!state.session.theme) throw new Error("phone-shell theme not initialized");
	return state.session.theme;
}

export const renderContext: PhoneShellRenderContext = {
	state,
	getConfig: () => state.config,
	getLayout: () => state.layout,
	getFavorites: () => state.favorites,
	getTheme,
};

// ---------------------------------------------------------------------------
// Shared utilities
// ---------------------------------------------------------------------------

export function queueLog(message: string): void {
	state.diagnostics.logQueue = state.diagnostics.logQueue
		.catch(() => undefined) // absorb any prior queue rejection — never let logger errors cascade
		.then(async () => {
			await fs.mkdir(path.dirname(state.paths.log), { recursive: true });
			await fs.appendFile(state.paths.log, `${new Date().toISOString()} ${message}\n`, "utf8");
		})
		.catch(() => undefined); // suppress write errors — can't log them without infinite recursion
}

export function scheduleRender(): void {
	if (state.diagnostics.renderQueued) return;
	state.diagnostics.renderQueued = true;
	queueMicrotask(() => {
		state.diagnostics.renderQueued = false;
		state.session.tui?.requestRender();
	});
}

export function setLastAction(label: string): void {
	state.diagnostics.lastAction = label;
	queueLog(`action ${label}`);
}

export function captureUiBindings(ctx: { ui: any; abort?: () => void; isIdle?: () => boolean }): void {
	state.bindings.statusSink = ctx.ui.setStatus.bind(ctx.ui);
	state.bindings.notify = ctx.ui.notify.bind(ctx.ui);
	state.session.theme = ctx.ui.theme;
	state.bindings.setEditorText = ctx.ui.setEditorText.bind(ctx.ui);
	state.bindings.getEditorText = ctx.ui.getEditorText.bind(ctx.ui);
	state.bindings.setWidget = ctx.ui.setWidget.bind(ctx.ui);
	state.bindings.setEditorComponent = ctx.ui.setEditorComponent?.bind(ctx.ui);
	state.bindings.abort = ctx.abort?.bind(ctx);
	state.bindings.isIdle = ctx.isIdle?.bind(ctx);
}

// ---------------------------------------------------------------------------
// Config reload
// ---------------------------------------------------------------------------

export async function reloadRuntimeSettings(ctx?: { ui: any }, notifyOnProblems = false): Promise<void> {
	const { config, layout, errors } = await loadPhoneShellSettings(state.paths);
	const { favorites, errors: favErrors } = await loadFavorites(state.paths);
	state.config = config;
	state.layout = layout;
	state.favorites = favorites;
	const allErrors = [...errors, ...favErrors];
	state.diagnostics.loadErrors = allErrors;
	if (notifyOnProblems && allErrors.length > 0) {
		ctx?.ui.notify(`phone-shell loaded with ${allErrors.length} config warning(s)`, "warning");
	}
	if (allErrors.length > 0) {
		queueLog(`config warnings: ${allErrors.join(" | ")}`);
	}
	scheduleRender();
}

// ---------------------------------------------------------------------------
// Status / debug reporting
// ---------------------------------------------------------------------------

export function getStatusReport(): string {
	const viewport = state.session.viewport?.getDebugState();
	const mouse = state.diagnostics.lastMouse
		? `phase=${state.diagnostics.lastMouse.phase} code=${state.diagnostics.lastMouse.code} row=${state.diagnostics.lastMouse.row} col=${state.diagnostics.lastMouse.col}`
		: "(none)";

	return [
		"# phone-shell status",
		"",
		`- enabled: ${state.shell.enabled}`,
		`- state file: ${state.paths.state}`,
		`- config file: ${state.paths.config}`,
		`- layout file: ${state.paths.layout}`,
		`- favorites file: ${state.paths.favorites} (${state.favorites.length} item(s))`,
		`- log file: ${state.paths.log}`,
		state.session.tui ? `- terminal: ${state.session.tui.terminal.columns} cols × ${state.session.tui.terminal.rows} rows` : "- terminal: (not captured)",
		state.ui.bar.row > 0 ? `- bar: row=${state.ui.bar.row} buttons=${state.ui.bar.buttons.length}` : "- bar: (not rendered)",
		state.ui.nav.row > 0 ? `- nav: row=${state.ui.nav.row} placement=${state.ui.nav.placement} buttons=${state.ui.nav.buttons.length}` : `- nav: ${state.shell.navPadVisible ? `${state.ui.nav.placement}` : "disabled"}`,
		`- viewport jump buttons: ${state.shell.viewportJumpButtonsVisible} (${state.ui.viewport.buttons.length} hit regions)`,
		`- editor send button: ${state.shell.topEditorSendButtonVisible} (${state.ui.editor.buttons.length} hit regions)`,
		`- editor stash button: ${state.shell.topEditorStashButtonVisible}`,
		`- editor stash: ${state.editorStash ? `${state.editorStash.length} chars` : "empty"}`,
		`- utility overlay: ${state.ui.overlays.utility.visible}`,
		`- view overlay: ${state.ui.overlays.view.visible}`,
		`- skills overlay: ${state.ui.overlays.skills.visible}`,
		`- models overlay: ${state.ui.overlays.models.visible}`,
		`- loaded skills: ${state.pi?.getCommands().filter(c => c.source === "skill").length ?? "?"}`,
		`- config warnings: ${state.diagnostics.loadErrors.length === 0 ? "none" : state.diagnostics.loadErrors.join(" | ")}`,
		`- last action: ${state.diagnostics.lastAction ?? "(none)"}`,
		`- last input: ${state.diagnostics.lastInput ?? "(none)"}`,
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
