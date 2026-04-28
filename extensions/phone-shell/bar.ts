import type { Component, TUI } from "@mariozechner/pi-tui";
import { truncateToWidth, visibleWidth } from "@mariozechner/pi-tui";
import { padLineToWidth } from "./button-helpers.js";
import { BAR_HEIGHT } from "./defaults.js";
import { renderBoxButton } from "./button-helpers.js";
import type { ButtonHitRegion, ButtonSpec, PhoneShellRenderContext } from "./types.js";

const CHIP_GAP = 1; // columns between chips
const RAIL_CHAR = "─"; // horizontal rail character for top/bottom rows

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
			// chipWidth must match renderBoxButton's naturalWidth (visibleWidth(label) + 2)
			// renderBoxButton centers the label inside its own innerWidth and adds │ borders itself.
			const chipWidth = visibleWidth(fav.label) + 2;
			const palette = fav.palette ?? "accent";

			let spec: ButtonSpec;
			if (fav.action) {
				spec = { kind: "action", id: `fav-${i}`, label: fav.label, action: fav.action, palette };
			} else if (fav.command) {
				spec = { kind: "command", id: `fav-${i}`, label: fav.label, command: fav.command, palette };
			} else if (fav.data) {
				if (fav.kind === "editorKey") {
					spec = { kind: "editorKey", id: `fav-${i}`, label: fav.label, data: fav.data, clearFirst: fav.clearFirst, setText: fav.setText, palette };
				} else {
					spec = { kind: "input", id: `fav-${i}`, label: fav.label, data: fav.data, palette };
				}
			} else {
				// Should not happen if parsing is correct, skip
				continue;
			}
			layouts.push({ spec, label: ` ${fav.label} `, palette, virtualX: vx, chipWidth });
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

		for (const { spec, virtualX, chipWidth } of layouts) {
			const screenX = virtualX - scrollX;

			if (screenX >= usableWidth) break;            // off right — done
			if (screenX + chipWidth <= 0) continue;       // off left — skip
			if (screenX < 0) continue;                    // partially off left — skip
			if (screenX + chipWidth > usableWidth) continue; // partially off right — skip

			// Fill gap between current cursor and this chip
			const gap = screenX - cursorX;
			if (gap > 0) {
				tops.push(theme.fg("dim", RAIL_CHAR.repeat(gap)));
				mids.push(" ".repeat(gap));
				bots.push(theme.fg("dim", RAIL_CHAR.repeat(gap)));
				cursorX += gap;
			}

			const rendered = renderBoxButton(spec, theme);
			tops.push(rendered.lines[0]!);
			mids.push(rendered.lines[1]!);
			bots.push(rendered.lines[2]!);

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

		// Remaining width after chip content (for rail fill on top/bot, padding on mid)
		const remainingCols = Math.max(0, usableWidth - cursorX);

		if (favorites.length === 0) {
			const railLine = theme.fg("dim", RAIL_CHAR.repeat(usableWidth));
			const hint = theme.fg("dim", "  no favorites — say \"add to favorites\" to populate  ");
			return [
				padLineToWidth(lead + railLine, width),
				padLineToWidth(lead + " " + hint, width),
				padLineToWidth(lead + railLine, width),
			];
		}

		const railFill = remainingCols > 0 ? theme.fg("dim", RAIL_CHAR.repeat(remainingCols)) : "";
		const midPad = Math.max(0, remainingCols - (hasRight ? 1 : 0));

		return [
			padLineToWidth(lead + theme.fg("dim", RAIL_CHAR) + tops.join("") + railFill, width),
			padLineToWidth(lead + leftInd + mids.join("") + " ".repeat(midPad) + rightInd, width),
			padLineToWidth(lead + theme.fg("dim", RAIL_CHAR) + bots.join("") + railFill, width),
		];
	}

	invalidate(): void {}
}
