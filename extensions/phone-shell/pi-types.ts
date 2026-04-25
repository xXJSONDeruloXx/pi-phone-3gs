/**
 * Local type aliases for Pi SDK interfaces used by phone-shell.
 *
 * Rather than scattering `any` casts across the codebase, we import the
 * real SDK types here and re-export narrow aliases for the shapes the
 * extension actually depends on.
 */

import type { ExtensionContext, ExtensionCommandContext, ExtensionUIContext, ModelRegistry, KeybindingsManager } from "@mariozechner/pi-coding-agent";
import type { TUI, EditorTheme } from "@mariozechner/pi-tui";

// Re-export SDK types for use throughout the extension
export type { ExtensionContext, ExtensionCommandContext, ExtensionUIContext };
export type { ModelRegistry };
export type { TUI, EditorTheme, KeybindingsManager };

/**
 * The shape of Pi's editorContainer — a Container-like object that holds
 * the active editor as one of its children. We only depend on `children`
 * for locating the editor in the TUI tree.
 */
export interface PiEditorContainer {
	children: unknown[];
}

/**
 * Minimal ctx shape accepted by phone-shell enable/disable functions.
 * Both ExtensionContext and ExtensionCommandContext satisfy this.
 */
export type PiExtensionCtx = Pick<ExtensionContext, "ui" | "hasUI"> & {
	abort?: () => void;
	isIdle?: () => boolean;
};
