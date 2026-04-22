import { visibleWidth } from "@mariozechner/pi-tui";
import type { ButtonSpec, ButtonPalette } from "./types.js";

export function buttonPalette(button: ButtonSpec): "accent" | "warning" | "muted" {
	return button.palette ?? "accent";
}

export function makeButtonWidth(button: ButtonSpec): number {
	return visibleWidth(button.label) + 2;
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

export function tailToWidth(text: string, width: number): string {
	if (width <= 0) return "";
	if (visibleWidth(text) <= width) return text;
	let out = text;
	while (out.length > 0 && visibleWidth(`…${out}`) > width) out = out.slice(1);
	return `…${out}`;
}
