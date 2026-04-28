import type { Component, TUI } from "@mariozechner/pi-tui";
import { visibleWidth } from "@mariozechner/pi-tui";
import { padLineToWidth } from "./button-helpers.js";
import type { ButtonHitRegion, ButtonSpec, PhoneShellRenderContext, ViewportDebugState } from "./types.js";
import { queueLog, scheduleRender, state } from "./state.js";

const VIEWPORT_TOP_BUTTON: ButtonSpec = {
	kind: "action",
	id: "viewport-top",
	label: "▲",
	action: "scrollTop",
	palette: "accent",
};

const VIEWPORT_BOTTOM_BUTTON: ButtonSpec = {
	kind: "action",
	id: "viewport-bottom",
	label: "▼",
	action: "scrollBottom",
	palette: "accent",
};

/**
 * Render a thin jump bar: a full-width horizontal rule with a small arrow
 * indicator on the right. Returns a single line and its hit width (just
 * the arrow portion for tap targeting).
 */
function renderThinJumpBar(
	spec: ButtonSpec,
	theme: ReturnType<PhoneShellRenderContext["getTheme"]>,
	width: number,
): string {
	const arrow = spec.label;
	const indicatorWidth = visibleWidth(arrow) + 2; // padding around arrow
	const indicatorColStart = Math.max(1, width - indicatorWidth - 1);

	// Build the bar: muted horizontal rule across most of the width,
	// with a small accent-colored arrow region on the right.
	const ruleWidth = indicatorColStart - 1;
	const ruleChar = "─";
	const leftPad = 1; // 1 space before arrow
	const rightPad = indicatorWidth - visibleWidth(arrow) - leftPad;

	const rulePart = ruleWidth > 0 ? theme.fg("muted", ruleChar.repeat(ruleWidth)) : "";
	const arrowPart = theme.fg("accent", `${" ".repeat(leftPad)}${arrow}${" ".repeat(Math.max(0, rightPad))}`);

	return `${rulePart}${arrowPart}`;
}

export class TouchViewport implements Component {
	readonly __piPhoneViewport = true;

	private scrollTop = 0;
	/** Fractional scrollTop for smooth sub-row momentum animation. */
	private scrollTopFractional = 0;
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

		if (this.followBottom && this.scrollTopFractional >= 0 && this.scrollTopFractional <= maxTop) {
			this.scrollTop = maxTop;
			this.scrollTopFractional = maxTop;
		}
		this.scrollTop = Math.max(0, Math.min(maxTop, this.scrollTop));
		// NOTE: do NOT clamp scrollTopFractional here — it can go negative or
		// exceed maxTop during rubber-banding, and we need the raw value for
		// the overscroll render path below.
		this.lastVisibleHeight = visibleHeight;
		this.lastTotalLines = lines.length;
		this.lastMaxTop = maxTop;
		this.ctx.state.ui.viewport.row = rowsBefore + 1;
		this.ctx.state.ui.viewport.height = visibleHeight;

		const frac = this.scrollTopFractional;
		let visible: string[];

		if (frac < 0) {
			// Overscrolled past the top — show empty rows at top, push content down
			const overscrollRows = Math.min(Math.round(Math.abs(frac)), visibleHeight);
			visible = [];
			for (let i = 0; i < overscrollRows; i++) visible.push("");
			for (let i = 0; i < visibleHeight - overscrollRows; i++) visible.push(lines[i] ?? "");
		} else if (frac > maxTop) {
			// Overscrolled past the bottom — entire visible block shifts up, empties trail
			const overscrollRows = Math.min(Math.round(frac - maxTop), visibleHeight);
			// Content that was at the bottom scrolls up by overscrollRows,
			// the bottom overscrollRows of the previously-visible screenful exit the top.
			const start = maxTop + overscrollRows;
			const contentRows = visibleHeight - overscrollRows;
			visible = lines.slice(start, start + contentRows);
			while (visible.length < contentRows) visible.push("");
			for (let i = 0; i < overscrollRows; i++) visible.push("");
		} else {
			// Normal scrolling
			visible = lines.slice(this.scrollTop, this.scrollTop + visibleHeight);
		}
		while (visible.length < visibleHeight) visible.push("");

