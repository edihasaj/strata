<script lang="ts">
	import type { ServiceItem } from '$lib/config';
	import type { Probe } from '$lib/server/health';
	import StatusDot from './StatusDot.svelte';

	let {
		item,
		probe,
		loading = false,
		style = '',
		onpreview
	}: {
		item: ServiceItem;
		probe?: Probe;
		loading?: boolean;
		style?: string;
		onpreview?: (item: ServiceItem) => void;
	} = $props();

	const isImage = $derived(!!item.icon && /^(https?:)?\/|\.(svg|png|jpe?g|webp|gif|ico)$/i.test(item.icon));
	const emoji = $derived(!isImage ? (item.icon ?? item.name.slice(0, 1)) : '');

	// Inline live preview: only mount the iframe once the card scrolls into view,
	// so a wall of cards doesn't fire dozens of requests at load.
	let cardEl: HTMLElement;
	let inView = $state(false);
	let frameLoaded = $state(false);

	$effect(() => {
		if (!item.livePreview || !cardEl || inView) return;
		const io = new IntersectionObserver(
			(entries) => {
				if (entries.some((e) => e.isIntersecting)) {
					inView = true;
					io.disconnect();
				}
			},
			{ rootMargin: '200px' }
		);
		io.observe(cardEl);
		return () => io.disconnect();
	});
</script>

<article class="card" class:has-live={item.livePreview} bind:this={cardEl} {style}>
	{#if item.livePreview}
		<a
			class="live"
			href={item.url}
			target={item.target ?? '_self'}
			rel="noopener"
			aria-label="{item.name} live preview"
			class:ready={frameLoaded}
		>
			{#if inView}
				<iframe
					title="{item.name} preview"
					src={item.url}
					scrolling="no"
					tabindex="-1"
					aria-hidden="true"
					loading="lazy"
					onload={() => (frameLoaded = true)}
				></iframe>
			{/if}
			{#if !frameLoaded}<span class="live-spin"></span>{/if}
			<span class="live-fade"></span>
		</a>
	{/if}
	<a class="hit" href={item.url} target={item.target ?? '_self'} rel="noopener" aria-label={item.name}>
		<div class="icon" class:emoji={!isImage}>
			{#if isImage}
				<img src={item.icon} alt="" loading="lazy" />
			{:else}
				<span>{emoji}</span>
			{/if}
		</div>
		<div class="meta">
			<div class="top">
				<h3>{item.name}</h3>
				<StatusDot {probe} {loading} />
			</div>
			{#if item.subtitle}<p class="sub">{item.subtitle}</p>{/if}
			<div class="foot">
				{#if probe?.status === 'up' && probe.latency != null}
					<span class="lat">{probe.latency} ms</span>
				{:else if probe?.status === 'down'}
					<span class="lat lat--down">offline</span>
				{/if}
			</div>
		</div>
	</a>
	{#if item.preview}
		<button
			class="preview-btn"
			title="Live preview"
			aria-label={`Preview ${item.name}`}
			onclick={() => onpreview?.(item)}
		>
			<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
				<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
				<circle cx="12" cy="12" r="3" />
			</svg>
		</button>
	{/if}
</article>

<style>
	.card {
		position: relative;
		border: 1px solid var(--border);
		background: var(--card);
		border-radius: var(--radius);
		transition:
			transform 0.18s cubic-bezier(0.2, 0.8, 0.2, 1),
			border-color 0.18s,
			background 0.18s,
			box-shadow 0.18s;
		backdrop-filter: blur(12px) saturate(1.2);
		-webkit-backdrop-filter: blur(12px) saturate(1.2);
		animation: rise 0.5s both;
	}
	.card:hover {
		transform: translateY(-3px);
		background: var(--card-hover);
		border-color: var(--border-strong);
		box-shadow:
			0 12px 30px -12px var(--shadow),
			0 0 0 1px var(--glow),
			0 8px 40px -20px var(--glow);
	}
	.card.has-live {
		overflow: hidden;
	}

	/* ---- inline live preview ---- */
	.live {
		position: relative;
		display: block;
		height: 138px;
		overflow: hidden;
		background: var(--bg-elev-2);
		border-bottom: 1px solid var(--border);
	}
	.live iframe {
		position: absolute;
		inset: 0;
		/* Render the site at ~4x the card width (desktop layout) then scale it
		   down to fit, so the card shows a real, legible thumbnail. */
		width: 400%;
		height: 400%;
		border: 0;
		transform: scale(0.25);
		transform-origin: 0 0;
		pointer-events: none;
		opacity: 0;
		transition: opacity 0.4s ease;
		background: #fff;
	}
	.live.ready iframe {
		opacity: 1;
	}
	.live-fade {
		position: absolute;
		inset: 0;
		pointer-events: none;
		background: linear-gradient(180deg, transparent 55%, color-mix(in srgb, var(--card) 55%, transparent));
	}
	.card:hover .live iframe {
		transform: scale(0.26);
	}
	.live-spin {
		position: absolute;
		top: 50%;
		left: 50%;
		width: 20px;
		height: 20px;
		margin: -10px 0 0 -10px;
		border-radius: 50%;
		border: 2px solid var(--border-strong);
		border-top-color: var(--accent);
		animation: spin 0.8s linear infinite;
	}
	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}
	.hit {
		display: flex;
		gap: 0.85rem;
		align-items: center;
		padding: 0.9rem 1rem;
	}
	.icon {
		width: 42px;
		height: 42px;
		flex: none;
		display: grid;
		place-items: center;
		border-radius: 11px;
		overflow: hidden;
	}
	.icon img {
		width: 100%;
		height: 100%;
		object-fit: contain;
	}
	.icon.emoji {
		background: var(--bg-elev-2);
		font-size: 1.35rem;
		line-height: 1;
	}
	.meta {
		min-width: 0;
		flex: 1;
	}
	.top {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}
	h3 {
		font-family: var(--font-display);
		font-size: 0.98rem;
		font-weight: 600;
		margin: 0;
		letter-spacing: -0.01em;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.sub {
		margin: 0.1rem 0 0;
		font-size: 0.8rem;
		color: var(--text-dim);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.foot {
		height: 0.95rem;
		margin-top: 0.15rem;
	}
	.lat {
		font-family: var(--font-display);
		font-size: 0.68rem;
		font-weight: 500;
		letter-spacing: 0.02em;
		color: var(--text-faint);
	}
	.lat--down {
		color: var(--down);
	}
	.preview-btn {
		position: absolute;
		top: 0.55rem;
		right: 0.55rem;
		width: 28px;
		height: 28px;
		display: grid;
		place-items: center;
		border-radius: 8px;
		border: 1px solid var(--border);
		background: var(--bg-elev-2);
		color: var(--text-dim);
		cursor: pointer;
		opacity: 0;
		transform: translateY(-3px);
		transition:
			opacity 0.16s,
			transform 0.16s,
			color 0.16s,
			border-color 0.16s;
	}
	.card:hover .preview-btn,
	.preview-btn:focus-visible {
		opacity: 1;
		transform: none;
	}
	.preview-btn:hover {
		color: var(--accent);
		border-color: var(--accent);
	}
	@keyframes rise {
		from {
			opacity: 0;
			transform: translateY(10px);
		}
	}
	/* Touch: no hover, keep preview button visible */
	@media (hover: none) {
		.preview-btn {
			opacity: 1;
			transform: none;
		}
	}
</style>
