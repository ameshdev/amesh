<script lang="ts">
	import { useCasePages } from '$lib/navigation.js';

	const REPO = 'https://github.com/ameshdev/amesh';
</script>

<footer class="border-t border-zinc-800 py-16">
	<div class="mx-auto max-w-6xl px-6">
		<div class="grid grid-cols-2 gap-8 sm:grid-cols-4">
			<!-- Brand -->
			<div>
				<span class="font-mono text-lg font-semibold text-zinc-50">amesh</span>
				<p class="mt-2 text-sm text-zinc-500">Device-bound M2M authentication. Zero static secrets.</p>
			</div>

			<!-- Product -->
			<div>
				<h4 class="text-xs font-semibold uppercase tracking-wide text-zinc-400">Product</h4>
				<div class="mt-3 flex flex-col gap-2">
					<a href="/docs" class="text-sm text-zinc-500 hover:text-zinc-300 no-underline transition">Docs</a>
					<a href="/docs/integration" class="text-sm text-zinc-500 hover:text-zinc-300 no-underline transition">Integration Guide</a>
					<a href="/docs/self-hosting" class="text-sm text-zinc-500 hover:text-zinc-300 no-underline transition">Self-Hosting</a>
					<a href="/use-cases" class="text-sm text-zinc-500 hover:text-zinc-300 no-underline transition">Use Cases</a>
				</div>
			</div>

			<!-- Resources -->
			<div>
				<h4 class="text-xs font-semibold uppercase tracking-wide text-zinc-400">Resources</h4>
				<div class="mt-3 flex flex-col gap-2">
					<a href={REPO} target="_blank" rel="noopener" class="inline-flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-300 no-underline transition">
						<img src="/github-mark-white.svg" alt="" class="h-3.5 w-3.5 opacity-50" />
						GitHub
					</a>
					<a href={REPO + '/blob/main/docs/protocol-spec.md'} target="_blank" rel="noopener" class="text-sm text-zinc-500 hover:text-zinc-300 no-underline transition">Protocol Spec</a>
					<a href={REPO + '/blob/main/docs/architecture-decisions.md'} target="_blank" rel="noopener" class="text-sm text-zinc-500 hover:text-zinc-300 no-underline transition">Architecture</a>
					<a href={REPO + '/releases'} target="_blank" rel="noopener" class="text-sm text-zinc-500 hover:text-zinc-300 no-underline transition">Changelog</a>
				</div>
			</div>

			<!-- Use Cases -->
			<div>
				<h4 class="text-xs font-semibold uppercase tracking-wide text-zinc-400">Use Cases</h4>
				<div class="mt-3 flex flex-col gap-2">
					{#each useCasePages as uc}
						<a href="/use-cases/{uc.slug}" class="text-sm text-zinc-500 hover:text-zinc-300 no-underline transition">{uc.title}</a>
					{/each}
				</div>
			</div>
		</div>

		<div class="mt-10 flex items-center justify-between border-t border-zinc-800 pt-6">
			<p class="text-xs text-zinc-600">MIT License</p>
			<p class="text-xs text-zinc-600">Built with SvelteKit</p>
		</div>
	</div>
</footer>
