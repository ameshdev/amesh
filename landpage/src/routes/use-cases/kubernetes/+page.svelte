<script lang="ts">
	import { Container } from '@lucide/svelte';
	import UseCasePage from '$lib/components/UseCasePage.svelte';
</script>

<svelte:head>
	<title>Kubernetes Pod Authentication Without Secrets — amesh</title>
	<meta name="description" content="Per-pod device identity without Vault sidecars. Auto-pair on pod startup with a single-use bootstrap token." />
	<link rel="canonical" href="https://authmesh.dev/use-cases/kubernetes" />
	<meta property="og:title" content="Kubernetes Pod Authentication Without Secrets — amesh" />
	<meta property="og:description" content="Per-pod device identity without Vault sidecars. Auto-pair on pod startup." />
	<meta property="og:url" content="https://authmesh.dev/use-cases/kubernetes" />
</svelte:head>

<UseCasePage
	icon={Container}
	badge="Kubernetes"
	headline="Every pod gets a secret. None of them should."
	subtitle="Kubernetes Secrets are base64-encoded, not encrypted. Anyone with namespace access can read them. Vault solves this but adds a sidecar to every pod."
	painTitle="The problem with secrets in Kubernetes"
	painPoints={[
		{ lead: 'K8s Secrets are not encrypted at rest by default', detail: 'kubectl get secret -o yaml reveals the value. Anyone with RBAC read access to the namespace can extract every secret.' },
		{ lead: 'Vault adds operational overhead', detail: 'HashiCorp Vault requires a sidecar injector, init containers, policies, token renewal, and its own HA deployment. That\'s a lot of infrastructure to protect one API key.' },
		{ lead: 'Pod restarts re-fetch secrets', detail: 'Every pod restart or scale event fetches the secret again. At scale, the secrets backend becomes a bottleneck and a single point of failure.' },
	]}
	codeTabs={[
		{ filename: 'app.ts', code: `import { bootstrapIfNeeded } from <span class="text-emerald-400">'@authmesh/sdk'</span>;
import { amesh } from <span class="text-emerald-400">'@authmesh/sdk'</span>;

<span class="text-zinc-500">// Auto-pairs on pod startup. New pods get new identities.</span>
await bootstrapIfNeeded();

const data = await amesh.fetch(<span class="text-emerald-400">'https://api.internal/data'</span>);` },
		{ filename: 'deployment.yaml', code: `apiVersion: apps/v1
kind: Deployment
spec:
  template:
    spec:
      containers:
        - name: app
          env:
<span class="text-emerald-400">            - name: AMESH_BOOTSTRAP_TOKEN
              valueFrom:
                secretKeyRef:
                  name: amesh-tokens
                  key: bootstrap-token</span>` },
		{ filename: 'Terminal', code: `<span class="text-zinc-500"># Generate token and store in K8s</span>
<span class="text-zinc-500">$</span> <span class="text-zinc-50">amesh provision --name "data-worker" --ttl 1h -o json | \\
  jq -r .token | \\
  kubectl create secret generic amesh-tokens \\
    --from-literal=bootstrap-token=-</span>

<span class="text-zinc-500"># Each pod auto-pairs on startup. Old pods can be revoked individually.</span>` },
	]}
	changes={[
		{ before: 'K8s Secret with API key', after: 'Single-use bootstrap token' },
		{ before: 'Vault sidecar per pod', after: 'bootstrapIfNeeded() — zero sidecars' },
		{ before: 'Shared identity across replicas', after: 'Per-pod device identity' },
	]}
/>
