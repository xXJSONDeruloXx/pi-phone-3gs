import { truncateToWidth } from "@mariozechner/pi-tui";
import { BAR_HEIGHT } from "./defaults.js";
import { buttonPalette, makeButtonWidth, splitIntoRows } from "./button-helpers.js";
import type { ButtonHitRegion, ButtonSpec, PhoneShellRenderContext } from "./types.js";

export interface RenderButtonGroupsOptions {
	middleLineSuffix?: (args: {
		groupIndex: number;
		rowIndex: number;
		globalRowIndex: number;
		isLastRow: boolean;
	}) => string;
	minHeight?: number;
}

export interface RenderButtonGroupsResult {
	lines: string[];
	hitRegions: ButtonHitRegion[];
	actualHeight: number;
	rowCount: number;
}

export function renderButtonGroups(
	width: number,
	ctx: PhoneShellRenderContext,
	groups: ButtonSpec[][],
	options: RenderButtonGroupsOptions = {},
): RenderButtonGroupsResult {
	const theme = ctx.getTheme();
	const config = ctx.getConfig();
	const lead = " ".repeat(config.render.leadingColumns);
	const usableWidth = Math.max(1, width - config.render.leadingColumns);
	const allLines: string[] = [];
	const hitRegions: ButtonHitRegion[] = [];
	let globalRowIndex = 0;

	for (let groupIndex = 0; groupIndex < groups.length; groupIndex++) {
		const group = groups[groupIndex]!;
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

			const isLastRow = groupIndex === groups.length - 1 && rowIndex === rows.length - 1;
			const suffix = options.middleLineSuffix?.({ groupIndex, rowIndex, globalRowIndex, isLastRow }) ?? "";

			allLines.push(truncateToWidth(lead + tops.join(""), width));
			allLines.push(truncateToWidth(lead + mids.join("") + suffix, width));
			allLines.push(truncateToWidth(lead + bots.join(""), width));
			globalRowIndex++;
		}
	}

	return {
		lines: allLines,
		hitRegions,
		rowCount: globalRowIndex,
		actualHeight: Math.max(options.minHeight ?? BAR_HEIGHT, globalRowIndex * BAR_HEIGHT),
	};
}
