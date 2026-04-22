import type { Component } from "@mariozechner/pi-tui";
import { visibleWidth } from "@mariozechner/pi-tui";
import { DEFAULT_AGENT_STATE } from "./defaults.js";
import type { AgentPhase, AgentStateInfo, ButtonSpec, PhoneShellRenderContext } from "./types.js";

function phaseAccent(phase: AgentPhase): "accent" | "warning" | "muted" {
	switch (phase) {
		case "idle": return "muted";
		case "thinking": return "accent";
		case "streaming": return "accent";
		case "tool_calling": return "warning";
	}
}

export class HeaderBarComponent implements Component {
	constructor(private readonly ctx: PhoneShellRenderContext) {}

	render(width: number): string[] {
		const theme = this.ctx.getTheme();
		const config = this.ctx.getConfig();
		const lead = " ".repeat(config.render.leadingColumns);
		const usableWidth = Math.max(1, width - config.render.leadingColumns);
		const color = phaseAccent(this.ctx.state.agentState.phase);

		const button: ButtonSpec = {
			kind: "action",
			id: "header-model",
			label: "MODEL",
			action: "cycleModel",
			palette: color,
		};
		const buttonColStart = config.render.leadingColumns + 1;
		const buttonTextRaw = `[MODEL]`;
		const buttonVisibleWidth = visibleWidth(buttonTextRaw);
		this.ctx.state.headerButtons = [{
			button,
			colStart: buttonColStart,
			colEnd: buttonColStart + buttonVisibleWidth - 1,
			rowOffset: 0,
		}];

		const line1 = lead
			+ theme.bold(theme.fg(color, buttonTextRaw))
			+ " ".repeat(Math.max(0, usableWidth - buttonVisibleWidth));
		const line2 = lead + theme.fg("dim", "─".repeat(usableWidth));

		return [line1, line2];
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
