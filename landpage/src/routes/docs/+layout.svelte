<script lang="ts">
	import { page } from '$app/state';
	import DocsSidebar from '$lib/components/DocsSidebar.svelte';

	let { children } = $props();

	let slug = $derived.by(() => {
		const path = page.url.pathname.replace(/\/$/, '');
		return path === '/docs' ? '' : path.replace('/docs/', '');
	});
</script>

<div class="mx-auto max-w-6xl">
	<!-- Mobile sidebar (above content) -->
	<div class="px-6 pt-16 lg:hidden">
		<DocsSidebar currentSlug={slug} />
	</div>

	<div class="lg:flex lg:gap-8">
		<!-- Desktop sidebar -->
		<aside class="hidden lg:block lg:w-56 lg:shrink-0">
			<div class="sticky top-20 pt-16 pl-6">
				<DocsSidebar currentSlug={slug} />
			</div>
		</aside>

		<!-- Content -->
		<div class="min-w-0 flex-1">
			{@render children()}
		</div>
	</div>
</div>
