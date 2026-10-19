import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, before, test } from 'node:test';
import type { DashboardConfig } from '$lib/config';
import { probe, probeTargets } from './health.ts';
import { resolveProbeAuth } from './probe-auth.ts';

let server: Server;
let base: string;

before(async () => {
	server = createServer((req, res) => {
		switch (req.url) {
			case '/ok':
				res.writeHead(200).end('ok');
				return;
			case '/auth':
				res.writeHead(401).end();
				return;
			case '/bad-gateway':
				res.writeHead(502).end();
				return;
			case '/no-head':
				// Like Transmission/NZBGet: HEAD is 501, GET works.
				res.writeHead(req.method === 'HEAD' ? 501 : 200).end();
				return;
			case '/hang':
				return; // never respond
		}
	});
	await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
	base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

after(() => {
	server.closeAllConnections();
	server.close();
});

test('2xx and 4xx are up', async () => {
	assert.equal((await probe(`${base}/ok`, 2000, 0)).status, 'up');
	const auth = await probe(`${base}/auth`, 2000, 0);
	assert.equal(auth.status, 'up');
	assert.equal(auth.code, 401);
});

test('5xx is down with the code, not reachable-so-up', async () => {
	const p = await probe(`${base}/bad-gateway`, 2000, 0);
	assert.equal(p.status, 'down');
	assert.equal(p.reason, 'http');
	assert.equal(p.code, 502);
});

test('HEAD 501 falls back to GET', async () => {
	const p = await probe(`${base}/no-head`, 2000, 0);
	assert.equal(p.status, 'up');
	assert.equal(p.code, 200);
});

test('unresolvable host reports dns', async () => {
	const p = await probe('http://strata-probe-test.invalid/', 4000, 0);
	assert.equal(p.status, 'down');
	assert.equal(p.reason, 'dns');
});

test('closed port reports refused', async () => {
	const closed = createServer();
	await new Promise<void>((r) => closed.listen(0, '127.0.0.1', r));
	const port = (closed.address() as AddressInfo).port;
	await new Promise<void>((r) => closed.close(() => r()));
	const p = await probe(`http://127.0.0.1:${port}/`, 2000, 0);
	assert.equal(p.status, 'down');
	assert.equal(p.reason, 'refused');
});

test('no response within the timeout reports timeout', async () => {
	const p = await probe(`${base}/hang`, 300, 0);
	assert.equal(p.status, 'down');
	assert.equal(p.reason, 'timeout');
});

test('probeTargets skips health: false and prefers the health override', () => {
	const cfg = {
		groups: [
			{
				name: 'g',
				items: [
					{ name: 'a', url: 'https://a/' },
					{ name: 'b', url: 'https://b/', health: 'https://b/healthz' },
					{ name: 'c', url: 'https://c/', health: false }
				]
			}
		]
	} as unknown as DashboardConfig;
	assert.deepEqual(
		probeTargets(cfg).map((t) => t.url),
		['https://a/', 'https://b/healthz']
	);
});

const accessOrigins = [
	'https://one.workers.dev',
	'https://two.workers.dev',
	'https://three.workers.dev',
	'https://four.workers.dev',
	'https://five.workers.dev'
];

function accessAuth(secret = 'secret') {
	return resolveProbeAuth({
		clientId: 'service-token-id',
		clientSecret: secret,
		origins: JSON.stringify(accessOrigins)
	});
}

test('only exact configured HTTPS origins receive Access headers on HEAD and GET', async () => {
	const originalFetch = globalThis.fetch;
	const requests: { method: string; headers: Headers; redirect?: RequestRedirect }[] = [];
	globalThis.fetch = async (_url, init) => {
		requests.push({
			method: String(init?.method),
			headers: new Headers(init?.headers),
			redirect: init?.redirect
		});
		return new Response(null, { status: init?.method === 'HEAD' ? 405 : 200 });
	};

	try {
		const auth = accessAuth();
		assert.equal((await probe('https://one.workers.dev/health', 1000, 0, auth.optionsFor('https://one.workers.dev/health'))).status, 'up');
		assert.deepEqual(
			requests.map((request) => request.method),
			['HEAD', 'GET']
		);
		for (const request of requests) {
			assert.equal(request.headers.get('CF-Access-Client-Id'), 'service-token-id');
			assert.equal(request.headers.get('CF-Access-Client-Secret'), 'secret');
			assert.equal(request.redirect, 'manual');
		}

		requests.length = 0;
		await probe('https://public.example.test/', 1000, 0, auth.optionsFor('https://public.example.test/'));
		assert.equal(requests[0].headers.has('CF-Access-Client-Id'), false);
		assert.equal(requests[0].headers.has('CF-Access-Client-Secret'), false);
	} finally {
		globalThis.fetch = originalFetch;
	}
});

test('invalid Access configuration and malformed protected targets fail closed', async () => {
	const originalFetch = globalThis.fetch;
	let requests = 0;
	globalThis.fetch = async () => {
		requests += 1;
		return new Response(null, { status: 200 });
	};

	try {
		const invalid = resolveProbeAuth({
			clientId: 'service-token-id',
			clientSecret: '',
			origins: JSON.stringify(accessOrigins)
		});
		const malformed = accessAuth().optionsFor('https://service-token-id@one.workers.dev/health');
		const customPort = accessAuth().optionsFor('https://one.workers.dev:8443/health');
		assert.equal((await probe('https://one.workers.dev/health', 1000, 0, invalid.optionsFor('https://one.workers.dev/health'))).status, 'down');
		assert.equal((await probe('https://service-token-id@one.workers.dev/health', 1000, 0, malformed)).status, 'down');
		assert.equal((await probe('https://one.workers.dev:8443/health', 1000, 0, customPort)).status, 'down');
		assert.equal(requests, 0);

		for (const origin of [
			'http://one.workers.dev',
			'https://one.workers.dev/path',
			'https://one.workers.dev:8443',
			'https://*.workers.dev'
		]) {
			const auth = resolveProbeAuth({
				clientId: 'service-token-id',
				clientSecret: 'secret',
				origins: JSON.stringify([origin, ...accessOrigins.slice(1)])
			});
			assert.equal(auth.optionsFor('https://one.workers.dev/health').failClosed, true);
		}
	} finally {
		globalThis.fetch = originalFetch;
	}
});

test('protected probes require a 2xx response while legacy public probes stay reachable', async () => {
	const originalFetch = globalThis.fetch;
	try {
		for (const status of [302, 401, 403]) {
			globalThis.fetch = async () =>
				new Response(null, {
					status,
					headers: status === 302 ? { location: 'https://login.example.test/' } : undefined
				});
			const url = `https://one.workers.dev/${status}`;
			const protectedProbe = await probe(url, 1000, 0, accessAuth().optionsFor(url));
			assert.deepEqual(
				{ status: protectedProbe.status, reason: protectedProbe.reason, code: protectedProbe.code },
				{ status: 'down', reason: 'http', code: status }
			);
		}

		globalThis.fetch = async () => new Response(null, { status: 403 });
		const publicProbe = await probe('https://public.example.test/legacy', 1000, 0);
		assert.deepEqual(
			{ status: publicProbe.status, code: publicProbe.code },
			{ status: 'up', code: 403 }
		);
	} finally {
		globalThis.fetch = originalFetch;
	}
});

test('different Access credentials do not share cached probe results', async () => {
	const originalFetch = globalThis.fetch;
	let calls = 0;
	globalThis.fetch = async () => {
		calls += 1;
		return new Response(null, { status: calls === 1 ? 200 : 503 });
	};

	try {
		const url = 'https://one.workers.dev/health';
		assert.equal((await probe(url, 1000, 10_000, accessAuth('first').optionsFor(url))).status, 'up');
		assert.equal((await probe(url, 1000, 10_000, accessAuth('rotated').optionsFor(url))).status, 'down');
		// The rotated scope performs a new HEAD probe, then preserves the
		// established GET fallback for a 5xx response.
		assert.equal(calls, 3);
	} finally {
		globalThis.fetch = originalFetch;
	}
});
