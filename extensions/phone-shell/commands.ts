import {
	COMMANDS,
	CONFIG_TEMPLATE,
	FAVORITES_TEMPLATE,
	LAYOUT_TEMPLATE,
} from "./defaults.js";
import { getLogTail, getStatusReport, reloadRuntimeSettings, state } from "./state.js";
import { disableTouchMode, enableTouchMode } from "./mode.js";
import type { ExtensionCommandContext } from "@mariozechner/pi-coding-agent";
import type { CommandMode } from "./types.js";

// ---------------------------------------------------------------------------
// Command parsing
// ---------------------------------------------------------------------------

export function parseCommandMode(args: string): CommandMode | undefined {
	const token = args.trim().toLowerCase().split(/\s+/)[0] ?? "";
	if (!token) return "status";
	if (token === "up" || token === "pgup") return "page-up";
	if (token === "down" || token === "pgdn") return "page-down";
	if (token === "config") return "show-config";
	if (token === "layout") return "show-layout";
	if (token === "reload") return "reload-config";
	return COMMANDS.find((command: CommandMode) => command === token);
}

export function commandItems() {
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
		{ value: "favorites-template", label: "favorites-template", description: "Paste a favorites template into the editor" },
		{ value: "paths", label: "paths", description: "Paste config, layout, state, and log paths into the editor" },
		{ value: "top", label: "top", description: "Scroll chat viewport to the top" },
		{ value: "bottom", label: "bottom", description: "Scroll chat viewport to the bottom" },
		{ value: "page-up", label: "page-up", description: "Page chat viewport upward" },
		{ value: "page-down", label: "page-down", description: "Page chat viewport downward" },
	];
}

// ---------------------------------------------------------------------------
// Command handler
// ---------------------------------------------------------------------------

export async function handlePrimaryCommand(args: string, ctx: ExtensionCommandContext): Promise<void> {
	const command = parseCommandMode(args);
	if (!command) {
		ctx.ui.notify(
			`Usage: /phone-shell [${COMMANDS.join("|")}]`,
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
			if (state.shell.enabled) await disableTouchMode(ctx);
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
			ctx.ui.notify("phone-shell config reloaded", state.diagnostics.loadErrors.length > 0 ? "warning" : "info");
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
		case "favorites-template":
			ctx.ui.setEditorText(FAVORITES_TEMPLATE);
			ctx.ui.notify("phone-shell favorites template pasted into editor", "info");
			return;
		case "paths":
			ctx.ui.setEditorText([
				`config:    ${state.paths.config}`,
				`layout:    ${state.paths.layout}`,
				`favorites: ${state.paths.favorites}`,
				`state:     ${state.paths.state}`,
				`log:       ${state.paths.log}`,
			].join("\n"));
			ctx.ui.notify("phone-shell paths pasted into editor", "info");
			return;
		case "top":
			state.session.viewport?.toTop();
			ctx.ui.notify("phone-shell: top", "info");
			return;
		case "bottom":
			state.session.viewport?.toBottom();
			ctx.ui.notify("phone-shell: bottom", "info");
			return;
		case "page-up":
			state.session.viewport?.pageUp();
			ctx.ui.notify("phone-shell: page up", "info");
			return;
		case "page-down":
			state.session.viewport?.pageDown();
			ctx.ui.notify("phone-shell: page down", "info");
			return;
	}
}
