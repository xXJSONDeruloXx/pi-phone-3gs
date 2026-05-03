import type { ExtensionCommandContext, SessionEntry } from "@mariozechner/pi-coding-agent";
import type { Component, OverlayHandle } from "@mariozechner/pi-tui";
import { Key, matchesKey, truncateToWidth, visibleWidth } from "@mariozechner/pi-tui";
import { HEADER_HEIGHT } from "./defaults.js";
import { hideDropdown } from "./dropdowns.js";
import { hideRecentOverlay } from "./recent.js";
import { padLineToWidth } from "./button-helpers.js";
import { isPrimaryPointerDrag, isPrimaryPointerPress, type InputResponse } from "./mouse.js";
import { queueLog, setLastAction, state } from "./state.js";
import type { MouseInput } from "./types.js";

type TreeFilterMode = "all" | "user" | "labeled";
type TreeSortMode = "newest" | "tree";
type TreeSummaryMode = "none" | "summary";
type TreeControlAction =
	| "filter-all"
	| "filter-user"
	| "filter-labeled"
	| "toggle-sort"
	| "toggle-summary"
	| "page-up"
	| "page-down"
	| "top"
	| "bottom"
	| "close";

interface SessionTreeNode {
	entry: SessionEntry;
	children: SessionTreeNode[];
	label?: string;
	labelTimestamp?: string;
}

type TreeHitRegion =
	| { kind: "control"; action: TreeControlAction; rowOffset: number; colStart: number; colEnd: number }
	| { kind: "entry"; entryId: string; rowOffset: number; colStart: number; colEnd: number };

interface FlatTreeNode {
	node: SessionTreeNode;
	depth: number;
	isOnActiveBranch: boolean;
	isLeaf: boolean;
}

interface TreeDragState {
	anchorRow: number;
	anchorScrollOffset: number;
	phase: "potential-tap" | "dragging";
	tapRow: number;
	tapCol: number;
}

interface PhoneTreeOverlayState {
	handle?: OverlayHandle;
	visible: boolean;
	row: number;
	col: number;
	width: number;
	height: number;
	filterMode: TreeFilterMode;
	sortMode: TreeSortMode;
	summaryMode: TreeSummaryMode;
	tree: SessionTreeNode[];
	branchIds: Set<string>;
	leafId?: string | null;
	scrollOffset: number;
	visibleCount: number;
	hits: TreeHitRegion[];
	drag?: TreeDragState;
	ctx?: ExtensionCommandContext;
	status?: string;
}

