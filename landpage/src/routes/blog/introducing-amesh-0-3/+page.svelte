<script lang="ts">
	import { Calendar, Clock, ChevronLeft } from '@lucide/svelte';
	import CodeBlock from '$lib/components/CodeBlock.svelte';
	import { getPost, getPostNav } from '$lib/blog.js';
	import { jsonLdScript, graph, breadcrumbList, blogPosting } from '$lib/seo.js';

	const post = getPost('introducing-amesh-0-3')!;
	const { prev, next } = getPostNav('introducing-amesh-0-3');

	function formatDate(iso: string): string {
		const d = new Date(iso);
		return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
	}
</script>

<svelte:head>
	<title>{post.title} — amesh Blog</title>
	<meta name="description" content={post.description} />
	<link rel="canonical" href="https://authmesh.dev/blog/{post.slug}" />
	<meta property="og:type" content="article" />
	<meta property="og:title" content={post.title} />
	<meta property="og:description" content={post.description} />
	<meta property="og:url" content="https://authmesh.dev/blog/{post.slug}" />
	<meta property="article:published_time" content={post.date} />
	<meta property="article:author" content={post.author} />
	{#each post.tags as tag}
		<meta property="article:tag" content={tag} />
	{/each}
	{@html jsonLdScript(graph(
		breadcrumbList([
			{ name: 'Home', url: '/' },
			{ name: 'Blog', url: '/blog' },
			{ name: post.title, url: `/blog/${post.slug}` }
		]),
		blogPosting({
			title: post.title,
			description: post.description,
			url: `/blog/${post.slug}`,
			datePublished: post.date,
			section: 'Release'
		})
	))}
</svelte:head>

<article class="mx-auto max-w-2xl px-6 pb-20">
	<nav class="pt-16 pb-8">
		<a href="/blog" class="inline-flex items-center gap-1.5 text-sm text-zinc-500 no-underline transition hover:text-zinc-300">
			<ChevronLeft size={14} />
			Back to blog
		</a>
	</nav>

	<header class="pb-8 border-b border-zinc-800">
		<div class="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-zinc-500">
			<span class="inline-flex items-center gap-1.5"><Calendar size={12} />{formatDate(post.date)}</span>
			<span class="inline-flex items-center gap-1.5"><Clock size={12} />{post.readingTime}</span>
			<div class="flex gap-1.5">
				{#each post.tags as tag}
					<span class="rounded-full bg-zinc-800/60 px-2 py-0.5 text-[10px] text-zinc-400">{tag}</span>
				{/each}
			</div>
		</div>
		<h1 class="mt-4 text-4xl font-bold leading-tight tracking-tight text-zinc-50">{post.title}</h1>
		<p class="mt-4 text-lg text-zinc-400">{post.description}</p>
	</header>

	<div class="prose-custom pt-8 space-y-6 text-zinc-300 leading-relaxed">
		<p>
			0.3 isn't one release — it's a series. <code class="font-mono text-sm text-emerald-400">0.3.0</code> through <code class="font-mono text-sm text-emerald-400">0.3.3</code> shipped over four days, and taken together they represent the biggest quality-of-life jump since 0.1. If you haven't upgraded, this is a good time.
		</p>
		<p>
			Here's what's new, roughly in order of how much you'll notice it.
		</p>

		<h2 class="pt-4 text-2xl font-bold text-zinc-50">Auto-generated passphrases (the biggest UX fix)</h2>
		<p>
			The encrypted-file backend used to require a <code class="font-mono text-sm text-emerald-400">--passphrase</code> flag. It was technically defensible — "the user should control their own encryption passphrase" — but in practice it meant copy-pasting random strings, storing them in yet another place, and often typing them wrong at 2am. We removed the flag. <code class="font-mono text-sm text-emerald-400">amesh init</code> now generates a 256-bit random passphrase and stores it in <code class="font-mono text-sm">identity.json</code> alongside the encrypted key.
		</p>
		<p>
			We've written up the threat analysis of this decision in <a href="https://github.com/ameshdev/amesh/blob/main/docs/architecture-decisions.md" target="_blank" rel="noopener" class="text-emerald-400 no-underline hover:underline">ADR-010</a>. The short version: an attacker who can read <code class="font-mono text-sm">identity.json</code> has already defeated the model — they have filesystem access to the device — and co-locating the passphrase costs no real security while eliminating an entire class of user error.
		</p>

		<h2 class="pt-4 text-2xl font-bold text-zinc-50">You can see which backend was picked</h2>
		<p>
			<code class="font-mono text-sm text-emerald-400">amesh init</code> now shows the backend detection process as it happens, so you don't have to guess which tier you ended up on:
		</p>
		<CodeBlock code={`<span class="text-zinc-500">$</span> amesh init --name <span class="text-emerald-400">"api-server"</span>

Detecting key storage backend:
  Secure Enclave    not available (binary not signed)
  macOS Keychain    <span class="text-emerald-400">selected</span>

Identity created.
  Device ID     : <span class="text-emerald-400">am_cOixWcOdI8-pLh4P</span>
  Backend       : <span class="text-emerald-400">macOS Keychain</span>`} />
		<p>
			And <code class="font-mono text-sm text-emerald-400">amesh list</code> gained a "This device" section at the top showing your identity, backend, and creation date — no more <code class="font-mono text-sm">cat ~/.amesh/identity.json</code> just to check which tier is active.
		</p>

		<h2 class="pt-4 text-2xl font-bold text-zinc-50">Docs sidebar and a real IA</h2>
		<p>
			The docs used to be four flat guides. They're now organized into Introduction → Getting Started → Guides → Reference with a persistent left sidebar on every page, breadcrumbs, TOC, prev/next navigation, and cross-section links. There's a new <a href="/docs/quickstart" class="text-emerald-400 no-underline hover:underline">Quickstart</a>, a <a href="/docs/faq" class="text-emerald-400 no-underline hover:underline">FAQ</a>, and a <a href="/docs/troubleshooting" class="text-emerald-400 no-underline hover:underline">Troubleshooting</a> guide that consolidates every error message into one searchable place.
		</p>

		<h2 class="pt-4 text-2xl font-bold text-zinc-50">Security hardening</h2>
		<p>
			Several quiet-but-important fixes landed across 0.3.x:
		</p>
		<ul class="space-y-3">
			<li class="flex gap-3"><span class="text-emerald-400 mt-0.5">▸</span> <span><strong class="text-zinc-50">macOS Keychain stale key accumulation (0.3.1).</strong> <code class="font-mono text-sm">SecItemDelete</code> only removes one item per call; multiple <code class="font-mono text-sm">amesh init --force</code> runs were leaving orphaned keys in the Keychain under the same tag, which caused <code class="font-mono text-sm">selfSig verification failed</code> on remote peers during pairing and shell handshakes. We now loop the delete until all matching items are cleared.</span></li>
			<li class="flex gap-3"><span class="text-emerald-400 mt-0.5">▸</span> <span><strong class="text-zinc-50">Passphrase stripped from memory (0.3.0).</strong> At all 6 call sites where a KeyStore is constructed from an identity, we now <code class="font-mono text-sm">delete identity.passphrase</code> after the keystore is built. The passphrase lives on disk, not in memory any longer than necessary.</span></li>
			<li class="flex gap-3"><span class="text-emerald-400 mt-0.5">▸</span> <span><strong class="text-zinc-50">Atomic write for identity.json (0.3.0).</strong> The SDK bootstrap path now uses tmp + rename instead of a direct write, so a crash during init can't leave you with a half-written identity file.</span></li>
			<li class="flex gap-3"><span class="text-emerald-400 mt-0.5">▸</span> <span><strong class="text-zinc-50">Device ID derivation consistency (0.3.3).</strong> <code class="font-mono text-sm">invite</code> and <code class="font-mono text-sm">listen</code> were deriving device IDs with raw <code class="font-mono text-sm">base64url(pubkey)</code> while <code class="font-mono text-sm">init</code> used <code class="font-mono text-sm">SHA-256(pubkey)</code> per the protocol spec. The relay could never match the controller's allow list entry to the agent's registration, silently breaking shell routing. All commands now use <code class="font-mono text-sm">generateDeviceId()</code>. <strong>Existing pairings need re-pairing</strong> — this is the one migration note of the series.</span></li>
		</ul>

		<h2 class="pt-4 text-2xl font-bold text-zinc-50">Honest messaging</h2>
		<p>
			We audited our own marketing. Words like "replay-proof" and "MITM-proof" became "replay protection" and "MITM-resistant." "Hardware-bound" became "protected by Keychain, TPM, or encrypted file" — because the encrypted-file tier isn't hardware-bound and pretending otherwise is misleading. The footer gained a disclaimer making clear that security claims describe design goals, not guarantees.
		</p>
		<p>
			We think this matters. The security community rightly distrusts products that overclaim, and the damage from one incident traced back to a hand-wavy guarantee is worth more than the marketing uplift from the stronger phrasing.
		</p>

		<h2 class="pt-4 text-2xl font-bold text-zinc-50">Upgrading</h2>
		<CodeBlock label="Homebrew" code={`brew upgrade amesh`} />
		<CodeBlock label="npm" code={`npm install -g <span class="text-emerald-400">@authmesh/cli@latest</span>
npm install <span class="text-emerald-400">@authmesh/sdk@latest</span>`} />
		<p>
			After upgrading, if you were on 0.3.0–0.3.2, you'll need to re-pair devices once — the 0.3.3 device ID fix broke backward compatibility for existing pairings. Run <code class="font-mono text-sm text-emerald-400">amesh list</code> to see your current peers, then <code class="font-mono text-sm text-emerald-400">amesh listen</code> + <code class="font-mono text-sm text-emerald-400">amesh invite</code> to re-pair.
		</p>

		<h2 class="pt-4 text-2xl font-bold text-zinc-50">What's next</h2>
		<p>
			0.4 is focused on language reach and observability. TypeScript has been the only first-class SDK since day one; a Python and Go SDK are next. We're also adding optional OpenTelemetry integration so you can trace signed requests end-to-end without extra glue.
		</p>
		<p>
			As always, the full list of changes is in the <a href="/docs/changelog" class="text-emerald-400 no-underline hover:underline">changelog</a>, and the protocol itself is on <a href="https://github.com/ameshdev/amesh/blob/main/docs/protocol-spec.md" target="_blank" rel="noopener" class="text-emerald-400 no-underline hover:underline">GitHub</a>. If you hit a bug, file it — we respond fast.
		</p>
	</div>

	<footer class="mt-16 pt-8 border-t border-zinc-800">
		<div class="flex justify-between gap-4">
			{#if prev}
				<a href="/blog/{prev.slug}" class="group flex items-center gap-3 rounded-lg border border-zinc-800 px-4 py-3 no-underline transition hover:border-zinc-700 flex-1">
					<ChevronLeft size={16} class="text-zinc-600 transition group-hover:text-zinc-400" />
					<div>
						<div class="text-xs text-zinc-600">Older post</div>
						<div class="text-sm font-medium text-zinc-300 group-hover:text-zinc-50">{prev.title}</div>
					</div>
				</a>
			{:else}
				<div></div>
			{/if}
			{#if next}
				<a href="/blog/{next.slug}" class="group flex items-center justify-end gap-3 rounded-lg border border-zinc-800 px-4 py-3 no-underline transition hover:border-zinc-700 flex-1 text-right">
					<div>
						<div class="text-xs text-zinc-600">Newer post</div>
						<div class="text-sm font-medium text-zinc-300 group-hover:text-zinc-50">{next.title}</div>
					</div>
				</a>
			{:else}
				<div></div>
			{/if}
		</div>
	</footer>
</article>
