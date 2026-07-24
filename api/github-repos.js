import { getPublicCorsHeaders } from './_cors.js';
import {
  GITHUB_TRENDING_HEADERS,
  GITHUB_TRENDING_URL,
  parseGithubTrending,
} from './_github-trending.js';
import { readJsonFromUpstash, setCachedData } from './_upstash-json.js';

const GH = 'https://api.github.com';
const CACHE_VERSION = 'v3-trending-direct';
const TRENDING_TTL_SECONDS = 30 * 60;
const REPO_TTL_SECONDS = 6 * 60 * 60;
const REPO_LAST_GOOD_TTL_SECONDS = 7 * 24 * 60 * 60;
const SEARCH_TTL_SECONDS = 2 * 60 * 60;
const SEARCH_LAST_GOOD_TTL_SECONDS = 24 * 60 * 60;
export { parseGithubTrending };

function githubHeaders() {
  const h = { Accept: 'application/vnd.github.v3+json', 'User-Agent': 'StartupIntelligence/1.0' };
  if (process.env.GITHUB_TOKEN) h.Authorization = `token ${process.env.GITHUB_TOKEN}`;
  return h;
}

function withTimeout(promise, ms, message = 'TimeoutError') {
  let timeoutId;
  const timeout = new Promise((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(message)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timeoutId));
}

function cacheKeyFor(name) {
  return `github-repos:${CACHE_VERSION}:${name}`;
}

async function readCachedPayload(cacheKey) {
  try {
    return await withTimeout(readJsonFromUpstash(cacheKey, 1200), 1_500, 'Redis cache read timed out');
  } catch {
    // Redis is an optional cache. Never let an unavailable cache block live
    // GitHub Trending results.
    return null;
  }
}

async function writeCachedPayload(cacheKey, payload, ttlSeconds) {
  try {
    await withTimeout(setCachedData(cacheKey, {
      ...payload,
      cachedAt: new Date().toISOString(),
    }, ttlSeconds), 1_500, 'Redis cache write timed out');
  } catch {
    // A failed cache write must not turn a successful upstream response into
    // a client timeout.
  }
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
      let liveError = 'GitHub Trending returned no repositories';
      try {
        const sourceUrl = `${GITHUB_TRENDING_URL}?since=${trendingSince}`;
        const trendingRes = await withTimeout(fetch(sourceUrl, {
          headers: GITHUB_TRENDING_HEADERS,
        }), 8_000, 'GitHub Trending request timed out');
        if (trendingRes.ok) {
          const html = await withTimeout(trendingRes.text(), 4_000, 'GitHub Trending response timed out');
          const items = parseGithubTrending(html);
          if (items.length > 0) {
            const payload = {
              items,
              isFallback: false,
              source: 'github-trending-live',
              sourceUrl,
              since: trendingSince,
            };
            // Trending is public and already cached at Vercel's CDN. Do not
            // depend on Upstash here: an unhealthy Redis connection must
            // never prevent the dashboard from receiving live GitHub data.
            return cachedResponse(payload, headers, 'cdn-refresh', TRENDING_TTL_SECONDS);
          }
          liveError = 'GitHub Trending HTML contained no recognizable repositories';
        } else {
          liveError = `GitHub Trending returned HTTP ${trendingRes.status}`;
        }
      } catch (error) {
        liveError = error?.message || 'GitHub Trending request failed';
      }

      return new Response(JSON.stringify({
        items: [],
        error: liveError,
        source: 'github-trending',
        sourceUrl: `${GITHUB_TRENDING_URL}?since=${trendingSince}`,
      }), {
        status: 502,
        headers: {
          ...headers,
          'Content-Type': 'application/json',
          'Cache-Control': 'no-store',
          'X-Startup-Cache': 'miss-error',
        },
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

    const cacheName = repo
      ? `repo:${repo.toLowerCase()}`
      : `search:${search}:${url.searchParams.get('sort') || 'stars'}:${url.searchParams.get('order') || 'desc'}:${url.searchParams.get('per_page') || 20}`;
    const cacheKey = cacheKeyFor(cacheName);
    const lastGoodKey = cacheKeyFor(`${cacheName}:last-good`);
    const ttl = repo ? REPO_TTL_SECONDS : SEARCH_TTL_SECONDS;
    const lastGoodTtl = repo ? REPO_LAST_GOOD_TTL_SECONDS : SEARCH_LAST_GOOD_TTL_SECONDS;
    const cached = await readCachedPayload(cacheKey);
    if (cached && (cached.repo || cached.items)) return cachedResponse(cached, headers, 'redis-hit', ttl);

    const response = await withTimeout(
      fetch(upstream, { headers: githubHeaders() }),
      8_000,
      'GitHub API request timed out',
    );
    
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
