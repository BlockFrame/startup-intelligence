import type { GithubEnrichedRepo, GithubPopularityBucket, GithubRepoType, GithubThemeTag, GithubUpdatedWindow } from '@/types/github-repos';
import { escapeHtml } from '@/utils/sanitize';
import { fetchGithubRepoDashboardData, loadStoredGithubRepoDashboardData } from '@/services/github-repos/fetcher';
import { intelligenceClusterViews, type IntelligenceClusterId } from '@/config/intelligence-clusters';

const views = intelligenceClusterViews;

interface Filters {
  view: IntelligenceClusterId;
  query: string;
  theme: string;
  repoType: string;
  language: string;
  updatedWindow: GithubUpdatedWindow;
  popularityBucket: GithubPopularityBucket;
  hasPaper: boolean;
  hasDataset: boolean;
  hasBenchmark: boolean;
  hasMcp: boolean;
  lane: string;
}

const defaults: Filters = {
  view: 'all',
  query: '',
  theme: '',
  repoType: '',
  language: '',
  updatedWindow: 'any',
  popularityBucket: 'all',
  hasPaper: false,
  hasDataset: false,
  hasBenchmark: false,
  hasMcp: false,
  lane: '',
};

const label = (s: string) => s.replace(/_/g, ' ');
const uniq = (items: string[]) => Array.from(new Set(items)).sort();

export class GithubReposDashboard {
  private container: HTMLElement;
  private repos: GithubEnrichedRepo[] = [];
  private filters: Filters = { ...defaults };
  private loading = false;
  private error = '';
  private fetchedAt = '';

  constructor(container: HTMLElement) {
    this.container = container;
    const stored = loadStoredGithubRepoDashboardData();
    this.repos = stored.repos;
    this.fetchedAt = stored.fetchedAt;
    this.render();
    this.bind();
    if (this.repos.length === 0) void this.refresh();
  }

  async refresh(): Promise<void> {
    this.loading = true;
    this.error = '';
    this.render();
    this.bind();
    try {
      const state = await fetchGithubRepoDashboardData(this.filters.view);
      this.repos = state.repos;
      this.fetchedAt = state.fetchedAt;
    } catch (error) {
      this.error = error instanceof Error ? error.message : 'Unable to fetch GitHub repositories';
    } finally {
      this.loading = false;
      this.render();
      this.bind();
    }
  }

  private filtered(): GithubEnrichedRepo[] {
    const view = views.find((v) => v.id === this.filters.view);
    const q = this.filters.query.trim().toLowerCase();
    const minStars = this.filters.popularityBucket === '50k' ? 50000 : this.filters.popularityBucket === '10k' ? 10000 : this.filters.popularityBucket === '5k' ? 5000 : this.filters.popularityBucket === '1k' ? 1000 : 0;
    const maxDays = this.filters.updatedWindow === '7d' ? 7 : this.filters.updatedWindow === '30d' ? 30 : this.filters.updatedWindow === '90d' ? 90 : this.filters.updatedWindow === '365d' ? 365 : Infinity;
    return this.repos.filter((repo) => {
      if (q && !`${repo.fullName} ${repo.description} ${repo.topics.join(' ')}`.toLowerCase().includes(q)) return false;
      if (this.filters.theme && !repo.themeTags.includes(this.filters.theme as GithubThemeTag)) return false;
      if (this.filters.repoType && !repo.repoTypes.includes(this.filters.repoType as GithubRepoType)) return false;
      if (this.filters.language && repo.language !== this.filters.language) return false;
      if (repo.updatedDays > maxDays) return false;
      if (repo.stars < minStars) return false;
      if (this.filters.hasPaper && !repo.hasPaper) return false;
      if (this.filters.hasDataset && !repo.hasDataset) return false;
      if (this.filters.hasBenchmark && !repo.hasBenchmark) return false;
      if (this.filters.hasMcp && !repo.hasMcp) return false;
      if (this.filters.lane && repo.discoveryLane !== this.filters.lane) return false;
      if (view && (view.githubThemes?.length || view.githubTypes?.length)) {
        const themeMatch = Boolean(view.githubThemes?.some((tag) => repo.themeTags.includes(tag)));
        const typeMatch = Boolean(view.githubTypes?.some((type) => repo.repoTypes.includes(type)));
        if (!themeMatch && !typeMatch) return false;
      }
      return true;
    });
  }

