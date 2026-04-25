import { CustomEditor } from "@mariozechner/pi-coding-agent";
import type { EditorTheme, TUI } from "@mariozechner/pi-tui";
import { truncateToWidth, visibleWidth } from "@mariozechner/pi-tui";
import { makeButtonWidth, padLineToWidth, renderBoxButton } from "./button-helpers.js";
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

// padLineToWidth imported from button-helpers

function renderInlineButton(spec: ButtonSpec): { lines: string[]; width: number } {
	const theme = state.session.theme;
	if (!theme) {
		// Fallback before theme is available
		const buttonWidth = makeButtonWidth(spec);
		const innerWidth = Math.max(1, buttonWidth - 2);
		return {
			width: buttonWidth,
			lines: [
				`╭${"─".repeat(innerWidth)}╮`,
				`│${spec.label.trim().padStart(innerWidth / 2 + 1).padEnd(innerWidth)}│`,
				`╰${"─".repeat(innerWidth)}╯`,
			],
		};
	}
	return renderBoxButton(spec, theme);
}

function shouldUseInlineButtons(width: number): boolean {
	const leftWidth = state.shell.topEditorStashButtonVisible ? makeButtonWidth(INLINE_STASH_BUTTON) + INLINE_BUTTON_GAP : 0;
	const rightWidth = state.shell.topEditorSendButtonVisible ? INLINE_BUTTON_GAP + makeButtonWidth(INLINE_SEND_BUTTON) : 0;
	return state.shell.enabled
		&& (leftWidth > 0 || rightWidth > 0)
		&& width >= MIN_EDITOR_CONTENT_WIDTH + leftWidth + rightWidth;
}

function getEditorRow(): number {
	if (!state.shell.enabled) return 0;
	if (state.shell.editorAtTop) return state.shell.headerInstalled ? HEADER_HEIGHT + 1 : 1;

	const tui = state.session.tui;
	const editorContainer = state.session.editorContainer;
	if (!tui || !editorContainer) return 0;

	const editorIndex = tui.children.indexOf(editorContainer as any);
	if (editorIndex < 0) return 0;

	let row = 1;
	for (let index = 0; index < editorIndex; index++) {
		const child = tui.children[index]!;
		if (child === state.session.viewport) {
			row += state.ui.viewport.height;
			continue;
		}
		row += child.render(tui.terminal.columns).length;
	}
	return row;
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
		const editorRow = getEditorRow();
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
