<script lang="ts">
	import { BookOpen, Code2, Shield, Cpu, Database, Rocket, FileText, GitBranch, Server } from '@lucide/svelte';

	const REPO = 'https://github.com/ameshdev/amesh';

	const gettingStarted = [
		{
			icon: Rocket,
			title: 'Integration Guide',
			desc: 'Step-by-step recipes for Express, microservices, CI/CD, webhooks, and remote pairing.',
			href: '/docs/integration',
		},
		{
			icon: Server,
			title: 'Self-Hosting Guide',
			desc: 'Run your own relay with Docker, Cloud Run, Fly.io, Kubernetes, or plain Node.js.',
			href: '/docs/self-hosting',
		},
		{
			icon: BookOpen,
			title: 'Usage Guide',
			desc: 'Full walkthrough of CLI commands, SDK usage, crypto primitives, and the pairing handshake.',
			href: `${REPO}/blob/main/docs/guide.md`,
			external: true,
		},
	];

	const reference = [
		{
			icon: FileText,
			title: 'Protocol Specification',
			desc: 'v2.0.0 — wire format, crypto details, security model, threat analysis.',
			href: `${REPO}/blob/main/docs/protocol-spec.md`,
			external: true,
		},
		{
			icon: GitBranch,
			title: 'Architecture Decisions',
			desc: '8 ADRs: P-256 over Ed25519, no keytar, SAS verification, Fastify v5, and more.',
			href: `${REPO}/blob/main/docs/architecture-decisions.md`,
			external: true,
		},
		{
			icon: Shield,
			title: 'Why amesh',
			desc: 'The problem with static API keys and how hardware-bound identity solves it.',
			href: `${REPO}/blob/main/docs/why-amesh.md`,
			external: true,
		},
	];

	const advanced = [
		{
			icon: Cpu,
			title: 'Hardware Implementation',
			desc: 'Secure Enclave, TPM 2.0, and encrypted-file keystore internals.',
			href: `${REPO}/blob/main/docs/hardware-implementation.md`,
			external: true,
		},
		{
			icon: Database,
			title: 'Redis Nonce Store',
			desc: 'Multi-instance replay protection for production deployments.',
			href: `${REPO}/blob/main/docs/redis-nonce-adapter.md`,
			external: true,
		},
		{
			icon: Code2,
			title: 'Automated Provisioning',
			desc: 'Bootstrap tokens for CI/CD runners, Lambda, Docker, and Kubernetes.',
			href: `${REPO}/blob/main/docs/automated-provisioning.md`,
			external: true,
		},
	];

	const packages = [
		{ name: '@authmesh/sdk', desc: 'Signing client + Express middleware', href: `${REPO}/tree/main/packages/sdk` },
		{ name: '@authmesh/cli', desc: 'Device management CLI', href: `${REPO}/tree/main/packages/cli` },
		{ name: '@authmesh/core', desc: 'Crypto primitives', href: `${REPO}/tree/main/packages/core` },
		{ name: '@authmesh/keystore', desc: 'Hardware key storage', href: `${REPO}/tree/main/packages/keystore` },
		{ name: '@authmesh/relay', desc: 'Pairing relay server', href: `${REPO}/tree/main/packages/relay` },
	];
</script>

<svelte:head>
	<title>Documentation — amesh</title>
	<meta name="description" content="Guides, API reference, protocol specification, and architecture decisions for amesh hardware-bound M2M authentication." />
	<link rel="canonical" href="https://authmesh.dev/docs" />
	<meta property="og:title" content="Documentation — amesh" />
	<meta property="og:description" content="Guides, API reference, protocol specification, and architecture decisions for amesh." />
	<meta property="og:url" content="https://authmesh.dev/docs" />
</svelte:head>

