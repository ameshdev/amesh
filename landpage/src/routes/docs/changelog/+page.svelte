<script lang="ts">
	import Breadcrumb from '$lib/components/Breadcrumb.svelte';
	import PrevNextNav from '$lib/components/PrevNextNav.svelte';
	import RelatedContent from '$lib/components/RelatedContent.svelte';
	import { getDocNav } from '$lib/navigation.js';
	import type { RelatedLink } from '$lib/navigation.js';
	import { jsonLdScript, graph, breadcrumbList, techArticle } from '$lib/seo.js';

	const { prev, next } = getDocNav('changelog');

	interface Release {
		version: string;
		date: string;
		sections: { label: string; items: string[] }[];
	}

	const releases: Release[] = [
		{
			version: '0.7.0',
			date: '2026-04-12',
			sections: [
				{
					label: 'Breaking',
					items: [
						'<strong>Remote shell and agent daemon removed</strong> — <code class="font-mono text-emerald-400">amesh agent start/stop</code>, <code class="font-mono text-emerald-400">amesh shell</code>, <code class="font-mono text-emerald-400">amesh grant</code>, and <code class="font-mono text-emerald-400">amesh reset</code> commands removed. The <code class="font-mono text-emerald-400">@authmesh/agent</code> npm package is deprecated. amesh now focuses on device-bound M2M authentication.',
					],
				},
				{
					label: 'Security',
					items: [
						'<strong>Reduced attack surface</strong> — removing the agent daemon (PTY spawning, shell cipher, frame protocol) eliminates the highest-risk component.',
						'<strong>Relay simplified</strong> — agent registration, challenge-response, and shell routing handlers removed.',
					],
				},
			],
		},
		{
			version: '0.6.0',
			date: '2026-04-09',
			sections: [
				{
					label: 'Added',
					items: [
						'<strong>SAS confirmation protocol</strong> — controller waits for target to verify the 6-digit code before adding to allow list. Prevents one-sided trust.',
					],
				},
				{
					label: 'Security',
					items: [
						'<strong>Relay per-session data cap</strong> — 5 MB maximum forwarded per session to prevent bulk data streaming abuse.',
					],
				},
			],
		},
		{
			version: '0.5.3',
			date: '2026-04-08',
			sections: [
				{
					label: 'Fixed',
					items: [
						'<strong><code class="font-mono text-emerald-400">amesh invite</code> crash on duplicate device</strong> — no longer throws when the target is already in the allow list. Automatically updates the existing entry with fresh handshake data.',
						'<strong>Handshake timeout errors</strong> now show actionable recovery guidance instead of raw error messages.',
						'<strong><code class="font-mono text-emerald-400">amesh listen</code> SAS prompt</strong> now includes Ctrl+C hint and clearer mismatch recovery message.',
						'<strong><code class="font-mono text-emerald-400">amesh init</code> next-steps</strong> uses plain language instead of controller/target jargon.',
						'<strong>Install script</strong> at <code class="font-mono text-emerald-400">authmesh.dev/install</code> for headless CLI installation.',
					],
				},
				{
					label: 'Added',
					items: [
						'<strong><code class="font-mono text-emerald-400">amesh provision</code> discoverability</strong> — non-interactive pairing now surfaced in <code class="font-mono text-emerald-400">listen</code>, <code class="font-mono text-emerald-400">init</code>, and README quickstart.',
						'<strong>Trust model legend</strong> in <code class="font-mono text-emerald-400">amesh list</code> output — explains what [controller] and [target] mean.',
						'<strong>Pairing troubleshooting</strong> section in docs covering 6 common failure scenarios.',
					],
				},
			],
		},
		{
			version: '0.5.2',
			date: '2026-04-08',
			sections: [
				{
					label: 'Added',
					items: [
						'<strong>Install script</strong> at <code class="font-mono text-emerald-400">authmesh.dev/install</code> — one-liner install for headless devices.',
						'<strong>arm64 .deb package</strong> — release workflow now produces both amd64 and arm64 Debian packages.',
						'<strong>Blog post</strong> — "Your AI just wrote another .env file".',
					],
				},
			],
		},
		{
			version: '0.5.1',
			date: '2026-04-06',
			sections: [
				{
					label: 'Added',
					items: [
						'<strong>Community files</strong> — SECURITY.md, CONTRIBUTING.md, CODE_OF_CONDUCT.md, issue templates, PR template.',
						'<strong>Social preview image</strong> for GitHub link sharing.',
						'<strong>GitHub Discussions</strong> enabled for community Q&A.',
					],
				},
			],
		},
		{
			version: '0.5.0',
			date: '2026-04-05',
			sections: [
				{
					label: 'Security',
					items: [
						'<strong>Full security audit</strong> — 18 fixes across 2 critical, 4 high, 7 medium, 5 low severity issues.',
						'<strong>Relay redeployed</strong> with <code class="font-mono text-emerald-400">AMESH_TRUST_PROXY=1</code> for correct IP rate limiting behind Cloud Run.',
					],
				},
				{
					label: 'Added',
					items: [
						'<strong>Docker smoke test suite</strong> — 11 post-release tests verifying npm packages, binaries, and relay.',
					],
				},
			],
		},
		{
			version: '0.3.3',
			date: '2026-04-04',
			sections: [
				{
					label: 'Fixed',
					items: [
						'<strong>Device ID derivation mismatch</strong> — <code class="font-mono text-emerald-400">invite</code> and <code class="font-mono text-emerald-400">listen</code> derived device IDs with raw <code class="font-mono text-emerald-400">base64url(pubkey)</code> while <code class="font-mono text-emerald-400">init</code> used <code class="font-mono text-emerald-400">SHA-256(pubkey)</code> per the protocol spec. <strong>Existing pairings need re-pairing.</strong>',
						'<strong>Compiled binary broken</strong> — <code class="font-mono text-emerald-400">sea.ts</code> entry point restored with all 8 commands.',
					],
				},
			],
		},
		{
			version: '0.3.1',
			date: '2026-04-04',
			sections: [
				{
					label: 'Fixed',
					items: [
						'<strong>macOS Keychain stale key accumulation</strong> — <code class="font-mono text-emerald-400">SecItemDelete</code> only removes one Keychain item per call; multiple <code class="font-mono text-emerald-400">amesh init --force</code> runs accumulated stale keys, causing <code class="font-mono text-emerald-400">selfSig verification failed</code> on remote peers during pairing.',
					],
				},
				{
					label: 'Added',
					items: [
						'<strong>Key Storage doc page</strong> — explains the 3-tier fallback: Secure Enclave → macOS Keychain → TPM 2.0 → encrypted file.',
						'<strong>macOS Keychain driver tests</strong> — sign/verify round-trip, stale key regression test, key overwrite verification.',
					],
				},
				{
					label: 'Changed',
					items: [
						'<strong>Security claims softened</strong> — "replay-proof" → "replay protection", "MITM-proof" → "MITM-resistant", "hardware-bound" → "protected by Keychain, TPM, or encrypted file".',
						'<strong>Footer disclaimer</strong> added — clarifies security claims describe design goals, not guarantees.',
					],
				},
			],
		},
		{
			version: '0.3.0',
			date: '2026-04-04',
			sections: [
				{
					label: 'Added',
					items: [
						'<strong>Auto-generated passphrase</strong> for encrypted-file backend — <code class="font-mono text-emerald-400">--passphrase</code> flag removed; a 256-bit random passphrase is generated and stored in <code class="font-mono text-emerald-400">identity.json</code> automatically.',
						'<strong>Detection verbosity</strong> — <code class="font-mono text-emerald-400">amesh init</code> now shows which backend tiers were checked and which was selected.',
						'<strong>Identity info in <code class="font-mono text-emerald-400">amesh list</code></strong> — new "This device" section at top showing device ID, friendly name, backend, and created date.',
						'<strong>Docs sidebar</strong> — persistent left navigation on all doc pages.',
						'<strong>ADR-010</strong> — documents the passphrase-colocation security decision and threat analysis.',
					],
				},
				{
					label: 'Security',
					items: [
						'<strong>Passphrase stripped from memory</strong> after KeyStore creation at all 6 call sites.',
						'<strong>Atomic write</strong> for <code class="font-mono text-emerald-400">identity.json</code> in SDK bootstrap (tmp + rename pattern).',
						'<strong>Bun runtime guard</strong> added to relay start — clear error message when run on Node.js.',
					],
				},
			],
		},
		{
			version: '0.1.3',
			date: '2026-03-31',
			sections: [
				{
					label: 'Fixed',
					items: [
						'<strong>macOS Keychain not detected in Homebrew installs</strong> — the Swift Secure Enclave helper (<code class="font-mono text-emerald-400">amesh-se-helper</code>) was not bundled in release tarballs, causing silent fallback to the encrypted-file backend on macOS.',
					],
				},
				{
					label: 'Changed',
					items: [
						'<strong>Swift helper bundled in macOS releases</strong> — <code class="font-mono text-emerald-400">amesh-se-helper</code> is now compiled and included in darwin tarballs.',
					],
				},
			],
		},
		{
			version: '0.1.2',
			date: '2026-03-31',
			sections: [
				{
					label: 'Changed',
					items: [
						'<strong>CLI binary migrated from Node.js SEA to Bun compile</strong> — binary size reduced from 123MB to 61MB (~50%), fixes segfault on macOS.',
						'<strong>WebSocket client switched from <code class="font-mono text-emerald-400">ws</code> to native WebSocket API</strong> — works in both Bun and Node.js, removes a runtime dependency.',
						'<strong>Release pipeline simplified</strong> — 4-step SEA build replaced with single <code class="font-mono text-emerald-400">bun build --compile</code>.',
					],
				},
			],
		},
		{
			version: '0.1.1',
			date: '2026-03-30',
			sections: [
				{
					label: 'Security',
					items: [
						'<strong>AllowList HMAC</strong> now derived from private key material or a stored random secret, not the public key which was publicly known.',
						'<strong>Bootstrap token</strong> embeds controller public key — signature verified against trusted embedded key, not untrusted relay message.',
						'<strong>ECDH shared secret</strong> returns raw 32-byte x-coordinate per NIST SP 800-56A.',
						'<strong>File permissions</strong>: all sensitive files written with <code class="font-mono text-emerald-400">0o600</code>/<code class="font-mono text-emerald-400">0o700</code>.',
						'<strong>Relay hardening</strong>: per-OTC brute-force tracking (max 5 per OTC), <code class="font-mono text-emerald-400">maxPayload</code> 64KB, connection limit 10K, bootstrap watcher TTL + cleanup.',
						'<strong>Nonce store</strong> bounded at 1M entries to prevent memory exhaustion.',
						'<strong>Canonical string</strong> rejects newlines in fields to prevent injection.',
						'<strong>Error responses</strong> no longer leak <code class="font-mono text-emerald-400">allow_list_integrity_failure</code> to clients.',
					],
				},
			],
		},
		{
			version: '0.1.0',
			date: '2026-03-30',
			sections: [
				{
					label: 'Initial release',
					items: [
						'<strong>Core crypto</strong> — P-256 ECDSA signing/verification, canonical request strings, nonce-based replay detection, HMAC integrity, HKDF key derivation, ECDH key exchange. 84 tests including adversarial scenarios (replay, tamper, MITM, clock boundary, body swap).',
						'<strong>Key storage</strong> — Secure Enclave (macOS), TPM 2.0 (Linux), OS keyring, and AES-256-GCM + Argon2id encrypted-file fallback.',
						'<strong>SDK</strong> — <code class="font-mono text-emerald-400">amesh.fetch()</code> signing client and <code class="font-mono text-emerald-400">amesh.verify()</code> Express/Connect middleware.',
						'<strong>CLI</strong> — <code class="font-mono text-emerald-400">init</code>, <code class="font-mono text-emerald-400">listen</code>, <code class="font-mono text-emerald-400">invite</code>, <code class="font-mono text-emerald-400">list</code>, <code class="font-mono text-emerald-400">revoke</code>, <code class="font-mono text-emerald-400">provision</code> commands via oclif v4.',
						'<strong>Relay</strong> — WebSocket pairing relay with OTC session management, IP-based rate limiting.',
						'<strong>Protocol specification</strong> v2.0.0 with full wire format, crypto details, and security model.',
					],
				},
			],
		},
	];

	const relatedLinks: RelatedLink[] = [
		{ href: '/docs/introduction', title: 'What is amesh', desc: 'Start here if you\'re new', type: 'doc' },
		{ href: '/docs/quickstart', title: 'Quickstart', desc: 'Install, pair, and sign your first request', type: 'doc' },
	];
