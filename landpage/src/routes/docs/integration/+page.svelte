<script lang="ts">
	import CodeBlock from '$lib/components/CodeBlock.svelte';

	const REPO = 'https://github.com/ameshdev/amesh';
</script>

<svelte:head>
	<title>Integration Guide: Express, Microservices, Webhooks — amesh</title>
	<meta name="description" content="Step-by-step recipes for integrating amesh into Express, microservices, and webhooks." />
	<link rel="canonical" href="https://authmesh.dev/docs/integration" />
	<meta property="og:title" content="Integration Guide — amesh" />
	<meta property="og:description" content="Step-by-step recipes for Express, microservices, and webhooks." />
	<meta property="og:url" content="https://authmesh.dev/docs/integration" />
</svelte:head>

<div class="mx-auto max-w-2xl px-6 pb-20">

	<section class="pt-16 pb-6">
		<a href="/docs" class="text-sm text-zinc-500 hover:text-zinc-300 no-underline">&larr; Docs</a>
		<h1 class="mt-4 text-3xl font-bold text-zinc-50">Integration Guide</h1>
		<p class="mt-3 text-lg text-zinc-400">How to add amesh to your existing application. Pick the recipe that matches your setup.</p>
	</section>

	<!-- Architecture -->
	<section class="py-8">
		<h2 class="text-xl font-semibold text-zinc-50">Architecture Overview</h2>
		<div class="mt-4 space-y-4">
			<div class="rounded-lg border border-zinc-800 p-4" style="background:#0C0C0E">
				<div class="text-xs font-semibold uppercase tracking-wide text-zinc-500 mb-2">Pairing (one-time)</div>
				<pre class="font-mono text-[13px] leading-relaxed text-zinc-400 overflow-x-auto">Your Server <span class="text-zinc-600">(target)</span>  <span class="text-emerald-400">&lt;--WebSocket--&gt;</span>  Relay  <span class="text-emerald-400">&lt;--WebSocket--&gt;</span>  Client <span class="text-zinc-600">(controller)</span>
<span class="text-zinc-600">Both sides verify a 6-digit code, then exchange public keys.</span>
<span class="text-zinc-600">Trust is one-way: controller &rarr; target. The relay can be shut down after this.</span></pre>
			</div>
			<div class="rounded-lg border border-zinc-800 p-4" style="background:#0C0C0E">
				<div class="text-xs font-semibold uppercase tracking-wide text-zinc-500 mb-2">Runtime (every request)</div>
				<pre class="font-mono text-[13px] leading-relaxed text-zinc-400 overflow-x-auto">Controller  <span class="text-emerald-400">----HTTP + AuthMesh header----&gt;</span>  Target
