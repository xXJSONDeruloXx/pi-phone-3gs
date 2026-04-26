import { CustomEditor } from "@mariozechner/pi-coding-agent";
import type { Component, EditorTheme, TUI } from "@mariozechner/pi-tui";
import { truncateToWidth, visibleWidth } from "@mariozechner/pi-tui";
import { makeButtonWidth, padLineToWidth, renderBoxButton } from "./button-helpers.js";
import { HEADER_HEIGHT } from "./defaults.js";
import { state } from "./state.js";
import type { ButtonHitRegion, ButtonSpec } from "./types.js";
import type { KeybindingsManager } from "./pi-types.js";

const INLINE_STASH_BUTTON: ButtonSpec = {
	kind: "action",
	id: "editor-stash",
	label: "STSH",
	action: "stashEditor",
	palette: "warning",
};

const INLINE_FOLLOWUP_BUTTON: ButtonSpec = {
	kind: "action",
	id: "editor-followup",
	label: "F/U",
	action: "sendFollowUp",
	palette: "muted",
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
	const rightWidth =
		(state.shell.topEditorFollowUpButtonVisible ? INLINE_BUTTON_GAP + makeButtonWidth(INLINE_FOLLOWUP_BUTTON) : 0) +
		(state.shell.topEditorSendButtonVisible ? INLINE_BUTTON_GAP + makeButtonWidth(INLINE_SEND_BUTTON) : 0);
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

	const editorIndex = tui.children.indexOf(editorContainer as unknown as Component);
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
		keybindings: KeybindingsManager,
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
		const followUpButton = state.shell.topEditorFollowUpButtonVisible ? renderInlineButton(INLINE_FOLLOWUP_BUTTON) : undefined;
		const sendButton = state.shell.topEditorSendButtonVisible ? renderInlineButton(INLINE_SEND_BUTTON) : undefined;
		const leftReserve = leftButton ? leftButton.width + INLINE_BUTTON_GAP : 0;
		const rightReserve =
			(followUpButton ? INLINE_BUTTON_GAP + followUpButton.width : 0) +
			(sendButton ? INLINE_BUTTON_GAP + sendButton.width : 0);
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

		// Right-side buttons: follow-up first (closer to editor), then send at far right
		let rightCursor = width;
		const sendPlacement: InlineButtonPlacement | undefined = sendButton ? (() => {
			rightCursor -= sendButton.width;
			return {
				spec: INLINE_SEND_BUTTON,
				lines: sendButton.lines,
				width: sendButton.width,
				top: Math.max(0, Math.floor((lines.length - sendButton.lines.length) / 2)),
				colStart: rightCursor + 1,
				colEnd: rightCursor + sendButton.width,
			};
		})() : undefined;
		if (sendButton) rightCursor -= INLINE_BUTTON_GAP;

		const followUpPlacement: InlineButtonPlacement | undefined = followUpButton ? (() => {
			rightCursor -= followUpButton.width;
			return {
				spec: INLINE_FOLLOWUP_BUTTON,
				lines: followUpButton.lines,
				width: followUpButton.width,
				top: Math.max(0, Math.floor((lines.length - followUpButton.lines.length) / 2)),
				colStart: rightCursor + 1,
				colEnd: rightCursor + followUpButton.width,
			};
		})() : undefined;
		const hitRegions: ButtonHitRegion[] = [];

		// Collect right-side placements in left-to-right column order
		const rightPlacements = [followUpPlacement, sendPlacement]
			.filter((p): p is InlineButtonPlacement => p != null)
			.sort((a, b) => a.colStart - b.colStart);

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

			// Render right-side buttons with gaps
			let cursor = leftReserve + editorWidth;
			for (const rp of rightPlacements) {
				result += " ".repeat(rp.colStart - cursor - 1); // gap before button
				const row = index - rp.top;
				if (row >= 0 && row < rp.lines.length) {
					hitRegions.push({ button: rp.spec, colStart: rp.colStart, colEnd: rp.colEnd, rowOffset: index });
					result += rp.lines[row]!;
				} else {
					result += " ".repeat(rp.width);
				}
				cursor = rp.colEnd;
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
