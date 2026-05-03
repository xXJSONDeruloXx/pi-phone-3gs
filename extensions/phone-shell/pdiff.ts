import type { ExtensionCommandContext } from "@mariozechner/pi-coding-agent";
import type { Component, OverlayHandle } from "@mariozechner/pi-tui";
import { Key, matchesKey, truncateToWidth, visibleWidth, wrapTextWithAnsi } from "@mariozechner/pi-tui";
import { execFile } from "node:child_process";
import { access, readFile, stat } from "node:fs/promises";
import { promisify } from "node:util";
import { HEADER_HEIGHT } from "./defaults.js";
import { hideDropdown } from "./dropdowns.js";
import { hidePhoneTreeOverlay } from "./phone-tree.js";
import { hideRecentOverlay } from "./recent.js";
import { padLineToWidth } from "./button-helpers.js";
import { isPrimaryPointerDrag, isPrimaryPointerPress, type InputResponse } from "./mouse.js";
import { queueLog, setLastAction, state } from "./state.js";
import type { MouseInput } from "./types.js";

const execFileAsync = promisify(execFile);
const MAX_GIT_BUFFER = 20 * 1024 * 1024;
const MAX_UNTRACKED_BYTES = 512 * 1024;

type DiffScope = "worktree" | "staged" | "branch";
type DiffView = "files" | "all" | "file";
type DiffControlAction =
	| "scope-worktree"
	| "scope-staged"
	| "scope-branch"
	| "view-files"
	| "view-all"
	| "toggle-wrap"
	| "refresh"
	| "back"
	| "page-up"
	| "page-down"
	| "top"
	| "bottom"
	| "close";

type DiffHitRegion =
	| { kind: "control"; action: DiffControlAction; rowOffset: number; colStart: number; colEnd: number }
	| { kind: "file"; path: string; rowOffset: number; colStart: number; colEnd: number };

interface DiffFile {
	path: string;
	status: "A" | "M" | "D" | "R" | "?";
	added: number;
	removed: number;
	lines: string[];
}

interface DiffDragState {
	anchorRow: number;
	anchorScrollOffset: number;
	phase: "potential-tap" | "dragging";
	tapRow: number;
	tapCol: number;
}

interface PdiffOverlayState {
	handle?: OverlayHandle;
	visible: boolean;
	row: number;
	col: number;
	width: number;
	height: number;
	scope: DiffScope;
	view: DiffView;
	baseRef?: string;
	cwd?: string;
	loading: boolean;
	status?: string;
	files: DiffFile[];
	allLines: string[];
	selectedPath?: string;
	wrapLines: boolean;
	displayLineCount?: number;
	scrollOffset: number;
	visibleCount: number;
	hits: DiffHitRegion[];
	drag?: DiffDragState;
	ctx?: ExtensionCommandContext;
}

