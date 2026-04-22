import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import {
	DEFAULT_CONFIG,
	DEFAULT_LAYOUT,
	DEFAULT_PERSISTED_STATE,
} from "./defaults.js";
import type {
	ButtonPalette,
	ButtonSpec,
	FavoriteEntry,
	PersistedShellState,
	PhoneShellConfig,
	PhoneShellLayout,
	PhoneShellPaths,
	ShellAction,
} from "./types.js";

const PALETTES: readonly ButtonPalette[] = ["accent", "warning", "muted"] as const;
const ACTIONS: readonly ShellAction[] = [
	"toggleUtilities",
	"toggleViewMenu",
	"toggleBottomBar",
	"toggleEditorPosition",
	"toggleNavPad",
	"toggleViewportJumpButtons",
	"scrollTop",
	"pageUp",
	"cycleModel",
	"pageDown",
	"scrollBottom",
	"sendEscape",
	"sendInterrupt",
	"sendFollowUp",
	"openSlash",
	"arrowLeft",
	"arrowUp",
	"arrowDown",
	"arrowRight",
	"sendEnter",
] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readBoolean(record: Record<string, unknown>, key: string, fallback: boolean): boolean {
	return typeof record[key] === "boolean" ? record[key] : fallback;
}

function readString(record: Record<string, unknown>, key: string, fallback: string): string {
	return typeof record[key] === "string" ? record[key] : fallback;
}

function readNumber(record: Record<string, unknown>, key: string, fallback: number): number {
	return typeof record[key] === "number" && Number.isFinite(record[key]) ? record[key] : fallback;
}

function readPalette(value: unknown): ButtonPalette | undefined {
	return typeof value === "string" && PALETTES.includes(value as ButtonPalette)
		? (value as ButtonPalette)
		: undefined;
}

function deriveButtonId(prefix: string, index: number, label: string): string {
	const slug = label
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "")
		.slice(0, 48);
	return slug ? `${prefix}-${slug}` : `${prefix}-${index}`;
}

function parseButtonSpec(value: unknown, prefix: string, index: number, errors: string[]): ButtonSpec | undefined {
	if (!isRecord(value)) {
		errors.push(`${prefix}[${index}] must be an object`);
		return undefined;
	}

	const kind = value.kind;
	const label = typeof value.label === "string" ? value.label : undefined;
	if (typeof kind !== "string") {
		errors.push(`${prefix}[${index}].kind must be a string`);
		return undefined;
	}
	if (!label) {
		errors.push(`${prefix}[${index}].label must be a non-empty string`);
		return undefined;
	}

	const id = typeof value.id === "string" && value.id.trim().length > 0
		? value.id.trim()
		: deriveButtonId(prefix, index, label);
	const palette = readPalette(value.palette);

	if (kind === "command") {
		if (typeof value.command !== "string" || value.command.length === 0) {
			errors.push(`${prefix}[${index}].command must be a non-empty string for command buttons`);
			return undefined;
		}
		return { kind, id, label, command: value.command, palette };
	}

	if (kind === "input") {
		if (typeof value.data !== "string") {
			errors.push(`${prefix}[${index}].data must be a string for input buttons`);
			return undefined;
		}
		return { kind, id, label, data: value.data, palette };
	}

	if (kind === "editorKey") {
		if (typeof value.data !== "string") {
			errors.push(`${prefix}[${index}].data must be a string for editorKey buttons`);
			return undefined;
		}
		return {
			kind,
			id,
			label,
			data: value.data,
			clearFirst: typeof value.clearFirst === "boolean" ? value.clearFirst : undefined,
			setText: typeof value.setText === "string" ? value.setText : undefined,
			palette,
		};
	}

	if (kind === "action") {
		if (typeof value.action !== "string" || !ACTIONS.includes(value.action as ShellAction)) {
			errors.push(`${prefix}[${index}].action must be one of: ${ACTIONS.join(", ")}`);
			return undefined;
		}
		return { kind, id, label, action: value.action as ShellAction, palette };
	}

	errors.push(`${prefix}[${index}].kind must be one of command, input, editorKey, action`);
	return undefined;
}

