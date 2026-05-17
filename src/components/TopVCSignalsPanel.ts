import { Panel } from './Panel';
import type { NewsItem } from '@/types';
import { generateStartupInvestorBrief } from '@/services/startup-investor-brief';
import { escapeHtml, sanitizeUrl } from '@/utils/sanitize';
import { formatTime } from '@/utils';
import { t } from '@/services/i18n';

const MIN_SIGNAL_SCORE = 45;
const MAX_SIGNALS = 12;

function formatBriefSource(result: Awaited<ReturnType<typeof generateStartupInvestorBrief>>): string {
  if (result.provider === 'rules') return 'rules fallback';
  const provider = result.cached || result.provider === 'cache'
    ? 'cache'
    : result.provider
      .replace(/^openrouter$/i, 'OpenRouter')
      .replace(/^openai$/i, 'OpenAI')
      .replace(/^groq$/i, 'Groq')
      .replace(/^anthropic$/i, 'Anthropic')
      .replace(/^mistral$/i, 'Mistral')
      .replace(/^huggingface$/i, 'Hugging Face')
      .replace(/^ollama$/i, 'Ollama')
      .replace(/^browser$/i, 'Browser AI');
  return result.model ? `${provider} · ${result.model}` : provider;
}

function signalScore(item: NewsItem): number {
  return Math.round(item.startupSignal?.score ?? item.importanceScore ?? 0);
}

type FilterKey = 'all' | 'funding' | 'ipo-ma' | 'ai' | 'infra' | 'fintech' | 'cyber' | 'policy' | 'talent' | 'launch';

const FILTERS: Array<{ key: FilterKey; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'funding', label: 'Funding' },
  { key: 'infra', label: 'AI Infra' },
  { key: 'ai', label: 'AI' },
  { key: 'fintech', label: 'Fintech' },
  { key: 'ipo-ma', label: 'IPO/M&A' },
  { key: 'cyber', label: 'Cyber' },
  { key: 'policy', label: 'Policy' },
  { key: 'talent', label: 'Talent' },
  { key: 'launch', label: 'Launch' },
];

export class TopVCSignalsPanel extends Panel {
  private items: NewsItem[] = [];
  private filteredItems: NewsItem[] = [];
  private activeFilter: FilterKey = 'all';
  private briefEl: HTMLElement | null = null;
  private briefButton: HTMLButtonElement | null = null;
  private isBriefing = false;

  constructor() {
    super({
      id: 'top-vc-signals',
      title: 'Highest-Conviction Signals',
      showCount: true,
      defaultRowSpan: 2,
      infoTooltip: t('components.panelTooltips.topVCSignals'),
    });

    this.render();
    this.content.addEventListener('click', (event) => {
      const target = event.target as HTMLElement | null;
      const briefButton = target?.closest<HTMLButtonElement>('.vc-ai-brief-btn');
      if (briefButton) {
        event.preventDefault();
        event.stopPropagation();
        void this.generateBrief();
        return;
      }

      const filterButton = target?.closest<HTMLButtonElement>('.vc-signal-filter');
      if (!filterButton) return;
      event.preventDefault();
      event.stopPropagation();
      this.activeFilter = (filterButton.dataset.filter as FilterKey | undefined) ?? 'all';
      this.render();
    });
  }

