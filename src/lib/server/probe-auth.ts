import { createHash } from 'node:crypto';
import type { ProbeOptions } from './health';

export interface ProbeAuthEnvironment {
	clientId?: string;
	clientSecret?: string;
	origins?: string;
}

export interface ProbeAuth {
	optionsFor(url: string): ProbeOptions;
}

const PUBLIC_SCOPE = 'public';

/**
 * Builds request-only Cloudflare Access credentials for configured worker
 * origins. This module deliberately receives environment values from the
 * server route instead of importing SvelteKit's private environment itself.
 */
export function resolveProbeAuth(environment: ProbeAuthEnvironment): ProbeAuth {
	const { clientId = '', clientSecret = '', origins = '' } = environment;
	const configured = [clientId, clientSecret, origins].some(Boolean);

	if (!configured) {
		return { optionsFor: () => ({ cacheScope: PUBLIC_SCOPE }) };
	}

	const protectedOrigins = parseOrigins(origins);
	if (!clientId || !clientSecret || !protectedOrigins) {
		// A broken protection configuration must never turn a protected service
		// into an unauthenticated green result.
		return failClosed(scopeFor(clientId, clientSecret, origins));
	}

	const cacheScope = `cf-access:${scopeFor(clientId, clientSecret, origins)}`;
	const protectedHosts = new Set([...protectedOrigins].map((origin) => new URL(origin).hostname));

	return {
		optionsFor(url) {
			let target: URL;
			try {
				target = new URL(url);
			} catch {
				return { cacheScope };
			}

			if (!protectedHosts.has(target.hostname)) return { cacheScope: PUBLIC_SCOPE };

			if (
				target.protocol !== 'https:' ||
				target.username ||
				target.password ||
				target.port ||
				!protectedOrigins.has(target.origin)
			) {
				return { cacheScope, failClosed: true };
			}

			return {
				cacheScope,
				requireSuccess: true,
				headers: {
					'CF-Access-Client-Id': clientId,
					'CF-Access-Client-Secret': clientSecret
				}
			};
		}
	};
}

function failClosed(scope: string): ProbeAuth {
	return {
		optionsFor: () => ({
			cacheScope: `invalid-cf-access:${scope}`,
			failClosed: true
		})
	};
}

/**
 * Accept only five ordinary HTTPS origins. Cloudflare Access credentials are
 * never sent to a path, a wildcard, a different port, or a URL with userinfo.
 */
function parseOrigins(raw: string): Set<string> | undefined {
	let values: unknown;
	try {
		values = JSON.parse(raw);
	} catch {
		return undefined;
	}
	if (!Array.isArray(values) || values.length !== 5 || values.some((value) => typeof value !== 'string')) {
		return undefined;
	}

	const origins = new Set<string>();
	for (const value of values) {
		try {
			const parsed = new URL(value);
			if (
				parsed.protocol !== 'https:' ||
				!parsed.hostname ||
				!CANONICAL_HOSTNAME.test(parsed.hostname) ||
				parsed.username ||
				parsed.password ||
				parsed.port ||
				parsed.pathname !== '/' ||
				parsed.search ||
				parsed.hash ||
				value !== parsed.origin
			) {
				return undefined;
			}
			origins.add(parsed.origin);
		} catch {
			return undefined;
		}
	}

	return origins.size === 5 ? origins : undefined;
}

const CANONICAL_HOSTNAME =
	/^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

function scopeFor(clientId: string, clientSecret: string, origins: string): string {
	return createHash('sha256').update(`${clientId}\0${clientSecret}\0${origins}`).digest('hex');
}
