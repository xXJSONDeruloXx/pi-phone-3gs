import type { Component, TUI } from "@mariozechner/pi-tui";
import { truncateToWidth, visibleWidth } from "@mariozechner/pi-tui";
import { BAR_HEIGHT } from "./defaults.js";
import type {
	ButtonHitRegion,
	ButtonSpec,
	PhoneShellRenderContext,
	ViewportDebugState,
} from "./types.js";

function buttonPalette(button: ButtonSpec): "accent" | "warning" | "muted" {
	return button.palette ?? "accent";
}

function makeButtonWidth(button: ButtonSpec): number {
	return visibleWidth(button.label) + 2;
}

function splitIntoRows(buttons: ButtonSpec[], usableWidth: number, gap: number): Array<{ buttons: ButtonSpec[]; totalWidth: number }> {
	type Row = { buttons: ButtonSpec[]; totalWidth: number };
	const rows: Row[] = [];
	let current: Row = { buttons: [], totalWidth: 0 };

	for (const button of buttons) {
		const width = makeButtonWidth(button);
		const needed = current.buttons.length === 0 ? width : current.totalWidth + gap + width;
		if (current.buttons.length > 0 && needed > usableWidth) {
			rows.push(current);
			current = { buttons: [button], totalWidth: width };
		} else {
			current.buttons.push(button);
			current.totalWidth = needed;
		}
	}

	if (current.buttons.length > 0) rows.push(current);
	return rows;
}

function tailToWidth(text: string, width: number): string {
	if (width <= 0) return "";
	if (visibleWidth(text) <= width) return text;
	let out = text;
	while (out.length > 0 && visibleWidth(`…${out}`) > width) out = out.slice(1);
	return `…${out}`;
}

function renderPromptMirror(ctx: PhoneShellRenderContext, width: number): string[] {
	const theme = ctx.getTheme();
	const config = ctx.getConfig();
	const lead = " ".repeat(config.render.leadingColumns);
	const innerWidth = Math.max(1, width - 2 - config.render.leadingColumns);
	const border = (s: string) => theme.fg("accent", s);
	const rawText = ctx.getPromptMirrorText();
	const preview = rawText.length > 0
		? tailToWidth(rawText.replace(/\n/g, " ↵ "), Math.max(1, innerWidth - visibleWidth(config.promptMirror.prefix)))
		: theme.fg("dim", config.promptMirror.placeholder);
	const body = truncateToWidth(`${config.promptMirror.prefix}${preview}`, innerWidth, "", true);
	const pad = Math.max(0, innerWidth - visibleWidth(body));

	return [
		lead + border(`╭${"─".repeat(innerWidth)}╮`),
		lead + border("│") + body + " ".repeat(pad) + border("│"),
		lead + border(`╰${"─".repeat(innerWidth)}╯`),
	];
}

export class TouchViewport implements Component {
	readonly __piPhoneViewport = true;

	private scrollTop = 0;
	private followBottom = true;
	private lastVisibleHeight = 1;
	private lastTotalLines = 0;
	private lastMaxTop = 0;

	constructor(
		private readonly tui: TUI,
		private readonly content: Component,
		private readonly ctx: PhoneShellRenderContext,
	) {}

	render(width: number): string[] {
		const fixedHeight = this.tui.children
			.filter((child) => child !== this)
			.reduce((sum, child) => sum + child.render(width).length, 0);
		const visibleHeight = Math.max(1, this.tui.terminal.rows - fixedHeight);
		const lines = this.content.render(width);
		const maxTop = Math.max(0, lines.length - visibleHeight);

		if (this.followBottom) this.scrollTop = maxTop;
		this.scrollTop = Math.max(0, Math.min(maxTop, this.scrollTop));
		this.lastVisibleHeight = visibleHeight;
		this.lastTotalLines = lines.length;
		this.lastMaxTop = maxTop;

		const visible = lines.slice(this.scrollTop, this.scrollTop + visibleHeight);
		while (visible.length < visibleHeight) visible.push("");
		return visible;
	}

	invalidate(): void {
		this.content.invalidate();
	}

	scrollLines(delta: number): void {
		if (delta === 0) return;
		this.followBottom = false;
		this.scrollTop = Math.max(0, Math.min(this.lastMaxTop, this.scrollTop + delta));
		if (this.scrollTop >= this.lastMaxTop) this.followBottom = true;
		this.tui.requestRender();
	}

	pageUp(): void {
		this.scrollLines(-this.getPageSize());
	}

	pageDown(): void {
		this.scrollLines(this.getPageSize());
	}

	toTop(): void {
		this.followBottom = false;
		this.scrollTop = 0;
		this.tui.requestRender();
	}

	toBottom(): void {
		this.followBottom = true;
		this.scrollTop = this.lastMaxTop;
		this.tui.requestRender();
	}

	getDebugState(): ViewportDebugState {
		const percent = this.lastMaxTop === 0 ? 100 : Math.round((this.scrollTop / this.lastMaxTop) * 100);
		return {
			scrollTop: this.scrollTop,
			visibleHeight: this.lastVisibleHeight,
			totalLines: this.lastTotalLines,
			maxTop: this.lastMaxTop,
			followBottom: this.followBottom,
			percent,
		};
	}

	private getPageSize(): number {
		const config = this.ctx.getConfig();
		const overlappedStep = this.lastVisibleHeight - config.viewport.pageOverlapLines;
		return Math.max(
			1,
			Math.min(this.lastVisibleHeight - 1, Math.max(config.viewport.minPageScrollLines, overlappedStep)),
		);
	}
}

export class BottomBarComponent implements Component {
	constructor(
		private readonly tui: TUI,
		private readonly ctx: PhoneShellRenderContext,
	) {}

