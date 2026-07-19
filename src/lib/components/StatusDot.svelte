<script lang="ts">
	import type { Probe } from '$lib/server/health';

	let { probe, loading = false }: { probe?: Probe; loading?: boolean } = $props();

	const state = $derived(loading && !probe ? 'pending' : (probe?.status ?? 'pending'));
	const label = $derived(
		state === 'up'
			? probe?.latency != null
				? `Online · ${probe.latency} ms`
				: 'Online'
			: state === 'down'
				? 'Offline'
				: 'Checking…'
	);
</script>

<span class="dot dot--{state}" title={label} aria-label={label}></span>

<style>
	.dot {
		--c: var(--pending);
		width: 9px;
		height: 9px;
		border-radius: 50%;
		background: var(--c);
		box-shadow: 0 0 0 0 color-mix(in srgb, var(--c) 70%, transparent);
		flex: none;
	}
	.dot--up {
		--c: var(--up);
		animation: pulse 2.4s ease-out infinite;
	}
	.dot--down {
		--c: var(--down);
	}
	.dot--pending {
		--c: var(--pending);
		animation: blink 1s ease-in-out infinite;
	}
	@keyframes pulse {
		0% {
			box-shadow: 0 0 0 0 color-mix(in srgb, var(--c) 60%, transparent);
		}
		70% {
			box-shadow: 0 0 0 7px transparent;
		}
		100% {
			box-shadow: 0 0 0 0 transparent;
		}
	}
	@keyframes blink {
		50% {
			opacity: 0.35;
		}
	}
</style>
