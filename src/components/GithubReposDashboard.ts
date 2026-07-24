import type { GithubEnrichedRepo, GithubPopularityBucket, GithubRepoLlmInsights } from '@/types/github-repos';
import { escapeHtml } from '@/utils/sanitize';
import { fetchGithubRepoDashboardData, loadStoredGithubRepoDashboardData } from '@/services/github-repos/fetcher';
import { fetchGithubRepoInsights } from '@/services/github-repos/insights';
import { intelligenceClusterViews, type IntelligenceClusterId } from '@/config/intelligence-clusters';

const views = intelligenceClusterViews;
type GithubTrendingWindow = 'daily' | 'weekly';

interface Filters {
  view: IntelligenceClusterId;
  query: string;
  language: string;
  popularityBucket: GithubPopularityBucket;
  hasPaper: boolean;
  hasBenchmark: boolean;
  hasMcp: boolean;
}

const defaults: Filters = {
  view: 'all',
  query: '',
  language: '',
  popularityBucket: 'all',
  hasPaper: false,
  hasBenchmark: false,
  hasMcp: false,
};

const PAGE_SIZE = 15;

const label = (s: string) => s.replace(/_/g, ' ');
const uniq = (items: string[]) => Array.from(new Set(items)).sort();

function scoreBand(score: number): 'low' | 'mid' | 'high' {
  if (score < 30) return 'low';
  if (score <= 70) return 'mid';
  return 'high';
}

function sourceLabel(repo: GithubEnrichedRepo): string {
  if (repo.source === 'github-trending') return 'GitHub trending';
  return 'Trending fallback';
}

export class GithubReposDashboard {
  private container: HTMLElement;
  private repos: GithubEnrichedRepo[] = [];
  private filters: Filters = { ...defaults };
  private loading = false;
  private error = '';
  private fetchedAt = '';
  private queryRenderTimer: number | null = null;
  private trendingWindow: GithubTrendingWindow = 'daily';
  private visibleCount = PAGE_SIZE;
  private refreshSerial = 0;
  private insights: GithubRepoLlmInsights | null = null;
  private insightsLoading = false;
  private insightsError = '';
  private insightsSerial = 0;

  constructor(container: HTMLElement) {
    this.container = container;
    const stored = loadStoredGithubRepoDashboardData();
    this.repos = stored.repos.filter((repo) => repo.source === 'github-trending');
    this.fetchedAt = stored.fetchedAt;
    this.render();
    this.bind();
    if (this.repos.length === 0) {
      void this.refresh();
    } else {
      void this.refreshInsights();
    }
  }

  private filtered(): GithubEnrichedRepo[] {
    const view = views.find((v) => v.id === this.filters.view);
    const q = this.filters.query.trim().toLowerCase();
    const minStars = this.filters.popularityBucket === '50k' ? 50000 : this.filters.popularityBucket === '10k' ? 10000 : this.filters.popularityBucket === '5k' ? 5000 : this.filters.popularityBucket === '1k' ? 1000 : 0;
    return this.repos.filter((repo) => {
      if (repo.source !== 'github-trending') return false;
      if (q && !`${repo.fullName} ${repo.description} ${repo.topics.join(' ')}`.toLowerCase().includes(q)) return false;
      if (this.filters.language && repo.language !== this.filters.language) return false;
      if (repo.stars < minStars) return false;
      if (this.filters.hasPaper && !repo.hasPaper) return false;
      if (this.filters.hasBenchmark && !repo.hasBenchmark) return false;
      if (this.filters.hasMcp && !repo.hasMcp) return false;
      if (view && (view.githubThemes?.length || view.githubTypes?.length)) {
        const themeMatch = Boolean(view.githubThemes?.some((tag) => repo.themeTags.includes(tag)));
        const typeMatch = Boolean(view.githubTypes?.some((type) => repo.repoTypes.includes(type)));
        if (!themeMatch && !typeMatch) return false;
      }
      return true;
    }).sort((a, b) => this.compareRepoPriority(a, b));
  }

