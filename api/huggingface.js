import { getPublicCorsHeaders } from './_cors.js';

const HF = 'https://huggingface.co/api';
const HF_SITE = 'https://huggingface.co';

function decodeHtmlEntities(value) {
  return String(value || '')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

export function extractTrendingPapersFromHtml(html) {
  const match = String(html || '').match(/data-target="DailyPapers"\s+data-props="([^"]+)"/);
  if (!match) return [];
  try {
    const props = JSON.parse(decodeHtmlEntities(match[1]));
    return Array.isArray(props.dailyPapers) ? props.dailyPapers : [];
  } catch {
    return [];
  }
}

function pathFor(type, id, search, limit) {
  const encodedId = id ? encodeURIComponent(id).replace(/%2F/g, '/') : '';
  if (type === 'papers') {
    if (id) return `${HF}/papers/${encodedId}`;
    const params = new URLSearchParams({ limit: String(limit) });
    if (search) params.set('q', search);
    return search ? `${HF}/papers?${params}` : `${HF}/daily_papers?${params}`;
  }
  if (id) {
    if (type === 'datasets') return `${HF}/datasets/${encodedId}`;
    if (type === 'spaces') return `${HF}/spaces/${encodedId}`;
    if (type === 'models') return `${HF}/models/${encodedId}`;
  }
  const params = new URLSearchParams({ limit: String(limit), full: 'true' });
  if (search) params.set('search', search);
  if (type === 'datasets') return `${HF}/datasets?${params}`;
  if (type === 'spaces') return `${HF}/spaces?${params}`;
  if (type === 'models') return `${HF}/models?${params}`;
  return '';
}

const timeoutPromise = (ms) => new Promise((_, reject) => setTimeout(() => reject(new Error('TimeoutError')), ms));

export default async function handler(req) {
  const headers = getPublicCorsHeaders('GET, OPTIONS');
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers });
  if (req.method !== 'GET') return new Response('Method not allowed', { status: 405, headers });

  const url = new URL(req.url);
  const type = url.searchParams.get('type') || 'models';
  const id = url.searchParams.get('id');
  const search = url.searchParams.get('search');
  const source = url.searchParams.get('source');
  const limit = Math.min(Math.max(Number(url.searchParams.get('limit') || 20), 1), 50);
  if (!['models', 'datasets', 'spaces', 'papers', 'collections'].includes(type)) return new Response('Invalid type', { status: 400, headers });
  if (type === 'collections') {
    return new Response(JSON.stringify({ items: [] }), { status: 200, headers: { ...headers, 'Content-Type': 'application/json' } });
  }

  try {
    if (type === 'papers' && source === 'trending' && !id && !search) {
      const fetchPromise = fetch(`${HF_SITE}/papers/trending`, { headers: { Accept: 'text/html', 'User-Agent': 'StartupIntelligence/1.0' } });
      fetchPromise.catch(() => {});
      
      const response = await Promise.race([
        fetchPromise,
        timeoutPromise(8000)
      ]);
      
      const html = await response.text();
      const items = extractTrendingPapersFromHtml(html).slice(0, limit).map((item) => ({ ...item, entityType: 'papers', source: 'trending' }));
      return new Response(JSON.stringify({ items }), {
        status: response.status,
        headers: { ...headers, 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=900, s-maxage=1800' },
      });
    }
    
    const upstream = pathFor(type, id, search, limit);
    const fetchPromise = fetch(upstream, { headers: { Accept: 'application/json', 'User-Agent': 'StartupIntelligence/1.0' } });
    fetchPromise.catch(() => {});
    
    const response = await Promise.race([
      fetchPromise,
      timeoutPromise(8000)
    ]);
    
    const json = await response.json();
    const items = Array.isArray(json) ? json.map((item) => ({ ...item, entityType: type })) : [{ ...json, entityType: type }];
    return new Response(JSON.stringify({ items }), {
      status: response.status,
      headers: { ...headers, 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=900, s-maxage=1800' },
    });
  } catch (error) {
    console.error(`[api/huggingface] Error fetching ${type}:`, error);
    return new Response(JSON.stringify({ items: [], error: error.message || 'TimeoutError' }), {
      status: 200,
      headers: { ...headers, 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=300, s-maxage=600' },
    });
  }
}
