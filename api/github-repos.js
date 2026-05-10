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

  try {
    const url = new URL(req.url);
    const repo = url.searchParams.get('repo');
    const search = url.searchParams.get('search');
    const trending = url.searchParams.get('trending');
    let upstream;
    
    if (trending === '1') {
      console.log('[api/github-repos] Fetching trending via scraping...');
      let items = [];
      try {
        const response = await fetch('https://github.com/trending', { 
          headers: { 
            'Accept': 'text/html', 
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36' 
          },
          signal: AbortSignal.timeout(8000)
        });
        const html = await response.text();
        items = extractTrendingReposFromHtml(html);
      } catch (e) {
        console.error('[api/github-repos] Scraping failed completely:', e.message);
      }
      
      if (items.length > 0) {
        return new Response(JSON.stringify({ items }), {
          status: 200,
          headers: { ...headers, 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=3600' },
        });
      }

      // Fallback to Search API if scraping is blocked or fails
      console.log('[api/github-repos] Scraping returned 0 items (likely blocked). Falling back to Search API...');
      const now = new Date();
      const lastWeek = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      // Search for repos created or highly active in the last week with high stars
      const fallbackUrl = `${GH}/search/repositories?q=created:>${lastWeek}+stars:>50&sort=stars&order=desc&per_page=25`;
      
      const fallbackRes = await fetch(fallbackUrl, { 
        headers: githubHeaders(),
        signal: AbortSignal.timeout(8000)
      });
      
      if (!fallbackRes.ok) {
        const errText = await fallbackRes.text();
        console.error(`[api/github-repos] Fallback Search API Error: ${fallbackRes.status}`, errText);
        return new Response(JSON.stringify({ error: 'GitHub API Error during fallback', details: errText, status: fallbackRes.status }), {
          status: fallbackRes.status,
          headers: { ...headers, 'Content-Type': 'application/json' },
        });
      }

      const fallbackJson = await fallbackRes.json();

      // Normalize fallback items to match trending shape
      const fallbackItems = (fallbackJson.items || []).map((item, index) => ({
        ...item,
        trendingRank: index + 1,
        source: 'github-trending',
        starsToday: Math.round(item.stargazers_count / 30), // Simulated
      }));

      return new Response(JSON.stringify({ items: fallbackItems, isFallback: true }), {
        status: fallbackRes.status,
        headers: { ...headers, 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=3600' },
      });
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

    console.log(`[api/github-repos] Fetching upstream: ${upstream} (Token present: ${!!process.env.GITHUB_TOKEN})`);
    const response = await fetch(upstream, { 
      headers: githubHeaders(),
      signal: AbortSignal.timeout(8000)
    });
    
    if (!response.ok) {
      const errText = await response.text();
      console.error(`[api/github-repos] GitHub API Error: ${response.status}`, errText);
      return new Response(JSON.stringify({ error: 'GitHub API Error', details: errText, status: response.status }), {
        status: response.status,
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
    console.error('[api/github-repos] Unhandled error:', error);
    return new Response(JSON.stringify({ error: error.message || 'Internal Server Error', status: 500 }), {
      status: 500,
      headers: { ...headers, 'Content-Type': 'application/json' },
    });
  }
}
