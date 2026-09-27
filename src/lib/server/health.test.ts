import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, before, test } from 'node:test';
import type { DashboardConfig } from '$lib/config';
import { probe, probeTargets } from './health.ts';

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
