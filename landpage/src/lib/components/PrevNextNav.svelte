<script lang="ts">
	import { ChevronLeft, ChevronRight } from '@lucide/svelte';
	import type { NavLink } from '$lib/navigation.js';

	interface Props {
		prev?: NavLink;
		next?: NavLink;
	}

	let { prev, next }: Props = $props();
</script>

{#if prev || next}
	<div class="flex justify-between gap-4 pt-8 border-t border-zinc-800">
		{#if prev}
			<a href={prev.href} class="group flex items-center gap-3 rounded-lg border border-zinc-800 px-4 py-3 no-underline transition hover:border-zinc-700 flex-1">
				<ChevronLeft size={16} class="text-zinc-600 transition group-hover:text-zinc-400" />
				<div>
					{#if prev.section}<div class="text-xs text-zinc-600">{prev.section}</div>{/if}
					<div class="text-sm font-medium text-zinc-300 group-hover:text-zinc-50">{prev.label}</div>
				</div>
			</a>
		{:else}
			<div></div>
		{/if}
		{#if next}
			<a href={next.href} class="group flex items-center justify-end gap-3 rounded-lg border border-zinc-800 px-4 py-3 no-underline transition hover:border-zinc-700 flex-1 text-right">
				<div>
					{#if next.section}<div class="text-xs text-zinc-600">{next.section}</div>{/if}
					<div class="text-sm font-medium text-zinc-300 group-hover:text-zinc-50">{next.label}</div>
				</div>
				<ChevronRight size={16} class="text-zinc-600 transition group-hover:text-zinc-400" />
			</a>
		{:else}
			<div></div>
		{/if}
	</div>
{/if}
