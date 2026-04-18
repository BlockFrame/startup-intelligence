import { intelligenceClusterViews, type IntelligenceClusterId } from '@/config/intelligence-clusters';
import { fetchHuggingFaceDashboardData, loadStoredHuggingFaceDashboardData } from '@/services/huggingface/fetcher';
import type { HuggingFaceEnrichedItem, HuggingFaceEntityType, HuggingFaceItemRole, HuggingFacePopularityBucket, HuggingFaceThemeTag, HuggingFaceUpdatedWindow } from '@/types/huggingface';
import { escapeHtml } from '@/utils/sanitize';

interface Filters {
  view: IntelligenceClusterId;
  entityType: HuggingFaceEntityType | 'all';
  query: string;
  theme: string;
  role: string;
  taskType: string;
  updatedWindow: HuggingFaceUpdatedWindow;
  popularityBucket: HuggingFacePopularityBucket;
  hasDemo: boolean;
  hasPaper: boolean;
  hasDataset: boolean;
  hasLeaderboard: boolean;
  hasViewer: boolean;
}

const defaults: Filters = {
  view: 'all',
  entityType: 'all',
  query: '',
  theme: '',
  role: '',
  taskType: '',
  updatedWindow: 'any',
  popularityBucket: 'all',
  hasDemo: false,
  hasPaper: false,
  hasDataset: false,
  hasLeaderboard: false,
  hasViewer: false,
};

const entityTabs: Array<{ id: HuggingFaceEntityType | 'all'; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'models', label: 'Models' },
  { id: 'datasets', label: 'Datasets' },
  { id: 'spaces', label: 'Spaces' },
  { id: 'papers', label: 'Papers' },
  { id: 'collections', label: 'Collections' },
];

const label = (s: string) => s.replace(/_/g, ' ');
const uniq = (items: string[]) => Array.from(new Set(items)).sort();

export class HuggingFaceDashboard {
  private container: HTMLElement;
  private items: HuggingFaceEnrichedItem[] = [];
  private filters: Filters = { ...defaults };
  private loading = false;
  private error = '';
  private fetchedAt = '';

  constructor(container: HTMLElement) {
    this.container = container;
    const stored = loadStoredHuggingFaceDashboardData();
    this.items = stored.items;
    this.fetchedAt = stored.fetchedAt;
    this.render();
    this.bind();
    if (this.items.length === 0) void this.refresh();
  }

  async refresh(): Promise<void> {
    this.loading = true;
    this.error = '';
    this.render();
    this.bind();
    try {
      const state = await fetchHuggingFaceDashboardData();
      this.items = state.items;
      this.fetchedAt = state.fetchedAt;
    } catch (error) {
      this.error = error instanceof Error ? error.message : 'Unable to fetch Hugging Face items';
    } finally {
      this.loading = false;
      this.render();
      this.bind();
    }
  }

  private filtered(): HuggingFaceEnrichedItem[] {
    const view = intelligenceClusterViews.find((cluster) => cluster.id === this.filters.view);
    const q = this.filters.query.trim().toLowerCase();
    const maxDays = this.filters.updatedWindow === '7d' ? 7 : this.filters.updatedWindow === '30d' ? 30 : this.filters.updatedWindow === '90d' ? 90 : this.filters.updatedWindow === '365d' ? 365 : Infinity;
    const minPopularity = this.filters.popularityBucket === '10k' ? 10000 : this.filters.popularityBucket === '1k' ? 1000 : this.filters.popularityBucket === '100' ? 100 : 0;
    return this.items.filter((item) => {
      if (this.filters.entityType !== 'all' && item.entityType !== this.filters.entityType) return false;
      if (q && !`${item.id} ${item.title} ${item.summary} ${item.tags.join(' ')}`.toLowerCase().includes(q)) return false;
      if (this.filters.theme && !item.themeTags.includes(this.filters.theme as HuggingFaceThemeTag)) return false;
      if (this.filters.role && !item.roles.includes(this.filters.role as HuggingFaceItemRole)) return false;
      if (this.filters.taskType && item.taskType !== this.filters.taskType && item.pipelineTag !== this.filters.taskType) return false;
      if (item.updatedDays > maxDays) return false;
      if (item.likes + item.downloads < minPopularity) return false;
      if (this.filters.hasDemo && !item.hasDemo) return false;
      if (this.filters.hasPaper && !item.hasPaper) return false;
      if (this.filters.hasDataset && !item.hasDataset) return false;
      if (this.filters.hasLeaderboard && !item.hasLeaderboard) return false;
      if (this.filters.hasViewer && !item.hasViewer) return false;
      if (view?.githubThemes?.length && !item.themeTags.some((tag) => view.githubThemes?.includes(tag))) return false;
      return true;
    }).sort((a, b) => b.finalScore - a.finalScore);
  }

