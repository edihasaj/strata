<script lang="ts">
	import { onMount } from 'svelte';
	import type { ServiceItem } from '$lib/config';
	import { HealthMonitor } from '$lib/health.svelte';
	import ServiceCard from '$lib/components/ServiceCard.svelte';
	import PreviewModal from '$lib/components/PreviewModal.svelte';

	let { data } = $props();
	const cfg = $derived(data.config);

	// ---- health polling ----
	const health = new HealthMonitor(cfg.health.interval);
	onMount(() => {
		health.start();
		return () => health.stop();
	});

	// ---- theme ----
	type Theme = 'auto' | 'dark' | 'light';
	let theme = $state<Theme>(cfg.theme.default);

	function resolve(t: Theme): 'dark' | 'light' {
		if (t !== 'auto') return t;
		return typeof window !== 'undefined' &&
			window.matchMedia('(prefers-color-scheme: light)').matches
			? 'light'
			: 'dark';
	}

	onMount(() => {
		const saved = localStorage.getItem('theme') as Theme | null;
		if (saved) theme = saved;
	});

	$effect(() => {
		const root = document.documentElement;
		root.dataset.theme = resolve(theme);
		root.style.setProperty('--accent', cfg.theme.accent);
		root.style.setProperty('--accent2', cfg.theme.accent2);
		localStorage.setItem('theme', theme);
	});

	function cycleTheme() {
		theme = theme === 'auto' ? 'dark' : theme === 'dark' ? 'light' : 'auto';
	}
	const themeIcon = $derived(theme === 'auto' ? '◐' : theme === 'dark' ? '☾' : '☀');

	// ---- search ----
	let query = $state('');
	const q = $derived(query.trim().toLowerCase());

	function matches(it: ServiceItem): boolean {
		if (!q) return true;
		return (
			it.name.toLowerCase().includes(q) ||
			(it.subtitle?.toLowerCase().includes(q) ?? false) ||
			(it.tags?.some((t) => t.toLowerCase().includes(q)) ?? false)
		);
	}

	const filteredGroups = $derived(
		cfg.groups
			.map((g) => ({ ...g, items: g.items.filter(matches) }))
			.filter((g) => g.items.length > 0)
	);

	const resultCount = $derived(filteredGroups.reduce((n, g) => n + g.items.length, 0));

	// global "/" to focus search
	let searchEl: HTMLInputElement;
	function onkeydown(e: KeyboardEvent) {
		if (e.key === '/' && document.activeElement !== searchEl && !preview) {
			e.preventDefault();
			searchEl?.focus();
		}
		if (e.key === 'Escape' && document.activeElement === searchEl) {
			query = '';
			searchEl.blur();
		}
	}

	// ---- preview ----
	let preview = $state<ServiceItem | null>(null);
</script>

<svelte:head>
	<title>{cfg.title}{cfg.subtitle ? ` · ${cfg.subtitle}` : ''}</title>
</svelte:head>

<svelte:window {onkeydown} />