  private compareRepoPriority(a: GithubEnrichedRepo, b: GithubEnrichedRepo): number {
    const rankDifference = (a.trendingRank ?? 9999) - (b.trendingRank ?? 9999);
    return rankDifference || b.finalScore - a.finalScore;
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

  private renderRepoSignalSummary(repo: GithubEnrichedRepo): string {
    const parts = [
      repo.themeTags[0] ? `Theme: ${label(repo.themeTags[0])}` : '',
      repo.repoTypes[0] ? `Type: ${label(repo.repoTypes[0])}` : '',
      repo.language ? `Language: ${repo.language}` : '',
      repo.hasMcp ? 'Asset: MCP' : '',
      repo.hasBenchmark ? 'Asset: benchmark' : '',
      repo.hasPaper ? 'Asset: paper' : '',
    ].filter(Boolean);
    return parts.slice(0, 4).join(' · ') || sourceLabel(repo);
  }

  private renderScoreTooltip(repo: GithubEnrichedRepo): string {
    const factors = [
      { name: 'Relevance', value: repo.relevanceScore, weight: '35%', desc: 'GenAI theme alignment' },
      { name: 'Recency', value: repo.recencyScore, weight: '20%', desc: `Updated ${repo.updatedDays}d ago` },
      { name: 'Activity', value: Math.round(repo.activityScore), weight: '20%', desc: `${repo.forks.toLocaleString()} forks` },
      { name: 'Popularity', value: Math.round(repo.popularityScore), weight: '15%', desc: `${repo.stars.toLocaleString()} stars` },
      { name: 'Impl. signals', value: repo.implementationSignalScore, weight: '10%', desc: [repo.hasDocs && 'docs', repo.hasDemo && 'demo', repo.hasPaper && 'paper', repo.hasMcp && 'MCP', repo.hasDataset && 'dataset', repo.hasBenchmark && 'bench'].filter(Boolean).join(', ') || 'none' },
    ];
    const bonus = repo.discoveryLane === 'emerging' && repo.stars >= 1000 ? 8 : repo.discoveryLane === 'curated' ? 5 : 0;
    return `<div class="github-score-tooltip">
      <div class="github-score-tooltip-title">Score breakdown</div>
      ${factors.map((f) => `<div class="github-score-tooltip-row">
        <span class="github-score-tooltip-name">${f.name}</span>
        <span class="github-score-tooltip-bar"><span style="width:${f.value}%"></span></span>
        <span class="github-score-tooltip-val">${f.value}</span>
        <span class="github-score-tooltip-weight">×${f.weight}</span>
      </div>
      <div class="github-score-tooltip-desc">${escapeHtml(f.desc)}</div>`).join('')}
      ${bonus > 0 ? `<div class="github-score-tooltip-row"><span class="github-score-tooltip-name">Traction bonus</span><span class="github-score-tooltip-val">+${bonus}</span></div>` : ''}
      <div class="github-score-tooltip-total">Final: <b>${repo.finalScore}</b>/100</div>
    </div>`;
  }

  private renderPriorityStack(repos: GithubEnrichedRepo[]): string {
    const activeTrendingLabel = this.trendingWindow === 'weekly' ? 'This week' : 'Today';
    const items = repos.slice(0, 6);
    if (items.length === 0) return '';
    return `<section class="github-priority">
      <div class="github-section-heading">
        <span>Top trending · ${activeTrendingLabel}</span>
        <span class="github-score-help" tabindex="0">Score <b>?</b><em>Single formula: 35% GenAI relevance + 20% freshness + 20% community activity + 15% stars + 10% implementation readiness + traction bonus. Red &lt; 30, yellow 30-70, green &gt; 70.</em></span>
      </div>
      <div class="github-priority-group">
        <div class="github-carousel-shell">
          <button class="github-carousel-btn" data-github-carousel-dir="-1" aria-label="Previous repositories">‹</button>
          <div class="github-priority-grid github-priority-carousel" data-github-carousel>
          ${items.map((repo) => `<article class="github-priority-card">
            <div class="github-priority-score score-${scoreBand(repo.finalScore)}" data-score-repo="${escapeHtml(repo.fullName)}"><b>${repo.finalScore}</b><span>Score</span>${this.renderScoreTooltip(repo)}</div>
            <div>
              <h3><a class="github-repo-link" href="${escapeHtml(repo.url)}" target="_blank" rel="noopener">${escapeHtml(repo.fullName)}</a></h3>
              <p>${escapeHtml(this.renderRepoSignalSummary(repo))}</p>
              <div class="github-priority-meta">
                <span>${repo.stars.toLocaleString('en-US')} stars</span>
                ${repo.starsToday ? `<span>${repo.starsToday.toLocaleString('en-US')} today</span>` : ''}
                <span>${repo.forks.toLocaleString('en-US')} forks</span>
                <a href="${escapeHtml(repo.url)}" target="_blank" rel="noopener">repo</a>
              </div>
            </div>
          </article>`).join('')}
          </div>
          <button class="github-carousel-btn" data-github-carousel-dir="1" aria-label="Next repositories">›</button>
        </div>
      </div>
    </section>`;
  }

  private renderTrendingWindowToggle(): string {
    return `<div class="github-trending-window-tabs" role="tablist" aria-label="Trending repository window">
      <button role="tab" class="${this.trendingWindow === 'daily' ? 'active' : ''}" data-github-trending-window="daily" aria-selected="${this.trendingWindow === 'daily'}">Today</button>
      <button role="tab" class="${this.trendingWindow === 'weekly' ? 'active' : ''}" data-github-trending-window="weekly" aria-selected="${this.trendingWindow === 'weekly'}">This week</button>
    </div>`;
  }

  private renderMarketInsights(): string {
    if (this.repos.length === 0) return '';
    if (this.insightsLoading) {
      return `<section class="github-ai-insights github-ai-insights-loading" aria-live="polite">
        <div class="github-ai-insights-header">
          <div><span>LLM market intelligence</span><h2>Agentic & generative potential</h2></div>
        </div>
        <div class="github-ai-loading"><span class="github-loading-spinner"></span><div><b>Analyzing market potential…</b><small>Ranking the current Trending snapshot across adoption, agentic leverage and generative use cases.</small></div></div>
      </section>`;
    }
    if (this.insightsError) {
      return `<section class="github-ai-insights github-ai-insights-error">
        <div class="github-ai-insights-header">
          <div><span>LLM market intelligence</span><h2>Agentic & generative potential</h2></div>
          <button id="githubInsightsRefresh">Retry analysis</button>
        </div>
        <p>${escapeHtml(this.insightsError)}</p>
      </section>`;
    }
    if (!this.insights) {
      return `<section class="github-ai-insights">
        <div class="github-ai-insights-header">
          <div><span>LLM market intelligence</span><h2>Agentic & generative potential</h2></div>
          <button id="githubInsightsRefresh">Generate insights</button>
        </div>
        <p class="github-ai-placeholder">Generate an LLM-based market summary and rank the repositories with the strongest agentic and generative AI potential.</p>
      </section>`;
    }

    const repoByName = new Map(this.repos.map((repo) => [repo.fullName.toLowerCase(), repo]));
    const source = [this.insights.provider, this.insights.model].filter(Boolean).join(' · ');
    const generatedAt = new Date(this.insights.generatedAt).toLocaleString('en-US');
    return `<section class="github-ai-insights">
      <div class="github-ai-insights-header">
        <div>
          <span>LLM market intelligence</span>
          <h2>Agentic & generative potential</h2>
          <small>${escapeHtml(source)} · ${escapeHtml(generatedAt)}${this.insights.cached ? ' · cached' : ''}</small>
        </div>
        <button id="githubInsightsRefresh">Refresh analysis</button>
      </div>
      <div class="github-ai-summary">
        <p>${escapeHtml(this.insights.summary)}</p>
        ${this.insights.marketSignals.length > 0 ? `<ul>${this.insights.marketSignals.map((signal) => `<li>${escapeHtml(signal)}</li>`).join('')}</ul>` : ''}
      </div>
      <div class="github-ai-ranking">
        ${this.insights.topRepos.map((pick) => {
          const repo = repoByName.get(pick.fullName.toLowerCase());
          const href = repo?.url || `https://github.com/${pick.fullName}`;
          return `<article class="github-ai-pick">
            <div class="github-ai-pick-rank">#${pick.rank}</div>
            <div class="github-ai-pick-main">
              <div class="github-ai-pick-title">
                <a href="${escapeHtml(href)}" target="_blank" rel="noopener">${escapeHtml(pick.fullName)}</a>
                <span class="confidence-${pick.confidence}">${escapeHtml(pick.confidence)} confidence</span>
              </div>
              <p>${escapeHtml(pick.rationale)}</p>
              <div class="github-ai-score-grid">
                <div><span>Market</span><b>${pick.marketPotential}</b><i><i style="width:${pick.marketPotential}%"></i></i></div>
                <div><span>Agentic</span><b>${pick.agenticPotential}</b><i><i style="width:${pick.agenticPotential}%"></i></i></div>
                <div><span>Generative</span><b>${pick.generativePotential}</b><i><i style="width:${pick.generativePotential}%"></i></i></div>
              </div>
              <div class="github-ai-pick-notes">
                <span><b>Opportunity</b>${escapeHtml(pick.opportunity)}</span>
                <span><b>Risk</b>${escapeHtml(pick.risk)}</span>
              </div>
            </div>
          </article>`;
        }).join('')}
      </div>
      ${this.insights.watchlist.length > 0 ? `<div class="github-ai-watchlist"><b>Watchlist</b>${this.insights.watchlist.map((item) => `<span><strong>${escapeHtml(item.fullName)}</strong> — ${escapeHtml(item.reason)}</span>`).join('')}</div>` : ''}
      <div class="github-ai-disclaimer">Directional LLM assessment based only on the current GitHub Trending snapshot. Not investment advice.</div>
    </section>`;
  }

  private activeFilterCount(): number {
    return [
      this.filters.view !== defaults.view,
      this.filters.query.trim() !== '',
      this.filters.language !== '',
      this.filters.popularityBucket !== 'all',
      this.filters.hasPaper,
      this.filters.hasBenchmark,
      this.filters.hasMcp,
    ].filter(Boolean).length;
  }

  private renderEmptyState(): string {
    if (this.loading) {
      return `<div class="github-empty github-empty-loading">
        <div class="github-loading-spinner" aria-hidden="true"></div>
        <p>Fetching trending repositories…</p>
        <small>This request will stop automatically if GitHub does not respond.</small>
      </div>`;
    }
    if (this.error) {
      return `<div class="github-empty github-empty-error">
        <div class="github-empty-icon">⚠️</div>
        <p>${escapeHtml(this.error)}</p>
        <button class="github-refresh" id="githubRefreshBtnRetry">Retry</button>
      </div>`;
    }
    const activeFilters = this.activeFilterCount();
    return `<div class="github-empty">
      <div class="github-empty-icon">📭</div>
      <p>${activeFilters > 0 ? 'No trending repositories match these filters.' : 'No trending repositories are available right now.'}</p>
      ${activeFilters > 0 ? '<button class="github-filter-reset" data-github-reset-filters>Clear filters</button>' : '<button class="github-refresh" id="githubRefreshBtnRetry">Try again</button>'}
    </div>`;
  }

  render(): void {
    const filtered = this.filtered();
    const visible = filtered.slice(0, this.visibleCount);
    const remaining = filtered.length - visible.length;
    const languages = uniq(this.repos.map((repo) => repo.language).filter(Boolean));
    const activeFilters = this.activeFilterCount();
    const updatedLabel = this.fetchedAt ? new Date(this.fetchedAt).toLocaleString('en-US') : '';
    this.container.innerHTML = `<div class="github-dashboard-shell github-trending-only" aria-busy="${this.loading}">
      <main class="github-main">
        <div class="github-hero">
          <div>
            <p>Open-source momentum</p>
            <h1>Trending GitHub repositories</h1>
            <span>${filtered.length} matching ${filtered.length === 1 ? 'repository' : 'repositories'}${updatedLabel ? ` · Updated ${escapeHtml(updatedLabel)}` : ''}</span>
          </div>
          <div class="github-hero-actions">
            ${this.renderTrendingWindowToggle()}
            <button class="github-refresh" id="githubRefreshBtn"${this.loading ? ' disabled aria-disabled="true"' : ''}>${this.loading ? 'Fetching…' : 'Refresh'}</button>
          </div>
        </div>

        <section class="github-filter-panel" aria-label="Filter trending repositories">
          <div class="github-filter-grid">
            <label class="github-filter-search"><span>Search</span><input data-github-filter="query" value="${escapeHtml(this.filters.query)}" placeholder="Repository, topic, description…" autocomplete="off"></label>
            <label><span>Focus</span><select data-github-filter="view">${this.renderViewOptions()}</select></label>
            <label><span>Language</span><select data-github-filter="language">${this.options(languages, this.filters.language, 'All languages')}</select></label>
            <label><span>Minimum stars</span><select data-github-filter="popularityBucket">
              <option value="all"${this.filters.popularityBucket === 'all' ? ' selected' : ''}>Any popularity</option>
              <option value="1k"${this.filters.popularityBucket === '1k' ? ' selected' : ''}>1k+ stars</option>
              <option value="5k"${this.filters.popularityBucket === '5k' ? ' selected' : ''}>5k+ stars</option>
              <option value="10k"${this.filters.popularityBucket === '10k' ? ' selected' : ''}>10k+ stars</option>
              <option value="50k"${this.filters.popularityBucket === '50k' ? ' selected' : ''}>50k+ stars</option>
            </select></label>
          </div>
          <div class="github-filter-footer">
            <div class="github-filter-signals" aria-label="Repository signals">
              <span>Signals</span>
              <label class="${this.filters.hasPaper ? 'active' : ''}"><input type="checkbox" data-github-filter="hasPaper"${this.filters.hasPaper ? ' checked' : ''}> Paper</label>
              <label class="${this.filters.hasBenchmark ? 'active' : ''}"><input type="checkbox" data-github-filter="hasBenchmark"${this.filters.hasBenchmark ? ' checked' : ''}> Benchmark</label>
              <label class="${this.filters.hasMcp ? 'active' : ''}"><input type="checkbox" data-github-filter="hasMcp"${this.filters.hasMcp ? ' checked' : ''}> MCP</label>
            </div>
            <button class="github-filter-reset" data-github-reset-filters${activeFilters === 0 ? ' disabled' : ''}>Clear${activeFilters > 0 ? ` (${activeFilters})` : ''}</button>
          </div>
        </section>

        ${this.loading && this.repos.length > 0 ? '<div class="github-fetch-status" role="status"><span></span>Refreshing trending repositories…</div>' : ''}
        ${this.error && this.repos.length > 0 ? `<div class="github-fetch-status github-fetch-status-error" role="alert">${escapeHtml(this.error)} <button id="githubRefreshBtnRetry">Retry</button></div>` : ''}
        ${this.renderPriorityStack(filtered)}
        ${this.renderMarketInsights()}
        <div class="github-table-wrap">${filtered.length > 0 ? `<table class="github-table"><thead><tr><th>Repo</th><th>Description</th><th>Signals</th><th>Stars</th><th>Language</th><th>Score</th></tr></thead><tbody>
          ${visible.map((repo) => `<tr>
            <td><a class="github-table-link" href="${escapeHtml(repo.url)}" target="_blank" rel="noopener"><strong>${escapeHtml(repo.fullName)}</strong></a><small>${escapeHtml(sourceLabel(repo))} · ${escapeHtml(repo.license || 'No license')}</small></td>
            <td>${escapeHtml(repo.description || 'No description available')}</td>
            <td>${this.renderSignals(repo)}</td>
            <td>${repo.stars.toLocaleString('en-US')}${repo.starsToday ? `<small>${repo.starsToday.toLocaleString('en-US')} today</small>` : ''}</td>
            <td>${escapeHtml(repo.language)}</td>
            <td class="github-score-cell score-${scoreBand(repo.finalScore)}"><span class="github-score-badge" data-score-repo="${escapeHtml(repo.fullName)}"><b>${repo.finalScore}</b><small>Score</small>${this.renderScoreTooltip(repo)}</span><small>Rel ${repo.relevanceScore} · Act ${Math.round(repo.activityScore)}</small></td>
          </tr>`).join('')}
        </tbody></table>${remaining > 0 ? `<button class="github-show-more" id="githubShowMore">Show ${Math.min(remaining, PAGE_SIZE)} more · ${remaining} remaining</button>` : ''}` : this.renderEmptyState()}</div>
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
        this.visibleCount = PAGE_SIZE;
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
    this.container.querySelector<HTMLButtonElement>('#githubRefreshBtn')?.addEventListener('click', () => void this.refresh());
    this.container.querySelectorAll<HTMLButtonElement>('[data-github-reset-filters]').forEach((button) => {
      button.addEventListener('click', () => {
        this.filters = { ...defaults };
        this.visibleCount = PAGE_SIZE;
        this.render();
        this.bind();
      });
    });
    this.container.querySelector<HTMLButtonElement>('#githubRefreshBtnRetry')?.addEventListener('click', () => {
      void this.refresh();
    });
    this.container.querySelector<HTMLButtonElement>('#githubShowMore')?.addEventListener('click', () => {
      this.visibleCount += PAGE_SIZE;
      this.render();
      this.bind();
    });
    this.container.querySelector<HTMLButtonElement>('#githubInsightsRefresh')?.addEventListener('click', () => {
      void this.refreshInsights();
    });
    this.container.querySelectorAll<HTMLButtonElement>('[data-github-trending-window]').forEach((button) => {
      button.addEventListener('click', () => {
        const nextWindow = button.dataset.githubTrendingWindow === 'weekly' ? 'weekly' : 'daily';
        if (nextWindow === this.trendingWindow || this.loading) return;
        this.trendingWindow = nextWindow;
        this.visibleCount = PAGE_SIZE;
        this.insights = null;
        this.insightsError = '';
        void this.refresh();
      });
    });
    this.container.querySelectorAll<HTMLButtonElement>('[data-github-carousel-dir]').forEach((button) => {
      button.addEventListener('click', () => {
        const carousel = button.parentElement?.querySelector<HTMLElement>('[data-github-carousel]');
        if (!carousel) return;
        const dir = Number(button.dataset.githubCarouselDir || 1);
        carousel.scrollBy({ left: dir * Math.max(280, carousel.clientWidth * 0.78), behavior: 'smooth' });
      });
    });
  }

  private async refresh(): Promise<void> {
    const refreshId = ++this.refreshSerial;
    let shouldRefreshInsights = false;
    this.loading = true;
    this.error = '';
    this.render();
    this.bind();
    try {
      const state = await fetchGithubRepoDashboardData(this.trendingWindow);
      if (refreshId !== this.refreshSerial) return;
      this.repos = state.repos.filter((repo) => repo.source === 'github-trending');
      this.fetchedAt = state.fetchedAt;
      this.insights = null;
      this.insightsError = '';
      shouldRefreshInsights = this.repos.length > 0;
    } catch (error) {
      if (refreshId !== this.refreshSerial) return;
      this.error = error instanceof Error ? error.message : 'Unable to fetch GitHub repositories';
    } finally {
      if (refreshId === this.refreshSerial) {
        this.loading = false;
        this.render();
        this.bind();
      }
    }
    if (refreshId === this.refreshSerial && shouldRefreshInsights) void this.refreshInsights();
  }

  private async refreshInsights(): Promise<void> {
    if (this.repos.length < 3 || this.insightsLoading) return;
    const requestId = ++this.insightsSerial;
    this.insightsLoading = true;
    this.insightsError = '';
    this.render();
    this.bind();
    try {
      const insights = await fetchGithubRepoInsights(this.repos, this.trendingWindow);
      if (requestId !== this.insightsSerial) return;
      this.insights = insights;
    } catch (error) {
      if (requestId !== this.insightsSerial) return;
      this.insightsError = error instanceof Error ? error.message : 'AI market insights are unavailable';
    } finally {
      if (requestId === this.insightsSerial) {
        this.insightsLoading = false;
        this.render();
        this.bind();
      }
    }
  }
}