<span class="text-zinc-600">One-way. No relay. Stateless headers. Target cannot call back.</span></pre>
			</div>
		</div>
	</section>

	<!-- Recipe 1 -->
	<section class="py-8 border-t border-zinc-800">
		<h2 class="text-xl font-semibold text-zinc-50">Recipe 1: Protect an Express API</h2>
		<p class="mt-2 text-zinc-400">Replace Bearer token authentication with hardware-bound device identity.</p>

		<h3 class="mt-6 text-sm font-semibold uppercase tracking-wide text-zinc-500">Server</h3>
		<div class="mt-3">
			<CodeBlock code={`npm install <span class="text-emerald-400">@authmesh/sdk</span> express`} />
		</div>
		<div class="mt-3">
			<CodeBlock code={`<span class="text-zinc-500">// server.ts</span>
<span class="text-zinc-400">import</span> express <span class="text-zinc-400">from</span> <span class="text-emerald-400">'express'</span>;
<span class="text-zinc-400">import</span> { amesh } <span class="text-zinc-400">from</span> <span class="text-emerald-400">'@authmesh/sdk'</span>;

<span class="text-zinc-400">const</span> app = express();
app.use(express.text({ type: <span class="text-emerald-400">'*/*'</span> }));

<span class="text-zinc-500">// Checks signature, timestamp, nonce, allow list</span>
app.use(<span class="text-emerald-400">'/api'</span>, amesh.verify());

app.post(<span class="text-emerald-400">'/api/orders'</span>, (req, res) => {
  res.json({
    device: req.authMesh.deviceId,
    name: req.authMesh.friendlyName,
  });
});

app.listen(<span class="text-emerald-400">3000</span>);`} />
		</div>

		<h3 class="mt-6 text-sm font-semibold uppercase tracking-wide text-zinc-500">Client</h3>
		<div class="mt-3">
			<CodeBlock code={`<span class="text-zinc-500">// client.ts</span>
<span class="text-zinc-400">import</span> { amesh } <span class="text-zinc-400">from</span> <span class="text-emerald-400">'@authmesh/sdk'</span>;

<span class="text-zinc-400">const</span> res = <span class="text-zinc-400">await</span> amesh.fetch(<span class="text-emerald-400">'http://localhost:3000/api/orders'</span>, {
  method: <span class="text-emerald-400">'POST'</span>,
  body: JSON.stringify({ amount: <span class="text-emerald-400">100</span> }),
});`} />
		</div>

		<h3 class="mt-6 text-sm font-semibold uppercase tracking-wide text-zinc-500">Initial setup (run once per machine)</h3>
		<div class="mt-3">
			<CodeBlock code={`<span class="text-zinc-500"># Install CLI</span>
npm install -g <span class="text-emerald-400">@authmesh/cli</span>

<span class="text-zinc-500"># Create identity on each machine</span>
amesh init --name <span class="text-emerald-400">"prod-api"</span>

<span class="text-zinc-500"># Pair: server is the target, your laptop is the controller</span>
amesh listen          <span class="text-zinc-500"># on server (target)</span>
amesh invite 482916   <span class="text-zinc-500"># on laptop (controller — use code from listen)</span>

<span class="text-zinc-500"># Done. Trust is one-way: laptop &rarr; server. Relay can be stopped.</span>`} />
		</div>
	</section>

	<!-- Remote pairing -->
	<section class="py-8 border-t border-zinc-800">
		<h2 class="text-xl font-semibold text-zinc-50">Pairing Remote Machines</h2>
		<p class="mt-2 text-zinc-400">When your server is in the cloud, both machines need to reach the same relay.</p>

		<h3 class="mt-6 text-sm font-semibold uppercase tracking-wide text-zinc-500">Option A: Public relay (easiest)</h3>
		<div class="mt-3">
			<CodeBlock code={`<span class="text-zinc-500"># On the remote server (SSH in)</span>
amesh listen --relay <span class="text-emerald-400">wss://relay.authmesh.dev/ws</span>

<span class="text-zinc-500"># On your laptop</span>
amesh invite 482916 --relay <span class="text-emerald-400">wss://relay.authmesh.dev/ws</span>`} />
		</div>

		<h3 class="mt-6 text-sm font-semibold uppercase tracking-wide text-zinc-500">Option B: Run relay on the server</h3>
		<div class="mt-3">
			<CodeBlock code={`<span class="text-zinc-500"># On the remote server</span>
npx @authmesh/relay                   <span class="text-zinc-500"># starts on :3001</span>
amesh listen --relay <span class="text-emerald-400">ws://localhost:3001/ws</span>

<span class="text-zinc-500"># On your laptop</span>
amesh invite 482916 --relay <span class="text-emerald-400">ws://your-server:3001/ws</span>`} />
		</div>

		<h3 class="mt-6 text-sm font-semibold uppercase tracking-wide text-zinc-500">Option C: Bootstrap token (non-interactive)</h3>
		<div class="mt-3">
			<CodeBlock code={`<span class="text-zinc-500"># On your laptop — generate a token</span>
amesh provision --name <span class="text-emerald-400">"prod-server"</span> --ttl 3600

<span class="text-zinc-500"># Set on remote server as env var. SDK auto-pairs on first request.</span>
AMESH_BOOTSTRAP_TOKEN=eyJ... node app.js`} />
		</div>

		<div class="mt-4">
			<a href="/docs/self-hosting" class="text-sm text-emerald-400 hover:underline">Self-hosting guide: Docker, Cloud Run, Fly.io, Kubernetes &rarr;</a>
		</div>
	</section>

	<!-- Recipe 2 -->
	<section class="py-8 border-t border-zinc-800">
		<h2 class="text-xl font-semibold text-zinc-50">Recipe 2: Microservices</h2>
		<p class="mt-2 text-zinc-400">Each service gets its own device identity. Pair once, authenticate every request.</p>

		<div class="mt-4">
			<CodeBlock code={`<span class="text-zinc-500">// Service B (the API)</span>
app.use(amesh.verify());

app.get(<span class="text-emerald-400">'/internal/users/:id'</span>, (req, res) => {
  console.log(<span class="text-emerald-400">\`Request from \${req.authMesh.friendlyName}\`</span>);
  res.json({ id: req.params.id });
});

<span class="text-zinc-500">// Service A (the caller)</span>
<span class="text-zinc-400">const</span> res = <span class="text-zinc-400">await</span> amesh.fetch(<span class="text-emerald-400">'http://service-b:4000/internal/users/123'</span>);`} />
		</div>
	</section>

	<!-- Recipe 3 -->
	<section class="py-8 border-t border-zinc-800">
		<h2 class="text-xl font-semibold text-zinc-50">Recipe 3: Redis Nonce Store (Production)</h2>
		<p class="mt-2 text-zinc-400">For multi-instance deployments behind a load balancer. Prevents replay attacks across instances.</p>

		<div class="mt-4">
			<CodeBlock code={`<span class="text-zinc-400">import</span> { amesh } <span class="text-zinc-400">from</span> <span class="text-emerald-400">'@authmesh/sdk'</span>;
<span class="text-zinc-400">import</span> { RedisNonceStore } <span class="text-zinc-400">from</span> <span class="text-emerald-400">'@authmesh/sdk/redis'</span>;

app.use(amesh.verify({
  nonceStore: <span class="text-zinc-400">new</span> RedisNonceStore(process.env.REDIS_URL),
}));`} />
		</div>
	</section>

	<!-- Recipe 4 -->
	<section class="py-8 border-t border-zinc-800">
		<h2 class="text-xl font-semibold text-zinc-50">Recipe 4: Webhooks</h2>
		<p class="mt-2 text-zinc-400">Sign webhooks with device identity instead of a shared secret.</p>

		<div class="mt-4">
			<CodeBlock code={`<span class="text-zinc-500">// Sending</span>
<span class="text-zinc-400">await</span> amesh.fetch(webhookUrl, {
  method: <span class="text-emerald-400">'POST'</span>,
  body: JSON.stringify(event),
});

<span class="text-zinc-500">// Receiving</span>
app.post(<span class="text-emerald-400">'/webhooks'</span>, amesh.verify(), (req, res) => {
  console.log(<span class="text-emerald-400">\`Webhook from \${req.authMesh.friendlyName}\`</span>);
  res.sendStatus(<span class="text-emerald-400">200</span>);
});`} />
		</div>
	</section>

	<!-- Environment variables -->
	<section class="py-8 border-t border-zinc-800">
		<h2 class="text-xl font-semibold text-zinc-50">Environment Variables</h2>
		<div class="mt-4 rounded-lg border border-zinc-800 divide-y divide-zinc-800">
			{#each [
				{ name: 'AUTH_MESH_DIR', desc: 'Directory for identity and keys', def: '~/.amesh/' },
				{ name: 'AMESH_BOOTSTRAP_TOKEN', desc: 'Bootstrap token for automated pairing', def: 'optional' },
				{ name: 'RELAY_URL', desc: 'WebSocket relay URL', def: 'wss://relay.authmesh.dev/ws' },
				{ name: 'REDIS_URL', desc: 'Redis URL for nonce store', def: 'optional' },
			] as env}
				<div class="px-4 py-3">
					<code class="font-mono text-sm text-emerald-400">{env.name}</code>
					<div class="mt-1 text-sm text-zinc-400">{env.desc} <span class="text-zinc-600">Default: {env.def}</span></div>
				</div>
			{/each}
		</div>
	</section>

	<!-- TypeScript types -->
	<section class="py-8 border-t border-zinc-800">
		<h2 class="text-xl font-semibold text-zinc-50">TypeScript Types</h2>
		<div class="mt-4">
			<CodeBlock code={`<span class="text-zinc-500">// Available on req.authMesh after amesh.verify()</span>
<span class="text-zinc-400">interface</span> AuthMeshIdentity {
  deviceId: <span class="text-emerald-400">string</span>;       <span class="text-zinc-500">// "am_cOixWcOdI8-pLh4P"</span>
  friendlyName: <span class="text-emerald-400">string</span>;   <span class="text-zinc-500">// "prod-api"</span>
  verifiedAt: <span class="text-emerald-400">number</span>;     <span class="text-zinc-500">// Unix timestamp</span>
}

<span class="text-zinc-500">// amesh.verify() options</span>
<span class="text-zinc-400">interface</span> VerifyOptions {
  clockSkewSeconds?: <span class="text-emerald-400">number</span>;    <span class="text-zinc-500">// Default: 30</span>
  nonceWindowSeconds?: <span class="text-emerald-400">number</span>;  <span class="text-zinc-500">// Default: 60</span>
  nonceStore?: <span class="text-emerald-400">NonceStore</span>;      <span class="text-zinc-500">// Default: InMemoryNonceStore</span>
}`} />
		</div>
	</section>

	<!-- Troubleshooting -->
	<section class="py-8 border-t border-zinc-800">
		<h2 class="text-xl font-semibold text-zinc-50">Troubleshooting</h2>
		<div class="mt-4 space-y-4">
			<div class="border-l-2 border-red-400/60 pl-4 py-1">
				<div class="text-sm font-semibold text-zinc-50">"unauthorized" on every request</div>
				<div class="mt-1 text-sm text-zinc-400">Check: (1) devices are paired (<code class="text-emerald-400">amesh list</code>), (2) clocks are within 30s, (3) body is parsed as text (<code class="text-emerald-400">express.text()</code>), not JSON.</div>
			</div>
			<div class="border-l-2 border-red-400/60 pl-4 py-1">
				<div class="text-sm font-semibold text-zinc-50">"allow_list_integrity_failure" (500)</div>
				<div class="mt-1 text-sm text-zinc-400">The allow list was modified outside amesh. Re-pair devices to regenerate.</div>
			</div>
			<div class="border-l-2 border-red-400/60 pl-4 py-1">
				<div class="text-sm font-semibold text-zinc-50">"Using in-memory nonce store" warning</div>
				<div class="mt-1 text-sm text-zinc-400">Production multi-instance deployments need Redis. See Recipe 3 above.</div>
			</div>
		</div>
	</section>

	<!-- CTA -->
	<section class="py-8 border-t border-zinc-800">
		<div class="flex gap-4">
			<a href={REPO} target="_blank" rel="noopener" class="text-sm text-emerald-400 hover:underline">GitHub</a>
			<span class="text-zinc-700">·</span>
			<a href="/docs" class="text-sm text-emerald-400 hover:underline">All docs</a>
			<span class="text-zinc-700">·</span>
			<a href="{REPO}/blob/main/docs/protocol-spec.md" target="_blank" rel="noopener" class="text-sm text-emerald-400 hover:underline">Protocol spec</a>
		</div>
	</section>

</div>
