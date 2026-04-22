import type { Component, TUI } from "@mariozechner/pi-tui";
import { BAR_HEIGHT } from "./defaults.js";
import { renderButtonGroups } from "./button-panel.js";
import type { ButtonSpec, PhoneShellRenderContext } from "./types.js";

const NAV_BUTTON_GROUPS: ButtonSpec[][] = [
	[
		{ kind: "action", id: "nav-up", label: "  ↑  ", action: "arrowUp" },
		{ kind: "action", id: "nav-down", label: "  ↓  ", action: "arrowDown" },
		{ kind: "action", id: "nav-left", label: "  ←  ", action: "arrowLeft" },
		{ kind: "action", id: "nav-right", label: "  →  ", action: "arrowRight" },
		{ kind: "action", id: "nav-enter", label: "  ↵  ", action: "sendEnter" },
		{ kind: "action", id: "nav-slash", label: "  /  ", action: "openSlash" },
	],
	[
		{ kind: "action", id: "nav-follow-up", label: "  ⌥ ↵  ", action: "sendFollowUp", palette: "warning" },
		{ kind: "input", id: "nav-interrupt", label: "  ^C  ", data: "\x03", palette: "warning" },
		{ kind: "input", id: "nav-backspace", label: "  ⌫  ", data: "\x7f" },
		{ kind: "input", id: "nav-tab", label: "  ⇥  ", data: "\t" },
		{ kind: "action", id: "nav-escape", label: "  ESC  ", action: "sendEscape" },
	],
];

export class NavigationPadComponent implements Component {
	constructor(
		private readonly tui: TUI,
		private readonly ctx: PhoneShellRenderContext,
		private readonly placement: "top" | "bottom",
	) {}

	render(width: number): string[] {
		const rendered = renderButtonGroups(width, this.ctx, NAV_BUTTON_GROUPS);
		this.ctx.state.ui.nav.buttons = rendered.hitRegions;
		this.ctx.state.ui.nav.actualHeight = rendered.actualHeight;
		this.ctx.state.ui.nav.placement = this.placement;

		if (this.placement === "top") {
			let rowsBefore = 0;
			const navIndex = this.tui.children.indexOf(this);
			for (let index = 0; index < this.tui.children.length; index++) {
				const child = this.tui.children[index]!;
				if (child === this) continue;
				if (index < navIndex) rowsBefore += child.render(width).length;
			}
			this.ctx.state.ui.nav.row = rowsBefore + 1;
		} else if (!this.ctx.state.shell.barVisible) {
			const footerChild = this.tui.children[this.tui.children.length - 1];
			const footerHeight = footerChild ? footerChild.render(width).length : BAR_HEIGHT;
			this.ctx.state.ui.nav.row = this.tui.terminal.rows - footerHeight - rendered.actualHeight + 1;
		}

		return rendered.lines;
	}

	invalidate(): void {}
}
