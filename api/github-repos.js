import { getPublicCorsHeaders } from './_cors.js';

const GH = 'https://api.github.com';

function decodeHtml(value) {
  return String(value || '')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseCount(value) {
  const cleaned = String(value || '').replace(/,/g, '').trim();
  const number = Number(cleaned);
  return Number.isFinite(number) ? number : 0;
}

export function extractTrendingReposFromHtml(html) {
  return Array.from(String(html || '').matchAll(/<article class="Box-row">([\s\S]*?)<\/article>/g)).map((match, index) => {
    const block = match[1] || '';
    const repoMatch = block.match(/href="\/([\w.-]+\/[\w.-]+)"[\s\S]*?class="Link"/);
    if (!repoMatch?.[1]) return null;
    const fullName = repoMatch[1];
    if (fullName.startsWith('sponsors/')) return null;
    const name = fullName.split('/').pop() || fullName;
    const description = decodeHtml((block.match(/<p class="[^"]*color-fg-muted[^"]*"[^>]*>([\s\S]*?)<\/p>/)?.[1] || '').replace(/<[^>]+>/g, ''));
    const language = decodeHtml(block.match(/itemprop="programmingLanguage">([^<]+)</)?.[1] || 'Unknown');
    const starMatches = Array.from(block.matchAll(/<a href="\/[\w.-]+\/[\w.-]+\/stargazers"[\s\S]*?<\/svg>\s*([\d,]+)/g));
    const stars = parseCount(starMatches[0]?.[1]);
    const forks = parseCount(block.match(/<a href="\/[\w.-]+\/[\w.-]+\/forks"[\s\S]*?<\/svg>\s*([\d,]+)/)?.[1]);
    const starsToday = parseCount(block.match(/([\d,]+)\s+stars today/)?.[1]);
    const now = new Date().toISOString();
    return {
      full_name: fullName,
      owner: { login: fullName.split('/')[0] },
      name,
      description,
      topics: [],
      html_url: `https://github.com/${fullName}`,
      stargazers_count: stars,
      forks_count: forks,
      watchers_count: stars,
      language,
      created_at: now,
      updated_at: now,
      pushed_at: now,
      homepage: '',
      license: null,
      trendingRank: index + 1,
      starsToday,
      source: 'github-trending',
    };
  }).filter(Boolean);
}

function githubHeaders() {
  return {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'StartupIntelligence/1.0',
    ...(process.env.GITHUB_TOKEN ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {}),
  };
}

export default async function handler(req) {
  const headers = getPublicCorsHeaders('GET, OPTIONS');
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers });
  if (req.method !== 'GET') return new Response('Method not allowed', { status: 405, headers });

  const url = new URL(req.url);
  const repo = url.searchParams.get('repo');
  const search = url.searchParams.get('search');
  const trending = url.searchParams.get('trending');
  let upstream;
  if (trending === '1') {
    const response = await fetch('https://github.com/trending', { headers: { Accept: 'text/html', 'User-Agent': 'StartupIntelligence/1.0' } });
    const html = await response.text();
    return new Response(JSON.stringify({ items: extractTrendingReposFromHtml(html) }), {
      status: response.status,
      headers: { ...headers, 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=900, s-maxage=1800' },
    });
  }
  if (repo) {
    if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) return new Response('Invalid repo', { status: 400, headers });
    upstream = `${GH}/repos/${repo}`;
  } else if (search) {
    const perPage = Math.min(Math.max(Number(url.searchParams.get('per_page') || 20), 1), 50);
    const sort = ['stars', 'updated'].includes(url.searchParams.get('sort') || '') ? url.searchParams.get('sort') : 'stars';
    const order = url.searchParams.get('order') === 'asc' ? 'asc' : 'desc';
    upstream = `${GH}/search/repositories?q=${encodeURIComponent(search)}&sort=${sort}&order=${order}&per_page=${perPage}`;
  } else {
    return new Response('Missing repo or search', { status: 400, headers });
  }

  const response = await fetch(upstream, { headers: githubHeaders() });
  const json = await response.json();
  return new Response(JSON.stringify(repo ? { repo: json } : json), {
    status: response.status,
    headers: {
      ...headers,
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=900, s-maxage=1800',
    },
  });
}
