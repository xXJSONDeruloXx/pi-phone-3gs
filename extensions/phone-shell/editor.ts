import { CustomEditor } from "@mariozechner/pi-coding-agent";
import { CURSOR_MARKER, type Component, type EditorTheme, type TUI } from "@mariozechner/pi-tui";
import type { PhoneShellRenderContext } from "./types.js";

export class PhoneShellEditor extends CustomEditor {
	constructor(
		tui: TUI,
		theme: EditorTheme,
		keybindings: any,
		private readonly onProxyUpdate: () => void,
		private readonly isProxyOnly: () => boolean,
	) {
		super(tui, theme, keybindings);
	}

	override handleInput(data: string): void {
		super.handleInput(data);
		this.onProxyUpdate();
	}

	override invalidate(): void {
		super.invalidate();
		this.onProxyUpdate();
	}

	getProxyLines(width: number): string[] {
		return super.render(width).map((line) => line.replaceAll(CURSOR_MARKER, ""));
	}

	override render(width: number): string[] {
		// When proxy-only mode is active, minimize the bottom editor's visual
		if (this.isProxyOnly()) {
			// Return a single blank line so the bottom editor consumes minimal space
			return [""];
		}
		return super.render(width);
	}
}

export class PromptProxyComponent implements Component {
	constructor(private readonly ctx: PhoneShellRenderContext) {}

	render(width: number): string[] {
		return this.ctx.state.mirroredEditor?.getProxyLines(width) ?? [];
	}

	invalidate(): void {}
}
