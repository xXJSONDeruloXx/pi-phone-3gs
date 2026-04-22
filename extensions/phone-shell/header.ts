import type { Component } from "@mariozechner/pi-tui";
import { truncateToWidth, visibleWidth } from "@mariozechner/pi-tui";
import { DEFAULT_AGENT_STATE } from "./defaults.js";
import { makeButtonWidth, buttonPalette } from "./button-helpers.js";
import type { AgentPhase, AgentStateInfo, ButtonHitRegion, ButtonSpec, PhoneShellRenderContext } from "./types.js";

function getHeaderButtonSpecs(utilityOverlayVisible: boolean, viewOverlayVisible: boolean): ButtonSpec[] {
	const etcColor = utilityOverlayVisible ? "accent" : "muted";
	const viewColor = viewOverlayVisible ? "accent" : "muted";
	return [
		{ kind: "action", id: "header-model", label: "MODEL", action: "cycleModel", palette: "warning" },
		{ kind: "action", id: "header-view", label: "VIEW", action: "toggleViewMenu", palette: viewColor },
		{ kind: "action", id: "header-etc", label: "ETC", action: "toggleUtilities", palette: etcColor },
	];
}

function renderButtonRow(specs: ButtonSpec[], gap: number, theme: ReturnType<PhoneShellRenderContext["getTheme"]>): { top: string; mid: string; bot: string; width: number } {
	const tops: string[] = [];
	const mids: string[] = [];
	const bots: string[] = [];
	let totalWidth = 0;

	for (let i = 0; i < specs.length; i++) {
		const spec = specs[i]!;
		const buttonWidth = makeButtonWidth(spec);
		const innerWidth = Math.max(1, buttonWidth - 2);
		const palette = buttonPalette(spec);
		const raw = spec.label.trim();
		const rawWidth = Math.max(0, visibleWidth(raw));
		let label = raw;
		if (rawWidth > innerWidth) label = truncateToWidth(raw, innerWidth, "", true);
		const leftPad = Math.floor((innerWidth - Math.min(visibleWidth(label), innerWidth)) / 2);
		const rightPad = innerWidth - Math.min(visibleWidth(label), innerWidth) - leftPad;
		const padded = " ".repeat(leftPad) + label + " ".repeat(rightPad);
		tops.push(theme.fg(palette, `╭${"─".repeat(innerWidth)}╮`));
		mids.push(theme.fg(palette, "│") + theme.bold(theme.fg(palette, padded)) + theme.fg(palette, "│"));
		bots.push(theme.fg(palette, `╰${"─".repeat(innerWidth)}╯`));
		totalWidth += buttonWidth;
		if (i < specs.length - 1) {
			tops.push(" ".repeat(gap));
			mids.push(" ".repeat(gap));
			bots.push(" ".repeat(gap));
			totalWidth += gap;
		}
	}

	return { top: tops.join(""), mid: mids.join(""), bot: bots.join(""), width: totalWidth };
}

export class HeaderBarComponent implements Component {
	constructor(private readonly ctx: PhoneShellRenderContext) {}

	render(width: number): string[] {
		const theme = this.ctx.getTheme();
		const config = this.ctx.getConfig();
		const lead = " ".repeat(config.render.leadingColumns);
		const usableWidth = Math.max(1, width - config.render.leadingColumns);
		const specs = getHeaderButtonSpecs(this.ctx.state.utilityOverlayVisible, this.ctx.state.viewOverlayVisible);

		const etcSpec = specs.find((s) => s.id === "header-etc")!;
		const modelSpec = specs.find((s) => s.id === "header-model")!;
		const viewSpec = specs.find((s) => s.id === "header-view")!;
		const leftSpecs = [etcSpec];
		const rightSpecs = [modelSpec, viewSpec];

		const left = renderButtonRow(leftSpecs, config.render.buttonGap, theme);
		const right = renderButtonRow(rightSpecs, config.render.buttonGap, theme);
		const fill = Math.max(0, usableWidth - left.width - right.width);

		const hitRegions: ButtonHitRegion[] = [];
		let leftCol = config.render.leadingColumns + 1;
		for (const spec of leftSpecs) {
			const buttonWidth = makeButtonWidth(spec);
			for (let r = 0; r < 3; r++) hitRegions.push({ button: spec, colStart: leftCol, colEnd: leftCol + buttonWidth - 1, rowOffset: r });
			leftCol += buttonWidth + config.render.buttonGap;
		}
		let rightCol = config.render.leadingColumns + 1 + usableWidth - right.width;
		for (let i = 0; i < rightSpecs.length; i++) {
			const spec = rightSpecs[i]!;
			const buttonWidth = makeButtonWidth(spec);
			for (let r = 0; r < 3; r++) hitRegions.push({ button: spec, colStart: rightCol, colEnd: rightCol + buttonWidth - 1, rowOffset: r });
			rightCol += buttonWidth + (i < rightSpecs.length - 1 ? config.render.buttonGap : 0);
		}

		this.ctx.state.headerButtons = hitRegions;

		return [
			truncateToWidth(lead + left.top + " ".repeat(fill) + right.top, width),
			truncateToWidth(lead + left.mid + " ".repeat(fill) + right.mid, width),
			truncateToWidth(lead + left.bot + " ".repeat(fill) + right.bot, width),
		];
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