  private options(values: string[], current: string, empty: string): string {
    return `<option value="">${empty}</option>${values.map((value) => `<option value="${escapeHtml(value)}"${value === current ? ' selected' : ''}>${escapeHtml(label(value))}</option>`).join('')}`;
  }

  private trends(repos: GithubEnrichedRepo[]): string {
    const topicCounts = new Map<string, number>();
    for (const repo of repos) for (const topic of [...repo.topics, ...repo.themeTags]) topicCounts.set(topic, (topicCounts.get(topic) || 0) + 1);
    const top = Array.from(topicCounts.entries()).sort((a, b) => b[1] - a[1]).slice(0, 8);
    const active = [...repos].sort((a, b) => a.updatedDays - b.updatedDays).slice(0, 5);
    const newThisMonth = repos.filter((repo) => repo.ageDays <= 31).length;
    const benchmarks = repos.filter((repo) => repo.hasBenchmark).sort((a, b) => b.finalScore - a.finalScore).slice(0, 5);
    return `<section class="github-trends">
      <div class="github-trend-card"><span>Top topics</span>${top.map(([k, v]) => `<b>${escapeHtml(label(k))}</b><em>${v}</em>`).join('')}</div>
      <div class="github-trend-card"><span>Most active repos</span>${active.map((r) => `<b>${escapeHtml(r.fullName)}</b><em>${r.updatedDays}d</em>`).join('')}</div>
      <div class="github-trend-card"><span>New repos this month</span><strong>${newThisMonth}</strong><small>created in the last 31 days</small></div>
      <div class="github-trend-card"><span>Benchmark-heavy repos</span>${benchmarks.map((r) => `<b>${escapeHtml(r.fullName)}</b><em>${r.finalScore}</em>`).join('')}</div>
    </section>`;
  }

