import { getPublicCorsHeaders } from './_cors.js';

const ALLOWED_SORT_BY = new Set(['relevance', 'lastUpdatedDate', 'submittedDate']);
const timeoutPromise = (ms) => new Promise((_, reject) => setTimeout(() => reject(new Error('TimeoutError')), ms));

export default async function handler(req) {
  const headers = getPublicCorsHeaders('GET, OPTIONS');
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers });
  if (req.method !== 'GET') {
    return new Response('Method not allowed', { status: 405, headers });
  }

  try {
    const inputUrl = new URL(req.url);
    const upstream = new URL('https://export.arxiv.org/api/query');
    const searchQuery = inputUrl.searchParams.get('search_query');
    const idList = inputUrl.searchParams.get('id_list');
    
    if ((!searchQuery || searchQuery.length > 1200) && (!idList || idList.length > 1200)) {
      return new Response('Missing or invalid search_query/id_list', { status: 400, headers });
    }

    if (searchQuery) upstream.searchParams.set('search_query', searchQuery);
    if (idList) upstream.searchParams.set('id_list', idList);
    upstream.searchParams.set('start', inputUrl.searchParams.get('start') || '0');
    upstream.searchParams.set('max_results', inputUrl.searchParams.get('max_results') || '40');

    const sortBy = inputUrl.searchParams.get('sortBy') || 'submittedDate';
    upstream.searchParams.set('sortBy', ALLOWED_SORT_BY.has(sortBy) ? sortBy : 'submittedDate');
    upstream.searchParams.set('sortOrder', inputUrl.searchParams.get('sortOrder') === 'ascending' ? 'ascending' : 'descending');

    console.log(`[api/arxiv] Fetching: ${upstream.toString()}`);
    
    const fetchPromise = fetch(upstream, {
      headers: {
        Accept: 'application/atom+xml, application/xml, text/xml',
        'User-Agent': 'StartupIntelligence/1.0 (arXiv dashboard; contact: local-dev)',
      }
    });
    fetchPromise.catch(() => {});
    
    const response = await Promise.race([
      fetchPromise,
      timeoutPromise(8000)
    ]);

    if (!response.ok) {
      const err = await response.text();
      console.error(`[api/arxiv] Upstream error ${response.status}:`, err);
      return new Response(err, { status: response.status, headers });
    }

    const body = await response.text();
    return new Response(body, {
      status: 200,
      headers: {
        ...headers,
        'Content-Type': response.headers.get('content-type') || 'application/atom+xml; charset=utf-8',
        'Cache-Control': 'public, max-age=900, s-maxage=1800',
      },
    });
  } catch (error) {
    console.error('[api/arxiv] Proxy error:', error.message);
    return new Response(JSON.stringify({ error: error.message || 'TimeoutError' }), { 
      status: 200, 
      headers: { ...headers, 'Content-Type': 'application/json' } 
    });
  }
}