<div class="mx-auto max-w-2xl px-6 pb-20">

	<section class="pt-16 pb-10">
		<h1 class="text-3xl font-bold text-zinc-50">Documentation</h1>
		<p class="mt-3 text-lg text-zinc-400">Everything you need to replace API keys with hardware-bound device identity.</p>
	</section>

	<!-- Quick install -->
	<section class="pb-10">
		<div class="rounded-lg border border-zinc-800 p-5" style="background:#0C0C0E">
			<div class="text-xs font-semibold uppercase tracking-wide text-zinc-500 mb-3">Quick start</div>
			<pre class="font-mono text-[13px] leading-relaxed text-zinc-300"><span class="text-zinc-500">$</span> npm install <span class="text-emerald-400">@authmesh/sdk</span>          <span class="text-zinc-600"># signing client + verification middleware</span>
<span class="text-zinc-500">$</span> npm install -g <span class="text-emerald-400">@authmesh/cli</span>      <span class="text-zinc-600"># CLI for device management</span></pre>
		</div>
	</section>

	<!-- Getting started -->
	<section class="pb-10">
		<h2 class="text-xl font-semibold text-zinc-50 mb-5">Getting Started</h2>
		<div class="space-y-3">
			{#each gettingStarted as doc}
				<a
					href={doc.href}
					target={doc.external ? '_blank' : undefined}
					rel={doc.external ? 'noopener' : undefined}
					class="flex items-start gap-4 rounded-lg border border-zinc-800 p-4 no-underline transition hover:border-zinc-700 hover:bg-zinc-900/50"
				>
					<div class="mt-0.5 rounded-md bg-emerald-400/10 p-2">
						{#if doc.icon}<doc.icon size={18} class="text-emerald-400" />{/if}
					</div>
					<div>
						<div class="text-sm font-semibold text-zinc-50">{doc.title}</div>
						<div class="mt-1 text-sm text-zinc-400">{doc.desc}</div>
					</div>
				</a>
			{/each}
		</div>
	</section>

	<!-- Reference -->
	<section class="pb-10">
		<h2 class="text-xl font-semibold text-zinc-50 mb-5">Reference</h2>
		<div class="space-y-3">
			{#each reference as doc}
				<a
					href={doc.href}
					target="_blank"
					rel="noopener"
					class="flex items-start gap-4 rounded-lg border border-zinc-800 p-4 no-underline transition hover:border-zinc-700 hover:bg-zinc-900/50"
				>
					<div class="mt-0.5 rounded-md bg-emerald-400/10 p-2">
						{#if doc.icon}<doc.icon size={18} class="text-emerald-400" />{/if}
					</div>
					<div>
						<div class="text-sm font-semibold text-zinc-50">{doc.title}</div>
						<div class="mt-1 text-sm text-zinc-400">{doc.desc}</div>
					</div>
				</a>
			{/each}
		</div>
	</section>

	<!-- Advanced -->
	<section class="pb-10">
		<h2 class="text-xl font-semibold text-zinc-50 mb-5">Advanced</h2>
		<div class="space-y-3">
			{#each advanced as doc}
				<a
					href={doc.href}
					target="_blank"
					rel="noopener"
					class="flex items-start gap-4 rounded-lg border border-zinc-800 p-4 no-underline transition hover:border-zinc-700 hover:bg-zinc-900/50"
				>
					<div class="mt-0.5 rounded-md bg-emerald-400/10 p-2">
						{#if doc.icon}<doc.icon size={18} class="text-emerald-400" />{/if}
					</div>
					<div>
						<div class="text-sm font-semibold text-zinc-50">{doc.title}</div>
						<div class="mt-1 text-sm text-zinc-400">{doc.desc}</div>
					</div>
				</a>
			{/each}
		</div>
	</section>

	<!-- Packages -->
	<section class="pb-10">
		<h2 class="text-xl font-semibold text-zinc-50 mb-5">Packages</h2>
		<div class="rounded-lg border border-zinc-800 divide-y divide-zinc-800">
			{#each packages as pkg}
				<a
					href={pkg.href}
					target="_blank"
					rel="noopener"
					class="flex items-center justify-between px-4 py-3 no-underline transition hover:bg-zinc-900/50"
				>
					<div>
						<span class="font-mono text-sm text-emerald-400">{pkg.name}</span>
						<span class="ml-3 text-sm text-zinc-500">{pkg.desc}</span>
					</div>
				</a>
			{/each}
		</div>
	</section>

</div>
