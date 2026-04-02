<script lang="ts">
	import { Clock } from '@lucide/svelte';
	import UseCasePage from '$lib/components/UseCasePage.svelte';
</script>

<svelte:head>
	<title>Cron Job Authentication Without API Keys — amesh</title>
	<meta name="description" content="Replace plaintext API keys in cron jobs with device-bound identity. Per-server audit trail, instant revocation, nothing to leak." />
	<link rel="canonical" href="https://authmesh.dev/use-cases/cron-jobs" />
	<meta property="og:title" content="Cron Job Authentication Without API Keys — amesh" />
	<meta property="og:description" content="Replace plaintext API keys in cron jobs with device-bound identity. Instant revocation, nothing to leak." />
	<meta property="og:url" content="https://authmesh.dev/use-cases/cron-jobs" />
</svelte:head>

<UseCasePage
	icon={Clock}
	badge="Cron Jobs"
	headline="Your cron job has a plaintext API key. So does the attacker."
	subtitle="A billing sync, a health check, a nightly data export. The API key is in a .env file or crontab on the server. If the server is compromised, the key works from anywhere."
	painTitle="The problem with API keys in scheduled tasks"
	painPoints={[
		{ lead: 'Keys sit in plaintext on disk', detail: 'The API key lives in a .env file, a crontab, or a systemd unit. Anyone with server access can read it and use it from any machine.' },
		{ lead: 'No way to distinguish the cron job from an attacker', detail: 'If someone copies the key, their requests look identical to the cron job\'s. Your logs show the same API key for both.' },
		{ lead: 'Rotation means updating every server', detail: 'If you rotate the key, every cron job on every server that uses it needs updating simultaneously. Miss one and the job fails silently at 3 AM.' },
	]}
	codeTabs={[
		{ filename: 'billing-sync.ts', code: `<span class="text-zinc-500">// Cron script — signs every request with device identity</span>
import { amesh } from <span class="text-emerald-400">'@authmesh/sdk'</span>;

const res = await amesh.fetch(
  <span class="text-emerald-400">'https://api.internal/billing/sync'</span>,
  { method: <span class="text-emerald-400">'POST'</span>, body: JSON.stringify({ date: <span class="text-emerald-400">'2026-04-01'</span> }) }
);

console.log(<span class="text-emerald-400">\`Sync complete: \${res.status}\`</span>);` },
		{ filename: 'api-server.ts', code: `<span class="text-zinc-500">// API server — verifies which device called</span>
import { amesh } from <span class="text-emerald-400">'@authmesh/sdk'</span>;

app.use(amesh.verify());

app.post(<span class="text-emerald-400">'/billing/sync'</span>, (req, res) => {
  console.log(<span class="text-emerald-400">\`Sync by: \${req.authMesh.friendlyName}\`</span>);
  <span class="text-zinc-500">// "Sync by: cron-server-1" — not "someone with BILLING_KEY"</span>
  res.json({ synced: true });
});` },
		{ filename: 'Terminal', code: `<span class="text-zinc-500"># On the API server (target):</span>
<span class="text-zinc-500">$</span> <span class="text-zinc-50">amesh init --name "billing-api"</span>
<span class="text-zinc-500">$</span> <span class="text-zinc-50">amesh listen</span>

<span class="text-zinc-500"># On the cron server (controller):</span>
<span class="text-zinc-500">$</span> <span class="text-zinc-50">amesh init --name "cron-server-1"</span>
<span class="text-zinc-500">$</span> <span class="text-zinc-50">amesh invite 482916</span>

<span class="text-zinc-500"># Server compromised? Revoke just that one device:</span>
<span class="text-zinc-500">$</span> <span class="text-zinc-50">amesh revoke am_7f2e8a1b</span>` },
	]}
	changes={[
		{ before: 'API key in .env or crontab', after: 'No key. Device identity signs the request.' },
		{ before: 'Can\'t tell cron job from attacker', after: 'req.authMesh.deviceId on every request' },
		{ before: 'Compromised server = key works anywhere', after: 'amesh revoke kills that device only' },
	]}
/>
