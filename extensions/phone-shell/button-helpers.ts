import { truncateToWidth, visibleWidth } from "@mariozechner/pi-tui";
import type { ButtonSpec, PhoneShellRenderContext } from "./types.js";

export function buttonPalette(button: ButtonSpec): "accent" | "warning" | "muted" {
	return button.palette ?? "accent";
}

export function makeButtonWidth(button: ButtonSpec): number {
	return visibleWidth(button.label) + 2;
}

// ---------------------------------------------------------------------------
// Unified box-button rendering
// ---------------------------------------------------------------------------

export interface RenderedButton {
	lines: string[];
	width: number;
}

/**
 * Render a single button spec into the standard 3-line box-drawing form.
 * This is the single source of truth for all button rendering.
 *
 * @param forceInnerWidth If set, override the natural inner width (useful
 *   for dropdown overlays where all buttons must share one width).
 */
export function renderBoxButton(spec: ButtonSpec, theme: ReturnType<PhoneShellRenderContext["getTheme"]>, forceInnerWidth?: number): RenderedButton {
	const naturalWidth = makeButtonWidth(spec);
	const buttonWidth = forceInnerWidth != null ? forceInnerWidth + 2 : naturalWidth;
	const innerWidth = Math.max(1, buttonWidth - 2);
	const palette = buttonPalette(spec);
	const raw = spec.label.trim();
	const rawWidth = visibleWidth(raw);
	let label = raw;
	if (rawWidth > innerWidth) label = truncateToWidth(raw, innerWidth, "", true);
	const leftPad = Math.floor((innerWidth - Math.min(visibleWidth(label), innerWidth)) / 2);
	const rightPad = innerWidth - Math.min(visibleWidth(label), innerWidth) - leftPad;
	const padded = " ".repeat(leftPad) + label + " ".repeat(rightPad);
	return {
		width: buttonWidth,
		lines: [
			theme.fg(palette, `╭${"─".repeat(innerWidth)}╮`),
			theme.fg(palette, "│") + theme.bold(theme.fg(palette, padded)) + theme.fg(palette, "│"),
			theme.fg(palette, `╰${"─".repeat(innerWidth)}╯`),
		],
	};
}

/**
 * Pad a line to exactly `width` visible columns, resetting ANSI state.
 */
export function padLineToWidth(line: string, width: number): string {
	if (width <= 0) return "";
	const truncated = truncateToWidth(line, width, "", true);
	const pad = Math.max(0, width - visibleWidth(truncated));
	return `${truncated}\x1b[0m${" ".repeat(pad)}`;
}

export function splitIntoRows(buttons: ButtonSpec[], usableWidth: number, gap: number): Array<{ buttons: ButtonSpec[]; totalWidth: number }> {
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

