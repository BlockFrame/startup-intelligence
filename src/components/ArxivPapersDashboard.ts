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
  sortBy: 'submittedDate',
  benchmarksOnly: false,
  implementationOnly: false,
};

function uniq<T extends string>(values: T[]): T[] {
  return Array.from(new Set(values)).sort();
}

function weekKey(dateIso: string): string {
  const date = new Date(dateIso);
  const first = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((date.getTime() - first.getTime()) / 86_400_000) + first.getUTCDay() + 1) / 7);
  return `${date.getUTCFullYear()} W${String(week).padStart(2, '0')}`;
}

function tagLabel(tag: string): string {
  return tag.replace(/_/g, ' ');
}

export class ArxivPapersDashboard {
  private container: HTMLElement;
  private papers: ArxivEnrichedPaper[] = [];
  private filters: Filters = { ...defaultFilters };
  private loading = false;
  private error = '';
  private fetchedAt = '';

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
    return this.papers.filter((paper) => {
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
      if (this.filters.sortBy === 'relevance') return b.finalScore - a.finalScore;
      return new Date(b.published).getTime() - new Date(a.published).getTime();
    });
  }

  private renderOptions(values: string[], current: string, empty: string): string {
    return `<option value="">${empty}</option>${values.map((value) => `<option value="${escapeHtml(value)}"${value === current ? ' selected' : ''}>${escapeHtml(tagLabel(value))}</option>`).join('')}`;
  }

  private renderTrendWidgets(papers: ArxivEnrichedPaper[]): string {
    const weeks = new Map<string, number>();
    const tags = new Map<string, number>();
    const pairs = new Map<string, number>();
    for (const paper of papers) {
      weeks.set(weekKey(paper.published), (weeks.get(weekKey(paper.published)) ?? 0) + 1);
      const allTags = [...paper.topicTags, ...paper.componentTags];
      for (const tag of allTags) tags.set(tag, (tags.get(tag) ?? 0) + 1);
      for (let i = 0; i < allTags.length; i += 1) {
        for (let j = i + 1; j < allTags.length; j += 1) {
          const pair = [allTags[i], allTags[j]].sort().join(' + ');
          pairs.set(pair, (pairs.get(pair) ?? 0) + 1);
        }
      }
    }
    const top = (map: Map<string, number>, limit: number) => Array.from(map.entries()).sort((a, b) => b[1] - a[1]).slice(0, limit);
    return `
      <section class="arxiv-trends">
        <div class="arxiv-trend-card"><span>Papers per week</span>${top(weeks, 5).map(([k, v]) => `<b>${escapeHtml(k)}</b><em>${v}</em>`).join('')}</div>
        <div class="arxiv-trend-card"><span>Top tags</span>${top(tags, 8).map(([k, v]) => `<b>${escapeHtml(tagLabel(k))}</b><em>${v}</em>`).join('')}</div>
        <div class="arxiv-trend-card"><span>Co-occurring tags</span>${top(pairs, 6).map(([k, v]) => `<b>${escapeHtml(k.replace(/_/g, ' '))}</b><em>${v}</em>`).join('')}</div>
      </section>`;
  }

  render(): void {
    const topics = uniq(this.papers.flatMap((paper) => paper.topicTags));
    const components = uniq(this.papers.flatMap((paper) => paper.componentTags));
    const contributions = uniq(this.papers.flatMap((paper) => paper.contributionTypes));
    const categories = uniq(this.papers.flatMap((paper) => paper.categories));
    const filtered = this.filteredPapers();

    this.container.innerHTML = `
      <div class="arxiv-dashboard-shell">
        <aside class="arxiv-sidebar">
          <div class="arxiv-sidebar-heading">Paper Radar</div>
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
          <label>Topic<select data-filter="topic">${this.renderOptions(topics, this.filters.topic, 'All topics')}</select></label>
          <label>Component<select data-filter="component">${this.renderOptions(components, this.filters.component, 'All components')}</select></label>
          <label>Contribution<select data-filter="contribution">${this.renderOptions(contributions, this.filters.contribution, 'All types')}</select></label>
          <label>Category<select data-filter="category">${this.renderOptions(categories, this.filters.category, 'All categories')}</select></label>
          <label class="arxiv-check"><input type="checkbox" data-filter="benchmarksOnly"${this.filters.benchmarksOnly ? ' checked' : ''}> Benchmarks / surveys only</label>
          <label class="arxiv-check"><input type="checkbox" data-filter="implementationOnly"${this.filters.implementationOnly ? ' checked' : ''}> Code or dataset mentions</label>
          <button class="arxiv-refresh" id="arxivRefreshBtn">${this.loading ? 'Fetching...' : 'Refresh arXiv'}</button>
          ${this.error ? `<div class="arxiv-error">${escapeHtml(this.error)}</div>` : ''}
        </aside>
        <main class="arxiv-main">
          <div class="arxiv-hero">
            <div>
              <p>GenAI Application Components</p>
              <h1>Recent arXiv papers for builders and investors</h1>
              <span>${filtered.length} matching papers${this.fetchedAt ? ` · Updated ${escapeHtml(new Date(this.fetchedAt).toLocaleString('en-US'))}` : ''}</span>
            </div>
            <div class="arxiv-saved-views">
              ${savedViews.map((view) => `<button class="${view.id === this.filters.view ? 'active' : ''}" data-view="${view.id}">${view.label}</button>`).join('')}
            </div>
          </div>
          ${this.renderTrendWidgets(filtered)}
          <div class="arxiv-table-wrap">
            <table class="arxiv-table">
              <thead><tr><th>Paper</th><th>Date</th><th>Categories</th><th>Tags</th><th>Score</th><th>Authors</th><th>Links</th></tr></thead>
              <tbody>
                ${filtered.map((paper) => `
                  <tr>
                    <td><strong>${escapeHtml(paper.title)}</strong><small>${escapeHtml(paper.summary.slice(0, 220))}${paper.summary.length > 220 ? '...' : ''}</small></td>
                    <td>${escapeHtml(new Date(paper.published).toLocaleDateString('en-US'))}</td>
                    <td>${paper.categories.map((cat) => `<span>${escapeHtml(cat)}</span>`).join('')}</td>
                    <td>${[...paper.topicTags, ...paper.componentTags].slice(0, 7).map((tag) => `<span>${escapeHtml(tagLabel(tag))}</span>`).join('')}</td>
                    <td><b>${paper.finalScore}</b><small>R ${paper.recencyScore} · K ${paper.keywordScore}</small></td>
                    <td>${escapeHtml(paper.authors.slice(0, 3).join(', '))}${paper.authors.length > 3 ? ' et al.' : ''}</td>
                    <td><a href="${escapeHtml(paper.absUrl)}" target="_blank" rel="noopener">abs</a><a href="${escapeHtml(paper.pdfUrl)}" target="_blank" rel="noopener">pdf</a></td>
                  </tr>`).join('')}
              </tbody>
            </table>
            ${filtered.length === 0 ? '<div class="arxiv-empty">No matching papers yet. Refresh arXiv or loosen filters.</div>' : ''}
          </div>
        </main>
      </div>`;
  }

  private bind(): void {
    this.container.querySelectorAll<HTMLInputElement | HTMLSelectElement>('[data-filter]').forEach((input) => {
      input.addEventListener('input', () => {
        const key = input.dataset.filter as keyof Filters;
        const value = input instanceof HTMLInputElement && input.type === 'checkbox' ? input.checked : input.value;
        this.filters = { ...this.filters, [key]: value };
        this.render();
        this.bind();
      });
    });
    this.container.querySelectorAll<HTMLButtonElement>('[data-view]').forEach((button) => {
      button.addEventListener('click', () => {
        this.filters = { ...this.filters, view: button.dataset.view as IntelligenceClusterId };
        this.render();
        this.bind();
      });
    });
    this.container.querySelector<HTMLButtonElement>('#arxivRefreshBtn')?.addEventListener('click', () => void this.refresh());
  }
}
