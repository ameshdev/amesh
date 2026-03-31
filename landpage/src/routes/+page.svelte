<script lang="ts">
	import { ShieldCheck, FileLock2, RotateCcw, Fingerprint, ShieldOff, Check, Copy, Code } from '@lucide/svelte';

	const REPO = 'https://github.com/ameshdev/amesh';

	// Install tabs
	const installTabs = [
		{ label: 'Homebrew', cmd: 'brew install ameshdev/tap/amesh' },
		{ label: 'npm', cmd: 'npm install @authmesh/sdk' },
		{ label: 'Binary', cmd: 'curl -sLO https://github.com/ameshdev/amesh/releases/latest/download/amesh-darwin-arm64.tar.gz' },
	];
	let activeInstallTab = $state(0);
	let installCopied = $state(false);

	function copyInstall() {
		navigator.clipboard.writeText(installTabs[activeInstallTab].cmd);
		installCopied = true;
		setTimeout(() => installCopied = false, 2000);
	}

	// Before/After tabs for hero right column
	let activeCodeTab = $state(1); // default to "With amesh"

	// What amesh replaces
	const replaces = [
		{ old: '.env files', desc: 'Secrets on disk' },
		{ old: 'API keys', desc: 'Static strings' },
		{ old: 'Bearer tokens', desc: 'Shared secrets' },
		{ old: 'JWT secrets', desc: 'Rotated manually' },
		{ old: 'OAuth secrets', desc: 'Client credentials' },
		{ old: 'mTLS certs', desc: 'Certificate files' },
	];

	// How it works steps
	const steps = [
		{
			n: '1', title: 'Create a device identity',
			desc: 'Each machine gets a unique keypair. The private key never leaves the hardware.',
			code: `<span class="text-zinc-500">$</span> amesh init --name "prod-api"\n\nIdentity created.\n  Device ID : <span class="text-emerald-400">am_cOixWcOdI8-pLh4P</span>\n  Backend   : <span class="text-emerald-400">secure-enclave</span>`
		},
		{
			n: '2', title: 'Pair two machines',
			desc: 'One runs amesh listen, the other amesh invite. A 6-digit code confirms no one is in the middle.',
			code: `<span class="text-zinc-500">$</span> amesh listen\n\n  Pairing code: <span class="text-emerald-400">482916</span>\n\n<span class="text-emerald-400">✔</span> Controller connected.\n  Verification code: <span class="text-emerald-400">847291</span>\n  Codes match? (Y/n): y\n<span class="text-emerald-400">✔</span> "Dev Laptop" added to allow list.`
		},
		{
			n: '3', title: 'Sign requests — 2 lines',
			desc: 'Import amesh and call amesh.fetch(). It signs every request automatically.',
			code: `import { amesh } from <span class="text-emerald-400">'@authmesh/sdk'</span>;\n\namesh.fetch(<span class="text-emerald-400">"/api/orders"</span>, {\n  method: <span class="text-emerald-400">"POST"</span>,\n  body: JSON.stringify({ amount: <span class="text-emerald-400">100</span> })\n});`
		},
		{
			n: '4', title: 'Verify requests — 2 lines',
			desc: 'One line of middleware. Checks signature, timestamp, nonce, and allow list.',
			code: `import { amesh } from <span class="text-emerald-400">'@authmesh/sdk'</span>;\n\napp.use(amesh.verify());\n<span class="text-zinc-500">// req.authMesh.deviceId available</span>`
		},
	];

	// Comparison table
	const competitors = ['API Keys', 'mTLS', 'Vault', 'OAuth'];
	const comparisonRows = [
		{ feature: 'Secrets on disk', amesh: { val: 'None', good: true }, values: ['Yes', 'Cert files', 'Token', 'Client secret'] },
		{ feature: 'Manual rotation', amesh: { val: 'Never', good: true }, values: ['Required', 'Cert renewal', 'Token TTL', 'Secret rotation'] },
		{ feature: 'Blast radius of leak', amesh: { val: 'Nothing to leak', good: true }, values: ['Unlimited', 'Per-cert', 'Token scope', 'Client scope'] },
		{ feature: 'Setup complexity', amesh: { val: '2 CLI commands', good: true }, values: ['Copy-paste', 'CA + cert infra', 'Server + policies', 'Auth server'] },
		{ feature: 'Per-device identity', amesh: { val: 'Yes', good: true }, values: ['No', 'Per-cert', 'No', 'Per-client'] },
		{ feature: 'Hardware-bound', amesh: { val: 'Secure Enclave / TPM', good: true }, values: ['No', 'No', 'No', 'No'] },
	];

	// Features
	const features = [
		{ icon: ShieldOff, title: 'Nothing to leak', desc: 'No .env file. No secret in CI. No token in Slack. The key is in silicon.' },
		{ icon: RotateCcw, title: 'Nothing to rotate', desc: 'Device keys don\'t expire. Revoke a device instantly with amesh revoke.' },
		{ icon: Fingerprint, title: 'Replay-proof', desc: 'Every request has a unique nonce and a 30-second timestamp window.' },
		{ icon: FileLock2, title: 'Tamper-proof trust store', desc: 'The allow list is HMAC-sealed. Any file edit is detected immediately.' },
		{ icon: ShieldCheck, title: 'MITM-proof pairing', desc: 'Encrypted key exchange with 6-digit verification. Same as Signal and Bluetooth.' },
		{ icon: Code, title: 'Open source', desc: 'MIT licensed. Audit the crypto, fork the relay, self-host everything.' },
	];

	// CLI demo tabs
	const cliTabs = [
		{
			label: 'Device Management',
			code: `<span class="text-zinc-500">$</span> <span class="text-zinc-50">amesh list</span>\n\n  Trusted Devices (2)\n  <span class="text-zinc-600">──────────────────────────────────────────</span>\n  <span class="text-emerald-400">am_1a2b3c4d</span>  Dev Laptop     added 2026-03-28\n  <span class="text-emerald-400">am_9f8e7d6c</span>  staging-api    added 2026-03-29\n  <span class="text-zinc-600">──────────────────────────────────────────</span>\n\n<span class="text-zinc-500">$</span> <span class="text-zinc-50">amesh revoke am_1a2b3c4d</span>\n\n  Are you sure? (y/N): <span class="text-zinc-50">y</span>\n<span class="text-emerald-400">✔</span> Removed. Access revoked immediately.`
		},
		{
			label: 'Pairing',
			code: `<span class="text-zinc-500">$</span> <span class="text-zinc-50">amesh invite relay.authmesh.dev</span>\n\n  Pairing code: <span class="text-emerald-400">482916</span>\n  Waiting for target device...\n\n<span class="text-emerald-400">✔</span> Target connected.\n  Verification code: <span class="text-emerald-400">847291</span>\n  Codes match? (Y/n): y\n<span class="text-emerald-400">✔</span> Paired. "prod-api" added to allow list.`
		},
		{
			label: 'Init',
			code: `<span class="text-zinc-500">$</span> <span class="text-zinc-50">amesh init --name "prod-api"</span>\n\n  Identity created.\n  Device ID : <span class="text-emerald-400">am_cOixWcOdI8-pLh4P</span>\n  Backend   : <span class="text-emerald-400">secure-enclave</span>\n  Public key: <span class="text-zinc-500">04a1b2c3...(65 bytes)</span>\n\n<span class="text-emerald-400">✔</span> Ready. Run <span class="text-zinc-50">amesh invite</span> to pair with another device.`
		},
	];
	let activeCliTab = $state(0);
