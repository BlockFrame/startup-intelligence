import { getPublicCorsHeaders } from './_cors.js';

const ALLOWED_SORT_BY = new Set(['relevance', 'lastUpdatedDate', 'submittedDate']);

export default async function handler(req) {
  const headers = getPublicCorsHeaders('GET, OPTIONS');
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers });
  if (req.method !== 'GET') {
    return new Response('Method not allowed', { status: 405, headers });
  }

  const inputUrl = new URL(req.url);
  const upstream = new URL('https://export.arxiv.org/api/query');
  const searchQuery = inputUrl.searchParams.get('search_query');
  if (!searchQuery || searchQuery.length > 1200) {
    return new Response('Missing or invalid search_query', { status: 400, headers });
  }

  upstream.searchParams.set('search_query', searchQuery);
  upstream.searchParams.set('start', inputUrl.searchParams.get('start') || '0');
  upstream.searchParams.set('max_results', inputUrl.searchParams.get('max_results') || '40');

  const sortBy = inputUrl.searchParams.get('sortBy') || 'submittedDate';
  upstream.searchParams.set('sortBy', ALLOWED_SORT_BY.has(sortBy) ? sortBy : 'submittedDate');
  upstream.searchParams.set('sortOrder', inputUrl.searchParams.get('sortOrder') === 'ascending' ? 'ascending' : 'descending');

  const response = await fetch(upstream, {
    headers: {
      Accept: 'application/atom+xml, application/xml, text/xml',
      'User-Agent': 'StartupIntelligence/1.0 (arXiv dashboard; contact: local-dev)',
    },
  });

  const body = await response.text();
  return new Response(body, {
    status: response.status,
    headers: {
      ...headers,
      'Content-Type': response.headers.get('content-type') || 'application/atom+xml; charset=utf-8',
      'Cache-Control': 'public, max-age=900, s-maxage=1800',
    },
  });
}
