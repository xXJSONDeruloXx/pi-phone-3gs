import type { Component, TUI } from "@mariozechner/pi-tui";
import type { PhoneShellRenderContext, ViewportDebugState } from "./types.js";

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
		const fixedHeight = this.tui.children
			.filter((child) => child !== this)
			.reduce((sum, child) => sum + child.render(width).length, 0);
		const visibleHeight = Math.max(1, this.tui.terminal.rows - fixedHeight);
		const lines = this.content.render(width);
		const maxTop = Math.max(0, lines.length - visibleHeight);

		if (this.followBottom) this.scrollTop = maxTop;
		this.scrollTop = Math.max(0, Math.min(maxTop, this.scrollTop));
		this.lastVisibleHeight = visibleHeight;
		this.lastTotalLines = lines.length;
		this.lastMaxTop = maxTop;

		const visible = lines.slice(this.scrollTop, this.scrollTop + visibleHeight);
		while (visible.length < visibleHeight) visible.push("");
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
