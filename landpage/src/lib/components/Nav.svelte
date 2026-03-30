<script lang="ts">
	import { ChevronDown } from '@lucide/svelte';

	const REPO = 'https://github.com/ameshdev/amesh';

	const useCases = [
		{ slug: 'microservices', title: 'Microservices', desc: 'Service-to-service identity' },
		{ slug: 'ci-cd', title: 'CI/CD Pipelines', desc: 'Pipelines without stored secrets' },
		{ slug: 'webhooks', title: 'Webhooks', desc: 'Prove sender identity' },
		{ slug: 'kubernetes', title: 'Kubernetes', desc: 'Per-pod identity without Vault' },
	];

	let dropdownOpen = $state(false);
</script>

<nav class="sticky top-0 z-10 border-b border-zinc-800 bg-zinc-950/85 backdrop-blur-sm">
	<div class="mx-auto flex h-14 max-w-2xl items-center justify-between px-6">
		<a href="/" class="font-mono text-lg font-semibold text-zinc-50 no-underline">amesh</a>
		<div class="flex items-center gap-5">
			<div class="relative">
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
						{#each useCases as uc, i}
							<a
								href="/use-cases/{uc.slug}"
								class="flex flex-col rounded-md px-3 py-2.5 no-underline hover:bg-zinc-800 transition-colors"
								onclick={() => dropdownOpen = false}
							>
								<span class="text-sm font-medium text-zinc-50">{uc.title}</span>
								<span class="text-xs text-zinc-500">{uc.desc}</span>
							</a>
							{#if i < useCases.length - 1}
								<div class="my-0.5 border-b border-zinc-800"></div>
							{/if}
						{/each}
					</div>
				{/if}
			</div>
			<a href="/docs" class="text-sm text-zinc-400 hover:text-zinc-50 no-underline transition">Docs</a>
			<a href={REPO} target="_blank" rel="noopener"
				class="rounded-md border border-zinc-800 px-3 py-1.5 text-sm text-zinc-400 no-underline transition hover:border-zinc-600 hover:text-zinc-50">
				GitHub
			</a>
		</div>
	</div>
</nav>
