import { getPublicCorsHeaders } from './_cors.js';

const HF = 'https://huggingface.co/api';

function pathFor(type, id, search, limit) {
  const encodedId = id ? encodeURIComponent(id).replace(/%2F/g, '/') : '';
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

export default async function handler(req) {
  const headers = getPublicCorsHeaders('GET, OPTIONS');
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers });
  if (req.method !== 'GET') return new Response('Method not allowed', { status: 405, headers });

  const url = new URL(req.url);
  const type = url.searchParams.get('type') || 'models';
  const id = url.searchParams.get('id');
  const search = url.searchParams.get('search');
  const limit = Math.min(Math.max(Number(url.searchParams.get('limit') || 20), 1), 50);
  if (!['models', 'datasets', 'spaces', 'papers', 'collections'].includes(type)) return new Response('Invalid type', { status: 400, headers });
  if (type === 'papers' || type === 'collections') {
    return new Response(JSON.stringify({ items: [] }), { status: 200, headers: { ...headers, 'Content-Type': 'application/json' } });
  }
  const upstream = pathFor(type, id, search, limit);
  const response = await fetch(upstream, { headers: { Accept: 'application/json', 'User-Agent': 'StartupIntelligence/1.0' } });
  const json = await response.json();
  const items = Array.isArray(json) ? json.map((item) => ({ ...item, entityType: type })) : [{ ...json, entityType: type }];
  return new Response(JSON.stringify({ items }), {
    status: response.status,
    headers: { ...headers, 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=900, s-maxage=1800' },
  });
}
