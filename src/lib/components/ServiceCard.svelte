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
</script>

<article class="card" {style}>
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
