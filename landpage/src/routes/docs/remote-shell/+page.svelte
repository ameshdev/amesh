<script lang="ts">
	import CodeBlock from '$lib/components/CodeBlock.svelte';
	import Breadcrumb from '$lib/components/Breadcrumb.svelte';
	import TableOfContents from '$lib/components/TableOfContents.svelte';
	import PrevNextNav from '$lib/components/PrevNextNav.svelte';
	import RelatedContent from '$lib/components/RelatedContent.svelte';
	import { Copy, Check } from '@lucide/svelte';
	import { getDocNav } from '$lib/navigation.js';
	import type { RelatedLink } from '$lib/navigation.js';
	import { jsonLdScript, graph, breadcrumbList, techArticle } from '$lib/seo.js';

	const { prev, next } = getDocNav('remote-shell');

	// Install method tabs. The Homebrew formula installs both `amesh` and
	// `amesh-agent` from a single tap, and the release tarballs contain both
	// binaries, so the controller and server sides just extract different
	// binaries from the same archive. The npm tab shows two separate packages
	// because @authmesh/cli and @authmesh/agent are published independently.
	const installMethods = [
		{
			label: 'Homebrew',
			controller: 'brew install ameshdev/tap/amesh',
			server: 'brew install ameshdev/tap/amesh',
		},
		{
			label: 'npm',
			controller: 'npm install -g @authmesh/cli',
			server: 'npm install -g @authmesh/agent',
		},
		{
			label: 'Binary',
			controller: 'curl -sLO https://github.com/ameshdev/amesh/releases/latest/download/amesh-darwin-arm64.tar.gz\ntar xzf amesh-darwin-arm64.tar.gz && sudo mv amesh /usr/local/bin/',
			server: 'curl -sLO https://github.com/ameshdev/amesh/releases/latest/download/amesh-linux-x64.tar.gz\ntar xzf amesh-linux-x64.tar.gz && sudo mv amesh-agent /usr/local/bin/',
		},
	];
	let activeInstallMethod = $state(0);
	let copiedField: string | null = $state(null);

	function copyCmd(text: string, field: string) {
		navigator.clipboard.writeText(text);
		copiedField = field;
		setTimeout(() => copiedField = null, 2000);
	}

	const tocItems = [
		{ id: 'install', label: 'Install' },
		{ id: 'setup', label: 'Setup' },
		{ id: 'platforms', label: 'Platform Support' },
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
	{@html jsonLdScript(graph(
		breadcrumbList([
			{ name: 'Home', url: '/' },
			{ name: 'Docs', url: '/docs' },
			{ name: 'Remote Shell', url: '/docs/remote-shell' }
		]),
		techArticle({
			title: 'Remote Shell Guide: Secure Shell Access with Device Identity',
			description: 'Set up secure remote shell access with amesh. Agent daemon, shell client, permissions, and security model.',
			url: '/docs/remote-shell',
			section: 'Guides'
		})
	))}
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
		<p class="mt-2 text-zinc-400">Two binaries: <code class="text-emerald-400">amesh</code> for the controller (your laptop), <code class="text-emerald-400">amesh-agent</code> for the server.</p>

		<!-- Install method tabs -->
		<div class="mt-4 rounded-xl border border-zinc-800 overflow-hidden" style="background:#0C0C0E">
			<div class="flex border-b border-zinc-800">
				{#each installMethods as method, i}
					<button
						onclick={() => { activeInstallMethod = i; copiedField = null; }}
						class="cursor-pointer border-none px-4 py-2.5 text-sm transition {i === activeInstallMethod ? 'bg-zinc-800/50 text-zinc-50 font-medium' : 'bg-transparent text-zinc-500 hover:text-zinc-300'} {i === 0 ? 'rounded-tl-xl' : ''}"
					>
						{method.label}
					</button>
				{/each}
			</div>

			<div class="divide-y divide-zinc-800/60">
				<!-- Controller -->
				<div class="px-4 py-3">
					<div class="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-zinc-500">Your laptop (controller)</div>
					<div class="flex items-start justify-between gap-3">
						<code class="overflow-x-auto font-mono text-[13px] text-zinc-300 whitespace-pre">{installMethods[activeInstallMethod].controller}</code>
						<button onclick={() => copyCmd(installMethods[activeInstallMethod].controller, 'controller')} class="shrink-0 cursor-pointer rounded-md border-none bg-transparent p-1.5 text-zinc-600 transition hover:text-zinc-300 mt-0.5" title="Copy">
							{#if copiedField === 'controller'}
								<Check size={14} class="text-emerald-400" />
							{:else}
								<Copy size={14} />
							{/if}
						</button>
					</div>
				</div>

				<!-- Server -->
				<div class="px-4 py-3">
					<div class="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-zinc-500">Server (target)</div>
					<div class="flex items-start justify-between gap-3">
						<code class="overflow-x-auto font-mono text-[13px] text-zinc-300 whitespace-pre">{installMethods[activeInstallMethod].server}</code>
						<button onclick={() => copyCmd(installMethods[activeInstallMethod].server, 'server')} class="shrink-0 cursor-pointer rounded-md border-none bg-transparent p-1.5 text-zinc-600 transition hover:text-zinc-300 mt-0.5" title="Copy">
							{#if copiedField === 'server'}
								<Check size={14} class="text-emerald-400" />
							{:else}
								<Copy size={14} />
							{/if}
						</button>
					</div>
				</div>
			</div>
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
amesh-agent agent start

<span class="text-zinc-500"># Or with options</span>
amesh-agent agent start --relay wss://relay.authmesh.dev/ws --idle-timeout 60`} />
		</div>
		<p class="mt-3 text-xs text-zinc-500">
			Note the binary name: controller commands run through <code class="font-mono text-emerald-400">amesh</code>; the agent daemon runs through <code class="font-mono text-emerald-400">amesh-agent</code>. They are separate packages (<code class="font-mono">@authmesh/cli</code> and <code class="font-mono">@authmesh/agent</code>), but <code class="font-mono text-emerald-400">brew install ameshdev/tap/amesh</code> installs both.
		</p>
	</section>

	<!-- Platform support -->
	<section class="py-8 border-t border-zinc-800">
		<h2 id="platforms" class="scroll-mt-20 text-xl font-semibold text-zinc-50">Platform Support</h2>
		<p class="mt-2 text-zinc-400">The <code class="text-emerald-400">amesh-agent</code> daemon ships as a prebuilt binary on all supported platforms — no runtime install needed.</p>
		<div class="mt-4 overflow-x-auto rounded-lg border border-zinc-800">
			<table class="w-full text-sm">
				<thead>
					<tr class="border-b border-zinc-800 bg-zinc-900/40">
						<th class="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-zinc-500">Platform</th>
						<th class="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-zinc-500">Install via</th>
						<th class="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-zinc-500">Notes</th>
					</tr>
				</thead>
				<tbody class="divide-y divide-zinc-800/60">
					<tr>
						<td class="px-4 py-2.5 font-mono text-xs text-zinc-300">macOS (arm64)</td>
						<td class="px-4 py-2.5 text-xs text-zinc-400">Homebrew · npm · tarball</td>
						<td class="px-4 py-2.5 text-xs text-zinc-500">Apple Silicon; uses Secure Enclave when signed</td>
					</tr>
					<tr>
						<td class="px-4 py-2.5 font-mono text-xs text-zinc-300">macOS (x64)</td>
						<td class="px-4 py-2.5 text-xs text-zinc-400">Homebrew · npm · tarball</td>
						<td class="px-4 py-2.5 text-xs text-zinc-500">Intel macs; falls back to Keychain</td>
					</tr>
					<tr>
						<td class="px-4 py-2.5 font-mono text-xs text-zinc-300">Linux (x64)</td>
						<td class="px-4 py-2.5 text-xs text-zinc-400">Homebrew · npm · tarball · .deb</td>
						<td class="px-4 py-2.5 text-xs text-zinc-500">Most cloud VMs; uses TPM 2.0 when available</td>
					</tr>
					<tr>
						<td class="px-4 py-2.5 font-mono text-xs text-zinc-300">Linux (arm64)</td>
						<td class="px-4 py-2.5 text-xs text-zinc-400">Homebrew · npm · tarball</td>
						<td class="px-4 py-2.5 text-xs text-zinc-500">Raspberry Pi 4/5 on 64-bit Pi OS, Ampere, Graviton</td>
					</tr>
					<tr>
						<td class="px-4 py-2.5 font-mono text-xs text-zinc-500">Linux (armv7, 32-bit)</td>
						<td class="px-4 py-2.5 text-xs text-zinc-500">Bun wrapper only</td>
						<td class="px-4 py-2.5 text-xs text-zinc-500">Raspberry Pi 3 and earlier — see note below</td>
					</tr>
				</tbody>
			</table>
		</div>
		<p class="mt-3 text-xs text-zinc-500">
			<strong class="text-zinc-400">Linux armv7 (Raspberry Pi 3 and earlier):</strong> Bun does not ship for 32-bit ARM. If you must run the agent on these devices, install <a href="https://bun.com/docs/installation" target="_blank" rel="noopener" class="text-emerald-400 no-underline hover:underline">Bun</a> manually (if a third-party build is available for your arch) and run as <code class="font-mono text-emerald-400">bun $(which amesh-agent) agent start</code>. Everything else (Pi 4/5 on 64-bit Pi OS, all modern ARM servers) is supported out of the box.
		</p>
	</section>

	<!-- Usage -->
	<section class="py-8 border-t border-zinc-800">
		<h2 id="usage" class="scroll-mt-20 text-xl font-semibold text-zinc-50">Usage</h2>

		<h3 class="mt-4 text-sm font-semibold uppercase tracking-wide text-zinc-500">Interactive shell</h3>
		<div class="mt-3">
			<CodeBlock code={`<span class="text-zinc-500">$</span> amesh shell prod-api
  Connecting to prod-api (am_7f2e8a1b)...
  Connected. Shell session started.

<span class="text-emerald-400">user@prod-api:~$</span> whoami
user
<span class="text-emerald-400">user@prod-api:~$</span> exit
  Session closed (exit code 0, duration 2m 14s).`} />
		</div>

		<h3 class="mt-6 text-sm font-semibold uppercase tracking-wide text-zinc-500">Single command</h3>
		<div class="mt-3">
			<CodeBlock code={`<span class="text-zinc-500">$</span> amesh shell prod-api -c "df -h"
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
				{ name: 'AUTH_MESH_PASSPHRASE', desc: 'Override auto-generated passphrase (rarely needed)', def: 'optional' },
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
				<div class="mt-1 text-sm text-zinc-400">The agent is not running on the target. Start it with <code class="text-emerald-400">amesh-agent agent start</code> and verify the relay is reachable from both sides.</div>
			</div>
			<div class="border-l-2 border-red-400/60 pl-4 py-1">
				<div class="text-sm font-semibold text-zinc-50">"The agent daemon requires Bun runtime for PTY support" (armv7 only)</div>
				<div class="mt-1 text-sm text-zinc-400">You're on an unsupported architecture (typically Raspberry Pi 3 or earlier, 32-bit Pi OS). The postinstall couldn't find a prebuilt binary for your arch and fell back to the JS entry, which needs Bun for PTY. If a Bun build exists for your arch, install it and run as <code class="text-emerald-400">bun $(which amesh-agent) agent start</code>. On supported architectures (macOS arm64/x64, Linux x64/arm64) this error should not appear — if it does, see the Troubleshooting page for the full diagnostic flow.</div>
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
