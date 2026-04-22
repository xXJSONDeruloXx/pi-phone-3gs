import type { Component } from "@mariozechner/pi-tui";
import { truncateToWidth, visibleWidth } from "@mariozechner/pi-tui";
import { DEFAULT_AGENT_STATE } from "./defaults.js";
import { makeButtonWidth, buttonPalette } from "./button-helpers.js";
import type { AgentPhase, AgentStateInfo, ButtonHitRegion, ButtonSpec, PhoneShellConfig, PhoneShellRenderContext } from "./types.js";

function getHeaderButtonSpecs(_phase: AgentPhase, utilityOverlayVisible: boolean): ButtonSpec[] {
	const etcColor = utilityOverlayVisible ? "accent" : "muted";
	return [
		{ kind: "action", id: "header-model", label: "MODEL", action: "cycleModel", palette: "warning" },
		{ kind: "action", id: "header-proxy", label: "PXY", action: "togglePromptProxy", palette: "accent" },
		{ kind: "action", id: "header-etc", label: "ETC", action: "toggleUtilities", palette: etcColor },
	];
}

export function getHeaderButtonRegions(config: PhoneShellConfig, phase: AgentPhase, utilityOverlayVisible: boolean): ButtonHitRegion[] {
	// For the overlay anchor we only need the left-side ETC position.
	const specs = getHeaderButtonSpecs(phase, utilityOverlayVisible);
	const etc = specs.find((s) => s.id === "header-etc");
	if (!etc) return [];
	const col = config.render.leadingColumns + 1;
	const width = makeButtonWidth(etc);
	return [{ button: etc, colStart: col, colEnd: col + width - 1, rowOffset: 0 }];
}

export class HeaderBarComponent implements Component {
	constructor(private readonly ctx: PhoneShellRenderContext) {}

	render(width: number): string[] {
		const theme = this.ctx.getTheme();
		const config = this.ctx.getConfig();
		const lead = " ".repeat(config.render.leadingColumns);
		const usableWidth = Math.max(1, width - config.render.leadingColumns);
		const specs = getHeaderButtonSpecs(this.ctx.state.agentState.phase, this.ctx.state.utilityOverlayVisible);

		// split specs into left (ETC) and right (MODEL, PXY)
		const etcSpec = specs.find((s) => s.id === "header-etc")!;
		const modelSpec = specs.find((s) => s.id === "header-model")!;
		const proxySpec = specs.find((s) => s.id === "header-proxy")!;
		const leftSpecs = [etcSpec];
		const rightSpecs = [modelSpec, proxySpec];

		// compute block widths
		const leftBlockWidth = leftSpecs.reduce((sum, b, i) => sum + makeButtonWidth(b) + (i < leftSpecs.length - 1 ? config.render.buttonGap : 0), 0);
		const rightBlockWidth = rightSpecs.reduce((sum, b, i) => sum + makeButtonWidth(b) + (i < rightSpecs.length - 1 ? config.render.buttonGap : 0), 0);
		const fill = Math.max(0, usableWidth - leftBlockWidth - rightBlockWidth);

		const topsLeft: string[] = [];
		const midsLeft: string[] = [];
		const botsLeft: string[] = [];
		const topsRight: string[] = [];
		const midsRight: string[] = [];
		const botsRight: string[] = [];
		const hitRegions: ButtonHitRegion[] = [];

		// build left block (starts at lead + 1)
		let leftCol = config.render.leadingColumns + 1;
		for (let i = 0; i < leftSpecs.length; i++) {
			const spec = leftSpecs[i]!;
			const buttonWidth = makeButtonWidth(spec);
			const innerWidth = Math.max(1, buttonWidth - 2);
			const palette = buttonPalette(spec);
			topsLeft.push(theme.fg(palette, `╭${"─".repeat(innerWidth)}╮`));
			const raw = spec.label.trim();
			const rawWidth = Math.max(0, visibleWidth(raw));
			let label = raw;
			if (rawWidth > innerWidth) label = truncateToWidth(raw, innerWidth, "", true);
			const leftPad = Math.floor((innerWidth - Math.min(visibleWidth(label), innerWidth)) / 2);
			const rightPad = innerWidth - Math.min(visibleWidth(label), innerWidth) - leftPad;
			const padded = " ".repeat(leftPad) + label + " ".repeat(rightPad);
			midsLeft.push(theme.fg(palette, "│") + theme.bold(theme.fg(palette, padded)) + theme.fg(palette, "│"));
			botsLeft.push(theme.fg(palette, `╰${"─".repeat(innerWidth)}╯`));
			for (let r = 0; r < 3; r++) hitRegions.push({ button: spec, colStart: leftCol, colEnd: leftCol + buttonWidth - 1, rowOffset: r });
			leftCol += buttonWidth;
			if (i < leftSpecs.length - 1) {
				topsLeft.push(" ".repeat(config.render.buttonGap));
				midsLeft.push(" ".repeat(config.render.buttonGap));
				botsLeft.push(" ".repeat(config.render.buttonGap));
				leftCol += config.render.buttonGap;
			}
		}

		// build right block (right-anchored)
		let rightStartZero = usableWidth - rightBlockWidth; // 0-based within usable area
		let rightCol = config.render.leadingColumns + 1 + rightStartZero;
		for (let i = 0; i < rightSpecs.length; i++) {
			const spec = rightSpecs[i]!;
			const buttonWidth = makeButtonWidth(spec);
			const innerWidth = Math.max(1, buttonWidth - 2);
			const palette = buttonPalette(spec);
			topsRight.push(theme.fg(palette, `╭${"─".repeat(innerWidth)}╮`));
			const raw = spec.label.trim();
			const rawWidth = Math.max(0, visibleWidth(raw));
			let label = raw;
			if (rawWidth > innerWidth) label = truncateToWidth(raw, innerWidth, "", true);
			const leftPad = Math.floor((innerWidth - Math.min(visibleWidth(label), innerWidth)) / 2);
			const rightPad = innerWidth - Math.min(visibleWidth(label), innerWidth) - leftPad;
			const padded = " ".repeat(leftPad) + label + " ".repeat(rightPad);
			midsRight.push(theme.fg(palette, "│") + theme.bold(theme.fg(palette, padded)) + theme.fg(palette, "│"));
			botsRight.push(theme.fg(palette, `╰${"─".repeat(innerWidth)}╯`));
			for (let r = 0; r < 3; r++) hitRegions.push({ button: spec, colStart: rightCol, colEnd: rightCol + buttonWidth - 1, rowOffset: r });
			rightCol += buttonWidth;
			if (i < rightSpecs.length - 1) {
				topsRight.push(" ".repeat(config.render.buttonGap));
				midsRight.push(" ".repeat(config.render.buttonGap));
				botsRight.push(" ".repeat(config.render.buttonGap));
				rightCol += config.render.buttonGap;
			}
		}

		const leftTop = topsLeft.join("");
		const leftMid = midsLeft.join("");
		const leftBot = botsLeft.join("");
		const rightTop = topsRight.join("");
		const rightMid = midsRight.join("");
		const rightBot = botsRight.join("");

		const lineTop = lead + leftTop + " ".repeat(fill) + rightTop;
		const lineMid = lead + leftMid + " ".repeat(fill) + rightMid;
		const lineBot = lead + leftBot + " ".repeat(fill) + rightBot;

		const paddedTop = truncateToWidth(lineTop, width);
		const paddedMid = truncateToWidth(lineMid, width);
		const paddedBot = truncateToWidth(lineBot, width);

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
