import type { ArxivComponentTag, ArxivContributionType, ArxivDateWindow, ArxivEnrichedPaper, ArxivSortBy, ArxivTopicTag } from '@/types/arxiv';
import { escapeHtml } from '@/utils/sanitize';
import { fetchArxivDashboardData, loadStoredArxivDashboardData } from '@/services/arxiv/fetcher';
import { intelligenceClusterViews, type IntelligenceClusterId } from '@/config/intelligence-clusters';

const savedViews = intelligenceClusterViews;

interface Filters {
  view: IntelligenceClusterId;
  query: string;
  topic: string;
  component: string;
  contribution: string;
  category: string;
  dateWindow: ArxivDateWindow;
  sortBy: ArxivSortBy;
  benchmarksOnly: boolean;
  implementationOnly: boolean;
}

const defaultFilters: Filters = {
  view: 'all',
  query: '',
  topic: '',
  component: '',
  contribution: '',
  category: '',
  dateWindow: '30d',
  sortBy: 'relevance',
  benchmarksOnly: false,
  implementationOnly: false,
};

const PAGE_SIZE = 15;

function uniq<T extends string>(values: T[]): T[] {
  return Array.from(new Set(values)).sort();
}

function tagLabel(tag: string): string {
  return tag.replace(/_/g, ' ');
}

const ARXIV_CATEGORY_LABELS: Record<string, string> = {
  'cs.AI': 'Artificial intelligence',
  'cs.CL': 'Language and NLP',
  'cs.CV': 'Computer vision',
  'cs.LG': 'Machine learning',
  'cs.IR': 'Search and retrieval',
  'cs.RO': 'Robotics',
  'cs.CR': 'Security',
  'cs.DB': 'Databases',
  'cs.DC': 'Distributed systems',
  'cs.SE': 'Software engineering',
  'cs.HC': 'Human-computer interaction',
  'cs.SD': 'Sound and music AI',
  'cs.MM': 'Multimedia',
  'cs.NE': 'Neural computing',
  'cs.CY': 'Computers and society',
  'cs.MA': 'Multi-agent systems',
  'cs.GT': 'Game theory',
  'cs.SI': 'Social and information networks',
  'cs.ET': 'Emerging technologies',
  'cs.PL': 'Programming languages',
  'cs.IT': 'Information theory',
  'cs.DS': 'Data structures and algorithms',
  'cs.NI': 'Networking',
  'cs.PF': 'Performance',
  'stat.ML': 'Statistical ML',
  'stat.AP': 'Applied statistics',
  'stat.CO': 'Computational statistics',
  'eess.AS': 'Audio and speech',
  'eess.IV': 'Image and video',
  'eess.SP': 'Signal processing',
  'math.OC': 'Optimization',
};

function categoryLabel(category: string): string {
  return ARXIV_CATEGORY_LABELS[category] ?? `arXiv ${category}`;
}

function titleLooksLikeArxivId(value: string): boolean {
  return /^\d{4}\.\d{4,6}(?:v\d+)?$/.test(value.trim());
}

function hasReadablePaperMetadata(paper: ArxivEnrichedPaper): boolean {
  const hasTitle = Boolean(paper.title.trim()) && !titleLooksLikeArxivId(paper.title);
  const hasSummary = Boolean(paper.summary.trim()) && !titleLooksLikeArxivId(paper.summary);
  return hasTitle || hasSummary;
}

function scoreBand(score: number): 'low' | 'mid' | 'high' {
  if (score < 30) return 'low';
  if (score <= 70) return 'mid';
  return 'high';
}

function dateWindowDays(window: ArxivDateWindow): number {
  if (window === '7d') return 7;
  if (window === '90d') return 90;
  return 30;
}

export class ArxivPapersDashboard {
  private container: HTMLElement;
  private papers: ArxivEnrichedPaper[] = [];
  private filters: Filters = { ...defaultFilters };
  private loading = false;
  private error = '';
  private fetchedAt = '';
  private radarOpen = false;
  private queryRenderTimer: number | null = null;
  private visibleCount = PAGE_SIZE;

  constructor(container: HTMLElement) {
    this.container = container;
    const stored = loadStoredArxivDashboardData();
    this.papers = Array.isArray(stored.papers) ? stored.papers as ArxivEnrichedPaper[] : [];
    this.fetchedAt = stored.rawFeed?.fetchedAt ?? '';
    this.render();
    this.bind();
    if (this.papers.length === 0) void this.refresh();
  }

