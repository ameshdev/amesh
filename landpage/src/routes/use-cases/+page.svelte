<script lang="ts">
	import { Network, Webhook, Clock, Terminal, ChevronRight } from '@lucide/svelte';

	const cases = [
		{ slug: 'microservices', icon: Network, title: 'Microservices', desc: 'Every service gets its own device-bound identity. No shared API keys. Per-service audit trail.' },
		{ slug: 'webhooks', icon: Webhook, title: 'Webhooks', desc: 'Prove webhook sender identity cryptographically. No HMAC secrets to share and rotate.' },
		{ slug: 'cron-jobs', icon: Clock, title: 'Cron Jobs', desc: 'Replace plaintext API keys in scheduled tasks. Per-server audit trail, instant revocation.' },
		{ slug: 'internal-tools', icon: Terminal, title: 'Internal Tools', desc: 'Each developer\'s laptop IS their identity. Know who ran what. SOC2-ready audit trail.' },
	];
</script>

<svelte:head>
	<title>Use Cases — amesh</title>
	<meta name="description" content="How teams use amesh to replace API keys in microservices, webhooks, cron jobs, and internal tools with device-bound cryptographic identity." />
	<link rel="canonical" href="https://authmesh.dev/use-cases" />
	<meta property="og:title" content="Use Cases — amesh" />
	<meta property="og:description" content="How teams use amesh to replace API keys in microservices, webhooks, cron jobs, and internal tools." />
	<meta property="og:url" content="https://authmesh.dev/use-cases" />
</svelte:head>

<div class="mx-auto max-w-2xl px-6 pt-16 pb-20">
	<h1 class="text-3xl font-bold text-zinc-50">How teams use amesh</h1>
	<p class="mt-3 max-w-lg text-lg text-zinc-400">Real-world patterns for replacing API keys with device-bound identity.</p>

	<div class="mt-10 grid gap-3 sm:grid-cols-2">
		{#each cases as uc}
			{@const Icon = uc.icon}
			<a href="/use-cases/{uc.slug}" class="group rounded-lg border border-zinc-800 bg-zinc-900 p-6 no-underline transition-colors hover:border-emerald-400/40">
				<Icon size={20} class="text-emerald-400" />
				<h2 class="mt-3 text-base font-semibold text-zinc-50">{uc.title}</h2>
				<p class="mt-1.5 text-sm leading-relaxed text-zinc-400">{uc.desc}</p>
				<span class="mt-4 inline-flex items-center gap-1 text-sm text-emerald-400 group-hover:underline">
					Read more <ChevronRight size={14} />
				</span>
			</a>
		{/each}
	</div>
</div>
