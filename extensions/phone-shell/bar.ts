import type { Component, TUI } from "@mariozechner/pi-tui";
import { truncateToWidth, visibleWidth } from "@mariozechner/pi-tui";
import { BAR_HEIGHT } from "./defaults.js";
import type { ButtonHitRegion, ButtonSpec, PhoneShellRenderContext } from "./types.js";

const CHIP_GAP = 1; // columns between chips

export class BottomBarComponent implements Component {
	constructor(
		private readonly tui: TUI,
		private readonly ctx: PhoneShellRenderContext,
	) {}

	render(width: number): string[] {
		const theme = this.ctx.getTheme();
		const config = this.ctx.getConfig();
		const favorites = this.ctx.getFavorites();
		const lead = " ".repeat(config.render.leadingColumns);
		// prefix = lead (leadingColumns) + indicator char (1) = leadingColumns+1 visible cols
		const prefixCols = config.render.leadingColumns + 1;
		const usableWidth = Math.max(1, width - prefixCols);

		// ---------------------------------------------------------------------------
		// Layout: compute virtual X position for each chip
		// ---------------------------------------------------------------------------

		type ChipLayout = { spec: ButtonSpec; label: string; palette: "accent" | "warning" | "muted"; virtualX: number; chipWidth: number };
		const layouts: ChipLayout[] = [];
		let vx = 0;

		for (let i = 0; i < favorites.length; i++) {
			const fav = favorites[i]!;
			const displayLabel = ` ${fav.label} `;
			const innerWidth = visibleWidth(displayLabel);
			const chipWidth = innerWidth + 2; // +2 for │ borders
			const palette = fav.palette ?? "accent";
			const spec: ButtonSpec = {
				kind: "command",
				id: `fav-${i}`,
				label: fav.label,
				command: fav.command,
				palette,
			};
			layouts.push({ spec, label: displayLabel, palette, virtualX: vx, chipWidth });
			vx += chipWidth + CHIP_GAP;
		}

		const totalVirtualWidth = layouts.length > 0 ? Math.max(0, vx - CHIP_GAP) : 0;
		const maxScrollX = Math.max(0, totalVirtualWidth - usableWidth);

		// Clamp and sync scroll state
		const scrollX = Math.max(0, Math.min(maxScrollX, this.ctx.state.ui.bar.scrollX));
		this.ctx.state.ui.bar.scrollX = scrollX;
		this.ctx.state.ui.bar.maxScrollX = maxScrollX;
		this.ctx.state.ui.bar.actualHeight = BAR_HEIGHT;

		// ---------------------------------------------------------------------------
		// Render: only fully-visible chips
		// ---------------------------------------------------------------------------

		const tops: string[] = [];
		const mids: string[] = [];
		const bots: string[] = [];
		const hitRegions: ButtonHitRegion[] = [];
		let cursorX = 0;

		for (const { spec, label, palette, virtualX, chipWidth } of layouts) {
			const screenX = virtualX - scrollX;

			if (screenX >= usableWidth) break;            // off right — done
			if (screenX + chipWidth <= 0) continue;       // off left — skip
			if (screenX < 0) continue;                    // partially off left — skip
			if (screenX + chipWidth > usableWidth) continue; // partially off right — skip

			// Fill gap between current cursor and this chip
			const gap = screenX - cursorX;
			if (gap > 0) {
				const spaces = " ".repeat(gap);
				tops.push(spaces);
				mids.push(spaces);
				bots.push(spaces);
				cursorX += gap;
			}

			const innerWidth = chipWidth - 2;
			tops.push(theme.fg(palette, `╭${"─".repeat(innerWidth)}╮`));
			mids.push(theme.fg(palette, "│") + theme.bold(theme.fg(palette, label)) + theme.fg(palette, "│"));
			bots.push(theme.fg(palette, `╰${"─".repeat(innerWidth)}╯`));

			const colStart = prefixCols + 1 + screenX; // 1-based terminal column
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
		// Scroll indicators and empty-state hint
		// ---------------------------------------------------------------------------

		const hasLeft = scrollX > 0;
		const hasRight = scrollX < maxScrollX;
		const leftInd = hasLeft ? theme.fg("dim", "‹") : " ";
		const rightInd = hasRight ? theme.fg("dim", "›") : "";

		let midRow: string;
		if (favorites.length === 0) {
			const hint = theme.fg("dim", "  no favorites — say \"add to favorites\" to populate  ");
			midRow = truncateToWidth(lead + leftInd + hint, width);
		} else {
			midRow = truncateToWidth(lead + leftInd + mids.join("") + rightInd, width);
		}

		return [
			truncateToWidth(lead + " " + tops.join(""), width),
			midRow,
			truncateToWidth(lead + " " + bots.join(""), width),
		];
	}

	invalidate(): void {}
}