  async refresh(): Promise<void> {
    this.loading = true;
    this.error = '';
    this.render();
    this.bind();
    try {
      const data = await fetchArxivDashboardData({
        dateWindow: this.filters.dateWindow,
        sortBy: this.filters.sortBy,
      });
      this.papers = data.papers;
      this.fetchedAt = data.rawFeed.fetchedAt;
      this.visibleCount = PAGE_SIZE;
    } catch (error) {
      this.error = error instanceof Error ? error.message : 'Unable to fetch arXiv papers';
    } finally {
      this.loading = false;
      this.render();
      this.bind();
    }
  }

  private filteredPapers(): ArxivEnrichedPaper[] {
    const view = savedViews.find((item) => item.id === this.filters.view);
    const q = this.filters.query.trim().toLowerCase();
    const minTime = Date.now() - dateWindowDays(this.filters.dateWindow) * 86_400_000;
    return this.papers.filter((paper) => {
      if (!hasReadablePaperMetadata(paper)) return false;
      const paperTime = new Date(paper.published).getTime();
      if (Number.isFinite(paperTime) && paperTime < minTime) return false;
      if (q && !`${paper.title} ${paper.summary}`.toLowerCase().includes(q)) return false;
      if (this.filters.topic && !paper.topicTags.includes(this.filters.topic as ArxivTopicTag)) return false;
      if (this.filters.component && !paper.componentTags.includes(this.filters.component as ArxivComponentTag)) return false;
      if (this.filters.contribution && !paper.contributionTypes.includes(this.filters.contribution as ArxivContributionType)) return false;
      if (this.filters.category && !paper.categories.includes(this.filters.category)) return false;
      if (this.filters.benchmarksOnly && !paper.contributionTypes.some((type) => type === 'benchmark' || type === 'survey')) return false;
      if (this.filters.implementationOnly && !paper.hasCode && !paper.hasDataset) return false;
      if (view && (view.topicTags?.length || view.componentTags?.length)) {
        const topicMatch = Boolean(view.topicTags?.some((tag) => paper.topicTags.includes(tag)));
        const componentMatch = Boolean(view.componentTags?.some((tag) => paper.componentTags.includes(tag)));
        if (!topicMatch && !componentMatch) return false;
      }
      return true;
    }).sort((a, b) => {
      if (this.filters.sortBy === 'lastUpdatedDate') return new Date(b.updated).getTime() - new Date(a.updated).getTime();
      if (this.filters.sortBy === 'relevance') return this.comparePaperPriority(a, b);
      return new Date(b.published).getTime() - new Date(a.published).getTime();
    });
  }

  private comparePaperPriority(a: ArxivEnrichedPaper, b: ArxivEnrichedPaper): number {
    const aTrending = (a.sourceSignals?.length ?? 0) > 0 ? 1 : 0;
    const bTrending = (b.sourceSignals?.length ?? 0) > 0 ? 1 : 0;
    if (aTrending !== bTrending) return bTrending - aTrending;
    if (aTrending && bTrending) {
      const rankDelta = (a.sourceRank ?? 9999) - (b.sourceRank ?? 9999);
      if (rankDelta !== 0) return rankDelta;
      return b.discussionScore - a.discussionScore || b.finalScore - a.finalScore;
    }
    return b.finalScore - a.finalScore;
  }

  private renderOptions(values: string[], current: string, empty: string): string {
    return `<option value="">${empty}</option>${values.map((value) => `<option value="${escapeHtml(value)}"${value === current ? ' selected' : ''}>${escapeHtml(tagLabel(value))}</option>`).join('')}`;
  }

  private renderViewOptions(): string {
    return savedViews.map((view) => `<option value="${escapeHtml(view.id)}"${view.id === this.filters.view ? ' selected' : ''}>${escapeHtml(view.label)}</option>`).join('');
  }

  private renderCategoryOptions(values: string[], current: string): string {
    return `<option value="">All research areas</option>${values.map((value) => {
      const label = categoryLabel(value);
      const text = label === value ? value : `${label} (${value})`;
      return `<option value="${escapeHtml(value)}"${value === current ? ' selected' : ''}>${escapeHtml(text)}</option>`;
    }).join('')}`;
  }

