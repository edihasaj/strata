<script lang="ts">
	import type { ServiceItem } from '$lib/config';

	let { item, onclose }: { item: ServiceItem; onclose: () => void } = $props();

	let loaded = $state(false);
	let slow = $state(false);

	// Some self-hosted apps send X-Frame-Options/CSP and refuse to embed. We can't
	// read that cross-origin, so after a grace period we surface an escape hatch.
	$effect(() => {
		const t = setTimeout(() => {
			if (!loaded) slow = true;
		}, 3500);
		return () => clearTimeout(t);
	});

	function onkeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') onclose();
	}
</script>

<svelte:window {onkeydown} />

<div
	class="backdrop"
	role="button"
	tabindex="-1"
	aria-label="Close preview"
	onclick={onclose}
	onkeydown={(e) => e.key === 'Enter' && onclose()}
></div>

<div class="modal" role="dialog" aria-modal="true" aria-label={`${item.name} preview`}>
	<header>
		<div class="title">
			{#if item.icon && /\.(svg|png|jpe?g|webp|gif|ico)$/i.test(item.icon)}
				<img src={item.icon} alt="" />
			{/if}
			<div>
				<strong>{item.name}</strong>
				<span class="url">{item.url}</span>
			</div>
		</div>
		<div class="actions">
			<a class="btn" href={item.url} target="_blank" rel="noopener">Open ↗</a>
			<button class="btn btn--icon" onclick={onclose} aria-label="Close">✕</button>
		</div>
	</header>

	<div class="frame">
		{#if !loaded}
			<div class="loading">
				<span class="spin"></span>
				<p>{slow ? 'Still loading — this app may block embedding.' : 'Loading live preview…'}</p>
				{#if slow}<a class="btn" href={item.url} target="_blank" rel="noopener">Open in new tab</a>{/if}
			</div>
		{/if}
		<iframe title={`${item.name} live preview`} src={item.url} onload={() => (loaded = true)}></iframe>
	</div>
</div>

<style>
	.backdrop {
		position: fixed;
		inset: 0;
		background: rgba(4, 6, 10, 0.66);
		backdrop-filter: blur(6px);
		z-index: 40;
		animation: fade 0.2s;
	}
	.modal {
		position: fixed;
		z-index: 41;
		inset: 3.5vh 3vw;
		display: flex;
		flex-direction: column;
		background: var(--bg);
		border: 1px solid var(--border-strong);
		border-radius: 18px;
		overflow: hidden;
		box-shadow: 0 40px 120px -30px rgba(0, 0, 0, 0.7);
		animation: pop 0.25s cubic-bezier(0.2, 0.9, 0.2, 1);
	}
	header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		padding: 0.7rem 0.85rem;
		border-bottom: 1px solid var(--border);
		background: var(--bg-elev);
	}
	.title {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		min-width: 0;
	}
	.title img {
		width: 26px;
		height: 26px;
		object-fit: contain;
	}
	.title strong {
		font-family: var(--font-display);
		display: block;
		font-size: 0.95rem;
	}
	.url {
		font-size: 0.72rem;
		color: var(--text-faint);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		max-width: 52vw;
		display: block;
	}
	.actions {
		display: flex;
		gap: 0.45rem;
		flex: none;
	}
	.btn {
		font-family: var(--font-display);
		font-size: 0.82rem;
		font-weight: 500;
		padding: 0.42rem 0.7rem;
		border-radius: 9px;
		border: 1px solid var(--border-strong);
		background: var(--bg-elev-2);
		color: var(--text);
		cursor: pointer;
		transition: border-color 0.15s, color 0.15s;
	}
	.btn:hover {
		border-color: var(--accent);
		color: var(--accent);
	}
	.btn--icon {
		padding: 0.42rem 0.6rem;
	}
	.frame {
		position: relative;
		flex: 1;
		background: var(--bg-elev);
	}
	iframe {
		width: 100%;
		height: 100%;
		border: 0;
		background: #fff;
	}
	.loading {
		position: absolute;
		inset: 0;
		display: grid;
		place-content: center;
		justify-items: center;
		gap: 0.9rem;
		color: var(--text-dim);
		background: var(--bg);
		z-index: 1;
	}
	.loading p {
		margin: 0;
		font-size: 0.85rem;
	}
	.spin {
		width: 30px;
		height: 30px;
		border-radius: 50%;
		border: 3px solid var(--border-strong);
		border-top-color: var(--accent);
		animation: rot 0.8s linear infinite;
	}
	@keyframes rot {
		to {
			transform: rotate(360deg);
		}
	}
	@keyframes fade {
		from {
			opacity: 0;
		}
	}
	@keyframes pop {
		from {
			opacity: 0;
			transform: scale(0.98) translateY(8px);
		}
	}
	@media (max-width: 640px) {
		.modal {
			inset: 0;
			border-radius: 0;
			border: 0;
		}
		.url {
			max-width: 40vw;
		}
	}
</style>
