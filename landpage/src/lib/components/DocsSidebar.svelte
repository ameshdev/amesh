<script lang="ts">
	import { ChevronDown } from '@lucide/svelte';
	import { docPages } from '$lib/navigation.js';

	interface Props {
		currentSlug: string;
	}

	let { currentSlug }: Props = $props();
	let mobileOpen = $state(false);

	const REPO = 'https://github.com/ameshdev/amesh';

	const guides = [
		...docPages.map((p) => ({ href: `/docs/${p.slug}`, label: p.title, external: false })),
		{ href: `${REPO}/blob/main/docs/guide.md`, label: 'Usage Guide', external: true },
	];

	const reference = [
		{ href: `${REPO}/blob/main/docs/protocol-spec.md`, label: 'Protocol Spec', external: true },
		{ href: `${REPO}/blob/main/docs/architecture-decisions.md`, label: 'Architecture Decisions', external: true },
	];

	const packages = [
		{ name: '@authmesh/core', href: 'https://www.npmjs.com/package/@authmesh/core' },
		{ name: '@authmesh/keystore', href: 'https://www.npmjs.com/package/@authmesh/keystore' },
		{ name: '@authmesh/sdk', href: 'https://www.npmjs.com/package/@authmesh/sdk' },
		{ name: '@authmesh/cli', href: 'https://www.npmjs.com/package/@authmesh/cli' },
		{ name: '@authmesh/relay', href: 'https://www.npmjs.com/package/@authmesh/relay' },
	];

	function isActive(href: string): boolean {
		return href === `/docs/${currentSlug}`;
	}
</script>

<!-- Desktop: always visible -->
<nav class="hidden lg:block">
	<div class="text-[10px] font-semibold uppercase tracking-widest text-zinc-600 mb-3">Guides</div>
	<div class="space-y-0.5 border-l border-zinc-800 mb-6">
		{#each guides as item}
			<a
				href={item.href}
				target={item.external ? '_blank' : undefined}
				rel={item.external ? 'noopener noreferrer' : undefined}
				class="block py-1 pl-3 text-xs no-underline transition
					{isActive(item.href) ? 'text-zinc-50 border-l-2 border-emerald-400 -ml-px font-medium' : 'text-zinc-400 hover:text-zinc-200'}"
			>
				{item.label}{#if item.external}<span class="ml-1 text-zinc-600">↗</span>{/if}
			</a>
		{/each}
	</div>

	<div class="text-[10px] font-semibold uppercase tracking-widest text-zinc-600 mb-3">Reference</div>
	<div class="space-y-0.5 border-l border-zinc-800 mb-6">
		{#each reference as item}
			<a
				href={item.href}
				target="_blank"
				rel="noopener noreferrer"
				class="block py-1 pl-3 text-xs text-zinc-400 no-underline transition hover:text-zinc-200"
			>
				{item.label}<span class="ml-1 text-zinc-600">↗</span>
			</a>
		{/each}
	</div>

	<div class="text-[10px] font-semibold uppercase tracking-widest text-zinc-600 mb-3">Packages</div>
	<div class="space-y-0.5 border-l border-zinc-800">
		{#each packages as pkg}
			<a
				href={pkg.href}
				target="_blank"
				rel="noopener noreferrer"
				class="block py-1 pl-3 text-xs text-zinc-400 no-underline transition hover:text-zinc-200"
			>
				{pkg.name}<span class="ml-1 text-zinc-600">↗</span>
			</a>
		{/each}
	</div>
</nav>

<!-- Mobile: collapsible dropdown -->
<div class="lg:hidden mb-6">
	<button
		onclick={() => mobileOpen = !mobileOpen}
		class="flex w-full items-center justify-between rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-xs text-zinc-400 cursor-pointer bg-transparent transition hover:border-zinc-700"
	>
		<span>Navigation</span>
		<ChevronDown size={14} class="transition {mobileOpen ? 'rotate-180' : ''}" />
	</button>
	{#if mobileOpen}
		<div class="mt-1 rounded-lg border border-zinc-800 bg-zinc-900 p-2">
			<div class="text-[10px] font-semibold uppercase tracking-widest text-zinc-600 px-3 pt-1 pb-2">Guides</div>
			{#each guides as item}
				<a
					href={item.href}
					target={item.external ? '_blank' : undefined}
					rel={item.external ? 'noopener noreferrer' : undefined}
					onclick={() => { if (!item.external) mobileOpen = false; }}
					class="block rounded px-3 py-1.5 text-xs no-underline transition
						{isActive(item.href) ? 'text-zinc-50 bg-zinc-800 font-medium' : 'text-zinc-400 hover:bg-zinc-800 hover:text-zinc-300'}"
				>
					{item.label}{#if item.external}<span class="ml-1 text-zinc-600">↗</span>{/if}
				</a>
			{/each}

			<div class="text-[10px] font-semibold uppercase tracking-widest text-zinc-600 px-3 pt-3 pb-2">Reference</div>
			{#each reference as item}
				<a
					href={item.href}
					target="_blank"
					rel="noopener noreferrer"
					class="block rounded px-3 py-1.5 text-xs text-zinc-400 no-underline transition hover:bg-zinc-800 hover:text-zinc-300"
				>
					{item.label}<span class="ml-1 text-zinc-600">↗</span>
				</a>
			{/each}

			<div class="text-[10px] font-semibold uppercase tracking-widest text-zinc-600 px-3 pt-3 pb-2">Packages</div>
			{#each packages as pkg}
				<a
					href={pkg.href}
					target="_blank"
					rel="noopener noreferrer"
					class="block rounded px-3 py-1.5 text-xs text-zinc-400 no-underline transition hover:bg-zinc-800 hover:text-zinc-300"
				>
					{pkg.name}<span class="ml-1 text-zinc-600">↗</span>
				</a>
			{/each}
		</div>
	{/if}
</div>
