<script lang="ts">
	import { ChevronRight } from '@lucide/svelte';

	interface Crumb {
		label: string;
		href?: string;
	}

	interface Props {
		crumbs: Crumb[];
	}

	let { crumbs }: Props = $props();
</script>

<nav class="flex items-center gap-1.5 text-sm text-zinc-500">
	{#each crumbs as crumb, i}
		{#if i > 0}
			<ChevronRight size={12} class="text-zinc-700" />
		{/if}
		{#if crumb.href && i < crumbs.length - 1}
			<a href={crumb.href} class="no-underline transition hover:text-zinc-300">{crumb.label}</a>
		{:else}
			<span class="text-zinc-400">{crumb.label}</span>
		{/if}
	{/each}
</nav>
