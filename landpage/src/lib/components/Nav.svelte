<script lang="ts">
	import { ChevronDown, Menu, X } from '@lucide/svelte';
	import { useCasePages } from '$lib/navigation.js';

	const REPO = 'https://github.com/ameshdev/amesh';

	let dropdownOpen = $state(false);
	let mobileOpen = $state(false);
</script>

<nav class="sticky top-0 z-10 border-b border-zinc-800 bg-zinc-950/85 backdrop-blur-sm">
	<div class="mx-auto flex h-14 max-w-6xl items-center justify-between px-6">
		<a href="/" class="font-mono text-lg font-semibold text-zinc-50 no-underline">amesh</a>
		<div class="flex items-center gap-5">
			<!-- Desktop nav links -->
			<div class="relative hidden sm:block">
				<button
					onclick={() => dropdownOpen = !dropdownOpen}
					class="flex items-center gap-1 text-sm text-zinc-400 hover:text-zinc-50 transition cursor-pointer bg-transparent border-none"
				>
					Use Cases <ChevronDown size={14} />
				</button>
				{#if dropdownOpen}
					<!-- svelte-ignore a11y_no_static_element_interactions -->
					<div
						class="absolute right-0 top-10 w-72 rounded-lg border border-zinc-800 bg-zinc-900 p-2 shadow-xl"
						onmouseleave={() => dropdownOpen = false}
					>
						{#each useCasePages as uc, i}
							<a
								href="/use-cases/{uc.slug}"
								class="flex flex-col rounded-md px-3 py-2.5 no-underline hover:bg-zinc-800 transition-colors"
								onclick={() => dropdownOpen = false}
							>
								<span class="text-sm font-medium text-zinc-50">{uc.title}</span>
								<span class="text-xs text-zinc-500">{uc.desc}</span>
							</a>
							{#if i < useCasePages.length - 1}
								<div class="my-0.5 border-b border-zinc-800"></div>
							{/if}
						{/each}
					</div>
				{/if}
			</div>
			<a href="/docs" class="hidden text-sm text-zinc-400 hover:text-zinc-50 no-underline transition sm:block">Docs</a>
			<a href={REPO} target="_blank" rel="noopener"
				class="hidden sm:block text-zinc-400 no-underline transition hover:text-zinc-50" title="GitHub">
				<img src="/github-mark-white.svg" alt="GitHub" class="h-5 w-5 opacity-70 transition hover:opacity-100" />
			</a>
			<a href="/docs"
				class="rounded-md bg-emerald-500 px-3 py-1.5 text-sm font-semibold text-zinc-950 no-underline transition hover:bg-emerald-400">
				Get Started
			</a>
			<!-- Mobile hamburger -->
			<button
				onclick={() => mobileOpen = !mobileOpen}
				class="sm:hidden cursor-pointer bg-transparent border-none text-zinc-400 transition hover:text-zinc-50"
			>
				{#if mobileOpen}
					<X size={20} />
				{:else}
					<Menu size={20} />
				{/if}
			</button>
		</div>
	</div>

	<!-- Mobile menu panel -->
	{#if mobileOpen}
		<div class="sm:hidden border-t border-zinc-800 bg-zinc-950 px-6 py-4 space-y-3">
			<a href="/docs" onclick={() => mobileOpen = false} class="block text-sm text-zinc-300 no-underline transition hover:text-zinc-50">Docs</a>
			<div class="border-t border-zinc-800 pt-3">
				<div class="text-xs font-semibold uppercase tracking-wide text-zinc-600 mb-2">Use Cases</div>
				{#each useCasePages as uc}
					<a href="/use-cases/{uc.slug}" onclick={() => mobileOpen = false} class="block py-1.5 text-sm text-zinc-400 no-underline transition hover:text-zinc-50">
						{uc.title}
					</a>
				{/each}
			</div>
			<div class="border-t border-zinc-800 pt-3">
				<a href={REPO} target="_blank" rel="noopener" onclick={() => mobileOpen = false}
					class="inline-flex items-center gap-1.5 text-sm text-zinc-400 no-underline transition hover:text-zinc-50">
					<img src="/github-mark-white.svg" alt="" class="h-4 w-4 opacity-60" /> GitHub
				</a>
			</div>
		</div>
	{/if}
</nav>
