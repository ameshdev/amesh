<script lang="ts">
	import Breadcrumb from '$lib/components/Breadcrumb.svelte';
	import TableOfContents from '$lib/components/TableOfContents.svelte';
	import PrevNextNav from '$lib/components/PrevNextNav.svelte';
	import RelatedContent from '$lib/components/RelatedContent.svelte';
	import CodeBlock from '$lib/components/CodeBlock.svelte';
	import { getDocNav } from '$lib/navigation.js';
	import type { RelatedLink } from '$lib/navigation.js';
	import { jsonLdScript, graph, breadcrumbList, techArticle } from '$lib/seo.js';

	const { prev, next } = getDocNav('key-storage');

	const tocItems = [
		{ id: 'how-it-works', label: 'How It Works' },
		{ id: 'tiers', label: 'Storage Tiers' },
		{ id: 'choosing', label: 'Choosing a Backend' },
		{ id: 'encrypted-file', label: 'Encrypted File Details' },
	];

	const relatedLinks: RelatedLink[] = [
		{ href: '/docs/integration', title: 'Integration Guide', desc: 'Express, microservices, webhooks', type: 'doc' },
		{ href: '/docs/self-hosting', title: 'Self-Hosting Guide', desc: 'Run your own relay', type: 'doc' },
	];
</script>

<svelte:head>
	<title>Key Storage — amesh</title>
	<meta name="description" content="How amesh stores private keys: Secure Enclave, macOS Keychain, TPM 2.0, and encrypted file fallback. Tiered auto-detection explained." />
	<link rel="canonical" href="https://authmesh.dev/docs/key-storage" />
	<meta property="og:title" content="Key Storage — amesh" />
	<meta property="og:description" content="Tiered key storage: Secure Enclave, Keychain, TPM, encrypted file. Auto-detected per device." />
	<meta property="og:url" content="https://authmesh.dev/docs/key-storage" />
	{@html jsonLdScript(graph(
		breadcrumbList([
			{ name: 'Home', url: '/' },
			{ name: 'Docs', url: '/docs' },
			{ name: 'Key Storage', url: '/docs/key-storage' }
		]),
		techArticle({
			title: 'Key Storage: Secure Enclave, TPM, Encrypted File',
			description: 'How amesh protects private keys with tiered storage: Secure Enclave, macOS Keychain, TPM 2.0, and encrypted file fallback.',
			url: '/docs/key-storage',
			section: 'Guides'
		})
	))}
</svelte:head>

