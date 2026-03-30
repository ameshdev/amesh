<script lang="ts">
	import { Webhook } from '@lucide/svelte';
	import UseCasePage from '$lib/components/UseCasePage.svelte';
</script>

<svelte:head>
	<title>Webhook Authentication Without Shared Secrets — amesh</title>
	<meta name="description" content="Sign and verify webhooks with asymmetric cryptography. No HMAC secrets to share, rotate, or leak." />
	<link rel="canonical" href="https://authmesh.dev/use-cases/webhooks" />
	<meta property="og:title" content="Webhook Authentication Without Shared Secrets — amesh" />
	<meta property="og:description" content="Sign and verify webhooks with asymmetric cryptography. No HMAC secrets to share or rotate." />
	<meta property="og:url" content="https://authmesh.dev/use-cases/webhooks" />
</svelte:head>

<UseCasePage
	icon={Webhook}
	badge="Webhooks"
	headline="Your webhook receiver has no idea who's calling."
	subtitle="HMAC signing secrets must be shared between sender and receiver. If either side leaks the secret, anyone can forge webhooks."
	painTitle="The problem with webhook authentication"
	painPoints={[
		{ lead: 'HMAC secrets must be shared', detail: 'Both the sender and receiver must have the same secret. That means two places to leak, two places to rotate, and a shared channel to distribute it.' },
		{ lead: 'No sender identity', detail: 'An HMAC proves the request wasn\'t tampered with, but it doesn\'t prove who sent it. Any system with the secret can forge a valid webhook.' },
		{ lead: 'Webhook URLs are guessable', detail: 'If an attacker discovers your webhook URL and the signing secret, they can send arbitrary payloads that pass validation.' },
	]}
	codeTabs={[
		{ filename: 'sender.ts', code: `<span class="text-zinc-500">// Webhook sender — signs with device identity</span>
import { amesh } from <span class="text-emerald-400">'@authmesh/sdk'</span>;

await amesh.fetch(<span class="text-emerald-400">'https://partner.com/webhooks/orders'</span>, {
  method: <span class="text-emerald-400">'POST'</span>,
  headers: { <span class="text-emerald-400">'Content-Type'</span>: <span class="text-emerald-400">'application/json'</span> },
  body: JSON.stringify({
    event: <span class="text-emerald-400">'order.created'</span>,
    data: { id: <span class="text-emerald-400">'ord_001'</span>, amount: <span class="text-emerald-400">4999</span> },
  }),
});` },
		{ filename: 'receiver.ts', code: `<span class="text-zinc-500">// Webhook receiver — verifies sender identity</span>
import { amesh } from <span class="text-emerald-400">'@authmesh/sdk'</span>;

app.use(<span class="text-emerald-400">'/webhooks'</span>, amesh.verify());

app.post(<span class="text-emerald-400">'/webhooks/orders'</span>, (req, res) => {
  <span class="text-zinc-500">// req.authMesh.deviceId — cryptographic proof of sender</span>
  console.log(<span class="text-emerald-400">\`Webhook from: \${req.authMesh.friendlyName}\`</span>);
  res.sendStatus(200);
});` },
	]}
	changes={[
		{ before: 'Shared HMAC secret', after: 'No shared secret. Asymmetric crypto.' },
		{ before: '"Someone with the secret sent this"', after: '"Device am_8f3a (orders-api) sent this"' },
		{ before: 'Rotate secret on both sides', after: 'Revoke sender device. Receiver unchanged.' },
	]}
/>