function parseLayout(value: unknown): { layout: PhoneShellLayout; errors: string[] } {
	const errors: string[] = [];
	if (!isRecord(value)) {
		return { layout: DEFAULT_LAYOUT, errors: ["layout file must contain a JSON object"] };
	}

	let utilityButtons = DEFAULT_LAYOUT.utilityButtons;
	if (value.utilityButtons !== undefined) {
		if (!Array.isArray(value.utilityButtons)) {
			errors.push("utilityButtons must be an array");
		} else {
			const parsed = value.utilityButtons
				.map((button, index) => parseButtonSpec(button, "utilityButtons", index, errors))
				.filter((button): button is ButtonSpec => Boolean(button));
			if (parsed.length > 0) utilityButtons = parsed;
		}
	}

	let bottomGroups = DEFAULT_LAYOUT.bottomGroups;
	if (value.bottomGroups !== undefined) {
		if (!Array.isArray(value.bottomGroups)) {
			errors.push("bottomGroups must be an array of button arrays");
		} else {
			const parsedGroups = value.bottomGroups
				.map((group, groupIndex) => {
					if (!Array.isArray(group)) {
						errors.push(`bottomGroups[${groupIndex}] must be an array`);
						return undefined;
					}
					const buttons = group
						.map((button, buttonIndex) => parseButtonSpec(button, `bottomGroups[${groupIndex}]`, buttonIndex, errors))
						.filter((button): button is ButtonSpec => Boolean(button));
					return buttons.length > 0 ? buttons : undefined;
				})
				.filter((group): group is ButtonSpec[] => Boolean(group));
			if (parsedGroups.length > 0) bottomGroups = parsedGroups;
		}
	}

	return {
		layout: {
			utilityButtons,
			bottomGroups,
		},
		errors,
	};
}

function parseConfig(value: unknown): { config: PhoneShellConfig; errors: string[] } {
	const errors: string[] = [];
	if (!isRecord(value)) {
		return { config: DEFAULT_CONFIG, errors: ["config file must contain a JSON object"] };
	}

	const header = isRecord(value.header) ? value.header : {};
	if (value.header !== undefined && !isRecord(value.header)) errors.push("header must be an object");

	const viewport = isRecord(value.viewport) ? value.viewport : {};
	if (value.viewport !== undefined && !isRecord(value.viewport)) errors.push("viewport must be an object");

	const utilityOverlay = isRecord(value.utilityOverlay) ? value.utilityOverlay : {};
	if (value.utilityOverlay !== undefined && !isRecord(value.utilityOverlay)) errors.push("utilityOverlay must be an object");

	const viewOverlay = isRecord(value.viewOverlay) ? value.viewOverlay : {};
	if (value.viewOverlay !== undefined && !isRecord(value.viewOverlay)) errors.push("viewOverlay must be an object");

	const render = isRecord(value.render) ? value.render : {};
	if (value.render !== undefined && !isRecord(value.render)) errors.push("render must be an object");

	const inputs = isRecord(value.inputs) ? value.inputs : {};
	if (value.inputs !== undefined && !isRecord(value.inputs)) errors.push("inputs must be an object");

	const logging = isRecord(value.logging) ? value.logging : {};
	if (value.logging !== undefined && !isRecord(value.logging)) errors.push("logging must be an object");

	const config: PhoneShellConfig = {
		header: {
			enabled: readBoolean(header, "enabled", DEFAULT_CONFIG.header.enabled),
		},
		viewport: {
			pageOverlapLines: Math.max(0, Math.floor(readNumber(viewport, "pageOverlapLines", DEFAULT_CONFIG.viewport.pageOverlapLines))),
			minPageScrollLines: Math.max(1, Math.floor(readNumber(viewport, "minPageScrollLines", DEFAULT_CONFIG.viewport.minPageScrollLines))),
		},
		utilityOverlay: {
			autoOpenOnEnable: readBoolean(utilityOverlay, "autoOpenOnEnable", DEFAULT_CONFIG.utilityOverlay.autoOpenOnEnable),
			keepOpenAfterButtonActivation: readBoolean(
				utilityOverlay,
				"keepOpenAfterButtonActivation",
				DEFAULT_CONFIG.utilityOverlay.keepOpenAfterButtonActivation,
			),
		},
		viewOverlay: {
			keepOpenAfterButtonActivation: readBoolean(
				viewOverlay,
				"keepOpenAfterButtonActivation",
				DEFAULT_CONFIG.viewOverlay.keepOpenAfterButtonActivation,
			),
		},
		render: {
			buttonGap: Math.max(0, Math.floor(readNumber(render, "buttonGap", DEFAULT_CONFIG.render.buttonGap))),
			leadingColumns: Math.max(0, Math.floor(readNumber(render, "leadingColumns", DEFAULT_CONFIG.render.leadingColumns))),
		},
		inputs: {
			modelCycle: readString(inputs, "modelCycle", DEFAULT_CONFIG.inputs.modelCycle),
			followUp: readString(inputs, "followUp", DEFAULT_CONFIG.inputs.followUp),
		},
		logging: {
			tailLines: Math.max(10, Math.floor(readNumber(logging, "tailLines", DEFAULT_CONFIG.logging.tailLines))),
		},
	};

	return { config, errors };
}