  private renderCategoryPills(paper: ArxivEnrichedPaper): string {
    const categories = paper.categories.length > 0 ? paper.categories : paper.topicTags.slice(0, 2);
    if (categories.length === 0) {
      return '<span title="Pending arXiv category metadata">AI research<small>inferred</small></span>';
    }
    return categories.map((cat) => {
      const label = categoryLabel(cat);
      const code = paper.categories.includes(cat) ? cat : 'inferred';
      return `<span title="${escapeHtml(code === 'inferred' ? 'Inferred from title and abstract' : cat)}">${escapeHtml(label)}<small>${escapeHtml(code)}</small></span>`;
    }).join('');
  }

  private renderPaperSignalPills(paper: ArxivEnrichedPaper): string {
    const chips = [
      ...paper.contributionTypes.slice(0, 2).map((type) => `Type: ${tagLabel(type)}`),
      ...(paper.categories.length ? paper.categories.slice(0, 2).map((cat) => `Area: ${categoryLabel(cat)}`) : paper.topicTags.slice(0, 1).map((tag) => `Area: ${tagLabel(tag)}`)),
      ...(paper.hasCode ? ['Asset: code'] : []),
      ...(paper.hasDataset ? ['Asset: dataset'] : []),
    ];
    const deduped = Array.from(new Set(chips)).slice(0, 4);
    return deduped.map((chip) => `<span>${escapeHtml(chip)}</span>`).join('');
  }

  private renderPaperSignalSummary(paper: ArxivEnrichedPaper): string {
    const parts = [
      paper.contributionTypes[0] ? `Type: ${tagLabel(paper.contributionTypes[0])}` : '',
      paper.categories[0] ? `Area: ${categoryLabel(paper.categories[0])}` : (paper.topicTags[0] ? `Area: ${tagLabel(paper.topicTags[0])}` : 'Area: AI research'),
      paper.sourceGithubStars ? `GitHub stars: ${paper.sourceGithubStars.toLocaleString('en-US')}` : '',
      paper.hasCode ? 'Asset: code' : '',
    ].filter(Boolean);
    return parts.join(' · ') || 'Research fit';
  }

  private displayTitle(paper: ArxivEnrichedPaper): string {
    if (!titleLooksLikeArxivId(paper.title)) return paper.title;
    if (paper.summary && !titleLooksLikeArxivId(paper.summary)) {
      return paper.summary.length > 96 ? `${paper.summary.slice(0, 96)}...` : paper.summary;
    }
    return `arXiv ${paper.id}`;
  }

  private renderMostDiscussed(papers: ArxivEnrichedPaper[]): string {
    const trending = [...papers].filter((paper) => (paper.sourceSignals?.length ?? 0) > 0).sort((a, b) => this.comparePaperPriority(a, b)).slice(0, 4);
    const githubActivity = [...papers]
      .filter((paper) => (paper.sourceSignals || []).some((source) => /hugging face/i.test(source)) && (paper.sourceGithubStars ?? 0) > 0)
      .sort((a, b) => (b.sourceGithubStars ?? 0) - (a.sourceGithubStars ?? 0))
      .slice(0, 4);
    const gems = [...papers].filter((paper) => (paper.sourceSignals?.length ?? 0) === 0).sort((a, b) => b.finalScore - a.finalScore).slice(0, 4);
    const sections = [
      { title: 'Trending papers', items: trending },
      { title: 'Trending papers ranked by GitHub stars activity', items: githubActivity },
      { title: 'arXiv gems to discover', items: gems },
    ].filter((section, index, all) => section.items.length > 0 && all.findIndex((item) => item.title === section.title) === index);
    if (sections.length === 0) return '';
    return `
      <section class="arxiv-discussed">
        <div class="arxiv-section-heading">
          <span>Paper priority stack</span>
          <span class="arxiv-score-help" tabindex="0">Score <b>?</b><em>Single Gartner-style formula: 30% trend momentum + 20% research fit + 20% implementation readiness + 20% investor relevance + 10% freshness. Inputs available today are source momentum, paper text, arXiv metadata, code/dataset clues, and recency. It is a triage rank, not citation truth. Red &lt; 30, yellow 30-70, green &gt; 70.</em></span>
        </div>
        ${sections.map((section) => `
          <div class="arxiv-priority-group">
            <h2>${escapeHtml(section.title)}</h2>
            <div class="arxiv-discussed-grid">
              ${section.items.map((paper) => `
                <article class="arxiv-discussed-card">
                  <div class="arxiv-discussed-score score-${scoreBand(paper.finalScore)}">
                    <b>${paper.finalScore}</b>
                    <span>Score</span>
                  </div>
                  <div>
                    <h3><a class="arxiv-priority-link" href="${escapeHtml(paper.absUrl)}" target="_blank" rel="noopener">${escapeHtml(this.displayTitle(paper))}</a></h3>
                    <p>${escapeHtml(this.renderPaperSignalSummary(paper))}</p>
                    <div class="arxiv-discussed-meta">
                      ${paper.sourceGithubStars ? `<span>Stars ${paper.sourceGithubStars.toLocaleString('en-US')}</span>` : ''}
                      <span>Investor ${paper.investorScore}</span>
                      <span>Build ${paper.implementationScore}</span>
                      <a href="${escapeHtml(paper.absUrl)}" target="_blank" rel="noopener">abs</a>
                    </div>
                  </div>
                </article>
              `).join('')}
            </div>
          </div>
        `).join('')}
      </section>`;
  }

