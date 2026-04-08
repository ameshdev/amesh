<script lang="ts">
	import CodeBlock from '$lib/components/CodeBlock.svelte';
	import Breadcrumb from '$lib/components/Breadcrumb.svelte';
	import TableOfContents from '$lib/components/TableOfContents.svelte';
	import PrevNextNav from '$lib/components/PrevNextNav.svelte';
	import RelatedContent from '$lib/components/RelatedContent.svelte';
	import { getDocNav } from '$lib/navigation.js';
	import type { RelatedLink } from '$lib/navigation.js';
	import { jsonLdScript, graph, breadcrumbList, techArticle } from '$lib/seo.js';

	const { prev, next } = getDocNav('quickstart');

	const tocItems = [
		{ id: 'install', label: '1. Install' },
		{ id: 'init', label: '2. Create an identity' },
		{ id: 'pair', label: '3. Pair two machines' },
		{ id: 'sign', label: '4. Sign your first request' },
		{ id: 'verify', label: '5. Verify on the server' },
		{ id: 'next', label: 'Next steps' },
	];

	const relatedLinks: RelatedLink[] = [
		{ href: '/docs/integration', title: 'Integration Guide', desc: 'Express, microservices, webhooks', type: 'doc' },
		{ href: '/docs/key-storage', title: 'Key Storage', desc: 'How keys are protected', type: 'doc' },
	];
</script>

<svelte:head>
	<title>Quickstart — amesh</title>
	<meta name="description" content="Get amesh running in under 5 minutes. Install, create an identity, pair two machines, and sign your first request." />
	<link rel="canonical" href="https://authmesh.dev/docs/quickstart" />
	<meta property="og:title" content="Quickstart — amesh" />
	<meta property="og:description" content="Install, pair, and sign your first request with amesh in under 5 minutes." />
	<meta property="og:url" content="https://authmesh.dev/docs/quickstart" />
	{@html jsonLdScript(graph(
		breadcrumbList([
			{ name: 'Home', url: '/' },
			{ name: 'Docs', url: '/docs' },
			{ name: 'Quickstart', url: '/docs/quickstart' }
		]),
		techArticle({
			title: 'Quickstart: Install, Pair, Sign',
			description: 'End-to-end 5-minute walkthrough for amesh device-bound authentication.',
			url: '/docs/quickstart',
			section: 'Getting Started'
		})
	))}
</svelte:head>

