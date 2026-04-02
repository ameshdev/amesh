<script lang="ts">
	import CodeBlock from '$lib/components/CodeBlock.svelte';
	import Breadcrumb from '$lib/components/Breadcrumb.svelte';
	import TableOfContents from '$lib/components/TableOfContents.svelte';
	import PrevNextNav from '$lib/components/PrevNextNav.svelte';
	import RelatedContent from '$lib/components/RelatedContent.svelte';
	import { getDocNav } from '$lib/navigation.js';
	import type { RelatedLink } from '$lib/navigation.js';

	const { prev, next } = getDocNav('self-hosting');

	const tocItems = [
		{ id: 'docker', label: 'Docker' },
		{ id: 'cloud-run', label: 'Google Cloud Run' },
		{ id: 'flyio', label: 'Fly.io' },
		{ id: 'nodejs', label: 'Plain Node.js' },
		{ id: 'kubernetes', label: 'Kubernetes' },
		{ id: 'security', label: 'Security' },
		{ id: 'config', label: 'Configuration' },
	];

	const relatedLinks: RelatedLink[] = [
		{ href: '/docs/integration', title: 'Integration Guide', desc: 'Set up the SDK before deploying the relay', type: 'doc' },
	];
</script>

<svelte:head>
	<title>Self-Hosting the amesh Relay: Docker, Cloud Run, Fly.io</title>
	<meta name="description" content="How to run your own amesh relay server with Docker, Cloud Run, Fly.io, Kubernetes, or plain Node.js." />
	<link rel="canonical" href="https://authmesh.dev/docs/self-hosting" />
	<meta property="og:title" content="Self-Hosting the amesh Relay — amesh" />
	<meta property="og:description" content="Deploy the relay with Docker, Cloud Run, Fly.io, Kubernetes, or plain Node.js." />
	<meta property="og:url" content="https://authmesh.dev/docs/self-hosting" />
</svelte:head>

<div class="mx-auto max-w-2xl px-6 pb-20">

	<section class="pt-16 pb-6">
		<Breadcrumb crumbs={[{ label: 'Docs', href: '/docs' }, { label: 'Self-Hosting Guide' }]} />
		<h1 class="mt-4 text-3xl font-bold text-zinc-50">Self-Hosting the Relay</h1>
		<p class="mt-3 text-lg text-zinc-400">The relay is only needed for device pairing. After pairing, all auth is P2P with no relay involved.</p>
		<TableOfContents items={tocItems} />
	</section>

	<!-- Architecture -->
	<section class="py-6">
		<div class="rounded-lg border border-zinc-800 p-4" style="background:#0C0C0E">
			<pre class="font-mono text-[13px] leading-relaxed text-zinc-400 overflow-x-auto"><span class="text-zinc-500">Pairing (~30s):</span>  Device A  <span class="text-emerald-400">&lt;-WS-&gt;</span>  Relay  <span class="text-emerald-400">&lt;-WS-&gt;</span>  Device B
