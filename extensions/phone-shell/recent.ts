import { SessionManager, type ExtensionCommandContext, type SessionInfo } from "@mariozechner/pi-coding-agent";
import type { Component, OverlayHandle } from "@mariozechner/pi-tui";
import { Key, matchesKey, truncateToWidth, visibleWidth } from "@mariozechner/pi-tui";
import { HEADER_HEIGHT } from "./defaults.js";
import { padLineToWidth } from "./button-helpers.js";
import { queueLog, setLastAction, state } from "./state.js";
import { hideDropdown } from "./dropdowns.js";
import { isPrimaryPointerDrag, isPrimaryPointerPress, type InputResponse } from "./mouse.js";
import type { MouseInput } from "./types.js";

type RecentScope = "current" | "all";
type RecentNameFilter = "all" | "named";
type RecentSortMode = "recent" | "name" | "messages";
type RecentControlAction = "scope-current" | "scope-all" | "toggle-named" | "toggle-sort" | "page-up" | "page-down" | "top" | "bottom" | "close";

type RecentHitRegion =
	| { kind: "control"; action: RecentControlAction; rowOffset: number; colStart: number; colEnd: number }
	| { kind: "session"; sessionPath: string; rowOffset: number; colStart: number; colEnd: number };

interface RecentDragState {
	anchorRow: number;
	anchorScrollOffset: number;
	phase: "potential-tap" | "dragging";
	tapRow: number;
	tapCol: number;
}

interface RecentOverlayState {
	handle?: OverlayHandle;
	visible: boolean;
	row: number;
	col: number;
	width: number;
	height: number;
	scope: RecentScope;
	nameFilter: RecentNameFilter;
	sortMode: RecentSortMode;
	sessions: SessionInfo[];
	loading: boolean;
	loadProgress?: { loaded: number; total: number };
	status?: string;
	scrollOffset: number;
	visibleCount: number;
	hits: RecentHitRegion[];
	drag?: RecentDragState;
	ctx?: ExtensionCommandContext;
	currentSessionPath?: string;
}

const recent: RecentOverlayState = {
	visible: false,
	row: 0,
	col: 0,
	width: 0,
	height: 0,
	scope: "current",
	nameFilter: "all",
	sortMode: "recent",
	sessions: [],
	loading: false,
	scrollOffset: 0,
	visibleCount: 0,
	hits: [],
};

function requestRender(): void {
	state.session.tui?.requestRender();
}

function notify(text: string, type: "info" | "warning" | "error" = "info"): void {
	state.bindings.notify?.(text, type);
}

function formatAge(date: Date): string {
	const diffMs = Date.now() - date.getTime();
	const mins = Math.floor(diffMs / 60000);
	const hours = Math.floor(diffMs / 3600000);
	const days = Math.floor(diffMs / 86400000);
	if (mins < 1) return "now";
	if (mins < 60) return `${mins}m`;
	if (hours < 24) return `${hours}h`;
	if (days < 7) return `${days}d`;
	if (days < 30) return `${Math.floor(days / 7)}w`;
	if (days < 365) return `${Math.floor(days / 30)}mo`;
	return `${Math.floor(days / 365)}y`;
}

function shortenPath(input: string | undefined): string {
	if (!input) return "";
	const home = process.env.HOME;
	if (home && input.startsWith(home)) return `~${input.slice(home.length)}`;
	return input;
}

function cleanText(text: string | undefined, fallback: string): string {
	const cleaned = (text ?? "").replace(/[\x00-\x1f\x7f]/g, " ").replace(/\s+/g, " ").trim();
	return cleaned || fallback;
}

function isSameSessionPath(a: string | undefined, b: string | undefined): boolean {
	if (!a || !b) return false;
	return a === b;
}

function filteredSessions(): SessionInfo[] {
	const filtered = recent.nameFilter === "named"
		? recent.sessions.filter((session) => !!session.name)
		: [...recent.sessions];

	filtered.sort((a, b) => {
		if (recent.sortMode === "name") {
			const an = (a.name ?? a.firstMessage ?? "").toLowerCase();
			const bn = (b.name ?? b.firstMessage ?? "").toLowerCase();
			return an.localeCompare(bn) || b.modified.getTime() - a.modified.getTime();
		}
		if (recent.sortMode === "messages") {
			return b.messageCount - a.messageCount || b.modified.getTime() - a.modified.getTime();
		}
		return b.modified.getTime() - a.modified.getTime();
	});

	return filtered;
}

