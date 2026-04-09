<script lang="ts">
	import Breadcrumb from '$lib/components/Breadcrumb.svelte';
	import TableOfContents from '$lib/components/TableOfContents.svelte';
	import PrevNextNav from '$lib/components/PrevNextNav.svelte';
	import RelatedContent from '$lib/components/RelatedContent.svelte';
	import CodeBlock from '$lib/components/CodeBlock.svelte';
	import { getDocNav } from '$lib/navigation.js';
	import type { RelatedLink } from '$lib/navigation.js';
	import { jsonLdScript, graph, breadcrumbList, techArticle } from '$lib/seo.js';

	const { prev, next } = getDocNav('troubleshooting');

	const tocItems = [
		{ id: 'signing', label: 'Signing & verification errors' },
		{ id: 'pairing', label: 'Pairing errors' },
		{ id: 'backend', label: 'Key storage backend errors' },
		{ id: 'shell', label: 'Remote shell errors' },
		{ id: 'relay', label: 'Self-hosted relay errors' },
		{ id: 'diagnostics', label: 'Diagnostic commands' },
	];

	const relatedLinks: RelatedLink[] = [
		{ href: '/docs/faq', title: 'FAQ', desc: 'Common questions about amesh', type: 'doc' },
		{ href: '/docs/integration', title: 'Integration Guide', desc: 'Setup recipes with working code', type: 'doc' },
	];
</script>

<svelte:head>
	<title>Troubleshooting — amesh</title>
	<meta name="description" content="Common amesh errors and how to fix them. Signing failures, pairing issues, key storage errors, relay problems, and remote shell connection issues." />
	<link rel="canonical" href="https://authmesh.dev/docs/troubleshooting" />
	<meta property="og:title" content="Troubleshooting — amesh" />
	<meta property="og:description" content="Common amesh errors and how to fix them." />
	<meta property="og:url" content="https://authmesh.dev/docs/troubleshooting" />
	{@html jsonLdScript(graph(
		breadcrumbList([
			{ name: 'Home', url: '/' },
			{ name: 'Docs', url: '/docs' },
			{ name: 'Troubleshooting', url: '/docs/troubleshooting' }
		]),
		techArticle({
			title: 'Troubleshooting amesh Errors',
			description: 'Common amesh errors and how to fix them.',
			url: '/docs/troubleshooting',
			section: 'Reference'
		})
	))}
</svelte:head>