<div class="mx-auto max-w-2xl px-6 pb-20">
	<section class="pt-16 pb-6">
		<Breadcrumb crumbs={[{ label: 'Docs', href: '/docs' }, { label: 'Quickstart' }]} />
		<h1 class="mt-4 text-3xl font-bold text-zinc-50">Quickstart</h1>
		<p class="mt-3 text-lg text-zinc-400">Install amesh, pair two machines, and sign your first request in under 5 minutes.</p>
		<TableOfContents items={tocItems} />
	</section>

	<section class="py-8">
		<h2 id="install" class="scroll-mt-20 text-xl font-semibold text-zinc-50">1. Install</h2>
		<p class="mt-2 text-zinc-400">Install the amesh CLI and SDK. Pick whichever matches your environment.</p>
		<div class="mt-4">
			<CodeBlock label="Homebrew (macOS / Linux)" code={`<span class="text-zinc-500"># CLI</span>
brew install ameshdev/tap/amesh

<span class="text-zinc-500"># SDK (in your project)</span>
bun add <span class="text-emerald-400">@authmesh/sdk</span>`} />
		</div>
		<div class="mt-4">
			<CodeBlock label="Shell (Linux / macOS)" code={`<span class="text-zinc-500"># Installs amesh + amesh-agent — no runtime needed</span>
curl -fsSL <span class="text-emerald-400">https://authmesh.dev/install</span> | sh`} />
		</div>
		<div class="mt-4">
			<CodeBlock label="npm" code={`<span class="text-zinc-500"># CLI (global)</span>
npm install -g <span class="text-emerald-400">@authmesh/cli</span>

<span class="text-zinc-500"># SDK (in your project)</span>
npm install <span class="text-emerald-400">@authmesh/sdk</span>`} />
		</div>
	</section>

	<section class="py-8">
		<h2 id="init" class="scroll-mt-20 text-xl font-semibold text-zinc-50">2. Create an identity</h2>
		<p class="mt-2 text-zinc-400">
			Run <code class="font-mono text-emerald-400">amesh init</code> on the machine. This generates a P-256 keypair and picks the best available key storage — Secure Enclave, macOS Keychain, TPM, or encrypted file.
		</p>
		<div class="mt-4">
			<CodeBlock code={`<span class="text-zinc-500">$</span> amesh init --name <span class="text-emerald-400">"api-server"</span>

Detecting key storage backend:
  Secure Enclave    not available
  macOS Keychain    <span class="text-emerald-400">selected</span>

Identity created.
  Device ID     : <span class="text-emerald-400">am_cOixWcOdI8-pLh4P</span>
  Backend       : <span class="text-emerald-400">macOS Keychain</span>
  Friendly Name : <span class="text-emerald-400">api-server</span>`} />
		</div>
		<p class="mt-3 text-sm text-zinc-500">Do this on <strong class="text-zinc-300">both</strong> machines you want to connect — for example, your laptop (controller) and your server (target).</p>
	</section>

	<section class="py-8">
		<h2 id="pair" class="scroll-mt-20 text-xl font-semibold text-zinc-50">3. Pair two machines</h2>
		<p class="mt-2 text-zinc-400">
			Pairing exchanges public keys over a relay using a 6-digit code. Trust is one-way: the controller authenticates TO the target, never the reverse.
		</p>
		<div class="mt-4">
			<CodeBlock label="On the target (e.g. api-server)" code={`<span class="text-zinc-500">$</span> amesh listen

  Pairing code: <span class="text-emerald-400">482916</span>
  Waiting for controller...`} />
		</div>
		<div class="mt-4">
			<CodeBlock label="On the controller (e.g. laptop)" code={`<span class="text-zinc-500">$</span> amesh invite <span class="text-emerald-400">482916</span>

<span class="text-emerald-400">✔</span> Peer found.
  Verification code: <span class="text-emerald-400">847291</span>
  Enter this code on the Target device.
<span class="text-emerald-400">✔</span> "api-server" added as target.`} />
		</div>
		<p class="mt-3 text-sm text-zinc-500">
			The verification code (shown on both sides) must match — this defeats man-in-the-middle attacks on the relay.
		</p>
		<div class="mt-4 rounded-lg border border-zinc-800 bg-zinc-900/30 px-4 py-3">
			<p class="text-sm text-zinc-400"><strong class="text-zinc-300">Remote device?</strong> If you can't run interactive commands on the target, use <code class="font-mono text-emerald-400">amesh provision</code> to generate a bootstrap token instead. See <a href="/docs/integration" class="text-emerald-400 no-underline hover:underline">Integration Guide — Pairing Remote Machines</a>.</p>
		</div>
	</section>

	<section class="py-8">
		<h2 id="sign" class="scroll-mt-20 text-xl font-semibold text-zinc-50">4. Sign your first request</h2>
		<p class="mt-2 text-zinc-400">
			From the controller machine, import the SDK and call <code class="font-mono text-emerald-400">amesh.fetch()</code>. It signs every outgoing request automatically with your device key.
		</p>
		<div class="mt-4">
			<CodeBlock label="client.ts (on the controller)" code={`import { amesh } from <span class="text-emerald-400">'@authmesh/sdk'</span>;

const res = await amesh.fetch(
  <span class="text-emerald-400">'https://api-server.internal/orders'</span>,
  {
    method: <span class="text-emerald-400">'POST'</span>,
    body: JSON.stringify({ amount: <span class="text-emerald-400">100</span> }),
  }
);`} />
		</div>
	</section>

	<section class="py-8">
		<h2 id="verify" class="scroll-mt-20 text-xl font-semibold text-zinc-50">5. Verify on the server</h2>
		<p class="mt-2 text-zinc-400">
			One middleware line on the target verifies signature, timestamp, nonce, and allow list. Every request arrives with a verified device ID.
		</p>
		<div class="mt-4">
			<CodeBlock label="server.ts (on the target)" code={`import express from <span class="text-emerald-400">'express'</span>;
import { amesh } from <span class="text-emerald-400">'@authmesh/sdk'</span>;

const app = express();
app.use(express.json());
app.use(amesh.verify());

app.post(<span class="text-emerald-400">'/orders'</span>, (req, res) => {
  <span class="text-zinc-500">// req.authMesh.deviceId is the verified caller</span>
  console.log(<span class="text-emerald-400">\`Order from \${req.authMesh.friendlyName}\`</span>);
  res.json({ ok: <span class="text-emerald-400">true</span> });
});

app.listen(<span class="text-emerald-400">3000</span>);`} />
		</div>
		<p class="mt-3 text-sm text-zinc-500">
			That's it. Every request now carries a cryptographic proof of origin bound to the controller's device key.
		</p>
	</section>

	<section class="py-8">
		<h2 id="next" class="scroll-mt-20 text-xl font-semibold text-zinc-50">Next steps</h2>
		<ul class="mt-3 space-y-2 text-zinc-400">
			<li>• Read the <a href="/docs/integration" class="text-emerald-400 no-underline hover:underline">Integration Guide</a> for microservices, webhooks, and Redis nonce store patterns.</li>
			<li>• Learn about <a href="/docs/key-storage" class="text-emerald-400 no-underline hover:underline">Key Storage</a> — how your private key is protected on each platform.</li>
			<li>• Deploy the relay with <a href="/docs/self-hosting" class="text-emerald-400 no-underline hover:underline">Self-Hosting</a> guide (Docker, Cloud Run, Fly.io, Kubernetes).</li>
			<li>• Hit an error? Check <a href="/docs/troubleshooting" class="text-emerald-400 no-underline hover:underline">Troubleshooting</a>.</li>
		</ul>
	</section>

	<PrevNextNav {prev} {next} />
	<RelatedContent links={relatedLinks} />
</div>
