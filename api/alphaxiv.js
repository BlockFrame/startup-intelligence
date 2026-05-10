import { getPublicCorsHeaders } from './_cors.js';

const ALPHAXIV_URL = 'https://www.alphaxiv.org/';

function textBetween(value, start, end) {
  const i = value.indexOf(start);
  if (i < 0) return '';
  const j = value.indexOf(end, i + start.length);
  if (j < 0) return '';
  return value.slice(i + start.length, j);
}

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

function extractAlphaXivItems(html, limit) {
  const ids = new Map();
  const hrefMatches = html.matchAll(/href=["']\/(?:abs\/)?(\d{4}\.\d{4,6})(?:v\d+)?["'][^>]*>([\s\S]{0,240}?)<\/a>/g);
  for (const match of hrefMatches) {
    const id = match[1];
    if (!id || ids.has(id)) continue;
    const title = decodeHtml(String(match[2] || '').replace(/<[^>]+>/g, ''));
    ids.set(id, { id, title });
    if (ids.size >= limit) break;
  }

  if (ids.size < limit) {
    for (const match of html.matchAll(/\b(\d{4}\.\d{4,6})(?:v\d+)?\b/g)) {
      const id = match[1];
      if (!id || ids.has(id)) continue;
      const context = html.slice(Math.max(0, match.index - 360), Math.min(html.length, match.index + 360));
      const title =
        decodeHtml(textBetween(context, '<title>', '</title>').replace(/\s*\|\s*alphaXiv.*$/i, ''))
        || decodeHtml((context.match(/<h[1-3][^>]*>([\s\S]*?)<\/h[1-3]>/i)?.[1] || '').replace(/<[^>]+>/g, ''));
      ids.set(id, { id, title });
      if (ids.size >= limit) break;
    }
  }

  return Array.from(ids.values()).slice(0, limit).map((item, index) => ({
    ...item,
    rank: index + 1,
    source: 'alphaxiv',
    url: `https://www.alphaxiv.org/abs/${item.id}`,
  }));
}

const timeoutPromise = (ms) => new Promise((_, reject) => setTimeout(() => reject(new Error('TimeoutError')), ms));

export default async function handler(req) {
  const headers = getPublicCorsHeaders('GET, OPTIONS');
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers });
  if (req.method !== 'GET') return new Response('Method not allowed', { status: 405, headers });

  const url = new URL(req.url);
  const limit = Math.min(Math.max(Number(url.searchParams.get('limit') || 30), 1), 50);

  try {
    const response = await Promise.race([
      fetch(ALPHAXIV_URL, {
        headers: {
          Accept: 'text/html,application/xhtml+xml',
          'User-Agent': 'StartupIntelligence/1.0 (alphaxiv trending papers)',
        }
      }),
      timeoutPromise(8000)
    ]);
    const html = await response.text();
    const items = response.ok ? extractAlphaXivItems(html, limit) : [];
    return new Response(JSON.stringify({ items, fetchedAt: new Date().toISOString() }), {
      status: 200,
      headers: { ...headers, 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=900, s-maxage=1800' },
    });
  } catch (error) {
    return new Response(JSON.stringify({ items: [], error: error instanceof Error ? error.message : String(error), fetchedAt: new Date().toISOString() }), {
      status: 200,
      headers: { ...headers, 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=300, s-maxage=600' },
    });
  }
}
