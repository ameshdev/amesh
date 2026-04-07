<script lang="ts">
	import { Calendar, Clock, ChevronLeft } from '@lucide/svelte';
	import CodeBlock from '$lib/components/CodeBlock.svelte';
	import { getPost, getPostNav } from '$lib/blog.js';
	import { jsonLdScript, graph, breadcrumbList, blogPosting } from '$lib/seo.js';

	const post = getPost('your-ai-writes-env-files')!;
	const { prev, next } = getPostNav('your-ai-writes-env-files');

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
			You ask your AI coding assistant to build a backend. It writes clean TypeScript. It sets up routes, middleware, validation. Then it creates a <code class="rounded bg-emerald-400/10 px-1.5 py-0.5 text-sm text-emerald-400">.env</code> file and tells you to paste your credentials. That file is the same security pattern that leaked over a million secrets on GitHub last year. The only difference is that now we're generating them at machine speed.
		</p>

		<h2 class="pt-4 text-2xl font-bold text-zinc-50">The .env file is the default</h2>
		<p>
			Every tutorial, every starter template, every "build me an API" prompt ends the same way: a <code class="rounded bg-emerald-400/10 px-1.5 py-0.5 text-sm text-emerald-400">.env</code> file with secrets in plaintext. This isn't the AI's fault. It learned from us. It's doing what every getting-started guide has done for a decade.
		</p>
		<p>
			But the scale is new. AI coding tools are generating more backends in a month than teams used to build in a year. Each one starts with the same foundation: identity is a string, access is a string, and the strings live in a file on disk.
		</p>

		<h2 class="pt-4 text-2xl font-bold text-zinc-50">What your AI generates today</h2>
		<p>
			You say: "Build me a service that accepts orders from my API gateway." Your AI writes the handler, the validation, the types. Then it writes this:
		</p>
		<CodeBlock label=".env" code={`<span class="text-zinc-500"># Service-to-service auth</span>
ORDERS_SERVICE_SECRET=<span class="text-red-400">hmac_sk_a1b2c3d4e5f6g7h8i9j0</span>

<span class="text-zinc-500"># Database</span>
DATABASE_URL=<span class="text-red-400">postgres://admin:s3cret@db.internal:5432/orders</span>

<span class="text-zinc-500"># Third-party services</span>
EMAIL_API_KEY=<span class="text-red-400">ek_live_x7y8z9...</span>
PAYMENT_API_KEY=<span class="text-red-400">pk_live_m4n5o6...</span>`} />
		<p>
			And the authentication check looks like this:
		</p>
		<CodeBlock label="server.ts" code={`<span class="text-zinc-500">// Verify the caller is our API gateway</span>
<span class="text-emerald-400">const</span> key = req.headers[<span class="text-amber-300">'x-api-key'</span>];
<span class="text-emerald-400">if</span> (key !== process.env.ORDERS_SERVICE_SECRET) {
  <span class="text-emerald-400">return</span> res.status(<span class="text-amber-300">401</span>).json({ error: <span class="text-amber-300">'unauthorized'</span> });
}`} />
		<p>
			This works. It's also the setup where a git push to the wrong remote, a Docker image with the <code class="rounded bg-emerald-400/10 px-1.5 py-0.5 text-sm text-emerald-400">.env</code> baked in, or a debug log that expanded environment variables gives anyone permanent access to your service.
		</p>
		<p>
			The secret is a copyable string. Every time your application reads it from disk, holds it in memory, and sends it over the wire, that's a leak vector. And your AI just generated four of them in one prompt.
		</p>

		<h2 class="pt-4 text-2xl font-bold text-zinc-50">Same task, no .env</h2>
		<p>
			Now ask your AI to use amesh for the service-to-service auth. The handler changes to this:
		</p>
		<CodeBlock label="server.ts" code={`<span class="text-emerald-400">import</span> express <span class="text-emerald-400">from</span> <span class="text-amber-300">'express'</span>;
<span class="text-emerald-400">import</span> { amesh } <span class="text-emerald-400">from</span> <span class="text-amber-300">'@authmesh/sdk'</span>;

<span class="text-emerald-400">const</span> app = express();
app.use(express.json());
app.use(<span class="text-amber-300">'/api'</span>, amesh.verify());

app.post(<span class="text-amber-300">'/api/orders'</span>, (req, res) => {
  console.log(<span class="text-amber-300">\`Order from \${req.authMesh.friendlyName}\`</span>);
  res.json({ status: <span class="text-amber-300">'accepted'</span> });
});

app.listen(<span class="text-amber-300">3000</span>);`} />
		<p>
			And the caller — your API gateway — sends requests like this:
		</p>
		<CodeBlock label="gateway.ts" code={`<span class="text-emerald-400">import</span> { amesh } <span class="text-emerald-400">from</span> <span class="text-amber-300">'@authmesh/sdk'</span>;

<span class="text-emerald-400">const</span> res = <span class="text-emerald-400">await</span> amesh.fetch(<span class="text-amber-300">'http://orders-service:3000/api/orders'</span>, {
  method: <span class="text-amber-300">'POST'</span>,
  headers: { <span class="text-amber-300">'Content-Type'</span>: <span class="text-amber-300">'application/json'</span> },
  body: JSON.stringify({ item: <span class="text-amber-300">'widget'</span>, quantity: <span class="text-amber-300">3</span> }),
});`} />
		<p>
			That's the entire integration. <code class="font-mono text-sm text-emerald-400">amesh.verify()</code> is one line of middleware that checks a P-256 ECDSA signature on every incoming request. <code class="font-mono text-sm text-emerald-400">amesh.fetch()</code> is a drop-in replacement for <code class="font-mono text-sm">fetch()</code> that signs outgoing requests with a key stored in the OS keychain. No shared string. No <code class="rounded bg-emerald-400/10 px-1.5 py-0.5 text-sm text-emerald-400">.env</code> entry. Nothing that, if committed to a public repo, would compromise access.
		</p>

		<h2 class="pt-4 text-2xl font-bold text-zinc-50">Setup takes three commands</h2>
		<p>
			Each service generates a device identity and they pair once:
		</p>
		<CodeBlock label="orders service (target)" code={`<span class="text-zinc-500">$</span> amesh init --name <span class="text-emerald-400">"orders-api"</span>

Detecting key storage backend:
  Secure Enclave    not available (binary not signed)
  macOS Keychain    <span class="text-emerald-400">selected</span>

Identity created.
  Device ID     : <span class="text-emerald-400">am_cOixWcOdI8-pLh4P</span>
  Backend       : <span class="text-emerald-400">macOS Keychain</span>

<span class="text-zinc-500">$</span> amesh listen

  Your pairing code: <span class="text-emerald-400">482916</span>
  Expires in: 60 seconds`} />
		<CodeBlock label="api gateway (controller)" code={`<span class="text-zinc-500">$</span> amesh init --name <span class="text-emerald-400">"api-gateway"</span>
<span class="text-zinc-500">$</span> amesh invite <span class="text-emerald-400">482916</span>

  Verification code: <span class="text-emerald-400">739201</span>
  Enter this code on the Target device to complete pairing.

<span class="text-emerald-400">Paired with orders-api (am_cOixWcOdI8-pLh4P)</span>`} />
		<p>
			The devices exchange keys via an encrypted channel, verify each other through a 6-digit SAS code (like Bluetooth pairing — not a secret, just a MITM check), and add each other to their HMAC-sealed allow lists. Every future request is signed and verified automatically. No credential to manage, no rotation to schedule.
		</p>

		<h2 class="pt-4 text-2xl font-bold text-zinc-50">What changes for the AI</h2>
		<p>
			This matters for how AI writes code, not just how humans manage it. When your AI coding assistant scaffolds a new service with amesh, it generates code that is <strong class="text-zinc-50">secure by default</strong>:
		</p>
		<ul class="space-y-3">
			<li class="flex gap-3"><span class="text-emerald-400 mt-0.5">▸</span> <span><strong class="text-zinc-50">No secrets to hallucinate.</strong> The AI doesn't need to generate placeholder keys or remind you to "replace with your real key." There is no key.</span></li>
			<li class="flex gap-3"><span class="text-emerald-400 mt-0.5">▸</span> <span><strong class="text-zinc-50">No .gitignore to forget.</strong> The entire codebase can be committed to a public repo without risk. There is nothing sensitive in the source tree.</span></li>
			<li class="flex gap-3"><span class="text-emerald-400 mt-0.5">▸</span> <span><strong class="text-zinc-50">No string comparison auth to get wrong.</strong> <code class="font-mono text-sm">if (key !== process.env.SECRET)</code> is a pattern with subtle bugs (timing attacks, missing headers, type coercion). <code class="font-mono text-sm">amesh.verify()</code> handles all of it: replay prevention, clock skew tolerance, constant-time signature verification.</span></li>
			<li class="flex gap-3"><span class="text-emerald-400 mt-0.5">▸</span> <span><strong class="text-zinc-50">Per-device audit for free.</strong> Every request arrives with a verified device ID and friendly name. You know which service made the call — not just "someone with the API key."</span></li>
		</ul>

		<h2 class="pt-4 text-2xl font-bold text-zinc-50">What this doesn't replace</h2>
		<p>
			Look at that <code class="rounded bg-emerald-400/10 px-1.5 py-0.5 text-sm text-emerald-400">.env</code> file from earlier. It has two kinds of entries:
		</p>
		<ul class="space-y-2 list-disc list-inside marker:text-zinc-600">
			<li><strong class="text-zinc-50">Third-party API keys</strong> — your payment provider, email service, analytics. These require the provider's own auth mechanism. amesh doesn't replace them.</li>
			<li><strong class="text-zinc-50">Internal shared secrets</strong> — service-to-service tokens, HMAC keys, anything where you control both sides. amesh eliminates these entirely.</li>
		</ul>
		<p>
			For most architectures with more than two services, the internal secrets are the majority of the <code class="rounded bg-emerald-400/10 px-1.5 py-0.5 text-sm text-emerald-400">.env</code> file. They're also the ones you're most likely to accidentally leak, because they're the ones your team generates and manages without a provider's rotation tooling to fall back on. They're the first thing amesh can remove.
		</p>

		<h2 class="pt-4 text-2xl font-bold text-zinc-50">The real question</h2>
		<p>
			AI is about to generate more backends than we've ever built by hand. Each one is a choice: start with the pattern that leaked a million secrets last year, or start with something that doesn't have a secret to leak.
		</p>
		<p>
			The next time your AI writes a <code class="rounded bg-emerald-400/10 px-1.5 py-0.5 text-sm text-emerald-400">.env</code> file, ask: does that entry need to be a string — or could it be a signature?
		</p>

		<p class="pt-4 text-zinc-400">
			The <a href="/docs/quickstart" class="text-emerald-400 no-underline hover:underline">quickstart</a> takes about five minutes. The <a href="https://github.com/ameshdev/amesh" target="_blank" rel="noopener" class="text-emerald-400 no-underline hover:underline">code is on GitHub</a>, MIT licensed. The <a href="/docs/integration" class="text-emerald-400 no-underline hover:underline">integration guide</a> has recipes for common patterns.
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
