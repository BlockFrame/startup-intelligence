import type { GithubEnrichedRepo, GithubPopularityBucket, GithubRepoType, GithubThemeTag, GithubUpdatedWindow } from '@/types/github-repos';
import { escapeHtml } from '@/utils/sanitize';
import { fetchGithubRepoDashboardData, loadStoredGithubRepoDashboardData } from '@/services/github-repos/fetcher';
import { intelligenceClusterViews, type IntelligenceClusterId } from '@/config/intelligence-clusters';

const views = intelligenceClusterViews;
type GithubRepoTab = 'master' | 'trending';

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

function scoreBand(score: number): 'low' | 'mid' | 'high' {
  if (score < 30) return 'low';
  if (score <= 70) return 'mid';
  return 'high';
}

function sourceLabel(repo: GithubEnrichedRepo): string {
  if (repo.discoveryLane === 'curated') return 'Master repo';
  if (repo.source === 'github-trending') return 'GitHub trending';
  if (repo.discoveryLane === 'emerging') return 'Emerging';
  return 'Established';
}

export class GithubReposDashboard {
  private container: HTMLElement;
  private repos: GithubEnrichedRepo[] = [];
  private filters: Filters = { ...defaults };
  private loading = false;
  private error = '';
  private fetchedAt = '';
  private radarOpen = false;
  private queryRenderTimer: number | null = null;
  private activeRepoTab: GithubRepoTab = 'master';

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
      const state = await fetchGithubRepoDashboardData(this.filters.view, this.activeRepoTab);
      this.repos = this.mergeRepos(this.repos, state.repos);
      this.fetchedAt = state.fetchedAt;
    } catch (error) {
      this.error = error instanceof Error ? error.message : 'Unable to fetch GitHub repositories';
    } finally {
      this.loading = false;
      this.render();
      this.bind();
    }
  }

  private mergeRepos(existing: GithubEnrichedRepo[], incoming: GithubEnrichedRepo[]): GithubEnrichedRepo[] {
    const map = new Map<string, GithubEnrichedRepo>();
    for (const repo of existing) map.set(repo.fullName.toLowerCase(), repo);
    for (const repo of incoming) map.set(repo.fullName.toLowerCase(), repo);
    return Array.from(map.values());
  }

  private filtered(): GithubEnrichedRepo[] {
    const view = views.find((v) => v.id === this.filters.view);
    const q = this.filters.query.trim().toLowerCase();
    const minStars = this.filters.popularityBucket === '50k' ? 50000 : this.filters.popularityBucket === '10k' ? 10000 : this.filters.popularityBucket === '5k' ? 5000 : this.filters.popularityBucket === '1k' ? 1000 : 0;
    const maxDays = this.filters.updatedWindow === '7d' ? 7 : this.filters.updatedWindow === '30d' ? 30 : this.filters.updatedWindow === '90d' ? 90 : this.filters.updatedWindow === '365d' ? 365 : Infinity;
    return this.repos.filter((repo) => {
      if (this.activeRepoTab === 'master' && repo.discoveryLane !== 'curated') return false;
      if (this.activeRepoTab === 'trending' && repo.source !== 'github-trending') return false;
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
    }).sort((a, b) => this.compareRepoPriority(a, b));
  }

  private compareRepoPriority(a: GithubEnrichedRepo, b: GithubEnrichedRepo): number {
    const aTrending = a.source === 'github-trending' ? 1 : 0;
    const bTrending = b.source === 'github-trending' ? 1 : 0;
    if (aTrending !== bTrending) return bTrending - aTrending;
    if (aTrending && bTrending) return (a.trendingRank ?? 9999) - (b.trendingRank ?? 9999);
    const aCurated = a.discoveryLane === 'curated' ? 1 : 0;
    const bCurated = b.discoveryLane === 'curated' ? 1 : 0;
    if (aCurated !== bCurated) return bCurated - aCurated;
    return b.finalScore - a.finalScore;
  }

  private options(values: string[], current: string, empty: string): string {
    return `<option value="">${empty}</option>${values.map((value) => `<option value="${escapeHtml(value)}"${value === current ? ' selected' : ''}>${escapeHtml(label(value))}</option>`).join('')}`;
  }

  private renderViewOptions(): string {
    return views.map((view) => `<option value="${escapeHtml(view.id)}"${view.id === this.filters.view ? ' selected' : ''}>${escapeHtml(view.label)}</option>`).join('');
  }

  private renderSignals(repo: GithubEnrichedRepo): string {
    const chips = [
      ...repo.themeTags.slice(0, 2).map((tag) => `Theme: ${label(tag)}`),
      ...repo.repoTypes.slice(0, 2).map((type) => `Type: ${label(type)}`),
      repo.hasMcp ? 'Asset: MCP' : '',
      repo.hasBenchmark ? 'Asset: benchmark' : '',
      repo.hasPaper ? 'Asset: paper' : '',
    ].filter(Boolean);
    return Array.from(new Set(chips)).slice(0, 5).map((chip) => `<span>${escapeHtml(chip)}</span>`).join('');
  }

  private renderPriorityStack(repos: GithubEnrichedRepo[]): string {
    const sections = this.activeRepoTab === 'trending'
      ? [
        { title: 'Trending repos', items: repos.slice(0, 4) },
        { title: 'GenAI / agentic trending repos', items: repos.filter((repo) => repo.themeTags.length > 0).sort((a, b) => b.finalScore - a.finalScore || (b.starsToday ?? 0) - (a.starsToday ?? 0)).slice(0, 4) },
      ].filter((section) => section.items.length > 0)
      : [
        { title: 'Master GenAI repos', items: [...repos].sort((a, b) => b.finalScore - a.finalScore).slice(0, 4) },
        { title: 'Agentic / memory master repos', items: repos.filter((repo) => repo.themeTags.some((tag) => ['agents', 'memory', 'knowledge_layer', 'rag'].includes(tag))).sort((a, b) => b.finalScore - a.finalScore).slice(0, 4) },
      ].filter((section) => section.items.length > 0);
    if (sections.length === 0) return '';
    return `<section class="github-priority">
      <div class="github-section-heading">
        <span>Repo priority stack</span>
        <span class="github-score-help" tabindex="0">Score <b>?</b><em>Single formula: 30% GenAI relevance + 20% freshness + 20% community activity + 15% stars + 10% implementation readiness + 5% curated/master signal. Red &lt; 30, yellow 30-70, green &gt; 70.</em></span>
      </div>
      ${sections.map((section) => `<div class="github-priority-group">
        <h2>${escapeHtml(section.title)}</h2>
        <div class="github-priority-grid">
          ${section.items.map((repo) => `<article class="github-priority-card">
            <div class="github-priority-score score-${scoreBand(repo.finalScore)}"><b>${repo.finalScore}</b><span>Score</span></div>
            <div>
              <h3><a class="github-repo-link" href="${escapeHtml(repo.url)}" target="_blank" rel="noopener">${escapeHtml(repo.fullName)}</a></h3>
              <p>${escapeHtml(repo.description || 'No description available')}</p>
              <div class="github-priority-meta">
                <span>${escapeHtml(sourceLabel(repo))}</span>
                <span>${repo.stars.toLocaleString('en-US')} stars</span>
                ${repo.starsToday ? `<span>${repo.starsToday.toLocaleString('en-US')} today</span>` : ''}
              </div>
            </div>
          </article>`).join('')}
        </div>
      </div>`).join('')}
    </section>`;
  }

  render(): void {
    const filtered = this.filtered();
    const themes = uniq(this.repos.flatMap((repo) => repo.themeTags));
    const types = uniq(this.repos.flatMap((repo) => repo.repoTypes));
    const languages = uniq(this.repos.map((repo) => repo.language).filter(Boolean));
    this.container.innerHTML = `<div class="github-dashboard-shell ${this.radarOpen ? 'radar-open' : 'radar-collapsed'}">
      <aside class="github-sidebar" aria-hidden="${this.radarOpen ? 'false' : 'true'}">
        <div class="github-sidebar-top">
          <div class="github-sidebar-heading">Repo Radar</div>
          <button class="github-radar-close" id="githubRadarClose" aria-label="Close repo radar">x</button>
        </div>
        <p class="github-sidebar-copy">Narrow repos by investment thesis, GenAI stack area, repo type, popularity, and implementation signal.</p>
        <label>Research focus<select data-github-filter="view">${this.renderViewOptions()}</select></label>
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
        <label>Source lane<select data-github-filter="lane">
          <option value="">All lanes</option>
          <option value="curated"${this.filters.lane === 'curated' ? ' selected' : ''}>Master repos</option>
          <option value="established"${this.filters.lane === 'established' ? ' selected' : ''}>Established</option>
          <option value="emerging"${this.filters.lane === 'emerging' ? ' selected' : ''}>Trending / emerging</option>
        </select></label>
        <label class="github-check"><input type="checkbox" data-github-filter="hasPaper"${this.filters.hasPaper ? ' checked' : ''}> Has paper</label>
        <label class="github-check"><input type="checkbox" data-github-filter="hasDataset"${this.filters.hasDataset ? ' checked' : ''}> Has dataset</label>
        <label class="github-check"><input type="checkbox" data-github-filter="hasBenchmark"${this.filters.hasBenchmark ? ' checked' : ''}> Has benchmark</label>
        <label class="github-check"><input type="checkbox" data-github-filter="hasMcp"${this.filters.hasMcp ? ' checked' : ''}> Mentions MCP</label>
        <button class="github-refresh" id="githubRefreshBtn">${this.loading ? 'Fetching...' : this.activeRepoTab === 'master' ? 'Refresh master repos' : 'Refresh trending repos'}</button>
        ${this.error ? `<div class="github-error">${escapeHtml(this.error)}</div>` : ''}
      </aside>
      <main class="github-main">
        <div class="github-hero">
          <div>
            <p>GenAI Open Source Radar</p>
            <h1>${this.activeRepoTab === 'master' ? 'Master GenAI repos' : 'Trending GitHub repos'}</h1>
            <span>${filtered.length} matching repos${this.fetchedAt ? ` · Updated ${escapeHtml(new Date(this.fetchedAt).toLocaleString('en-US'))}` : ''}</span>
          </div>
          <button class="github-radar-toggle" id="githubRadarToggle"><span>Filters</span><small>${this.radarOpen ? 'Hide left panel' : 'Open left panel'}</small></button>
        </div>
        <div class="github-source-tabs" role="tablist" aria-label="GitHub repository source">
          <button class="${this.activeRepoTab === 'master' ? 'active' : ''}" data-github-source-tab="master">Master repos</button>
          <button class="${this.activeRepoTab === 'trending' ? 'active' : ''}" data-github-source-tab="trending">Trending repos</button>
        </div>
        ${this.renderPriorityStack(filtered)}
        <div class="github-table-wrap"><table class="github-table"><thead><tr><th>Repo</th><th>Description</th><th>Tags</th><th>Stars</th><th>Updated</th><th>Language</th><th>Score</th></tr></thead><tbody>
          ${filtered.map((repo) => `<tr>
            <td><a class="github-table-link" href="${escapeHtml(repo.url)}" target="_blank" rel="noopener"><strong>${escapeHtml(repo.fullName)}</strong></a><small>${escapeHtml(sourceLabel(repo))} · ${escapeHtml(repo.license || 'No license')}</small></td>
            <td>${escapeHtml(repo.description || 'No description available')}</td>
            <td>${this.renderSignals(repo)}</td>
            <td>${repo.stars.toLocaleString('en-US')}${repo.starsToday ? `<small>${repo.starsToday.toLocaleString('en-US')} today</small>` : ''}</td>
            <td>${repo.updatedDays}d ago</td>
            <td>${escapeHtml(repo.language)}</td>
            <td class="github-score-cell score-${scoreBand(repo.finalScore)}"><span class="github-score-badge"><b>${repo.finalScore}</b><small>Score</small></span><small>Rel ${repo.relevanceScore} · Act ${Math.round(repo.activityScore)}</small></td>
          </tr>`).join('')}
        </tbody></table>${filtered.length === 0 ? (this.error ? `<div class="github-empty github-empty-error">⚠️ ${escapeHtml(this.error)}</div>` : '<div class="github-empty">No matching repositories yet. Refresh GitHub or loosen filters.</div>') : ''}</div>
      </main>
    </div>`;
  }

  private bind(): void {
    this.container.querySelectorAll<HTMLInputElement | HTMLSelectElement>('[data-github-filter]').forEach((input) => {
      const eventName = input instanceof HTMLInputElement && input.type !== 'checkbox' ? 'input' : 'change';
      input.addEventListener(eventName, () => {
        const key = input.dataset.githubFilter as keyof Filters;
        const value = input instanceof HTMLInputElement && input.type === 'checkbox' ? input.checked : input.value;
        this.filters = { ...this.filters, [key]: value };
        if (key === 'query') {
          if (this.queryRenderTimer !== null) window.clearTimeout(this.queryRenderTimer);
          this.queryRenderTimer = window.setTimeout(() => {
            this.queryRenderTimer = null;
            this.render();
            this.bind();
            const query = this.container.querySelector<HTMLInputElement>('[data-github-filter="query"]');
            query?.focus();
            query?.setSelectionRange(query.value.length, query.value.length);
          }, 180);
          return;
        }
        this.render();
        this.bind();
      });
    });
    this.container.querySelector<HTMLButtonElement>('#githubRadarToggle')?.addEventListener('click', () => {
      this.radarOpen = !this.radarOpen;
      this.render();
      this.bind();
    });
    this.container.querySelector<HTMLButtonElement>('#githubRadarClose')?.addEventListener('click', () => {
      this.radarOpen = false;
      this.render();
      this.bind();
    });
    this.container.querySelector<HTMLButtonElement>('#githubRefreshBtn')?.addEventListener('click', () => void this.refresh());
    this.container.querySelectorAll<HTMLButtonElement>('[data-github-source-tab]').forEach((button) => {
      button.addEventListener('click', () => {
        this.activeRepoTab = button.dataset.githubSourceTab === 'trending' ? 'trending' : 'master';
        this.render();
        this.bind();
        if (this.filtered().length === 0) void this.refresh();
      });
    });
    this.container.querySelector<HTMLButtonElement>('#githubRefreshBtnRetry')?.addEventListener('click', () => {
      if (this.activeRepoTab === 'trending') {
        void this.refreshTrending();
      } else {
        void this.refresh();
      }
    });
  }
}