<div class="mx-auto max-w-2xl px-6 pb-20">

	<section class="pt-16 pb-6">
		<Breadcrumb crumbs={[{ label: 'Docs', href: '/docs' }, { label: 'Key Storage' }]} />
		<h1 class="mt-4 text-3xl font-bold text-zinc-50">Key Storage</h1>
		<p class="mt-3 text-lg text-zinc-400">How amesh protects your private key. Auto-detected per device, from hardware-backed to encrypted file.</p>
		<TableOfContents items={tocItems} />
	</section>

	<!-- How it works -->
	<section class="py-8">
		<h2 id="how-it-works" class="scroll-mt-20 text-xl font-semibold text-zinc-50">How It Works</h2>
		<p class="mt-2 text-zinc-400">
			When you run <code class="text-emerald-400">amesh init</code>, amesh auto-detects the best available key storage on your device. It tries hardware-backed options first and falls back to an encrypted file when hardware storage is unavailable.
		</p>
		<p class="mt-3 text-zinc-400">
			You can also choose a backend explicitly:
		</p>
		<div class="mt-3">
			<CodeBlock code={`<span class="text-zinc-500"># Auto-detect (default)</span>
amesh init --name <span class="text-emerald-400">"my-server"</span>

<span class="text-zinc-500"># Force encrypted file (useful for cloud VMs)</span>
amesh init --name <span class="text-emerald-400">"my-server"</span> --backend <span class="text-emerald-400">encrypted-file</span>`} />
		</div>
	</section>

	<!-- Tiers -->
	<section class="py-8 border-t border-zinc-800">
		<h2 id="tiers" class="scroll-mt-20 text-xl font-semibold text-zinc-50">Storage Tiers</h2>
		<p class="mt-2 text-zinc-400">amesh tries these in order. The first available backend wins.</p>

		<div class="mt-6 space-y-4">
			<!-- Tier 1: Secure Enclave -->
			<div class="rounded-lg border border-zinc-800 p-5" style="background:#0C0C0E">
				<div class="flex items-center gap-3 mb-2">
					<span class="inline-flex items-center rounded-full bg-emerald-400/10 px-2.5 py-0.5 text-xs font-medium text-emerald-400">Tier 1</span>
					<span class="text-sm font-semibold text-zinc-50">macOS Secure Enclave</span>
				</div>
				<p class="text-sm text-zinc-400">Hardware-backed. The private key is generated inside the Secure Enclave chip and cannot be extracted. Requires a code-signed binary.</p>
				<div class="mt-2 text-xs text-zinc-600">Platform: macOS (signed binary) | Key extractable: No</div>
			</div>

			<!-- Tier 2: macOS Keychain -->
			<div class="rounded-lg border border-zinc-800 p-5" style="background:#0C0C0E">
				<div class="flex items-center gap-3 mb-2">
					<span class="inline-flex items-center rounded-full bg-emerald-400/10 px-2.5 py-0.5 text-xs font-medium text-emerald-400">Tier 2</span>
					<span class="text-sm font-semibold text-zinc-50">macOS Keychain</span>
				</div>
				<p class="text-sm text-zinc-400">OS-level software keychain. Used when the binary is not code-signed (e.g., development builds). Key is protected by macOS access controls.</p>
				<div class="mt-2 text-xs text-zinc-600">Platform: macOS (unsigned binary) | Key extractable: By OS owner</div>
			</div>

			<!-- Tier 3: TPM -->
			<div class="rounded-lg border border-zinc-800 p-5" style="background:#0C0C0E">
				<div class="flex items-center gap-3 mb-2">
					<span class="inline-flex items-center rounded-full bg-emerald-400/10 px-2.5 py-0.5 text-xs font-medium text-emerald-400">Tier 3</span>
					<span class="text-sm font-semibold text-zinc-50">Linux TPM 2.0</span>
				</div>
				<p class="text-sm text-zinc-400">Hardware-backed via the Trusted Platform Module. Uses <code class="text-emerald-400">tpm2-tools</code> to generate and use keys inside the TPM chip.</p>
				<div class="mt-2 text-xs text-zinc-600">Platform: Linux (with TPM 2.0 hardware) | Key extractable: No</div>
			</div>

			<!-- Fallback: Encrypted File -->
			<div class="rounded-lg border border-zinc-800 p-5" style="background:#0C0C0E">
				<div class="flex items-center gap-3 mb-2">
					<span class="inline-flex items-center rounded-full bg-zinc-700/50 px-2.5 py-0.5 text-xs font-medium text-zinc-400">Fallback</span>
					<span class="text-sm font-semibold text-zinc-50">Encrypted File</span>
				</div>
				<p class="text-sm text-zinc-400">Software-based fallback for environments without hardware key storage (cloud VMs, containers, CI). The private key is encrypted with AES-256-GCM, derived from an Argon2id-stretched passphrase.</p>
				<div class="mt-2 text-xs text-zinc-600">Platform: Any | Key extractable: With passphrase</div>
			</div>
		</div>
	</section>

	<!-- Choosing -->
	<section class="py-8 border-t border-zinc-800">
		<h2 id="choosing" class="scroll-mt-20 text-xl font-semibold text-zinc-50">Choosing a Backend</h2>
		<div class="mt-4 rounded-xl border border-zinc-800 overflow-x-auto">
			<table class="w-full text-sm">
				<thead>
					<tr class="border-b border-zinc-800">
						<th class="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-zinc-500">Environment</th>
						<th class="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-zinc-500">Backend</th>
						<th class="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-zinc-500">Notes</th>
					</tr>
				</thead>
				<tbody>
					<tr class="border-b border-zinc-800/60">
						<td class="px-4 py-3 text-zinc-300">macOS laptop/desktop</td>
						<td class="px-4 py-3 text-emerald-400">Auto (Keychain/Enclave)</td>
						<td class="px-4 py-3 text-zinc-500">Secure Enclave if code-signed</td>
					</tr>
					<tr class="border-b border-zinc-800/60">
						<td class="px-4 py-3 text-zinc-300">Linux server with TPM</td>
						<td class="px-4 py-3 text-emerald-400">Auto (TPM 2.0)</td>
						<td class="px-4 py-3 text-zinc-500">Requires tpm2-tools installed</td>
					</tr>
					<tr class="border-b border-zinc-800/60">
						<td class="px-4 py-3 text-zinc-300">Cloud VM (EC2, GCP, DO)</td>
						<td class="px-4 py-3 text-emerald-400">Encrypted file</td>
						<td class="px-4 py-3 text-zinc-500">Most cloud VMs lack TPM access</td>
					</tr>
					<tr class="border-b border-zinc-800/60">
						<td class="px-4 py-3 text-zinc-300">Docker / container</td>
						<td class="px-4 py-3 text-emerald-400">Encrypted file</td>
						<td class="px-4 py-3 text-zinc-500">Mount ~/.amesh as a volume</td>
					</tr>
					<tr>
						<td class="px-4 py-3 text-zinc-300">Local development</td>
						<td class="px-4 py-3 text-emerald-400">Encrypted file</td>
						<td class="px-4 py-3 text-zinc-500">Use --backend encrypted-file</td>
					</tr>
				</tbody>
			</table>
		</div>
	</section>

	<!-- Encrypted File Details -->
	<section class="py-8 border-t border-zinc-800">
		<h2 id="encrypted-file" class="scroll-mt-20 text-xl font-semibold text-zinc-50">Encrypted File Details</h2>
		<p class="mt-2 text-zinc-400">
			The encrypted-file backend stores the private key in <code class="text-emerald-400">~/.amesh/key.enc</code>, encrypted with AES-256-GCM. The encryption key is derived from a passphrase using Argon2id.
		</p>

		<div class="mt-4 space-y-3">
			<div class="border-l-2 border-emerald-400/60 pl-4 py-1">
				<div class="text-sm font-semibold text-zinc-50">Auto-generated passphrase</div>
				<div class="mt-1 text-sm text-zinc-400">By default, <code class="text-emerald-400">amesh init</code> generates a 256-bit random passphrase and stores it in <code class="text-emerald-400">identity.json</code>. No user input needed.</div>
			</div>
			<div class="border-l-2 border-emerald-400/60 pl-4 py-1">
				<div class="text-sm font-semibold text-zinc-50">File permissions</div>
				<div class="mt-1 text-sm text-zinc-400">All files are created with mode <code class="text-emerald-400">0600</code>, directories with <code class="text-emerald-400">0700</code>. Only the owner can read.</div>
			</div>
			<div class="border-l-2 border-emerald-400/60 pl-4 py-1">
				<div class="text-sm font-semibold text-zinc-50">Custom passphrase</div>
				<div class="mt-1 text-sm text-zinc-400">Set <code class="text-emerald-400">AUTH_MESH_PASSPHRASE</code> env var to use your own passphrase. Useful when you need deterministic key derivation.</div>
			</div>
		</div>

		<div class="mt-6 rounded-lg border border-zinc-800/60 bg-zinc-900/30 p-4">
			<p class="text-sm text-zinc-500">
				<strong class="text-zinc-400">Note:</strong> The encrypted-file backend protects against disk theft (the key is encrypted at rest) but not against a compromised OS with access to the running process. For the strongest protection, use hardware-backed storage (Secure Enclave or TPM) where available.
			</p>
		</div>
	</section>

	<RelatedContent links={relatedLinks} />
	<PrevNextNav {prev} {next} />

</div>
