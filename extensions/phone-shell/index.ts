import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { DEFAULT_AGENT_STATE, COMPAT_COMMAND, PRIMARY_COMMAND, TOGGLE_ALIAS_COMMAND, TOGGLE_SHORTCUT } from "./defaults.js";
import { loadPersistedShellState } from "./config.js";
import { AgentStateTracker } from "./header.js";
import { captureUiBindings, queueLog, reloadRuntimeSettings, scheduleRender, state } from "./state.js";
import { disableTouchMode, enableTouchMode, togglePromptProxyMode } from "./mode.js";
import { commandItems, handlePrimaryCommand } from "./commands.js";

// ---------------------------------------------------------------------------
// Agent event wiring
// ---------------------------------------------------------------------------

function wireAgentEvents(pi: ExtensionAPI): AgentStateTracker {
	const tracker = new AgentStateTracker(() => {
		state.agentState = { ...tracker.state };
		scheduleRender();
	});

	pi.on("model_select", async (event) => {
		tracker.setModel(event.model.id);
		state.currentModel = event.model;
	});

	pi.on("agent_start", async () => {
		tracker.onAgentStart();
	});

	pi.on("agent_end", async () => {
		tracker.onAgentEnd();
	});

	pi.on("turn_start", async () => {
		tracker.onTurnStart();
	});

	pi.on("turn_end", async (_event, ctx) => {
		tracker.onTurnEnd();
		const usage = ctx.getContextUsage();
		if (usage && usage.tokens != null) {
			tracker.updateContext(usage.tokens, usage.contextWindow);
		}
	});

	pi.on("message_update", async () => {
		tracker.onMessageUpdate();
	});

	pi.on("tool_call", async (event) => {
		if (event.toolName === "process") {
			tracker.trackProcessStart();
		}
		tracker.onToolCall();
	});

	pi.on("tool_result", async (event) => {
		if (event.toolName === "process") {
			tracker.trackProcessEnd();
		}
	});

	return tracker;
}

// ---------------------------------------------------------------------------
// Extension entry point
// ---------------------------------------------------------------------------

export default function phoneShellExtension(pi: ExtensionAPI) {
	state.agentTracker = wireAgentEvents(pi);
	state.setModel = pi.setModel.bind(pi);

	pi.on("session_start", async (_event, ctx) => {
		if (!ctx.hasUI) return;
		captureUiBindings(ctx);
		state.modelRegistry = ctx.modelRegistry;
		state.currentModel = ctx.model;
		if (ctx.model) {
			state.agentTracker?.setModel(ctx.model.id);
		}
		await reloadRuntimeSettings(ctx, false);
		try {
			const persisted = await loadPersistedShellState(state.paths);
			state.barVisible = persisted.barVisible !== false;
			if (!persisted.enabled || !persisted.autoEnable) return;
			setTimeout(async () => {
				await enableTouchMode(ctx, false).catch(() => undefined);
				if (persisted.proxyOnly) togglePromptProxyMode();
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
		state.notify = undefined;
		state.modelRegistry = undefined;
		state.currentModel = undefined;
		state.setModel = undefined;
		state.agentTracker?.reset();
		state.agentState = { ...DEFAULT_AGENT_STATE };
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
