import { describe, it, expect } from "vitest";
import { parseConfig, parseLayout, parseButtonSpec } from "../config.js";

describe("parseConfig", () => {
	it("returns defaults for empty object", () => {
		const { config, errors } = parseConfig({});
		expect(errors).toEqual([]);
		expect(config.header.enabled).toBe(true);
		expect(config.viewport.pageOverlapLines).toBe(20);
		expect(config.viewport.minPageScrollLines).toBe(3);
		expect(config.render.buttonGap).toBe(1);
		expect(config.render.leadingColumns).toBe(1);
		expect(config.logging.tailLines).toBe(80);
	});

	it("returns defaults for non-object input", () => {
		const { config, errors } = parseConfig("not an object");
		expect(errors).toHaveLength(1);
		expect(config.header.enabled).toBe(true);
	});

	it("overrides known fields", () => {
		const { config, errors } = parseConfig({
			header: { enabled: false },
			viewport: { pageOverlapLines: 10, minPageScrollLines: 5 },
			render: { buttonGap: 2, leadingColumns: 0 },
			logging: { tailLines: 50 },
		});
		expect(errors).toEqual([]);
		expect(config.header.enabled).toBe(false);
		expect(config.viewport.pageOverlapLines).toBe(10);
		expect(config.viewport.minPageScrollLines).toBe(5);
		expect(config.render.buttonGap).toBe(2);
		expect(config.render.leadingColumns).toBe(0);
		expect(config.logging.tailLines).toBe(50);
	});

	it("clamps viewport.pageOverlapLines to >= 0", () => {
		const { config } = parseConfig({ viewport: { pageOverlapLines: -5 } });
		expect(config.viewport.pageOverlapLines).toBe(0);
	});

	it("clamps viewport.minPageScrollLines to >= 1", () => {
		const { config } = parseConfig({ viewport: { minPageScrollLines: 0 } });
		expect(config.viewport.minPageScrollLines).toBe(1);
	});

	it("clamps logging.tailLines to >= 10", () => {
		const { config } = parseConfig({ logging: { tailLines: 3 } });
		expect(config.logging.tailLines).toBe(10);
	});

	it("reports errors for invalid sub-objects", () => {
		const { errors } = parseConfig({ header: "nope", viewport: 42 });
		expect(errors).toContain("header must be an object");
		expect(errors).toContain("viewport must be an object");
	});
});

describe("parseLayout", () => {
	it("returns defaults for non-object input", () => {
		const { layout, errors } = parseLayout([]);
		expect(errors).toHaveLength(1);
		expect(layout.utilityButtons.length).toBeGreaterThan(0);
	});

	it("parses valid layout", () => {
		const { layout, errors } = parseLayout({
			utilityButtons: [
				{ kind: "command", label: " /test ", command: "/test" },
			],
			bottomGroups: [
				[
					{ kind: "action", label: " TOP ", action: "scrollTop" },
				],
			],
		});
		expect(errors).toEqual([]);
		expect(layout.utilityButtons).toHaveLength(1);
		expect(layout.bottomGroups).toHaveLength(1);
	});

	it("reports error for invalid button kind", () => {
		const { errors } = parseLayout({
			utilityButtons: [
				{ kind: "bogus", label: "X" },
			],
		});
		expect(errors.length).toBeGreaterThan(0);
	});

	it("reports error for missing command on command button", () => {
		const { errors } = parseLayout({
			utilityButtons: [
				{ kind: "command", label: "CMD" },
			],
		});
		expect(errors.some((e) => e.includes("command must be"))).toBe(true);
	});

	it("reports error for missing label", () => {
		const { errors } = parseLayout({
			utilityButtons: [
				{ kind: "command", command: "/test" },
			],
		});
		expect(errors.some((e) => e.includes("label must be"))).toBe(true);
	});
});

describe("parseButtonSpec", () => {
	const collect = (input: unknown) => {
		const errors: string[] = [];
		const spec = parseButtonSpec(input, "test", 0, errors);
		return { spec, errors };
	};

	it("parses a command button", () => {
		const { spec, errors } = collect({ kind: "command", label: "CMD", command: "/cmd" });
		expect(errors).toEqual([]);
		expect(spec?.kind).toBe("command");
		// narrow the union before accessing kind-specific field
		if (spec?.kind === "command") {
			expect(spec.command).toBe("/cmd");
		}
		expect(spec?.id).toContain("cmd");
	});

	it("parses an input button", () => {
		const { spec, errors } = collect({ kind: "input", label: "INT", data: "\u0003" });
		expect(errors).toEqual([]);
		expect(spec?.kind).toBe("input");
		if (spec?.kind === "input") {
			expect(spec.data).toBe("\u0003");
		}
	});

	it("parses an editorKey button", () => {
		const { spec, errors } = collect({ kind: "editorKey", label: "KEY", data: "\t", clearFirst: true, setText: "/hello" });
		expect(errors).toEqual([]);
		expect(spec?.kind).toBe("editorKey");
		if (spec?.kind === "editorKey") {
			expect(spec.clearFirst).toBe(true);
			expect(spec.setText).toBe("/hello");
		}
	});

	it("parses an action button", () => {
		const { spec, errors } = collect({ kind: "action", label: "TOP", action: "scrollTop" });
		expect(errors).toEqual([]);
		expect(spec?.kind).toBe("action");
		if (spec?.kind === "action") {
			expect(spec.action).toBe("scrollTop");
		}
	});

	it("rejects non-object input", () => {
		const { spec, errors } = collect("nope");
		expect(spec).toBeUndefined();
		expect(errors).toContain("test[0] must be an object");
	});

	it("rejects missing kind", () => {
		const { spec, errors } = collect({ label: "X", command: "/x" });
		expect(spec).toBeUndefined();
		expect(errors.some((e) => e.includes("kind must be"))).toBe(true);
	});

	it("rejects invalid action", () => {
		const { spec, errors } = collect({ kind: "action", label: "X", action: "flyToMoon" });
		expect(spec).toBeUndefined();
		expect(errors.some((e) => e.includes("action must be one of"))).toBe(true);
	});

	it("auto-derives id from label when not provided", () => {
		const { spec } = collect({ kind: "command", label: "My Button", command: "/test" });
		expect(spec?.id).toContain("my-button");
	});

	it("uses explicit id when provided", () => {
		const { spec } = collect({ kind: "command", id: "custom-id", label: "LBL", command: "/test" });
		expect(spec?.id).toBe("custom-id");
	});

	it("reads palette", () => {
		const { spec } = collect({ kind: "command", label: "X", command: "/x", palette: "warning" });
		expect(spec?.palette).toBe("warning");
	});

	it("ignores invalid palette", () => {
		const { spec } = collect({ kind: "command", label: "X", command: "/x", palette: "neon" });
		expect(spec?.palette).toBeUndefined();
	});
});
