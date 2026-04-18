import type { AppContext, AppModule } from '@/app/app-context';
import type { MapLayers, NewsItem } from '@/types';
import { FEEDS, MARKET_SYMBOLS } from '@/config';
import { fetchCategoryFeeds, getFeedFailures } from '@/services/rss';
import { fetchMultipleStocks } from '@/services/market';
import { getMarketWatchlistEntries } from '@/services/market-watchlist';
import { getHydratedData } from '@/services/bootstrap';
import { getPersistentCache, setPersistentCache } from '@/services/persistent-cache';
import { checkBatchForBreakingAlerts } from '@/services/breaking-news-alerts';
import { enrichStartupSignals } from '@/services/startup-signal';
import { t } from '@/services/i18n';
import { mountCommunityWidget } from '@/components/CommunityWidget';
import type { MarketPanel } from '@/components/MarketPanel';
import type { TechReadinessPanel } from '@/components/TechReadinessPanel';
import type { TechEventsPanel } from '@/components/TechEventsPanel';
import type { TopVCSignalsPanel } from '@/components/TopVCSignalsPanel';
import type { ListMarketQuotesResponse } from '@/generated/client/worldmonitor/market/v1/service_client';

export interface DataLoaderCallbacks {
  renderCriticalBanner: (postures: never[]) => void;
  refreshOpenCountryBrief: () => void;
}

export class DataLoaderManager implements AppModule {
  updateSearchIndex: () => void = () => {};

  private readonly cacheMaxAgeMs = 20 * 60 * 1000;

  constructor(
    private readonly ctx: AppContext,
    callbacks: DataLoaderCallbacks,
  ) {
    void callbacks;
  }

  init(): void {}

  destroy(): void {}

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
      .filter((entry): entry is [string, typeof FEEDS[keyof typeof FEEDS]] => Array.isArray(entry[1]) && entry[1].length > 0);

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
    (this.ctx.panels['top-vc-signals'] as TopVCSignalsPanel | undefined)?.updateSignals(collected);
    this.ctx.initialLoadComplete = true;
    this.ctx.map?.updateHotspotActivity(this.ctx.allNews);
    this.updateMonitorResults();
    mountCommunityWidget();
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

      const panel = this.ctx.panels['markets'] as MarketPanel | undefined;
      const hydrated = getHydratedData('marketQuotes') as ListMarketQuotesResponse | undefined;
      if (customEntries.length === 0 && hydrated?.quotes?.length) {
        const meta = new Map(symbols.map((item) => [item.symbol, item]));
        const data = hydrated.quotes.map((quote) => ({
          symbol: quote.symbol,
          name: meta.get(quote.symbol)?.name || quote.name,
          display: meta.get(quote.symbol)?.display || quote.display || quote.symbol,
          price: quote.price ?? null,
          change: quote.change ?? null,
          sparkline: quote.sparkline?.length ? quote.sparkline : undefined,
        }));
        this.ctx.latestMarkets = data;
        panel?.renderMarkets(data, hydrated.rateLimited || undefined);
      } else {
        const result = await fetchMultipleStocks(symbols, {
          onBatch: (partial) => {
            this.ctx.latestMarkets = partial;
            panel?.renderMarkets(partial);
          },
        });
        this.ctx.latestMarkets = result.data;
        panel?.renderMarkets(result.data, result.rateLimited);
        this.ctx.statusPanel?.updateApi('Finnhub', { status: result.skipped ? 'error' : 'ok' });
      }

    } catch (error) {
      console.error('[StartupDataLoader] Markets failed:', error);
      this.ctx.statusPanel?.updateApi('Finnhub', { status: 'error' });
    }
  }

  async loadTechEvents(): Promise<void> {
    (this.ctx.panels['events'] as TechEventsPanel | undefined)?.refresh();
    (this.ctx.panels['tech-events'] as TechEventsPanel | undefined)?.refresh();
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
  loadSupplyChain(): Promise<void> { return Promise.resolve(); }
  loadCrossSourceSignals(): Promise<void> { return Promise.resolve(); }
  loadTelegramIntel(): Promise<void> { return Promise.resolve(); }
  loadAaiiSentiment(): Promise<void> { return Promise.resolve(); }
  loadMarketBreadth(): Promise<void> { return Promise.resolve(); }
  loadIntelligenceSignals(): Promise<void> { return Promise.resolve(); }
  loadSecurityAdvisories(): Promise<void> { return Promise.resolve(); }

  updateMonitorResults(): void {
    const monitorPanel = this.ctx.panels['monitors'] as { updateResults?: (monitors: unknown[], news: NewsItem[]) => void } | undefined;
    monitorPanel?.updateResults?.(this.ctx.monitors, this.ctx.allNews);
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
          checkBatchForBreakingAlerts(enriched);
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
