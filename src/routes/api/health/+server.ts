import { json } from '@sveltejs/kit';
import { loadConfig, probeTargets } from '$lib/config';
import { probe, type Probe } from '$lib/server/health';
import type { RequestHandler } from './$types';

/**
 * Probe every configured service (server-side, so no CORS and internal-only
 * hosts are reachable) and return a { url: Probe } map. The client polls this.
 */
export const GET: RequestHandler = async () => {
	const cfg = await loadConfig();
	const targets = probeTargets(cfg);

	const entries = await Promise.all(
		targets.map(async (t): Promise<[string, Probe]> => [t.url, await probe(t.url, cfg.health.timeout)])
	);

	return json({
		checkedAt: Date.now(),
		probes: Object.fromEntries(entries)
	});
};
