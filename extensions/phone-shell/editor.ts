import { CustomEditor } from "@mariozechner/pi-coding-agent";
import type { Component, EditorTheme, TUI } from "@mariozechner/pi-tui";
import { visibleWidth } from "@mariozechner/pi-tui";
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

const INLINE_ESC_BUTTON: ButtonSpec = {
	kind: "action",
	id: "editor-esc",
	label: "ESC",
	action: "sendEscape",
	palette: "muted",
};

const INLINE_INTERRUPT_BUTTON: ButtonSpec = {
	kind: "action",
	id: "editor-interrupt",
	label: "^C",
	action: "sendInterrupt",
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
	const leftWidth =
		(state.shell.topEditorStashButtonVisible ? makeButtonWidth(INLINE_STASH_BUTTON) + INLINE_BUTTON_GAP : 0) +
		(state.shell.topEditorEscButtonVisible ? makeButtonWidth(INLINE_ESC_BUTTON) + INLINE_BUTTON_GAP : 0) +
		(state.shell.topEditorInterruptButtonVisible ? makeButtonWidth(INLINE_INTERRUPT_BUTTON) + INLINE_BUTTON_GAP : 0);
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

		const leftButtons = [
			state.shell.topEditorStashButtonVisible ? INLINE_STASH_BUTTON : undefined,
			state.shell.topEditorEscButtonVisible ? INLINE_ESC_BUTTON : undefined,
			state.shell.topEditorInterruptButtonVisible ? INLINE_INTERRUPT_BUTTON : undefined,
		].filter((b): b is ButtonSpec => b != null);
		const rightButtons = [
			state.shell.topEditorFollowUpButtonVisible ? INLINE_FOLLOWUP_BUTTON : undefined,
			state.shell.topEditorSendButtonVisible ? INLINE_SEND_BUTTON : undefined,
		].filter((b): b is ButtonSpec => b != null);

		const leftRendered = leftButtons.map(b => renderInlineButton(b));
		const rightRendered = rightButtons.map(b => renderInlineButton(b));
		const leftReserve = leftRendered.reduce((sum, r) => sum + r.width + INLINE_BUTTON_GAP, leftRendered.length > 0 ? INLINE_BUTTON_GAP : 0);
		const rightReserve = rightRendered.reduce((sum, r) => sum + r.width + INLINE_BUTTON_GAP, rightRendered.length > 0 ? INLINE_BUTTON_GAP : 0);
		const editorWidth = Math.max(1, width - leftReserve - rightReserve);
		const lines = super.render(editorWidth);

		// Pre-compute vertical centering for each button
		const leftTops = leftRendered.map(r => Math.max(0, Math.floor((lines.length - r.lines.length) / 2)));
		const rightTops = rightRendered.map(r => Math.max(0, Math.floor((lines.length - r.lines.length) / 2)));

		// Build hit region data: column ranges for each button
		// Left buttons: gap + button + gap + button + ... + gap
		let col = 1;
		const leftRanges: Array<{ spec: ButtonSpec; colStart: number; colEnd: number; renderedIdx: number; top: number }> = [];
		for (let i = 0; i < leftButtons.length; i++) {
			col += INLINE_BUTTON_GAP; // gap before button
			const colStart = col;
			col += leftRendered[i]!.width;
			leftRanges.push({ spec: leftButtons[i]!, colStart, colEnd: col, renderedIdx: i, top: leftTops[i]! });
		}
		col += INLINE_BUTTON_GAP; // gap before editor

		// Editor content takes editorWidth columns
		col += editorWidth;

		// Right buttons: gap + button + gap + button
		const rightRanges: Array<{ spec: ButtonSpec; colStart: number; colEnd: number; renderedIdx: number; top: number }> = [];
		for (let i = 0; i < rightButtons.length; i++) {
			col += INLINE_BUTTON_GAP; // gap before button
			const colStart = col;
			col += rightRendered[i]!.width;
			rightRanges.push({ spec: rightButtons[i]!, colStart, colEnd: col, renderedIdx: i, top: rightTops[i]! });
		}

		const hitRegions: ButtonHitRegion[] = [];

		const rendered = lines.map((line, index) => {
			let result = "";

			// Left buttons
			for (const lr of leftRanges) {
				result += " ".repeat(lr.colStart - visibleWidth(result) - 1); // gap before button
				const row = index - lr.top;
				if (row >= 0 && row < leftRendered[lr.renderedIdx]!.lines.length) {
					hitRegions.push({ button: lr.spec, colStart: lr.colStart, colEnd: lr.colEnd, rowOffset: index });
					result += leftRendered[lr.renderedIdx]!.lines[row]!;
				} else {
					result += " ".repeat(leftRendered[lr.renderedIdx]!.width);
				}
			}

			// Gap before editor
			if (leftRanges.length > 0) result += " ".repeat(INLINE_BUTTON_GAP);

			// Editor content
			result += padLineToWidth(line, editorWidth);

			// Right buttons
			for (const rr of rightRanges) {
				result += " ".repeat(rr.colStart - visibleWidth(result) - 1); // gap before button
				const row = index - rr.top;
				if (row >= 0 && row < rightRendered[rr.renderedIdx]!.lines.length) {
					hitRegions.push({ button: rr.spec, colStart: rr.colStart, colEnd: rr.colEnd, rowOffset: index });
					result += rightRendered[rr.renderedIdx]!.lines[row]!;
				} else {
					result += " ".repeat(rightRendered[rr.renderedIdx]!.width);
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