function clampScroll(): void {
	const sessions = filteredSessions();
	const maxOffset = Math.max(0, sessions.length - Math.max(1, recent.visibleCount));
	recent.scrollOffset = Math.max(0, Math.min(recent.scrollOffset, maxOffset));
}

function cycleSortMode(): void {
	recent.sortMode = recent.sortMode === "recent" ? "name" : recent.sortMode === "name" ? "messages" : "recent";
	recent.scrollOffset = 0;
	requestRender();
}

function page(delta: number): void {
	clampScroll();
	const step = Math.max(1, recent.visibleCount);
	recent.scrollOffset += delta * step;
	clampScroll();
	requestRender();
}

function closeRecentOverlay(): void {
	recent.handle?.hide();
	recent.handle = undefined;
	recent.visible = false;
	recent.row = 0;
	recent.col = 0;
	recent.width = 0;
	recent.height = 0;
	recent.hits = [];
	recent.drag = undefined;
	recent.ctx = undefined;
	queueLog("recent overlay hidden");
}

export function hideRecentOverlay(): void {
	closeRecentOverlay();
}

async function loadRecentSessions(): Promise<void> {
	const ctx = recent.ctx;
	if (!ctx) return;
	recent.loading = true;
	recent.loadProgress = undefined;
	recent.status = undefined;
	requestRender();
	try {
		const onProgress = (loaded: number, total: number) => {
			recent.loadProgress = { loaded, total };
			requestRender();
		};
		recent.sessions = recent.scope === "current"
			? await SessionManager.list(ctx.sessionManager.getCwd(), ctx.sessionManager.getSessionDir(), onProgress)
			: await SessionManager.listAll(onProgress);
		recent.loading = false;
		recent.loadProgress = undefined;
		recent.scrollOffset = 0;
		clampScroll();
		requestRender();
	} catch (error) {
		recent.loading = false;
		recent.status = `Load failed: ${error instanceof Error ? error.message : String(error)}`;
		queueLog(`recent load failed: ${recent.status}`);
		requestRender();
	}
}

async function selectSession(sessionPath: string): Promise<void> {
	const ctx = recent.ctx;
	if (!ctx) return;
	if (isSameSessionPath(sessionPath, recent.currentSessionPath)) {
		notify("phone-shell: already on that session", "info");
		return;
	}
	setLastAction("recent:resume");
	closeRecentOverlay();
	try {
		const result = await ctx.switchSession(sessionPath);
		if (result.cancelled) notify("phone-shell: resume cancelled", "info");
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		notify(`phone-shell: resume failed: ${message}`, "error");
		queueLog(`recent resume failed: ${message}`);
	}
}

function activateControl(action: RecentControlAction): void {
	setLastAction(`recent:${action}`);
	switch (action) {
		case "scope-current":
			if (recent.scope !== "current") {
				recent.scope = "current";
				void loadRecentSessions();
			}
			return;
		case "scope-all":
			if (recent.scope !== "all") {
				recent.scope = "all";
				void loadRecentSessions();
			}
			return;
		case "toggle-named":
			recent.nameFilter = recent.nameFilter === "all" ? "named" : "all";
			recent.scrollOffset = 0;
			requestRender();
			return;
		case "toggle-sort":
			cycleSortMode();
			return;
		case "page-up":
			page(-1);
			return;
		case "page-down":
			page(1);
			return;
		case "top":
			recent.scrollOffset = 0;
			requestRender();
			return;
		case "bottom": {
			const sessions = filteredSessions();
			recent.scrollOffset = Math.max(0, sessions.length - Math.max(1, recent.visibleCount));
			requestRender();
			return;
		}
		case "close":
			closeRecentOverlay();
			return;
	}
}

function findRecentHit(rowOffset: number, col: number): RecentHitRegion | undefined {
	return recent.hits.find((hit) => hit.rowOffset === rowOffset && col >= hit.colStart && col <= hit.colEnd);
}

function addControlHit(action: RecentControlAction, rowOffset: number, colStart: number, colEnd: number): void {
	recent.hits.push({ kind: "control", action, rowOffset, colStart, colEnd });
}

function addSessionHit(sessionPath: string, rowStart: number, height: number): void {
	for (let row = rowStart; row < rowStart + height; row++) {
		recent.hits.push({ kind: "session", sessionPath, rowOffset: row, colStart: recent.col, colEnd: recent.col + recent.width - 1 });
	}
}

