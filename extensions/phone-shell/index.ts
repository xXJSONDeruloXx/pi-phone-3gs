import type { ExtensionAPI, ExtensionCommandContext, Theme } from "@mariozechner/pi-coding-agent";
import type { Component, TUI } from "@mariozechner/pi-tui";
import { Key, matchesKey, truncateToWidth } from "@mariozechner/pi-tui";
import { promises as fs } from "node:fs";
import path from "node:path";
import { TouchViewport, BottomBarComponent, UtilityOverlayComponent } from "./components.js";
import {
	BAR_HEIGHT,
	BAR_WIDGET_KEY,
	BOOTSTRAP_WIDGET_KEY,
	COMMANDS,
	COMPAT_COMMAND,
	CONFIG_TEMPLATE,
	DISABLE_MOUSE,
	ENABLE_MOUSE,
	LAYOUT_TEMPLATE,
	PRIMARY_COMMAND,
	STATUS_KEY,
	TOGGLE_ALIAS_COMMAND,
	TOGGLE_SHORTCUT,
	DEFAULT_CONFIG,
	DEFAULT_LAYOUT,
} from "./defaults.js";
import { getPhoneShellPaths, loadPersistedShellState, loadPhoneShellSettings, savePersistedShellState } from "./config.js";
import type {
	ButtonHitRegion,
	ButtonSpec,
	CommandMode,
	MouseInput,
	PhoneShellConfig,
	PhoneShellLayout,
	PhoneShellRenderState,
	ShellAction,
} from "./types.js";

const EMPTY_COMPONENT: Component = {
	render: () => [],
	invalidate: () => {},
};

type InputResponse = { consume?: boolean; data?: string } | undefined;
type NotifyType = "info" | "warning" | "error";
type UiCarrier = { ui: ExtensionCommandContext["ui"] };

type TopLevelSlots = {
	header: Component;
	chat: Component;
	pending: Component;
	status: Component;
	widgetAbove: Component;
	editor: Component;
	widgetBelow: Component;
	footer: Component;
};

type RuntimeState = PhoneShellRenderState & {
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
	setEditorText?: (text: string) => void;
	getEditorText?: () => string;
	setWidget?: (key: string, content: any, options?: any) => void;
	setHeader?: (factory: any) => void;
	topLevelSlots?: TopLevelSlots;
	activeChatComponent?: Component;
};

const state: RuntimeState = {
	enabled: false,
	config: DEFAULT_CONFIG,
	layout: DEFAULT_LAYOUT,
	paths: getPhoneShellPaths(),
	loadErrors: [],
	barRow: 0,
	barButtons: [],
	barActualHeight: BAR_HEIGHT,
	utilityOverlayVisible: false,
	utilityButtons: [],
	utilityButtonsHeight: BAR_HEIGHT,
	utilityActualHeight: BAR_HEIGHT,
	promptMirrorVisible: DEFAULT_CONFIG.promptMirror.enabled,
	logQueue: Promise.resolve(),
	renderQueued: false,
};

function getTheme(): Theme {
	if (!state.theme) throw new Error("phone-shell theme not initialized");
	return state.theme;
}

