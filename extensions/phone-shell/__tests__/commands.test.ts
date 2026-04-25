import { describe, it, expect } from "vitest";
import { parseCommandMode } from "../commands.js";

describe("parseCommandMode", () => {
	it("returns 'status' for empty input", () => {
		expect(parseCommandMode("")).toBe("status");
		expect(parseCommandMode("  ")).toBe("status");
	});

	it("parses all known modes", () => {
		expect(parseCommandMode("on")).toBe("on");
		expect(parseCommandMode("off")).toBe("off");
		expect(parseCommandMode("toggle")).toBe("toggle");
		expect(parseCommandMode("status")).toBe("status");
		expect(parseCommandMode("log")).toBe("log");
		expect(parseCommandMode("reload-config")).toBe("reload-config");
		expect(parseCommandMode("show-config")).toBe("show-config");
		expect(parseCommandMode("show-layout")).toBe("show-layout");
		expect(parseCommandMode("config-template")).toBe("config-template");
		expect(parseCommandMode("layout-template")).toBe("layout-template");
		expect(parseCommandMode("favorites-template")).toBe("favorites-template");
		expect(parseCommandMode("paths")).toBe("paths");
		expect(parseCommandMode("top")).toBe("top");
		expect(parseCommandMode("bottom")).toBe("bottom");
		expect(parseCommandMode("page-up")).toBe("page-up");
		expect(parseCommandMode("page-down")).toBe("page-down");
	});

	it("resolves aliases", () => {
		expect(parseCommandMode("up")).toBe("page-up");
		expect(parseCommandMode("pgup")).toBe("page-up");
		expect(parseCommandMode("down")).toBe("page-down");
		expect(parseCommandMode("pgdn")).toBe("page-down");
		expect(parseCommandMode("config")).toBe("show-config");
		expect(parseCommandMode("layout")).toBe("show-layout");
		expect(parseCommandMode("reload")).toBe("reload-config");
	});

	it("is case-insensitive", () => {
		expect(parseCommandMode("ON")).toBe("on");
		expect(parseCommandMode("Toggle")).toBe("toggle");
		expect(parseCommandMode("STATUS")).toBe("status");
	});

	it("returns undefined for unknown input", () => {
		expect(parseCommandMode("bogus")).toBeUndefined();
		expect(parseCommandMode("xyz")).toBeUndefined();
	});

	it("ignores extra tokens", () => {
		expect(parseCommandMode("on extra stuff")).toBe("on");
	});
});
