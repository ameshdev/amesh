<script lang="ts">
	import { Terminal } from '@lucide/svelte';
	import UseCasePage from '$lib/components/UseCasePage.svelte';
</script>

<svelte:head>
	<title>Internal Tools & Audit Trail — amesh</title>
	<meta name="description" content="Replace shared admin API keys with per-developer device identity. Know exactly who ran what. SOC2 compliance without Okta or AWS IAM." />
	<link rel="canonical" href="https://authmesh.dev/use-cases/internal-tools" />
	<meta property="og:title" content="Internal Tools & Audit Trail — amesh" />
	<meta property="og:description" content="Replace shared admin API keys with per-developer device identity. SOC2 compliance without Okta." />
	<meta property="og:url" content="https://authmesh.dev/use-cases/internal-tools" />
</svelte:head>

<UseCasePage
	icon={Terminal}
	badge="Internal Tools"
	headline="Five developers share one admin key. Your SOC2 auditor is not impressed."
	subtitle="Admin scripts hit production with a shared API key from 1Password. No way to know who ran what. When someone leaves, nobody rotates the key."
	painTitle="The problem with shared admin keys"
	painPoints={[
		{ lead: 'No individual accountability', detail: 'Multiple developers use the same key to run scripts against production. Your logs show one API key for every admin action. When something breaks, you can\'t tell who did it.' },
		{ lead: 'Offboarding is a coordination nightmare', detail: 'When a developer leaves, you should rotate the shared key. But that means updating every script, every developer\'s .env, and every pipeline that uses it. So nobody does it.' },
		{ lead: 'SOC2 auditors ask who accessed what', detail: 'Compliance requires attributing actions to individuals. A shared API key makes this impossible without building a separate logging layer on top.' },
	]}
	codeTabs={[
		{ filename: 'admin-script.ts', code: `<span class="text-zinc-500">// Admin script — identity comes from the developer's laptop</span>
import { amesh } from <span class="text-emerald-400">'@authmesh/sdk'</span>;

<span class="text-zinc-500">// No API key. The developer's device IS the credential.</span>
const res = await amesh.fetch(
  <span class="text-emerald-400">'https://admin.internal/cache/purge'</span>,
  { method: <span class="text-emerald-400">'POST'</span>, body: JSON.stringify({ pattern: <span class="text-emerald-400">'users:*'</span> }) }
);

console.log(<span class="text-emerald-400">\`Purged: \${(await res.json()).count} keys\`</span>);` },
		{ filename: 'admin-api.ts', code: `<span class="text-zinc-500">// Admin API — knows exactly who called</span>
import { amesh } from <span class="text-emerald-400">'@authmesh/sdk'</span>;

app.use(<span class="text-emerald-400">'/admin'</span>, amesh.verify());

app.post(<span class="text-emerald-400">'/admin/cache/purge'</span>, (req, res) => {
  <span class="text-zinc-500">// "alice-macbook (am_3d9f1a2e) purged users:* at 10:15 AM"</span>
  audit.log({
    who: req.authMesh.friendlyName,
    device: req.authMesh.deviceId,
    action: <span class="text-emerald-400">'cache.purge'</span>,
    params: req.body,
  });
  res.json({ count: 847 });
});` },
		{ filename: 'Terminal', code: `<span class="text-zinc-500"># Each developer's laptop gets its own identity (uses macOS Keychain):</span>
<span class="text-zinc-500">$</span> <span class="text-zinc-50">amesh init --name "alice-macbook"</span>
<span class="text-zinc-500">$</span> <span class="text-zinc-50">amesh invite 482916</span>

<span class="text-zinc-500"># Alice leaves the team? Revoke her device. Bob is unaffected:</span>
<span class="text-zinc-500">$</span> <span class="text-zinc-50">amesh revoke am_3d9f1a2e</span>
<span class="text-emerald-400">&#10004;</span> Removed. Access revoked immediately.

<span class="text-zinc-500"># No shared key to rotate. No other developer's access changes.</span>` },
	]}
	changes={[
		{ before: 'Shared admin key in 1Password', after: 'Each developer\'s laptop IS their identity' },
		{ before: '"Someone ran the reset-db script"', after: '"Alice ran it from alice-macbook at 10:15 AM"' },
		{ before: 'Offboarding = rotate shared key', after: 'amesh revoke <device-id>. Others unaffected.' },
	]}
/>
