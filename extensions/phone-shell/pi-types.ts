/**
 * Local type aliases for Pi SDK interfaces used by phone-shell.
 *
 * Rather than scattering `any` casts across the codebase, we import the
 * real SDK types here and re-export narrow aliases for the shapes the
 * extension actually depends on.
 */

import type { ExtensionContext, ExtensionCommandContext, ExtensionUIContext, ModelRegistry, KeybindingsManager, SettingsManager } from "@mariozechner/pi-coding-agent";
import type { TUI, EditorTheme } from "@mariozechner/pi-tui";

// Re-export SDK types for use throughout the extension
export type { ExtensionContext, ExtensionCommandContext, ExtensionUIContext };
export type { ModelRegistry, SettingsManager };
export type { TUI, EditorTheme, KeybindingsManager };

// Re-export the branded editor container type from layout
export type { DiscoveredEditorContainer } from "./layout.js";

/**
 * @deprecated Use DiscoveredEditorContainer instead. Kept for reference.
 */
export interface PiEditorContainer {
	children: unknown[];
}

export type PiExtensionCtx = Pick<ExtensionContext, "ui" | "hasUI"> & {
	abort?: () => void;
	isIdle?: () => boolean;
};
