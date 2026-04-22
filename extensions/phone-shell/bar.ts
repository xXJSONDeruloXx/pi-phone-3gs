import type { Component, TUI } from "@mariozechner/pi-tui";
import { truncateToWidth, visibleWidth } from "@mariozechner/pi-tui";
import { BAR_HEIGHT } from "./defaults.js";
import type { ButtonHitRegion, ButtonSpec, PhoneShellRenderContext } from "./types.js";

// ---------------------------------------------------------------------------
// Strip item definition
// ---------------------------------------------------------------------------

interface StripChip {
	id: string;
	label: string;
	palette?: "accent" | "warning" | "muted";
}

// Placeholder items — replace with real data once the interaction model is proven
const STRIP_ITEMS: StripChip[] = [
	{ id: "strip-start", label: "  START  ", palette: "accent" },
	{ id: "strip-foo-1", label: "  foo bar  " },
	{ id: "strip-foo-2", label: "  foo bar  " },
	{ id: "strip-foo-3", label: "  foo bar  " },
	{ id: "strip-foo-4", label: "  foo bar  " },
	{ id: "strip-foo-5", label: "  foo bar  " },
	{ id: "strip-end", label: "  END  ", palette: "accent" },
];

const CHIP_GAP = 1; // columns between chips

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export class BottomBarComponent implements Component {
	constructor(
		private readonly tui: TUI,
		private readonly ctx: PhoneShellRenderContext,
	) {}

	render(width: number): string[] {
		const theme = this.ctx.getTheme();
		const config = this.ctx.getConfig();
		const lead = " ".repeat(config.render.leadingColumns);
		const usableWidth = Math.max(1, width - config.render.leadingColumns);

		// ---------------------------------------------------------------------------
		// Layout: compute virtual X position for each chip
		// ---------------------------------------------------------------------------

		type ChipLayout = { chip: StripChip; spec: ButtonSpec; virtualX: number; chipWidth: number };
		const layouts: ChipLayout[] = [];
		let vx = 0;
		for (const chip of STRIP_ITEMS) {
			const innerWidth = visibleWidth(chip.label);
			const chipWidth = innerWidth + 2; // +2 for │ borders
			const spec: ButtonSpec = {
				kind: "input",
				id: chip.id,
				label: chip.label,
				data: "", // placeholder — no action yet
				palette: chip.palette,
			};
			layouts.push({ chip, spec, virtualX: vx, chipWidth });
			vx += chipWidth + CHIP_GAP;
		}

		const totalVirtualWidth = Math.max(0, vx - CHIP_GAP);
		const maxScrollX = Math.max(0, totalVirtualWidth - usableWidth);

		// Clamp and sync scroll state
		const scrollX = Math.max(0, Math.min(maxScrollX, this.ctx.state.ui.bar.scrollX));
		this.ctx.state.ui.bar.scrollX = scrollX;
		this.ctx.state.ui.bar.maxScrollX = maxScrollX;
		this.ctx.state.ui.bar.actualHeight = BAR_HEIGHT;

		// ---------------------------------------------------------------------------
		// Render: only fully-visible chips (simplest correct approach)
		// ---------------------------------------------------------------------------

		const tops: string[] = [];
		const mids: string[] = [];
		const bots: string[] = [];
		const hitRegions: ButtonHitRegion[] = [];
		let cursorX = 0; // tracks position within usable area

		for (const { chip, spec, virtualX, chipWidth } of layouts) {
			const screenX = virtualX - scrollX;

			if (screenX >= usableWidth) break;           // off right — done
			if (screenX + chipWidth <= 0) continue;      // off left — skip
			if (screenX < 0) continue;                   // partially off left — skip for now
			if (screenX + chipWidth > usableWidth) continue; // partially off right — skip

			// Fill gap from current cursor to this chip's screen position
			const gap = screenX - cursorX;
			if (gap > 0) {
				const spaces = " ".repeat(gap);
				tops.push(spaces);
				mids.push(spaces);
				bots.push(spaces);
				cursorX += gap;
			}

			const palette = chip.palette ?? "muted";
			const innerWidth = chipWidth - 2;

			tops.push(theme.fg(palette, `╭${"─".repeat(innerWidth)}╮`));
			mids.push(theme.fg(palette, "│") + theme.bold(theme.fg(palette, chip.label)) + theme.fg(palette, "│"));
			bots.push(theme.fg(palette, `╰${"─".repeat(innerWidth)}╯`));

			const colStart = config.render.leadingColumns + 1 + screenX;
			hitRegions.push({
				button: spec,
				colStart,
				colEnd: colStart + chipWidth - 1,
				rowOffset: 0,
			});

			cursorX += chipWidth;
		}

		// ---------------------------------------------------------------------------
		// Update state
		// ---------------------------------------------------------------------------

		const footerChild = this.tui.children[this.tui.children.length - 1];
		const footerHeight = footerChild ? footerChild.render(width).length : BAR_HEIGHT;
		this.ctx.state.ui.bar.row = this.tui.terminal.rows - footerHeight - BAR_HEIGHT + 1;
		this.ctx.state.ui.bar.buttons = hitRegions;

		if (this.ctx.state.ui.nav.placement === "bottom") {
			this.ctx.state.ui.nav.row = this.ctx.state.ui.bar.row - this.ctx.state.ui.nav.actualHeight;
		}

		// ---------------------------------------------------------------------------
		// Scroll indicators: show ‹ / › in leading area and right edge of mid line
		// ---------------------------------------------------------------------------

		const hasLeft = scrollX > 0;
		const hasRight = scrollX < maxScrollX;
		const leftInd = hasLeft ? theme.fg("dim", "‹") : " ";
		const rightInd = hasRight ? theme.fg("dim", "›") : "";

		const midContent = lead + leftInd + mids.join("") + rightInd;

		return [
			truncateToWidth(lead + " " + tops.join(""), width),
			truncateToWidth(midContent, width),
			truncateToWidth(lead + " " + bots.join(""), width),
		];
	}

	invalidate(): void {}
}
