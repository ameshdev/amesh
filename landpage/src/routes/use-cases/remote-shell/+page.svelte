<script lang="ts">
	import { Terminal } from '@lucide/svelte';
	import UseCasePage from '$lib/components/UseCasePage.svelte';
	import { jsonLdScript, graph, breadcrumbList, techArticle } from '$lib/seo.js';
</script>

<svelte:head>
	<title>Remote Shell Without SSH Keys — amesh</title>
	<meta name="description" content="SSH-like remote access with device-bound identity. No SSH keys to copy, no authorized_keys to manage, instant per-device revocation." />
	<link rel="canonical" href="https://authmesh.dev/use-cases/remote-shell" />
	<meta property="og:title" content="Remote Shell Without SSH Keys — amesh" />
	<meta property="og:description" content="SSH-like remote access with device-bound identity. No SSH keys, instant revocation." />
	<meta property="og:url" content="https://authmesh.dev/use-cases/remote-shell" />
	{@html jsonLdScript(graph(
		breadcrumbList([
			{ name: 'Home', url: '/' },
			{ name: 'Use Cases', url: '/use-cases' },
			{ name: 'Remote Shell', url: '/use-cases/remote-shell' }
		]),
		techArticle({
			title: 'Remote Shell Without SSH Keys',
			description: 'SSH-like remote access with device-bound identity. No SSH keys, no authorized_keys, instant per-device revocation.',
			url: '/use-cases/remote-shell',
			section: 'Use Cases'
		})
	))}
</svelte:head>

<UseCasePage
	icon={Terminal}
	badge="Remote Shell"
	slug="remote-shell"
	relatedLinks={[
		{ href: '/docs/remote-shell', title: 'Remote Shell Guide', desc: 'Setup, security model, environment variables', type: 'doc' },
		{ href: '/docs/integration', title: 'Integration Guide', desc: 'HTTP API authentication setup', type: 'doc' },
	]}
	headline="Your SSH keys are files. Your device is not."
	subtitle="SSH key management means copying private keys, editing authorized_keys on every server, and hoping nobody leaks a key. amesh replaces all of it with device-bound identity."
	painTitle="The problem with SSH key management"
	painPoints={[
		{ lead: 'SSH keys are copyable files', detail: 'A private key in ~/.ssh/ can be copied to any machine. If a laptop is compromised, the attacker has the key and can use it from anywhere. The key is not bound to the device.' },
		{ lead: 'authorized_keys has no integrity protection', detail: 'It\'s a plain text file. Any process running as the same user can silently append a key. There is no tamper detection, no seal, no audit trail of modifications.' },
		{ lead: 'Revocation requires editing every server', detail: 'When someone leaves the team, you remove their key from authorized_keys on every server they had access to. Miss one and they still have access. There is no central revocation.' },
	]}
	codeTabs={[
		{ filename: 'Install', code: `<span class="text-zinc-500"># Same binary on both machines</span>
brew install ameshdev/tap/amesh
<span class="text-zinc-500"># or: npm install -g @authmesh/cli</span>
<span class="text-zinc-500"># or: curl -fsSL https://authmesh.dev/install | sh</span>` },
		{ filename: 'Terminal (target)', code: `<span class="text-zinc-500"># On the server — start the agent daemon</span>
<span class="text-zinc-500">$</span> <span class="text-zinc-50">amesh agent start</span>

  amesh agent listening on relay.authmesh.dev
  Device: <span class="text-emerald-400">am_7f2e8a1b</span> (prod-api)
  Authorized controllers: 2

  Waiting for shell requests...` },
		{ filename: 'Terminal (controller)', code: `<span class="text-zinc-500"># On your laptop — open a shell</span>
<span class="text-zinc-500">$</span> <span class="text-zinc-50">amesh shell prod-api</span>

  Connecting to prod-api (<span class="text-emerald-400">am_7f2e8a1b</span>)...
  Connected. Shell session started.

<span class="text-emerald-400">user@prod-api:~$</span> whoami
user
<span class="text-emerald-400">user@prod-api:~$</span> exit
  Session closed (exit code 0, duration 2m 14s).` },
		{ filename: 'Pair + grant', code: `<span class="text-zinc-500"># On the server — pair and grant shell in one step</span>
<span class="text-zinc-500">$</span> <span class="text-zinc-50">amesh listen --shell</span>

<span class="text-zinc-500"># On your laptop</span>
<span class="text-zinc-500">$</span> <span class="text-zinc-50">amesh invite 482916</span>
<span class="text-emerald-400">✔</span> "prod-api" added as target.

<span class="text-zinc-500"># Revoke when someone leaves — instant, one command</span>
<span class="text-zinc-500">$</span> <span class="text-zinc-50">amesh revoke am_3d9f1a2e</span>
<span class="text-emerald-400">✔</span> Removed. Access revoked immediately.` },
	]}
	changes={[
		{ before: 'SSH keys are copyable files', after: 'Key is in the device — Keychain, TPM, or encrypted' },
		{ before: 'authorized_keys is a plain text file', after: 'HMAC-sealed allow list with tamper detection' },
		{ before: 'Revoke = edit every server', after: 'amesh revoke <device-id>. Instant. One command.' },
	]}
/>