const renderContext = {
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

function queueLog(message: string): void {
	state.logQueue = state.logQueue
		.catch(() => undefined)
		.then(async () => {
			await fs.mkdir(path.dirname(state.paths.log), { recursive: true });
			await fs.appendFile(state.paths.log, `${new Date().toISOString()} ${message}\n`, "utf8");
		})
		.catch(() => undefined);
}

function scheduleRender(): void {
	if (state.renderQueued) return;
	state.renderQueued = true;
	queueMicrotask(() => {
		state.renderQueued = false;
		state.tui?.requestRender();
	});
}

function captureUiBindings(ctx: UiCarrier): void {
	state.statusSink = ctx.ui.setStatus.bind(ctx.ui);
	state.theme = ctx.ui.theme;
	state.setEditorText = ctx.ui.setEditorText.bind(ctx.ui);
	state.getEditorText = ctx.ui.getEditorText.bind(ctx.ui);
	state.setWidget = ctx.ui.setWidget.bind(ctx.ui);
	state.setHeader = ctx.ui.setHeader.bind(ctx.ui);
}

async function reloadRuntimeSettings(ctx?: UiCarrier, notifyOnProblems = false): Promise<void> {
	const { config, layout, errors } = await loadPhoneShellSettings(state.paths);
	state.config = config;
	state.layout = layout;
	state.loadErrors = errors;
	state.promptMirrorVisible = config.promptMirror.enabled && config.editor.position === "bottom";
	if (notifyOnProblems && errors.length > 0) {
		ctx?.ui.notify(`phone-shell loaded with ${errors.length} config warning(s)`, "warning");
	}
	if (errors.length > 0) {
		queueLog(`config warnings: ${errors.join(" | ")}`);
	}
	applyHeaderMode();
	applyTopLevelLayout();
	scheduleRender();
}

function parseMouseInput(data: string): MouseInput | undefined {
	const match = data.match(/^\x1b\[<(\d+);(\d+);(\d+)([Mm])$/);
	if (!match) return undefined;
	return {
		raw: data,
		code: Number.parseInt(match[1]!, 10),
		col: Number.parseInt(match[2]!, 10),
		row: Number.parseInt(match[3]!, 10),
		phase: match[4] === "M" ? "press" : "release",
	};
}

function isPrimaryPointerPress(mouse: MouseInput): boolean {
	if (mouse.phase !== "press") return false;
	if ((mouse.code & 64) !== 0) return false;
	return (mouse.code & 0b11) === 0;
}

function visualizeInput(data: string): string {
	return JSON.stringify(
		data.replace(/\x1b/g, "<ESC>").replace(/[\x00-\x1f\x7f]/g, (char) => {
			if (char === "\n") return "<LF>";
			if (char === "\r") return "<CR>";
			if (char === "\t") return "<TAB>";
			const code = char.charCodeAt(0).toString(16).padStart(2, "0");
			return `<0x${code}>`;
		}),
	);
}

function clearCapturedTui(): void {
	state.tui = undefined;
	state.theme = undefined;
	state.setEditorText = undefined;
	state.getEditorText = undefined;
	state.setWidget = undefined;
	state.setHeader = undefined;
	state.topLevelSlots = undefined;
	state.activeChatComponent = undefined;
}

function captureTopLevelSlots(): boolean {
	if (!state.tui) return false;
	if (state.topLevelSlots) return true;
	const children = state.tui.children;
	if (children.length < 8) return false;
	state.topLevelSlots = {
		header: children[0]!,
		chat: children[1]!,
		pending: children[2]!,
		status: children[3]!,
		widgetAbove: children[4]!,
		editor: children[5]!,
		widgetBelow: children[6]!,
		footer: children[children.length - 1]!,
	};
	state.activeChatComponent = state.topLevelSlots.chat;
	return true;
}

function desiredTopLevelChildren(): Component[] {
	const slots = state.topLevelSlots;
	if (!slots) return state.tui?.children ?? [];
	const chat = state.activeChatComponent ?? slots.chat;
	if (state.enabled && state.config.editor.position === "top") {
		return [slots.header, slots.widgetAbove, slots.editor, slots.widgetBelow, chat, slots.pending, slots.status, slots.footer];
	}
	return [slots.header, chat, slots.pending, slots.status, slots.widgetAbove, slots.editor, slots.widgetBelow, slots.footer];
}

function applyTopLevelLayout(force = false): void {
	if (!state.tui || !captureTopLevelSlots()) return;
	const next = desiredTopLevelChildren();
	const children = state.tui.children;
	const unchanged = children.length === next.length && children.every((child, index) => child === next[index]);
	if (!unchanged) {
		children.splice(0, children.length, ...next);
		queueLog(`editor layout ${state.config.editor.position}`);
	}
	state.tui.requestRender(force);
}

function renderCompactHeader(): any {
	return (_tui: TUI, theme: Theme) => ({
		render(width: number): string[] {
			const title = theme.bold(theme.fg("accent", state.config.header.title));
			const subtitle = state.config.header.subtitle ? theme.fg("dim", ` ${state.config.header.subtitle}`) : "";
			const position = theme.fg("muted", `editor:${state.config.editor.position}`);
			const hint = theme.fg("dim", ` /${PRIMARY_COMMAND} status • ${TOGGLE_SHORTCUT}`);
			const lines = [
				`${title}${subtitle}`,
				`${position}${hint}`,
			];
			if (state.loadErrors.length > 0) {
				lines.push(theme.fg("warning", `${state.loadErrors.length} config warning(s) • /${PRIMARY_COMMAND} status`));
			}
			return lines.map((line) => truncateToWidth(line, width, "", true));
		},
		invalidate() {},
	});
}

function applyHeaderMode(): void {
	if (!state.setHeader) return;
	if (!state.enabled) {
		state.setHeader(undefined);
		return;
	}
	if (state.config.header.mode === "builtin") {
		state.setHeader(undefined);
		return;
	}
	if (state.config.header.mode === "hidden") {
		state.setHeader(() => ({ render: () => [], invalidate() {} }));
		return;
	}
	state.setHeader(renderCompactHeader());
}

function captureTui(ctx: UiCarrier): boolean {
	if (state.tui) return true;
	ctx.ui.setWidget(
		BOOTSTRAP_WIDGET_KEY,
		(tui, theme) => {
			state.tui = tui;
			state.theme = theme;
			return EMPTY_COMPONENT;
		},
		{ placement: "belowEditor" },
	);
	ctx.ui.setWidget(BOOTSTRAP_WIDGET_KEY, undefined);
	captureTopLevelSlots();
	return Boolean(state.tui);
}

function installViewport(): void {
	if (!state.tui || !captureTopLevelSlots() || !state.topLevelSlots) return;
	const current = state.activeChatComponent ?? state.topLevelSlots.chat;
	if (current instanceof TouchViewport) {
		state.viewport = current;
		return;
	}
	state.originalChat = state.topLevelSlots.chat;
	state.viewport = new TouchViewport(state.tui, state.topLevelSlots.chat, renderContext);
	state.activeChatComponent = state.viewport;
	state.viewport.toBottom();
	applyTopLevelLayout(true);
	queueLog("viewport installed");
}

function uninstallViewport(): void {
	if (!state.tui || !state.originalChat) return;
	state.activeChatComponent = state.originalChat;
	applyTopLevelLayout(true);
	queueLog("viewport uninstalled");
	state.viewport = undefined;
	state.originalChat = undefined;
}

function showPanel(): void {
	if (!state.setWidget) return;
	state.setWidget(BAR_WIDGET_KEY, (tui: TUI) => new BottomBarComponent(tui, renderContext), { placement: "belowEditor" });
	queueLog("bar shown");
}

function hidePanel(): void {
	state.setWidget?.(BAR_WIDGET_KEY, undefined, { placement: "belowEditor" });
	state.barRow = 0;
	state.barButtons = [];
	state.barActualHeight = BAR_HEIGHT;
	queueLog("bar hidden");
}

function destroyPanel(): void {
	state.setWidget?.(BAR_WIDGET_KEY, undefined, { placement: "belowEditor" });
	state.barRow = 0;
	state.barButtons = [];
	state.barActualHeight = BAR_HEIGHT;
	queueLog("bar destroyed");
}

function showUtilityOverlay(): void {
	if (!state.tui || state.utilityOverlay) return;
	state.utilityOverlay = state.tui.showOverlay(new UtilityOverlayComponent(state.tui, renderContext), {
		anchor: "top-left",
		row: 0,
		col: 0,
		width: "100%",
		nonCapturing: true,
	});
	state.utilityOverlayVisible = true;
	queueLog("utility overlay shown");
}

function hideUtilityOverlay(): void {
	state.utilityOverlay?.hide();
	state.utilityOverlay = undefined;
	state.utilityOverlayVisible = false;
	state.utilityButtons = [];
	state.utilityButtonsHeight = BAR_HEIGHT;
	state.utilityActualHeight = BAR_HEIGHT;
	queueLog("utility overlay hidden");
}

function toggleUtilityOverlay(): void {
	if (state.utilityOverlayVisible) hideUtilityOverlay();
	else showUtilityOverlay();
}

function enableMouseTracking(): void {
	state.tui?.terminal.write(ENABLE_MOUSE);
	queueLog("mouse tracking enabled");
}

function disableMouseTracking(): void {
	state.tui?.terminal.write(DISABLE_MOUSE);
	queueLog("mouse tracking disabled");
}

function setLastAction(label: string): void {
	state.lastAction = label;
	queueLog(`action ${label}`);
}

function performAction(action: ShellAction): InputResponse {
	switch (action) {
		case "toggleUtilities":
			toggleUtilityOverlay();
			return { consume: true };
		case "togglePromptMirror":
			if (state.config.editor.position === "top") {
				return { consume: true };
			}
			state.promptMirrorVisible = !state.promptMirrorVisible;
			scheduleRender();
			return { consume: true };
		case "scrollTop":
			state.viewport?.toTop();
			return { consume: true };
		case "pageUp":
			state.viewport?.pageUp();
			return { consume: true };
		case "cycleModel":
			return { data: state.config.inputs.modelCycle };
		case "pageDown":
			state.viewport?.pageDown();
			return { consume: true };
		case "scrollBottom":
			state.viewport?.toBottom();
			return { consume: true };
		case "sendEscape":
			return { data: "\x1b" };
		case "sendInterrupt":
			return { data: "\x03" };
		case "sendFollowUp":
			return { data: state.config.inputs.followUp };
		case "openSlash":
			state.setEditorText?.("");
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

function activateButton(button: ButtonSpec, origin: "utility" | "bar"): InputResponse {
	setLastAction(`${origin}:${button.id}`);

	if (button.kind === "command") {
		state.setEditorText?.(button.command);
		if (origin === "utility" && !state.config.utilityOverlay.keepOpenAfterButtonActivation) {
			hideUtilityOverlay();
		}
		scheduleRender();
		return { data: "\r" };
	}

	if (button.kind === "input") {
		if (origin === "utility" && !state.config.utilityOverlay.keepOpenAfterButtonActivation) {
			hideUtilityOverlay();
		}
		return { data: button.data };
	}

	if (button.kind === "editorKey") {
		if (button.clearFirst) {
			state.setEditorText?.(button.setText ?? "");
		} else if (button.setText !== undefined) {
			state.setEditorText?.(button.setText);
		}
		if (origin === "utility" && !state.config.utilityOverlay.keepOpenAfterButtonActivation) {
			hideUtilityOverlay();
		}
		scheduleRender();
		return { data: button.data };
	}

	return performAction(button.action);
}

function findHitRegion(buttons: ButtonHitRegion[], rowOffset: number, col: number): ButtonSpec | undefined {
	for (const region of buttons) {
		if (region.rowOffset === rowOffset && col >= region.colStart && col <= region.colEnd) return region.button;
	}
	return undefined;
}

function registerInputHandler(ctx: UiCarrier): void {
	state.inputUnsubscribe?.();
	state.inputUnsubscribe = ctx.ui.onTerminalInput((data) => {
		state.lastInput = visualizeInput(data);

		const mouse = parseMouseInput(data);
		if (mouse) {
			state.lastMouse = mouse;
			queueLog(`mouse ${mouse.phase} code=${mouse.code} row=${mouse.row} col=${mouse.col}`);
			if (!state.enabled || !isPrimaryPointerPress(mouse)) return { consume: true };

			if (state.utilityOverlayVisible && mouse.row >= 1 && mouse.row <= state.utilityActualHeight) {
				if (mouse.row > state.utilityButtonsHeight) return { consume: true };
				const clickedRow = Math.floor((mouse.row - 1) / BAR_HEIGHT);
				const button = findHitRegion(state.utilityButtons, clickedRow, mouse.col);
				return button ? activateButton(button, "utility") : { consume: true };
			}

			const inBar = state.barRow > 0 && mouse.row >= state.barRow && mouse.row < state.barRow + state.barActualHeight;
			if (!inBar) return { consume: true };
			const clickedRow = Math.floor((mouse.row - state.barRow) / BAR_HEIGHT);
			const button = findHitRegion(state.barButtons, clickedRow, mouse.col);
			return button ? activateButton(button, "bar") : { consume: true };
		}

		if (state.enabled && state.utilityOverlayVisible) scheduleRender();
		if (!state.enabled) return undefined;

		if (matchesKey(data, Key.pageUp)) {
			setLastAction("keyboard:pageUp");
			state.viewport?.pageUp();
			return { consume: true };
		}
		if (matchesKey(data, Key.pageDown)) {
			setLastAction("keyboard:pageDown");
			state.viewport?.pageDown();
			return { consume: true };
		}
		if (matchesKey(data, Key.home)) {
			setLastAction("keyboard:top");
			state.viewport?.toTop();
			return { consume: true };
		}
		if (matchesKey(data, Key.end)) {
			setLastAction("keyboard:bottom");
			state.viewport?.toBottom();
			return { consume: true };
		}

		return undefined;
	});
}

function unregisterInputHandler(): void {
	state.inputUnsubscribe?.();
	state.inputUnsubscribe = undefined;
}

function touchStatusText(): string {
	const theme = getTheme();
	return theme.fg("accent", "phone") + theme.fg("dim", " shell");
}

async function disableTouchMode(ctx?: UiCarrier, permanent = false, persist = true): Promise<void> {
	if (!state.enabled && !permanent) return;
	state.enabled = false;
	disableMouseTracking();
	unregisterInputHandler();
	hideUtilityOverlay();
	hidePanel();
	uninstallViewport();
	applyHeaderMode();
	state.statusSink?.(STATUS_KEY, undefined);
	if (permanent) {
		destroyPanel();
		clearCapturedTui();
	}
	if (persist) await savePersistedShellState(state.paths, false).catch(() => undefined);
	ctx?.ui.notify("phone-shell disabled", "info");
	queueLog(`disabled permanent=${permanent}`);
}

async function enableTouchMode(ctx: UiCarrier, persist = true): Promise<void> {
	captureUiBindings(ctx);
	await reloadRuntimeSettings(ctx, false);
	if (!captureTui(ctx) || !state.tui) {
		ctx.ui.notify("phone-shell: failed to capture TUI instance", "error");
		queueLog("failed to capture TUI instance");
		return;
	}
	state.enabled = true;
	applyHeaderMode();
	installViewport();
	showPanel();
	enableMouseTracking();
	registerInputHandler(ctx);
	if (state.config.utilityOverlay.autoOpenOnEnable) showUtilityOverlay();
	if (persist) await savePersistedShellState(state.paths, true).catch(() => undefined);
	ctx.ui.setStatus(STATUS_KEY, touchStatusText());
	if (state.loadErrors.length > 0) {
		ctx.ui.notify(`phone-shell enabled • ${state.loadErrors.length} config warning(s)`, "warning");
	} else {
		ctx.ui.notify("phone-shell enabled", "info");
	}
	queueLog("enabled");
}

function getStatusReport(): string {
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
		`- editor position: ${state.config.editor.position}`,
		`- header mode: ${state.config.header.mode}`,
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

async function getLogTail(lines = state.config.logging.tailLines): Promise<string> {
	try {
		const content = await fs.readFile(state.paths.log, "utf8");
		const tail = content.trimEnd().split(/\r?\n/).slice(-lines);
		return tail.length > 0 ? tail.join("\n") : "(log is empty)";
	} catch (error: unknown) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") return "(log file does not exist yet)";
		throw error;
	}
}

function parseCommandMode(args: string): CommandMode | undefined {
	const token = args.trim().toLowerCase().split(/\s+/)[0] ?? "";
	if (!token) return "status";
	if (token === "up" || token === "pgup") return "page-up";
	if (token === "down" || token === "pgdn") return "page-down";
	if (token === "config") return "show-config";
	if (token === "layout") return "show-layout";
	if (token === "reload") return "reload-config";
	if (token === "mirror") return "prompt-mirror";
	return COMMANDS.find((command: CommandMode) => command === token);
}

function commandItems() {
	return [
		{ value: "on", label: "on", description: "Enable phone-shell mode" },
		{ value: "off", label: "off", description: "Disable phone-shell mode" },
		{ value: "toggle", label: "toggle", description: "Toggle phone-shell mode" },
		{ value: "status", label: "status", description: "Paste runtime status into the editor" },
		{ value: "log", label: "log", description: "Paste recent phone-shell log lines into the editor" },
		{ value: "reload-config", label: "reload-config", description: "Reload user config and layout files" },
		{ value: "show-config", label: "show-config", description: "Paste effective config JSON into the editor" },
		{ value: "show-layout", label: "show-layout", description: "Paste effective layout JSON into the editor" },
		{ value: "config-template", label: "config-template", description: "Paste a config template into the editor" },
		{ value: "layout-template", label: "layout-template", description: "Paste a layout template into the editor" },
		{ value: "paths", label: "paths", description: "Paste config, layout, state, and log paths into the editor" },
		{ value: "top", label: "top", description: "Scroll chat viewport to the top" },
		{ value: "bottom", label: "bottom", description: "Scroll chat viewport to the bottom" },
		{ value: "page-up", label: "page-up", description: "Page chat viewport upward" },
		{ value: "page-down", label: "page-down", description: "Page chat viewport downward" },
		{ value: "prompt-mirror", label: "prompt-mirror", description: "Toggle the prompt mirror in the utility overlay" },
	];
}

async function handlePrimaryCommand(args: string, ctx: ExtensionCommandContext): Promise<void> {
	captureUiBindings(ctx);
	const command = parseCommandMode(args);
	if (!command) {
		ctx.ui.notify(
			`Usage: /${PRIMARY_COMMAND} [${COMMANDS.join("|")}]`,
			"warning",
		);
		return;
	}

	switch (command) {
		case "on":
			await enableTouchMode(ctx);
			return;
		case "off":
			await disableTouchMode(ctx);
			return;
		case "toggle":
			if (state.enabled) await disableTouchMode(ctx);
			else await enableTouchMode(ctx);
			return;
		case "status":
			ctx.ui.setEditorText(getStatusReport());
			ctx.ui.notify("phone-shell status pasted into editor", "info");
			return;
		case "log": {
			const tail = await getLogTail();
			ctx.ui.setEditorText(`# phone-shell log\n\n${tail}`);
			ctx.ui.notify("phone-shell log pasted into editor", "info");
			return;
		}
		case "reload-config":
			await reloadRuntimeSettings(ctx, true);
			ctx.ui.notify("phone-shell config reloaded", state.loadErrors.length > 0 ? "warning" : "info");
			return;
		case "show-config":
			ctx.ui.setEditorText(JSON.stringify(state.config, null, 2));
			ctx.ui.notify("phone-shell config pasted into editor", "info");
			return;
		case "show-layout":
			ctx.ui.setEditorText(JSON.stringify(state.layout, null, 2));
			ctx.ui.notify("phone-shell layout pasted into editor", "info");
			return;
		case "config-template":
			ctx.ui.setEditorText(CONFIG_TEMPLATE);
			ctx.ui.notify("phone-shell config template pasted into editor", "info");
			return;
		case "layout-template":
			ctx.ui.setEditorText(LAYOUT_TEMPLATE);
			ctx.ui.notify("phone-shell layout template pasted into editor", "info");
			return;
		case "paths":
			ctx.ui.setEditorText([
				`config: ${state.paths.config}`,
				`layout: ${state.paths.layout}`,
				`state: ${state.paths.state}`,
				`log: ${state.paths.log}`,
			].join("\n"));
			ctx.ui.notify("phone-shell paths pasted into editor", "info");
			return;
		case "top":
			state.viewport?.toTop();
			ctx.ui.notify("phone-shell: top", "info");
			return;
		case "bottom":
			state.viewport?.toBottom();
			ctx.ui.notify("phone-shell: bottom", "info");
			return;
		case "page-up":
			state.viewport?.pageUp();
			ctx.ui.notify("phone-shell: page up", "info");
			return;
		case "page-down":
			state.viewport?.pageDown();
			ctx.ui.notify("phone-shell: page down", "info");
			return;
		case "prompt-mirror":
			if (state.config.editor.position === "top") {
				ctx.ui.notify("phone-shell prompt mirror is unused while the real editor is on top", "info");
				return;
			}
			state.promptMirrorVisible = !state.promptMirrorVisible;
			scheduleRender();
			ctx.ui.notify(`phone-shell prompt mirror ${state.promptMirrorVisible ? "shown" : "hidden"}`, "info");
			return;
	}
}

export default function phoneShellExtension(pi: ExtensionAPI) {
	pi.on("session_start", async (_event, ctx) => {
		if (!ctx.hasUI) return;
		captureUiBindings(ctx);
		await reloadRuntimeSettings(ctx, false);
		try {
			const persisted = await loadPersistedShellState(state.paths);
			if (!persisted.enabled || !persisted.autoEnable) return;
			setTimeout(() => {
				void enableTouchMode(ctx, false).catch(() => undefined);
			}, 200);
		} catch {
			// Never let startup failures break pi.
		}
	});

	pi.on("session_shutdown", async () => {
		await disableTouchMode(undefined, true, false);
		state.lastInput = undefined;
		state.lastMouse = undefined;
		state.lastAction = undefined;
		state.statusSink = undefined;
		state.theme = undefined;
		state.getEditorText = undefined;
		state.setWidget = undefined;
	});

	pi.registerShortcut(TOGGLE_SHORTCUT, {
		description: "Toggle phone-shell mode on/off",
		handler: async (ctx) => {
			if (!ctx.hasUI) return;
			captureUiBindings(ctx);
			if (state.enabled) await disableTouchMode(ctx);
			else await enableTouchMode(ctx);
		},
	});

	pi.registerCommand(TOGGLE_ALIAS_COMMAND, {
		description: "Toggle phone-shell mode on/off",
		handler: async (_args, ctx) => {
			if (!ctx.hasUI) {
				console.log("phone-shell requires interactive mode.");
				return;
			}
			captureUiBindings(ctx);
			if (state.enabled) await disableTouchMode(ctx);
			else await enableTouchMode(ctx);
		},
	});

	const registerPrimaryHandler = (name: string, description: string) => {
		pi.registerCommand(name, {
			description,
			getArgumentCompletions: (prefix: string) => {
				const token = prefix.trim().toLowerCase().split(/\s+/).pop() ?? "";
				const items = commandItems();
				if (!token) return items;
				const filtered = items.filter((item) => item.value.startsWith(token));
				return filtered.length > 0 ? filtered : null;
			},
			handler: async (args, ctx) => {
				if (!ctx.hasUI) {
					console.log("phone-shell requires interactive mode.");
					return;
				}
				await handlePrimaryCommand(args, ctx);
			},
		});
	};

	registerPrimaryHandler(
		PRIMARY_COMMAND,
		"Phone-first shell with touch rails, viewport controls, and per-user config/layout overrides",
	);
	registerPrimaryHandler(
		COMPAT_COMMAND,
		"Compatibility alias for the phone-shell command namespace",
	);
}
