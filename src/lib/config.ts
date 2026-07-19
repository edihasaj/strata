import { readFile } from 'node:fs/promises';
import { env } from '$env/dynamic/private';
import { parse } from 'yaml';

export interface ServiceItem {
	name: string;
	subtitle?: string;
	url: string;
	/** URL probed for health; defaults to `url`. */
	health?: string;
	/** Path to an icon image, or a single emoji. */
	icon?: string;
	tags?: string[];
	/** Whether the live-preview iframe is offered. Default true. */
	preview?: boolean;
	target?: string;
}

export interface Group {
	name: string;
	icon?: string;
	items: ServiceItem[];
}

export interface DashboardConfig {
	title: string;
	subtitle?: string;
	logo?: string;
	footer?: string;
	theme: {
		accent: string;
		accent2: string;
		default: 'auto' | 'dark' | 'light';
	};
	health: {
		interval: number;
		timeout: number;
	};
	groups: Group[];
}

const DEFAULTS = {
	theme: { accent: '#6ee7ff', accent2: '#a78bfa', default: 'auto' as const },
	health: { interval: 15000, timeout: 4000 }
};

/** Resolve the config path (env override → sensible default). */
export function configPath(): string {
	return env.CONFIG_PATH || 'config/config.yml';
}

/**
 * Load + normalize the dashboard config. Accepts the native `groups:` schema and,
 * for drop-in Homer migration, a `services:` block as an alias.
 */
export async function loadConfig(): Promise<DashboardConfig> {
	const raw = await readFile(configPath(), 'utf8');
	const doc = (parse(raw) ?? {}) as Record<string, unknown>;

	const groupsRaw = (doc.groups ?? doc.services ?? []) as Group[];
	const groups: Group[] = groupsRaw.map((g) => ({
		name: g.name,
		icon: g.icon,
		items: (g.items ?? []).map((it) => ({
			name: it.name,
			subtitle: it.subtitle,
			url: it.url,
			health: it.health,
			icon: it.icon ?? (it as ServiceItem & { logo?: string }).logo,
			tags: normalizeTags(it.tags ?? (it as ServiceItem & { tag?: string }).tag),
			preview: it.preview ?? true,
			target: it.target
		}))
	}));

	const theme = (doc.theme ?? {}) as Partial<DashboardConfig['theme']>;
	const health = (doc.health ?? {}) as Partial<DashboardConfig['health']>;

	return {
		title: (doc.title as string) ?? 'Homelab',
		subtitle: doc.subtitle as string | undefined,
		logo: doc.logo as string | undefined,
		footer: doc.footer as string | undefined,
		theme: { ...DEFAULTS.theme, ...theme },
		health: { ...DEFAULTS.health, ...health },
		groups
	};
}

function normalizeTags(tags: unknown): string[] {
	if (!tags) return [];
	if (Array.isArray(tags)) return tags.map(String);
	return [String(tags)];
}

/** Flat list of every probe target, deduped by URL. */
export function probeTargets(cfg: DashboardConfig): { name: string; url: string }[] {
	const seen = new Set<string>();
	const out: { name: string; url: string }[] = [];
	for (const g of cfg.groups) {
		for (const it of g.items) {
			const url = it.health ?? it.url;
			if (seen.has(url)) continue;
			seen.add(url);
			out.push({ name: it.name, url });
		}
	}
	return out;
}
