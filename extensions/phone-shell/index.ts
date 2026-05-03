import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { COMPAT_COMMAND, PRIMARY_COMMAND, TOGGLE_ALIAS_COMMAND, TOGGLE_SHORTCUT } from "./defaults.js";
import { ensureStarterFiles, loadPersistedShellState } from "./config.js";
import { AgentStateTracker } from "./header.js";
import { captureUiBindings, queueLog, reloadRuntimeSettings, resetState, scheduleRender, state } from "./state.js";
import { disableTouchMode, enableTouchMode, toggleEditorPosition } from "./mode.js";
import { commandItems, handlePrimaryCommand } from "./commands.js";
import { showRecentOverlay } from "./recent.js";

// ---------------------------------------------------------------------------
// Agent event wiring
// ---------------------------------------------------------------------------

function wireAgentEvents(pi: ExtensionAPI): AgentStateTracker {
	const tracker = new AgentStateTracker(() => {
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
	state.pi = pi;
	state.agentTracker = wireAgentEvents(pi);
	state.setModel = pi.setModel.bind(pi);
	state.getThinkingLevel = pi.getThinkingLevel.bind(pi);
	state.setThinkingLevel = pi.setThinkingLevel.bind(pi);

	pi.on("session_start", async (_event, ctx) => {
		if (!ctx.hasUI) return;
		captureUiBindings(ctx);
		// Load enabled models from settings (for scoped model dropdown)
		if (ctx.modelRegistry) {
			try {
				const { SettingsManager } = await import("@mariozechner/pi-coding-agent");
				state.settingsManager = SettingsManager.create(ctx.cwd);
				state.enabledModelPatterns = state.settingsManager.getEnabledModels();
			} catch (e) {
				queueLog(`SettingsManager init failed: ${e}`);
			}
		}
		state.modelRegistry = ctx.modelRegistry;
		state.currentModel = ctx.model;
		if (ctx.model) {
			state.agentTracker?.setModel(ctx.model.id);
		}
		state.thinkingLevel = pi.getThinkingLevel();
		try {
			const created = await ensureStarterFiles(state.paths);
			if (created.length > 0) {
				ctx.ui.notify(`phone-shell starter files created (${created.length})`, "info");
			}
		} catch (e) {
			// Never let bootstrap failures break pi.
			queueLog(`ensureStarterFiles failed: ${e}`);
		}
		await reloadRuntimeSettings(ctx, false);
		try {
			const persisted = await loadPersistedShellState(state.paths);
			state.shell.barVisible = persisted.barVisible;
			state.shell.navPadVisible = persisted.navPadVisible;
			state.shell.viewportJumpButtonsVisible = persisted.viewportJumpButtonsVisible;
			state.shell.viewportScrollDirectionInverted = persisted.viewportScrollDirectionInverted ?? false;
			state.shell.topEditorSendButtonVisible = persisted.topEditorSendButtonVisible;
			state.shell.topEditorStashButtonVisible = persisted.topEditorStashButtonVisible;
			state.shell.topEditorFollowUpButtonVisible = persisted.topEditorFollowUpButtonVisible;
			state.shell.topEditorEscButtonVisible = persisted.topEditorEscButtonVisible;
			state.shell.topEditorInterruptButtonVisible = persisted.topEditorInterruptButtonVisible;
			state.shell.piFooterVisible = persisted.piFooterVisible;
			if (!persisted.enabled || !persisted.autoEnable) return;
			setTimeout(async () => {
				await enableTouchMode(ctx, false).catch((e) => queueLog(`enableTouchMode failed: ${e}`));
				if (persisted.proxyOnly) toggleEditorPosition();
			}, 200);
		} catch (e) {
			// Never let startup failures break pi.
			queueLog(`session_start state restore failed: ${e}`);
		}
	});

	pi.on("session_shutdown", async () => {
		await disableTouchMode(undefined, true, false);
		state.agentTracker?.reset();
		resetState();
	});

	pi.registerShortcut(TOGGLE_SHORTCUT, {
		description: "Toggle phone-shell mode on/off",
		handler: async (ctx) => {
			if (!ctx.hasUI) return;
			captureUiBindings(ctx);
			if (state.shell.enabled) await disableTouchMode(ctx);
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
			if (state.shell.enabled) await disableTouchMode(ctx);
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

	pi.registerCommand("recent", {
		description: "Open a phone-friendly recent session overlay",
		handler: async (_args, ctx) => {
			if (!ctx.hasUI) {
				console.log("/recent requires interactive mode.");
				return;
			}
			captureUiBindings(ctx);
			showRecentOverlay(ctx);
		},
	});

	registerPrimaryHandler(
		PRIMARY_COMMAND,
		"Phone-first shell with touch rails, viewport controls, and per-user config/layout overrides",
	);
	registerPrimaryHandler(
		COMPAT_COMMAND,
		"Compatibility alias for the phone-shell command namespace",
	);
}