</script>

<svelte:head>
	<title>Changelog — amesh</title>
	<meta name="description" content="Release notes and version history for amesh. Security fixes, new features, and breaking changes across every version." />
	<link rel="canonical" href="https://authmesh.dev/docs/changelog" />
	<meta property="og:title" content="Changelog — amesh" />
	<meta property="og:description" content="Release notes and version history for amesh." />
	<meta property="og:url" content="https://authmesh.dev/docs/changelog" />
	{@html jsonLdScript(graph(
		breadcrumbList([
			{ name: 'Home', url: '/' },
			{ name: 'Docs', url: '/docs' },
			{ name: 'Changelog', url: '/docs/changelog' }
		]),
		techArticle({
			title: 'amesh Changelog',
			description: 'Release notes and version history for amesh.',
			url: '/docs/changelog',
			section: 'Reference'
		})
	))}
</svelte:head>

<div class="mx-auto max-w-2xl px-6 pb-20">
	<section class="pt-16 pb-6">
		<Breadcrumb crumbs={[{ label: 'Docs', href: '/docs' }, { label: 'Changelog' }]} />
		<h1 class="mt-4 text-3xl font-bold text-zinc-50">Changelog</h1>
		<p class="mt-3 text-lg text-zinc-400">Release notes for every version. Based on <a href="https://keepachangelog.com/en/1.1.0/" target="_blank" rel="noopener" class="text-emerald-400 no-underline hover:underline">Keep a Changelog</a>.</p>
	</section>

	<section class="py-4 space-y-10">
		{#each releases as release}
			<article class="border-l-2 border-zinc-800 pl-6 relative">
				<div class="absolute -left-1.5 top-0 h-3 w-3 rounded-full bg-emerald-400 ring-4 ring-zinc-950"></div>
				<header class="flex flex-wrap items-baseline gap-3">
					<h2 class="text-2xl font-bold text-zinc-50">v{release.version}</h2>
					<time class="text-sm text-zinc-500">{release.date}</time>
				</header>
				<div class="mt-4 space-y-4">
					{#each release.sections as section}
						<div>
							<div class="text-[11px] font-semibold uppercase tracking-widest text-emerald-400/80 mb-2">{section.label}</div>
							<ul class="space-y-2">
								{#each section.items as item}
									<li class="text-sm text-zinc-400 leading-relaxed">
										<span class="mr-2 text-zinc-600">•</span>{@html item}
									</li>
								{/each}
							</ul>
						</div>
					{/each}
				</div>
			</article>
		{/each}
	</section>

	<section class="py-8">
		<p class="text-sm text-zinc-500">
			For the raw source, see <a href="https://github.com/ameshdev/amesh/blob/main/CHANGELOG.md" target="_blank" rel="noopener" class="text-emerald-400 no-underline hover:underline">CHANGELOG.md</a> on GitHub.
		</p>
	</section>

	<PrevNextNav {prev} {next} />
	<RelatedContent links={relatedLinks} />
</div>
