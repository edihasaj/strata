import { json } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { loadConfig } from '$lib/config';
import { probe, probeTargets, type Probe } from '$lib/server/health';
import { resolveProbeAuth } from '$lib/server/probe-auth';
import type { RequestHandler } from './$types';

/**
 * Probe every configured service (server-side, so no CORS and internal-only
 * hosts are reachable) and return a { url: Probe } map. The client polls this.
 */
export const GET: RequestHandler = async () => {
	const cfg = await loadConfig();
	const targets = probeTargets(cfg);
	const auth = resolveProbeAuth({
		clientId: env.STRATA_CF_ACCESS_CLIENT_ID,
		clientSecret: env.STRATA_CF_ACCESS_CLIENT_SECRET,
		origins: env.STRATA_CF_ACCESS_ORIGINS
	});

	const entries = await Promise.all(
		targets.map(async (t): Promise<[string, Probe]> => [
			t.url,
			await probe(t.url, cfg.health.timeout, 8000, auth.optionsFor(t.url))
		])
	);

	return json({
		checkedAt: Date.now(),
		probes: Object.fromEntries(entries)
	});
};