function styledPill(label: string, active: boolean): string {
	const theme = state.session.theme;
	if (!theme) return `[${label}]`;
	const color = active ? "accent" : "muted";
	return theme.fg(color, `[${label}]`);
}

function renderToolbar(innerWidth: number, rowOffset: number): string {
	const compact = innerWidth < 42;
	const controls: Array<{ action: RecentControlAction; label: string; active: boolean }> = [
		{ action: "scope-current", label: compact ? `CUR${recent.scope === "current" ? "●" : "○"}` : `CUR ${recent.scope === "current" ? "●" : "○"}`, active: recent.scope === "current" },
		{ action: "scope-all", label: compact ? `ALL${recent.scope === "all" ? "●" : "○"}` : `ALL ${recent.scope === "all" ? "●" : "○"}`, active: recent.scope === "all" },
		{ action: "toggle-named", label: compact ? `NAM${recent.nameFilter === "named" ? "●" : "○"}` : `NAMED ${recent.nameFilter === "named" ? "●" : "○"}`, active: recent.nameFilter === "named" },
		{ action: "toggle-sort", label: compact ? recent.sortMode.toUpperCase().slice(0, 3) : `SORT ${recent.sortMode}`, active: true },
	];

	let content = "";
	for (const control of controls) {
		const raw = `[${control.label}]`;
		const separator = content ? " " : "";
		if (visibleWidth(content) + visibleWidth(separator) + visibleWidth(raw) > innerWidth) break;
		content += separator;
		const start = visibleWidth(content);
		content += styledPill(control.label, control.active);
		addControlHit(control.action, rowOffset, recent.col + 1 + start, recent.col + 1 + start + visibleWidth(raw) - 1);
	}
	return content;
}

function renderFooter(innerWidth: number, rowOffset: number, shownStart: number, shownEnd: number, total: number): string {
	const theme = state.session.theme;
	const info = total === 0 ? "0/0" : `${shownStart + 1}-${shownEnd}/${total}`;
	const compact = innerWidth < 42;
	const controls: Array<{ action: RecentControlAction; label: string; active: boolean }> = compact
		? [
			{ action: "page-up", label: "PG↑", active: true },
			{ action: "page-down", label: "PG↓", active: true },
			{ action: "close", label: "X", active: false },
		]
		: [
			{ action: "top", label: "TOP", active: true },
			{ action: "page-up", label: "PG↑", active: true },
			{ action: "page-down", label: "PG↓", active: true },
			{ action: "bottom", label: "BTM", active: true },
			{ action: "close", label: "CLOSE", active: false },
		];

	let content = theme ? theme.fg("dim", info) : info;
	for (const control of controls) {
		const raw = `[${control.label}]`;
		const separator = " ";
		if (visibleWidth(content) + visibleWidth(separator) + visibleWidth(raw) > innerWidth) break;
		content += separator;
		const start = visibleWidth(content);
		content += styledPill(control.label, control.active);
		addControlHit(control.action, rowOffset, recent.col + 1 + start, recent.col + 1 + start + visibleWidth(raw) - 1);
	}
	return content;
}

function boxLine(content: string, width: number): string {
	const theme = state.session.theme;
	const innerWidth = Math.max(0, width - 2);
	const padded = truncateToWidth(content, innerWidth, "", true);
	const pad = Math.max(0, innerWidth - visibleWidth(padded));
	const line = `${theme?.fg("accent", "│") ?? "│"}${padded}${" ".repeat(pad)}${theme?.fg("accent", "│") ?? "│"}`;
	return padLineToWidth(line, width);
}

function border(kind: "top" | "middle" | "bottom", width: number): string {
	const theme = state.session.theme;
	const innerWidth = Math.max(0, width - 2);
	const chars = kind === "top" ? ["╭", "╮"] : kind === "bottom" ? ["╰", "╯"] : ["├", "┤"];
	return padLineToWidth(theme?.fg("accent", `${chars[0]}${"─".repeat(innerWidth)}${chars[1]}`) ?? `${chars[0]}${"─".repeat(innerWidth)}${chars[1]}`, width);
}

