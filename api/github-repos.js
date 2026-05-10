import { getPublicCorsHeaders } from './_cors.js';

const GH = 'https://api.github.com';

function githubHeaders() {
  const h = { Accept: 'application/vnd.github.v3+json', 'User-Agent': 'StartupIntelligence/1.0' };
  if (process.env.GITHUB_TOKEN) h.Authorization = `token ${process.env.GITHUB_TOKEN}`;
  return h;
}

const timeoutPromise = (ms) => new Promise((_, reject) => setTimeout(() => reject(new Error('TimeoutError')), ms));

export default async function handler(req) {
  const headers = getPublicCorsHeaders('GET, OPTIONS');
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers });
  if (req.method !== 'GET') return new Response('Method not allowed', { status: 405, headers });

  try {
    const url = new URL(req.url);
    const repo = url.searchParams.get('repo');
    const search = url.searchParams.get('search');
    const isTrending = url.searchParams.get('trending') === '1';

    let upstream = '';
    
    if (isTrending) {
      const fallbackUrl = `${url.origin || 'https://startupintelligence.app'}/api/bootstrap?keys=curatedGithub`;
      try {
        const fetchPromise = fetch(fallbackUrl, { headers: { 'User-Agent': 'StartupIntelligence/1.0' } });
        fetchPromise.catch(() => {}); // Prevent unhandled rejection
        
        const fallbackRes = await Promise.race([
          fetchPromise,
          timeoutPromise(8000)
        ]);
        
        if (!fallbackRes.ok) {
          return new Response(JSON.stringify({ items: [], error: 'Failed to fetch fallback trending data' }), {
            status: 200,
            headers: { ...headers, 'Content-Type': 'application/json' },
          });
        }

        const fallbackJson = await fallbackRes.json();
        const fallbackItems = (fallbackJson.items || []).map((item, index) => ({
          ...item,
          trendingRank: index + 1,
          source: 'github-trending',
          starsToday: Math.round(item.stargazers_count / 30),
        }));

        return new Response(JSON.stringify({ items: fallbackItems, isFallback: true }), {
          status: 200,
          headers: { ...headers, 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=3600' },
        });
      } catch (err) {
        return new Response(JSON.stringify({ items: [], error: err.message || 'TimeoutError' }), {
          status: 200,
          headers: { ...headers, 'Content-Type': 'application/json' },
        });
      }
    }
    
    if (repo) {
      if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) return new Response(JSON.stringify({ error: 'Invalid repo' }), { status: 400, headers });
      upstream = `${GH}/repos/${repo}`;
    } else if (search) {
      const perPage = Math.min(Math.max(Number(url.searchParams.get('per_page') || 20), 1), 50);
      const sort = ['stars', 'updated'].includes(url.searchParams.get('sort') || '') ? url.searchParams.get('sort') : 'stars';
      const order = url.searchParams.get('order') === 'asc' ? 'asc' : 'desc';
      upstream = `${GH}/search/repositories?q=${encodeURIComponent(search)}&sort=${sort}&order=${order}&per_page=${perPage}`;
    } else {
      return new Response(JSON.stringify({ error: 'Missing repo or search' }), { status: 400, headers });
    }

    const fetchPromise = fetch(upstream, { headers: githubHeaders() });
    fetchPromise.catch(() => {}); // Prevent unhandled rejection
    
    const response = await Promise.race([
      fetchPromise,
      timeoutPromise(8000)
    ]);
    
    if (!response.ok) {
      const errText = await response.text();
      return new Response(JSON.stringify({ error: 'GitHub API Error', details: errText, status: response.status }), {
        status: response.status, // We can return real status here because it didn't timeout
        headers: { ...headers, 'Content-Type': 'application/json' },
      });
    }

    const json = await response.json();
    return new Response(JSON.stringify(repo ? { repo: json } : json), {
      status: response.status,
      headers: {
        ...headers,
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=3600',
      },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message || 'TimeoutError' }), {
      status: 200,
      headers: { ...headers, 'Content-Type': 'application/json' },
    });
  }
}
