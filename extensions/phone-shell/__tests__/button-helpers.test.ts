import { describe, it, expect } from "vitest";
import { splitIntoRows, makeButtonWidth } from "../button-helpers.js";
import type { ButtonSpec } from "../types.js";

function actionButton(label: string): ButtonSpec {
	return { kind: "action", id: `test-${label}`, label, action: "scrollTop" };
}

describe("makeButtonWidth", () => {
	it("adds 2 to label visible width", () => {
		const spec = actionButton("ABC");
		expect(makeButtonWidth(spec)).toBe(5); // "ABC" (3) + 2
	});

	it("handles label with leading/trailing spaces", () => {
		const spec = actionButton("  X  ");
		expect(makeButtonWidth(spec)).toBe(7); // "  X  " (5) + 2
	});
});

describe("splitIntoRows", () => {
	it("returns single row when buttons fit", () => {
		const buttons = [actionButton("A"), actionButton("B")];
		const rows = splitIntoRows(buttons, 20, 1);
		expect(rows).toHaveLength(1);
		expect(rows[0]!.buttons).toHaveLength(2);
	});

	it("wraps to multiple rows when buttons overflow", () => {
		const buttons = [actionButton("AAAAAA"), actionButton("BBBBBB"), actionButton("CCCCCC")];
		const rows = splitIntoRows(buttons, 12, 1);
		expect(rows.length).toBeGreaterThanOrEqual(2);
	});

	it("returns empty for no buttons", () => {
		const rows = splitIntoRows([], 20, 1);
		expect(rows).toEqual([]);
	});

	it("places single wide button in its own row", () => {
		const buttons = [actionButton("VERYLONGBUTTON")];
		const rows = splitIntoRows(buttons, 5, 1);
		expect(rows).toHaveLength(1);
		expect(rows[0]!.buttons).toHaveLength(1);
	});
});
