<script lang="ts">
	import CodeBlock from '$lib/components/CodeBlock.svelte';
	import Breadcrumb from '$lib/components/Breadcrumb.svelte';
	import TableOfContents from '$lib/components/TableOfContents.svelte';
	import PrevNextNav from '$lib/components/PrevNextNav.svelte';
	import RelatedContent from '$lib/components/RelatedContent.svelte';
	import { getDocNav } from '$lib/navigation.js';
	import type { RelatedLink } from '$lib/navigation.js';

	const { prev, next } = getDocNav('remote-shell');

	const tocItems = [
		{ id: 'install', label: 'Install' },
		{ id: 'setup', label: 'Setup' },
		{ id: 'usage', label: 'Usage' },
		{ id: 'security', label: 'Security Model' },
		{ id: 'env-vars', label: 'Environment Variables' },
		{ id: 'troubleshooting', label: 'Troubleshooting' },
	];

	const relatedLinks: RelatedLink[] = [
		{ href: '/use-cases/remote-shell', title: 'Remote Shell Use Case', desc: 'Why device identity beats SSH keys', type: 'use-case' },
		{ href: '/docs/integration', title: 'Integration Guide', desc: 'HTTP API authentication setup', type: 'doc' },
	];
</script>

<svelte:head>
	<title>Remote Shell Guide — amesh</title>
	<meta name="description" content="Set up secure remote shell access with amesh. Agent daemon, shell client, permissions, and security model." />
	<link rel="canonical" href="https://authmesh.dev/docs/remote-shell" />
	<meta property="og:title" content="Remote Shell Guide — amesh" />
	<meta property="og:description" content="Secure remote shell with device-bound identity. No SSH keys." />
	<meta property="og:url" content="https://authmesh.dev/docs/remote-shell" />
</svelte:head>