		const viewportButtons: ButtonHitRegion[] = [];
		const shouldRenderJumpButtons = this.ctx.state.shell.viewportJumpButtonsVisible && visibleHeight >= 4 && width >= 6;
		if (shouldRenderJumpButtons) {
			const theme = this.ctx.getTheme();

			// Replace first and last visible lines with thin jump bars.
			// This sacrifices one content row at top and one at bottom,
			// but the bars are full-width horizontal rules with just a small
			// arrow indicator — much less intrusive than 3-line box buttons.
			visible[0] = renderThinJumpBar(VIEWPORT_TOP_BUTTON, theme, width);
			viewportButtons.push({
				button: VIEWPORT_TOP_BUTTON,
				colStart: 1,
				colEnd: width,
				rowOffset: 0,
			});

			const bottomRow = visibleHeight - 1;
			visible[bottomRow] = renderThinJumpBar(VIEWPORT_BOTTOM_BUTTON, theme, width);
			viewportButtons.push({
				button: VIEWPORT_BOTTOM_BUTTON,
				colStart: 1,
				colEnd: width,
				rowOffset: bottomRow,
			});
		}

		this.ctx.state.ui.viewport.buttons = viewportButtons;

		// Width-safety: every line must be clamped to `width` to prevent
		// terminal overflow. padLineToWidth also resets ANSI state per line.
		return visible.map((line) => padLineToWidth(line, width));
	}

	invalidate(): void {
		this.content.invalidate();
	}

	scrollLines(delta: number): void {
		if (delta === 0) return;
		this.followBottom = false;
		this.scrollTop = Math.max(0, Math.min(this.lastMaxTop, this.scrollTop + delta));
		this.scrollTopFractional = this.scrollTop;
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
		this.scrollTopFractional = 0;
		this.cancelMomentum();
		this.tui.requestRender();
	}

	toBottom(): void {
		this.followBottom = true;
		this.scrollTop = this.lastMaxTop;
		this.scrollTopFractional = this.lastMaxTop;
		this.cancelMomentum();
		this.tui.requestRender();
	}

	setScrollTop(scrollTop: number): void {
		this.followBottom = false;
		this.scrollTop = Math.max(0, Math.min(this.lastMaxTop, Math.round(scrollTop)));
		this.scrollTopFractional = this.scrollTop;
		if (this.scrollTop >= this.lastMaxTop) this.followBottom = true;
		this.tui.requestRender();
	}

	/**
	 * Set fractional scrollTop for smooth momentum animation.
	 * Supports rubber-banding beyond content edges.
	 */
	setScrollTopSmooth(scrollTop: number): void {
		this.followBottom = false;
		this.scrollTopFractional = scrollTop;
		// Integer scrollTop for rendering is clamped to content bounds;
		// the render() method handles showing overscroll from scrollTopFractional.
		this.scrollTop = Math.max(0, Math.min(this.lastMaxTop, Math.round(scrollTop)));
		if (this.scrollTop >= this.lastMaxTop && scrollTop <= this.lastMaxTop) {
			this.followBottom = true;
		}
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

	// ---------------------------------------------------------------------------
	// Kinetic / momentum scrolling
	// ---------------------------------------------------------------------------

	/**
	 * Start a momentum animation from the given initial velocity (rows/frame).
	 * Handles rubber-banding at content edges and exponential deceleration.
	 *
	 * Uses recursive setTimeout instead of setInterval so that if a frame takes
	 * longer than frameIntervalMs the next frame is simply delayed rather than
	 * queuing up behind it.
	 */
	startMomentum(initialVelocity: number): void {
		this.cancelMomentum();

		const config = this.ctx.getConfig().kineticScroll;
		if (!config.enabled) return;

		if (Math.abs(initialVelocity) < config.stopThreshold) return;

		const momentum: import("./types.js").MomentumState = {
			velocity: initialVelocity,
			animationFrame: undefined,
		};
		this.ctx.state.ui.viewport.momentum = momentum;

		queueLog(`momentum: start velocity=${initialVelocity.toFixed(3)}`);

		const tick = (): void => {
			// Check if momentum was cancelled externally (e.g. new drag started)
			if (!this.ctx.state.ui.viewport.momentum || this.ctx.state.ui.viewport.momentum !== momentum) {
				this.cancelMomentum();
				return;
			}

			let velocity = momentum.velocity;
			let pos = this.scrollTopFractional;

			// Apply rubber-banding force when overscrolled
			if (pos < 0) {
				// Above top: pull back toward 0
				const overscroll = Math.abs(pos);
				const maxOverscroll = config.maxOverscrollRows;
				const resistance = Math.max(0, 1 - overscroll / maxOverscroll);
				velocity += overscroll * config.rubberBandStiffness;
				velocity *= resistance;
			} else if (pos > this.lastMaxTop) {
				// Below bottom: pull back toward maxTop
				const overscroll = pos - this.lastMaxTop;
				const maxOverscroll = config.maxOverscrollRows;
				const resistance = Math.max(0, 1 - overscroll / maxOverscroll);
				velocity -= overscroll * config.rubberBandStiffness;
				velocity *= resistance;
			}

			// Apply friction
			velocity *= config.friction;
			pos += velocity;

			// Hard clamp to prevent runaway overscroll
			const maxOverscroll = config.maxOverscrollRows;
			pos = Math.max(-maxOverscroll, Math.min(this.lastMaxTop + maxOverscroll, pos));

			// Stop if velocity is low enough and we're within bounds
			const nearEdge = pos < 0 || pos > this.lastMaxTop;
			if (Math.abs(velocity) < config.stopThreshold) {
				if (nearEdge) {
					// Snap back to boundary
					pos = pos < 0 ? 0 : this.lastMaxTop;
				} else {
					// Natural stop within content
					this.cancelMomentum();
					this.setScrollTopSmooth(pos);
					return;
				}
			}

			// If rubber-banding and velocity changed direction (snap back), let it settle
			if (nearEdge && pos < 0 && velocity > 0 && Math.abs(pos) < 0.5) {
				pos = 0;
				velocity = 0;
			}
			if (nearEdge && pos > this.lastMaxTop && velocity < 0 && Math.abs(pos - this.lastMaxTop) < 0.5) {
				pos = this.lastMaxTop;
				velocity = 0;
			}

			momentum.velocity = velocity;
			this.setScrollTopSmooth(pos);

			// If velocity died after snapping, end momentum
			if (Math.abs(velocity) < config.stopThreshold) {
				this.cancelMomentum();
				this.setScrollTopSmooth(pos);
				return;
			}

			// Schedule next frame — recursive setTimeout prevents frame stacking
			momentum.animationFrame = setTimeout(tick, config.frameIntervalMs);
		};

		// Kick off the first frame
		momentum.animationFrame = setTimeout(tick, config.frameIntervalMs);
	}

	/**
	 * Cancel any active momentum animation and snap back into bounds.
	 */
	cancelMomentum(): void {
		const momentum = this.ctx.state.ui.viewport.momentum;
		if (momentum?.animationFrame) {
			clearTimeout(momentum.animationFrame);
		}
		this.ctx.state.ui.viewport.momentum = undefined;
		// Snap fractional position back into content bounds
		this.scrollTopFractional = Math.max(0, Math.min(this.lastMaxTop, this.scrollTopFractional));
		this.scrollTop = Math.round(this.scrollTopFractional);
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
