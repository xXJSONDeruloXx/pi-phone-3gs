import { CustomEditor } from "@mariozechner/pi-coding-agent";
import type { EditorTheme, TUI } from "@mariozechner/pi-tui";

export class PhoneShellEditor extends CustomEditor {
	constructor(
		tui: TUI,
		theme: EditorTheme,
		keybindings: any,
		private readonly onUpdate: () => void,
	) {
		super(tui, theme, keybindings);
	}

	override handleInput(data: string): void {
		super.handleInput(data);
		this.onUpdate();
	}

	override invalidate(): void {
		super.invalidate();
		this.onUpdate();
	}
}
