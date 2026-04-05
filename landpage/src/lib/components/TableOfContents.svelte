<script lang="ts">
	import { ChevronDown } from '@lucide/svelte';
	import { onMount } from 'svelte';

	interface TocItem {
		id: string;
		label: string;
	}

	interface Props {
		items: TocItem[];
	}

	let { items }: Props = $props();
	let activeId = $state('');
	let mobileOpen = $state(false);

	onMount(() => {
		const elements = items
			.map((item) => document.getElementById(item.id))
			.filter((el): el is HTMLElement => el !== null);

		if (elements.length === 0) return;

		const observer = new IntersectionObserver(
			(entries) => {
				for (const entry of entries) {
					if (entry.isIntersecting) {
						activeId = entry.target.id;
					}
				}
			},
			{ rootMargin: '-80px 0px -70% 0px' },
		);

		for (const el of elements) observer.observe(el);
		return () => observer.disconnect();
	});
</script>

<!-- Desktop (2xl+): sticky right rail, positioned to the right of the content column -->
<div class="hidden 2xl:block">
	<div
		class="fixed top-20 w-48"
		style="left: min(calc(50vw + 30rem), calc(100vw - 13.5rem));"
	>
		<div class="text-[10px] font-semibold uppercase tracking-widest text-zinc-600 mb-3">On this page</div>
		<div class="space-y-0.5 border-l border-zinc-800">
			{#each items as item}
				<a
					href="#{item.id}"
					class="block py-1 pl-3 text-xs no-underline transition
						{activeId === item.id ? 'text-zinc-50 border-l-2 border-emerald-400 -ml-px' : 'text-zinc-500 hover:text-zinc-300'}"
				>
					{item.label}
				</a>
			{/each}
		</div>
	</div>
</div>

<!-- Below 2xl: collapsible section inline with content -->
<div class="2xl:hidden mb-6">
	<button
		onclick={() => mobileOpen = !mobileOpen}
		class="flex w-full items-center justify-between rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-xs text-zinc-400 cursor-pointer bg-transparent transition hover:border-zinc-700"
	>
		<span>On this page</span>
		<ChevronDown size={14} class="transition {mobileOpen ? 'rotate-180' : ''}" />
	</button>
	{#if mobileOpen}
		<div class="mt-1 rounded-lg border border-zinc-800 bg-zinc-900 p-2 space-y-0.5">
			{#each items as item}
				<a
					href="#{item.id}"
					onclick={() => mobileOpen = false}
					class="block rounded px-3 py-1.5 text-xs text-zinc-400 no-underline transition hover:bg-zinc-800 hover:text-zinc-300"
				>
					{item.label}
				</a>
			{/each}
		</div>
	{/if}
</div>
