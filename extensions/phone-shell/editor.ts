import { CustomEditor } from "@mariozechner/pi-coding-agent";
import type { EditorTheme, TUI } from "@mariozechner/pi-tui";
import { truncateToWidth, visibleWidth } from "@mariozechner/pi-tui";
import { makeButtonWidth, buttonPalette } from "./button-helpers.js";
import { HEADER_HEIGHT } from "./defaults.js";
import { state } from "./state.js";
import type { ButtonHitRegion, ButtonSpec } from "./types.js";

const INLINE_STASH_BUTTON: ButtonSpec = {
	kind: "action",
	id: "editor-stash",
	label: "STSH",
	action: "stashEditor",
	palette: "warning",
};

const INLINE_SEND_BUTTON: ButtonSpec = {
	kind: "action",
	id: "editor-send",
	label: "SEND",
	action: "sendEnter",
	palette: "accent",
};

const INLINE_BUTTON_GAP = 1;
const MIN_EDITOR_CONTENT_WIDTH = 12;

type InlineButtonPlacement = {
	spec: ButtonSpec;
	lines: string[];
	width: number;
	top: number;
	colStart: number;
	colEnd: number;
};

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

function shouldUseInlineButtons(width: number): boolean {
	const leftWidth = state.shell.topEditorStashButtonVisible ? makeButtonWidth(INLINE_STASH_BUTTON) + INLINE_BUTTON_GAP : 0;
	const rightWidth = state.shell.topEditorSendButtonVisible ? INLINE_BUTTON_GAP + makeButtonWidth(INLINE_SEND_BUTTON) : 0;
	return state.shell.enabled
		&& state.shell.editorAtTop
		&& (leftWidth > 0 || rightWidth > 0)
		&& width >= MIN_EDITOR_CONTENT_WIDTH + leftWidth + rightWidth;
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
		if (!shouldUseInlineButtons(width)) {
			const lines = super.render(width);
			state.ui.editor.row = editorRow;
			state.ui.editor.height = state.shell.editorAtTop ? lines.length : 0;
			state.ui.editor.buttons = [];
			return lines;
		}

		const leftButton = state.shell.topEditorStashButtonVisible ? renderInlineButton(INLINE_STASH_BUTTON) : undefined;
		const rightButton = state.shell.topEditorSendButtonVisible ? renderInlineButton(INLINE_SEND_BUTTON) : undefined;
		const leftReserve = leftButton ? leftButton.width + INLINE_BUTTON_GAP : 0;
		const rightReserve = rightButton ? INLINE_BUTTON_GAP + rightButton.width : 0;
		const editorWidth = Math.max(1, width - leftReserve - rightReserve);
		const lines = super.render(editorWidth);
		const left: InlineButtonPlacement | undefined = leftButton ? {
			spec: INLINE_STASH_BUTTON,
			lines: leftButton.lines,
			width: leftButton.width,
			top: Math.max(0, Math.floor((lines.length - leftButton.lines.length) / 2)),
			colStart: 1,
			colEnd: leftButton.width,
		} : undefined;
		const right: InlineButtonPlacement | undefined = rightButton ? {
			spec: INLINE_SEND_BUTTON,
			lines: rightButton.lines,
			width: rightButton.width,
			top: Math.max(0, Math.floor((lines.length - rightButton.lines.length) / 2)),
			colStart: width - rightButton.width + 1,
			colEnd: width,
		} : undefined;
		const hitRegions: ButtonHitRegion[] = [];

		const rendered = lines.map((line, index) => {
			let result = "";
			if (left) {
				const row = index - left.top;
				if (row >= 0 && row < left.lines.length) {
					hitRegions.push({ button: left.spec, colStart: left.colStart, colEnd: left.colEnd, rowOffset: index });
					result += left.lines[row]!;
				} else {
					result += " ".repeat(left.width);
				}
				result += " ".repeat(INLINE_BUTTON_GAP);
			}

			result += padLineToWidth(line, editorWidth);

			if (right) {
				result += " ".repeat(INLINE_BUTTON_GAP);
				const row = index - right.top;
				if (row >= 0 && row < right.lines.length) {
					hitRegions.push({ button: right.spec, colStart: right.colStart, colEnd: right.colEnd, rowOffset: index });
					result += right.lines[row]!;
				} else {
					result += " ".repeat(right.width);
				}
			}

			return padLineToWidth(result, width);
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