</script>

<svelte:head>
	<title>amesh — Hardware-Bound M2M Authentication. No API Keys.</title>
	<meta name="description" content="Replace static API keys with cryptographic device identity. Private keys live in your Secure Enclave or TPM. Nothing to leak, rotate, or steal." />
	<link rel="canonical" href="https://authmesh.dev/" />
	<meta property="og:title" content="amesh — Hardware-Bound M2M Authentication. No API Keys." />
	<meta property="og:description" content="Replace static API keys with cryptographic device identity. Private keys live in your Secure Enclave or TPM." />
	<meta property="og:url" content="https://authmesh.dev/" />
	<meta property="og:image" content="https://authmesh.dev/og-image.png" />
	<meta property="og:image:width" content="1200" />
	<meta property="og:image:height" content="630" />
	<meta property="og:type" content="website" />
	<meta name="twitter:card" content="summary_large_image" />
	<meta name="twitter:image" content="https://authmesh.dev/og-image.png" />
</svelte:head>

<main>

	<!-- ========== HERO ========== -->
	<section class="relative w-full px-6 pt-12 pb-16 sm:pt-20 sm:pb-24 overflow-hidden">
		<!-- Radial glow background -->
		<div class="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_-20%,rgba(52,211,153,0.08),transparent)]"></div>

		<div class="relative mx-auto grid max-w-6xl grid-cols-1 items-center gap-12 lg:grid-cols-2">
			<!-- Left: headline + install -->
			<div>
				<a href={REPO + '/releases'} class="inline-flex items-center gap-2 rounded-full border border-zinc-800 bg-zinc-900 px-3 py-1 text-xs text-zinc-400 no-underline transition hover:border-zinc-600 hover:text-zinc-300">
					v0.1 — Now in beta <span class="text-emerald-400">&rarr;</span>
				</a>

				<h1 class="mt-6 text-4xl font-bold leading-tight tracking-tight text-zinc-50 sm:text-5xl lg:text-6xl">
					Stop managing API&nbsp;keys. Let hardware prove identity.
				</h1>

				<p class="mt-6 max-w-lg text-lg text-zinc-400 sm:text-xl">
					amesh replaces static secrets with cryptographic device identity.
					The private key lives in your chip. There is nothing to leak.
				</p>

				<!-- Install CTA -->
				<div class="mt-8">
					<p class="mb-2 text-sm font-medium text-zinc-400">Install amesh</p>
					<div class="rounded-xl border border-zinc-800 bg-terminal shadow-[0_0_60px_-15px_rgba(52,211,153,0.15)]" style="background:#0C0C0E">
						<!-- Tabs -->
						<div class="flex border-b border-zinc-800">
							{#each installTabs as tab, i}
								<button
									onclick={() => { activeInstallTab = i; installCopied = false; }}
									class="cursor-pointer border-none px-4 py-2.5 text-sm transition {i === activeInstallTab ? 'bg-zinc-800/50 text-zinc-50 font-medium' : 'bg-transparent text-zinc-500 hover:text-zinc-300'} {i === 0 ? 'rounded-tl-xl' : ''}"
								>
									{tab.label}
								</button>
							{/each}
						</div>
						<!-- Command -->
						<div class="flex items-center justify-between gap-3 px-4 py-3">
							<code class="overflow-x-auto font-mono text-sm text-zinc-300 whitespace-nowrap">
								<span class="text-zinc-500">$</span> {installTabs[activeInstallTab].cmd}
							</code>
							<button onclick={copyInstall} class="shrink-0 cursor-pointer rounded-md border-none bg-transparent p-1.5 text-zinc-500 transition hover:text-zinc-300" title="Copy">
								{#if installCopied}
									<Check size={14} class="text-emerald-400" />
								{:else}
									<Copy size={14} />
								{/if}
							</button>
						</div>
					</div>
				</div>

				<!-- Secondary links -->
				<div class="mt-5 flex flex-wrap gap-4 text-sm">
					<a href="/docs" class="text-zinc-400 no-underline transition hover:text-zinc-200">Read the docs &rarr;</a>
					<a href={REPO} target="_blank" rel="noopener" class="inline-flex items-center gap-1.5 text-zinc-400 no-underline transition hover:text-zinc-200">
						<img src="/github-mark-white.svg" alt="" class="h-4 w-4 opacity-60" />
						View on GitHub &rarr;
					</a>
				</div>
			</div>

			<!-- Right: Before/After terminal -->
			<div class="hidden lg:block">
				<div class="rounded-xl border border-zinc-800 shadow-2xl" style="background:#0C0C0E">
					<!-- Tab bar -->
					<div class="flex border-b border-zinc-800">
						<button
							onclick={() => activeCodeTab = 0}
							class="cursor-pointer border-none px-4 py-2.5 text-sm transition {activeCodeTab === 0 ? 'bg-zinc-800/50 text-red-400 font-medium' : 'bg-transparent text-zinc-500 hover:text-zinc-300'} rounded-tl-xl"
						>
							<span class="mr-1.5 inline-block h-2 w-2 rounded-full {activeCodeTab === 0 ? 'bg-red-400' : 'bg-zinc-600'}"></span>
							Before (API keys)
						</button>
						<button
							onclick={() => activeCodeTab = 1}
							class="cursor-pointer border-none px-4 py-2.5 text-sm transition {activeCodeTab === 1 ? 'bg-zinc-800/50 text-emerald-400 font-medium' : 'bg-transparent text-zinc-500 hover:text-zinc-300'}"
						>
							<span class="mr-1.5 inline-block h-2 w-2 rounded-full {activeCodeTab === 1 ? 'bg-emerald-400' : 'bg-zinc-600'}"></span>
							With amesh
						</button>
					</div>
					<!-- Code content -->
					<div class="p-5">
						{#if activeCodeTab === 0}
							<pre class="font-mono text-[13px] leading-relaxed whitespace-pre-wrap break-all"><span class="text-zinc-500"># .env (leaked on GitHub)</span>
API_KEY=<span class="text-red-400">sk_live_4eC39HqLyj...</span>

fetch(<span class="text-emerald-400">"/api/orders"</span>, {'{'})
  headers: {'{'}
    Authorization:
      <span class="text-red-400">{"`Bearer ${API_KEY}`"}</span>
  {'}'}
{'}'});</pre>
						{:else}
							<pre class="font-mono text-[13px] leading-relaxed whitespace-pre-wrap break-all"><span class="text-zinc-500">// No .env. No secrets anywhere.</span>
import {'{'} amesh {'}'} from <span class="text-emerald-400">'@authmesh/sdk'</span>;

amesh.fetch(<span class="text-emerald-400">"/api/orders"</span>, {'{'}
  method: <span class="text-emerald-400">"POST"</span>,
  body: JSON.stringify({'{'}
    amount: <span class="text-emerald-400">100</span>
  {'}'})
{'}'});</pre>
						{/if}
					</div>
				</div>
			</div>
		</div>
	</section>

	<!-- ========== WHAT AMESH REPLACES ========== -->
	<section class="w-full px-6 py-20 sm:py-28" style="background:#0A0A0C">
		<div class="mx-auto max-w-5xl text-center">
			<h2 class="text-3xl font-bold text-zinc-50 sm:text-4xl">What amesh replaces</h2>
			<p class="mx-auto mt-3 max-w-xl text-zinc-400">
				Everything you store in <code class="rounded bg-emerald-400/10 px-1.5 py-0.5 text-sm text-emerald-400">.env</code> files and pass around in Slack.
			</p>
			<div class="mx-auto mt-8 grid max-w-3xl grid-cols-2 gap-3 sm:grid-cols-3">
				{#each replaces as item}
					<div class="rounded-lg border border-red-900/60 px-5 py-4 text-left transition hover:border-red-700/60" style="background:#2A1215">
						<span class="block font-mono text-sm text-red-400 line-through">{item.old}</span>
						<span class="text-xs text-red-300/60">{item.desc}</span>
					</div>
				{/each}
			</div>
		</div>
	</section>

	<!-- ========== HOW IT WORKS ========== -->
	<section class="w-full px-6 py-20 sm:py-28">
		<div class="mx-auto max-w-5xl">
			<h2 class="text-3xl font-bold text-zinc-50 sm:text-4xl">How it works</h2>
			<p class="mt-3 mb-12 text-zinc-400">Four steps. Then every request is signed by hardware and verified cryptographically.</p>

			<div class="space-y-12">
				{#each steps as step}
					<div class="grid grid-cols-1 items-start gap-6 md:grid-cols-[1fr_1.5fr] md:gap-10">
						<!-- Left: step info -->
						<div class="flex gap-4">
							<div class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 border-emerald-400 bg-emerald-900/50 font-mono text-sm font-medium text-emerald-400">
								{step.n}
							</div>
							<div>
								<h3 class="text-base font-semibold text-zinc-50">{step.title}</h3>
								<p class="mt-1 text-sm text-zinc-400">{step.desc}</p>
							</div>
						</div>
						<!-- Right: code block -->
						<div class="overflow-x-auto rounded-lg border border-zinc-800 p-4" style="background:#0C0C0E">
							<pre class="font-mono text-[13px] leading-relaxed whitespace-pre-wrap break-all">{@html step.code}</pre>
						</div>
					</div>
				{/each}
			</div>
		</div>
	</section>

	<!-- ========== COMPARISON TABLE ========== -->
	<section class="w-full px-6 py-20 sm:py-28" style="background:#0A0A0C">
		<div class="mx-auto max-w-5xl">
			<h2 class="text-3xl font-bold text-zinc-50 sm:text-4xl">How amesh compares</h2>
			<p class="mt-3 mb-10 max-w-2xl text-zinc-400">
				amesh is not the first approach to machine-to-machine auth. But it is the first that requires no shared secrets.
			</p>

			<div class="overflow-x-auto rounded-xl border border-zinc-800">
				<table class="w-full text-sm">
					<thead>
						<tr class="border-b border-zinc-800">
							<th class="px-5 py-3.5 text-left text-xs font-semibold uppercase tracking-wide text-zinc-500"></th>
							<th class="bg-emerald-400/5 px-5 py-3.5 text-left text-xs font-semibold uppercase tracking-wide text-emerald-400">amesh</th>
							{#each competitors as comp}
								<th class="px-5 py-3.5 text-left text-xs font-semibold uppercase tracking-wide text-zinc-500">{comp}</th>
							{/each}
						</tr>
					</thead>
					<tbody>
						{#each comparisonRows as row, i}
							<tr class="{i < comparisonRows.length - 1 ? 'border-b border-zinc-800/60' : ''}">
								<td class="px-5 py-3 font-medium text-zinc-300">{row.feature}</td>
								<td class="bg-emerald-400/5 px-5 py-3 text-emerald-400 font-medium">{row.amesh.val}</td>
								{#each row.values as val}
									<td class="px-5 py-3 text-zinc-500">{val}</td>
								{/each}
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		</div>
	</section>

	<!-- ========== FEATURE GRID ========== -->
	<section class="w-full px-6 py-20 sm:py-28">
		<div class="mx-auto max-w-5xl">
			<h2 class="text-3xl font-bold text-zinc-50 sm:text-4xl">Why this is better</h2>
			<p class="mt-3 mb-10 text-zinc-400">Security that comes from hardware, not from keeping secrets.</p>

			<div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
				{#each features as feat}
					<div class="rounded-xl border border-zinc-800 bg-zinc-900/50 p-6 transition hover:border-emerald-400/30">
						<div class="inline-flex rounded-lg bg-emerald-400/10 p-2.5">
							<feat.icon size={20} strokeWidth={2} class="text-emerald-400" />
						</div>
						<h3 class="mt-4 text-base font-semibold text-zinc-50">{feat.title}</h3>
						<p class="mt-2 text-sm leading-relaxed text-zinc-400">{feat.desc}</p>
					</div>
				{/each}
			</div>
		</div>
	</section>

	<!-- ========== CLI DEMO ========== -->
	<section class="w-full px-6 py-20 sm:py-28" style="background:#0A0A0C">
		<div class="mx-auto max-w-4xl">
			<h2 class="mb-8 text-center text-3xl font-bold text-zinc-50 sm:text-4xl">Manage devices from the terminal</h2>

			<div class="overflow-hidden rounded-xl border border-zinc-800 shadow-2xl" style="background:#0C0C0E">
				<!-- Window chrome -->
				<div class="flex items-center justify-between border-b border-zinc-800 px-4 py-2.5">
					<div class="flex gap-1.5">
						<span class="h-3 w-3 rounded-full bg-red-500/80"></span>
						<span class="h-3 w-3 rounded-full bg-yellow-500/80"></span>
						<span class="h-3 w-3 rounded-full bg-green-500/80"></span>
					</div>
					<span class="text-xs text-zinc-600">Terminal — zsh</span>
					<div class="w-12"></div>
				</div>
				<!-- Tabs -->
				<div class="flex border-b border-zinc-800">
					{#each cliTabs as tab, i}
						<button
							onclick={() => activeCliTab = i}
							class="cursor-pointer border-none px-4 py-2 text-sm transition {i === activeCliTab ? 'bg-zinc-800/50 text-zinc-50 font-medium' : 'bg-transparent text-zinc-500 hover:text-zinc-300'}"
						>
							{tab.label}
						</button>
					{/each}
				</div>
				<!-- Terminal content -->
				<div class="p-5">
					<pre class="font-mono text-[13px] leading-relaxed whitespace-pre-wrap break-all">{@html cliTabs[activeCliTab].code}</pre>
				</div>
			</div>
		</div>
	</section>

	<!-- ========== BOTTOM CTA ========== -->
	<section class="w-full px-6 py-20 sm:py-28">
		<div class="mx-auto max-w-3xl text-center">
			<h2 class="text-3xl font-bold text-zinc-50 sm:text-4xl">
				Ready to drop the <code class="rounded bg-red-400/10 px-2 py-1 text-red-400">.env</code> file?
			</h2>
			<p class="mt-4 text-lg text-zinc-400">Get started in under 5 minutes.</p>

			<!-- Install command -->
			<div class="mx-auto mt-8 max-w-lg rounded-xl border border-zinc-800 bg-terminal" style="background:#0C0C0E">
				<div class="flex items-center justify-between gap-3 px-4 py-3">
					<code class="overflow-x-auto font-mono text-sm text-zinc-300 whitespace-nowrap">
						<span class="text-zinc-500">$</span> brew install ameshdev/tap/amesh
					</code>
					<button
						onclick={() => { navigator.clipboard.writeText('brew install ameshdev/tap/amesh'); }}
						class="shrink-0 cursor-pointer rounded-md border-none bg-transparent p-1.5 text-zinc-500 transition hover:text-zinc-300"
						title="Copy"
					>
						<Copy size={14} />
					</button>
				</div>
			</div>

			<!-- Link cards -->
			<div class="mt-8 grid grid-cols-1 gap-3 sm:grid-cols-3">
				<a href="/docs" class="rounded-lg border border-zinc-800 px-6 py-4 text-center no-underline transition hover:border-emerald-400/40">
					<span class="block text-sm font-semibold text-zinc-50">Read the docs</span>
					<span class="text-xs text-zinc-500">Get started guide</span>
				</a>
				<a href="/docs/integration" class="rounded-lg border border-zinc-800 px-6 py-4 text-center no-underline transition hover:border-emerald-400/40">
					<span class="block text-sm font-semibold text-zinc-50">Integration guide</span>
					<span class="text-xs text-zinc-500">Express, Fastify, more</span>
				</a>
				<a href={REPO} target="_blank" rel="noopener" class="rounded-lg border border-zinc-800 px-6 py-4 text-center no-underline transition hover:border-emerald-400/40">
					<span class="flex items-center justify-center gap-1.5 text-sm font-semibold text-zinc-50">
						<img src="/github-mark-white.svg" alt="" class="h-4 w-4" />
						Star on GitHub
					</span>
					<span class="text-xs text-zinc-500">MIT licensed</span>
				</a>
			</div>
		</div>
	</section>

</main>
