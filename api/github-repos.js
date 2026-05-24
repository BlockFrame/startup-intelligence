import { getPublicCorsHeaders } from './_cors.js';
import { readJsonFromUpstash, setCachedData } from './_upstash-json.js';

const GH = 'https://api.github.com';
const CACHE_VERSION = 'v2';
const TRENDING_TTL_SECONDS = 30 * 60;
const TRENDING_LAST_GOOD_TTL_SECONDS = 24 * 60 * 60;
const REPO_TTL_SECONDS = 6 * 60 * 60;
const REPO_LAST_GOOD_TTL_SECONDS = 7 * 24 * 60 * 60;
const SEARCH_TTL_SECONDS = 2 * 60 * 60;
const SEARCH_LAST_GOOD_TTL_SECONDS = 24 * 60 * 60;

function githubHeaders() {
  const h = { Accept: 'application/vnd.github.v3+json', 'User-Agent': 'StartupIntelligence/1.0' };
  if (process.env.GITHUB_TOKEN) h.Authorization = `token ${process.env.GITHUB_TOKEN}`;
  return h;
}

const timeoutPromise = (ms) => new Promise((_, reject) => setTimeout(() => reject(new Error('TimeoutError')), ms));

function cacheKeyFor(name) {
  return `github-repos:${CACHE_VERSION}:${name}`;
}

async function readCachedPayload(cacheKey) {
  return await readJsonFromUpstash(cacheKey, 1200);
}

async function writeCachedPayload(cacheKey, payload, ttlSeconds) {
  await setCachedData(cacheKey, {
    ...payload,
    cachedAt: new Date().toISOString(),
  }, ttlSeconds);
}

function cachedResponse(payload, headers, cacheStatus, cdnSeconds) {
  return new Response(JSON.stringify({ ...payload, cache: cacheStatus }), {
    status: 200,
    headers: {
      ...headers,
      'Content-Type': 'application/json',
      'Cache-Control': `public, max-age=60, s-maxage=${cdnSeconds}, stale-while-revalidate=${cdnSeconds}, stale-if-error=86400`,
      'CDN-Cache-Control': `public, s-maxage=${cdnSeconds}, stale-while-revalidate=${cdnSeconds}, stale-if-error=86400`,
      'X-Startup-Cache': cacheStatus,
    },
  });
}