  private options(values: string[], current: string, empty: string): string {
    return `<option value="">${empty}</option>${values.map((value) => `<option value="${escapeHtml(value)}"${value === current ? ' selected' : ''}>${escapeHtml(label(value))}</option>`).join('')}`;
  }

  private trends(items: HuggingFaceEnrichedItem[]): string {
    const themeCounts = new Map<string, number>();
    const roleCounts = new Map<string, number>();
    for (const item of items) {
      for (const theme of item.themeTags) themeCounts.set(theme, (themeCounts.get(theme) || 0) + 1);
      for (const role of item.roles) roleCounts.set(role, (roleCounts.get(role) || 0) + 1);
    }
    const top = (map: Map<string, number>, limit: number) => Array.from(map.entries()).sort((a, b) => b[1] - a[1]).slice(0, limit);
    const mostDownloaded = [...items].sort((a, b) => b.downloads - a.downloads).slice(0, 5);
    const utilityHeavy = [...items].sort((a, b) => b.utilityScore - a.utilityScore).slice(0, 5);
    return `<section class="hf-trends">
      <div class="hf-trend-card"><span>Top themes</span>${top(themeCounts, 8).map(([k, v]) => `<b>${escapeHtml(label(k))}</b><em>${v}</em>`).join('')}</div>
      <div class="hf-trend-card"><span>Top roles</span>${top(roleCounts, 8).map(([k, v]) => `<b>${escapeHtml(label(k))}</b><em>${v}</em>`).join('')}</div>
      <div class="hf-trend-card"><span>Most downloaded</span>${mostDownloaded.map((item) => `<b>${escapeHtml(item.id)}</b><em>${item.downloads.toLocaleString('en-US')}</em>`).join('')}</div>
      <div class="hf-trend-card"><span>Utility signals</span>${utilityHeavy.map((item) => `<b>${escapeHtml(item.id)}</b><em>${item.utilityScore}</em>`).join('')}</div>
    </section>`;
  }

