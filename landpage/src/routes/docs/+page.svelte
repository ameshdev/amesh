<script lang="ts">
	import { Rocket, Zap, BookOpen, KeyRound, Server, HelpCircle, Wrench, History, FileText, GitBranch, Package, Lightbulb } from '@lucide/svelte';
	import { jsonLdScript, breadcrumbList } from '$lib/seo.js';

	const REPO = 'https://github.com/ameshdev/amesh';

	const sections = [
		{
			label: 'Start here',
			cards: [
				{
					icon: Lightbulb,
					title: 'Introduction',
					desc: 'What amesh is, the problem it solves, and its design philosophy.',
					href: '/docs/introduction',
				},
				{
					icon: Zap,
					title: 'Quickstart',
					desc: 'Install, pair two machines, and sign your first request — in under 5 minutes.',
					href: '/docs/quickstart',
					featured: true,
				},
				{
					icon: Rocket,
					title: 'Integration Guide',
					desc: 'Step-by-step recipes for Express, microservices, webhooks, and remote pairing.',
					href: '/docs/integration',
				},
			],
		},
		{
			label: 'Guides',
			cards: [
				{
					icon: KeyRound,
					title: 'Key Storage',
					desc: 'How private keys are protected: Secure Enclave, Keychain, TPM 2.0, and encrypted file.',
					href: '/docs/key-storage',
				},
				{
					icon: Server,
					title: 'Self-Hosting',
					desc: 'Run your own relay with Docker, Cloud Run, Fly.io, Kubernetes, or plain Bun.',
					href: '/docs/self-hosting',
				},
			],
		},
		{
			label: 'Reference',
			cards: [
				{
					icon: HelpCircle,
					title: 'FAQ',
					desc: 'Common questions about device identity, comparisons to mTLS, OAuth, and secrets managers, and compliance.',
					href: '/docs/faq',
				},
				{
					icon: Wrench,
					title: 'Troubleshooting',
					desc: 'Common errors and how to fix them — signing, pairing, key storage, relay.',
					href: '/docs/troubleshooting',
				},
				{
					icon: History,
					title: 'Changelog',
					desc: 'Release notes and version history. Security fixes, new features, breaking changes.',
					href: '/docs/changelog',
				},
			],
		},
	];

	const externalRefs = [
		{
			icon: FileText,
			title: 'Protocol Specification',
			desc: 'v2.0.0 — full wire format, crypto details, and threat model',
			href: `${REPO}/blob/main/docs/protocol-spec.md`,
		},
		{
			icon: GitBranch,
			title: 'Architecture Decisions',
			desc: '10 ADRs: P-256 over Ed25519, SAS verification, Bun.serve(), and more',
			href: `${REPO}/blob/main/docs/architecture-decisions.md`,
		},
		{
			icon: BookOpen,
			title: 'Usage Guide',
			desc: 'Full CLI reference with every command and flag',
			href: `${REPO}/blob/main/docs/guide.md`,
		},
	];

	const packages = [
		{ name: '@authmesh/sdk', desc: 'Signing client + Express middleware' },
		{ name: '@authmesh/cli', desc: 'Device management CLI' },
		{ name: '@authmesh/core', desc: 'Crypto primitives' },
		{ name: '@authmesh/keystore', desc: 'Device key storage' },
		{ name: '@authmesh/relay', desc: 'Pairing relay server' },
	];
</script>

<svelte:head>
	<title>Documentation — amesh</title>
	<meta name="description" content="Guides, quickstart, API reference, FAQ, troubleshooting, and changelog for amesh — device-bound M2M authentication." />
	<link rel="canonical" href="https://authmesh.dev/docs" />
	<meta property="og:title" content="Documentation — amesh" />
	<meta property="og:description" content="Guides, reference, and packages for amesh device-bound M2M authentication." />
	<meta property="og:url" content="https://authmesh.dev/docs" />
	{@html jsonLdScript(breadcrumbList([
		{ name: 'Home', url: '/' },
		{ name: 'Docs', url: '/docs' }
	]))}
</svelte:head>