  render(): void {
    const filtered = this.filtered().sort((a, b) => b.finalScore - a.finalScore);
    const themes = uniq(this.repos.flatMap((repo) => repo.themeTags));
    const types = uniq(this.repos.flatMap((repo) => repo.repoTypes));
    const languages = uniq(this.repos.map((repo) => repo.language).filter(Boolean));
    this.container.innerHTML = `<div class="github-dashboard-shell">
      <aside class="github-sidebar">
        <div class="github-sidebar-heading">Repo Radar</div>
        <label>Search<input data-github-filter="query" value="${escapeHtml(this.filters.query)}" placeholder="repo, topic, description"></label>
        <label>Theme<select data-github-filter="theme">${this.options(themes, this.filters.theme, 'All themes')}</select></label>
        <label>Repo type<select data-github-filter="repoType">${this.options(types, this.filters.repoType, 'All types')}</select></label>
        <label>Language<select data-github-filter="language">${this.options(languages, this.filters.language, 'All languages')}</select></label>
        <label>Updated<select data-github-filter="updatedWindow">
          <option value="any"${this.filters.updatedWindow === 'any' ? ' selected' : ''}>Any time</option>
          <option value="7d"${this.filters.updatedWindow === '7d' ? ' selected' : ''}>7 days</option>
          <option value="30d"${this.filters.updatedWindow === '30d' ? ' selected' : ''}>30 days</option>
          <option value="90d"${this.filters.updatedWindow === '90d' ? ' selected' : ''}>90 days</option>
          <option value="365d"${this.filters.updatedWindow === '365d' ? ' selected' : ''}>1 year</option>
        </select></label>
        <label>Popularity<select data-github-filter="popularityBucket">
          <option value="all"${this.filters.popularityBucket === 'all' ? ' selected' : ''}>All</option>
          <option value="1k"${this.filters.popularityBucket === '1k' ? ' selected' : ''}>1k+ stars</option>
          <option value="5k"${this.filters.popularityBucket === '5k' ? ' selected' : ''}>5k+ stars</option>
          <option value="10k"${this.filters.popularityBucket === '10k' ? ' selected' : ''}>10k+ stars</option>
          <option value="50k"${this.filters.popularityBucket === '50k' ? ' selected' : ''}>50k+ stars</option>
        </select></label>
        <label>Discovery lane<select data-github-filter="lane">
          <option value="">All lanes</option>
          <option value="curated"${this.filters.lane === 'curated' ? ' selected' : ''}>Curated</option>
          <option value="established"${this.filters.lane === 'established' ? ' selected' : ''}>Established</option>
          <option value="emerging"${this.filters.lane === 'emerging' ? ' selected' : ''}>Emerging with traction</option>
        </select></label>
        <label class="github-check"><input type="checkbox" data-github-filter="hasPaper"${this.filters.hasPaper ? ' checked' : ''}> Has paper</label>
        <label class="github-check"><input type="checkbox" data-github-filter="hasDataset"${this.filters.hasDataset ? ' checked' : ''}> Has dataset</label>
        <label class="github-check"><input type="checkbox" data-github-filter="hasBenchmark"${this.filters.hasBenchmark ? ' checked' : ''}> Has benchmark</label>
        <label class="github-check"><input type="checkbox" data-github-filter="hasMcp"${this.filters.hasMcp ? ' checked' : ''}> Mentions MCP</label>
        <button class="github-refresh" id="githubRefreshBtn">${this.loading ? 'Fetching...' : this.filters.view === 'all' ? 'Refresh GitHub' : 'Refresh cluster'}</button>
        ${this.error ? `<div class="github-error">${escapeHtml(this.error)}</div>` : ''}
      </aside>
      <main class="github-main">
        <div class="github-hero"><div><p>GenAI Open Source Stack</p><h1>Relevant repositories for agents, RAG, memory and evaluation</h1><span>${filtered.length} matching repos${this.fetchedAt ? ` · Updated ${escapeHtml(new Date(this.fetchedAt).toLocaleString('en-US'))}` : ''}</span></div><div class="github-saved-views">${views.map((v) => `<button class="${v.id === this.filters.view ? 'active' : ''}" data-github-view="${v.id}">${v.label}</button>`).join('')}</div></div>
        ${this.trends(filtered)}
        <div class="github-table-wrap"><table class="github-table"><thead><tr><th>Repo</th><th>Description</th><th>Tags</th><th>Stars</th><th>Updated</th><th>Language</th><th>Score</th><th>Links</th></tr></thead><tbody>
          ${filtered.map((repo) => `<tr><td><strong>${escapeHtml(repo.fullName)}</strong><small>${escapeHtml(repo.discoveryLane)} · ${escapeHtml(repo.license || 'No license')}</small></td><td>${escapeHtml(repo.description)}</td><td>${[...repo.themeTags, ...repo.repoTypes].slice(0, 7).map((tag) => `<span>${escapeHtml(label(tag))}</span>`).join('')}</td><td>${repo.stars.toLocaleString('en-US')}</td><td>${repo.updatedDays}d ago</td><td>${escapeHtml(repo.language)}</td><td><b>${repo.finalScore}</b><small>R ${repo.relevanceScore} · P ${Math.round(repo.popularityScore)}</small></td><td><a href="${escapeHtml(repo.url)}" target="_blank" rel="noopener">repo</a>${repo.homepage ? `<a href="${escapeHtml(repo.homepage)}" target="_blank" rel="noopener">site</a>` : ''}</td></tr>`).join('')}
        </tbody></table>${filtered.length === 0 ? '<div class="github-empty">No matching repositories yet. Refresh GitHub or loosen filters.</div>' : ''}</div>
      </main>
    </div>`;
  }

  private bind(): void {
    this.container.querySelectorAll<HTMLInputElement | HTMLSelectElement>('[data-github-filter]').forEach((input) => input.addEventListener('input', () => {
      const key = input.dataset.githubFilter as keyof Filters;
      const value = input instanceof HTMLInputElement && input.type === 'checkbox' ? input.checked : input.value;
      this.filters = { ...this.filters, [key]: value };
      this.render();
      this.bind();
    }));
    this.container.querySelectorAll<HTMLButtonElement>('[data-github-view]').forEach((button) => button.addEventListener('click', () => {
      this.filters = { ...this.filters, view: button.dataset.githubView as IntelligenceClusterId };
      this.render();
      this.bind();
    }));
    this.container.querySelector<HTMLButtonElement>('#githubRefreshBtn')?.addEventListener('click', () => void this.refresh());
  }
}