	render(width: number): string[] {
		const theme = this.ctx.getTheme();
		const config = this.ctx.getConfig();
		const layout = this.ctx.getLayout();
		const debugState = this.ctx.state.viewport?.getDebugState();
		const lead = " ".repeat(config.render.leadingColumns);
		const usableWidth = Math.max(1, width - config.render.leadingColumns);

		const allLines: string[] = [];
		const hitRegions: ButtonHitRegion[] = [];
		let globalRowIndex = 0;

		for (let groupIndex = 0; groupIndex < layout.bottomGroups.length; groupIndex++) {
			const group = layout.bottomGroups[groupIndex]!;
			const rows = splitIntoRows(group, usableWidth, config.render.buttonGap);

			for (let rowIndex = 0; rowIndex < rows.length; rowIndex++) {
				const row = rows[rowIndex]!;
				const tops: string[] = [];
				const mids: string[] = [];
				const bots: string[] = [];
				let col = config.render.leadingColumns + 1;

				for (let buttonIndex = 0; buttonIndex < row.buttons.length; buttonIndex++) {
					const button = row.buttons[buttonIndex]!;
					const buttonWidth = makeButtonWidth(button);
					const innerWidth = buttonWidth - 2;
					const palette = buttonPalette(button);

					tops.push(theme.fg(palette, `╭${"─".repeat(innerWidth)}╮`));
					mids.push(theme.fg(palette, "│") + theme.bold(button.label) + theme.fg(palette, "│"));
					bots.push(theme.fg(palette, `╰${"─".repeat(innerWidth)}╯`));

					hitRegions.push({
						button,
						colStart: col,
						colEnd: col + buttonWidth - 1,
						rowOffset: globalRowIndex,
					});
					col += buttonWidth + config.render.buttonGap;

					if (buttonIndex < row.buttons.length - 1) {
						tops.push(" ".repeat(config.render.buttonGap));
						mids.push(" ".repeat(config.render.buttonGap));
						bots.push(" ".repeat(config.render.buttonGap));
					}
				}

				const isLastRow = groupIndex === layout.bottomGroups.length - 1 && rowIndex === rows.length - 1;
				const indicator = isLastRow && debugState
					? " " + (debugState.followBottom ? theme.fg("dim", "BOT") : theme.fg("accent", `${debugState.percent}%`))
					: "";

				allLines.push(truncateToWidth(lead + tops.join(""), width));
				allLines.push(truncateToWidth(lead + mids.join("") + indicator, width));
				allLines.push(truncateToWidth(lead + bots.join(""), width));
				globalRowIndex++;
			}
		}

		const actualBarHeight = Math.max(BAR_HEIGHT, globalRowIndex * BAR_HEIGHT);
		const footerChild = this.tui.children[this.tui.children.length - 1];
		const footerHeight = footerChild ? footerChild.render(width).length : 3;

		this.ctx.state.barRow = this.tui.terminal.rows - footerHeight - actualBarHeight + 1;
		this.ctx.state.barButtons = hitRegions;
		this.ctx.state.barActualHeight = actualBarHeight;
		return allLines;
	}

	invalidate(): void {}
}

export class UtilityOverlayComponent implements Component {
	constructor(
		private readonly tui: TUI,
		private readonly ctx: PhoneShellRenderContext,
	) {}

	render(width: number): string[] {
		const theme = this.ctx.getTheme();
		const config = this.ctx.getConfig();
		const layout = this.ctx.getLayout();
		const lead = " ".repeat(config.render.leadingColumns);
		const usableWidth = Math.max(1, width - config.render.leadingColumns);

		const rows = splitIntoRows(layout.utilityButtons, usableWidth, config.render.buttonGap);
		const lines: string[] = [];
		const hitRegions: ButtonHitRegion[] = [];

		for (let rowIndex = 0; rowIndex < rows.length; rowIndex++) {
			const row = rows[rowIndex]!;
			const tops: string[] = [];
			const mids: string[] = [];
			const bots: string[] = [];
			let col = config.render.leadingColumns + 1;

			for (let buttonIndex = 0; buttonIndex < row.buttons.length; buttonIndex++) {
				const button = row.buttons[buttonIndex]!;
				const buttonWidth = makeButtonWidth(button);
				const innerWidth = buttonWidth - 2;
				const palette = buttonPalette(button);

				tops.push(theme.fg(palette, `╭${"─".repeat(innerWidth)}╮`));
				mids.push(theme.fg(palette, "│") + theme.bold(button.label) + theme.fg(palette, "│"));
				bots.push(theme.fg(palette, `╰${"─".repeat(innerWidth)}╯`));

				hitRegions.push({
					button,
					colStart: col,
					colEnd: col + buttonWidth - 1,
					rowOffset: rowIndex,
				});
				col += buttonWidth + config.render.buttonGap;

				if (buttonIndex < row.buttons.length - 1) {
					tops.push(" ".repeat(config.render.buttonGap));
					mids.push(" ".repeat(config.render.buttonGap));
					bots.push(" ".repeat(config.render.buttonGap));
				}
			}

			lines.push(truncateToWidth(lead + tops.join(""), width));
			lines.push(truncateToWidth(lead + mids.join(""), width));
			lines.push(truncateToWidth(lead + bots.join(""), width));
		}

		const buttonHeight = Math.max(BAR_HEIGHT, rows.length * BAR_HEIGHT);
		const promptMirrorLines = this.ctx.state.promptMirrorVisible ? renderPromptMirror(this.ctx, width) : [];
		lines.push(...promptMirrorLines);

		this.ctx.state.utilityButtons = hitRegions;
		this.ctx.state.utilityButtonsHeight = buttonHeight;
		this.ctx.state.utilityActualHeight = buttonHeight + promptMirrorLines.length;
		return lines;
	}

	invalidate(): void {}
}
