import type { Component, TUI } from "@mariozechner/pi-tui";
import { truncateToWidth, visibleWidth } from "@mariozechner/pi-tui";
import type { PhoneShellConfig, PhoneShellLayout, ButtonHitRegion, PhoneShellRenderContext } from "./types.js";

export function getUtilityDropdownInnerWidth(_config: PhoneShellConfig, layout: PhoneShellLayout): number {
	const maxButtonLabelWidth = layout.utilityButtons.reduce((max, button) => Math.max(max, visibleWidth(button.label.trim())), 0);
	const buttonVisualWidth = maxButtonLabelWidth + 6;
	return Math.max(18, buttonVisualWidth);
}

function centerToWidth(text: string, width: number): string {
	const textWidth = visibleWidth(text);
	if (textWidth >= width) return truncateToWidth(text, width, "", true);
	const leftPad = Math.floor((width - textWidth) / 2);
	const rightPad = width - textWidth - leftPad;
	return " ".repeat(leftPad) + text + " ".repeat(rightPad);
}

function addFullWidthHitRows(hitRegions: ButtonHitRegion[], button: PhoneShellLayout["utilityButtons"][number], colStart: number, colEnd: number, rowStart: number, height: number): void {
	for (let rowOffset = rowStart; rowOffset < rowStart + height; rowOffset++) {
		hitRegions.push({ button, colStart, colEnd, rowOffset });
	}
}

export class UtilityOverlayComponent implements Component {
	constructor(
		private readonly tui: TUI,
		private readonly ctx: PhoneShellRenderContext,
	) {}

	render(width: number): string[] {
		const theme = this.ctx.getTheme();
		const layout = this.ctx.getLayout();
		const innerWidth = Math.max(1, width - 2);
		const buttonInnerWidth = Math.max(3, innerWidth - 4);
		const lines: string[] = [];
		const hitRegions: ButtonHitRegion[] = [];
		const colStart = this.ctx.state.utilityOverlayCol;
		const colEnd = this.ctx.state.utilityOverlayCol + width - 1;

		lines.push(theme.fg("accent", `╭${"─".repeat(innerWidth)}╮`));
		for (const button of layout.utilityButtons) {
			const rowStart = this.ctx.state.utilityOverlayRow + lines.length;
			const displayLabel = button.label.trim();
			const buttonLabel = truncateToWidth(displayLabel, Math.max(1, buttonInnerWidth - 2), "", true);
			const palette = button.palette ?? "accent";
			const top = theme.fg("accent", "│") + " " + theme.fg(palette, `╭${"─".repeat(buttonInnerWidth - 2)}╮`) + " " + theme.fg("accent", "│");
			const middle = theme.fg("accent", "│") + " " + theme.bold(theme.fg(palette, `│${centerToWidth(buttonLabel, buttonInnerWidth - 2)}│`)) + " " + theme.fg("accent", "│");
			const bottom = theme.fg("accent", "│") + " " + theme.fg(palette, `╰${"─".repeat(buttonInnerWidth - 2)}╯`) + " " + theme.fg("accent", "│");
			lines.push(top, middle, bottom);
			addFullWidthHitRows(hitRegions, button, colStart, colEnd, rowStart, 3);
		}

		lines.push(theme.fg("accent", `╰${"─".repeat(innerWidth)}╯`));

		this.ctx.state.utilityButtons = hitRegions;
		this.ctx.state.utilityButtonsHeight = layout.utilityButtons.length * 3;
		this.ctx.state.utilityActualHeight = lines.length;
		return lines;
	}

	invalidate(): void {}
}
