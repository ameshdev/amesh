<script lang="ts">
	import { GitBranch } from '@lucide/svelte';
	import UseCasePage from '$lib/components/UseCasePage.svelte';
</script>

<svelte:head>
	<title>CI/CD Pipeline Authentication — amesh</title>
	<meta name="description" content="Replace long-lived production secrets in GitHub Actions with single-use bootstrap tokens. Cryptographic identity per workflow run." />
	<link rel="canonical" href="https://authmesh.dev/use-cases/ci-cd" />
	<meta property="og:title" content="CI/CD Pipeline Authentication — amesh" />
	<meta property="og:description" content="Replace long-lived secrets in GitHub Actions with single-use bootstrap tokens." />
	<meta property="og:url" content="https://authmesh.dev/use-cases/ci-cd" />
</svelte:head>

<UseCasePage
	icon={GitBranch}
	badge="CI/CD Pipelines"
	headline="Your pipeline has production credentials. Sleep well?"
	subtitle="GitHub Actions secrets are available to every workflow in the repo. A compromised action or a malicious PR can exfiltrate them in one step."
	painTitle="The problem with secrets in CI/CD"
	painPoints={[
		{ lead: 'Secrets are org-wide or repo-wide', detail: 'Any workflow in the repo can read the production API key. There\'s no way to scope a secret to a specific workflow or branch.' },
		{ lead: 'No audit trail per workflow run', detail: 'If three workflows ran today using the same secret, your API server sees three identical callers. Which deployment caused the issue?' },
		{ lead: 'Secret rotation requires updating every repo', detail: 'When you rotate a production key, every repo that uses it needs its GitHub Secrets updated. Miss one and the next deploy fails.' },
	]}
	codeTabs={[
		{ filename: '.github/workflows/deploy.yml', code: `jobs:
  deploy:
    runs-on: ubuntu-latest
    env:
<span class="text-emerald-400">      AMESH_BOOTSTRAP_TOKEN: \${'{{' + ' secrets.AMESH_DEPLOY_TOKEN ' + '}}'}</span>
    steps:
      - uses: actions/checkout@v4
      - run: pnpm install && pnpm build
      - run: node deploy.ts` },
		{ filename: 'deploy.ts', code: `import { bootstrapIfNeeded } from <span class="text-emerald-400">'@authmesh/sdk'</span>;
import { amesh } from <span class="text-emerald-400">'@authmesh/sdk'</span>;

<span class="text-zinc-500">// Auto-pairs on first run. Token is single-use.</span>
await bootstrapIfNeeded();

const res = await amesh.fetch(<span class="text-emerald-400">'https://api.prod/deploy'</span>, {
  method: <span class="text-emerald-400">'POST'</span>,
  body: JSON.stringify({ version: process.env.SHA }),
});` },
		{ filename: 'Terminal', code: `<span class="text-zinc-500"># Generate a short-lived token for the next deploy</span>
<span class="text-zinc-500">$</span> <span class="text-zinc-50">amesh provision --name "gh-actions-deploy" --ttl 30m</span>

<span class="text-zinc-500"># Set it as a GitHub secret</span>
<span class="text-zinc-500">$</span> <span class="text-zinc-50">gh secret set AMESH_DEPLOY_TOKEN --body "amesh-bt-v1.eyJ0..."</span>` },
	]}
	changes={[
		{ before: 'Long-lived production API key', after: 'Single-use 30min bootstrap token' },
		{ before: 'Secret readable by any workflow', after: 'Token consumed on first use' },
		{ before: 'Same key across all repos', after: 'Unique identity per workflow run' },
	]}
/>
