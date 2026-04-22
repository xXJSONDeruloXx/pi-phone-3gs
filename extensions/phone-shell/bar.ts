import type { Component, TUI } from "@mariozechner/pi-tui";
import { BAR_HEIGHT } from "./defaults.js";
import { renderButtonGroups } from "./button-panel.js";
import type { PhoneShellRenderContext } from "./types.js";

export class BottomBarComponent implements Component {
	constructor(
		private readonly tui: TUI,
		private readonly ctx: PhoneShellRenderContext,
	) {}

	render(width: number): string[] {
		const layout = this.ctx.getLayout();
		const debugState = this.ctx.state.session.viewport?.getDebugState();
		const rendered = renderButtonGroups(width, this.ctx, layout.bottomGroups, {
			middleLineSuffix: ({ isLastRow }) => {
				if (!isLastRow || !debugState) return "";
				const theme = this.ctx.getTheme();
				return " " + (debugState.followBottom ? theme.fg("dim", "BOT") : theme.fg("accent", `${debugState.percent}%`));
			},
		});
		const footerChild = this.tui.children[this.tui.children.length - 1];
		const footerHeight = footerChild ? footerChild.render(width).length : 3;

		this.ctx.state.ui.bar.row = this.tui.terminal.rows - footerHeight - rendered.actualHeight + 1;
		this.ctx.state.ui.bar.buttons = rendered.hitRegions;
		this.ctx.state.ui.bar.actualHeight = rendered.actualHeight;
		if (this.ctx.state.ui.nav.placement === "bottom") {
			this.ctx.state.ui.nav.row = this.ctx.state.ui.bar.row - this.ctx.state.ui.nav.actualHeight;
		}
		return rendered.lines;
	}

	invalidate(): void {}
}
