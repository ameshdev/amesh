<script lang="ts">
	import { Copy, Check } from '@lucide/svelte';

	let { code, label = '' }: { code: string; label?: string } = $props();
	let copied = $state(false);

	function copyCode() {
		const plain = code.replace(/<[^>]*>/g, '');
		navigator.clipboard.writeText(plain);
		copied = true;
		setTimeout(() => copied = false, 2000);
	}
</script>

<div class="relative overflow-x-auto rounded-lg border border-zinc-800" style="background:#0C0C0E">
	{#if label}
		<div class="absolute top-2.5 right-12 font-mono text-[11px] text-zinc-600">{label}</div>
	{/if}
	<button onclick={copyCode} class="absolute top-2.5 right-3 cursor-pointer border-none bg-transparent text-zinc-600 hover:text-zinc-300 transition">
		{#if copied}
			<Check size={14} class="text-emerald-400" />
		{:else}
			<Copy size={14} />
		{/if}
	</button>
	<pre class="p-4 font-mono text-[13px] leading-relaxed whitespace-pre-wrap break-all">{@html code}</pre>
</div>
