import curatedFallback from '@/config/github-curated-fallback.json';
import { escapeHtml } from '@/utils/sanitize';

type AdminRepo = {
  full_name: string;
  status?: string;
  sort_order?: number;
  description?: string | null;
  html_url?: string;
  stargazers_count?: number;
  forks_count?: number;
  watchers_count?: number;
  language?: string | null;
  topics?: string[];
  created_at?: string;
  updated_at?: string;
  pushed_at?: string;
  homepage?: string | null;
  license?: unknown;
  owner?: { login?: string };
  name?: string;
};

const SECRET_KEY = 'si-admin-relay-secret';

function normalizeRepo(repo: Partial<AdminRepo>, index: number): AdminRepo {
  const fullName = String(repo.full_name || '').trim();
  const [owner, name] = fullName.split('/');
  const now = new Date().toISOString();
  return {
    full_name: fullName,
    status: repo.status || 'master',
    sort_order: Number.isFinite(Number(repo.sort_order)) ? Number(repo.sort_order) : index + 1,
    owner: { login: repo.owner?.login || owner || '' },
    name: repo.name || name || fullName,
    description: repo.description || '',
    topics: Array.isArray(repo.topics) ? repo.topics : [],
    html_url: repo.html_url || (fullName ? `https://github.com/${fullName}` : ''),
    stargazers_count: Number(repo.stargazers_count || 0),
    forks_count: Number(repo.forks_count || 0),
    watchers_count: Number(repo.watchers_count || repo.stargazers_count || 0),
    language: repo.language || null,
    created_at: repo.created_at || now,
    updated_at: repo.updated_at || now,
    pushed_at: repo.pushed_at || repo.updated_at || now,
    homepage: repo.homepage || null,
    license: repo.license || null,
  };
}