const pdiff: PdiffOverlayState = {
	visible: false,
	row: 0,
	col: 0,
	width: 0,
	height: 0,
	scope: "worktree",
	view: "files",
	loading: false,
	files: [],
	allLines: [],
	wrapLines: false,
	displayLineCount: undefined,
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

async function git(args: string[], cwd: string, allowFailure = false): Promise<string> {
	try {
		const result = await execFileAsync("git", args, { cwd, encoding: "utf8", maxBuffer: MAX_GIT_BUFFER });
		return result.stdout ?? "";
	} catch (error) {
		const err = error as Error & { stdout?: string; stderr?: string; code?: number };
		if (allowFailure && typeof err.stdout === "string") return err.stdout;
		throw new Error((err.stderr || err.message || String(error)).trim());
	}
}

function splitLines(text: string): string[] {
	if (!text) return [];
	return text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n").filter((line, index, lines) => index < lines.length - 1 || line.length > 0);
}

function pathFromDiffHeader(line: string): string | undefined {
	const match = line.match(/^diff --git a\/(.*) b\/(.*)$/);
	if (!match) return undefined;
	return match[2] ?? match[1];
}

function parseUnifiedDiff(diffText: string): DiffFile[] {
	const lines = splitLines(diffText);
	const files: DiffFile[] = [];
	let current: DiffFile | undefined;

	const finish = () => {
		if (current) files.push(current);
		current = undefined;
	};

	for (const line of lines) {
		if (line.startsWith("diff --git ")) {
			finish();
			current = {
				path: pathFromDiffHeader(line) ?? "(unknown)",
				status: "M",
				added: 0,
				removed: 0,
				lines: [line],
			};
			continue;
		}
		if (!current) {
			if (line.trim().length === 0) continue;
			current = { path: "(raw diff)", status: "M", added: 0, removed: 0, lines: [] };
		}
		current.lines.push(line);
		if (line.startsWith("new file mode")) current.status = "A";
		else if (line.startsWith("deleted file mode")) current.status = "D";
		else if (line.startsWith("rename from")) current.status = "R";
		else if (line.startsWith("+++ b/")) current.path = line.slice(6);
		else if (line.startsWith("--- a/") && current.path === "(unknown)") current.path = line.slice(6);
		else if (line.startsWith("+") && !line.startsWith("+++")) current.added += 1;
		else if (line.startsWith("-") && !line.startsWith("---")) current.removed += 1;
	}
	finish();
	return files;
}

function flattenFiles(files: DiffFile[]): string[] {
	return files.flatMap((file, index) => index === 0 ? file.lines : ["", ...file.lines]);
}

async function findBaseRef(cwd: string): Promise<string | undefined> {
	const candidates = ["upstream/main", "upstream/master", "origin/main", "origin/master", "main", "master"];
	for (const candidate of candidates) {
		try {
			await git(["rev-parse", "--verify", "--quiet", `${candidate}^{commit}`], cwd);
			return candidate;
		} catch {
			// Try next candidate.
		}
	}
	return undefined;
}

async function getRepoRoot(cwd: string): Promise<string> {
	return (await git(["rev-parse", "--show-toplevel"], cwd)).trim();
}

async function getUntrackedFiles(cwd: string): Promise<string[]> {
	const raw = await git(["ls-files", "--others", "--exclude-standard", "-z"], cwd);
	return raw.split("\0").filter(Boolean);
}

async function makeUntrackedDiff(root: string, relativePath: string): Promise<DiffFile> {
	const fullPath = `${root}/${relativePath}`;
	let size = 0;
	try {
		size = (await stat(fullPath)).size;
	} catch {
		// Fall through to omitted pseudo-diff.
	}
	const header = [
		`diff --git a/${relativePath} b/${relativePath}`,
		"new file mode 100644",
		"--- /dev/null",
		`+++ b/${relativePath}`,
	];
	if (size > MAX_UNTRACKED_BYTES) {
		return {
			path: relativePath,
			status: "?",
			added: 0,
			removed: 0,
			lines: [...header, `@@ -0,0 +1 @@`, `+Large untracked file omitted (${Math.round(size / 1024)}KB)`],
		};
	}
	try {
		const content = await readFile(fullPath, "utf8");
		const body = splitLines(content).map((line) => `+${line}`);
		return {
			path: relativePath,
			status: "?",
			added: body.length,
			removed: 0,
			lines: [...header, `@@ -0,0 +1,${Math.max(1, body.length)} @@`, ...body],
		};
	} catch {
		return {
			path: relativePath,
			status: "?",
			added: 0,
			removed: 0,
			lines: [...header, `@@ -0,0 +1 @@`, "+Binary or unreadable untracked file omitted"],
		};
	}
}

async function loadDiff(): Promise<void> {
	const cwd = pdiff.cwd;
	if (!cwd) return;
	pdiff.loading = true;
	pdiff.status = undefined;
	requestRender();
	try {
		await access(cwd);
		const root = await getRepoRoot(cwd);
		let diffText = "";
		let files: DiffFile[] = [];
		if (pdiff.scope === "worktree") {
			diffText = await git(["diff", "--no-ext-diff", "--no-color", "--src-prefix=a/", "--dst-prefix=b/"], root, true);
			files = parseUnifiedDiff(diffText);
			const untracked = await getUntrackedFiles(root);
			const untrackedDiffs = await Promise.all(untracked.map((file) => makeUntrackedDiff(root, file)));
			files.push(...untrackedDiffs);
		} else if (pdiff.scope === "staged") {
			diffText = await git(["diff", "--cached", "--no-ext-diff", "--no-color", "--src-prefix=a/", "--dst-prefix=b/"], root, true);
			files = parseUnifiedDiff(diffText);
		} else {
			pdiff.baseRef = await findBaseRef(root);
			if (!pdiff.baseRef) throw new Error("No base ref found (tried upstream/origin/local main/master)");
			diffText = await git(["diff", "--no-ext-diff", "--no-color", "--src-prefix=a/", "--dst-prefix=b/", `${pdiff.baseRef}...HEAD`], root, true);
			files = parseUnifiedDiff(diffText);
		}
		pdiff.files = files;
		pdiff.allLines = flattenFiles(files);
		pdiff.loading = false;
		pdiff.scrollOffset = 0;
		pdiff.selectedPath = undefined;
		if (files.length === 0) pdiff.status = "No diffs for this scope";
		requestRender();
	} catch (error) {
		pdiff.loading = false;
		pdiff.files = [];
		pdiff.allLines = [];
		pdiff.status = error instanceof Error ? error.message : String(error);
		queueLog(`pdiff load failed: ${pdiff.status}`);
		requestRender();
	}
}

function currentLines(): string[] {
	if (pdiff.view === "file") {
		return pdiff.files.find((file) => file.path === pdiff.selectedPath)?.lines ?? [];
	}
	return pdiff.allLines;
}

function currentTotalLines(): number {
	return pdiff.view === "files" ? pdiff.files.length : (pdiff.displayLineCount ?? currentLines().length);
}

function clampScroll(): void {
	const total = currentTotalLines();
	const maxOffset = Math.max(0, total - Math.max(1, pdiff.visibleCount));
	pdiff.scrollOffset = Math.max(0, Math.min(pdiff.scrollOffset, maxOffset));
}

function closePdiffOverlay(): void {
	pdiff.handle?.hide();
	pdiff.handle = undefined;
	pdiff.visible = false;
	pdiff.row = 0;
	pdiff.col = 0;
	pdiff.width = 0;
	pdiff.height = 0;
	pdiff.hits = [];
	pdiff.drag = undefined;
	pdiff.ctx = undefined;
	queueLog("pdiff overlay hidden");
}

export function hidePdiffOverlay(): void {
	closePdiffOverlay();
}

function setScope(scope: DiffScope): void {
	if (pdiff.scope === scope) return;
	pdiff.scope = scope;
	pdiff.view = "files";
	pdiff.scrollOffset = 0;
	void loadDiff();
}

function setView(view: DiffView, selectedPath?: string): void {
	pdiff.view = view;
	pdiff.selectedPath = selectedPath;
	pdiff.displayLineCount = undefined;
	pdiff.scrollOffset = 0;
	requestRender();
}

function page(delta: number): void {
	clampScroll();
	pdiff.scrollOffset += delta * Math.max(1, pdiff.visibleCount);
	clampScroll();
	requestRender();
}

function scrollByRows(deltaRows: number): void {
	if (deltaRows === 0) return;
	pdiff.scrollOffset += deltaRows;
	clampScroll();
	requestRender();
}

function activateControl(action: DiffControlAction): void {
	setLastAction(`pdiff:${action}`);
	switch (action) {
		case "scope-worktree":
			setScope("worktree");
			return;
		case "scope-staged":
			setScope("staged");
			return;
		case "scope-branch":
			setScope("branch");
			return;
		case "view-files":
			setView("files");
			return;
		case "view-all":
			setView("all");
			return;
		case "toggle-wrap":
			pdiff.wrapLines = !pdiff.wrapLines;
			pdiff.displayLineCount = undefined;
			pdiff.scrollOffset = 0;
			requestRender();
			return;
		case "refresh":
			void loadDiff();
			return;
		case "back":
			setView("files");
			return;
		case "page-up":
			page(-1);
			return;
		case "page-down":
			page(1);
			return;
		case "top":
			pdiff.scrollOffset = 0;
			requestRender();
			return;
		case "bottom": {
			const total = currentTotalLines();
			pdiff.scrollOffset = Math.max(0, total - Math.max(1, pdiff.visibleCount));
			requestRender();
			return;
		}
		case "close":
			closePdiffOverlay();
			return;
	}
}

function addControlHit(action: DiffControlAction, rowOffset: number, colStart: number, colEnd: number): void {
	pdiff.hits.push({ kind: "control", action, rowOffset, colStart, colEnd });
}

function addFileHit(path: string, rowStart: number, height: number): void {
	for (let row = rowStart; row < rowStart + height; row++) {
		pdiff.hits.push({ kind: "file", path, rowOffset: row, colStart: pdiff.col, colEnd: pdiff.col + pdiff.width - 1 });
	}
}

function findHit(rowOffset: number, col: number): DiffHitRegion | undefined {
	return pdiff.hits.find((hit) => hit.rowOffset === rowOffset && col >= hit.colStart && col <= hit.colEnd);
}

function styledPill(label: string, active: boolean): string {
	const theme = state.session.theme;
	const color = active ? "accent" : "muted";
	return theme?.fg(color, `[${label}]`) ?? `[${label}]`;
}

function renderToolbar(innerWidth: number, rowOffset: number): string {
	const compact = innerWidth < 46;
	const controls: Array<{ action: DiffControlAction; label: string; active: boolean }> = [
		{ action: "scope-worktree", label: compact ? `WT${pdiff.scope === "worktree" ? "●" : "○"}` : `WT ${pdiff.scope === "worktree" ? "●" : "○"}`, active: pdiff.scope === "worktree" },
		{ action: "scope-staged", label: compact ? `STG${pdiff.scope === "staged" ? "●" : "○"}` : `STAGED ${pdiff.scope === "staged" ? "●" : "○"}`, active: pdiff.scope === "staged" },
		{ action: "scope-branch", label: compact ? `BR${pdiff.scope === "branch" ? "●" : "○"}` : `BRANCH ${pdiff.scope === "branch" ? "●" : "○"}`, active: pdiff.scope === "branch" },
		{ action: "view-all", label: compact ? `ALL${pdiff.view === "all" ? "●" : "○"}` : `ALL ${pdiff.view === "all" ? "●" : "○"}`, active: pdiff.view === "all" },
		{ action: "view-files", label: compact ? "FILES" : "FILES", active: pdiff.view === "files" },
		{ action: "toggle-wrap", label: compact ? `WRP${pdiff.wrapLines ? "●" : "○"}` : `WRAP ${pdiff.wrapLines ? "●" : "○"}`, active: pdiff.wrapLines },
		{ action: "refresh", label: compact ? "RLD" : "RLD", active: false },
	];
	let content = "";
	for (const control of controls) {
		const raw = `[${control.label}]`;
		const separator = content ? " " : "";
		if (visibleWidth(content) + visibleWidth(separator) + visibleWidth(raw) > innerWidth) break;
		content += separator;
		const start = visibleWidth(content);
		content += styledPill(control.label, control.active);
		addControlHit(control.action, rowOffset, pdiff.col + 1 + start, pdiff.col + 1 + start + visibleWidth(raw) - 1);
	}
	return content;
}

function renderFooter(innerWidth: number, rowOffset: number, shownStart: number, shownEnd: number, total: number): string {
	const theme = state.session.theme;
	const info = total === 0 ? "0/0" : `${shownStart + 1}-${shownEnd}/${total}`;
	const compact = innerWidth < 42;
	const controls: Array<{ action: DiffControlAction; label: string; active: boolean }> = compact
		? [
			...(pdiff.view !== "files" ? [{ action: "back" as const, label: "BACK", active: false }] : []),
			{ action: "page-up", label: "PG↑", active: true },
			{ action: "page-down", label: "PG↓", active: true },
			{ action: "close", label: "X", active: false },
		]
		: [
			...(pdiff.view !== "files" ? [{ action: "back" as const, label: "BACK", active: false }] : []),
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
		addControlHit(control.action, rowOffset, pdiff.col + 1 + start, pdiff.col + 1 + start + visibleWidth(raw) - 1);
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

function statusColor(status: DiffFile["status"]): "success" | "warning" | "error" | "accent" {
	if (status === "A" || status === "?") return "success";
	if (status === "D") return "error";
	if (status === "R") return "accent";
	return "warning";
}

function colorDiffLine(line: string): string {
	const theme = state.session.theme;
	if (!theme) return line;
	if (line.startsWith("+") && !line.startsWith("+++")) return theme.fg("success", line);
	if (line.startsWith("-") && !line.startsWith("---")) return theme.fg("error", line);
	if (line.startsWith("@@")) return theme.fg("accent", line);
	if (line.startsWith("diff --git")) return theme.bold(theme.fg("warning", line));
	if (line.startsWith("+++ ")) return theme.fg("success", line);
	if (line.startsWith("--- ")) return theme.fg("error", line);
	if (line.startsWith("index ") || line.startsWith("new file") || line.startsWith("deleted file")) return theme.fg("muted", line);
	return line;
}

function displayDiffLines(lines: string[], innerWidth: number): string[] {
	if (!pdiff.wrapLines) return lines.map(colorDiffLine);
	const wrapWidth = Math.max(1, innerWidth);
	return lines.flatMap((line) => {
		const colored = colorDiffLine(line.replace(/\t/g, "  "));
		const wrapped = wrapTextWithAnsi(colored, wrapWidth);
		return wrapped.length > 0 ? wrapped : [""];
	});
}

function totals(): { added: number; removed: number } {
	return pdiff.files.reduce((acc, file) => ({ added: acc.added + file.added, removed: acc.removed + file.removed }), { added: 0, removed: 0 });
}

class PdiffOverlayComponent implements Component {
	render(width: number): string[] {
		const theme = state.session.theme;
		const terminalRows = state.session.tui?.terminal.rows ?? 24;
		const maxHeight = Math.max(6, terminalRows - pdiff.row + 1);
		const renderWidth = Math.max(1, width);
		const innerWidth = Math.max(0, renderWidth - 2);
		const lines: string[] = [];
		pdiff.hits = [];

		lines.push(border("top", renderWidth));
		lines.push(boxLine(renderToolbar(innerWidth, lines.length), renderWidth));
		const total = totals();
		const base = pdiff.scope === "branch" && pdiff.baseRef ? ` · base ${pdiff.baseRef}` : "";
		const summary = pdiff.loading
			? " Loading diff…"
			: ` ${pdiff.files.length} file${pdiff.files.length === 1 ? "" : "s"} · +${total.added} -${total.removed}${base}`;
		lines.push(boxLine(theme ? theme.fg("muted", summary) : summary, renderWidth));
		lines.push(border("middle", renderWidth));

		const reservedFooterLines = 2;
		const availableRows = Math.max(1, maxHeight - lines.length - reservedFooterLines);

		if (pdiff.loading) {
			pdiff.visibleCount = availableRows;
			lines.push(boxLine(" Loading…", renderWidth));
		} else if (pdiff.status && pdiff.files.length === 0) {
			pdiff.visibleCount = availableRows;
			lines.push(boxLine(` ${pdiff.status}`, renderWidth));
		} else if (pdiff.view === "files") {
			const cardHeight = 3;
			pdiff.visibleCount = Math.max(1, Math.floor(availableRows / cardHeight));
			clampScroll();
			const visible = pdiff.files.slice(pdiff.scrollOffset, pdiff.scrollOffset + pdiff.visibleCount);
			for (const [i, file] of visible.entries()) {
				const absoluteIndex = pdiff.scrollOffset + i;
				const rowStart = lines.length;
				const color = statusColor(file.status);
				const path = truncateToWidth(`${absoluteIndex + 1}. ${file.status} ${file.path}`, innerWidth - 1, "…");
				const styledPath = theme ? theme.fg(color, path) : path;
				const statLine = theme
					? `   ${theme.fg("success", `+${file.added}`)} ${theme.fg("error", `-${file.removed}`)} ${theme.fg("muted", `${file.lines.length} lines`)}`
					: `   +${file.added} -${file.removed} ${file.lines.length} lines`;
				lines.push(boxLine(` ${styledPath}`, renderWidth));
				lines.push(boxLine(statLine, renderWidth));
				lines.push(border("middle", renderWidth));
				addFileHit(file.path, rowStart, cardHeight);
			}
		} else {
			let availableDiffRows = availableRows;
			if (pdiff.view === "file" && pdiff.selectedPath) {
				lines.push(boxLine(theme ? theme.fg("warning", ` ${pdiff.selectedPath}`) : ` ${pdiff.selectedPath}`, renderWidth));
				availableDiffRows = Math.max(1, availableRows - 1);
			}
			const diffLines = displayDiffLines(currentLines(), innerWidth);
			pdiff.displayLineCount = diffLines.length;
			pdiff.visibleCount = availableDiffRows;
			clampScroll();
			const visible = diffLines.slice(pdiff.scrollOffset, pdiff.scrollOffset + pdiff.visibleCount);
			for (const diffLine of visible) {
				lines.push(boxLine(diffLine, renderWidth));
			}
		}

		const activeTotal = currentTotalLines();
		const shownStart = activeTotal === 0 ? 0 : pdiff.scrollOffset;
		const shownEnd = activeTotal === 0 ? 0 : Math.min(activeTotal, pdiff.scrollOffset + pdiff.visibleCount);
		lines.push(boxLine(renderFooter(innerWidth, lines.length, shownStart, shownEnd, activeTotal), renderWidth));
		lines.push(border("bottom", renderWidth));

		const title = theme?.bold(theme.fg("accent", " pi phone /pdiff ")) ?? " pi phone /pdiff ";
		if (visibleWidth(title) + 4 < renderWidth) {
			const titleWidth = visibleWidth(title);
			const left = Math.max(1, Math.floor((renderWidth - titleWidth) / 2));
			const innerLeft = "─".repeat(Math.max(0, left - 1));
			const innerRight = "─".repeat(Math.max(0, renderWidth - left - titleWidth - 1));
			lines[0] = padLineToWidth(`${theme?.fg("accent", "╭") ?? "╭"}${theme?.fg("accent", innerLeft) ?? innerLeft}${title}${theme?.fg("accent", innerRight) ?? innerRight}${theme?.fg("accent", "╮") ?? "╮"}`, renderWidth);
		}

		pdiff.width = renderWidth;
		pdiff.height = lines.length;
		return lines.map((line) => padLineToWidth(line, renderWidth));
	}

	invalidate(): void {}
}

export function showPdiffOverlay(ctx: ExtensionCommandContext): void {
	if (!state.session.tui) {
		notify("phone-shell: /pdiff needs phone-shell mode enabled", "warning");
		return;
	}
	if (pdiff.visible) {
		closePdiffOverlay();
		return;
	}
	for (const kind of ["utility", "view", "skills", "prompts", "models", "allModels"] as const) hideDropdown(kind);
	hideRecentOverlay();
	hidePhoneTreeOverlay();

	const terminalCols = state.session.tui.terminal.columns;
	const terminalRows = state.session.tui.terminal.rows;
	pdiff.row = state.shell.headerInstalled && terminalRows >= 14 ? HEADER_HEIGHT + 1 : 1;
	pdiff.col = terminalCols <= 42 ? 1 : 2;
	pdiff.width = Math.max(1, terminalCols - (pdiff.col === 1 ? 0 : 2));
	pdiff.scope = "worktree";
	pdiff.view = "files";
	pdiff.cwd = ctx.cwd;
	pdiff.ctx = ctx;
	pdiff.scrollOffset = 0;
	pdiff.visibleCount = 0;
	pdiff.status = undefined;
	pdiff.files = [];
	pdiff.allLines = [];
	pdiff.selectedPath = undefined;
	pdiff.wrapLines = false;
	pdiff.displayLineCount = undefined;

	pdiff.handle = state.session.tui.showOverlay(new PdiffOverlayComponent(), {
		anchor: "top-left",
		row: pdiff.row,
		col: pdiff.col,
		width: pdiff.width,
		maxHeight: Math.max(6, terminalRows - pdiff.row + 1),
		nonCapturing: true,
	});
	pdiff.visible = true;
	queueLog("pdiff overlay shown");
	void loadDiff();
}

export function handlePdiffOverlayMouse(mouse: MouseInput): InputResponse {
	if (!pdiff.visible) return undefined;
	const rowOffset = mouse.row - pdiff.row;
	const inside = rowOffset >= 0 && rowOffset < pdiff.height && mouse.col >= pdiff.col && mouse.col < pdiff.col + pdiff.width;
	if (!inside) {
		if (isPrimaryPointerPress(mouse)) closePdiffOverlay();
		return { consume: true };
	}
	if (mouse.phase === "scroll") {
		if (mouse.scrollDirection === "up") scrollByRows(-1);
		else if (mouse.scrollDirection === "down") scrollByRows(1);
		return { consume: true };
	}
	if (pdiff.drag && mouse.phase === "release") {
		const drag = pdiff.drag;
		pdiff.drag = undefined;
		if (drag.phase === "potential-tap") {
			const hit = findHit(drag.tapRow - pdiff.row, drag.tapCol);
			if (hit?.kind === "control") activateControl(hit.action);
			else if (hit?.kind === "file") setView("file", hit.path);
		}
		return { consume: true };
	}
	if (pdiff.drag && isPrimaryPointerDrag(mouse)) {
		const delta = mouse.row - pdiff.drag.anchorRow;
		if (Math.abs(delta) > 1) pdiff.drag.phase = "dragging";
		if (pdiff.drag.phase === "dragging") {
			pdiff.scrollOffset = pdiff.drag.anchorScrollOffset - delta;
			clampScroll();
			requestRender();
		}
		return { consume: true };
	}
	if (isPrimaryPointerPress(mouse)) {
		pdiff.drag = {
			anchorRow: mouse.row,
			anchorScrollOffset: pdiff.scrollOffset,
			phase: "potential-tap",
			tapRow: mouse.row,
			tapCol: mouse.col,
		};
		return { consume: true };
	}
	return { consume: true };
}

export function handlePdiffOverlayKey(data: string): InputResponse {
	if (!pdiff.visible) return undefined;
	if (matchesKey(data, Key.escape) || matchesKey(data, Key.ctrl("c"))) {
		closePdiffOverlay();
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
		pdiff.scrollOffset = 0;
		requestRender();
		return { consume: true };
	}
	if (matchesKey(data, Key.end)) {
		activateControl("bottom");
		return { consume: true };
	}
	return { consume: true };
}
