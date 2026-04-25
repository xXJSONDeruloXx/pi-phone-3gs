import type { Component } from "@mariozechner/pi-tui";
import { truncateToWidth } from "@mariozechner/pi-tui";
import { DEFAULT_AGENT_STATE } from "./defaults.js";
import { makeButtonWidth, renderBoxButton } from "./button-helpers.js";
import type { AgentStateInfo, ButtonHitRegion, ButtonSpec, PhoneShellRenderContext, ThinkingLevel } from "./types.js";
import { thinkingLevelLabel } from "./types.js";

function getHeaderButtonSpecs(
	utilityOverlayVisible: boolean,
	viewOverlayVisible: boolean,
	skillsOverlayVisible: boolean,
	modelsOverlayVisible: boolean,
	thinkingLevel: ThinkingLevel,
): ButtonSpec[] {
	const fileColor = utilityOverlayVisible ? "accent" : "muted";
	const viewColor = viewOverlayVisible ? "accent" : "muted";
	const skillsColor = skillsOverlayVisible ? "accent" : "muted";
	const modelColor: ButtonSpec["palette"] = modelsOverlayVisible ? "accent" : "warning";
	const thinkingColor: ButtonSpec["palette"] = thinkingLevel === "off" ? "muted" : "accent";
	return [
		{ kind: "action", id: "header-thinking", label: thinkingLevelLabel(thinkingLevel), action: "cycleThinkingLevel", palette: thinkingColor },
		{ kind: "action", id: "header-model", label: "MODEL", action: "selectModel", palette: modelColor },
		{ kind: "action", id: "header-skills", label: "SKILLS", action: "toggleSkillsMenu", palette: skillsColor },
		{ kind: "action", id: "header-view", label: "VIEW", action: "toggleViewMenu", palette: viewColor },
		{ kind: "action", id: "header-file", label: "FILE", action: "toggleUtilities", palette: fileColor },
	];
}

function renderButtonRow(specs: ButtonSpec[], gap: number, theme: ReturnType<PhoneShellRenderContext["getTheme"]>): { top: string; mid: string; bot: string; width: number } {
	const tops: string[] = [];
	const mids: string[] = [];
	const bots: string[] = [];
	let totalWidth = 0;

	for (let i = 0; i < specs.length; i++) {
		const spec = specs[i]!;
		const rendered = renderBoxButton(spec, theme);

		tops.push(rendered.lines[0]!);
		mids.push(rendered.lines[1]!);
		bots.push(rendered.lines[2]!);
		totalWidth += rendered.width;
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
		const specs = getHeaderButtonSpecs(
			this.ctx.state.ui.overlays.utility.visible,
			this.ctx.state.ui.overlays.view.visible,
			this.ctx.state.ui.overlays.skills.visible,
			this.ctx.state.ui.overlays.models.visible,
			this.ctx.state.thinkingLevel,
		);

		const fileSpec = specs.find((s) => s.id === "header-file")!;
		const modelSpec = specs.find((s) => s.id === "header-model")!;
		const viewSpec = specs.find((s) => s.id === "header-view")!;
		const thinkingSpec = specs.find((s) => s.id === "header-thinking")!;
		const skillsSpec = specs.find((s) => s.id === "header-skills")!;
		const leftSpecs = [fileSpec, skillsSpec, viewSpec];
		const rightSpecs = [thinkingSpec, modelSpec];

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

		this.ctx.state.ui.headerButtons = hitRegions;

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
