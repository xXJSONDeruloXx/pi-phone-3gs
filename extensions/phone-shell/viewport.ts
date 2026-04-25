import type { Component, TUI } from "@mariozechner/pi-tui";
import { truncateToWidth, visibleWidth } from "@mariozechner/pi-tui";
import { makeButtonWidth, padLineToWidth, renderBoxButton } from "./button-helpers.js";
import type { ButtonHitRegion, ButtonSpec, PhoneShellRenderContext, ViewportDebugState } from "./types.js";

const VIEWPORT_TOP_BUTTON: ButtonSpec = {
	kind: "action",
	id: "viewport-top",
	label: "TOP",
	action: "scrollTop",
	palette: "accent",
};

const VIEWPORT_BOTTOM_BUTTON: ButtonSpec = {
	kind: "action",
	id: "viewport-bottom",
	label: "BTM",
	action: "scrollBottom",
	palette: "accent",
};

function renderViewportButton(spec: ButtonSpec, theme: ReturnType<PhoneShellRenderContext["getTheme"]>): { lines: string[]; width: number } {
	return renderBoxButton(spec, theme);
}

// padLineToWidth imported from button-helpers

function placeButtonAtRight(line: string, width: number, buttonLine: string, buttonWidth: number): string {
	if (buttonWidth >= width) return truncateToWidth(buttonLine, width);
	const contentWidth = Math.max(0, width - buttonWidth - 1);
	return `${padLineToWidth(line, contentWidth)} ${buttonLine}`;
}

export class TouchViewport implements Component {
	readonly __piPhoneViewport = true;

	private scrollTop = 0;
	private followBottom = true;
	private lastVisibleHeight = 1;
	private lastTotalLines = 0;
	private lastMaxTop = 0;

	constructor(
		private readonly tui: TUI,
		private readonly content: Component,
		private readonly ctx: PhoneShellRenderContext,
	) {}

	render(width: number): string[] {
		let rowsBefore = 0;
		let fixedHeight = 0;
		const viewportIndex = this.tui.children.indexOf(this);
		for (let index = 0; index < this.tui.children.length; index++) {
			const child = this.tui.children[index]!;
			if (child === this) continue;
			const childHeight = child.render(width).length;
			fixedHeight += childHeight;
			if (index < viewportIndex) rowsBefore += childHeight;
		}
		const visibleHeight = Math.max(1, this.tui.terminal.rows - fixedHeight);
		const lines = this.content.render(width);
		const maxTop = Math.max(0, lines.length - visibleHeight);

		if (this.followBottom) this.scrollTop = maxTop;
		this.scrollTop = Math.max(0, Math.min(maxTop, this.scrollTop));
		this.lastVisibleHeight = visibleHeight;
		this.lastTotalLines = lines.length;
		this.lastMaxTop = maxTop;
		this.ctx.state.ui.viewport.row = rowsBefore + 1;
		this.ctx.state.ui.viewport.height = visibleHeight;

		const visible = lines.slice(this.scrollTop, this.scrollTop + visibleHeight);
		while (visible.length < visibleHeight) visible.push("");

		const viewportButtons: ButtonHitRegion[] = [];
		const shouldRenderJumpButtons = this.ctx.state.shell.viewportJumpButtonsVisible && visibleHeight >= 6 && width >= 6;
		if (shouldRenderJumpButtons) {
			const theme = this.ctx.getTheme();
			const topButton = renderViewportButton(VIEWPORT_TOP_BUTTON, theme);
			const bottomButton = renderViewportButton(VIEWPORT_BOTTOM_BUTTON, theme);
			const buttonWidth = Math.max(topButton.width, bottomButton.width);
			const buttonColStart = Math.max(1, width - buttonWidth + 1);
			const topStart = 0;
			const bottomStart = visibleHeight - bottomButton.lines.length;

			for (let index = 0; index < topButton.lines.length; index++) {
				visible[topStart + index] = placeButtonAtRight(visible[topStart + index] ?? "", width, topButton.lines[index]!, buttonWidth);
				viewportButtons.push({
					button: VIEWPORT_TOP_BUTTON,
					colStart: buttonColStart,
					colEnd: width,
					rowOffset: topStart + index,
				});
			}

			for (let index = 0; index < bottomButton.lines.length; index++) {
				visible[bottomStart + index] = placeButtonAtRight(visible[bottomStart + index] ?? "", width, bottomButton.lines[index]!, buttonWidth);
				viewportButtons.push({
					button: VIEWPORT_BOTTOM_BUTTON,
					colStart: buttonColStart,
					colEnd: width,
					rowOffset: bottomStart + index,
				});
			}
		}

		this.ctx.state.ui.viewport.buttons = viewportButtons;
		return visible;
	}

	invalidate(): void {
		this.content.invalidate();
	}

	scrollLines(delta: number): void {
		if (delta === 0) return;
		this.followBottom = false;
		this.scrollTop = Math.max(0, Math.min(this.lastMaxTop, this.scrollTop + delta));
		if (this.scrollTop >= this.lastMaxTop) this.followBottom = true;
		this.tui.requestRender();
	}

	pageUp(): void {
		this.scrollLines(-this.getPageSize());
	}

	pageDown(): void {
		this.scrollLines(this.getPageSize());
	}

	toTop(): void {
		this.followBottom = false;
		this.scrollTop = 0;
		this.tui.requestRender();
	}

	toBottom(): void {
		this.followBottom = true;
		this.scrollTop = this.lastMaxTop;
		this.tui.requestRender();
	}

	setScrollTop(scrollTop: number): void {
		this.followBottom = false;
		this.scrollTop = Math.max(0, Math.min(this.lastMaxTop, Math.round(scrollTop)));
		if (this.scrollTop >= this.lastMaxTop) this.followBottom = true;
		this.tui.requestRender();
	}

	getDebugState(): ViewportDebugState {
		const percent = this.lastMaxTop === 0 ? 100 : Math.round((this.scrollTop / this.lastMaxTop) * 100);
		return {
			scrollTop: this.scrollTop,
			visibleHeight: this.lastVisibleHeight,
			totalLines: this.lastTotalLines,
			maxTop: this.lastMaxTop,
			followBottom: this.followBottom,
			percent,
		};
	}

	private getPageSize(): number {
		const config = this.ctx.getConfig();
		const overlappedStep = this.lastVisibleHeight - config.viewport.pageOverlapLines;
		return Math.max(
			1,
			Math.min(this.lastVisibleHeight - 1, Math.max(config.viewport.minPageScrollLines, overlappedStep)),
		);
	}
}
