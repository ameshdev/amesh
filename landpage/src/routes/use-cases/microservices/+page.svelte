<script lang="ts">
	import { Network } from '@lucide/svelte';
	import UseCasePage from '$lib/components/UseCasePage.svelte';
</script>

<svelte:head>
	<title>Microservices Authentication — amesh</title>
	<meta name="description" content="Give each microservice its own hardware-bound identity. Per-service audit trail, isolated revocation, no shared API keys." />
	<link rel="canonical" href="https://authmesh.dev/use-cases/microservices" />
	<meta property="og:title" content="Microservices Authentication — amesh" />
	<meta property="og:description" content="Give each microservice its own hardware-bound identity. Per-service audit trail, no shared API keys." />
	<meta property="og:url" content="https://authmesh.dev/use-cases/microservices" />
</svelte:head>

<UseCasePage
	icon={Network}
	badge="Microservices"
	headline="Your services share a password. That's not identity."
	subtitle="When every service uses the same API key to call every other service, you don't have authentication — you have a shared secret that grants universal access."
	painTitle="The problem with shared API keys"
	painPoints={[
		{ lead: 'No per-service audit trail', detail: 'If the orders service and the billing service use the same key, your logs can\'t tell who made a request. Incident response becomes guesswork.' },
		{ lead: 'One compromised key = everything compromised', detail: 'A leaked key from any service grants access to all services that accept it. Blast radius is unlimited.' },
		{ lead: 'Rotation is a coordination nightmare', detail: 'Rotating a key shared by 15 services requires updating all 15 simultaneously. One missed deployment and the mesh breaks.' },
	]}
	codeTabs={[
		{ filename: 'orders-service.ts', code: `<span class="text-zinc-500">// Client side — signs every outgoing request</span>
import { amesh } from <span class="text-emerald-400">'@authmesh/sdk'</span>;

const inventory = await amesh.fetch(
  <span class="text-emerald-400">'https://inventory.internal/check'</span>,
  { method: <span class="text-emerald-400">'POST'</span>, body: JSON.stringify({ sku: <span class="text-emerald-400">'KB-001'</span> }) }
);` },
		{ filename: 'api-gateway.ts', code: `<span class="text-zinc-500">// Server side — verifies signature on every request</span>
import { amesh } from <span class="text-emerald-400">'@authmesh/sdk'</span>;

app.use(amesh.verify());

app.post(<span class="text-emerald-400">'/check'</span>, (req, res) => {
  console.log(<span class="text-emerald-400">\`Caller: \${req.authMesh.friendlyName}\`</span>);
  <span class="text-zinc-500">// "Caller: orders-service" — not "someone with API_KEY"</span>
});` },
		{ filename: 'Terminal', code: `<span class="text-zinc-500"># On the orders service machine:</span>
<span class="text-zinc-500">$</span> <span class="text-zinc-50">amesh init --name "orders-service"</span>

<span class="text-zinc-500"># Pair with the API gateway:</span>
<span class="text-zinc-500">$</span> <span class="text-zinc-50">amesh invite 482916</span>

<span class="text-zinc-500"># Each service has its own identity. Revoke one without touching others.</span>` },
	]}
	changes={[
		{ before: 'Shared API key across services', after: 'Unique identity per service' },
		{ before: 'No caller identification', after: 'req.authMesh.deviceId on every request' },
		{ before: 'Rotate key = redeploy everything', after: 'Revoke one device, others unaffected' },
	]}
/>
