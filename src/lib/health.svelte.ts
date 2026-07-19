import type { Probe } from '$lib/server/health';

interface HealthResponse {
	checkedAt: number;
	probes: Record<string, Probe>;
}

/**
 * Polls /api/health on an interval and exposes a reactive probe map. Pauses
 * while the tab is hidden and probes once immediately on resume.
 */
export class HealthMonitor {
	probes = $state<Record<string, Probe>>({});
	loading = $state(true);
	lastError = $state<string | null>(null);

	#interval: number;
	#timer: ReturnType<typeof setInterval> | null = null;

	constructor(interval: number) {
		this.#interval = Math.max(5000, interval || 15000);
	}

	start() {
		this.refresh();
		this.#timer = setInterval(() => {
			if (typeof document !== 'undefined' && document.hidden) return;
			this.refresh();
		}, this.#interval);
		document.addEventListener('visibilitychange', this.#onVisible);
	}

	stop() {
		if (this.#timer) clearInterval(this.#timer);
		this.#timer = null;
		document.removeEventListener('visibilitychange', this.#onVisible);
	}

	#onVisible = () => {
		if (!document.hidden) this.refresh();
	};

	async refresh() {
		try {
			const res = await fetch('/api/health');
			if (!res.ok) throw new Error(`HTTP ${res.status}`);
			const data: HealthResponse = await res.json();
			this.probes = data.probes;
			this.lastError = null;
		} catch (e) {
			this.lastError = e instanceof Error ? e.message : 'unknown';
		} finally {
			this.loading = false;
		}
	}

	get(url: string): Probe | undefined {
		return this.probes[url];
	}

	get summary() {
		const vals = Object.values(this.probes);
		return {
			total: vals.length,
			up: vals.filter((p) => p.status === 'up').length,
			down: vals.filter((p) => p.status === 'down').length
		};
	}
}