class RecentOverlayComponent implements Component {
	render(width: number): string[] {
		const theme = state.session.theme;
		const terminalRows = state.session.tui?.terminal.rows ?? 24;
		const maxHeight = Math.max(6, terminalRows - recent.row + 1);
		const renderWidth = Math.max(20, width);
		const innerWidth = Math.max(0, renderWidth - 2);
		const lines: string[] = [];
		recent.hits = [];

		const title = theme?.bold(theme.fg("accent", " pi phone /recent ")) ?? " pi phone /recent ";
		lines.push(border("top", renderWidth));
		lines.push(boxLine(renderToolbar(innerWidth, lines.length), renderWidth));
		lines.push(border("middle", renderWidth));

		const reservedFooterLines = 3;
		const availableForCards = Math.max(1, maxHeight - lines.length - reservedFooterLines);
		const cardHeight = 3;
		recent.visibleCount = Math.max(1, Math.floor(availableForCards / cardHeight));
		const sessions = filteredSessions();
		clampScroll();
		const visible = sessions.slice(recent.scrollOffset, recent.scrollOffset + recent.visibleCount);

		if (recent.loading) {
			const progress = recent.loadProgress ? ` ${recent.loadProgress.loaded}/${recent.loadProgress.total}` : "";
			lines.push(boxLine(` Loading sessions${progress}…`, renderWidth));
			while (lines.length < maxHeight - reservedFooterLines) lines.push(boxLine("", renderWidth));
		} else if (recent.status) {
			lines.push(boxLine(` ${recent.status}`, renderWidth));
		} else if (sessions.length === 0) {
			const empty = recent.nameFilter === "named" ? " No named recent sessions" : " No recent sessions";
			lines.push(boxLine(empty, renderWidth));
		} else {
			for (const [i, session] of visible.entries()) {
				const absoluteIndex = recent.scrollOffset + i;
				const rowStart = lines.length;
				const isCurrent = isSameSessionPath(session.path, recent.currentSessionPath);
				const titleText = cleanText(session.name ?? session.firstMessage, "Untitled session");
				const prefix = `${absoluteIndex + 1}. `;
				const displayTitle = truncateToWidth(prefix + titleText, innerWidth - 2, "…");
				const styledTitle = isCurrent && theme ? theme.fg("accent", displayTitle) : session.name && theme ? theme.fg("warning", displayTitle) : displayTitle;
				const cwd = recent.scope === "all" ? `${shortenPath(session.cwd)} · ` : "";
				const meta = truncateToWidth(`   ${cwd}${session.messageCount} msgs · ${formatAge(session.modified)}`, innerWidth - 1, "…");
				lines.push(boxLine(` ${styledTitle}`, renderWidth));
				lines.push(boxLine(meta, renderWidth));
				lines.push(border("middle", renderWidth));
				addSessionHit(session.path, rowStart, cardHeight);
			}
		}

		const shownStart = sessions.length === 0 ? 0 : recent.scrollOffset;
		const shownEnd = sessions.length === 0 ? 0 : Math.min(sessions.length, recent.scrollOffset + visible.length);
		lines.push(boxLine(renderFooter(innerWidth, lines.length, shownStart, shownEnd, sessions.length), renderWidth));
		lines.push(border("bottom", renderWidth));

		// Overlay title is intentionally subtle: put it in the top border's inner area when there is room.
		if (visibleWidth(title) + 4 < renderWidth) {
			const titleWidth = visibleWidth(title);
			const left = Math.max(1, Math.floor((renderWidth - titleWidth) / 2));
			const rawTop = lines[0]!;
			// Keep this simple and width-safe: replace visible cells by rebuilding the line.
			const innerLeft = "─".repeat(Math.max(0, left - 1));
			const innerRight = "─".repeat(Math.max(0, renderWidth - left - titleWidth - 1));
			lines[0] = padLineToWidth(`${theme?.fg("accent", "╭") ?? "╭"}${theme?.fg("accent", innerLeft) ?? innerLeft}${title}${theme?.fg("accent", innerRight) ?? innerRight}${theme?.fg("accent", "╮") ?? "╮"}`, renderWidth);
			void rawTop;
		}

		recent.width = renderWidth;
		recent.height = lines.length;
		return lines.map((line) => padLineToWidth(line, renderWidth));
	}

	invalidate(): void {}
}

