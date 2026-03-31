<script lang="ts">
	import CodeBlock from './CodeBlock.svelte';
	import type { Component } from 'svelte';

	interface Props {
		icon: Component;
		badge: string;
		headline: string;
		subtitle: string;
		painTitle: string;
		painPoints: { lead: string; detail: string }[];
		codeTabs: { filename: string; code: string }[];
		changes: { before: string; after: string }[];
	}

	let { icon: Icon, badge, headline, subtitle, painTitle, painPoints, codeTabs, changes }: Props = $props();
	let activeTab = $state(0);

	const REPO = 'https://github.com/ameshdev/amesh';
</script>

<div class="mx-auto max-w-2xl px-6 pb-20">

	<!-- Hero -->
	<section class="pt-16 pb-10">
		<div class="inline-flex items-center gap-1.5 rounded-full bg-zinc-800 px-3 py-1 text-xs font-medium text-zinc-300">
			<Icon size={14} />
			{badge}
		</div>
		<h1 class="mt-5 max-w-lg text-3xl font-bold leading-tight text-zinc-50">{headline}</h1>
		<p class="mt-4 max-w-lg text-lg leading-relaxed text-zinc-400">{subtitle}</p>
	</section>

	<!-- Pain points -->
	<section class="py-10">
		<h2 class="text-xl font-semibold text-zinc-50">{painTitle}</h2>
		<div class="mt-5 space-y-3">
			{#each painPoints as point}
				<div class="border-l-2 border-red-400/60 py-2 pl-4">
					<div class="text-sm font-semibold text-zinc-50">{point.lead}</div>
					<div class="mt-0.5 text-sm text-zinc-400">{point.detail}</div>
				</div>
			{/each}
		</div>
	</section>

	<!-- Code -->
	<section class="py-10">
		<h2 class="text-xl font-semibold text-zinc-50">The solution</h2>
		<div class="mt-5 overflow-hidden rounded-lg border border-zinc-800">
			<div class="flex border-b border-zinc-800 bg-zinc-900">
				{#each codeTabs as tab, i}
					<button
						onclick={() => activeTab = i}
						class="cursor-pointer border-none bg-transparent px-4 py-2.5 font-mono text-xs transition
							{activeTab === i ? 'text-emerald-400 border-b-2 border-emerald-400 -mb-px' : 'text-zinc-500 hover:text-zinc-300'}"
					>
						{tab.filename}
					</button>
				{/each}
			</div>
			<pre class="p-4 font-mono text-[13px] leading-relaxed whitespace-pre-wrap break-all" style="background:#0C0C0E">{@html codeTabs[activeTab].code}</pre>
		</div>
	</section>

	<!-- What changes -->
	<section class="py-10">
		<h2 class="text-xl font-semibold text-zinc-50">What changes</h2>
		<div class="mt-5 grid grid-cols-2 gap-4">
			<div>
				<div class="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-red-400">
					<span class="h-1.5 w-1.5 rounded-full bg-red-400"></span> Before
				</div>
				{#each changes as row}
					<div class="border-b border-zinc-800/50 py-2 text-sm text-zinc-400">{row.before}</div>
				{/each}
			</div>
			<div>
				<div class="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-emerald-400">
					<span class="h-1.5 w-1.5 rounded-full bg-emerald-400"></span> After
				</div>
				{#each changes as row}
					<div class="border-b border-zinc-800/50 py-2 text-sm text-zinc-50">{row.after}</div>
				{/each}
			</div>
		</div>
	</section>

	<!-- CTA -->
	<section class="py-10">
		<h2 class="text-xl font-semibold text-zinc-50">Try it</h2>
		<div class="mt-5">
			<CodeBlock code={`<span class="text-zinc-500">$</span> <span class="text-zinc-50">git clone ${REPO}.git</span>\n<span class="text-zinc-500">$</span> <span class="text-zinc-50">cd authmesh && pnpm install && pnpm build</span>`} />
		</div>
		<div class="mt-4 flex gap-4">
			<a href="/docs/integration" class="text-sm text-emerald-400 hover:underline">Integration guide</a>
			<span class="text-zinc-700">·</span>
			<a href="/docs" class="text-sm text-emerald-400 hover:underline">All docs</a>
			<span class="text-zinc-700">·</span>
			<a href={REPO} target="_blank" rel="noopener" class="text-sm text-emerald-400 hover:underline">Star on GitHub</a>
		</div>
	</section>
</div>
