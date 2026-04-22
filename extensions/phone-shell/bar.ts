import type { Component, TUI } from "@mariozechner/pi-tui";
import { truncateToWidth } from "@mariozechner/pi-tui";
import { BAR_HEIGHT } from "./defaults.js";
import { buttonPalette, makeButtonWidth, splitIntoRows } from "./button-helpers.js";
import type { ButtonHitRegion, PhoneShellRenderContext } from "./types.js";

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