export function showRecentOverlay(ctx: ExtensionCommandContext): void {
	if (!state.session.tui) {
		notify("phone-shell: /recent needs phone-shell mode enabled", "warning");
		return;
	}
	if (recent.visible) {
		closeRecentOverlay();
		return;
	}
	for (const kind of ["utility", "view", "skills", "prompts", "models", "allModels"] as const) hideDropdown(kind);

	const terminalCols = state.session.tui.terminal.columns;
	const terminalRows = state.session.tui.terminal.rows;
	recent.row = state.shell.headerInstalled && terminalRows >= 14 ? HEADER_HEIGHT + 1 : 1;
	recent.col = terminalCols <= 42 ? 1 : 2;
	recent.width = Math.max(20, terminalCols - (recent.col === 1 ? 0 : 2));
	recent.scope = "current";
	recent.nameFilter = "all";
	recent.sortMode = "recent";
	recent.sessions = [];
	recent.scrollOffset = 0;
	recent.visibleCount = 0;
	recent.status = undefined;
	recent.ctx = ctx;
	recent.currentSessionPath = ctx.sessionManager.getSessionFile() ?? undefined;

	recent.handle = state.session.tui.showOverlay(new RecentOverlayComponent(), {
		anchor: "top-left",
		row: recent.row,
		col: recent.col,
		width: recent.width,
		maxHeight: Math.max(6, terminalRows - recent.row + 1),
		nonCapturing: true,
	});
	recent.visible = true;
	queueLog("recent overlay shown");
	void loadRecentSessions();
}

function scrollByRows(deltaRows: number): void {
	if (deltaRows === 0) return;
	recent.scrollOffset += deltaRows;
	clampScroll();
	requestRender();
}

export function handleRecentOverlayMouse(mouse: MouseInput): InputResponse {
	if (!recent.visible) return undefined;

	const rowOffset = mouse.row - recent.row;
	const inside = rowOffset >= 0 && rowOffset < recent.height && mouse.col >= recent.col && mouse.col < recent.col + recent.width;
	if (!inside) {
		if (isPrimaryPointerPress(mouse)) closeRecentOverlay();
		return { consume: true };
	}

	if (mouse.phase === "scroll") {
		if (mouse.scrollDirection === "up") scrollByRows(-1);
		else if (mouse.scrollDirection === "down") scrollByRows(1);
		return { consume: true };
	}

	if (recent.drag && mouse.phase === "release") {
		const drag = recent.drag;
		recent.drag = undefined;
		if (drag.phase === "potential-tap") {
			const hit = findRecentHit(drag.tapRow - recent.row, drag.tapCol);
			if (hit?.kind === "control") activateControl(hit.action);
			else if (hit?.kind === "session") void selectSession(hit.sessionPath);
		}
		return { consume: true };
	}

	if (recent.drag && isPrimaryPointerDrag(mouse)) {
		const delta = mouse.row - recent.drag.anchorRow;
		if (Math.abs(delta) > 1) recent.drag.phase = "dragging";
		if (recent.drag.phase === "dragging") {
			recent.scrollOffset = recent.drag.anchorScrollOffset - delta;
			clampScroll();
			requestRender();
		}
		return { consume: true };
	}

	if (isPrimaryPointerPress(mouse)) {
		recent.drag = {
			anchorRow: mouse.row,
			anchorScrollOffset: recent.scrollOffset,
			phase: "potential-tap",
			tapRow: mouse.row,
			tapCol: mouse.col,
		};
		return { consume: true };
	}

	return { consume: true };
}

export function handleRecentOverlayKey(data: string): InputResponse {
	if (!recent.visible) return undefined;
	if (matchesKey(data, Key.escape) || matchesKey(data, Key.ctrl("c"))) {
		closeRecentOverlay();
		return { consume: true };
	}
	if (matchesKey(data, Key.pageUp) || matchesKey(data, Key.left)) {
		page(-1);
		return { consume: true };
	}
	if (matchesKey(data, Key.pageDown) || matchesKey(data, Key.right)) {
		page(1);
		return { consume: true };
	}
	if (matchesKey(data, Key.up)) {
		scrollByRows(-1);
		return { consume: true };
	}
	if (matchesKey(data, Key.down)) {
		scrollByRows(1);
		return { consume: true };
	}
	if (matchesKey(data, Key.home)) {
		recent.scrollOffset = 0;
		requestRender();
		return { consume: true };
	}
	if (matchesKey(data, Key.end)) {
		activateControl("bottom");
		return { consume: true };
	}
	return { consume: true };
}
