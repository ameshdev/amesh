<script lang="ts">
	import type { RelatedLink } from '$lib/navigation.js';

	interface Props {
		links: RelatedLink[];
	}

	let { links }: Props = $props();
</script>

{#if links.length > 0}
	<div class="pt-8">
		<div class="text-xs font-semibold uppercase tracking-wide text-zinc-600 mb-3">Related</div>
		<div class="grid gap-2 sm:grid-cols-2">
			{#each links as link}
				<a href={link.href} class="group flex flex-col rounded-lg border border-zinc-800 p-3 no-underline transition hover:border-zinc-700">
					<div class="flex items-center gap-2">
						<span class="rounded px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide
							{link.type === 'doc' ? 'bg-emerald-400/10 text-emerald-400' : 'bg-zinc-800 text-zinc-400'}">
							{link.type === 'doc' ? 'Doc' : 'Use Case'}
						</span>
						<span class="text-sm font-medium text-zinc-300 group-hover:text-zinc-50">{link.title}</span>
					</div>
					<span class="mt-1 text-xs text-zinc-500">{link.desc}</span>
				</a>
			{/each}
		</div>
	</div>
{/if}
