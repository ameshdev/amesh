<script lang="ts">
	import Breadcrumb from '$lib/components/Breadcrumb.svelte';
	import TableOfContents from '$lib/components/TableOfContents.svelte';
	import PrevNextNav from '$lib/components/PrevNextNav.svelte';
	import RelatedContent from '$lib/components/RelatedContent.svelte';
	import { getDocNav } from '$lib/navigation.js';
	import type { RelatedLink } from '$lib/navigation.js';
	import { jsonLdScript, graph, breadcrumbList, techArticle } from '$lib/seo.js';

	const { prev, next } = getDocNav('faq');

	const faqs = [
		{
			id: 'vs-mtls',
			q: 'How is this different from mTLS?',
			a: "mTLS binds identity to a certificate file that can be copied. amesh binds identity to a private key that's protected by the OS keychain or TPM and never leaves the device. mTLS also requires a PKI (CA, cert issuance, renewal, CRL/OCSP) — amesh has zero CA infrastructure. Pairing is two CLI commands.",
		},
		{
			id: 'vs-oauth',
			q: 'Why not OAuth2 client credentials?',
			a: "OAuth2 client credentials is still a shared secret (client_secret) that gets exchanged for a token. If the secret leaks, any machine can get tokens. amesh has no secret to leak — only the device that holds the private key can sign valid requests. OAuth also requires an auth server; amesh is stateless after pairing.",
		},
		{
			id: 'vs-secrets-manager',
			q: "Doesn't a secrets manager already solve this?",
			a: "A secrets manager manages secrets; it does not eliminate them. Your service still fetches a secret string, holds it in memory, and sends it over the wire. If the manager is unreachable, your service can't authenticate. The manager itself needs authentication — how does your server authenticate to it? Usually with another secret. Secrets managers are a real improvement over loose .env files, but amesh operates at a different layer: it removes the string entirely, so there's nothing to manage in the first place.",
		},
		{
			id: 'lambda',
			q: 'Can I use amesh in AWS Lambda / Cloud Functions / ephemeral containers?',
			a: "Not really. Device-bound identity requires stable hardware or a persistent filesystem. In serverless environments, every invocation is a fresh container with no stored state — there's no 'device' to bind to. amesh is designed for long-running machines: API servers, microservices, developer laptops, CI runners with persistent state, and edge devices.",
		},
		{
			id: 'browser',
			q: 'Does amesh work for browser-to-server authentication?',
			a: "No. Browsers don't have a concept of device identity, and client-side JavaScript can't access OS keychains or TPMs. For browser auth, use WebAuthn/passkeys (which also use hardware keys but via a different API). amesh is for machine-to-machine — server, CLI, and daemon authentication.",
		},
		{
			id: 'rotation',
			q: 'What happens if I need to rotate keys?',
			a: "You don't — device keys don't expire. If a device is compromised, you revoke it with amesh revoke <device-id> and only that device loses access. A new device generates its own key via amesh init, pairs, and is trusted. Every other device continues working. There's no coordination problem.",
		},
		{
			id: 'lost-device',
			q: 'What if I lose my laptop?',
			a: "From any other trusted controller, run amesh revoke <device-id> on each target that trusted the lost device. The lost laptop's key can no longer authenticate. Because trust is one-way (controller → target), the lost laptop cannot revoke other devices.",
		},
		{
			id: 'offline',
			q: 'Does signing work offline?',
			a: 'Yes. The private key is on the device, and signing is a local operation. The relay is only needed once — for initial pairing to exchange public keys. After pairing you can shut the relay down entirely. All request signing and verification is stateless.',
		},
		{
			id: 'quantum',
			q: 'Is P-256 quantum-safe?',
			a: "No, but neither is any widely-deployed signature scheme in 2026. amesh uses P-256 ECDSA because it's the most broadly supported in hardware (Secure Enclave, TPM 2.0, YubiKey). When post-quantum signatures (ML-DSA) reach hardware, amesh can add them as a v3 wire format. The protocol already versions the signature algorithm field.",
		},
		{
			id: 'audit',
			q: 'Has amesh been audited?',
			a: 'The cryptographic primitives come from the noble libraries (noble/curves, noble/hashes, noble/ciphers), which are well-audited open-source implementations of standard algorithms. The amesh protocol itself has had a security review by the author (see the security audit report in GitHub). A formal third-party audit is planned before a v1.0 release.',
		},
		{
			id: 'compliance',
			q: 'Does amesh help with SOC 2 / PCI DSS compliance?',
			a: "amesh gives you per-device audit trails, non-repudiable request signatures, and instant revocation — all things auditors care about. It doesn't automatically make you compliant, but it removes the 'shared API key with unknown blast radius' finding that auditors typically flag. Every request has a verified device ID in logs.",
		},
		{
			id: 'oss',
			q: 'Is amesh really open source?',
			a: "Yes — MIT licensed, full source on GitHub, no paid tier, no telemetry, no phone-home. The relay is stateless and trivial to self-host (one Docker container). The CLI and SDKs are published to npm. You can audit, fork, and self-host everything.",
		},
	];

	const tocItems = faqs.map((f) => ({ id: f.id, label: f.q }));

	const relatedLinks: RelatedLink[] = [
		{ href: '/docs/introduction', title: 'What is amesh', desc: 'Intro, philosophy, what amesh is for', type: 'doc' },
		{ href: '/docs/troubleshooting', title: 'Troubleshooting', desc: 'Common errors and fixes', type: 'doc' },
	];