  render(): void {
    const contributions = uniq(this.papers.flatMap((paper) => paper.contributionTypes));
    const categories = uniq(this.papers.flatMap((paper) => paper.categories));
    const filtered = this.filteredPapers();
    const visible = filtered.slice(0, this.visibleCount);
    const remaining = filtered.length - visible.length;

    this.container.innerHTML = `
      <div class="arxiv-dashboard-shell ${this.radarOpen ? 'radar-open' : 'radar-collapsed'}">
        <aside class="arxiv-sidebar" aria-hidden="${this.radarOpen ? 'false' : 'true'}">
          <div class="arxiv-sidebar-top">
            <div class="arxiv-sidebar-heading">Paper Radar</div>
            <button class="arxiv-radar-close" id="arxivRadarClose" aria-label="Close paper radar">×</button>
          </div>
          <p class="arxiv-sidebar-copy">Use this panel to narrow papers by investment thesis, date, paper type, or arXiv research area.</p>
          <label>Research focus<select data-filter="view">${this.renderViewOptions()}</select></label>
          <label>Search<input class="arxiv-input" data-filter="query" value="${escapeHtml(this.filters.query)}" placeholder="title or abstract"></label>
          <label>Date window<select data-filter="dateWindow">
            <option value="7d"${this.filters.dateWindow === '7d' ? ' selected' : ''}>7 days</option>
            <option value="30d"${this.filters.dateWindow === '30d' ? ' selected' : ''}>30 days</option>
            <option value="90d"${this.filters.dateWindow === '90d' ? ' selected' : ''}>90 days</option>
          </select></label>
          <label>Sort<select data-filter="sortBy">
            <option value="submittedDate"${this.filters.sortBy === 'submittedDate' ? ' selected' : ''}>Submitted date</option>
            <option value="lastUpdatedDate"${this.filters.sortBy === 'lastUpdatedDate' ? ' selected' : ''}>Last updated</option>
            <option value="relevance"${this.filters.sortBy === 'relevance' ? ' selected' : ''}>Relevance</option>
          </select></label>
          <label>Paper type<select data-filter="contribution">${this.renderOptions(contributions, this.filters.contribution, 'All paper types')}</select></label>
          <label>Research area<select data-filter="category">${this.renderCategoryOptions(categories, this.filters.category)}</select></label>
          <label class="arxiv-check"><input type="checkbox" data-filter="benchmarksOnly"${this.filters.benchmarksOnly ? ' checked' : ''}> Benchmarks / surveys only</label>
          <label class="arxiv-check"><input type="checkbox" data-filter="implementationOnly"${this.filters.implementationOnly ? ' checked' : ''}> Code or dataset mentions</label>
          <button class="arxiv-refresh" id="arxivRefreshBtn">${this.loading ? 'Fetching...' : 'Refresh arXiv'}</button>
          ${this.error ? `<div class="arxiv-error">${escapeHtml(this.error)}</div>` : ''}
        </aside>
        <main class="arxiv-main">
          <div class="arxiv-hero">
            <div>
              <p>Trending Research Radar</p>
              <h1>Trending papers and arXiv gems</h1>
              <span>${filtered.length} matching papers${this.fetchedAt ? ` · Updated ${escapeHtml(new Date(this.fetchedAt).toLocaleString('en-US'))}` : ''}</span>
            </div>
            <button class="arxiv-radar-toggle" id="arxivRadarToggle"><span>Filters</span><small>${this.radarOpen ? 'Hide left panel' : 'Open left panel'}</small></button>
          </div>
          ${this.renderMostDiscussed(filtered)}
          <div class="arxiv-table-wrap">
            <table class="arxiv-table">
              <thead><tr><th>Paper</th><th>Date</th><th>Research area</th><th>Signals</th><th>Score</th><th>Authors</th></tr></thead>
              <tbody>
                ${visible.map((paper) => `
                  <tr>
                    <td><a class="arxiv-paper-link" href="${escapeHtml(paper.absUrl)}" target="_blank" rel="noopener"><strong>${escapeHtml(this.displayTitle(paper))}</strong></a><small>${escapeHtml(paper.summary.slice(0, 220))}${paper.summary.length > 220 ? '...' : ''}</small></td>
                    <td>${escapeHtml(new Date(paper.published).toLocaleDateString('en-US'))}</td>
                    <td>${this.renderCategoryPills(paper)}</td>
                    <td>${this.renderPaperSignalPills(paper)}</td>
                    <td class="arxiv-score-cell score-${scoreBand(paper.finalScore)}"><span class="arxiv-score-badge"><b>${paper.finalScore}</b><small>Score</small></span><small>Inv ${paper.investorScore} · Build ${paper.implementationScore}</small></td>
                    <td>${escapeHtml(paper.authors.slice(0, 3).join(', '))}${paper.authors.length > 3 ? ' et al.' : ''}</td>
                  </tr>`).join('')}
              </tbody>
            </table>
            ${filtered.length === 0 ? (this.error ? `<div class="arxiv-empty arxiv-empty-error">⚠️ ${escapeHtml(this.error)}</div>` : '<div class="arxiv-empty">No matching papers yet. Refresh arXiv or loosen filters.</div>') : ''}
            ${remaining > 0 ? `<button class="arxiv-show-more" id="arxivShowMore">Show ${Math.min(remaining, PAGE_SIZE)} more · ${remaining} remaining</button>` : ''}
          </div>
        </main>
      </div>`;
  }

