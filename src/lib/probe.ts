import type { Probe } from '$lib/server/health';

/** Short human label for a down probe: the HTTP code, or why no response came back. */
export function downLabel(p: Pick<Probe, 'reason' | 'code'>): string {
	if (p.reason === 'http' && p.code) return `HTTP ${p.code}`;
	switch (p.reason) {
		case 'dns':
			return 'DNS lookup failed';
		case 'refused':
			return 'connection refused';
		case 'timeout':
			return 'timed out';
		case 'tls':
			return 'TLS error';
		default:
			return 'unreachable';
	}
}