<header class="masthead">
	<div class="masthead-inner">
		<div class="brand">
			{#if cfg.logo}<img class="logo" src={cfg.logo} alt="" />{/if}
			<div class="titles">
				<h1>{cfg.title}</h1>
				{#if cfg.subtitle}<span class="subtitle">{cfg.subtitle}</span>{/if}
			</div>
		</div>

		<div class="controls">
			<div class="search">
				<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
					<circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" />
				</svg>
				<input
					bind:this={searchEl}
					bind:value={query}
					placeholder="Search services…"
					aria-label="Search services"
					spellcheck="false"
					autocomplete="off"
				/>
				<kbd>/</kbd>
			</div>

			<div
				class="status-pill"
				class:has-down={health.summary.down > 0}
				title="{health.summary.up} up / {health.summary.down} down"
			>
				<span class="live-dot"></span>
				<span class="s-up">{health.summary.up}</span>
				<span class="s-sep">up</span>
				{#if health.summary.down > 0}<span class="s-down">{health.summary.down} down</span>{/if}
			</div>

			<button class="icon-btn" onclick={cycleTheme} title="Theme: {theme}" aria-label="Toggle theme">
				{themeIcon}
			</button>
		</div>
	</div>
</header>

<div class="shell">
	<main>
		{#if resultCount === 0}
			<p class="empty">No services match “{query}”.</p>
		{/if}

		{#each filteredGroups as group (group.name)}
			<section class="group">
				<div class="group-head">
					{#if group.icon}<span class="g-icon">{group.icon}</span>{/if}
					<h2>{group.name}</h2>
					<span class="g-count">{group.items.length}</span>
					<span class="g-rule"></span>
				</div>
				<div class="grid">
					{#each group.items as item, i (item.name)}
						<ServiceCard
							{item}
							probe={health.get(item.health ?? item.url)}
							loading={health.loading}
							style="animation-delay: {Math.min(i * 40, 400)}ms"
							onpreview={(it) => (preview = it)}
						/>
					{/each}
				</div>
			</section>
		{/each}
	</main>

	{#if cfg.footer}
		<footer>{@html cfg.footer}</footer>
	{/if}
</div>

{#if preview}
	<PreviewModal item={preview} onclose={() => (preview = null)} />
{/if}

<style>
	.shell {
		max-width: var(--maxw);
		margin: 0 auto;
		padding: clamp(1rem, 3vw, 2.2rem);
		padding-bottom: 3rem;
	}

	/* ---- masthead: full-bleed sticky bar, content constrained ---- */
	.masthead {
		position: sticky;
		top: 0;
		z-index: 20;
		width: 100%;
		background: color-mix(in srgb, var(--bg) 80%, transparent);
		backdrop-filter: blur(16px) saturate(1.4);
		-webkit-backdrop-filter: blur(16px) saturate(1.4);
		border-bottom: 1px solid var(--border);
		box-shadow: 0 10px 30px -20px var(--shadow);
	}
	.masthead::after {
		/* thin accent hairline spanning the whole width */
		content: '';
		position: absolute;
		inset: auto 0 -1px;
		height: 1px;
		background: linear-gradient(90deg, transparent, var(--glow), transparent);
	}
	.masthead-inner {
		max-width: var(--maxw);
		margin: 0 auto;
		padding: 0.7rem clamp(1rem, 3vw, 2.2rem);
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		flex-wrap: wrap;
	}
	.brand {
		display: flex;
		align-items: center;
		gap: 0.85rem;
	}
	.logo {
		width: 44px;
		height: 44px;
		border-radius: 12px;
		object-fit: contain;
		filter: drop-shadow(0 4px 16px var(--glow));
	}
	.titles {
		display: flex;
		flex-direction: column;
		line-height: 1.1;
	}
	h1 {
		font-family: var(--font-display);
		font-size: 1.5rem;
		font-weight: 700;
		margin: 0;
		letter-spacing: -0.02em;
		background: linear-gradient(100deg, var(--text), var(--accent));
		-webkit-background-clip: text;
		background-clip: text;
		color: transparent;
	}
	.subtitle {
		font-size: 0.8rem;
		color: var(--text-dim);
		letter-spacing: 0.03em;
	}

	.controls {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		flex-wrap: wrap;
	}
	.search {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.5rem 0.7rem;
		border: 1px solid var(--border);
		border-radius: 11px;
		background: var(--card);
		color: var(--text-dim);
		transition: border-color 0.16s, box-shadow 0.16s;
		min-width: 210px;
	}
	.search:focus-within {
		border-color: var(--accent);
		box-shadow: 0 0 0 3px var(--glow);
	}
	.search input {
		border: 0;
		background: none;
		outline: none;
		color: var(--text);
		font-family: var(--font-body);
		font-size: 0.9rem;
		width: 100%;
		min-width: 0;
	}
	.search kbd {
		font-family: var(--font-display);
		font-size: 0.7rem;
		color: var(--text-faint);
		border: 1px solid var(--border);
		border-radius: 5px;
		padding: 0.05rem 0.35rem;
		flex: none;
	}
	.status-pill {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		font-family: var(--font-display);
		font-size: 0.78rem;
		padding: 0.45rem 0.75rem;
		border: 1px solid var(--border);
		border-radius: 11px;
		background: var(--card);
	}
	.live-dot {
		width: 7px;
		height: 7px;
		border-radius: 50%;
		background: var(--up);
		box-shadow: 0 0 0 0 color-mix(in srgb, var(--up) 60%, transparent);
		animation: livepulse 2.4s ease-out infinite;
	}
	.status-pill.has-down .live-dot {
		background: var(--down);
		box-shadow: 0 0 0 0 color-mix(in srgb, var(--down) 60%, transparent);
	}
	@keyframes livepulse {
		0% {
			box-shadow: 0 0 0 0 color-mix(in srgb, currentColor 0%, var(--up) 55%);
		}
		70% {
			box-shadow: 0 0 0 6px transparent;
		}
		100% {
			box-shadow: 0 0 0 0 transparent;
		}
	}
	.s-up {
		color: var(--up);
		font-weight: 600;
	}
	.s-sep {
		color: var(--text-faint);
	}
	.s-down {
		color: var(--down);
		font-weight: 600;
		border-left: 1px solid var(--border);
		padding-left: 0.4rem;
		margin-left: 0.15rem;
	}
	.icon-btn {
		width: 38px;
		height: 38px;
		flex: none;
		border: 1px solid var(--border);
		border-radius: 11px;
		background: var(--card);
		color: var(--text);
		font-size: 1.05rem;
		cursor: pointer;
		transition: border-color 0.16s, color 0.16s, background 0.16s;
	}
	.icon-btn:hover {
		border-color: var(--accent);
		color: var(--accent);
	}

	/* ---- groups ---- */
	.group {
		margin-bottom: 2rem;
	}
	.group-head {
		display: flex;
		align-items: center;
		gap: 0.55rem;
		margin-bottom: 0.9rem;
	}
	.g-icon {
		font-size: 1.1rem;
	}
	h2 {
		font-family: var(--font-display);
		font-size: 1.02rem;
		font-weight: 600;
		margin: 0;
		letter-spacing: 0.01em;
	}
	.g-count {
		font-family: var(--font-display);
		font-size: 0.72rem;
		color: var(--text-faint);
		background: var(--bg-elev-2);
		border-radius: 20px;
		padding: 0.1rem 0.5rem;
	}
	.g-rule {
		flex: 1;
		height: 1px;
		background: linear-gradient(90deg, var(--border), transparent);
		margin-left: 0.3rem;
	}
	.grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(230px, 1fr));
		gap: 0.85rem;
	}

	.empty {
		text-align: center;
		color: var(--text-dim);
		padding: 3rem 0;
	}

	footer {
		text-align: center;
		color: var(--text-faint);
		font-size: 0.82rem;
		margin-top: 2.5rem;
		padding-top: 1.5rem;
		border-top: 1px solid var(--border);
	}
	footer :global(a) {
		color: var(--accent);
	}
	footer :global(.heart) {
		color: var(--down);
	}

	@media (max-width: 560px) {
		.masthead {
			gap: 0.7rem;
		}
		.controls {
			width: 100%;
		}
		.search {
			flex: 1;
			min-width: 0;
		}
		.grid {
			grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
		}
	}
</style>