<div class="mx-auto max-w-3xl px-6 pb-20">

	<!-- Hero -->
	<section class="pt-16 pb-10">
		<h1 class="text-4xl font-bold tracking-tight text-zinc-50">Documentation</h1>
		<p class="mt-4 max-w-xl text-lg text-zinc-400">
			Everything you need to replace static API keys with device-bound identity — from your first
			<a href="/docs/quickstart" class="text-emerald-400 no-underline hover:underline">5-minute setup</a>
			to self-hosting the relay.
		</p>
	</section>

	<!-- Section card grids -->
	{#each sections as section}
		<section class="pb-12">
			<h2 class="mb-5 text-[11px] font-semibold uppercase tracking-[0.2em] text-zinc-500">{section.label}</h2>
			<div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
				{#each section.cards as card}
					{@const Icon = card.icon}
					<a
						href={card.href}
						class="group relative flex flex-col rounded-xl border p-5 no-underline transition-all duration-200 hover:-translate-y-0.5 hover:shadow-xl hover:shadow-emerald-950/20
							{card.featured ? 'border-emerald-400/30 bg-emerald-400/[0.03] hover:border-emerald-400/50' : 'border-zinc-800 bg-zinc-900/30 hover:border-emerald-400/30 hover:bg-zinc-900'}"
					>
						<div class="inline-flex w-fit rounded-lg bg-emerald-400/10 p-2 transition-transform duration-200 group-hover:scale-110">
							<Icon size={18} class="text-emerald-400" />
						</div>
						<h3 class="mt-4 text-base font-semibold text-zinc-50">{card.title}</h3>
						<p class="mt-1.5 text-sm leading-relaxed text-zinc-400">{card.desc}</p>
						{#if card.featured}
							<span class="absolute right-4 top-4 rounded-full border border-emerald-400/30 bg-emerald-400/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-emerald-400">Start here</span>
						{/if}
					</a>
				{/each}
			</div>
		</section>
	{/each}

	<!-- External reference -->
	<section class="pb-12">
		<h2 class="mb-5 text-[11px] font-semibold uppercase tracking-[0.2em] text-zinc-500">Deep reference</h2>
		<div class="rounded-xl border border-zinc-800 divide-y divide-zinc-800">
			{#each externalRefs as ref}
				{@const Icon = ref.icon}
				<a
					href={ref.href}
					target="_blank"
					rel="noopener"
					class="flex items-start gap-4 px-5 py-4 no-underline transition hover:bg-zinc-900/50"
				>
					<div class="mt-0.5 shrink-0 rounded-md bg-zinc-800/50 p-2">
						<Icon size={16} class="text-zinc-400" />
					</div>
					<div class="min-w-0 flex-1">
						<div class="text-sm font-semibold text-zinc-50">{ref.title}<span class="ml-1.5 text-zinc-600">↗</span></div>
						<div class="mt-0.5 text-sm text-zinc-500">{ref.desc}</div>
					</div>
				</a>
			{/each}
		</div>
	</section>

	<!-- Packages -->
	<section class="pb-12">
		<h2 class="mb-5 text-[11px] font-semibold uppercase tracking-[0.2em] text-zinc-500">Packages</h2>
		<div class="rounded-xl border border-zinc-800 divide-y divide-zinc-800">
			{#each packages as pkg}
				<a
					href="https://www.npmjs.com/package/{pkg.name}"
					target="_blank"
					rel="noopener"
					class="flex items-center justify-between px-5 py-3 no-underline transition hover:bg-zinc-900/50"
				>
					<div class="flex items-center gap-3">
						<Package size={14} class="text-zinc-600" />
						<span class="font-mono text-sm text-emerald-400">{pkg.name}</span>
					</div>
					<span class="text-xs text-zinc-500">{pkg.desc}</span>
				</a>
			{/each}
		</div>
	</section>

	<!-- Use Cases cross-link -->
	<section class="pt-6 pb-4 border-t border-zinc-800">
		<p class="text-sm text-zinc-400">
			See also:
			<a href="/use-cases" class="text-emerald-400 no-underline hover:underline">Use Cases</a>
			— real-world patterns for microservices, webhooks, cron jobs, and internal tools.
		</p>
	</section>

</div>
