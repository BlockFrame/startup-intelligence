import { getPublicCorsHeaders } from './_cors.js';

const GH = 'https://api.github.com';

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
  let upstream;
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
