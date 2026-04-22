import type { Component, TUI } from "@mariozechner/pi-tui";
import { truncateToWidth, visibleWidth } from "@mariozechner/pi-tui";
import { DEFAULT_AGENT_STATE } from "./defaults.js";
import type { AgentPhase, AgentStateInfo, PhoneShellRenderContext } from "./types.js";

function formatTime(timestamp: number): string {
	const d = new Date(timestamp);
	return `${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}`;
}

function renderContextBar(percent: number, barWidth: number): string {
	const filled = Math.round((percent / 100) * barWidth);
	const empty = barWidth - filled;
	return "█".repeat(Math.max(0, filled)) + "░".repeat(Math.max(0, empty));
}

function phaseLabel(phase: AgentPhase): string {
	switch (phase) {
		case "idle": return "idle";
		case "thinking": return "think";
		case "streaming": return "stream";
		case "tool_calling": return "tools";
	}
}

function phaseDotColor(phase: AgentPhase): "accent" | "warning" | "muted" {
	switch (phase) {
		case "idle": return "muted";
		case "thinking": return "accent";
		case "streaming": return "accent";
		case "tool_calling": return "warning";
	}
}

export class HeaderBarComponent implements Component {
	constructor(
		private readonly tui: TUI,
		private readonly ctx: PhoneShellRenderContext,
	) {}

	render(width: number): string[] {
		const theme = this.ctx.getTheme();
		const config = this.ctx.getConfig();
		const agentState = this.ctx.state.agentState;
		const headerConfig = config.header;
		const lead = " ".repeat(config.render.leadingColumns);
		const usableWidth = Math.max(1, width - config.render.leadingColumns);

		const phase = agentState.phase;
		const model = agentState.model;
		const dotColor = phaseDotColor(phase);
		const label = phaseLabel(phase);

		// Line 1: model name (left) + state indicator (right)
		const stateVisual = `${theme.fg(dotColor, "●")} ${theme.fg(dotColor, label)}`;
		const stateVisibleWidth = visibleWidth("●") + 1 + label.length;
		const modelMax = Math.max(1, usableWidth - 1 - stateVisibleWidth);
		let modelDisplay = model;
		if (visibleWidth(modelDisplay) > modelMax) {
			modelDisplay = truncateToWidth(modelDisplay, modelMax, "", true);
		}
		const modelVisible = visibleWidth(modelDisplay);
		const pad1 = Math.max(0, usableWidth - modelVisible - 1 - stateVisibleWidth);
		const line1 = lead + modelDisplay + " ".repeat(pad1) + " " + stateVisual;

		// Line 2: context bar + jobs + timestamp
		const parts: string[] = [];

		if (headerConfig.showContext && agentState.contextPercent != null) {
			const pct = Math.round(agentState.contextPercent);
			const bar = renderContextBar(agentState.contextPercent, headerConfig.contextBarWidth);
			parts.push(`ctx ${bar} ${pct}%`);
		} else if (headerConfig.showContext && agentState.contextTokens != null) {
			const tok = agentState.contextTokens >= 1000
				? `${Math.round(agentState.contextTokens / 1000)}k`
				: `${agentState.contextTokens}`;
			parts.push(`ctx ${tok}`);
		}

		if (headerConfig.showJobs && agentState.backgroundJobs > 0) {
			parts.push(`⚙${agentState.backgroundJobs}`);
		}

		if (headerConfig.showTimestamp && agentState.lastUpdate > 0) {
			parts.push(formatTime(agentState.lastUpdate));
		}

		const line2Raw = parts.join("  ");
		const line2Pad = Math.max(0, usableWidth - visibleWidth(line2Raw));
		const line2 = parts.length > 0
			? lead + theme.fg("dim", line2Raw) + " ".repeat(line2Pad)
			: lead + " ".repeat(usableWidth);

		return [
			truncateToWidth(line1, width),
			truncateToWidth(line2, width),
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
