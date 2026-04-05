// JSON-LD structured data helpers for SEO rich results.
// Used inside <svelte:head> with {@html jsonLdScript(...)}.

const SITE = 'https://authmesh.dev';

export interface BreadcrumbCrumb {
  name: string;
  url: string;
}

export interface ArticleMeta {
  title: string;
  description: string;
  url: string;
  section?: string;
  datePublished?: string;
  dateModified?: string;
}

function serialize(obj: unknown): string {
  // Escape </script> to prevent HTML injection in <script> blocks.
  return JSON.stringify(obj).replace(/</g, '\\u003c');
}

/** Wraps a JSON-LD payload in a <script type="application/ld+json"> tag. */
export function jsonLdScript(payload: unknown): string {
  return `<script type="application/ld+json">${serialize(payload)}</` + `script>`;
}

/** BreadcrumbList schema from an ordered list of {name, url} crumbs. */
export function breadcrumbList(crumbs: BreadcrumbCrumb[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: crumbs.map((c, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: c.name,
      item: c.url.startsWith('http') ? c.url : `${SITE}${c.url}`,
    })),
  };
}

/** TechArticle schema for documentation pages. */
export function techArticle(meta: ArticleMeta) {
  return {
    '@context': 'https://schema.org',
    '@type': 'TechArticle',
    headline: meta.title,
    description: meta.description,
    url: meta.url.startsWith('http') ? meta.url : `${SITE}${meta.url}`,
    articleSection: meta.section ?? 'Documentation',
    inLanguage: 'en',
    isPartOf: { '@type': 'WebSite', '@id': `${SITE}/#website`, name: 'amesh', url: SITE },
    author: { '@type': 'Organization', '@id': `${SITE}/#organization`, name: 'amesh' },
    publisher: { '@type': 'Organization', '@id': `${SITE}/#organization`, name: 'amesh' },
    ...(meta.datePublished && { datePublished: meta.datePublished }),
    ...(meta.dateModified && { dateModified: meta.dateModified }),
  };
}

/** BlogPosting schema for blog posts (enables Google article rich results). */
export function blogPosting(meta: ArticleMeta & { datePublished: string }) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: meta.title,
    description: meta.description,
    url: meta.url.startsWith('http') ? meta.url : `${SITE}${meta.url}`,
    mainEntityOfPage: { '@type': 'WebPage', '@id': meta.url.startsWith('http') ? meta.url : `${SITE}${meta.url}` },
    articleSection: meta.section ?? 'Blog',
    inLanguage: 'en',
    isPartOf: { '@type': 'Blog', '@id': `${SITE}/blog`, name: 'amesh Blog' },
    author: { '@type': 'Organization', '@id': `${SITE}/#organization`, name: 'amesh' },
    publisher: {
      '@type': 'Organization',
      '@id': `${SITE}/#organization`,
      name: 'amesh',
      logo: { '@type': 'ImageObject', url: `${SITE}/icon-512.png` },
    },
    datePublished: meta.datePublished,
    dateModified: meta.dateModified ?? meta.datePublished,
    image: `${SITE}/og-image.png`,
  };
}

/** Combines multiple JSON-LD payloads into one @graph document. */
export function graph(...items: unknown[]) {
  return {
    '@context': 'https://schema.org',
    '@graph': items.map((item) => {
      // Strip @context from nested items to avoid duplication.
      const { '@context': _, ...rest } = item as Record<string, unknown>;
      return rest;
    }),
  };
}
