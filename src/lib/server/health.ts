export type Status = 'up' | 'down';

export interface Probe {
	status: Status;
	/** Round-trip latency in ms (present when up). */
	latency?: number;
	/** HTTP status code, when a response came back. */
	code?: number;
	checkedAt: number;
}

interface CacheEntry extends Probe {
	expires: number;
}

const cache = new Map<string, CacheEntry>();
const inflight = new Map<string, Promise<Probe>>();

/**
 * Probe a single URL. Reachability — not a 2xx — is what counts: self-hosted apps
 * routinely answer 401/403/302 at the root, and that still means "up". We only
 * treat a network failure or timeout as down. Results are cached briefly and
 * concurrent callers share one in-flight request.
 */
export async function probe(url: string, timeout: number, ttl = 8000): Promise<Probe> {
	const now = Date.now();
	const hit = cache.get(url);
	if (hit && hit.expires > now) return strip(hit);

	const existing = inflight.get(url);
	if (existing) return existing;

	const run = doProbe(url, timeout).then((res) => {
		cache.set(url, { ...res, expires: Date.now() + ttl });
		inflight.delete(url);
		return res;
	});
	inflight.set(url, run);
	return run;
}

async function doProbe(url: string, timeout: number): Promise<Probe> {
	const started = Date.now();
	const ctrl = new AbortController();
	const timer = setTimeout(() => ctrl.abort(), timeout);
	try {
		// HEAD first; some servers reject it, so fall back to a GET we don't read.
		let res: Response;
		try {
			res = await fetch(url, { method: 'HEAD', signal: ctrl.signal, redirect: 'manual' });
		} catch {
			res = await fetch(url, { method: 'GET', signal: ctrl.signal, redirect: 'manual' });
		}
		return {
			status: 'up',
			latency: Date.now() - started,
			code: res.status,
			checkedAt: Date.now()
		};
	} catch {
		return { status: 'down', checkedAt: Date.now() };
	} finally {
		clearTimeout(timer);
	}
}

function strip(e: CacheEntry): Probe {
	const { expires: _expires, ...rest } = e;
	return rest;
}
