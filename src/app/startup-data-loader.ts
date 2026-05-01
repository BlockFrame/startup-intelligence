import type { AppContext, AppModule } from '@/app/app-context';
import { enqueuePanelCall } from '@/app/pending-panel-data';
import type { MapLayers, NewsItem } from '@/types';
import { FEEDS } from '@/config/feeds';
import { MARKET_SYMBOLS } from '@/config/markets';
import { VARIANT_DEFAULTS } from '@/config/panels';
import { fetchCategoryFeeds, getFeedFailures } from '@/services/rss';
import { fetchMultipleStocks } from '@/services/market';
import { getMarketWatchlistEntries } from '@/services/market-watchlist';
import { getPersistentCache, setPersistentCache } from '@/services/persistent-cache';
import { enrichStartupSignals } from '@/services/startup-signal';
import { t } from '@/services/i18n';
import type { TechReadinessPanel } from '@/components/TechReadinessPanel';

export interface DataLoaderCallbacks {
  renderCriticalBanner: (postures: never[]) => void;
  refreshOpenCountryBrief: () => void;
}

export class DataLoaderManager implements AppModule {
  updateSearchIndex: () => void = () => {};

  private readonly cacheMaxAgeMs = 20 * 60 * 1000;
  private readonly startupFeedKeys = new Set((VARIANT_DEFAULTS.startup ?? []).filter((key) => Array.isArray((FEEDS as Record<string, unknown>)[key])));

  constructor(
    private readonly ctx: AppContext,
    callbacks: DataLoaderCallbacks,
  ) {
    void callbacks;
  }

  init(): void {}

  destroy(): void {}

  private callPanel(key: string, method: string, ...args: unknown[]): void {
    const panel = this.ctx.panels[key];
    const target = panel as Record<string, unknown> | undefined;
    const fn = target?.[method];
    if (typeof fn === 'function') {
      fn.apply(panel, args);
      return;
    }
    enqueuePanelCall(key, method, args);
  }

  syncDataFreshnessWithLayers(): void {}

  waitForAisData(): Promise<void> {
    return Promise.resolve();
  }

  stopLayerActivity(_layer: keyof MapLayers): void {}

  async loadAllData(forceAll = false): Promise<void> {
    const shouldLoad = (id: string): boolean => forceAll || this.isPanelNearViewport(id);
    const tasks: Promise<void>[] = [this.runGuarded('news', () => this.loadNews())];

    if (shouldLoad('markets')) {
      tasks.push(this.runGuarded('markets', () => this.loadMarkets()));
    }
    if (shouldLoad('events') || this.ctx.mapLayers.techEvents) {
      tasks.push(this.runGuarded('techEvents', () => this.loadTechEvents()));
    }
    if (shouldLoad('tech-readiness')) {
      tasks.push(this.runGuarded('techReadiness', async () => {
        (this.ctx.panels['tech-readiness'] as TechReadinessPanel | undefined)?.refresh();
      }));
    }

    await Promise.allSettled(tasks);
    this.updateSearchIndex();
  }

  async loadDataForLayer(layer: keyof MapLayers): Promise<void> {
    if (layer !== 'techEvents') return;
    await this.runGuarded('techEvents', () => this.loadTechEvents());
  }

  async loadNews(): Promise<void> {
    const categories = Object.entries(FEEDS)
      .filter((entry): entry is [string, typeof FEEDS[keyof typeof FEEDS]] => (
        this.startupFeedKeys.has(entry[0]) && Array.isArray(entry[1]) && entry[1].length > 0
      ));

    const collected: NewsItem[] = [];
    const concurrency = Math.min(4, Math.max(1, categories.length));
    for (let i = 0; i < categories.length; i += concurrency) {
      const chunk = categories.slice(i, i + concurrency);
      const results = await Promise.allSettled(
        chunk.map(([category, feeds]) => this.loadNewsCategory(category, feeds)),
      );
      results.forEach((result, idx) => {
        if (result.status === 'fulfilled') {
          collected.push(...result.value);
        } else {
          console.error(`[StartupDataLoader] News category ${chunk[idx]?.[0]} failed:`, result.reason);
        }
      });
    }

    this.ctx.allNews = collected;
    this.callPanel('top-vc-signals', 'updateSignals', collected);
    this.ctx.initialLoadComplete = true;
    this.updateMonitorResults();
  }

  async loadMarkets(): Promise<void> {
    try {
      const customEntries = getMarketWatchlistEntries();
      const symbols = (() => {
        if (customEntries.length === 0) return MARKET_SYMBOLS;
        const base = MARKET_SYMBOLS.slice();
        const seen = new Set(base.map((item) => item.symbol));
        for (const entry of customEntries) {
          if (!entry.symbol || seen.has(entry.symbol)) continue;
          seen.add(entry.symbol);
          base.push({
            symbol: entry.symbol,
            name: entry.name || entry.symbol,
            display: entry.display || entry.symbol,
          });
          if (base.length >= 50) break;
        }
        return base;
      })();

      const result = await fetchMultipleStocks(symbols, {
        onBatch: (partial) => {
          this.ctx.latestMarkets = partial;
          this.callPanel('markets', 'renderMarkets', partial);
        },
      });
      this.ctx.latestMarkets = result.data;
      this.callPanel('markets', 'renderMarkets', result.data, result.rateLimited);
      this.ctx.statusPanel?.updateApi('Finnhub', { status: result.skipped ? 'error' : 'ok' });

    } catch (error) {
      console.error('[StartupDataLoader] Markets failed:', error);
      this.ctx.statusPanel?.updateApi('Finnhub', { status: 'error' });
    }
  }

