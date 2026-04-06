export interface BlogPost {
  slug: string;
  title: string;
  description: string;
  date: string;
  author: string;
  readingTime: string;
  tags: string[];
}

// Posts listed newest first. Individual post content lives in
// src/routes/blog/[slug]/+page.svelte — this file is for metadata only.
export const posts: BlogPost[] = [
  {
    slug: 'your-ai-writes-env-files',
    title: 'Your AI just wrote another .env file',
    description:
      'AI coding tools generate more backends in a month than teams used to build in a year. Each one starts with a .env file full of static secrets. It doesn\'t have to.',
    date: '2026-04-06',
    author: 'The amesh team',
    readingTime: '6 min read',
    tags: ['essay', 'ai', 'security'],
  },
  {
    slug: 'introducing-amesh-0-3',
    title: 'Introducing amesh 0.3',
    description:
      'Auto-generated passphrases, verbose backend detection, a docs sidebar, and the security hardening that shipped across the 0.3.x line.',
    date: '2026-04-04',
    author: 'The amesh team',
    readingTime: '5 min read',
    tags: ['release', 'changelog'],
  },
  {
    slug: 'why-we-built-amesh',
    title: 'Why we built amesh',
    description:
      "Static API keys are a broken model. Over 1 million were leaked on GitHub in 2024. Here's why we think device-bound identity is the only honest fix.",
    date: '2026-04-01',
    author: 'The amesh team',
    readingTime: '7 min read',
    tags: ['essay', 'security'],
  },
];

export function getPost(slug: string): BlogPost | undefined {
  return posts.find((p) => p.slug === slug);
}

export function getPostNav(slug: string): { prev?: BlogPost; next?: BlogPost } {
  const idx = posts.findIndex((p) => p.slug === slug);
  if (idx === -1) return {};
  return {
    // posts[] is newest-first, so "next (newer)" is idx-1 and "prev (older)" is idx+1
    prev: idx < posts.length - 1 ? posts[idx + 1] : undefined,
    next: idx > 0 ? posts[idx - 1] : undefined,
  };
}
