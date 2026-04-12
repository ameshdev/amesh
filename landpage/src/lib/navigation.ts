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

export interface ExternalLink {
  href: string;
  label: string;
  external: true;
}

export interface DocSection {
  title: string;
  items: NavItem[];
  externals?: ExternalLink[];
}

export interface RelatedLink {
  href: string;
  title: string;
  desc: string;
  type: 'doc' | 'use-case';
}

const REPO = 'https://github.com/ameshdev/amesh';

// Hierarchical doc structure (vite.dev / bun.com style).
// Used by DocsSidebar for rendering and by getDocNav for cross-section prev/next.
export const docSections: DocSection[] = [
  {
    title: 'Introduction',
    items: [
      { slug: 'introduction', title: 'What is amesh', desc: 'Device-bound M2M authentication explained' },
    ],
  },
  {
    title: 'Getting Started',
    items: [
      { slug: 'quickstart', title: 'Quickstart', desc: 'Install, pair, and sign your first request in 5 minutes' },
      { slug: 'integration', title: 'Integration Guide', desc: 'Express, microservices, webhooks, remote pairing' },
    ],
  },
  {
    title: 'Guides',
    items: [
      { slug: 'key-storage', title: 'Key Storage', desc: 'Secure Enclave, TPM, encrypted file — tiered auto-detection' },
      { slug: 'self-hosting', title: 'Self-Hosting', desc: 'Docker, Cloud Run, Fly.io, Kubernetes' },
    ],
  },
  {
    title: 'Reference',
    items: [
      { slug: 'faq', title: 'FAQ', desc: 'Common questions about device identity and amesh' },
      { slug: 'troubleshooting', title: 'Troubleshooting', desc: 'Common errors and how to fix them' },
      { slug: 'changelog', title: 'Changelog', desc: 'Release notes and version history' },
    ],
    externals: [
      { href: `${REPO}/blob/main/docs/protocol-spec.md`, label: 'Protocol Spec', external: true },
      { href: `${REPO}/blob/main/docs/architecture-decisions.md`, label: 'Architecture Decisions', external: true },
      { href: `${REPO}/blob/main/docs/guide.md`, label: 'Usage Guide', external: true },
    ],
  },
];

// Flat list of all internal doc pages in reading order. Used for prev/next.
export const docPages: NavItem[] = docSections.flatMap((s) => s.items);

// Use cases remain independent of the docs hierarchy.
export const useCasePages: NavItem[] = [
  { slug: 'microservices', title: 'Microservices', desc: 'Service-to-service identity' },
  { slug: 'webhooks', title: 'Webhooks', desc: 'Prove sender identity' },
  { slug: 'cron-jobs', title: 'Cron Jobs', desc: 'Scheduled task identity' },
  { slug: 'internal-tools', title: 'Internal Tools', desc: 'Per-developer audit trail' },
];

export function getDocNav(currentSlug: string): { prev?: NavLink; next?: NavLink } {
  const idx = docPages.findIndex((p) => p.slug === currentSlug);
  if (idx === -1) return {};

  // Find which section each neighbor belongs to, for the small "Section" label.
  const sectionOf = (slug: string): string | undefined =>
    docSections.find((s) => s.items.some((i) => i.slug === slug))?.title;

  const prev = idx > 0 ? docPages[idx - 1] : undefined;
  const next = idx < docPages.length - 1 ? docPages[idx + 1] : undefined;

  return {
    prev: prev ? { href: `/docs/${prev.slug}`, label: prev.title, section: sectionOf(prev.slug) } : undefined,
    next: next ? { href: `/docs/${next.slug}`, label: next.title, section: sectionOf(next.slug) } : undefined,
  };
}

export function getUseCaseNav(currentSlug: string): { prev?: NavLink; next?: NavLink } {
  const idx = useCasePages.findIndex((p) => p.slug === currentSlug);
  return {
    prev:
      idx > 0
        ? { href: `/use-cases/${useCasePages[idx - 1].slug}`, label: useCasePages[idx - 1].title, section: 'Use Cases' }
        : undefined,
    next:
      idx < useCasePages.length - 1
        ? { href: `/use-cases/${useCasePages[idx + 1].slug}`, label: useCasePages[idx + 1].title, section: 'Use Cases' }
        : undefined,
  };
}
