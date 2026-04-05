<script lang="ts">
	import { Menu, X } from '@lucide/svelte';

	const REPO = 'https://github.com/ameshdev/amesh';

	let mobileOpen = $state(false);
</script>

<nav class="sticky top-0 z-10 border-b border-zinc-800 bg-zinc-950/85 backdrop-blur-sm">
	<div class="mx-auto flex h-14 max-w-6xl items-center justify-between px-6">
		<a href="/" class="font-mono text-lg font-semibold text-zinc-50 no-underline">amesh</a>
		<div class="flex items-center gap-6">
			<!-- Desktop nav links -->
			<a href="/docs" class="hidden text-sm text-zinc-400 hover:text-zinc-50 no-underline transition sm:block">Docs</a>
			<a href="/use-cases" class="hidden text-sm text-zinc-400 hover:text-zinc-50 no-underline transition sm:block">Use Cases</a>
			<a href="/blog" class="hidden text-sm text-zinc-400 hover:text-zinc-50 no-underline transition sm:block">Blog</a>
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
			<a href="/use-cases" onclick={() => mobileOpen = false} class="block text-sm text-zinc-300 no-underline transition hover:text-zinc-50">Use Cases</a>
			<a href="/blog" onclick={() => mobileOpen = false} class="block text-sm text-zinc-300 no-underline transition hover:text-zinc-50">Blog</a>
			<div class="border-t border-zinc-800 pt-3">
				<a href={REPO} target="_blank" rel="noopener" onclick={() => mobileOpen = false}
					class="inline-flex items-center gap-1.5 text-sm text-zinc-400 no-underline transition hover:text-zinc-50">
					<img src="/github-mark-white.svg" alt="" class="h-4 w-4 opacity-60" /> GitHub
				</a>
			</div>
		</div>
	{/if}
</nav>