function decodeHtml(text = '') {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

function stripTags(text = '') {
  return decodeHtml(text.replace(/<[^>]*>/g, ' '));
}

function parseCompactNumber(text = '') {
  const clean = text.replace(/,/g, '').trim().toLowerCase();
  const match = clean.match(/([\d.]+)\s*([km])?/);
  if (!match) return 0;
  const value = Number(match[1]);
  if (!Number.isFinite(value)) return 0;
  if (match[2] === 'm') return Math.round(value * 1_000_000);
  if (match[2] === 'k') return Math.round(value * 1_000);
  return Math.round(value);
}

function parseGithubTrending(html) {
  const today = new Date().toISOString();
  return html
    .split(/<article\b/i)
    .slice(1)
    .map((chunk, index) => {
      const href = chunk.match(/<h2[\s\S]*?<a[^>]+href="\/([^"]+)"[\s\S]*?<\/a>/i)?.[1]?.replace(/\s/g, '');
      if (!href || !/^[\w.-]+\/[\w.-]+$/.test(href)) return null;
      const description = stripTags(chunk.match(/<p[^>]*>([\s\S]*?)<\/p>/i)?.[1] || '');
      const language = stripTags(chunk.match(/itemprop="programmingLanguage"[^>]*>([\s\S]*?)<\/span>/i)?.[1] || '') || null;
      const starsText = stripTags(chunk.match(/href="\/[^"]+\/stargazers"[^>]*>([\s\S]*?)<\/a>/i)?.[1] || '');
      const forksText = stripTags(chunk.match(/href="\/[^"]+\/forks"[^>]*>([\s\S]*?)<\/a>/i)?.[1] || '');
      const starsTodayText = stripTags(chunk.match(/([\d,]+)\s+stars?\s+today/i)?.[0] || '');
      const fullName = href;
      const name = fullName.split('/')[1];
      return {
        full_name: fullName,
        owner: { login: fullName.split('/')[0] },
        name,
        description: description || null,
        topics: [],
        html_url: `https://github.com/${fullName}`,
        stargazers_count: parseCompactNumber(starsText),
        forks_count: parseCompactNumber(forksText),
        watchers_count: parseCompactNumber(starsText),
        language,
        created_at: today,
        updated_at: today,
        pushed_at: today,
        homepage: null,
        license: null,
        trendingRank: index + 1,
        starsToday: parseCompactNumber(starsTodayText),
        source: 'github-trending',
      };
    })
    .filter(Boolean)
    .slice(0, 25);
}

export default async function handler(req) {
  const headers = getPublicCorsHeaders('GET, OPTIONS');
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers });
  if (req.method !== 'GET') return new Response('Method not allowed', { status: 405, headers });

  try {
    const url = new URL(req.url);
    const repo = url.searchParams.get('repo');
    const search = url.searchParams.get('search');
    const isTrending = url.searchParams.get('trending') === '1';
    const trendingSince = url.searchParams.get('since') === 'weekly' ? 'weekly' : 'daily';

    let upstream = '';
    
    if (isTrending) {
      const cacheKey = cacheKeyFor(`trending:${trendingSince}`);
      const lastGoodKey = cacheKeyFor(`trending:${trendingSince}:last-good`);
      const cached = await readCachedPayload(cacheKey);
      if (cached?.items?.length) return cachedResponse(cached, headers, 'redis-hit', TRENDING_TTL_SECONDS);

      try {
        const trendingFetch = fetch(`https://github.com/trending?since=${trendingSince}`, {
          headers: {
            Accept: 'text/html',
            'User-Agent': 'StartupIntelligence/1.0',
          },
        });
        trendingFetch.catch(() => {});
        const trendingRes = await Promise.race([trendingFetch, timeoutPromise(8000)]);
        if (trendingRes.ok) {
          const html = await trendingRes.text();
          const items = parseGithubTrending(html);
          if (items.length > 0) {
            const payload = { items, isFallback: false, source: 'github-trending-live', since: trendingSince };
            await Promise.all([
              writeCachedPayload(cacheKey, payload, TRENDING_TTL_SECONDS),
              writeCachedPayload(lastGoodKey, payload, TRENDING_LAST_GOOD_TTL_SECONDS),
            ]);
            return cachedResponse(payload, headers, 'live-refresh', TRENDING_TTL_SECONDS);
          }
        }
      } catch {
        // Fall back to curated bootstrap below when GitHub Trending blocks or times out.
      }

      const lastGood = await readCachedPayload(lastGoodKey);
      if (lastGood?.items?.length) return cachedResponse(lastGood, headers, 'last-good', TRENDING_TTL_SECONDS);

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

        const payload = { items: fallbackItems, isFallback: true, source: 'curated-bootstrap-fallback' };
        await writeCachedPayload(cacheKey, payload, TRENDING_TTL_SECONDS);
        return cachedResponse(payload, headers, 'fallback', TRENDING_TTL_SECONDS);
      } catch (err) {
        return cachedResponse({ items: [], error: err.message || 'TimeoutError' }, headers, 'miss-error', 60);
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

    const cacheName = repo
      ? `repo:${repo.toLowerCase()}`
      : `search:${search}:${url.searchParams.get('sort') || 'stars'}:${url.searchParams.get('order') || 'desc'}:${url.searchParams.get('per_page') || 20}`;
    const cacheKey = cacheKeyFor(cacheName);
    const lastGoodKey = cacheKeyFor(`${cacheName}:last-good`);
    const ttl = repo ? REPO_TTL_SECONDS : SEARCH_TTL_SECONDS;
    const lastGoodTtl = repo ? REPO_LAST_GOOD_TTL_SECONDS : SEARCH_LAST_GOOD_TTL_SECONDS;
    const cached = await readCachedPayload(cacheKey);
    if (cached && (cached.repo || cached.items)) return cachedResponse(cached, headers, 'redis-hit', ttl);

    const fetchPromise = fetch(upstream, { headers: githubHeaders() });
    fetchPromise.catch(() => {}); // Prevent unhandled rejection
    
    const response = await Promise.race([
      fetchPromise,
      timeoutPromise(8000)
    ]);
    
    if (!response.ok) {
      const errText = await response.text();
      const lastGood = await readCachedPayload(lastGoodKey);
      if (lastGood && (lastGood.repo || lastGood.items)) return cachedResponse(lastGood, headers, 'last-good', ttl);
      return new Response(JSON.stringify({ error: 'GitHub API Error', details: errText, status: response.status }), {
        status: response.status,
        headers: { ...headers, 'Content-Type': 'application/json' },
      });
    }

    const json = await response.json();
    const payload = repo ? { repo: json, source: 'github-api-live' } : { ...json, source: 'github-api-live' };
    await Promise.all([
      writeCachedPayload(cacheKey, payload, ttl),
      writeCachedPayload(lastGoodKey, payload, lastGoodTtl),
    ]);
    return cachedResponse(payload, headers, 'live-refresh', ttl);
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message || 'TimeoutError' }), {
      status: 200,
      headers: { ...headers, 'Content-Type': 'application/json' },
    });
  }
}