</script>

<svelte:head>
	<title>FAQ — amesh</title>
	<meta name="description" content="Common questions about amesh: how it compares to mTLS, OAuth, and secrets managers; whether it works in ephemeral compute; key rotation; compliance; and more." />
	<link rel="canonical" href="https://authmesh.dev/docs/faq" />
	<meta property="og:title" content="FAQ — amesh" />
	<meta property="og:description" content="Common questions about amesh device-bound authentication." />
	<meta property="og:url" content="https://authmesh.dev/docs/faq" />
	{@html jsonLdScript(graph(
		breadcrumbList([
			{ name: 'Home', url: '/' },
			{ name: 'Docs', url: '/docs' },
			{ name: 'FAQ', url: '/docs/faq' }
		]),
		{
			'@type': 'FAQPage',
			mainEntity: faqs.map((f) => ({
				'@type': 'Question',
				name: f.q,
				acceptedAnswer: { '@type': 'Answer', text: f.a }
			}))
		}
	))}
</svelte:head>

<div class="mx-auto max-w-2xl px-6 pb-20">
	<section class="pt-16 pb-6">
		<Breadcrumb crumbs={[{ label: 'Docs', href: '/docs' }, { label: 'FAQ' }]} />
		<h1 class="mt-4 text-3xl font-bold text-zinc-50">Frequently Asked Questions</h1>
		<p class="mt-3 text-lg text-zinc-400">Common questions about amesh, device-bound identity, and how it compares to alternatives.</p>
		<TableOfContents items={tocItems} />
	</section>

	<section class="py-4 space-y-8">
		{#each faqs as faq}
			<div>
				<h2 id={faq.id} class="scroll-mt-20 text-lg font-semibold text-zinc-50">{faq.q}</h2>
				<p class="mt-2 text-zinc-400 leading-relaxed">{faq.a}</p>
			</div>
		{/each}
	</section>

	<section class="py-8">
		<p class="text-sm text-zinc-500">
			Don't see your question? Open an issue on <a href="https://github.com/ameshdev/amesh/issues" target="_blank" rel="noopener" class="text-emerald-400 no-underline hover:underline">GitHub</a>.
		</p>
	</section>

	<PrevNextNav {prev} {next} />
	<RelatedContent links={relatedLinks} />
</div>