  public updateSignals(items: NewsItem[]): void {
    const seen = new Set<string>();
    this.items = items
      .filter((item) => signalScore(item) >= MIN_SIGNAL_SCORE)
      .sort((a, b) => {
        const scoreDelta = signalScore(b) - signalScore(a);
        if (scoreDelta !== 0) return scoreDelta;
        return b.pubDate.getTime() - a.pubDate.getTime();
      })
      .filter((item) => {
        const key = item.link || item.title;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .slice(0, MAX_SIGNALS);

    this.applyFilter();
    this.render();
  }

  private applyFilter(): void {
    this.filteredItems = this.activeFilter === 'all'
      ? this.items
      : this.items.filter((item) => item.startupSignal?.kind === this.activeFilter);
  }

  private render(): void {
    this.applyFilter();
    this.setCount(this.filteredItems.length);

    if (this.items.length === 0) {
      this.setContent('<div class="panel-empty">Waiting for investor-grade signals...</div>');
      return;
    }

    const filters = FILTERS.map((filter) => `
      <button class="vc-signal-filter ${this.activeFilter === filter.key ? 'active' : ''}" type="button" data-filter="${filter.key}">
        ${escapeHtml(filter.label)}
      </button>
    `).join('');

    const rows = this.filteredItems.map((item) => {
      const score = signalScore(item);
      const signal = item.startupSignal;
      const kind = signal?.label ?? 'Signal';
      const rationale = signal?.rationale ?? 'Relevant startup or technology market item';
      const tags = signal?.matchedTags?.slice(0, 3).map((tag) => `<span>${escapeHtml(tag)}</span>`).join('') ?? '';
      const entities = signal?.entities;
      const entityBits = [
        ...(entities?.companies ?? []).map((company) => `Company: ${company}`),
        entities?.fundingStage ? `Stage: ${entities.fundingStage}` : '',
        entities?.fundingAmount ? `Amount: ${entities.fundingAmount}` : '',
        ...(entities?.investors ?? []).map((investor) => `Investor: ${investor}`),
        ...(entities?.geographies ?? []).map((geo) => `Geo: ${geo}`),
      ].filter(Boolean);
      const entityHtml = entityBits.slice(0, 5).map((bit) => `<span>${escapeHtml(bit)}</span>`).join('');
      return `
        <article class="vc-signal-item">
          <div class="vc-signal-meta">
            <span class="startup-signal-badge">VC ${score}</span>
            <span class="vc-signal-kind">${escapeHtml(kind)}</span>
            <span class="vc-signal-source">${escapeHtml(item.source)}</span>
            <span class="vc-signal-time">${formatTime(item.pubDate)}</span>
          </div>
          <a class="vc-signal-title" href="${sanitizeUrl(item.link)}" target="_blank" rel="noopener">${escapeHtml(item.title)}</a>
          <div class="vc-signal-rationale">${escapeHtml(rationale)}</div>
          ${entityHtml ? `<div class="vc-signal-entities">${entityHtml}</div>` : ''}
          ${tags ? `<div class="vc-signal-tags">${tags}</div>` : ''}
        </article>
      `;
    }).join('');

    this.setContent(`
      <div class="vc-signals-panel">
        <div class="vc-signals-actions">
          <button class="vc-ai-brief-btn" type="button">AI Brief</button>
        </div>
        <div class="vc-signal-filters">${filters}</div>
        <div class="vc-ai-brief" hidden></div>
        <div class="vc-signals-list">${rows || '<div class="panel-empty">No signals in this filter yet.</div>'}</div>
      </div>
    `);

  }

  private async generateBrief(): Promise<void> {
    this.briefButton = this.getElement().querySelector('.vc-ai-brief-btn') as HTMLButtonElement | null;
    this.briefEl = this.getElement().querySelector('.vc-ai-brief') as HTMLElement | null;
    if (this.isBriefing || !this.briefEl || !this.briefButton) return;

    const briefItems = this.filteredItems.length > 0 ? this.filteredItems : this.items;
    if (briefItems.length === 0) return;

    this.isBriefing = true;
    this.briefButton.disabled = true;
    this.briefButton.textContent = 'Briefing...';
    this.briefEl.hidden = false;
    this.briefEl.textContent = 'Generating investor brief...';

    try {
      const result = await generateStartupInvestorBrief(briefItems);
      const source = formatBriefSource(result);
      this.briefEl.textContent = `${result.brief}\n\nSource: ${source}`;
    } catch {
      this.briefEl.textContent = 'AI brief unavailable. Try again after the LLM provider is online.';
    } finally {
      this.isBriefing = false;
      this.briefButton.disabled = false;
      this.briefButton.textContent = 'AI Brief';
    }
  }
}
