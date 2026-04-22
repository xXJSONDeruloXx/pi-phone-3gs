import type { Component, TUI } from "@mariozechner/pi-tui";
import { truncateToWidth, visibleWidth } from "@mariozechner/pi-tui";
import { BAR_HEIGHT } from "./defaults.js";
import { buttonPalette, makeButtonWidth, splitIntoRows, tailToWidth } from "./button-helpers.js";
import type { ButtonHitRegion, PhoneShellRenderContext } from "./types.js";

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
