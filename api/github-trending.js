import { getPublicCorsHeaders } from './_cors.js';
import {
  GITHUB_TRENDING_HEADERS,
  GITHUB_TRENDING_URL,
  parseGithubTrending,
} from './_github-trending.js';

const CDN_TTL_SECONDS = 30 * 60;

function withTimeout(promise, ms, message) {
  let timeoutId;
  const timeout = new Promise((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(message)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timeoutId));
}

export default async function handler(req) {
  const headers = getPublicCorsHeaders('GET, OPTIONS');
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers });
  if (req.method !== 'GET') return new Response('Method not allowed', { status: 405, headers });

  const url = new URL(req.url);
  const since = url.searchParams.get('since') === 'weekly' ? 'weekly' : 'daily';
  const sourceUrl = `${GITHUB_TRENDING_URL}?since=${since}`;

  try {
    const upstream = await withTimeout(fetch(sourceUrl, {
      headers: GITHUB_TRENDING_HEADERS,
    }), 8_000, 'GitHub Trending request timed out');

    if (!upstream.ok) {
      throw new Error(`GitHub Trending returned HTTP ${upstream.status}`);
    }

    const html = await withTimeout(
      upstream.text(),
      4_000,
      'GitHub Trending response timed out',
    );
    const items = parseGithubTrending(html);
    if (items.length === 0) {
      throw new Error('GitHub Trending HTML contained no recognizable repositories');
    }

    return new Response(JSON.stringify({
      items,
      isFallback: false,
      source: 'github-trending-live',
      sourceUrl,
      since,
      cache: 'cdn-refresh',
    }), {
      status: 200,
      headers: {
        ...headers,
        'Content-Type': 'application/json',
        'Cache-Control': `public, max-age=60, s-maxage=${CDN_TTL_SECONDS}, stale-while-revalidate=${CDN_TTL_SECONDS}, stale-if-error=86400`,
        'CDN-Cache-Control': `public, s-maxage=${CDN_TTL_SECONDS}, stale-while-revalidate=${CDN_TTL_SECONDS}, stale-if-error=86400`,
        'X-Startup-Cache': 'cdn-refresh',
      },
    });
  } catch (error) {
    return new Response(JSON.stringify({
      items: [],
      error: error?.message || 'GitHub Trending request failed',
      source: 'github-trending',
      sourceUrl,
    }), {
      status: 502,
      headers: {
        ...headers,
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
      },
    });
  }
}