const treeOverlay: PhoneTreeOverlayState = {
	visible: false,
	row: 0,
	col: 0,
	width: 0,
	height: 0,
	filterMode: "all",
	sortMode: "newest",
	summaryMode: "none",
	tree: [],
	branchIds: new Set(),
	leafId: undefined,
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

function cleanText(text: string | undefined, fallback: string): string {
	const cleaned = (text ?? "").replace(/[\x00-\x1f\x7f]/g, " ").replace(/\s+/g, " ").trim();
	return cleaned || fallback;
}

function textFromContent(content: unknown): string {
	if (typeof content === "string") return content;
	if (!Array.isArray(content)) return "";
	return content
		.map((part) => {
			if (part && typeof part === "object" && "text" in part && typeof (part as { text?: unknown }).text === "string") {
				return (part as { text: string }).text;
			}
			if (part && typeof part === "object" && "type" in part && (part as { type?: unknown }).type === "image") return "[image]";
			return "";
		})
		.join(" ");
}

function entryKind(entry: SessionEntry): string {
	if (entry.type === "message") return entry.message.role;
	if (entry.type === "custom_message") return entry.customType;
	return entry.type;
}

function entryPreview(entry: SessionEntry): string {
	if (entry.type === "message") {
		const message = entry.message as { role: string; content?: unknown; text?: string; summary?: string; command?: string; output?: string; toolName?: string };
		if (message.role === "user" || message.role === "assistant") return cleanText(textFromContent(message.content), `${message.role} message`);
		if (message.role === "toolResult") return cleanText(`${message.toolName ?? "tool"}: ${textFromContent(message.content)}`, "tool result");
		if (message.role === "bashExecution") return cleanText(message.command, "bash execution");
		if (message.role === "branchSummary" || message.role === "compactionSummary") return cleanText(message.summary, message.role);
		return cleanText(textFromContent(message.content) || message.text || message.output, message.role);
	}
	if (entry.type === "custom_message") return cleanText(textFromContent(entry.content), entry.customType);
	if (entry.type === "compaction") return cleanText(entry.summary, "compaction summary");
	if (entry.type === "branch_summary") return cleanText(entry.summary, "branch summary");
	if (entry.type === "model_change") return `${entry.provider}/${entry.modelId}`;
	if (entry.type === "thinking_level_change") return `thinking: ${entry.thinkingLevel}`;
	if (entry.type === "custom") return `custom: ${entry.customType}`;
	if (entry.type === "label") return `label: ${entry.label ?? "cleared"}`;
	if (entry.type === "session_info") return `session: ${entry.name ?? "unnamed"}`;
	return "entry";
}

function formatAge(timestamp: string): string {
	const date = new Date(timestamp);
	if (Number.isNaN(date.getTime())) return "";
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

function isNavigableNode(node: SessionTreeNode): boolean {
	const entry = node.entry;
	if (entry.type === "label" || entry.type === "session_info" || entry.type === "custom") return false;
	if (entry.type === "message" && entry.message.role === "toolResult") return false;
	return true;
}

function matchesFilter(item: FlatTreeNode): boolean {
	const entry = item.node.entry;
	if (!isNavigableNode(item.node)) return false;
	if (treeOverlay.filterMode === "labeled") return !!item.node.label;
	if (treeOverlay.filterMode === "user") {
		return (entry.type === "message" && entry.message.role === "user") || entry.type === "custom_message";
	}
	return true;
}

function flattenTree(): FlatTreeNode[] {
	const result: FlatTreeNode[] = [];
	const walk = (nodes: SessionTreeNode[], depth: number) => {
		for (const node of nodes) {
			const item: FlatTreeNode = {
				node,
				depth,
				isOnActiveBranch: treeOverlay.branchIds.has(node.entry.id),
				isLeaf: node.entry.id === treeOverlay.leafId,
			};
			if (matchesFilter(item)) result.push(item);
			walk(node.children, depth + 1);
		}
	};
	walk(treeOverlay.tree, 0);
	if (treeOverlay.sortMode === "newest") {
		result.sort((a, b) => new Date(b.node.entry.timestamp).getTime() - new Date(a.node.entry.timestamp).getTime());
	}
	return result;
}

function clampScroll(): void {
	const items = flattenTree();
	const maxOffset = Math.max(0, items.length - Math.max(1, treeOverlay.visibleCount));
	treeOverlay.scrollOffset = Math.max(0, Math.min(treeOverlay.scrollOffset, maxOffset));
}

function closePhoneTreeOverlay(): void {
	treeOverlay.handle?.hide();
	treeOverlay.handle = undefined;
	treeOverlay.visible = false;
	treeOverlay.row = 0;
	treeOverlay.col = 0;
	treeOverlay.width = 0;
	treeOverlay.height = 0;
	treeOverlay.hits = [];
	treeOverlay.drag = undefined;
	treeOverlay.ctx = undefined;
	queueLog("phone-tree overlay hidden");
}

export function hidePhoneTreeOverlay(): void {
	closePhoneTreeOverlay();
}

function addControlHit(action: TreeControlAction, rowOffset: number, colStart: number, colEnd: number): void {
	treeOverlay.hits.push({ kind: "control", action, rowOffset, colStart, colEnd });
}

function addEntryHit(entryId: string, rowStart: number, height: number): void {
	for (let row = rowStart; row < rowStart + height; row++) {
		treeOverlay.hits.push({ kind: "entry", entryId, rowOffset: row, colStart: treeOverlay.col, colEnd: treeOverlay.col + treeOverlay.width - 1 });
	}
}

function findTreeHit(rowOffset: number, col: number): TreeHitRegion | undefined {
	return treeOverlay.hits.find((hit) => hit.rowOffset === rowOffset && col >= hit.colStart && col <= hit.colEnd);
}

function page(delta: number): void {
	clampScroll();
	const step = Math.max(1, treeOverlay.visibleCount);
	treeOverlay.scrollOffset += delta * step;
	clampScroll();
	requestRender();
}

function scrollByRows(deltaRows: number): void {
	if (deltaRows === 0) return;
	treeOverlay.scrollOffset += deltaRows;
	clampScroll();
	requestRender();
}

function activateControl(action: TreeControlAction): void {
	setLastAction(`ptree:${action}`);
	switch (action) {
		case "filter-all":
			treeOverlay.filterMode = "all";
			treeOverlay.scrollOffset = 0;
			requestRender();
			return;
		case "filter-user":
			treeOverlay.filterMode = "user";
			treeOverlay.scrollOffset = 0;
			requestRender();
			return;
		case "filter-labeled":
			treeOverlay.filterMode = "labeled";
			treeOverlay.scrollOffset = 0;
			requestRender();
			return;
		case "toggle-sort":
			treeOverlay.sortMode = treeOverlay.sortMode === "newest" ? "tree" : "newest";
			treeOverlay.scrollOffset = 0;
			requestRender();
			return;
		case "toggle-summary":
			treeOverlay.summaryMode = treeOverlay.summaryMode === "none" ? "summary" : "none";
			requestRender();
			return;
		case "page-up":
			page(-1);
			return;
		case "page-down":
			page(1);
			return;
		case "top":
			treeOverlay.scrollOffset = 0;
			requestRender();
			return;
		case "bottom": {
			const items = flattenTree();
			treeOverlay.scrollOffset = Math.max(0, items.length - Math.max(1, treeOverlay.visibleCount));
			requestRender();
			return;
		}
		case "close":
			closePhoneTreeOverlay();
			return;
	}
}

async function selectEntry(entryId: string): Promise<void> {
	const ctx = treeOverlay.ctx;
	if (!ctx) return;
	if (entryId === treeOverlay.leafId) {
		notify("phone-shell: already at this point", "info");
		return;
	}
	setLastAction("ptree:navigate");
	closePhoneTreeOverlay();
	try {
		if (treeOverlay.summaryMode === "summary") notify("phone-shell: summarizing branch…", "info");
		const result = await ctx.navigateTree(entryId, { summarize: treeOverlay.summaryMode === "summary" });
		if (result.cancelled) notify("phone-shell: tree navigation cancelled", "info");
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		notify(`phone-shell: tree navigation failed: ${message}`, "error");
		queueLog(`phone-tree navigate failed: ${message}`);
	}
}

function styledPill(label: string, active: boolean): string {
	const theme = state.session.theme;
	const color = active ? "accent" : "muted";
	return theme?.fg(color, `[${label}]`) ?? `[${label}]`;
}

function entryColor(entry: SessionEntry): "accent" | "warning" | "muted" | "dim" | "success" {
	if (entry.type === "message") {
		if (entry.message.role === "user") return "warning";
		if (entry.message.role === "assistant") return "success";
		return "muted";
	}
	if (entry.type === "custom_message") return "warning";
	if (entry.type === "compaction" || entry.type === "branch_summary") return "accent";
	return "dim";
}

function styleEntryTitle(item: FlatTreeNode, title: string): string {
	const theme = state.session.theme;
	if (!theme) return title;
	const colored = theme.fg(item.node.label ? "warning" : entryColor(item.node.entry), title);
	if (item.isLeaf) return theme.bold(theme.fg("accent", title));
	return item.isOnActiveBranch ? theme.bold(colored) : colored;
}

function renderToolbar(innerWidth: number, rowOffset: number): string {
	const compact = innerWidth < 42;
	const controls: Array<{ action: TreeControlAction; label: string; active: boolean }> = [
		{ action: "filter-all", label: compact ? `ALL${treeOverlay.filterMode === "all" ? "●" : "○"}` : `ALL ${treeOverlay.filterMode === "all" ? "●" : "○"}`, active: treeOverlay.filterMode === "all" },
		{ action: "filter-user", label: compact ? `USR${treeOverlay.filterMode === "user" ? "●" : "○"}` : `USER ${treeOverlay.filterMode === "user" ? "●" : "○"}`, active: treeOverlay.filterMode === "user" },
		{ action: "filter-labeled", label: compact ? `LBL${treeOverlay.filterMode === "labeled" ? "●" : "○"}` : `LABEL ${treeOverlay.filterMode === "labeled" ? "●" : "○"}`, active: treeOverlay.filterMode === "labeled" },
		{ action: "toggle-sort", label: compact ? (treeOverlay.sortMode === "newest" ? "NEW" : "TREE") : `SORT ${treeOverlay.sortMode === "newest" ? "new" : "tree"}`, active: treeOverlay.sortMode === "newest" },
		{ action: "toggle-summary", label: compact ? (treeOverlay.summaryMode === "summary" ? "SUM●" : "SUM○") : `SUM ${treeOverlay.summaryMode === "summary" ? "yes" : "no"}`, active: treeOverlay.summaryMode === "summary" },
	];

	let content = "";
	for (const control of controls) {
		const raw = `[${control.label}]`;
		const separator = content ? " " : "";
		if (visibleWidth(content) + visibleWidth(separator) + visibleWidth(raw) > innerWidth) break;
		content += separator;
		const start = visibleWidth(content);
		content += styledPill(control.label, control.active);
		addControlHit(control.action, rowOffset, treeOverlay.col + 1 + start, treeOverlay.col + 1 + start + visibleWidth(raw) - 1);
	}
	return content;
}

function renderFooter(innerWidth: number, rowOffset: number, shownStart: number, shownEnd: number, total: number): string {
	const theme = state.session.theme;
	const info = total === 0 ? "0/0" : `${shownStart + 1}-${shownEnd}/${total}`;
	const compact = innerWidth < 42;
	const controls: Array<{ action: TreeControlAction; label: string; active: boolean }> = compact
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
		addControlHit(control.action, rowOffset, treeOverlay.col + 1 + start, treeOverlay.col + 1 + start + visibleWidth(raw) - 1);
	}
	return content;
}

function boxLine(content: string, width: number): string {
	const theme = state.session.theme;
	const innerWidth = Math.max(0, width - 2);
	const padded = truncateToWidth(content, innerWidth, "", true);
	const pad = Math.max(0, innerWidth - visibleWidth(padded));
	return padLineToWidth(`${theme?.fg("accent", "│") ?? "│"}${padded}${" ".repeat(pad)}${theme?.fg("accent", "│") ?? "│"}`, width);
}

function border(kind: "top" | "middle" | "bottom", width: number): string {
	const theme = state.session.theme;
	const innerWidth = Math.max(0, width - 2);
	const chars = kind === "top" ? ["╭", "╮"] : kind === "bottom" ? ["╰", "╯"] : ["├", "┤"];
	return padLineToWidth(theme?.fg("accent", `${chars[0]}${"─".repeat(innerWidth)}${chars[1]}`) ?? `${chars[0]}${"─".repeat(innerWidth)}${chars[1]}`, width);
}

class PhoneTreeOverlayComponent implements Component {
	render(width: number): string[] {
		const theme = state.session.theme;
		const terminalRows = state.session.tui?.terminal.rows ?? 24;
		const maxHeight = Math.max(6, terminalRows - treeOverlay.row + 1);
		const renderWidth = Math.max(20, width);
		const innerWidth = Math.max(0, renderWidth - 2);
		const lines: string[] = [];
		treeOverlay.hits = [];

		lines.push(border("top", renderWidth));
		lines.push(boxLine(renderToolbar(innerWidth, lines.length), renderWidth));
		lines.push(border("middle", renderWidth));

		const reservedFooterLines = 3;
		const availableForCards = Math.max(1, maxHeight - lines.length - reservedFooterLines);
		const cardHeight = 3;
		treeOverlay.visibleCount = Math.max(1, Math.floor(availableForCards / cardHeight));
		const items = flattenTree();
		clampScroll();
		const visible = items.slice(treeOverlay.scrollOffset, treeOverlay.scrollOffset + treeOverlay.visibleCount);

		if (treeOverlay.status) {
			lines.push(boxLine(` ${treeOverlay.status}`, renderWidth));
		} else if (items.length === 0) {
			lines.push(boxLine(" No matching tree entries", renderWidth));
		} else {
			for (const [i, item] of visible.entries()) {
				const absoluteIndex = treeOverlay.scrollOffset + i;
				const entry = item.node.entry;
				const rowStart = lines.length;
				const depthMarker = item.depth > 0 ? `${"·".repeat(Math.min(item.depth, 6))} ` : "";
				const activeMarker = item.isLeaf ? "●" : item.isOnActiveBranch ? "•" : " ";
				const kind = entryKind(entry);
				const label = item.node.label ? ` #${item.node.label}` : "";
				const preview = entryPreview(entry);
				const title = truncateToWidth(`${activeMarker} ${absoluteIndex + 1}. ${depthMarker}${kind}:${label} ${preview}`, innerWidth - 1, "…");
				const styledTitle = styleEntryTitle(item, title);
				const meta = truncateToWidth(`   ${item.node.children.length} child${item.node.children.length === 1 ? "" : "ren"} · ${formatAge(entry.timestamp)} · ${entry.id.slice(0, 8)}`, innerWidth - 1, "…");
				const styledMeta = theme ? theme.fg(item.isOnActiveBranch ? "accent" : "dim", meta) : meta;
				lines.push(boxLine(` ${styledTitle}`, renderWidth));
				lines.push(boxLine(styledMeta, renderWidth));
				lines.push(border("middle", renderWidth));
				addEntryHit(entry.id, rowStart, cardHeight);
			}
		}

		const shownStart = items.length === 0 ? 0 : treeOverlay.scrollOffset;
		const shownEnd = items.length === 0 ? 0 : Math.min(items.length, treeOverlay.scrollOffset + visible.length);
		lines.push(boxLine(renderFooter(innerWidth, lines.length, shownStart, shownEnd, items.length), renderWidth));
		lines.push(border("bottom", renderWidth));

		const title = theme?.bold(theme.fg("accent", " pi phone /ptree ")) ?? " pi phone /ptree ";
		if (visibleWidth(title) + 4 < renderWidth) {
			const titleWidth = visibleWidth(title);
			const left = Math.max(1, Math.floor((renderWidth - titleWidth) / 2));
			const innerLeft = "─".repeat(Math.max(0, left - 1));
			const innerRight = "─".repeat(Math.max(0, renderWidth - left - titleWidth - 1));
			lines[0] = padLineToWidth(`${theme?.fg("accent", "╭") ?? "╭"}${theme?.fg("accent", innerLeft) ?? innerLeft}${title}${theme?.fg("accent", innerRight) ?? innerRight}${theme?.fg("accent", "╮") ?? "╮"}`, renderWidth);
		}

		treeOverlay.width = renderWidth;
		treeOverlay.height = lines.length;
		return lines.map((line) => padLineToWidth(line, renderWidth));
	}

	invalidate(): void {}
}

export function showPhoneTreeOverlay(ctx: ExtensionCommandContext): void {
	if (!state.session.tui) {
		notify("phone-shell: /ptree needs phone-shell mode enabled", "warning");
		return;
	}
	if (treeOverlay.visible) {
		closePhoneTreeOverlay();
		return;
	}
	for (const kind of ["utility", "view", "skills", "prompts", "models", "allModels"] as const) hideDropdown(kind);
	hideRecentOverlay();

	const tree = ctx.sessionManager.getTree();
	if (tree.length === 0) {
		notify("phone-shell: no entries in session", "info");
		return;
	}
	const terminalCols = state.session.tui.terminal.columns;
	const terminalRows = state.session.tui.terminal.rows;
	treeOverlay.row = state.shell.headerInstalled && terminalRows >= 14 ? HEADER_HEIGHT + 1 : 1;
	treeOverlay.col = terminalCols <= 42 ? 1 : 2;
	treeOverlay.width = Math.max(20, terminalCols - (treeOverlay.col === 1 ? 0 : 2));
	treeOverlay.filterMode = "all";
	treeOverlay.sortMode = "newest";
	treeOverlay.summaryMode = "none";
	treeOverlay.tree = tree;
	treeOverlay.leafId = ctx.sessionManager.getLeafId();
	treeOverlay.branchIds = new Set(ctx.sessionManager.getBranch().map((entry) => entry.id));
	treeOverlay.scrollOffset = 0;
	treeOverlay.visibleCount = 0;
	treeOverlay.status = undefined;
	treeOverlay.ctx = ctx;

	// Default sort is newest-first for phone triage; TOP shows the newest navigable entry.

	treeOverlay.handle = state.session.tui.showOverlay(new PhoneTreeOverlayComponent(), {
		anchor: "top-left",
		row: treeOverlay.row,
		col: treeOverlay.col,
		width: treeOverlay.width,
		maxHeight: Math.max(6, terminalRows - treeOverlay.row + 1),
		nonCapturing: true,
	});
	treeOverlay.visible = true;
	queueLog("phone-tree overlay shown");
	requestRender();
}

export function handlePhoneTreeOverlayMouse(mouse: MouseInput): InputResponse {
	if (!treeOverlay.visible) return undefined;

	const rowOffset = mouse.row - treeOverlay.row;
	const inside = rowOffset >= 0 && rowOffset < treeOverlay.height && mouse.col >= treeOverlay.col && mouse.col < treeOverlay.col + treeOverlay.width;
	if (!inside) {
		if (isPrimaryPointerPress(mouse)) closePhoneTreeOverlay();
		return { consume: true };
	}

	if (mouse.phase === "scroll") {
		if (mouse.scrollDirection === "up") scrollByRows(-1);
		else if (mouse.scrollDirection === "down") scrollByRows(1);
		return { consume: true };
	}

	if (treeOverlay.drag && mouse.phase === "release") {
		const drag = treeOverlay.drag;
		treeOverlay.drag = undefined;
		if (drag.phase === "potential-tap") {
			const hit = findTreeHit(drag.tapRow - treeOverlay.row, drag.tapCol);
			if (hit?.kind === "control") activateControl(hit.action);
			else if (hit?.kind === "entry") void selectEntry(hit.entryId);
		}
		return { consume: true };
	}

	if (treeOverlay.drag && isPrimaryPointerDrag(mouse)) {
		const delta = mouse.row - treeOverlay.drag.anchorRow;
		if (Math.abs(delta) > 1) treeOverlay.drag.phase = "dragging";
		if (treeOverlay.drag.phase === "dragging") {
			treeOverlay.scrollOffset = treeOverlay.drag.anchorScrollOffset - delta;
			clampScroll();
			requestRender();
		}
		return { consume: true };
	}

	if (isPrimaryPointerPress(mouse)) {
		treeOverlay.drag = {
			anchorRow: mouse.row,
			anchorScrollOffset: treeOverlay.scrollOffset,
			phase: "potential-tap",
			tapRow: mouse.row,
			tapCol: mouse.col,
		};
		return { consume: true };
	}

	return { consume: true };
}

export function handlePhoneTreeOverlayKey(data: string): InputResponse {
	if (!treeOverlay.visible) return undefined;
	if (matchesKey(data, Key.escape) || matchesKey(data, Key.ctrl("c"))) {
		closePhoneTreeOverlay();
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
		treeOverlay.scrollOffset = 0;
		requestRender();
		return { consume: true };
	}
	if (matchesKey(data, Key.end)) {
		activateControl("bottom");
		return { consume: true };
	}
	return { consume: true };
}
