/**
 * Smoke tests for rendering components with a mocked TUI/Theme.
 *
 * These verify that render() produces the expected number of lines
 * and that hit regions are populated — catching off-by-one column
 * math regressions without requiring a real terminal.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { HeaderBarComponent } from "../header.js";
import { BottomBarComponent } from "../bar.js";
import { NavigationPadComponent } from "../nav.js";
import { ButtonDropdownOverlayComponent } from "../overlay.js";
import { DEFAULT_CONFIG, DEFAULT_LAYOUT, DEFAULT_FAVORITES } from "../defaults.js";
import type { PhoneShellConfig, PhoneShellLayout, PhoneShellRenderContext, FavoriteEntry, ButtonSpec, PhoneShellRenderState, ThinkingLevel } from "../types.js";
import type { Theme } from "@mariozechner/pi-coding-agent";

// ---------------------------------------------------------------------------
// Fakes
// ---------------------------------------------------------------------------

function fakeTheme(): Theme {
	const color = (text: string) => text;
	const fg = (_palette: string, text: string) => text;
	const bold = (text: string) => text;
	const dim = (text: string) => text;
	return { color, fg, bold, dim } as unknown as Theme;
}

function fakeRenderState(): PhoneShellRenderState {
	return {
		session: { tui: undefined, theme: undefined, viewport: undefined },
		shell: {
			enabled: true,
			barVisible: true,
			navPadVisible: true,
			viewportJumpButtonsVisible: true,
			viewportScrollDirectionInverted: false,
			topEditorSendButtonVisible: true,
			topEditorStashButtonVisible: true,
			topEditorFollowUpButtonVisible: false,
			topEditorEscButtonVisible: false,
			topEditorInterruptButtonVisible: false,
			piFooterVisible: true,
			proxyOnly: false,
			editorAtTop: false,
			headerInstalled: false,
		},
		ui: {
			headerButtons: [],
			bar: {
				row: 0, buttons: [], actualHeight: 3, scrollX: 0, maxScrollX: 0, drag: undefined,
			},
			nav: {
				row: 0, buttons: [], actualHeight: 3, placement: "hidden",
			},
			overlays: {
				utility: { visible: false, row: 0, col: 0, width: 0, buttons: [], actualHeight: 3, scrollOffset: 0, maxVisibleItems: 0, handle: undefined, drag: undefined },
				view: { visible: false, row: 0, col: 0, width: 0, buttons: [], actualHeight: 3, scrollOffset: 0, maxVisibleItems: 0, handle: undefined, drag: undefined },
				skills: { visible: false, row: 0, col: 0, width: 0, buttons: [], actualHeight: 3, scrollOffset: 0, maxVisibleItems: 0, handle: undefined, drag: undefined },
				prompts: { visible: false, row: 0, col: 0, width: 0, buttons: [], actualHeight: 3, scrollOffset: 0, maxVisibleItems: 0, handle: undefined, drag: undefined },
				models: { visible: false, row: 0, col: 0, width: 0, buttons: [], actualHeight: 3, scrollOffset: 0, maxVisibleItems: 0, handle: undefined, drag: undefined },
			allModels: { visible: false, row: 0, col: 0, width: 0, buttons: [], actualHeight: 3, scrollOffset: 0, maxVisibleItems: 0, handle: undefined, drag: undefined },
			},
			viewport: { row: 0, height: 0, renderedHeight: 0, buttons: [], drag: undefined, velocitySamples: [], momentum: undefined },
			editor: { row: 0, height: 0, buttons: [] },
		},
		thinkingLevel: "off" as ThinkingLevel,
		modelsScopeFilter: "scoped",
	};
}

function fakeContext(overrides?: Partial<PhoneShellRenderContext>): PhoneShellRenderContext {
	const state = fakeRenderState();
	return {
		state,
		getConfig: () => DEFAULT_CONFIG,
		getLayout: () => DEFAULT_LAYOUT,
		getFavorites: () => DEFAULT_FAVORITES,
		getTheme: fakeTheme,
		...overrides,
	};
}

function fakeTui(overrides?: Record<string, unknown>) {
	return {
		terminal: { rows: 40, columns: 80, write: vi.fn(), ...(overrides?.terminal as Record<string, unknown> ?? {}) },
		children: [],
		requestRender: vi.fn(),
		showOverlay: vi.fn(),
		...(overrides ?? {}),
	};
}

// ---------------------------------------------------------------------------
// Header
// ---------------------------------------------------------------------------

describe("HeaderBarComponent", () => {
	it("renders exactly 3 lines", () => {
		const ctx = fakeContext();
		const header = new HeaderBarComponent(ctx);
		const lines = header.render(80);
		expect(lines).toHaveLength(3);
	});

	it("populates hit regions", () => {
		const ctx = fakeContext();
		const header = new HeaderBarComponent(ctx);
		header.render(80);
		expect(ctx.state.ui.headerButtons.length).toBeGreaterThan(0);
	});

	it("renders with narrow width without throwing", () => {
		const ctx = fakeContext();
		const header = new HeaderBarComponent(ctx);
		expect(() => header.render(20)).not.toThrow();
	});

	it("renders with minimum width without throwing", () => {
		const ctx = fakeContext();
		const header = new HeaderBarComponent(ctx);
		expect(() => header.render(6)).not.toThrow();
	});
});

// ---------------------------------------------------------------------------
// Bar (favorites rail)
// ---------------------------------------------------------------------------

describe("BottomBarComponent", () => {
	it("renders exactly 3 lines", () => {
		const tui = fakeTui();
		const ctx = fakeContext();
		const bar = new BottomBarComponent(tui as any, ctx);
		const lines = bar.render(80);
		expect(lines).toHaveLength(3);
	});

	it("populates bar hit regions when favorites exist", () => {
		const tui = fakeTui();
		const ctx = fakeContext();
		const bar = new BottomBarComponent(tui as any, ctx);
		bar.render(80);
		expect(ctx.state.ui.bar.buttons.length).toBeGreaterThan(0);
	});

	it("renders empty favorites without throwing", () => {
		const tui = fakeTui();
		const ctx = fakeContext({ getFavorites: () => [] });
		const bar = new BottomBarComponent(tui as any, ctx);
		expect(() => bar.render(80)).not.toThrow();
		const lines = bar.render(80);
		expect(lines).toHaveLength(3);
	});

	it("handles narrow width gracefully", () => {
		const tui = fakeTui();
		const ctx = fakeContext();
		const bar = new BottomBarComponent(tui as any, ctx);
		expect(() => bar.render(10)).not.toThrow();
	});
});

// ---------------------------------------------------------------------------
// Nav pad
// ---------------------------------------------------------------------------

describe("NavigationPadComponent", () => {
	it("renders a non-zero number of lines", () => {
		const tui = fakeTui();
		const ctx = fakeContext();
		const nav = new NavigationPadComponent(tui as any, ctx, "bottom");
		const lines = nav.render(80);
		expect(lines.length).toBeGreaterThan(0);
	});

	it("populates nav hit regions", () => {
		const tui = fakeTui();
		const ctx = fakeContext();
		const nav = new NavigationPadComponent(tui as any, ctx, "bottom");
		nav.render(80);
		expect(ctx.state.ui.nav.buttons.length).toBeGreaterThan(0);
	});
});

// ---------------------------------------------------------------------------
// Dropdown overlay
// ---------------------------------------------------------------------------

describe("ButtonDropdownOverlayComponent", () => {
	const buttons: ButtonSpec[] = [
		{ kind: "action", id: "test-a", label: " A ", action: "scrollTop" },
		{ kind: "action", id: "test-b", label: " B ", action: "scrollBottom" },
	];

	it("renders at least 2 + 3*buttons lines (border + button rows)", () => {
		const ctx = fakeContext();
		let reportedHeight = 0;
		const overlay = new ButtonDropdownOverlayComponent(
			ctx,
			() => buttons,
			() => 3,
			() => 1,
			(_hits, h) => { reportedHeight = h; },
		);
		const lines = overlay.render(40);
		// 2 border lines + 3 lines per button
		expect(lines.length).toBe(2 + buttons.length * 3);
		expect(reportedHeight).toBe(lines.length);
	});

	it("renders empty button list without throwing", () => {
		const ctx = fakeContext();
		const overlay = new ButtonDropdownOverlayComponent(
			ctx,
			() => [],
			() => 3,
			() => 1,
			vi.fn(),
		);
		expect(() => overlay.render(40)).not.toThrow();
	});

	it("clamps visible buttons when heightOptions restricts them", () => {
		const ctx = fakeContext();
		const manyButtons: ButtonSpec[] = Array.from({ length: 20 }, (_, i) => ({
			kind: "action" as const, id: `test-${i}`, label: ` ${i} `, action: "scrollTop",
		}));
		let reportedHeight = 0;
		const overlay = new ButtonDropdownOverlayComponent(
			ctx,
			() => manyButtons,
			() => 3,
			() => 1,
			(_hits, h) => { reportedHeight = h; },
			undefined,
			{ getMaxOverlayHeight: () => 10 }, // very short: ~3 buttons max
		);
		const lines = overlay.render(40);
		expect(lines.length).toBeLessThanOrEqual(10);
		expect(reportedHeight).toBeLessThanOrEqual(10);
	});
});
