import type { ButtonHitRegion, ButtonSpec, MouseInput } from "./types.js";
import { state } from "./state.js";

// ---------------------------------------------------------------------------
// Input response type
// ---------------------------------------------------------------------------

export type InputResponse = { consume?: boolean; data?: string } | undefined;

// ---------------------------------------------------------------------------
// Mouse parsing
// ---------------------------------------------------------------------------

export function parseMouseInput(data: string): MouseInput | undefined {
	const match = data.match(/^\x1b\[<(\d+);(\d+);(\d+)([Mm])$/);
	if (!match) return undefined;
	const code = Number.parseInt(match[1]!, 10);
	const isWheel = match[4] !== "m" && (code & 64) !== 0;
	const scrollDirection = isWheel
		? ((code & 0b11) === 0 ? "up"
			: (code & 0b11) === 1 ? "down"
				: (code & 0b11) === 2 ? "left"
					: "right")
		: undefined;
	return {
		raw: data,
		code,
		col: Number.parseInt(match[2]!, 10),
		row: Number.parseInt(match[3]!, 10),
		phase: match[4] === "m" ? "release" : isWheel ? "scroll" : ((code & 32) !== 0 ? "move" : "press"),
		scrollDirection,
	};
}

export function isPrimaryPointerPress(mouse: MouseInput): boolean {
	if (mouse.phase !== "press") return false;
	if ((mouse.code & 64) !== 0) return false;
	return (mouse.code & 0b11) === 0;
}

export function isPrimaryPointerDrag(mouse: MouseInput): boolean {
	if (mouse.phase !== "move") return false;
	if ((mouse.code & 64) !== 0) return false;
	return (mouse.code & 0b11) === 0;
}

export function visualizeInput(data: string): string {
	return JSON.stringify(
		data.replace(/\x1b/g, "<ESC>").replace(/[\x00-\x1f\x7f]/g, (char) => {
			if (char === "\n") return "<LF>";
			if (char === "\r") return "<CR>";
			if (char === "\t") return "<TAB>";
			const code = char.charCodeAt(0).toString(16).padStart(2, "0");
			return `<0x${code}>`;
		}),
	);
}

// ---------------------------------------------------------------------------
// Hit testing
// ---------------------------------------------------------------------------

export function findHitRegion(buttons: ButtonHitRegion[], rowOffset: number, col: number): ButtonSpec | undefined {
	for (const region of buttons) {
		if (region.rowOffset === rowOffset && col >= region.colStart && col <= region.colEnd) return region.button;
	}
	return undefined;
}

export function isViewportRow(row: number): boolean {
	return state.ui.viewport.row > 0 && row >= state.ui.viewport.row && row < state.ui.viewport.row + state.ui.viewport.height;
}
