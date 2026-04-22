import type { Component, TUI } from "@mariozechner/pi-tui";
import { truncateToWidth, visibleWidth } from "@mariozechner/pi-tui";
import type { PhoneShellConfig, PhoneShellLayout, ButtonHitRegion, PhoneShellRenderContext } from "./types.js";
import { tailToWidth } from "./button-helpers.js";

export function getUtilityDropdownInnerWidth(config: PhoneShellConfig, layout: PhoneShellLayout): number {
	const maxButtonLabelWidth = layout.utilityButtons.reduce((max, button) => Math.max(max, visibleWidth(button.label.trim())), 0);
	const buttonVisualWidth = maxButtonLabelWidth + 6;
	const promptMinWidth = visibleWidth(config.promptMirror.prefix) + 12;
	return Math.max(18, buttonVisualWidth, promptMinWidth);
}

function promptMirrorLine(ctx: PhoneShellRenderContext, innerWidth: number): string {
	const config = ctx.getConfig();
	const rawText = ctx.getPromptMirrorText();
	const preview = rawText.length > 0
		? tailToWidth(rawText.replace(/\n/g, " ↵ "), Math.max(1, innerWidth - visibleWidth(config.promptMirror.prefix)))
		: ctx.getTheme().fg("dim", config.promptMirror.placeholder);
	return truncateToWidth(`${config.promptMirror.prefix}${preview}`, innerWidth, "", true);
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
		const lines: string[] = [];
		const hitRegions: ButtonHitRegion[] = [];

		lines.push(theme.fg("accent", `╭${"─".repeat(innerWidth)}╮`));
		for (const button of layout.utilityButtons) {
			const absoluteRowOffset = this.ctx.state.utilityOverlayRow + lines.length;
			const displayLabel = button.label.trim();
			const buttonLabel = truncateToWidth(displayLabel, Math.max(1, innerWidth - 4), "", true);
			const palette = button.palette ?? "accent";
			const visual = `[${buttonLabel}]`;
			const visualWidth = visibleWidth(visual);
			const pad = Math.max(0, innerWidth - 1 - visualWidth);
			lines.push(
				theme.fg("accent", "│")
				+ " "
				+ theme.bold(theme.fg(palette, visual))
				+ " ".repeat(pad)
				+ theme.fg("accent", "│"),
			);
			hitRegions.push({
				button,
				colStart: this.ctx.state.utilityOverlayCol,
				colEnd: this.ctx.state.utilityOverlayCol + width - 1,
				rowOffset: absoluteRowOffset,
			});
		}

		if (this.ctx.state.promptMirrorVisible) {
			lines.push(theme.fg("accent", `├${"─".repeat(innerWidth)}┤`));
			const prompt = promptMirrorLine(this.ctx, innerWidth);
			const promptPad = Math.max(0, innerWidth - visibleWidth(prompt));
			lines.push(
				theme.fg("accent", "│")
				+ prompt
				+ " ".repeat(promptPad)
				+ theme.fg("accent", "│"),
			);
		}

		lines.push(theme.fg("accent", `╰${"─".repeat(innerWidth)}╯`));

		this.ctx.state.utilityButtons = hitRegions;
		this.ctx.state.utilityButtonsHeight = layout.utilityButtons.length;
		this.ctx.state.utilityActualHeight = lines.length;
		return lines;
	}

	invalidate(): void {}
}
