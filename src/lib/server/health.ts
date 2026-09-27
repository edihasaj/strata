export type Status = 'up' | 'down';

/** Why a probe is down, so a broken resolver doesn't look like a dead service. */
export type DownReason = 'dns' | 'refused' | 'timeout' | 'tls' | 'network' | 'http';

export interface Probe {
	status: Status;
	/** Round-trip latency in ms (present when a response came back). */
	latency?: number;
	/** HTTP status code, when a response came back. */
	code?: number;
	/** Present when down. */
	reason?: DownReason;
	checkedAt: number;
}

interface CacheEntry extends Probe {
	expires: number;
}

const cache = new Map<string, CacheEntry>();
const inflight = new Map<string, Promise<Probe>>();

/**
 * Probe a single URL. Reachability — not a 2xx — is what counts: self-hosted apps
 * routinely answer 401/403/302 at the root, and that still means "up". A network
 * failure, timeout, or 5xx (e.g. a proxy's 502 when the app behind it is gone) is
 * down. Results are cached briefly and concurrent callers share one in-flight
 * request.
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
		// HEAD first; some servers reject it (405/501) or mishandle it, so fall
		// back to a GET we don't read.
		let res: Response | undefined;
		try {
			res = await fetch(url, { method: 'HEAD', signal: ctrl.signal, redirect: 'manual' });
		} catch {
			// Retried below; a GET failure carries the same cause.
		}
		if (!res || res.status === 405 || res.status >= 500) {
			res = await fetch(url, { method: 'GET', signal: ctrl.signal, redirect: 'manual' });
		}
		void res.body?.cancel();
		const latency = Date.now() - started;
		if (res.status >= 500) {
			return { status: 'down', reason: 'http', code: res.status, latency, checkedAt: Date.now() };
		}
		return { status: 'up', latency, code: res.status, checkedAt: Date.now() };
	} catch (err) {
		return { status: 'down', reason: classify(err, ctrl.signal), checkedAt: Date.now() };
	} finally {
		clearTimeout(timer);
	}
}

const TLS_CODE = /CERT|SSL|TLS|SELF_SIGNED|UNABLE_TO_(GET|VERIFY)/;

/** Map a fetch failure (undici puts the socket error in `cause`) to a reason. */
export function classify(err: unknown, signal?: AbortSignal): DownReason {
	if (signal?.aborted) return 'timeout';
	const cause = (err as { cause?: { code?: string } } | undefined)?.cause;
	const code = cause?.code ?? '';
	if (code === 'ENOTFOUND' || code === 'EAI_AGAIN') return 'dns';
	if (code === 'ECONNREFUSED') return 'refused';
	if (code === 'ETIMEDOUT' || code === 'UND_ERR_CONNECT_TIMEOUT') return 'timeout';
	if (TLS_CODE.test(code)) return 'tls';
	return 'network';
}

function strip(e: CacheEntry): Probe {
	const { expires: _expires, ...rest } = e;
	return rest;
}