  render(): void {
    const filtered = this.filtered();
    const themes = uniq(this.items.flatMap((item) => item.themeTags));
    const roles = uniq(this.items.flatMap((item) => item.roles));
    const taskTypes = uniq(this.items.flatMap((item) => [item.taskType, item.pipelineTag]).filter(Boolean));
    this.container.innerHTML = `<div class="hf-dashboard-shell">
      <aside class="hf-sidebar">
        <div class="hf-sidebar-heading">Hub Radar</div>
        <label>Search<input data-hf-filter="query" value="${escapeHtml(this.filters.query)}" placeholder="model, dataset, tag"></label>
        <label>Theme<select data-hf-filter="theme">${this.options(themes, this.filters.theme, 'All themes')}</select></label>
        <label>Role<select data-hf-filter="role">${this.options(roles, this.filters.role, 'All roles')}</select></label>
        <label>Task<select data-hf-filter="taskType">${this.options(taskTypes, this.filters.taskType, 'All tasks')}</select></label>
        <label>Updated<select data-hf-filter="updatedWindow">
          <option value="any"${this.filters.updatedWindow === 'any' ? ' selected' : ''}>Any time</option>
          <option value="7d"${this.filters.updatedWindow === '7d' ? ' selected' : ''}>7 days</option>
          <option value="30d"${this.filters.updatedWindow === '30d' ? ' selected' : ''}>30 days</option>
          <option value="90d"${this.filters.updatedWindow === '90d' ? ' selected' : ''}>90 days</option>
          <option value="365d"${this.filters.updatedWindow === '365d' ? ' selected' : ''}>1 year</option>
        </select></label>
        <label>Popularity<select data-hf-filter="popularityBucket">
          <option value="all"${this.filters.popularityBucket === 'all' ? ' selected' : ''}>All</option>
          <option value="100"${this.filters.popularityBucket === '100' ? ' selected' : ''}>100+ signal</option>
          <option value="1k"${this.filters.popularityBucket === '1k' ? ' selected' : ''}>1k+ signal</option>
          <option value="10k"${this.filters.popularityBucket === '10k' ? ' selected' : ''}>10k+ signal</option>
        </select></label>
        <label class="hf-check"><input type="checkbox" data-hf-filter="hasDemo"${this.filters.hasDemo ? ' checked' : ''}> Has demo</label>
        <label class="hf-check"><input type="checkbox" data-hf-filter="hasPaper"${this.filters.hasPaper ? ' checked' : ''}> Has paper</label>
        <label class="hf-check"><input type="checkbox" data-hf-filter="hasDataset"${this.filters.hasDataset ? ' checked' : ''}> Has dataset</label>
        <label class="hf-check"><input type="checkbox" data-hf-filter="hasLeaderboard"${this.filters.hasLeaderboard ? ' checked' : ''}> Has leaderboard</label>
        <label class="hf-check"><input type="checkbox" data-hf-filter="hasViewer"${this.filters.hasViewer ? ' checked' : ''}> Has viewer</label>
        <button class="hf-refresh" id="hfRefreshBtn">${this.loading ? 'Fetching...' : 'Refresh Hugging Face'}</button>
        ${this.error ? `<div class="hf-error">${escapeHtml(this.error)}</div>` : ''}
      </aside>
      <main class="hf-main">
        <div class="hf-hero"><div><p>Hugging Face Hub</p><h1>Models, datasets, spaces and collections for GenAI application stacks</h1><span>${filtered.length} matching items${this.fetchedAt ? ` · Updated ${escapeHtml(new Date(this.fetchedAt).toLocaleString('en-US'))}` : ''}</span></div><div class="hf-saved-views">${intelligenceClusterViews.map((view) => `<button class="${view.id === this.filters.view ? 'active' : ''}" data-hf-view="${view.id}">${view.label}</button>`).join('')}</div></div>
        <div class="hf-entity-tabs">${entityTabs.map((tab) => `<button class="${tab.id === this.filters.entityType ? 'active' : ''}" data-hf-entity="${tab.id}">${tab.label}</button>`).join('')}</div>
        ${this.trends(filtered)}
        <div class="hf-table-wrap"><table class="hf-table"><thead><tr><th>Item</th><th>Type</th><th>Tags</th><th>Likes</th><th>Downloads</th><th>Updated</th><th>Score</th><th>Links</th></tr></thead><tbody>
          ${filtered.map((item) => `<tr><td><strong>${escapeHtml(item.title)}</strong><small>${escapeHtml(item.id)} · ${escapeHtml(item.summary.slice(0, 190))}${item.summary.length > 190 ? '...' : ''}</small></td><td>${escapeHtml(label(item.entityType))}<small>${escapeHtml(item.taskType || item.pipelineTag || 'No task')}</small></td><td>${[...item.themeTags, ...item.roles].slice(0, 7).map((tag) => `<span>${escapeHtml(label(tag))}</span>`).join('')}</td><td>${item.likes.toLocaleString('en-US')}</td><td>${item.downloads.toLocaleString('en-US')}</td><td>${item.updatedDays}d ago</td><td><b>${item.finalScore}</b><small>R ${item.relevanceScore} · U ${item.utilityScore}</small></td><td><a href="${escapeHtml(item.url)}" target="_blank" rel="noopener">hub</a></td></tr>`).join('')}
        </tbody></table>${filtered.length === 0 ? '<div class="hf-empty">No matching Hugging Face items yet. Refresh or loosen filters.</div>' : ''}</div>
      </main>
    </div>`;
  }

  private bind(): void {
    this.container.querySelectorAll<HTMLInputElement | HTMLSelectElement>('[data-hf-filter]').forEach((input) => input.addEventListener('input', () => {
      const key = input.dataset.hfFilter as keyof Filters;
      const value = input instanceof HTMLInputElement && input.type === 'checkbox' ? input.checked : input.value;
      this.filters = { ...this.filters, [key]: value };
      this.render();
      this.bind();
    }));
    this.container.querySelectorAll<HTMLButtonElement>('[data-hf-view]').forEach((button) => button.addEventListener('click', () => {
      this.filters = { ...this.filters, view: button.dataset.hfView as IntelligenceClusterId };
      this.render();
      this.bind();
    }));
    this.container.querySelectorAll<HTMLButtonElement>('[data-hf-entity]').forEach((button) => button.addEventListener('click', () => {
      this.filters = { ...this.filters, entityType: button.dataset.hfEntity as HuggingFaceEntityType | 'all' };
      this.render();
      this.bind();
    }));
    this.container.querySelector<HTMLButtonElement>('#hfRefreshBtn')?.addEventListener('click', () => void this.refresh());
  }
}