  private bind(): void {
    this.container.querySelectorAll<HTMLInputElement | HTMLSelectElement>('[data-filter]').forEach((input) => {
      const eventName = input instanceof HTMLInputElement && input.type !== 'checkbox' ? 'input' : 'change';
      input.addEventListener(eventName, () => {
        const key = input.dataset.filter as keyof Filters;
        const value = input instanceof HTMLInputElement && input.type === 'checkbox' ? input.checked : input.value;
        this.filters = { ...this.filters, [key]: value };
        this.visibleCount = PAGE_SIZE;
        if (key === 'query') {
          if (this.queryRenderTimer !== null) window.clearTimeout(this.queryRenderTimer);
          this.queryRenderTimer = window.setTimeout(() => {
            this.queryRenderTimer = null;
            this.render();
            this.bind();
            const query = this.container.querySelector<HTMLInputElement>('[data-filter="query"]');
            query?.focus();
            query?.setSelectionRange(query.value.length, query.value.length);
          }, 180);
          return;
        }
        if (key === 'dateWindow' || key === 'sortBy') {
          void this.refresh();
          return;
        }
        this.render();
        this.bind();
      });
    });
    this.container.querySelector<HTMLButtonElement>('#arxivRadarToggle')?.addEventListener('click', () => {
      this.radarOpen = !this.radarOpen;
      this.render();
      this.bind();
    });
    this.container.querySelector<HTMLButtonElement>('#arxivRadarClose')?.addEventListener('click', () => {
      this.radarOpen = false;
      this.render();
      this.bind();
    });
    this.container.querySelector<HTMLButtonElement>('#arxivRefreshBtn')?.addEventListener('click', () => void this.refresh());
    this.container.querySelector<HTMLButtonElement>('#arxivShowMore')?.addEventListener('click', () => {
      this.visibleCount += PAGE_SIZE;
      this.render();
      this.bind();
    });
  }
}
