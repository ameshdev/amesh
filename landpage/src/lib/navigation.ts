export interface NavItem {
  slug: string;
  title: string;
  desc: string;
}

export interface NavLink {
  href: string;
  label: string;
  section?: string;
}

export interface RelatedLink {
  href: string;
  title: string;
  desc: string;
  type: 'doc' | 'use-case';
}

export const docPages: NavItem[] = [
  { slug: 'integration', title: 'Integration Guide', desc: 'Express, microservices, webhooks, remote pairing' },
  { slug: 'self-hosting', title: 'Self-Hosting Guide', desc: 'Docker, Cloud Run, Fly.io, Kubernetes' },
  { slug: 'remote-shell', title: 'Remote Shell Guide', desc: 'Agent setup, shell access, security model' },
];

export const useCasePages: NavItem[] = [
  { slug: 'microservices', title: 'Microservices', desc: 'Service-to-service identity' },
  { slug: 'webhooks', title: 'Webhooks', desc: 'Prove sender identity' },
  { slug: 'cron-jobs', title: 'Cron Jobs', desc: 'Scheduled task identity' },
  { slug: 'internal-tools', title: 'Internal Tools', desc: 'Per-developer audit trail' },
  { slug: 'remote-shell', title: 'Remote Shell', desc: 'SSH-like access with device identity' },
];

export function getDocNav(currentSlug: string): { prev?: NavLink; next?: NavLink } {
  const idx = docPages.findIndex((p) => p.slug === currentSlug);
  return {
    prev: idx > 0 ? { href: `/docs/${docPages[idx - 1].slug}`, label: docPages[idx - 1].title, section: 'Docs' } : undefined,
    next: idx < docPages.length - 1 ? { href: `/docs/${docPages[idx + 1].slug}`, label: docPages[idx + 1].title, section: 'Docs' } : undefined,
  };
}

export function getUseCaseNav(currentSlug: string): { prev?: NavLink; next?: NavLink } {
  const idx = useCasePages.findIndex((p) => p.slug === currentSlug);
  return {
    prev: idx > 0 ? { href: `/use-cases/${useCasePages[idx - 1].slug}`, label: useCasePages[idx - 1].title, section: 'Use Cases' } : undefined,
    next: idx < useCasePages.length - 1 ? { href: `/use-cases/${useCasePages[idx + 1].slug}`, label: useCasePages[idx + 1].title, section: 'Use Cases' } : undefined,
  };
}