<div class="mx-auto max-w-2xl px-6 pb-20">
	<section class="pt-16 pb-6">
		<Breadcrumb crumbs={[{ label: 'Docs', href: '/docs' }, { label: 'Troubleshooting' }]} />
		<h1 class="mt-4 text-3xl font-bold text-zinc-50">Troubleshooting</h1>
		<p class="mt-3 text-lg text-zinc-400">Common errors and how to fix them, grouped by where they come from.</p>
		<TableOfContents items={tocItems} />
	</section>

	<section class="py-8">
		<h2 id="signing" class="scroll-mt-20 text-xl font-semibold text-zinc-50">Signing & verification errors</h2>
		<div class="mt-4 space-y-4">
			<div class="rounded-lg border-l-2 border-red-400/60 bg-zinc-900/30 px-4 py-3">
				<div class="text-sm font-semibold text-zinc-50">401 <code class="font-mono">unauthorized</code> on every request</div>
				<p class="mt-1 text-sm text-zinc-400">Most common cause: the target server parses the body as JSON before amesh verifies it. amesh verifies the signature over the raw body, so you must use <code class="font-mono text-emerald-400">express.text()</code> or similar and parse JSON yourself after verification. Also check that both devices are paired (<code class="font-mono text-emerald-400">amesh list</code>) and clocks are within 30 seconds.</p>
			</div>
			<div class="rounded-lg border-l-2 border-red-400/60 bg-zinc-900/30 px-4 py-3">
				<div class="text-sm font-semibold text-zinc-50"><code class="font-mono">timestamp_out_of_range</code></div>
				<p class="mt-1 text-sm text-zinc-400">The device clock is off by more than 30 seconds from the server. This is one of the few error details amesh exposes in 401 bodies (intentionally — you need to know it's clock drift, not a real auth failure). Fix clock sync (ntp, chrony) on the controller.</p>
			</div>
			<div class="rounded-lg border-l-2 border-red-400/60 bg-zinc-900/30 px-4 py-3">
				<div class="text-sm font-semibold text-zinc-50"><code class="font-mono">unsupported_version</code></div>
				<p class="mt-1 text-sm text-zinc-400">The client is signing with a newer protocol version than the server knows. Upgrade the server-side <code class="font-mono text-emerald-400">@authmesh/sdk</code>.</p>
			</div>
			<div class="rounded-lg border-l-2 border-red-400/60 bg-zinc-900/30 px-4 py-3">
				<div class="text-sm font-semibold text-zinc-50"><code class="font-mono">replay_detected</code></div>
				<p class="mt-1 text-sm text-zinc-400">The same nonce was used twice within the 30-second window. If you're running multiple server instances, they need a shared nonce store (Redis). See <a href="/docs/integration#recipe-redis" class="text-emerald-400 no-underline hover:underline">Integration Recipe 3</a>. If you're in development with one instance and still see this, a client is actually retrying with the same nonce — regenerate it per request.</p>
			</div>
			<div class="rounded-lg border-l-2 border-red-400/60 bg-zinc-900/30 px-4 py-3">
				<div class="text-sm font-semibold text-zinc-50"><code class="font-mono">"Using in-memory nonce store"</code> warning</div>
				<p class="mt-1 text-sm text-zinc-400">Production deployments with more than one instance need Redis. The in-memory store is fine for single-instance dev/staging.</p>
			</div>
		</div>
	</section>

	<section class="py-8">
		<h2 id="pairing" class="scroll-mt-20 text-xl font-semibold text-zinc-50">Pairing errors</h2>
		<div class="mt-4 space-y-4">
			<div class="rounded-lg border-l-2 border-red-400/60 bg-zinc-900/30 px-4 py-3">
				<div class="text-sm font-semibold text-zinc-50"><code class="font-mono">SAS verification failed</code></div>
				<p class="mt-1 text-sm text-zinc-400">The 6-digit verification codes on controller and target didn't match. Either you entered it wrong, or a MITM attempt is underway on the relay. Abort and retry pairing.</p>
			</div>
			<div class="rounded-lg border-l-2 border-red-400/60 bg-zinc-900/30 px-4 py-3">
				<div class="text-sm font-semibold text-zinc-50"><code class="font-mono">allow_list_integrity_failure</code> (500 on server)</div>
				<p class="mt-1 text-sm text-zinc-400">The allow_list.json file was modified outside amesh. It's HMAC-sealed, so any tampering breaks verification. Re-pair devices to regenerate.</p>
			</div>
			<div class="rounded-lg border-l-2 border-red-400/60 bg-zinc-900/30 px-4 py-3">
				<div class="text-sm font-semibold text-zinc-50">Pairing code expired / <code class="font-mono">peer not found</code></div>
				<p class="mt-1 text-sm text-zinc-400">Pairing codes are short-lived (2 minutes). Run <code class="font-mono text-emerald-400">amesh listen</code> again on the target to get a fresh one.</p>
			</div>
			<div class="rounded-lg border-l-2 border-red-400/60 bg-zinc-900/30 px-4 py-3">
				<div class="text-sm font-semibold text-zinc-50"><code class="font-mono">selfSig verification failed</code> after re-init</div>
				<p class="mt-1 text-sm text-zinc-400">Known issue in older versions where macOS Keychain accumulated stale keys across <code class="font-mono text-emerald-400">amesh init --force</code> runs. Fixed in v0.3.1. Upgrade and re-run init.</p>
			</div>
			<div class="rounded-lg border-l-2 border-red-400/60 bg-zinc-900/30 px-4 py-3">
				<div class="text-sm font-semibold text-zinc-50"><code class="font-mono">Device already in allow list</code></div>
				<p class="mt-1 text-sm text-zinc-400">The device was previously paired. From v0.5.3+, the CLI automatically updates the existing entry with fresh handshake data. On older versions, run <code class="font-mono text-emerald-400">amesh revoke &lt;device-id&gt;</code> first, then re-pair.</p>
			</div>
			<div class="rounded-lg border-l-2 border-red-400/60 bg-zinc-900/30 px-4 py-3">
				<div class="text-sm font-semibold text-zinc-50">One-sided trust (paired on one side but not the other)</div>
				<p class="mt-1 text-sm text-zinc-400">Can happen if one side crashed mid-pairing. Run <code class="font-mono text-emerald-400">amesh list</code> on both machines. Revoke the stale entry with <code class="font-mono text-emerald-400">amesh revoke &lt;device-id&gt;</code>, then re-pair.</p>
			</div>
			<div class="rounded-lg border-l-2 border-red-400/60 bg-zinc-900/30 px-4 py-3">
				<div class="text-sm font-semibold text-zinc-50">Can't run interactive commands on the target</div>
				<p class="mt-1 text-sm text-zinc-400">The pairing flow requires interactive SAS code entry. For remote or scripted environments, use <code class="font-mono text-emerald-400">amesh provision</code> on the controller to generate a bootstrap token. Set <code class="font-mono text-emerald-400">AMESH_BOOTSTRAP_TOKEN</code> on the target — pairing happens automatically on first request.</p>
			</div>
		</div>
	</section>

	<section class="py-8">
		<h2 id="backend" class="scroll-mt-20 text-xl font-semibold text-zinc-50">Key storage backend errors</h2>
		<div class="mt-4 space-y-4">
			<div class="rounded-lg border-l-2 border-red-400/60 bg-zinc-900/30 px-4 py-3">
				<div class="text-sm font-semibold text-zinc-50">Falling back to encrypted-file on macOS</div>
				<p class="mt-1 text-sm text-zinc-400">On Apple Silicon, Secure Enclave requires a signed binary. Homebrew installs are signed automatically; dev builds from source won't be. macOS Keychain is the second tier and works for unsigned builds. The encrypted-file backend is a software-only fallback — not bound to hardware.</p>
			</div>
			<div class="rounded-lg border-l-2 border-red-400/60 bg-zinc-900/30 px-4 py-3">
				<div class="text-sm font-semibold text-zinc-50"><code class="font-mono">TPM not available</code> on Linux</div>
				<p class="mt-1 text-sm text-zinc-400">Verify with <code class="font-mono text-emerald-400">ls /dev/tpmrm0</code>. You may need <code class="font-mono text-emerald-400">tss2</code> libraries installed (<code class="font-mono">apt install tpm2-tools</code>) and user membership in the <code class="font-mono">tss</code> group.</p>
			</div>
			<div class="rounded-lg border-l-2 border-red-400/60 bg-zinc-900/30 px-4 py-3">
				<div class="text-sm font-semibold text-zinc-50"><code class="font-mono">AUTH_MESH_PASSPHRASE</code> required</div>
				<p class="mt-1 text-sm text-zinc-400">You're using the encrypted-file backend with a passphrase not stored in identity.json (older setups). Either set the env var, or re-init — from v0.3.0+, amesh auto-generates a 256-bit passphrase and stores it in identity.json.</p>
			</div>
		</div>
	</section>

	<section class="py-8">
		<h2 id="shell" class="scroll-mt-20 text-xl font-semibold text-zinc-50">Remote shell errors</h2>
		<div class="mt-4 space-y-4">
			<div class="rounded-lg border-l-2 border-red-400/60 bg-zinc-900/30 px-4 py-3">
				<div class="text-sm font-semibold text-zinc-50"><code class="font-mono">"Shell access not granted for this device"</code></div>
				<p class="mt-1 text-sm text-zinc-400">The controller is paired but doesn't have shell permission. Run <code class="font-mono text-emerald-400">amesh grant &lt;device-id&gt; --shell</code> on the target. Pairing alone doesn't grant shell access — it's a separate explicit permission.</p>
			</div>
			<div class="rounded-lg border-l-2 border-red-400/60 bg-zinc-900/30 px-4 py-3">
				<div class="text-sm font-semibold text-zinc-50"><code class="font-mono">"The agent daemon requires Bun runtime for PTY support"</code> (unsupported architectures only)</div>
				<p class="mt-1 text-sm text-zinc-400">
					You should never see this on macOS (arm64/x64) or Linux (x64/arm64) — the npm postinstall downloads a prebuilt binary that bundles Bun, and <code class="font-mono text-emerald-400">amesh agent start</code> runs directly. If you do see it on a supported platform, the postinstall probably couldn't reach GitHub releases — check the install log for download errors and re-run <code class="font-mono text-emerald-400">npm rebuild @authmesh/cli</code> with network access.
				</p>
				<p class="mt-2 text-sm text-zinc-400">
					On unsupported architectures (Raspberry Pi 3 and earlier, armv7 32-bit Pi OS), the postinstall falls back to the JS entry and the agent needs Bun for PTY. Bun does not ship for armv7, so you'd need a third-party Bun build. Most users should move to Pi 4/5 on 64-bit Pi OS or a different ARM host.
				</p>
			</div>
			<div class="rounded-lg border-l-2 border-red-400/60 bg-zinc-900/30 px-4 py-3">
				<div class="text-sm font-semibold text-zinc-50"><code class="font-mono">"Handshake failed"</code> / connection timeout</div>
				<p class="mt-1 text-sm text-zinc-400">The agent is not running on the target. Start it with <code class="font-mono text-emerald-400">amesh agent start</code>, and verify the relay is reachable from both sides (port 443 or whatever your self-hosted relay uses).</p>
			</div>
			<div class="rounded-lg border-l-2 border-red-400/60 bg-zinc-900/30 px-4 py-3">
				<div class="text-sm font-semibold text-zinc-50"><code class="font-mono">"Refusing to run as root"</code></div>
				<p class="mt-1 text-sm text-zinc-400">The agent defaults to non-root for safety. If you genuinely need root shells (and understand the blast radius), start the agent with <code class="font-mono text-emerald-400">--allow-root</code>.</p>
			</div>
		</div>
	</section>

	<section class="py-8">
		<h2 id="relay" class="scroll-mt-20 text-xl font-semibold text-zinc-50">Self-hosted relay errors</h2>
		<div class="mt-4 space-y-4">
			<div class="rounded-lg border-l-2 border-red-400/60 bg-zinc-900/30 px-4 py-3">
				<div class="text-sm font-semibold text-zinc-50">Relay won't start: <code class="font-mono">"requires Bun"</code></div>
				<p class="mt-1 text-sm text-zinc-400">The relay is Bun-native (uses <code class="font-mono text-emerald-400">Bun.serve()</code>). Install Bun from <a href="https://bun.com/docs/installation" target="_blank" rel="noopener" class="text-emerald-400 no-underline hover:underline">bun.com</a> or use the provided Dockerfile which bundles Bun.</p>
			</div>
			<div class="rounded-lg border-l-2 border-red-400/60 bg-zinc-900/30 px-4 py-3">
				<div class="text-sm font-semibold text-zinc-50">Cloud Run: cold start pairings fail</div>
				<p class="mt-1 text-sm text-zinc-400">Pairing uses WebSocket and takes up to 90 seconds end-to-end. Set Cloud Run min instances ≥ 1 to avoid cold-start WebSocket drops, or increase request timeout.</p>
			</div>
		</div>
	</section>

	<section class="py-8">
		<h2 id="diagnostics" class="scroll-mt-20 text-xl font-semibold text-zinc-50">Diagnostic commands</h2>
		<p class="mt-3 text-zinc-400">When in doubt, start here:</p>
		<div class="mt-4">
			<CodeBlock code={`<span class="text-zinc-500"># Show this device + all trusted peers</span>
<span class="text-zinc-500">$</span> amesh list

<span class="text-zinc-500"># Verify clock sync (macOS)</span>
<span class="text-zinc-500">$</span> sntp -t 5 time.apple.com

<span class="text-zinc-500"># Verify clock sync (Linux)</span>
<span class="text-zinc-500">$</span> timedatectl status

<span class="text-zinc-500"># Test SDK signing end-to-end (no server needed)</span>
<span class="text-zinc-500">$</span> amesh sign-test

<span class="text-zinc-500"># Check which key storage backend is active</span>
<span class="text-zinc-500">$</span> amesh list | grep Backend`} />
		</div>
	</section>

	<PrevNextNav {prev} {next} />
	<RelatedContent links={relatedLinks} />
</div>