  async loadTechEvents(): Promise<void> {
    this.callPanel('events', 'refresh');
    this.callPanel('tech-events', 'refresh');
  }

  refreshTemporalBaseline(): Promise<void> { return Promise.resolve(); }
  loadPredictions(): Promise<void> { return Promise.resolve(); }
  loadForecasts(): Promise<void> { return Promise.resolve(); }
  loadPizzInt(): Promise<void> { return Promise.resolve(); }
  loadNatural(): Promise<void> { return Promise.resolve(); }
  loadWeatherAlerts(): Promise<void> { return Promise.resolve(); }
  loadFredData(): Promise<void> { return Promise.resolve(); }
  loadGovernmentSpending(): Promise<void> { return Promise.resolve(); }
  loadBisData(): Promise<void> { return Promise.resolve(); }
  loadBlsData(): Promise<void> { return Promise.resolve(); }
  loadOilAnalytics(): Promise<void> { return Promise.resolve(); }
  loadFirmsData(): Promise<void> { return Promise.resolve(); }
  loadAisSignals(): Promise<void> { return Promise.resolve(); }
  loadCableActivity(): Promise<void> { return Promise.resolve(); }
  loadCableHealth(): Promise<void> { return Promise.resolve(); }
  loadFlightDelays(): Promise<void> { return Promise.resolve(); }
  loadCyberThreats(): Promise<void> { return Promise.resolve(); }
  loadStockAnalysis(): Promise<void> { return Promise.resolve(); }
  loadDailyMarketBrief(): Promise<void> { return Promise.resolve(); }
  loadStockBacktest(): Promise<void> { return Promise.resolve(); }
  loadMarketImplications(): Promise<void> { return Promise.resolve(); }
  loadWsbTickers(): Promise<void> { return Promise.resolve(); }
  loadTradePolicy(): Promise<void> { return Promise.resolve(); }
  loadCrossSourceSignals(): Promise<void> { return Promise.resolve(); }
  loadTelegramIntel(): Promise<void> { return Promise.resolve(); }
  loadAaiiSentiment(): Promise<void> { return Promise.resolve(); }
  loadMarketBreadth(): Promise<void> { return Promise.resolve(); }
  loadIntelligenceSignals(): Promise<void> { return Promise.resolve(); }
  loadSecurityAdvisories(): Promise<void> { return Promise.resolve(); }

  updateMonitorResults(): void {
    this.callPanel('monitors', 'updateResults', this.ctx.monitors, this.ctx.allNews);
  }

  hydrateHappyPanelsFromCache(): Promise<void> {
    return Promise.resolve();
  }

  private async loadNewsCategory(category: string, feeds: typeof FEEDS[keyof typeof FEEDS]): Promise<NewsItem[]> {
    const enabledFeeds = feeds.filter((feed) => !this.ctx.disabledSources.has(feed.name));
    const panel = this.ctx.newsPanels[category];
    if (enabledFeeds.length === 0) {
      this.renderNewsForCategory(category, []);
      panel?.showError(t('common.allSourcesDisabled'));
      return [];
    }

    const cacheKey = `startup-news:${category}`;
    const cached = await getPersistentCache<NewsItem[]>(cacheKey).catch(() => null);
    if (cached && Date.now() - cached.updatedAt < this.cacheMaxAgeMs) {
      this.renderNewsForCategory(category, cached.data);
      return cached.data;
    }

    try {
      const items = await fetchCategoryFeeds(enabledFeeds, {
        batchSize: 4,
        onBatch: (partialItems) => {
          const enriched = enrichStartupSignals(partialItems, category);
          this.renderNewsForCategory(category, enriched);
        },
      });
      const enrichedItems = enrichStartupSignals(items, category);
      this.renderNewsForCategory(category, enrichedItems);
      void setPersistentCache(cacheKey, enrichedItems).catch(() => {});
      this.ctx.statusPanel?.updateFeed(this.labelForCategory(category), { status: 'ok', itemCount: items.length });
      return enrichedItems;
    } catch (error) {
      const failures = getFeedFailures();
      const failedFeeds = enabledFeeds.filter((feed) => failures.has(feed.name));
      panel?.showError(failedFeeds.length > 0
        ? `${t('common.noNewsAvailable')} (${failedFeeds.map((feed) => feed.name).join(', ')} failed)`
        : t('common.noNewsAvailable'));
      this.ctx.statusPanel?.updateFeed(this.labelForCategory(category), { status: 'error', errorMessage: String(error) });
      return [];
    }
  }

  private renderNewsForCategory(category: string, items: NewsItem[]): void {
    const sorted = [...items].sort((a, b) => b.pubDate.getTime() - a.pubDate.getTime());
    this.ctx.newsByCategory[category] = sorted;
    this.ctx.newsPanels[category]?.renderNews(sorted);
  }

  private async runGuarded(name: string, fn: () => Promise<void>): Promise<void> {
    if (this.ctx.isDestroyed || this.ctx.inFlight.has(name)) return;
    this.ctx.inFlight.add(name);
    try {
      await fn();
    } catch (error) {
      if (!this.ctx.isDestroyed) console.error(`[StartupDataLoader] ${name} failed:`, error);
    } finally {
      this.ctx.inFlight.delete(name);
    }
  }

  private isPanelNearViewport(panelId: string, marginPx = 400): boolean {
    const panel = this.ctx.panels[panelId] as { isNearViewport?: (marginPx?: number) => boolean } | undefined;
    return panel?.isNearViewport?.(marginPx) ?? false;
  }

  private labelForCategory(category: string): string {
    return category.charAt(0).toUpperCase() + category.slice(1);
  }
}
