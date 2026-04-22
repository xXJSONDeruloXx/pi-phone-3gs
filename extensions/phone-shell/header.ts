import type { Component } from "@mariozechner/pi-tui";
import { truncateToWidth, visibleWidth } from "@mariozechner/pi-tui";
import { DEFAULT_AGENT_STATE } from "./defaults.js";
import { makeButtonWidth, buttonPalette } from "./button-helpers.js";
import type { AgentPhase, AgentStateInfo, ButtonHitRegion, ButtonSpec, PhoneShellConfig, PhoneShellRenderContext } from "./types.js";

function phaseAccent(phase: AgentPhase): "accent" | "warning" | "muted" {
	switch (phase) {
		case "idle": return "muted";
		case "thinking": return "accent";
		case "streaming": return "accent";
		case "tool_calling": return "warning";
	}
}

function getHeaderButtonSpecs(_phase: AgentPhase, utilityOverlayVisible: boolean): ButtonSpec[] {
	const etcColor = utilityOverlayVisible ? "accent" : "muted";
	return [
		{ kind: "action", id: "header-model", label: "MODEL", action: "cycleModel", palette: "warning" },
		{ kind: "action", id: "header-proxy", label: "PXY", action: "togglePromptProxy", palette: "accent" },
		{ kind: "action", id: "header-etc", label: "ETC", action: "toggleUtilities", palette: etcColor },
	];
}

export function getHeaderButtonRegions(config: PhoneShellConfig, phase: AgentPhase, utilityOverlayVisible: boolean): ButtonHitRegion[] {
	const specs = getHeaderButtonSpecs(phase, utilityOverlayVisible);
	let col = config.render.leadingColumns + 1;
	const regions: ButtonHitRegion[] = [];
	for (let i = 0; i < specs.length; i++) {
		const spec = specs[i]!;
		const buttonWidth = makeButtonWidth(spec);
		regions.push({
			button: spec,
			colStart: col,
			colEnd: col + buttonWidth - 1,
			rowOffset: 0,
		});
		col += buttonWidth + config.render.buttonGap;
	}
	return regions;
}

export class HeaderBarComponent implements Component {
	constructor(private readonly ctx: PhoneShellRenderContext) {}

	render(width: number): string[] {
		const theme = this.ctx.getTheme();
		const config = this.ctx.getConfig();
		const lead = " ".repeat(config.render.leadingColumns);
		const usableWidth = Math.max(1, width - config.render.leadingColumns);
		const specs = getHeaderButtonSpecs(this.ctx.state.agentState.phase, this.ctx.state.utilityOverlayVisible);

		const tops: string[] = [];
		const mids: string[] = [];
		const bots: string[] = [];
		const hitRegions: ButtonHitRegion[] = [];
		let col = config.render.leadingColumns + 1;

		for (let i = 0; i < specs.length; i++) {
			const spec = specs[i]!;
			const buttonWidth = makeButtonWidth(spec);
			const innerWidth = Math.max(1, buttonWidth - 2);
			const palette = buttonPalette(spec);

			// top border
			tops.push(theme.fg(palette, `╭${"─".repeat(innerWidth)}╮`));

			// middle - center the label in innerWidth
			const raw = spec.label.trim();
			const rawWidth = Math.max(0, visibleWidth(raw));
			let label = raw;
			if (rawWidth > innerWidth) label = truncateToWidth(raw, innerWidth, "", true);
			const leftPad = Math.floor((innerWidth - Math.min(visibleWidth(label), innerWidth)) / 2);
			const rightPad = innerWidth - Math.min(visibleWidth(label), innerWidth) - leftPad;
			const padded = " ".repeat(leftPad) + label + " ".repeat(rightPad);
			mids.push(theme.fg(palette, "│") + theme.bold(theme.fg(palette, padded)) + theme.fg(palette, "│"));

			// bottom border
			bots.push(theme.fg(palette, `╰${"─".repeat(innerWidth)}╯`));

			// push hit region for each header row (0..2)
			for (let rowOffset = 0; rowOffset < 3; rowOffset++) {
				hitRegions.push({ button: spec, colStart: col, colEnd: col + buttonWidth - 1, rowOffset });
			}

			col += buttonWidth;
			if (i < specs.length - 1) {
				tops.push(" ".repeat(config.render.buttonGap));
				mids.push(" ".repeat(config.render.buttonGap));
				bots.push(" ".repeat(config.render.buttonGap));
				col += config.render.buttonGap;
			}
		}

		const lineTop = lead + tops.join("");
		const lineMid = lead + mids.join("");
		const lineBot = lead + bots.join("");

		const padTop = Math.max(0, usableWidth - visibleWidth(lineTop.slice(lead.length)));
		const padMid = Math.max(0, usableWidth - visibleWidth(lineMid.slice(lead.length)));
		const padBot = Math.max(0, usableWidth - visibleWidth(lineBot.slice(lead.length)));

		const paddedTop = truncateToWidth(lineTop + " ".repeat(padTop), width);
		const paddedMid = truncateToWidth(lineMid + " ".repeat(padMid), width);
		const paddedBot = truncateToWidth(lineBot + " ".repeat(padBot), width);

		this.ctx.state.headerButtons = hitRegions;

		return [paddedTop, paddedMid, paddedBot];
	}

	invalidate(): void {}
}

export class AgentStateTracker {
	private info: AgentStateInfo = { ...DEFAULT_AGENT_STATE };
	private onUpdate: () => void;
	private processCount = 0;

	constructor(onUpdate: () => void) {
		this.onUpdate = onUpdate;
	}

	get state(): AgentStateInfo {
		return this.info;
	}

	reset(): void {
		this.info = { ...DEFAULT_AGENT_STATE };
		this.processCount = 0;
	}

	setModel(name: string): void {
		this.info = { ...this.info, model: name };
		this.onUpdate();
	}

	onAgentStart(): void {
		this.info = { ...this.info, phase: "thinking", lastUpdate: Date.now() };
		this.onUpdate();
	}

	onAgentEnd(): void {
		this.info = { ...this.info, phase: "idle", lastUpdate: Date.now() };
		this.onUpdate();
	}

	onTurnStart(): void {
		this.info = { ...this.info, phase: "thinking", lastUpdate: Date.now() };
		this.onUpdate();
	}

	onTurnEnd(): void {
		this.info = { ...this.info, phase: "streaming", lastUpdate: Date.now() };
		this.onUpdate();
	}

	onMessageUpdate(): void {
		if (this.info.phase === "thinking" || this.info.phase === "tool_calling") {
			this.info = { ...this.info, phase: "streaming", lastUpdate: Date.now() };
			this.onUpdate();
		}
	}

	onToolCall(): void {
		this.info = { ...this.info, phase: "tool_calling", lastUpdate: Date.now() };
		this.onUpdate();
	}

	updateContext(tokens: number, limit: number | null): void {
		const percent = limit && limit > 0 ? Math.min(100, (tokens / limit) * 100) : null;
		this.info = { ...this.info, contextTokens: tokens, contextLimit: limit, contextPercent: percent };
		this.onUpdate();
	}

	trackProcessStart(): void {
		this.processCount++;
		this.info = { ...this.info, backgroundJobs: this.processCount };
		this.onUpdate();
	}

	trackProcessEnd(): void {
		this.processCount = Math.max(0, this.processCount - 1);
		this.info = { ...this.info, backgroundJobs: this.processCount };
		this.onUpdate();
	}
}
