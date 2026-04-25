import { CustomEditor } from "@mariozechner/pi-coding-agent";
import type { EditorTheme, TUI } from "@mariozechner/pi-tui";
import { truncateToWidth, visibleWidth } from "@mariozechner/pi-tui";
import { makeButtonWidth, buttonPalette } from "./button-helpers.js";
import { HEADER_HEIGHT } from "./defaults.js";
import { state } from "./state.js";
import type { ButtonHitRegion, ButtonSpec } from "./types.js";

const INLINE_SEND_BUTTON: ButtonSpec = {
	kind: "action",
	id: "editor-send",
	label: "SEND",
	action: "sendEnter",
	palette: "accent",
};

const INLINE_SEND_BUTTON_GAP = 1;
const MIN_EDITOR_CONTENT_WIDTH = 12;

function padLineToWidth(line: string, width: number): string {
	if (width <= 0) return "";
	const truncated = truncateToWidth(line, width, "", true);
	const pad = Math.max(0, width - visibleWidth(truncated));
	return `${truncated}\x1b[0m${" ".repeat(pad)}`;
}

function renderInlineButton(spec: ButtonSpec): { lines: string[]; width: number } {
	const theme = state.session.theme;
	const buttonWidth = makeButtonWidth(spec);
	const innerWidth = Math.max(1, buttonWidth - 2);
	const palette = buttonPalette(spec);
	const raw = spec.label.trim();
	const label = visibleWidth(raw) > innerWidth ? truncateToWidth(raw, innerWidth, "", true) : raw;
	const leftPad = Math.floor((innerWidth - Math.min(visibleWidth(label), innerWidth)) / 2);
	const rightPad = innerWidth - Math.min(visibleWidth(label), innerWidth) - leftPad;
	const padded = " ".repeat(leftPad) + label + " ".repeat(rightPad);
	return {
		width: buttonWidth,
		lines: theme
			? [
				theme.fg(palette, `╭${"─".repeat(innerWidth)}╮`),
				theme.fg(palette, "│") + theme.bold(theme.fg(palette, padded)) + theme.fg(palette, "│"),
				theme.fg(palette, `╰${"─".repeat(innerWidth)}╯`),
			]
			: [
				`╭${"─".repeat(innerWidth)}╮`,
				`│${padded}│`,
				`╰${"─".repeat(innerWidth)}╯`,
			],
	};
}

function shouldRenderInlineSendButton(width: number): boolean {
	const buttonWidth = makeButtonWidth(INLINE_SEND_BUTTON);
	return state.shell.enabled
		&& state.shell.editorAtTop
		&& state.shell.topEditorSendButtonVisible
		&& width >= MIN_EDITOR_CONTENT_WIDTH + INLINE_SEND_BUTTON_GAP + buttonWidth;
}

function getTopEditorRow(): number {
	if (!state.shell.editorAtTop) return 0;
	return state.shell.headerInstalled ? HEADER_HEIGHT + 1 : 1;
}

export class PhoneShellEditor extends CustomEditor {
	constructor(
		tui: TUI,
		theme: EditorTheme,
		keybindings: any,
		private readonly onUpdate: () => void,
	) {
		super(tui, theme, keybindings);
		state.session.phoneShellEditor = this;
	}

	override render(width: number): string[] {
		const editorRow = getTopEditorRow();
		if (!shouldRenderInlineSendButton(width)) {
			const lines = super.render(width);
			state.ui.editor.row = editorRow;
			state.ui.editor.height = state.shell.editorAtTop ? lines.length : 0;
			state.ui.editor.buttons = [];
			return lines;
		}

		const button = renderInlineButton(INLINE_SEND_BUTTON);
		const editorWidth = Math.max(1, width - button.width - INLINE_SEND_BUTTON_GAP);
		const lines = super.render(editorWidth);
		const buttonTop = Math.max(0, Math.floor((lines.length - button.lines.length) / 2));
		const buttonColStart = width - button.width + 1;
		const hitRegions: ButtonHitRegion[] = [];

		const rendered = lines.map((line, index) => {
			const base = padLineToWidth(line, editorWidth);
			if (index >= buttonTop && index < buttonTop + button.lines.length) {
				hitRegions.push({
					button: INLINE_SEND_BUTTON,
					colStart: buttonColStart,
					colEnd: width,
					rowOffset: index,
				});
				return padLineToWidth(`${base}${" ".repeat(INLINE_SEND_BUTTON_GAP)}${button.lines[index - buttonTop]!}`, width);
			}
			return padLineToWidth(base, width);
		});

		state.ui.editor.row = editorRow;
		state.ui.editor.height = lines.length;
		state.ui.editor.buttons = hitRegions;
		return rendered;
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