async function readJsonIfExists(filePath: string): Promise<unknown | undefined> {
	try {
		const content = await fs.readFile(filePath, "utf8");
		return JSON.parse(content);
	} catch (error) {
		const code = (error as NodeJS.ErrnoException).code;
		if (code === "ENOENT") return undefined;
		throw error;
	}
}

export function getPhoneShellPaths(): PhoneShellPaths {
	const baseDir = path.join(os.homedir(), ".pi", "agent", "pi-phone-3gs");
	return {
		config: path.join(baseDir, "phone-shell.config.json"),
		layout: path.join(baseDir, "phone-shell.layout.json"),
		state: path.join(baseDir, "phone-shell.state.json"),
		favorites: path.join(baseDir, "phone-shell.favorites.json"),
		log: path.join(os.homedir(), ".pi", "agent", "logs", "pi-phone-3gs-phone-shell.log"),
	};
}

function normalizePersistedShellState(value: unknown, fallback = DEFAULT_PERSISTED_STATE): PersistedShellState {
	if (!isRecord(value)) return fallback;
	return {
		enabled: value.enabled === true,
		autoEnable: value.autoEnable !== false,
		proxyOnly: value.proxyOnly === true,
		barVisible: value.barVisible !== false,
		navPadVisible: value.navPadVisible === true,
		viewportJumpButtonsVisible: value.viewportJumpButtonsVisible !== false,
	};
}

export async function loadPersistedShellState(paths: PhoneShellPaths): Promise<PersistedShellState> {
	try {
		const value = await readJsonIfExists(paths.state);
		return normalizePersistedShellState(value);
	} catch {
		return DEFAULT_PERSISTED_STATE;
	}
}

export async function savePersistedShellState(paths: PhoneShellPaths, patch: Partial<PersistedShellState>): Promise<void> {
	const current = await loadPersistedShellState(paths);
	const next: PersistedShellState = {
		enabled: patch.enabled ?? current.enabled,
		autoEnable: patch.autoEnable ?? current.autoEnable,
		proxyOnly: patch.proxyOnly ?? current.proxyOnly,
		barVisible: patch.barVisible ?? current.barVisible,
		navPadVisible: patch.navPadVisible ?? current.navPadVisible,
		viewportJumpButtonsVisible: patch.viewportJumpButtonsVisible ?? current.viewportJumpButtonsVisible,
	};
	await fs.mkdir(path.dirname(paths.state), { recursive: true });
	await fs.writeFile(paths.state, JSON.stringify(next, null, 2), "utf8");
}

export async function loadPhoneShellSettings(paths: PhoneShellPaths): Promise<{
	config: PhoneShellConfig;
	layout: PhoneShellLayout;
	errors: string[];
}> {
	const errors: string[] = [];
	let config = DEFAULT_CONFIG;
	let layout = DEFAULT_LAYOUT;

	try {
		const rawConfig = await readJsonIfExists(paths.config);
		if (rawConfig !== undefined) {
			const parsed = parseConfig(rawConfig);
			config = parsed.config;
			errors.push(...parsed.errors.map((error) => `config: ${error}`));
		}
	} catch (error) {
		errors.push(`config: ${(error as Error).message}`);
	}

	try {
		const rawLayout = await readJsonIfExists(paths.layout);
		if (rawLayout !== undefined) {
			const parsed = parseLayout(rawLayout);
			layout = parsed.layout;
			errors.push(...parsed.errors.map((error) => `layout: ${error}`));
		}
	} catch (error) {
		errors.push(`layout: ${(error as Error).message}`);
	}

	return { config, layout, errors };
}

export async function loadFavorites(paths: PhoneShellPaths): Promise<{ favorites: FavoriteEntry[]; errors: string[] }> {
	const errors: string[] = [];
	try {
		const raw = await readJsonIfExists(paths.favorites);
		if (raw === undefined) return { favorites: [], errors: [] };
		if (!Array.isArray(raw)) {
			errors.push("favorites: file must contain a JSON array");
			return { favorites: [], errors };
		}
		const favorites: FavoriteEntry[] = [];
		for (let i = 0; i < raw.length; i++) {
			const item = raw[i];
			if (!isRecord(item)) {
				errors.push(`favorites[${i}] must be an object`);
				continue;
			}
			const label = typeof item.label === "string" && item.label.trim().length > 0 ? item.label.trim() : undefined;
			const command = typeof item.command === "string" && item.command.trim().length > 0 ? item.command.trim() : undefined;
			if (!label) { errors.push(`favorites[${i}].label must be a non-empty string`); continue; }
			if (!command) { errors.push(`favorites[${i}].command must be a non-empty string`); continue; }
			const palette = readPalette(item.palette);
			favorites.push({ label, command, palette });
		}
		return { favorites, errors };
	} catch (error) {
		return { favorites: [], errors: [`favorites: ${(error as Error).message}`] };
	}
}
