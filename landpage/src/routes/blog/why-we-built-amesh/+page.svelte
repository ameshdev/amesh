<script lang="ts">
	import { Calendar, Clock, ChevronLeft } from '@lucide/svelte';
	import { getPost, getPostNav } from '$lib/blog.js';
	import { jsonLdScript, graph, breadcrumbList, blogPosting } from '$lib/seo.js';

	const post = getPost('why-we-built-amesh')!;
	const { prev, next } = getPostNav('why-we-built-amesh');

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
			section: 'Essay'
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
			Almost every backend service on the internet authenticates other services using static strings. API keys in <code class="rounded bg-emerald-400/10 px-1.5 py-0.5 text-sm text-emerald-400">.env</code> files. Bearer tokens in environment variables. Shared secrets in a secrets manager. JWT signing keys in config files. Different names, same shape: <strong class="text-zinc-50">the secret IS the identity</strong>.
		</p>
		<p>
			Anyone who has the string is authenticated. There is no way to prove <em>which machine</em> used it, whether it was copied, or where it's been. And that turns out to matter a lot more than we collectively pretend.
		</p>

		<h2 class="pt-4 text-2xl font-bold text-zinc-50">Secrets leak. Constantly.</h2>
		<p>
			GitHub's secret scanning detected <strong class="text-zinc-50">over 1 million leaked secrets in public repos in 2024 alone</strong>. Not hypothetical — real keys committed to real public repositories by real engineers at companies of every size. Every year, major breaches trace back to leaked credentials. These aren't junior mistakes; they're what happens when the design makes leaks easy.
		</p>
		<p>The leak vectors are mundane:</p>
		<ul class="space-y-2 list-disc list-inside marker:text-zinc-600">
			<li><code class="font-mono text-sm text-emerald-400">.env</code> committed to git (the <code class="font-mono text-sm">.gitignore</code> entry was missing, or the repo was migrated without checking)</li>
			<li>Secrets printed to logs during debugging, then shipped to CloudWatch or Datadog</li>
			<li>Docker images with <code class="font-mono text-sm text-emerald-400">.env</code> files baked in, pushed to public registries</li>
			<li>Postman collections with hardcoded Bearer tokens, shared with "just the team"</li>
			<li>CI/CD build logs capturing expanded environment variables</li>
			<li>Developers sharing keys in Slack: "just use this for now, I'll rotate it later"</li>
		</ul>
		<p>
			The common thread: the secret exists as a copyable string that your application has to hold in memory and send over the wire. Every stop on that journey is a leak vector. You can harden each one — scan repos, redact logs, pin images, audit Slack — but you can't eliminate the fundamental fact that a copyable string, given enough time, gets copied.
		</p>

		<h2 class="pt-4 text-2xl font-bold text-zinc-50">Rotation is a coordination nightmare</h2>
		<p>
			When a secret is compromised — or your compliance team mandates 90-day rotation — you face a coordination problem that nobody talks about honestly:
		</p>
		<ol class="space-y-2 list-decimal list-inside marker:text-emerald-400/60 text-zinc-400">
			<li>Generate a new key</li>
			<li>Update every service that uses it</li>
			<li>Deploy them all <em>simultaneously</em> (or accept a window where some use the old key, some use the new)</li>
			<li>Hope nothing breaks</li>
			<li>Revoke the old key</li>
			<li>Discover a forgotten service still using the old key</li>
			<li>Emergency hotfix at 2am</li>
		</ol>
		<p>
			This is operationally expensive and error-prone. Teams delay rotation because the risk of breaking production feels higher than the risk of a compromised key. Auditors push back, timelines slip, and the rotation policy becomes a compliance checkbox rather than a security measure.
		</p>

		<h2 class="pt-4 text-2xl font-bold text-zinc-50">No identity, only access</h2>
		<p>
			A Bearer token doesn't tell you <em>who</em> is calling. If three servers and a developer laptop all share the same API key, your API sees four identical callers. You can't:
		</p>
		<ul class="space-y-2 list-disc list-inside marker:text-zinc-600">
			<li>Audit which machine made a specific request</li>
			<li>Rate-limit per device</li>
			<li>Revoke one machine without affecting the others</li>
			<li>Detect when the key was copied to an unauthorized machine</li>
		</ul>
		<p>
			This is especially painful during incident response. "We see anomalous activity from the service account" is a useless signal when the service account is five machines. You end up revoking for everyone, rotating everywhere, and praying you catch the bad actor in the process.
		</p>

		<h2 class="pt-4 text-2xl font-bold text-zinc-50">Secrets managers don't solve this</h2>
		<p>
			Secrets managers improve the <em>management</em> of secrets, but they don't change the fundamental shape of the problem. The secret still exists as a copyable string. Your service still fetches it, holds it in memory, and sends it over the wire. A secrets manager:
		</p>
		<ul class="space-y-2 list-disc list-inside marker:text-zinc-600">
			<li>Adds a runtime dependency — if the manager is unreachable, your service can't authenticate</li>
			<li>Still delivers the secret as a string to your application</li>
			<li>Requires its own authentication — how does your server authenticate to the secrets manager? With <em>another secret</em>, which has the same problem</li>
			<li>Adds latency on every cold start</li>
			<li>Costs real money at scale</li>
		</ul>
		<p>
			Secrets managers are a genuine improvement over loose <code class="font-mono text-sm text-emerald-400">.env</code> files and they solve a real problem. But the secret is still a string, and a string is still copyable. amesh is aimed at a different layer of the stack — removing the string entirely, so there's nothing to manage.
		</p>

		<h2 class="pt-4 text-2xl font-bold text-zinc-50">The fix: bind identity to the machine</h2>
		<p>
			The honest observation is that if identity is a <em>string</em>, you can't control where it ends up. The only way to prove "this specific machine is calling" is to bind identity to something that can't be copied off the machine. That thing already exists on most hardware you own: a secure element that can sign messages with a key that never leaves the silicon.
		</p>
		<p>
			Apple's Secure Enclave does this. TPM 2.0 on Linux does this. YubiKeys do this. Passkeys do this for users. What's been missing is a simple, honest way to use the same primitive for machine-to-machine authentication — without inventing a PKI, running a CA, or deploying a service mesh.
		</p>
		<p>That's what amesh is.</p>

		<h2 class="pt-4 text-2xl font-bold text-zinc-50">How it's different</h2>
		<p>
			<code class="font-mono text-sm text-emerald-400">amesh init</code> generates a P-256 keypair on the device. The private key goes into the OS keychain (Apple Secure Enclave, macOS Keychain, or Linux TPM 2.0) and never comes back out. <code class="font-mono text-sm text-emerald-400">amesh.fetch()</code> signs outgoing requests with that key, and <code class="font-mono text-sm text-emerald-400">amesh.verify()</code> is one line of middleware that verifies the signature on the receiving end.
		</p>
		<p>The consequences:</p>
		<ul class="space-y-3">
			<li class="flex gap-3"><span class="text-emerald-400 mt-0.5">▸</span> <span><strong class="text-zinc-50">No string to leak.</strong> You can commit your entire codebase to a public repo and nothing is compromised. There is no secret in the repo, in memory, or on the wire.</span></li>
			<li class="flex gap-3"><span class="text-emerald-400 mt-0.5">▸</span> <span><strong class="text-zinc-50">No rotation.</strong> Device keys don't expire. If a device is compromised, you run <code class="font-mono text-sm">amesh revoke &lt;device-id&gt;</code> and only that device loses access. Every other device continues working.</span></li>
			<li class="flex gap-3"><span class="text-emerald-400 mt-0.5">▸</span> <span><strong class="text-zinc-50">Per-device identity.</strong> Every request arrives with a verified device ID. You know <em>which machine</em> made it. Per-device audit trails come for free.</span></li>
			<li class="flex gap-3"><span class="text-emerald-400 mt-0.5">▸</span> <span><strong class="text-zinc-50">Non-repudiable proof of origin.</strong> Each request is signed with a key bound to the device hardware. No other device could have produced the same signature.</span></li>
		</ul>

		<h2 class="pt-4 text-2xl font-bold text-zinc-50">What we won't claim</h2>
		<p>
			amesh is not magic, and we want to be honest about what it is not:
		</p>
		<ul class="space-y-2 list-disc list-inside marker:text-zinc-600">
			<li>It's not for humans. Users log in with OAuth, passkeys, or WebAuthn, not amesh.</li>
			<li>It's not for ephemeral compute. Lambda, Cloud Functions, and short-lived containers don't have a stable device to bind to.</li>
			<li>It's not post-quantum. P-256 is chosen because it's the most broadly supported in hardware in 2026; we'll add ML-DSA once hardware catches up, and the protocol already versions the signature algorithm.</li>
			<li>It's not a network tool. amesh authenticates API requests, not network connections — no port forwarding, no tunneling.</li>
		</ul>

		<h2 class="pt-4 text-2xl font-bold text-zinc-50">The security model in one sentence</h2>
		<p class="rounded-lg border-l-2 border-emerald-400 bg-emerald-400/5 px-5 py-4 text-zinc-300 italic">
			The private key never leaves the device. The signature proves the machine. The nonce prevents replay. The HMAC prevents tampering. The SAS prevents MITM. One-way trust limits blast radius — a compromised target cannot authenticate back to its controller.
		</p>
		<p>
			There is no string to steal.
		</p>

		<p class="pt-4 text-zinc-400">
			If that sounds useful, the <a href="/docs/quickstart" class="text-emerald-400 no-underline hover:underline">quickstart</a> takes about five minutes end-to-end. If you want the full protocol, the <a href="https://github.com/ameshdev/amesh/blob/main/docs/protocol-spec.md" target="_blank" rel="noopener" class="text-emerald-400 no-underline hover:underline">spec is on GitHub</a>. If you just want to poke at it, everything is MIT licensed.
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
