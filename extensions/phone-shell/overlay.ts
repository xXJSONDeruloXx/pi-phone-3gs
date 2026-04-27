import type { Component } from "@mariozechner/pi-tui";
import { truncateToWidth, visibleWidth } from "@mariozechner/pi-tui";
import { renderBoxButton } from "./button-helpers.js";
import type { ButtonHitRegion, ButtonSpec, PhoneShellRenderContext } from "./types.js";

export function getDropdownInnerWidth(buttons: ButtonSpec[]): number {
	const maxButtonLabelWidth = buttons.reduce((max, button) => Math.max(max, visibleWidth(button.label.trim())), 0);
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

function addFullWidthHitRows(hitRegions: ButtonHitRegion[], button: ButtonSpec, colStart: number, colEnd: number, rowStart: number, height: number): void {
	for (let rowOffset = rowStart; rowOffset < rowStart + height; rowOffset++) {
		hitRegions.push({ button, colStart, colEnd, rowOffset });
	}
}

export interface DropdownScrollOptions {
	getMaxVisibleItems: () => number;
	getScrollOffset: () => number;
}

/**
 * Optional vertical clamp for overlays that could exceed terminal bounds.
 * When provided, the overlay will not render more lines than this limit.
 */
export interface DropdownHeightOptions {
	getMaxOverlayHeight: () => number;
}

export class ButtonDropdownOverlayComponent implements Component {
	constructor(
		private readonly ctx: PhoneShellRenderContext,
		private readonly getButtons: () => ButtonSpec[],
		private readonly getOverlayRow: () => number,
		private readonly getOverlayCol: () => number,
		private readonly setLayoutState: (hitRegions: ButtonHitRegion[], actualHeight: number) => void,
		private readonly scrollOptions?: DropdownScrollOptions,
		private readonly heightOptions?: DropdownHeightOptions,
	) {}

	render(width: number): string[] {
		const theme = this.ctx.getTheme();
		const innerWidth = Math.max(1, width - 2);
		// Each button row is: │ space [╭─╮ content ╭─╮] space │
		// = 1 + 1 + (buttonInnerWidth + 2) + 1 + 1 = buttonInnerWidth + 6
		// For lines to fit in `width` = innerWidth + 2:
		//   buttonInnerWidth + 6 = width  →  buttonInnerWidth = innerWidth - 4
		const buttonInnerWidth = Math.max(3, innerWidth - 4);
		const lines: string[] = [];
		const hitRegions: ButtonHitRegion[] = [];
		const colStart = this.getOverlayCol();
		const colEnd = colStart + width - 1;
		const allButtons = this.getButtons();

		// Scroll windowing
		const maxVisible = this.scrollOptions?.getMaxVisibleItems?.() ?? allButtons.length;
		const rawOffset = this.scrollOptions?.getScrollOffset?.() ?? 0;
		const maxOffset = Math.max(0, allButtons.length - maxVisible);
		const scrollOffset = Math.min(rawOffset, maxOffset);
		let visibleButtons = allButtons.slice(scrollOffset, scrollOffset + maxVisible);

		// Clamp to terminal vertical bounds — prevents overlay from extending past the bottom
		if (this.heightOptions) {
			const maxHeight = this.heightOptions.getMaxOverlayHeight();
			// Each button = 3 lines + 2 border lines = 3*count + 2
			const maxButtonsForHeight = Math.max(1, Math.floor((maxHeight - 2) / 3));
			if (visibleButtons.length > maxButtonsForHeight) {
				visibleButtons = visibleButtons.slice(0, maxButtonsForHeight);
			}
		}
		const hasUp = scrollOffset > 0;
		const hasDown = scrollOffset + visibleButtons.length < allButtons.length;

		// Top border with optional ▲ scroll indicator
		if (hasUp) {
			const dashes = innerWidth - 3;
			lines.push(theme.fg("accent", `╭`) + theme.fg("dim", `▲`) + theme.fg("accent", `${"─".repeat(dashes)}╮`));
		} else {
			lines.push(theme.fg("accent", `╭${"─".repeat(innerWidth)}╮`));
		}

		for (const button of visibleButtons) {
			const rowStart = this.getOverlayRow() + lines.length;
			const rendered = renderBoxButton(button, theme, buttonInnerWidth);
			const top = theme.fg("accent", "│") + " " + rendered.lines[0]! + " " + theme.fg("accent", "│");
			const middle = theme.fg("accent", "│") + " " + rendered.lines[1]! + " " + theme.fg("accent", "│");
			const bottom = theme.fg("accent", "│") + " " + rendered.lines[2]! + " " + theme.fg("accent", "│");
			lines.push(top, middle, bottom);
			addFullWidthHitRows(hitRegions, button, colStart, colEnd, rowStart, 3);
		}

		// Bottom border with optional ▼ scroll indicator
		if (hasDown) {
			const dashes = innerWidth - 3;
			lines.push(theme.fg("accent", `╰`) + theme.fg("dim", `▼`) + theme.fg("accent", `${"─".repeat(dashes)}╯`));
		} else {
			lines.push(theme.fg("accent", `╰${"─".repeat(innerWidth)}╯`));
		}

		this.setLayoutState(hitRegions, lines.length);
		return lines;
	}

	invalidate(): void {}
}
