<script lang="ts">
	import { ShieldCheck, Ban, Handshake, PenTool, FileLock2, RotateCcw, Fingerprint, ShieldOff } from '@lucide/svelte';

	const REPO = 'https://github.com/ameshdev/amesh';

	const features = [
		{ icon: ShieldOff, title: 'Nothing to leak', desc: 'No .env file. No secret in CI. No token in Slack. The key is in silicon.' },
		{ icon: RotateCcw, title: 'Nothing to rotate', desc: 'Device keys don\'t expire. Revoke a device instantly with amesh revoke.' },
		{ icon: Fingerprint, title: 'Replay-proof', desc: 'Every request has a unique nonce and a 30-second timestamp window.' },
		{ icon: FileLock2, title: 'Tamper-proof trust store', desc: 'The allow list is HMAC-sealed. Any file edit is detected immediately.' },
		{ icon: ShieldCheck, title: 'MITM-proof pairing', desc: 'Encrypted key exchange with 6-digit verification. Same as Signal and Bluetooth.' },
	];

	const replaces = [
		{ old: '.env files', desc: 'Secrets on disk' },
		{ old: 'API keys', desc: 'Static strings' },
		{ old: 'Bearer tokens', desc: 'Shared secrets' },
		{ old: 'JWT secrets', desc: 'Rotated manually' },
	];

	const steps = [
		{
			n: '1', title: 'Create a device identity',
			desc: 'Each machine gets a unique keypair. The private key never leaves the hardware.',
			code: `$ amesh init --name "prod-api"\n\nIdentity created.\n  Device ID : <span class="text-emerald-400">am_cOixWcOdI8-pLh4P</span>\n  Backend   : <span class="text-emerald-400">secure-enclave</span>`
		},
		{
			n: '2', title: 'Pair two machines',
			desc: 'One runs amesh listen, the other amesh invite. A 6-digit code confirms no one is in the middle.',
			code: `$ amesh listen\n\n  Pairing code: <span class="text-emerald-400">482916</span>\n\n<span class="text-emerald-400">✔</span> Controller connected.\n  Verification code: <span class="text-emerald-400">847291</span>\n  Codes match? (Y/n): y\n<span class="text-emerald-400">✔</span> "Dev Laptop" added to allow list.`
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

<main class="mx-auto max-w-2xl px-6">

	<!-- Hero -->
	<section class="pt-20 pb-6 text-center">
		<h1 class="mx-auto max-w-lg text-4xl font-bold leading-tight text-zinc-50 sm:text-4xl">
			Stop managing API keys. Let the hardware prove identity.
		</h1>
		<p class="mx-auto mt-4 max-w-md text-lg text-zinc-400">
			amesh replaces static secrets with cryptographic device identity.
			The private key lives in your chip. There is nothing to leak.
		</p>
	</section>

	<!-- What it replaces -->
	<section class="pt-6 pb-14 text-center">
		<h2 class="text-2xl font-semibold text-zinc-50">What amesh replaces</h2>
		<p class="mt-2 mb-5 text-zinc-400">
			Everything you store in <code class="rounded bg-emerald-400/10 px-1.5 py-0.5 text-sm text-emerald-400">.env</code> files and pass around in Slack.
		</p>
		<div class="mx-auto grid max-w-lg grid-cols-2 gap-2.5 sm:grid-cols-4">
			{#each replaces as item}
				<div class="rounded-lg border border-red-900/60 bg-danger-bg px-4 py-3 text-left" style="background:#2A1215">
					<span class="block font-mono text-sm text-red-400 line-through">{item.old}</span>
					<span class="text-xs text-red-300/60">{item.desc}</span>
				</div>
			{/each}
		</div>
	</section>

	<!-- Before / After -->
	<section class="py-14">
		<h2 class="text-2xl font-semibold text-zinc-50">Before and after</h2>
		<p class="mt-2 mb-6">Your code changes by one line. Your security model changes completely.</p>
		<div class="grid gap-3">
			<div>
				<div class="mb-1.5 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-red-400">
					<span class="h-2 w-2 rounded-full bg-red-400"></span> Today
				</div>
				<div class="overflow-x-auto rounded-lg border border-zinc-800 bg-terminal p-4" style="background:#0C0C0E">
<pre class="font-mono text-[13px] leading-relaxed whitespace-pre-wrap break-all"><span class="text-zinc-500"># .env (leaked on GitHub)</span>
API_KEY=<span class="text-red-400">sk_live_4eC39HqLyj...</span>

fetch(<span class="text-emerald-400">"/api/orders"</span>, {'{'}
  headers: {'{'}
    Authorization:
      <span class="text-red-400">{"`Bearer ${API_KEY}`"}</span>
  {'}'}
{'}'});</pre>
				</div>
			</div>
			<div>
				<div class="mb-1.5 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-emerald-400">
					<span class="h-2 w-2 rounded-full bg-emerald-400"></span> With amesh
				</div>
				<div class="overflow-x-auto rounded-lg border border-zinc-800 bg-terminal p-4" style="background:#0C0C0E">
<pre class="font-mono text-[13px] leading-relaxed whitespace-pre-wrap break-all"><span class="text-zinc-500">// No .env. No secrets anywhere.</span>
import {'{'} amesh {'}'} from <span class="text-emerald-400">'@authmesh/sdk'</span>;

amesh.fetch(<span class="text-emerald-400">"/api/orders"</span>, {'{'}
  method: <span class="text-emerald-400">"POST"</span>,
  body: JSON.stringify({'{'}
    amount: <span class="text-emerald-400">100</span>
  {'}'})
{'}'});</pre>
				</div>
			</div>
		</div>
	</section>

	<!-- How it works -->
	<section class="py-14">
		<h2 class="text-2xl font-semibold text-zinc-50">How it works</h2>
		<p class="mt-2 mb-8">Four steps. Then every request is signed by hardware and verified cryptographically.</p>

		<div class="relative pl-9">
			<div class="absolute top-3 bottom-3 left-[11px] w-0.5 bg-zinc-800"></div>

			{#each steps as step}
				<div class="relative mb-10 last:mb-0">
					<div class="absolute -left-9 top-0 flex h-[22px] w-[22px] items-center justify-center rounded-full border-2 border-emerald-400 bg-emerald-900/50 font-mono text-[11px] font-medium text-emerald-400">
						{step.n}
					</div>
					<h3 class="text-base font-semibold text-zinc-50">{step.title}</h3>
					<p class="mt-1 mb-2.5 text-sm">{step.desc}</p>
					<div class="overflow-x-auto rounded-lg border border-zinc-800 p-4" style="background:#0C0C0E">
						<pre class="font-mono text-[13px] leading-relaxed whitespace-pre-wrap break-all">{@html step.code}</pre>
					</div>
				</div>
			{/each}
		</div>
	</section>

	<!-- Why better -->
	<section class="py-14">
		<h2 class="text-2xl font-semibold text-zinc-50">Why this is better</h2>
		<div class="mt-6 space-y-2.5">
			{#each features as feat}
				<div class="flex gap-4 rounded-lg border border-zinc-800 bg-zinc-900 px-5 py-4">
					<div class="mt-0.5 shrink-0 text-emerald-400">
						<feat.icon size={18} strokeWidth={2} />
					</div>
					<div>
						<h3 class="text-sm font-semibold text-zinc-50">{feat.title}</h3>
						<p class="text-[13px] leading-snug">{feat.desc}</p>
					</div>
				</div>
			{/each}
		</div>
	</section>

	<!-- CLI -->
	<section class="py-14">
		<h2 class="text-2xl font-semibold text-zinc-50">Manage devices from the terminal</h2>
		<div class="mt-6 overflow-x-auto rounded-lg border border-zinc-800 p-4" style="background:#0C0C0E">
			<div class="mb-3 flex gap-1.5">
				<span class="h-2.5 w-2.5 rounded-full bg-zinc-700"></span>
				<span class="h-2.5 w-2.5 rounded-full bg-zinc-700"></span>
				<span class="h-2.5 w-2.5 rounded-full bg-zinc-700"></span>
			</div>
<pre class="font-mono text-[13px] leading-relaxed whitespace-pre-wrap break-all"><span class="text-zinc-500">$</span> <span class="text-zinc-50">amesh list</span>

  Trusted Devices (2)
  <span class="text-zinc-600">──────────────────────────────────────────</span>
  <span class="text-emerald-400">am_1a2b3c4d</span>  Dev Laptop     added 2026-03-28
  <span class="text-emerald-400">am_9f8e7d6c</span>  staging-api    added 2026-03-29
  <span class="text-zinc-600">──────────────────────────────────────────</span>

<span class="text-zinc-500">$</span> <span class="text-zinc-50">amesh revoke am_1a2b3c4d</span>

  Are you sure? (y/N): <span class="text-zinc-50">y</span>
<span class="text-emerald-400">✔</span> Removed. Access revoked immediately.</pre>
		</div>
	</section>

</main>