<div class="mx-auto max-w-2xl px-6 pb-20">

	<section class="pt-16 pb-6">
		<Breadcrumb crumbs={[{ label: 'Docs', href: '/docs' }, { label: 'Remote Shell Guide' }]} />
		<h1 class="mt-4 text-3xl font-bold text-zinc-50">Remote Shell Guide</h1>
		<p class="mt-3 text-lg text-zinc-400">SSH-like remote access using amesh device identity. No SSH keys, no authorized_keys, instant revocation.</p>
		<TableOfContents items={tocItems} />
	</section>

	<!-- Install -->
	<section class="py-8">
		<h2 id="install" class="scroll-mt-20 text-xl font-semibold text-zinc-50">Install</h2>
		<p class="mt-2 text-zinc-400">The shell feature is a separate package from the CLI.</p>
		<div class="mt-4">
			<CodeBlock code={`<span class="text-zinc-500"># Install the shell package (agent + shell client)</span>
brew install ameshdev/tap/amesh-shell
<span class="text-zinc-500"># or</span>
npm install -g @authmesh/shell

<span class="text-zinc-500"># You also need the CLI for pairing and permissions</span>
brew install ameshdev/tap/amesh`} />
		</div>
	</section>

	<!-- Setup -->
	<section class="py-8 border-t border-zinc-800">
		<h2 id="setup" class="scroll-mt-20 text-xl font-semibold text-zinc-50">Setup</h2>
		<p class="mt-2 text-zinc-400">Three steps: pair the devices (if not already), grant shell access, start the agent.</p>

		<h3 class="mt-6 text-sm font-semibold uppercase tracking-wide text-zinc-500">1. Pair devices (skip if already paired)</h3>
		<div class="mt-3">
			<CodeBlock code={`<span class="text-zinc-500"># On the target (server)</span>
amesh listen

<span class="text-zinc-500"># On the controller (your laptop)</span>
amesh invite 482916`} />
		</div>

		<h3 class="mt-6 text-sm font-semibold uppercase tracking-wide text-zinc-500">2. Grant shell permission</h3>
		<div class="mt-3">
			<CodeBlock code={`<span class="text-zinc-500"># On the target — grant shell access to the controller</span>
amesh grant am_3d9f1a2e --shell

<span class="text-zinc-500"># Verify</span>
amesh list
<span class="text-zinc-500"># Shows: am_3d9f1a2e  alice-macbook  [controller] [shell]  added 2026-04-03</span>`} />
		</div>
		<p class="mt-3 text-sm text-zinc-500">Shell access is opt-in. Pairing for HTTP API auth does not automatically grant shell access.</p>

		<h3 class="mt-6 text-sm font-semibold uppercase tracking-wide text-zinc-500">3. Start the agent</h3>
		<div class="mt-3">
			<CodeBlock code={`<span class="text-zinc-500"># On the target (server) — start the agent daemon</span>
amesh-agent start

<span class="text-zinc-500"># Or with options</span>
amesh-agent start --relay wss://relay.authmesh.dev/ws --idle-timeout 60`} />
		</div>
	</section>

	<!-- Usage -->
	<section class="py-8 border-t border-zinc-800">
		<h2 id="usage" class="scroll-mt-20 text-xl font-semibold text-zinc-50">Usage</h2>

		<h3 class="mt-4 text-sm font-semibold uppercase tracking-wide text-zinc-500">Interactive shell</h3>
		<div class="mt-3">
			<CodeBlock code={`<span class="text-zinc-500">$</span> amesh-shell prod-api
  Connecting to prod-api (am_7f2e8a1b)...
  Connected. Shell session started.

<span class="text-emerald-400">user@prod-api:~$</span> whoami
user
<span class="text-emerald-400">user@prod-api:~$</span> exit
  Session closed (exit code 0, duration 2m 14s).`} />
		</div>

		<h3 class="mt-6 text-sm font-semibold uppercase tracking-wide text-zinc-500">Single command</h3>
		<div class="mt-3">
			<CodeBlock code={`<span class="text-zinc-500">$</span> amesh-shell prod-api -c "df -h"
Filesystem      Size  Used Avail Use% Mounted on
/dev/sda1        50G   12G   35G  26% /`} />
		</div>
	</section>

	<!-- Security Model -->
	<section class="py-8 border-t border-zinc-800">
		<h2 id="security" class="scroll-mt-20 text-xl font-semibold text-zinc-50">Security Model</h2>
		<div class="mt-4 space-y-3">
			<div class="border-l-2 border-emerald-400/60 pl-4 py-1">
				<div class="text-sm font-semibold text-zinc-50">End-to-end encrypted</div>
				<div class="mt-1 text-sm text-zinc-400">ChaCha20-Poly1305 with per-session ephemeral ECDH keys. The relay forwards opaque blobs — it cannot read shell content.</div>
			</div>
			<div class="border-l-2 border-emerald-400/60 pl-4 py-1">
				<div class="text-sm font-semibold text-zinc-50">Perfect forward secrecy</div>
				<div class="mt-1 text-sm text-zinc-400">Each shell session generates new ephemeral P-256 keys. Compromising a session key does not affect past or future sessions.</div>
			</div>
			<div class="border-l-2 border-emerald-400/60 pl-4 py-1">
				<div class="text-sm font-semibold text-zinc-50">Device-ID-bound session keys</div>
				<div class="mt-1 text-sm text-zinc-400">Session keys are derived via HKDF with both device IDs baked in. A session key is only valid between the two intended parties.</div>
			</div>
			<div class="border-l-2 border-emerald-400/60 pl-4 py-1">
				<div class="text-sm font-semibold text-zinc-50">Explicit shell permission</div>
				<div class="mt-1 text-sm text-zinc-400">Pairing for API auth does not grant shell access. Shell requires <code class="text-emerald-400">amesh grant --shell</code>.</div>
			</div>
			<div class="border-l-2 border-emerald-400/60 pl-4 py-1">
				<div class="text-sm font-semibold text-zinc-50">No root by default</div>
				<div class="mt-1 text-sm text-zinc-400">The agent refuses to run as root unless <code class="text-emerald-400">--allow-root</code> is passed. The spawned shell inherits the agent's user permissions.</div>
			</div>
		</div>
	</section>

	<!-- Environment Variables -->
	<section class="py-8 border-t border-zinc-800">
		<h2 id="env-vars" class="scroll-mt-20 text-xl font-semibold text-zinc-50">Environment Variables</h2>
		<div class="mt-4 rounded-lg border border-zinc-800 divide-y divide-zinc-800">
			{#each [
				{ name: 'AUTH_MESH_DIR', desc: 'Directory for identity and keys', def: '~/.amesh/' },
				{ name: 'AUTH_MESH_PASSPHRASE', desc: 'Passphrase for encrypted-file backend', def: 'optional' },
				{ name: 'AMESH_RELAY_URL', desc: 'WebSocket relay URL', def: 'wss://relay.authmesh.dev/ws' },
			] as env}
				<div class="px-4 py-3">
					<code class="font-mono text-sm text-emerald-400">{env.name}</code>
					<div class="mt-1 text-sm text-zinc-400">{env.desc} <span class="text-zinc-600">Default: {env.def}</span></div>
				</div>
			{/each}
		</div>
	</section>

	<!-- Troubleshooting -->
	<section class="py-8 border-t border-zinc-800">
		<h2 id="troubleshooting" class="scroll-mt-20 text-xl font-semibold text-zinc-50">Troubleshooting</h2>
		<div class="mt-4 space-y-4">
			<div class="border-l-2 border-red-400/60 pl-4 py-1">
				<div class="text-sm font-semibold text-zinc-50">"Shell access not granted for this device"</div>
				<div class="mt-1 text-sm text-zinc-400">The controller is paired but doesn't have shell permission. Run <code class="text-emerald-400">amesh grant &lt;device-id&gt; --shell</code> on the target.</div>
			</div>
			<div class="border-l-2 border-red-400/60 pl-4 py-1">
				<div class="text-sm font-semibold text-zinc-50">"Handshake failed" / connection timeout</div>
				<div class="mt-1 text-sm text-zinc-400">The agent is not running on the target. Start it with <code class="text-emerald-400">amesh-agent start</code>.</div>
			</div>
			<div class="border-l-2 border-red-400/60 pl-4 py-1">
				<div class="text-sm font-semibold text-zinc-50">"Refusing to run as root"</div>
				<div class="mt-1 text-sm text-zinc-400">The agent defaults to non-root. Use <code class="text-emerald-400">--allow-root</code> if you understand the risk (grants root shells to all controllers).</div>
			</div>
		</div>
	</section>

	<RelatedContent links={relatedLinks} />
	<PrevNextNav {prev} {next} />

</div>
