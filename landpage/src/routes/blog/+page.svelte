<script lang="ts">
	import { Calendar, Clock } from '@lucide/svelte';
	import { posts } from '$lib/blog.js';
	import { jsonLdScript, breadcrumbList } from '$lib/seo.js';

	function formatDate(iso: string): string {
		const d = new Date(iso);
		return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
	}
</script>

<svelte:head>
	<title>Blog — amesh</title>
	<meta name="description" content="Essays, release notes, and technical deep-dives on device-bound machine-to-machine authentication." />
	<link rel="canonical" href="https://authmesh.dev/blog" />
	<meta property="og:title" content="Blog — amesh" />
	<meta property="og:description" content="Essays, release notes, and technical deep-dives from the amesh team." />
	<meta property="og:url" content="https://authmesh.dev/blog" />
	{@html jsonLdScript(breadcrumbList([
		{ name: 'Home', url: '/' },
		{ name: 'Blog', url: '/blog' }
	]))}
	{@html jsonLdScript({
		'@context': 'https://schema.org',
		'@type': 'Blog',
		'@id': 'https://authmesh.dev/blog',
		name: 'amesh Blog',
		url: 'https://authmesh.dev/blog',
		description: 'Essays, release notes, and technical deep-dives on device-bound M2M authentication.',
		publisher: { '@type': 'Organization', '@id': 'https://authmesh.dev/#organization', name: 'amesh' },
		blogPost: posts.map((p) => ({
			'@type': 'BlogPosting',
			headline: p.title,
			description: p.description,
			datePublished: p.date,
			url: `https://authmesh.dev/blog/${p.slug}`,
			author: { '@type': 'Organization', name: 'amesh' }
		}))
	})}
</svelte:head>

<div class="mx-auto max-w-3xl px-6 pb-20">
	<section class="pt-16 pb-10">
		<div class="text-[11px] font-semibold uppercase tracking-[0.2em] text-emerald-400/80">Blog</div>
		<h1 class="mt-3 text-4xl font-bold tracking-tight text-zinc-50">Writing from the amesh team</h1>
		<p class="mt-4 max-w-xl text-lg text-zinc-400">
			Essays, release notes, and technical deep-dives on device-bound authentication, secret management, and why we think the industry's approach to machine identity is broken.
		</p>
	</section>

	<section class="space-y-4">
		{#each posts as post}
			<a
				href="/blog/{post.slug}"
				class="group block rounded-xl border border-zinc-800 bg-zinc-900/30 p-6 no-underline transition-all duration-200 hover:-translate-y-0.5 hover:border-emerald-400/30 hover:bg-zinc-900 hover:shadow-xl hover:shadow-emerald-950/20"
			>
				<div class="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-zinc-500">
					<span class="inline-flex items-center gap-1.5">
						<Calendar size={12} />
						{formatDate(post.date)}
					</span>
					<span class="inline-flex items-center gap-1.5">
						<Clock size={12} />
						{post.readingTime}
					</span>
					<div class="flex gap-1.5">
						{#each post.tags as tag}
							<span class="rounded-full bg-zinc-800/60 px-2 py-0.5 text-[10px] text-zinc-400">{tag}</span>
						{/each}
					</div>
				</div>
				<h2 class="mt-3 text-xl font-semibold text-zinc-50 group-hover:text-emerald-400 transition-colors">{post.title}</h2>
				<p class="mt-2 text-sm leading-relaxed text-zinc-400">{post.description}</p>
				<div class="mt-4 text-sm text-emerald-400">Read more &rarr;</div>
			</a>
		{/each}
	</section>

	<section class="mt-16 pt-8 border-t border-zinc-800">
		<p class="text-sm text-zinc-500">
			Looking for release notes? See the full
			<a href="/docs/changelog" class="text-emerald-400 no-underline hover:underline">changelog</a>.
		</p>
	</section>
</div>