<span class="text-zinc-500">Runtime:</span>         Device A  <span class="text-emerald-400">--HTTP--&gt;</span>  Device B   <span class="text-zinc-600">(no relay)</span></pre>
		</div>
		<p class="mt-3 text-sm text-zinc-500">The relay is stateless. Sessions exist in memory for ~30 seconds during pairing, then are forgotten. No database, no persistence.</p>
	</section>

	<!-- Docker -->
	<section class="py-8 border-t border-zinc-800">
		<h2 id="docker" class="scroll-mt-20 text-xl font-semibold text-zinc-50">Docker</h2>
		<p class="mt-2 text-zinc-400">The simplest way to self-host.</p>
		<div class="mt-4">
			<CodeBlock code={`<span class="text-zinc-500">$</span> git clone https://github.com/ameshdev/amesh.git
<span class="text-zinc-500">$</span> cd amesh
<span class="text-zinc-500">$</span> docker compose up -d

<span class="text-zinc-500"># Health check</span>
<span class="text-zinc-500">$</span> curl http://localhost:3001/health
<span class="text-emerald-400">{"status":"ok","sessions":0}</span>`} />
		</div>
		<div class="mt-3">
			<CodeBlock code={`<span class="text-zinc-500"># Or build the image separately</span>
<span class="text-zinc-500">$</span> docker build -f Dockerfile.relay -t amesh-relay .
<span class="text-zinc-500">$</span> docker run -p 3001:3001 amesh-relay`} />
		</div>
	</section>

	<!-- Cloud Run -->
	<section class="py-8 border-t border-zinc-800">
		<h2 id="cloud-run" class="scroll-mt-20 text-xl font-semibold text-zinc-50">Google Cloud Run</h2>
		<p class="mt-2 text-zinc-400">Scales to zero — no cost when nobody is pairing. Native WebSocket support.</p>
		<div class="mt-4">
			<CodeBlock code={`<span class="text-zinc-500"># Build and push</span>
gcloud builds submit \\
  --tag gcr.io/<span class="text-emerald-400">YOUR_PROJECT</span>/amesh-relay \\
  -f Dockerfile.relay .

<span class="text-zinc-500"># Deploy</span>
gcloud run deploy amesh-relay \\
  --image gcr.io/<span class="text-emerald-400">YOUR_PROJECT</span>/amesh-relay \\
  --port 3001 \\
  --allow-unauthenticated \\
  --session-affinity \\
  --min-instances 0 \\
  --max-instances 3`} />
		</div>
		<p class="mt-3 text-sm text-zinc-500"><code class="text-emerald-400">--session-affinity</code> keeps WebSocket connections on the same instance during pairing.</p>
	</section>

	<!-- Fly.io -->
	<section class="py-8 border-t border-zinc-800">
		<h2 id="flyio" class="scroll-mt-20 text-xl font-semibold text-zinc-50">Fly.io</h2>
		<p class="mt-2 text-zinc-400">Simple CLI deployment with auto-stop when idle.</p>
		<div class="mt-4">
			<CodeBlock code={`<span class="text-zinc-500">$</span> fly launch --dockerfile Dockerfile.relay
<span class="text-zinc-500">$</span> fly deploy`} />
		</div>
	</section>

	<!-- Plain Node.js -->
	<section class="py-8 border-t border-zinc-800">
		<h2 id="nodejs" class="scroll-mt-20 text-xl font-semibold text-zinc-50">Plain Node.js</h2>
		<p class="mt-2 text-zinc-400">No Docker required.</p>
		<div class="mt-4">
			<CodeBlock code={`<span class="text-zinc-500">$</span> npm install @authmesh/relay
<span class="text-zinc-500">$</span> PORT=3001 npx @authmesh/relay`} />
		</div>
		<div class="mt-3">
			<CodeBlock code={`<span class="text-zinc-500">// Or programmatically</span>
<span class="text-zinc-400">import</span> { createRelayServer } <span class="text-zinc-400">from</span> <span class="text-emerald-400">'@authmesh/relay'</span>;

<span class="text-zinc-400">const</span> relay = <span class="text-zinc-400">await</span> createRelayServer({ port: <span class="text-emerald-400">3001</span> });
<span class="text-zinc-400">await</span> relay.start();`} />
		</div>
	</section>

	<!-- Kubernetes -->
	<section class="py-8 border-t border-zinc-800">
		<h2 id="kubernetes" class="scroll-mt-20 text-xl font-semibold text-zinc-50">Kubernetes</h2>
		<div class="mt-4">
			<CodeBlock code={`<span class="text-zinc-400">apiVersion:</span> apps/v1
<span class="text-zinc-400">kind:</span> Deployment
<span class="text-zinc-400">metadata:</span>
  <span class="text-zinc-400">name:</span> amesh-relay
<span class="text-zinc-400">spec:</span>
  <span class="text-zinc-400">replicas:</span> <span class="text-emerald-400">1</span>
  <span class="text-zinc-400">selector:</span>
    <span class="text-zinc-400">matchLabels:</span>
      <span class="text-zinc-400">app:</span> amesh-relay
  <span class="text-zinc-400">template:</span>
    <span class="text-zinc-400">spec:</span>
      <span class="text-zinc-400">containers:</span>
        - <span class="text-zinc-400">name:</span> relay
          <span class="text-zinc-400">image:</span> <span class="text-emerald-400">ghcr.io/ameshdev/amesh-relay:latest</span>
          <span class="text-zinc-400">ports:</span>
            - <span class="text-zinc-400">containerPort:</span> <span class="text-emerald-400">3001</span>
          <span class="text-zinc-400">readinessProbe:</span>
            <span class="text-zinc-400">httpGet:</span>
              <span class="text-zinc-400">path:</span> /health
              <span class="text-zinc-400">port:</span> <span class="text-emerald-400">3001</span>`} />
		</div>
	</section>

	<!-- Security -->
	<section class="py-8 border-t border-zinc-800">
		<h2 id="security" class="scroll-mt-20 text-xl font-semibold text-zinc-50">Security</h2>
		<p class="mt-2 text-zinc-400">The relay is designed to be untrusted:</p>
		<div class="mt-4 space-y-3">
			<div class="border-l-2 border-emerald-400/60 pl-4 py-1">
				<div class="text-sm font-semibold text-zinc-50">Encrypted key exchange</div>
				<div class="mt-1 text-sm text-zinc-400">The relay forwards opaque ChaCha20-Poly1305 blobs. It cannot read the key exchange.</div>
			</div>
			<div class="border-l-2 border-emerald-400/60 pl-4 py-1">
				<div class="text-sm font-semibold text-zinc-50">SAS prevents MITM</div>
				<div class="mt-1 text-sm text-zinc-400">Even if someone controls the relay, both devices display a 6-digit code. A MITM attack produces different codes.</div>
			</div>
			<div class="border-l-2 border-emerald-400/60 pl-4 py-1">
				<div class="text-sm font-semibold text-zinc-50">Rate limiting</div>
				<div class="mt-1 text-sm text-zinc-400">5 failed OTC attempts per IP per minute. Built into the relay.</div>
			</div>
			<div class="border-l-2 border-emerald-400/60 pl-4 py-1">
				<div class="text-sm font-semibold text-zinc-50">No persistence</div>
				<div class="mt-1 text-sm text-zinc-400">Nothing is stored. Sessions exist in memory for ~30 seconds during pairing, then are forgotten.</div>
			</div>
		</div>
	</section>

	<!-- Config -->
	<section class="py-8 border-t border-zinc-800">
		<h2 id="config" class="scroll-mt-20 text-xl font-semibold text-zinc-50">Configuration</h2>
		<div class="mt-4 rounded-lg border border-zinc-800 divide-y divide-zinc-800">
			<div class="px-4 py-3">
				<code class="font-mono text-sm text-emerald-400">PORT</code>
				<span class="ml-3 text-sm text-zinc-400">Listen port. Default: <code>3001</code></span>
			</div>
			<div class="px-4 py-3">
				<code class="font-mono text-sm text-emerald-400">HOST</code>
				<span class="ml-3 text-sm text-zinc-400">Listen address. Default: <code>0.0.0.0</code></span>
			</div>
		</div>
		<p class="mt-3 text-sm text-zinc-500">That's it. No database, no secrets, no external services.</p>
	</section>

	<RelatedContent links={relatedLinks} />
	<PrevNextNav {prev} {next} />

</div>
