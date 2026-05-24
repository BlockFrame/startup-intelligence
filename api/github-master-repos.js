import { getPublicCorsHeaders } from './_cors.js';

export const config = { runtime: 'edge' };

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const TABLE = process.env.SUPABASE_GITHUB_MASTER_REPOS_TABLE || 'github_master_repos';
const RELAY_SECRET = process.env.RELAY_SHARED_SECRET || '';

function json(body, status, headers) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...headers,
      'Content-Type': 'application/json',
      'Cache-Control': status === 200 ? 'public, max-age=60, s-maxage=900, stale-while-revalidate=900, stale-if-error=86400' : 'no-cache',
    },
  });
}

function supabaseHeaders(prefer) {
  return {
    apikey: SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    'Content-Type': 'application/json',
    ...(prefer ? { Prefer: prefer } : {}),
  };
}

function isValidRepoName(fullName) {
  return typeof fullName === 'string' && /^[\w.-]+\/[\w.-]+$/.test(fullName);
}

function normalizeRepoForSupabase(repo, index) {
  if (!repo || !isValidRepoName(repo.full_name)) return null;
  const now = new Date().toISOString();
  const owner = repo.owner?.login || repo.full_name.split('/')[0];
  const name = repo.name || repo.full_name.split('/')[1];
  return {
    full_name: repo.full_name,
    status: repo.status || 'master',
    sort_order: Number.isFinite(Number(repo.sort_order)) ? Number(repo.sort_order) : index + 1,
    repo_json: {
      full_name: repo.full_name,
      owner: { login: owner },
      name,
      description: repo.description || null,
      topics: Array.isArray(repo.topics) ? repo.topics : [],
      html_url: repo.html_url || `https://github.com/${repo.full_name}`,
      stargazers_count: Number(repo.stargazers_count || 0),
      forks_count: Number(repo.forks_count || 0),
      watchers_count: Number(repo.watchers_count || repo.stargazers_count || 0),
      language: repo.language || null,
      created_at: repo.created_at || now,
      updated_at: repo.updated_at || now,
      pushed_at: repo.pushed_at || repo.updated_at || now,
      homepage: repo.homepage || null,
      license: repo.license || null,
    },
  };
}

async function fetchMasterRepos() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return { items: [], source: 'supabase-not-configured' };
  const url = `${SUPABASE_URL.replace(/\/$/, '')}/rest/v1/${encodeURIComponent(TABLE)}?select=full_name,status,sort_order,repo_json,updated_at&status=eq.master&order=sort_order.asc`;
  const response = await fetch(url, {
    headers: supabaseHeaders(),
    signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) throw new Error(`Supabase HTTP ${response.status}`);
  const rows = await response.json();
  const items = Array.isArray(rows) ? rows.map((row) => row.repo_json).filter(Boolean) : [];
  return { items, source: 'supabase', fetchedAt: new Date().toISOString() };
}

async function upsertMasterRepos(items) {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) throw new Error('Supabase not configured');
  const rows = items.map(normalizeRepoForSupabase).filter(Boolean);
  if (rows.length === 0) throw new Error('No valid repositories');
  const url = `${SUPABASE_URL.replace(/\/$/, '')}/rest/v1/${encodeURIComponent(TABLE)}?on_conflict=full_name`;
  const response = await fetch(url, {
    method: 'POST',
    headers: supabaseHeaders('resolution=merge-duplicates,return=representation'),
    body: JSON.stringify(rows),
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) throw new Error(`Supabase HTTP ${response.status}: ${await response.text()}`);
  const rowsWritten = await response.json();
  return { updated: Array.isArray(rowsWritten) ? rowsWritten.length : rows.length };
}

export default async function handler(req) {
  const headers = getPublicCorsHeaders('GET, PUT, OPTIONS');
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers });

  if (req.method === 'GET') {
    try {
      return json(await fetchMasterRepos(), 200, headers);
    } catch (error) {
      return json({ items: [], source: 'supabase-error', error: error instanceof Error ? error.message : 'Unknown error' }, 200, headers);
    }
  }

  if (req.method === 'PUT') {
    const authHeader = req.headers.get('Authorization') || '';
    if (!RELAY_SECRET || authHeader !== `Bearer ${RELAY_SECRET}`) {
      return json({ error: 'Unauthorized' }, 401, headers);
    }
    try {
      const body = await req.json();
      const items = Array.isArray(body?.items) ? body.items : [];
      return json(await upsertMasterRepos(items), 200, headers);
    } catch (error) {
      return json({ error: error instanceof Error ? error.message : 'Unable to update master repositories' }, 400, headers);
    }
  }

  return json({ error: 'Method not allowed' }, 405, headers);
}