export function initGithubMasterAdminWindow(): void {
  let repos: AdminRepo[] = [];
  let secret = localStorage.getItem(SECRET_KEY) || '';
  let message = '';
  const root = document.getElementById('app') || document.body;

  const setMessage = (next: string): void => {
    message = next;
    render();
  };

  const loadFromApi = async (): Promise<void> => {
    try {
      const response = await fetch('/api/github-master-repos');
      const payload = await response.json();
      repos = (payload.items?.length ? payload.items : curatedFallback as AdminRepo[]).map(normalizeRepo);
      setMessage(payload.items?.length ? `Loaded ${repos.length} repos from ${payload.source || 'Supabase'}.` : `Supabase empty/unavailable. Loaded ${repos.length} fallback repos.`);
    } catch {
      repos = (curatedFallback as AdminRepo[]).map(normalizeRepo);
      setMessage(`API unavailable. Loaded ${repos.length} fallback repos.`);
    }
  };

  const saveToApi = async (): Promise<void> => {
    secret = (root.querySelector<HTMLInputElement>('#adminSecret')?.value || '').trim();
    localStorage.setItem(SECRET_KEY, secret);
    const items = readRows();
    if (!secret) {
      setMessage('Missing admin secret.');
      return;
    }
    const response = await fetch('/api/github-master-repos', {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${secret}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ items }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload.error) {
      setMessage(`Save failed: ${payload.error || response.statusText}`);
      return;
    }
    repos = items;
    setMessage(`Saved ${payload.updated ?? items.length} repos.`);
  };

  const readRows = (): AdminRepo[] => {
    return Array.from(root.querySelectorAll<HTMLElement>('[data-admin-repo-row]')).map((row, index) => normalizeRepo({
      full_name: row.querySelector<HTMLInputElement>('[data-field="full_name"]')?.value || '',
      status: row.querySelector<HTMLSelectElement>('[data-field="status"]')?.value || 'master',
      sort_order: Number(row.querySelector<HTMLInputElement>('[data-field="sort_order"]')?.value || index + 1),
      description: row.querySelector<HTMLInputElement>('[data-field="description"]')?.value || '',
      language: row.querySelector<HTMLInputElement>('[data-field="language"]')?.value || null,
      stargazers_count: Number(row.querySelector<HTMLInputElement>('[data-field="stars"]')?.value || 0),
    }, index)).filter((repo) => /^[\w.-]+\/[\w.-]+$/.test(repo.full_name));
  };

  const addRepo = (): void => {
    repos = readRows();
    repos.unshift(normalizeRepo({ full_name: 'owner/repo', description: '', sort_order: 1 }, 0));
    repos = repos.map((repo, index) => ({ ...repo, sort_order: index + 1 }));
    render();
  };

  const loadFallback = (): void => {
    repos = (curatedFallback as AdminRepo[]).map(normalizeRepo);
    setMessage(`Loaded ${repos.length} repos from fallback JSON. Save to copy them into Supabase.`);
  };

  const renderRows = (): string => repos.map((repo, index) => `
    <tr data-admin-repo-row>
      <td><input data-field="sort_order" type="number" value="${Number(repo.sort_order || index + 1)}"></td>
      <td><input data-field="full_name" value="${escapeHtml(repo.full_name)}" spellcheck="false"></td>
      <td><input data-field="description" value="${escapeHtml(repo.description || '')}"></td>
      <td><input data-field="language" value="${escapeHtml(repo.language || '')}"></td>
      <td><input data-field="stars" type="number" value="${Number(repo.stargazers_count || 0)}"></td>
      <td>
        <select data-field="status">
          <option value="master"${repo.status !== 'archived' ? ' selected' : ''}>master</option>
          <option value="archived"${repo.status === 'archived' ? ' selected' : ''}>archived</option>
        </select>
      </td>
      <td><button data-admin-delete="${index}">Archive</button></td>
    </tr>
  `).join('');

  const render = (): void => {
    document.title = 'Admin - GitHub Master Repos';
    root.innerHTML = `
      <main class="admin-master-page">
        <header class="admin-master-header">
          <div>
            <p>Startup Intelligence Admin</p>
            <h1>GitHub Master Repos</h1>
            <span>Manual curated source for the GitHub Repo page. Public users read this through Supabase with JSON fallback.</span>
          </div>
          <a href="/" class="admin-master-back">Back to app</a>
        </header>
        <section class="admin-master-toolbar">
          <label>Admin secret<input id="adminSecret" type="password" value="${escapeHtml(secret)}" placeholder="RELAY_SHARED_SECRET"></label>
          <button id="adminReload">Reload</button>
          <button id="adminFallback">Load fallback JSON</button>
          <button id="adminAdd">Add repo</button>
          <button id="adminSave" class="primary">Save to Supabase</button>
        </section>
        ${message ? `<div class="admin-master-message">${escapeHtml(message)}</div>` : ''}
        <section class="admin-master-table-wrap">
          <table class="admin-master-table">
            <thead><tr><th>Order</th><th>Repo</th><th>Description</th><th>Language</th><th>Stars</th><th>Status</th><th></th></tr></thead>
            <tbody>${renderRows()}</tbody>
          </table>
        </section>
      </main>`;

    root.querySelector<HTMLButtonElement>('#adminReload')?.addEventListener('click', () => void loadFromApi());
    root.querySelector<HTMLButtonElement>('#adminFallback')?.addEventListener('click', loadFallback);
    root.querySelector<HTMLButtonElement>('#adminAdd')?.addEventListener('click', addRepo);
    root.querySelector<HTMLButtonElement>('#adminSave')?.addEventListener('click', () => void saveToApi());
    root.querySelectorAll<HTMLButtonElement>('[data-admin-delete]').forEach((button) => {
      button.addEventListener('click', () => {
        repos = readRows();
        const index = Number(button.dataset.adminDelete);
        if (repos[index]) repos[index].status = 'archived';
        render();
      });
    });
  };

  render();
  void loadFromApi();
}
