import type { Monitor, PanelConfig, MapLayers } from '@/types';
import { normalizeExclusiveChoropleths } from '@/components/resilience-choropleth-utils';
import type { AppContext } from '@/app/app-context';
import {
  REFRESH_INTERVALS,
  STORAGE_KEYS,
} from '@/config/variants/base';
import {
  DEFAULT_PANELS,
  DEFAULT_MAP_LAYERS,
  MOBILE_DEFAULT_MAP_LAYERS,
  ALL_PANELS,
  VARIANT_DEFAULTS,
  getEffectivePanelConfig,
  FREE_MAX_PANELS,
  FREE_MAX_SOURCES,
} from '@/config/panels';
import { SITE_VARIANT } from '@/config/variant';
import { sanitizeLayersForVariant } from '@/config/map-layer-definitions';
import type { MapVariant } from '@/config/map-layer-definitions';
import { cleanOldSnapshots, initDB } from '@/services/storage';
import { isProUser } from '@/services/widget-store';
import { getAiFlowSettings, subscribeAiFlowChange, isHeadlineMemoryEnabled } from '@/services/ai-flow-settings';
import { loadFromStorage, parseMapUrlState, saveToStorage, isMobileDevice } from '@/utils';
import type { ParsedMapUrlState } from '@/utils';
import type { ServiceStatusPanel } from '@/components/ServiceStatusPanel';
import type { StablecoinPanel } from '@/components/StablecoinPanel';
import type { EnergyCrisisPanel } from '@/components/EnergyCrisisPanel';
import type { ETFFlowsPanel } from '@/components/ETFFlowsPanel';
import type { MacroSignalsPanel } from '@/components/MacroSignalsPanel';
import type { FearGreedPanel } from '@/components/FearGreedPanel';
import type { StrategicRiskPanel } from '@/components/StrategicRiskPanel';
import type { FuelPricesPanel } from '@/components/FuelPricesPanel';
import type { OilInventoriesPanel } from '@/components/OilInventoriesPanel';
import type { ConsumerPricesPanel } from '@/components/ConsumerPricesPanel';
import type { MacroTilesPanel } from '@/components/MacroTilesPanel';
import type { FSIPanel } from '@/components/FSIPanel';
import type { YieldCurvePanel } from '@/components/YieldCurvePanel';
import type { EarningsCalendarPanel } from '@/components/EarningsCalendarPanel';
import type { EconomicCalendarPanel } from '@/components/EconomicCalendarPanel';
import type { LiquidityShiftsPanel } from '@/components/LiquidityShiftsPanel';
import type { GoldIntelligencePanel } from '@/components/GoldIntelligencePanel';
import { isDesktopRuntime, waitForSidecarReady } from '@/services/runtime';
import { hasPremiumAccess } from '@/services/panel-gating';
import { BETA_MODE } from '@/config/beta';
import { trackEvent, trackDeeplinkOpened, initAuthAnalytics } from '@/services/analytics';
import { preloadCountryGeometry } from '@/services/country-geometry';
import { initI18n, t } from '@/services/i18n';

import { computeDefaultDisabledSources, getLocaleBoostedSources, getTotalFeedCount, FEEDS, INTEL_SOURCES } from '@/config/feeds';
import { describeFreshness } from '@/services/persistent-cache';
import { DesktopUpdater } from '@/app/desktop-updater';
import type * as NonStartupRuntime from '@/app/non-startup-runtime';
import type { BootstrapHydrationState } from '@/app/non-startup-runtime';
import { CountryIntelManager } from '@/app/startup-country-intel';
import { SearchManager } from '@/app/search-manager';
import { RefreshScheduler } from '@/app/refresh-scheduler';
import { PanelLayoutManager } from '@/app/panel-layout';
import type { DataLoaderController } from '@/app/data-loader-contract';
import type { EventHandlerController } from '@/app/event-handler-contract';
import { resolveUserRegion, resolvePreciseUserCoordinates, type PreciseCoordinates } from '@/utils/user-location';

type RefreshablePanel = {
  fetchData(): Promise<void>;
};

type RefreshOnlyPanel = {
  refresh(force?: boolean): Promise<void>;
};
import { initAuthState, subscribeAuthState } from '@/services/auth-state';
import { install as installCloudPrefsSync, onSignIn as cloudPrefsSignIn, onSignOut as cloudPrefsSignOut } from '@/utils/cloud-prefs-sync';
import { getConvexClient, getConvexApi, waitForConvexAuth } from '@/services/convex-client';
import { initEntitlementSubscription, destroyEntitlementSubscription, resetEntitlementState } from '@/services/entitlements';
import { initSubscriptionWatch, destroySubscriptionWatch } from '@/services/billing';
import { capturePendingCheckoutIntentFromUrl, resumePendingCheckout } from '@/services/checkout';

const CYBER_LAYER_ENABLED = import.meta.env.VITE_ENABLE_CYBER_LAYER === 'true';
const IS_STARTUP_BUILD = import.meta.env.VITE_VARIANT === 'startup';
const EMPTY_BOOTSTRAP_HYDRATION_STATE: BootstrapHydrationState = {
  source: 'none',
  tiers: {
    fast: { source: 'none', updatedAt: null },
    slow: { source: 'none', updatedAt: null },
  },
};

async function getMlWorker() {
  return (await import('@/services/ml-worker')).mlWorker;
}

export type { CountryBriefSignals } from '@/app/app-context';

export class App {
  private state: AppContext;
  private pendingDeepLinkCountry: string | null = null;

  private panelLayout!: PanelLayoutManager;
  private dataLoader!: DataLoaderController;
  private eventHandlers!: EventHandlerController;
  private searchManager!: SearchManager;
  private countryIntel!: CountryIntelManager;
  private refreshScheduler!: RefreshScheduler;
  private desktopUpdater!: DesktopUpdater;

  private modules: { destroy(): void }[] = [];
  private unsubAiFlow: (() => void) | null = null;
  private unsubFreeTier: (() => void) | null = null;
  private visiblePanelPrimed = new Set<string>();
  private visiblePanelPrimeRaf: number | null = null;
  private bootstrapHydrationState: BootstrapHydrationState = EMPTY_BOOTSTRAP_HYDRATION_STATE;
  private cachedModeBannerEl: HTMLElement | null = null;
  private readonly handleViewportPrime = (): void => {
    if (this.visiblePanelPrimeRaf !== null) return;
    this.visiblePanelPrimeRaf = window.requestAnimationFrame(() => {
      this.visiblePanelPrimeRaf = null;
      void this.primeVisiblePanelData();
    });
  };
  private readonly handleConnectivityChange = (): void => {
    this.updateConnectivityUi();
  };

  private isPanelNearViewport(panelId: string, marginPx = 400): boolean {
    const panel = this.state.panels[panelId] as { isNearViewport?: (marginPx?: number) => boolean } | undefined;
    return panel?.isNearViewport?.(marginPx) ?? false;
  }

  private isAnyPanelNearViewport(panelIds: string[], marginPx = 400): boolean {
    return panelIds.some((panelId) => this.isPanelNearViewport(panelId, marginPx));
  }

  private shouldRefreshIntelligence(): boolean {
    return this.isAnyPanelNearViewport(['cii', 'strategic-risk', 'strategic-posture']);
  }

  private shouldRefreshFirms(): boolean {
    return this.isPanelNearViewport('satellite-fires');
  }

  private shouldRefreshCorrelation(): boolean {
    return this.isAnyPanelNearViewport(['military-correlation', 'escalation-correlation', 'economic-correlation', 'disaster-correlation']);
  }

  private getCachedBootstrapUpdatedAt(): number | null {
    const cachedTierTimestamps = Object.values(this.bootstrapHydrationState.tiers)
      .filter((tier) => tier.source === 'cached')
      .map((tier) => tier.updatedAt)
      .filter((value): value is number => typeof value === 'number' && Number.isFinite(value));

    if (cachedTierTimestamps.length === 0) return null;
    return Math.min(...cachedTierTimestamps);
  }

  private updateConnectivityUi(): void {
    const statusIndicator = this.state.container.querySelector('.status-indicator');
    const statusLabel = statusIndicator?.querySelector('span:last-child');
    const online = typeof navigator === 'undefined' ? true : navigator.onLine !== false;
    // Only treat a complete cache fallback (no live data at all) as "cached" for UI purposes.
    // 'mixed' means live data was partially fetched — showing "Live data unavailable" would be misleading.
    const usingCachedBootstrap = this.bootstrapHydrationState.source === 'cached';
    const cachedUpdatedAt = this.getCachedBootstrapUpdatedAt();

    let statusMode: 'live' | 'cached' | 'unavailable' = 'live';
    let bannerMessage: string | null = null;

    if (!online) {
      // Offline: show banner regardless of mixed/cached (any cached data is better than nothing)
      const hasAnyCached = this.bootstrapHydrationState.source === 'cached' || this.bootstrapHydrationState.source === 'mixed';
      if (hasAnyCached) {
        statusMode = 'cached';
        const offlineCachedAt = this.bootstrapHydrationState.tiers
          ? Math.min(...Object.values(this.bootstrapHydrationState.tiers)
              .filter((tier) => tier.source === 'cached' || tier.source === 'mixed')
              .map((tier) => tier.updatedAt)
              .filter((v): v is number => typeof v === 'number' && Number.isFinite(v)))
          : NaN;
        const freshness = Number.isFinite(offlineCachedAt) ? describeFreshness(offlineCachedAt) : t('common.cached').toLowerCase();
        bannerMessage = t('connectivity.offlineCached', { freshness });
      } else {
        statusMode = 'unavailable';
        bannerMessage = t('connectivity.offlineUnavailable');
      }
    } else if (usingCachedBootstrap) {
      statusMode = 'cached';
      const freshness = cachedUpdatedAt ? describeFreshness(cachedUpdatedAt) : t('common.cached').toLowerCase();
      bannerMessage = t('connectivity.cachedFallback', { freshness });
    }

    if (statusIndicator && statusLabel) {
      statusIndicator.classList.toggle('status-indicator--cached', statusMode === 'cached');
      statusIndicator.classList.toggle('status-indicator--unavailable', statusMode === 'unavailable');
      statusLabel.textContent = statusMode === 'live'
        ? t('header.live')
        : statusMode === 'cached'
          ? t('header.cached')
          : t('header.unavailable');
    }

    if (bannerMessage) {
      if (!this.cachedModeBannerEl) {
        this.cachedModeBannerEl = document.createElement('div');
        this.cachedModeBannerEl.className = 'cached-mode-banner';
        this.cachedModeBannerEl.setAttribute('role', 'status');
        this.cachedModeBannerEl.setAttribute('aria-live', 'polite');

        const badge = document.createElement('span');
        badge.className = 'cached-mode-banner__badge';
        const text = document.createElement('span');
        text.className = 'cached-mode-banner__text';
        this.cachedModeBannerEl.append(badge, text);

        const header = this.state.container.querySelector('.header');
        if (header?.parentElement) {
          header.insertAdjacentElement('afterend', this.cachedModeBannerEl);
        } else {
          this.state.container.prepend(this.cachedModeBannerEl);
        }
      }

      this.cachedModeBannerEl.classList.toggle('cached-mode-banner--unavailable', statusMode === 'unavailable');
      const badge = this.cachedModeBannerEl.querySelector('.cached-mode-banner__badge')!;
      const text = this.cachedModeBannerEl.querySelector('.cached-mode-banner__text')!;
      badge.textContent = statusMode === 'cached' ? t('header.cached') : t('header.unavailable');
      text.textContent = bannerMessage;
      return;
    }

    this.cachedModeBannerEl?.remove();
    this.cachedModeBannerEl = null;
  }

  private async primeVisiblePanelData(forceAll = false): Promise<void> {
    const tasks: Promise<unknown>[] = [];
    const primeTask = (key: string, task: () => Promise<unknown>): void => {
      if (this.visiblePanelPrimed.has(key) || this.state.inFlight.has(key)) return;
      const wrapped = (async () => {
        this.state.inFlight.add(key);
        try {
          await task();
          this.visiblePanelPrimed.add(key);
        } finally {
          this.state.inFlight.delete(key);
        }
      })();
      tasks.push(wrapped);
    };

    const shouldPrime = (id: string): boolean => forceAll || this.isPanelNearViewport(id);
    const shouldPrimeAny = (ids: string[]): boolean => forceAll || this.isAnyPanelNearViewport(ids);

    if (SITE_VARIANT === 'startup') {
      if (shouldPrime('macro-signals')) {
        const panel = this.state.panels['macro-signals'] as MacroSignalsPanel | undefined;
        if (panel) primeTask('macro-signals', () => panel.fetchData());
      }
      if (shouldPrime('markets')) {
        primeTask('markets', () => this.dataLoader.loadMarkets());
      }

      if (tasks.length > 0) {
        await Promise.allSettled(tasks);
      }
      return;
    }

    if (shouldPrime('service-status')) {
      const panel = this.state.panels['service-status'] as ServiceStatusPanel | undefined;
      if (panel) primeTask('service-status', () => panel.fetchStatus());
    }
    if (shouldPrime('macro-signals')) {
      const panel = this.state.panels['macro-signals'] as MacroSignalsPanel | undefined;
      if (panel) primeTask('macro-signals', () => panel.fetchData());
    }
    if (shouldPrime('fear-greed')) {
      const panel = this.state.panels['fear-greed'] as FearGreedPanel | undefined;
      if (panel) primeTask('fear-greed', () => panel.fetchData());
    }
    if (shouldPrime('etf-flows')) {
      const panel = this.state.panels['etf-flows'] as ETFFlowsPanel | undefined;
      if (panel) primeTask('etf-flows', () => panel.fetchData());
    }
    if (shouldPrime('stablecoins')) {
      const panel = this.state.panels.stablecoins as StablecoinPanel | undefined;
      if (panel) primeTask('stablecoins', () => panel.fetchData());
    }
    if (shouldPrime('energy-crisis')) {
      const panel = this.state.panels['energy-crisis'] as EnergyCrisisPanel | undefined;
      if (panel) primeTask('energy-crisis', () => panel.fetchData());
    }
    if (shouldPrime('telegram-intel')) {
      primeTask('telegram-intel', () => this.dataLoader.loadTelegramIntel());
    }
    if (shouldPrime('gulf-economies')) {
      const panel = this.state.panels['gulf-economies'] as unknown as RefreshablePanel | undefined;
      if (panel) primeTask('gulf-economies', () => panel.fetchData());
    }
    if (shouldPrime('grocery-basket')) {
      const panel = this.state.panels['grocery-basket'] as unknown as RefreshablePanel | undefined;
      if (panel) primeTask('grocery-basket', () => panel.fetchData());
    }
    if (shouldPrime('bigmac')) {
      const panel = this.state.panels['bigmac'] as unknown as RefreshablePanel | undefined;
      if (panel) primeTask('bigmac', () => panel.fetchData());
    }
    if (shouldPrime('fuel-prices')) {
      const panel = this.state.panels['fuel-prices'] as FuelPricesPanel | undefined;
      if (panel) primeTask('fuel-prices', () => panel.fetchData());
    }
    if (shouldPrime('fao-food-price-index')) {
      const panel = this.state.panels['fao-food-price-index'] as unknown as RefreshablePanel | undefined;
      if (panel) primeTask('fao-food-price-index', () => panel.fetchData());
    }
    if (shouldPrime('oil-inventories')) {
      const panel = this.state.panels['oil-inventories'] as OilInventoriesPanel | undefined;
      if (panel) primeTask('oil-inventories', () => panel.fetchData());
    }
    if (shouldPrime('climate-news')) {
      const panel = this.state.panels['climate-news'] as unknown as RefreshablePanel | undefined;
      if (panel) primeTask('climate-news', () => panel.fetchData());
    }
    if (shouldPrime('consumer-prices')) {
      const panel = this.state.panels['consumer-prices'] as ConsumerPricesPanel | undefined;
      if (panel) primeTask('consumer-prices', () => panel.fetchData());
    }
    if (shouldPrime('defense-patents')) {
      const panel = this.state.panels['defense-patents'] as unknown as RefreshOnlyPanel | undefined;
      if (panel) primeTask('defense-patents', () => { panel.refresh(); return Promise.resolve(); });
    }
    if (shouldPrime('macro-tiles')) {
      const panel = this.state.panels['macro-tiles'] as MacroTilesPanel | undefined;
      if (panel) primeTask('macro-tiles', () => panel.fetchData());
    }
    if (shouldPrime('fsi')) {
      const panel = this.state.panels['fsi'] as FSIPanel | undefined;
      if (panel) primeTask('fsi', () => panel.fetchData());
    }
    if (shouldPrime('yield-curve')) {
      const panel = this.state.panels['yield-curve'] as YieldCurvePanel | undefined;
      if (panel) primeTask('yield-curve', () => panel.fetchData());
    }
    if (shouldPrime('earnings-calendar')) {
      const panel = this.state.panels['earnings-calendar'] as EarningsCalendarPanel | undefined;
      if (panel) primeTask('earnings-calendar', () => panel.fetchData());
    }
    if (shouldPrime('economic-calendar')) {
      const panel = this.state.panels['economic-calendar'] as EconomicCalendarPanel | undefined;
      if (panel) primeTask('economic-calendar', () => panel.fetchData());
    }
    if (shouldPrime('cot-positioning')) {
      const panel = this.state.panels['cot-positioning'] as unknown as RefreshablePanel | undefined;
      if (panel) primeTask('cot-positioning', () => panel.fetchData());
    }
    if (shouldPrime('liquidity-shifts')) {
      const panel = this.state.panels['liquidity-shifts'] as LiquidityShiftsPanel | undefined;
      if (panel) primeTask('liquidity-shifts', () => panel.fetchData());
    }
    if (shouldPrime('positioning-247')) {
      const panel = this.state.panels['positioning-247'] as unknown as RefreshablePanel | undefined;
      if (panel) primeTask('positioning-247', () => panel.fetchData());
    }
    if (shouldPrime('gold-intelligence')) {
      const panel = this.state.panels['gold-intelligence'] as GoldIntelligencePanel | undefined;
      if (panel) primeTask('gold-intelligence', () => panel.fetchData());
    }
    if (shouldPrime('aaii-sentiment')) {
      primeTask('aaiiSentiment', () => this.dataLoader.loadAaiiSentiment());
    }
    if (shouldPrime('market-breadth')) {
      primeTask('marketBreadth', () => this.dataLoader.loadMarketBreadth());
    }
    if (shouldPrimeAny(['markets', 'heatmap', 'commodities', 'crypto', 'energy-complex'])) {
      primeTask('markets', () => this.dataLoader.loadMarkets());
    }
    if (shouldPrime('polymarket')) {
      primeTask('predictions', () => this.dataLoader.loadPredictions());
    }
    if (shouldPrime('economic')) {
      primeTask('fred', () => this.dataLoader.loadFredData());
      primeTask('spending', () => this.dataLoader.loadGovernmentSpending());
      primeTask('bis', () => this.dataLoader.loadBisData());
    }
    if (shouldPrime('energy-complex')) {
      primeTask('oil', () => this.dataLoader.loadOilAnalytics());
    }
    if (shouldPrime('trade-policy')) {
      primeTask('tradePolicy', () => this.dataLoader.loadTradePolicy());
    }
    if (shouldPrime('cross-source-signals')) {
      primeTask('crossSourceSignals', () => this.dataLoader.loadCrossSourceSignals());
    }

    const _wmAccess = hasPremiumAccess();
    if (_wmAccess) {
      if (shouldPrime('stock-analysis')) {
        primeTask('stockAnalysis', () => this.dataLoader.loadStockAnalysis());
      }
      if (shouldPrime('stock-backtest')) {
        primeTask('stockBacktest', () => this.dataLoader.loadStockBacktest());
      }
      if (shouldPrime('daily-market-brief')) {
        primeTask('dailyMarketBrief', () => this.dataLoader.loadDailyMarketBrief());
      }
      if (shouldPrime('market-implications')) {
        primeTask('marketImplications', () => this.dataLoader.loadMarketImplications());
      }
    }

    if (tasks.length > 0) {
      await Promise.allSettled(tasks);
    }
  }

  constructor(containerId: string) {
    const el = document.getElementById(containerId);
    if (!el) throw new Error(`Container ${containerId} not found`);

    const PANEL_ORDER_KEY = 'panel-order';
    const PANEL_SPANS_KEY = 'startupintelligence-panel-spans';

    const isMobile = isMobileDevice();
    const isDesktopApp = isDesktopRuntime();
    const monitors = loadFromStorage<Monitor[]>(STORAGE_KEYS.monitors, []);

    // Use mobile-specific defaults on first load (no saved layers)
    const defaultLayers = isMobile ? MOBILE_DEFAULT_MAP_LAYERS : DEFAULT_MAP_LAYERS;

    let mapLayers: MapLayers;
    let panelSettings: Record<string, PanelConfig>;

    // Panels that must survive variant switches: desktop config, user-created widgets, MCP panels.
    const isDynamicPanel = (k: string) => k === 'runtime-config' || k.startsWith('cw-') || k.startsWith('mcp-');

    // Check if variant changed - reset all settings to variant defaults
    const storedVariant = localStorage.getItem('startup-intelligence-variant');
    const currentVariant = SITE_VARIANT;
    console.log(`[App] Variant check: stored="${storedVariant}", current="${currentVariant}"`);
    if (storedVariant !== currentVariant) {
      // Variant changed — seed new variant's panels, disable panels not in the new variant
      console.log('[App] Variant changed - seeding new defaults, disabling cross-variant panels');
      localStorage.setItem('startup-intelligence-variant', currentVariant);
      // Reset map layers for the new variant (map layers are not user-personalized the same way)
      localStorage.removeItem(STORAGE_KEYS.mapLayers);
      mapLayers = normalizeExclusiveChoropleths(
        sanitizeLayersForVariant({ ...defaultLayers }, currentVariant as MapVariant), null,
      );
      // Load existing panel prefs (if any), disable panels not belonging to the new variant
      panelSettings = loadFromStorage<Record<string, PanelConfig>>(STORAGE_KEYS.panels, {});
      const newVariantKeys = new Set(VARIANT_DEFAULTS[currentVariant] ?? []);
      for (const key of Object.keys(panelSettings)) {
        if (!newVariantKeys.has(key) && !isDynamicPanel(key) && panelSettings[key]) {
          panelSettings[key] = { ...panelSettings[key]!, enabled: false };
        }
      }
      for (const key of newVariantKeys) {
        if (!(key in panelSettings)) {
          panelSettings[key] = { ...getEffectivePanelConfig(key, currentVariant) };
        }
      }
    } else {
      mapLayers = normalizeExclusiveChoropleths(
        sanitizeLayersForVariant(
          loadFromStorage<MapLayers>(STORAGE_KEYS.mapLayers, defaultLayers),
          currentVariant as MapVariant,
        ), null,
      );
      panelSettings = loadFromStorage<Record<string, PanelConfig>>(
        STORAGE_KEYS.panels,
        DEFAULT_PANELS
      );

      // One-time migration: preserve user preferences across panel key renames.
      const PANEL_KEY_RENAMES_MIGRATION_KEY = 'startupintelligence-panel-key-renames-v2.6.8';
      if (!localStorage.getItem(PANEL_KEY_RENAMES_MIGRATION_KEY)) {
        let migrated = false;
        const keyRenames: Array<[string, string]> = [
          ['live-youtube', 'live-webcams'],
          ['pinned-webcams', 'windy-webcams'],
          ...(SITE_VARIANT === 'finance' ? [['regulation', 'fin-regulation'] as [string, string]] : []),
        ];
        // In non-finance variants, 'regulation' was dead config (no feeds). Just prune it.
        if (SITE_VARIANT !== 'finance' && panelSettings['regulation']) {
          delete panelSettings['regulation'];
          migrated = true;
        }
        for (const [legacyKey, nextKey] of keyRenames) {
          if (!panelSettings[legacyKey] || panelSettings[nextKey]) continue;
          panelSettings[nextKey] = {
            ...DEFAULT_PANELS[nextKey],
            ...panelSettings[legacyKey],
            name: DEFAULT_PANELS[nextKey]?.name ?? panelSettings[legacyKey].name,
          };
          delete panelSettings[legacyKey];
          migrated = true;
        }
        // Also migrate saved panel order/bottom-set entries for renamed keys
        for (const [legacyKey, nextKey] of keyRenames) {
          for (const orderKey of [PANEL_ORDER_KEY, PANEL_ORDER_KEY + '-bottom-set', PANEL_ORDER_KEY + '-bottom']) {
            try {
              const raw = localStorage.getItem(orderKey);
              if (!raw) continue;
              const arr = JSON.parse(raw);
              if (!Array.isArray(arr)) continue;
              const idx = arr.indexOf(legacyKey);
              if (idx !== -1) { arr[idx] = nextKey; localStorage.setItem(orderKey, JSON.stringify(arr)); migrated = true; }
            } catch { /* corrupt storage, skip */ }
          }
        }
        if (migrated) saveToStorage(STORAGE_KEYS.panels, panelSettings);
        localStorage.setItem(PANEL_KEY_RENAMES_MIGRATION_KEY, 'done');
      }

      // Merge in any panels from ALL_PANELS that didn't exist when settings were saved
      for (const key of Object.keys(ALL_PANELS)) {
        if (!(key in panelSettings)) {
          const config = getEffectivePanelConfig(key, SITE_VARIANT);
          const isInVariant = (VARIANT_DEFAULTS[SITE_VARIANT] ?? []).includes(key);
          panelSettings[key] = { ...config, enabled: isInVariant && config.enabled };
        }
      }

      // One-time migration: expose all panels to existing users (previously variant-gated)
      const UNIFIED_MIGRATION_KEY = 'startupintelligence-unified-panels-v1';
      if (!localStorage.getItem(UNIFIED_MIGRATION_KEY)) {
        const variantDefaults = new Set(VARIANT_DEFAULTS[SITE_VARIANT] ?? []);
        for (const key of Object.keys(ALL_PANELS)) {
          if (!(key in panelSettings)) {
            const config = getEffectivePanelConfig(key, SITE_VARIANT);
            panelSettings[key] = { ...config, enabled: variantDefaults.has(key) && config.enabled };
          }
        }
        saveToStorage(STORAGE_KEYS.panels, panelSettings);
        localStorage.setItem(UNIFIED_MIGRATION_KEY, 'done');
      }

      const STARTUP_PANEL_FOCUS_KEY = 'startupintelligence-startup-panel-focus-v1';
      if (SITE_VARIANT === 'startup' && !localStorage.getItem(STARTUP_PANEL_FOCUS_KEY)) {
        const startupKeys = new Set(VARIANT_DEFAULTS.startup ?? []);
        for (const key of startupKeys) {
          const config = getEffectivePanelConfig(key, 'startup');
          panelSettings[key] = {
            ...config,
            ...panelSettings[key],
            name: config.name,
            enabled: panelSettings[key]?.enabled ?? config.enabled,
          };
        }
        for (const key of ['markets', 'macro-signals']) {
          if (panelSettings[key]) panelSettings[key] = { ...panelSettings[key]!, enabled: false };
        }
        try {
          const rawOrder = localStorage.getItem(PANEL_ORDER_KEY);
          const order = rawOrder ? JSON.parse(rawOrder) : [];
          if (Array.isArray(order)) {
            const withoutVc = order.filter((key) => key !== 'top-vc-signals');
            const insertAfter = withoutVc.includes('insights')
              ? withoutVc.indexOf('insights') + 1
              : withoutVc.includes('live-news')
                ? withoutVc.indexOf('live-news') + 1
                : 0;
            withoutVc.splice(insertAfter, 0, 'top-vc-signals');
            localStorage.setItem(PANEL_ORDER_KEY, JSON.stringify(withoutVc));
          }
        } catch { /* corrupt order, skip */ }
        saveToStorage(STORAGE_KEYS.panels, panelSettings);
        localStorage.setItem(STARTUP_PANEL_FOCUS_KEY, 'done');
      }

      const STARTUP_REQUIRED_PANELS_KEY = 'startupintelligence-startup-required-panels-v1';
      if (SITE_VARIANT === 'startup' && !localStorage.getItem(STARTUP_REQUIRED_PANELS_KEY)) {
        const requiredStartupPanels = [
          'producthunt',
          'funding',
          'startups',
          'vcblogs',
          'hardware',
          'fintech',
          'tech-readiness',
        ];
        for (const key of requiredStartupPanels) {
          const config = getEffectivePanelConfig(key, 'startup');
          panelSettings[key] = {
            ...config,
            ...panelSettings[key],
            name: config.name,
            enabled: true,
          };
        }
        saveToStorage(STORAGE_KEYS.panels, panelSettings);
        localStorage.setItem(STARTUP_REQUIRED_PANELS_KEY, 'done');
      }

      // One-time migration: fix happy variant sessions that got cross-variant panels enabled
      // (regression from #1911 unified panel registry which failed to disable non-variant panels on variant switch)
      const HAPPY_PANEL_FIX_KEY = 'startupintelligence-happy-panel-fix-v1';
      if (SITE_VARIANT === 'happy' && !localStorage.getItem(HAPPY_PANEL_FIX_KEY)) {
        const happyKeys = new Set(VARIANT_DEFAULTS['happy'] ?? []);
        let fixed = false;
        for (const key of Object.keys(panelSettings)) {
          if (!happyKeys.has(key) && !isDynamicPanel(key) && panelSettings[key]?.enabled) {
            panelSettings[key] = { ...panelSettings[key]!, enabled: false };
            fixed = true;
          }
        }
        if (fixed) saveToStorage(STORAGE_KEYS.panels, panelSettings);
        localStorage.setItem(HAPPY_PANEL_FIX_KEY, 'done');
      }

      console.log('[App] Loaded panel settings from storage:', Object.entries(panelSettings).filter(([_, v]) => !v.enabled).map(([k]) => k));

      // One-time migration: reorder panels for existing users (v1.9 panel layout)
      const PANEL_ORDER_MIGRATION_KEY = 'startupintelligence-panel-order-v1.9';
      if (!localStorage.getItem(PANEL_ORDER_MIGRATION_KEY)) {
        const savedOrder = localStorage.getItem(PANEL_ORDER_KEY);
        if (savedOrder) {
          try {
            const order: string[] = JSON.parse(savedOrder);
            const priorityPanels = ['insights', 'strategic-posture', 'cii', 'strategic-risk'];
            const filtered = order.filter(k => !priorityPanels.includes(k) && k !== 'live-news');
            const liveNewsIdx = order.indexOf('live-news');
            const newOrder = liveNewsIdx !== -1 ? ['live-news'] : [];
            newOrder.push(...priorityPanels.filter(p => order.includes(p)));
            newOrder.push(...filtered);
            localStorage.setItem(PANEL_ORDER_KEY, JSON.stringify(newOrder));
            console.log('[App] Migrated panel order to v1.9 layout');
          } catch {
            // Invalid saved order, will use defaults
          }
        }
        localStorage.setItem(PANEL_ORDER_MIGRATION_KEY, 'done');
      }

      // Tech variant migration: move insights to top (after live-news)
      if (currentVariant === 'tech') {
        const TECH_INSIGHTS_MIGRATION_KEY = 'startupintelligence-tech-insights-top-v1';
        if (!localStorage.getItem(TECH_INSIGHTS_MIGRATION_KEY)) {
          const savedOrder = localStorage.getItem(PANEL_ORDER_KEY);
          if (savedOrder) {
            try {
              const order: string[] = JSON.parse(savedOrder);
              const filtered = order.filter(k => k !== 'insights' && k !== 'live-news');
              const newOrder: string[] = [];
              if (order.includes('live-news')) newOrder.push('live-news');
              if (order.includes('insights')) newOrder.push('insights');
              newOrder.push(...filtered);
              localStorage.setItem(PANEL_ORDER_KEY, JSON.stringify(newOrder));
              console.log('[App] Tech variant: Migrated insights panel to top');
            } catch {
              // Invalid saved order, will use defaults
            }
          }
          localStorage.setItem(TECH_INSIGHTS_MIGRATION_KEY, 'done');
        }
      }
    }

    // One-time migration: prune removed panel keys from stored settings and order
    const PANEL_PRUNE_KEY = 'startupintelligence-panel-prune-v1';
    if (!localStorage.getItem(PANEL_PRUNE_KEY)) {
      const validKeys = new Set(Object.keys(ALL_PANELS));
      let pruned = false;
      for (const key of Object.keys(panelSettings)) {
        if (!validKeys.has(key) && key !== 'runtime-config') {
          delete panelSettings[key];
          pruned = true;
        }
      }
      if (pruned) saveToStorage(STORAGE_KEYS.panels, panelSettings);
      for (const orderKey of [PANEL_ORDER_KEY, PANEL_ORDER_KEY + '-bottom-set', PANEL_ORDER_KEY + '-bottom']) {
        try {
          const raw = localStorage.getItem(orderKey);
          if (!raw) continue;
          const arr = JSON.parse(raw);
          if (!Array.isArray(arr)) continue;
          const filtered = arr.filter((k: string) => validKeys.has(k));
          if (filtered.length !== arr.length) localStorage.setItem(orderKey, JSON.stringify(filtered));
        } catch { localStorage.removeItem(orderKey); }
      }
      localStorage.setItem(PANEL_PRUNE_KEY, 'done');
    }

    // One-time migration: clear stale panel ordering and sizing state
    const LAYOUT_RESET_MIGRATION_KEY = 'startupintelligence-layout-reset-v2.5';
    if (!localStorage.getItem(LAYOUT_RESET_MIGRATION_KEY)) {
      const hadSavedOrder = !!localStorage.getItem(PANEL_ORDER_KEY);
      const hadSavedSpans = !!localStorage.getItem(PANEL_SPANS_KEY);
      if (hadSavedOrder || hadSavedSpans) {
        localStorage.removeItem(PANEL_ORDER_KEY);
        localStorage.removeItem(PANEL_ORDER_KEY + '-bottom');
        localStorage.removeItem(PANEL_ORDER_KEY + '-bottom-set');
        localStorage.removeItem(PANEL_SPANS_KEY);
        console.log('[App] Applied layout reset migration (v2.5): cleared panel order/spans');
      }
      localStorage.setItem(LAYOUT_RESET_MIGRATION_KEY, 'done');
    }

    // Desktop key management panel must always remain accessible in Tauri.
    if (isDesktopApp) {
      if (!panelSettings['runtime-config'] || !panelSettings['runtime-config'].enabled) {
        panelSettings['runtime-config'] = {
          ...panelSettings['runtime-config'],
          name: panelSettings['runtime-config']?.name ?? 'Desktop Configuration',
          enabled: true,
          priority: panelSettings['runtime-config']?.priority ?? 2,
        };
        saveToStorage(STORAGE_KEYS.panels, panelSettings);
      }
    }

    const initialUrlState: ParsedMapUrlState | null = parseMapUrlState(window.location.search, mapLayers);
    if (initialUrlState.layers) {
      mapLayers = normalizeExclusiveChoropleths(
        sanitizeLayersForVariant(initialUrlState.layers, currentVariant as MapVariant), null,
      );
      initialUrlState.layers = mapLayers;
    }
    if (!CYBER_LAYER_ENABLED) {
      mapLayers.cyberThreats = false;
    }
    // One-time migration: reduce default-enabled sources (full variant only)
    if (currentVariant === 'full') {
      const baseKey = 'startupintelligence-sources-reduction-v3';
      if (!localStorage.getItem(baseKey)) {
        const defaultDisabled = computeDefaultDisabledSources();
        saveToStorage(STORAGE_KEYS.disabledFeeds, defaultDisabled);
        localStorage.setItem(baseKey, 'done');
        const total = getTotalFeedCount();
        console.log(`[App] Sources reduction: ${defaultDisabled.length} disabled, ${total - defaultDisabled.length} enabled`);
      }
      // Locale boost: additively enable locale-matched sources (runs once per locale)
      const userLang = ((navigator.language ?? 'en').split('-')[0] ?? 'en').toLowerCase();
      const localeKey = `startupintelligence-locale-boost-${userLang}`;
      if (userLang !== 'en' && !localStorage.getItem(localeKey)) {
        const boosted = getLocaleBoostedSources(userLang);
        if (boosted.size > 0) {
          const current = loadFromStorage<string[]>(STORAGE_KEYS.disabledFeeds, []);
          const updated = current.filter(name => !boosted.has(name));
          saveToStorage(STORAGE_KEYS.disabledFeeds, updated);
          console.log(`[App] Locale boost (${userLang}): enabled ${current.length - updated.length} sources`);
        }
        localStorage.setItem(localeKey, 'done');
      }
    }

    const disabledSources = new Set(loadFromStorage<string[]>(STORAGE_KEYS.disabledFeeds, []));

    // Build shared state object
    this.state = {
      map: null,
      isMobile,
      isDesktopApp,
      container: el,
      panels: {},
      newsPanels: {},
      panelSettings,
      mapLayers,
      allNews: [],
      newsByCategory: {},
      latestMarkets: [],
      latestPredictions: [],
      latestClusters: [],
      intelligenceCache: {},
      cyberThreatsCache: null,
      disabledSources,
      currentTimeRange: '7d',
      inFlight: new Set(),
      seenGeoAlerts: new Set(),
      monitors,
      signalModal: null,
      statusPanel: null,
      searchModal: null,
      findingsBadge: null,
      breakingBanner: null,
      playbackControl: null,
      exportPanel: null,
      unifiedSettings: null,
      pizzintIndicator: null,
      correlationEngine: null,
      llmStatusIndicator: null,
      positivePanel: null,
      countersPanel: null,
      progressPanel: null,
      breakthroughsPanel: null,
      heroPanel: null,
      digestPanel: null,
      speciesPanel: null,
      renewablePanel: null,
      authModal: null,
      authHeaderWidget: null,
      tvMode: null,
      happyAllItems: [],
      isDestroyed: false,
      isPlaybackMode: false,
      isIdle: false,
      initialLoadComplete: false,
      resolvedLocation: 'global',
      initialUrlState,
      PANEL_ORDER_KEY,
      PANEL_SPANS_KEY,
    };

  }

  private async setupModules(): Promise<void> {
    const [{ DataLoaderManager }, { EventHandlerManager }] = await Promise.all([
      import('@/app/startup-data-loader'),
      import('@/app/event-handlers'),
    ]);

    // Instantiate modules (callbacks wired after all modules exist)
    this.refreshScheduler = new RefreshScheduler(this.state);
    this.countryIntel = new CountryIntelManager(this.state);
    this.desktopUpdater = new DesktopUpdater(this.state);

    this.dataLoader = new DataLoaderManager(this.state, {
      renderCriticalBanner: (postures) => this.panelLayout.renderCriticalBanner(postures),
      refreshOpenCountryBrief: () => this.countryIntel.refreshOpenBrief(),
    });

    this.searchManager = new SearchManager(this.state, {
      openCountryBriefByCode: (code, country) => this.countryIntel.openCountryBriefByCode(code, country),
    });

    this.panelLayout = new PanelLayoutManager(this.state, {
      openCountryStory: (code, name) => this.countryIntel.openCountryStory(code, name),
      openCountryBrief: (code) => {
        const name = CountryIntelManager.resolveCountryName(code);
        void this.countryIntel.openCountryBriefByCode(code, name);
      },
      loadAllData: () => this.dataLoader.loadAllData(),
      updateMonitorResults: () => this.dataLoader.updateMonitorResults(),
      loadSecurityAdvisories: () => this.dataLoader.loadSecurityAdvisories(),
    });

    this.eventHandlers = new EventHandlerManager(this.state, {
      updateSearchIndex: () => this.searchManager.updateSearchIndex(),
      loadAllData: () => this.dataLoader.loadAllData(),
      flushStaleRefreshes: () => this.refreshScheduler.flushStaleRefreshes(),
      setHiddenSince: (ts) => this.refreshScheduler.setHiddenSince(ts),
      loadDataForLayer: (layer) => { void this.dataLoader.loadDataForLayer(layer as keyof MapLayers); },
      waitForAisData: () => this.dataLoader.waitForAisData(),
      syncDataFreshnessWithLayers: () => this.dataLoader.syncDataFreshnessWithLayers(),
      ensureCorrectZones: () => this.panelLayout.ensureCorrectZones(),
      refreshOpenCountryBrief: () => this.countryIntel.refreshOpenBrief(),
      stopLayerActivity: (layer) => this.dataLoader.stopLayerActivity(layer),
      mountLiveNewsIfReady: () => this.panelLayout.mountLiveNewsIfReady(),
      updateFlightSource: (adsb, military) => this.searchManager.updateFlightSource(adsb, military),
    });

    // Wire cross-module callback: DataLoader → SearchManager
    this.dataLoader.updateSearchIndex = () => this.searchManager.updateSearchIndex();

    // Track destroy order (reverse of init)
    this.modules = [
      this.desktopUpdater,
      this.panelLayout,
      this.countryIntel,
      this.searchManager,
      this.dataLoader,
      this.refreshScheduler,
      this.eventHandlers,
    ];
  }

  public async init(): Promise<void> {
    const initStart = performance.now();
    await this.setupModules();
    await initDB();
    await initI18n();
    const legacyRuntime: typeof NonStartupRuntime | null =
      IS_STARTUP_BUILD ? null : await import('@/app/non-startup-runtime');
    const aiFlow = getAiFlowSettings();
    if (aiFlow.browserModel || isDesktopRuntime()) {
      const worker = await getMlWorker();
      await worker.init();
      if (BETA_MODE) worker.loadModel('summarization-beta').catch(() => { });
    }

    if (aiFlow.headlineMemory) {
      getMlWorker().then(worker => worker.init().then(ok => {
        if (ok) worker.loadModel('embeddings').catch(() => { });
      }).catch(() => { })).catch(() => { });
    }

    this.unsubAiFlow = subscribeAiFlowChange((key) => {
      if (key === 'browserModel') {
        const s = getAiFlowSettings();
        if (s.browserModel) {
          void getMlWorker().then(worker => worker.init());
        } else if (!isHeadlineMemoryEnabled()) {
          void getMlWorker().then(worker => worker.terminate());
        }
      }
      if (key === 'headlineMemory') {
        if (isHeadlineMemoryEnabled()) {
          getMlWorker().then(worker => worker.init().then(ok => {
            if (ok) worker.loadModel('embeddings').catch(() => { });
          }).catch(() => { })).catch(() => { });
        } else {
          void getMlWorker().then(worker => worker.unloadModel('embeddings').catch(() => { }));
          const s = getAiFlowSettings();
          if (!s.browserModel && !isDesktopRuntime()) {
            void getMlWorker().then(worker => worker.terminate());
          }
        }
      }
    });

    // Check AIS configuration before init. Legacy maritime code is lazy so startup builds
    // do not pull AIS helpers unless the layer is actually available.
    if (SITE_VARIANT === 'startup') {
      this.state.mapLayers.ais = false;
    } else {
      await legacyRuntime?.setupLegacyAis(this.state);
    }

    // Wait for sidecar readiness on desktop so bootstrap hits a live server
    if (isDesktopRuntime()) {
      await waitForSidecarReady(3000);
    }

    // Startup Intelligence does not need the legacy Startup Intelligence bootstrap
    // envelope. Its active modules fetch their own focused sources.
    if (legacyRuntime) {
      this.bootstrapHydrationState = await legacyRuntime.fetchLegacyBootstrap();
    }

    // Verify OAuth OTT and hydrate auth session BEFORE any UI subscribes to auth state
    await initAuthState();
    initAuthAnalytics();
    installCloudPrefsSync(SITE_VARIANT);
    this.enforceFreeTierLimits();

    let _prevUserId: string | null = null;
    this.unsubFreeTier = subscribeAuthState((session) => {
      this.enforceFreeTierLimits();
      const userId = session.user?.id ?? null;
      if (userId !== null && userId !== _prevUserId) {
        void cloudPrefsSignIn(userId, SITE_VARIANT);

        // Rebind Convex watches to the real Clerk userId (was bound to anon UUID at init)
        destroyEntitlementSubscription();
        destroySubscriptionWatch();
        void initEntitlementSubscription(userId);
        void initSubscriptionWatch(userId);

        // Claim any anonymous purchase made before sign-in (anon → real user migration)
        const anonId = localStorage.getItem('si-anon-id');
        if (anonId) {
          void (async () => {
            const [client, api] = await Promise.all([getConvexClient(), getConvexApi()]);
            if (!client || !api) return;
            // Wait for ConvexClient WebSocket auth handshake to complete.
            // Without this, mutations arrive at Convex before the server
            // has the JWT → "Authentication required" errors.
            const ready = await waitForConvexAuth(10_000);
            if (!ready) {
              console.warn('[billing] claimSubscription skipped — Convex auth not ready');
              return;
            }
            const result = await client.mutation(api.payments.billing.claimSubscription, { anonId });
            const claimed = result.claimed;
            const totalClaimed = claimed.subscriptions + claimed.entitlements +
                                 claimed.customers + claimed.payments;
            if (totalClaimed > 0) {
              console.log('[billing] Claimed anon subscription on sign-in:', claimed);
            }
            // Always remove after non-throwing completion — mutation is idempotent.
            // Prevents cold Convex init + mutation on every sign-in for non-purchasers.
            localStorage.removeItem('si-anon-id');
          })().catch((err: unknown) => {
            console.warn('[billing] claimSubscription failed:', err);
            // Non-fatal — anon ID preserved for retry on next page load
          });
        }
        void resumePendingCheckout({
          openAuth: () => this.state.authModal?.open(),
        });
      } else if (userId === null && _prevUserId !== null) {
        destroyEntitlementSubscription();
        destroySubscriptionWatch();
        cloudPrefsSignOut();
        resetEntitlementState();
      }
      _prevUserId = userId;
    });


    const geoCoordsPromise: Promise<PreciseCoordinates | null> =
      this.state.isMobile && this.state.initialUrlState?.lat === undefined && this.state.initialUrlState?.lon === undefined
        ? resolvePreciseUserCoordinates(5000)
        : Promise.resolve(null);

    const resolvedRegion = await resolveUserRegion();
    this.state.resolvedLocation = resolvedRegion;

    // Phase 1: Layout (creates map + panels — they'll find hydrated data)
    await this.panelLayout.init();
    this.updateConnectivityUi();
    window.addEventListener('online', this.handleConnectivityChange);
    window.addEventListener('offline', this.handleConnectivityChange);

    const mobileGeoCoords = await geoCoordsPromise;
    if (mobileGeoCoords && this.state.map) {
      this.state.map.setCenter(mobileGeoCoords.lat, mobileGeoCoords.lon, 6);
    }

    // Happy variant: pre-populate panels from persistent cache for instant render
    if (SITE_VARIANT === 'happy') {
      await this.dataLoader.hydrateHappyPanelsFromCache();
    }

    // Phase 2: Shared UI components
    if (legacyRuntime) {
      await legacyRuntime.setupLegacySignalUi(this.state);
    }
    if (!this.state.isMobile && legacyRuntime) {
      await legacyRuntime.setupLegacyFindingsBadge(this.state);
    }

    if (!this.state.isMobile && legacyRuntime) {
      await legacyRuntime.setupLegacyBreakingNews(this.state);
    }

    // Phase 3: UI setup methods
    this.eventHandlers.startHeaderClock();
    await this.eventHandlers.setupPlaybackControl();
    await this.eventHandlers.setupStatusPanel();
    await this.eventHandlers.setupPizzIntIndicator();
    await this.eventHandlers.setupLlmStatusIndicator();
    await this.eventHandlers.setupExportPanel();

    // Correlation engine
    if (legacyRuntime) {
      await legacyRuntime.setupLegacyCorrelationEngine(this.state);
    }
    await this.eventHandlers.setupUnifiedSettings();
    await this.eventHandlers.setupAuthWidget();
    const pendingCheckout = capturePendingCheckoutIntentFromUrl();
    if (pendingCheckout) {
      // Checkout intent from /pro page redirect. Resume immediately if
      // already authenticated, otherwise the auth callback handles it.
      void resumePendingCheckout({
        openAuth: () => this.state.authModal?.open(),
      });
    }

    // Phase 4: SearchManager, MapLayerHandlers, CountryIntel
    this.searchManager.init();
    this.eventHandlers.setupMapLayerHandlers();
    this.countryIntel.init();

    // Phase 5: Event listeners + URL sync
    this.eventHandlers.init();
    // Capture deep link params BEFORE URL sync overwrites them
    const initState = parseMapUrlState(window.location.search, this.state.mapLayers);
    this.pendingDeepLinkCountry = initState.country ?? null;
    this.eventHandlers.setupUrlStateSync();

    // Start deep link handling early — its retry loop polls hasSufficientData()
    // independently, so it must not be gated behind loadAllData() which can hang.
    this.handleDeepLinks();

    // Phase 6: Data loading
    this.dataLoader.syncDataFreshnessWithLayers();
    await preloadCountryGeometry();
    // Prime panel-specific data concurrently with bulk loading.
    // primeVisiblePanelData owns ETF, Stablecoins, Gulf Economies, etc. that
    // are NOT part of loadAllData. Running them in parallel prevents those
    // panels from being blocked when a loadAllData batch is slow.
    window.addEventListener('scroll', this.handleViewportPrime, { passive: true });
    window.addEventListener('resize', this.handleViewportPrime);
    await Promise.all([
      this.dataLoader.loadAllData(true),
      this.primeVisiblePanelData(true),
    ]);

    // If bootstrap was served from cache but live data just loaded, promote the status indicator.
    if (legacyRuntime) {
      this.bootstrapHydrationState = await legacyRuntime.promoteLegacyBootstrap();
      this.updateConnectivityUi();
    }

    // Initial correlation engine run
    legacyRuntime?.runLegacyCorrelationEngine(this.state);

    await legacyRuntime?.startLegacyCountryLearning();

    // Hide unconfigured layers after first data load
    if (SITE_VARIANT === 'startup') {
      this.state.map?.hideLayerToggle('ais');
      this.state.map?.hideLayerToggle('outages');
    } else {
      await legacyRuntime?.hideLegacyUnconfiguredLayers(this.state);
    }
    if (!CYBER_LAYER_ENABLED) {
      this.state.map?.hideLayerToggle('cyberThreats');
    }

    // Phase 7: Refresh scheduling
    this.setupRefreshIntervals();
    this.eventHandlers.setupSnapshotSaving();
    cleanOldSnapshots().catch((e) => console.warn('[Storage] Snapshot cleanup failed:', e));

    // Phase 8: Update checks
    this.desktopUpdater.init();

    // Analytics
    trackEvent('si_app_loaded', {
      load_time_ms: Math.round(performance.now() - initStart),
      panel_count: Object.keys(this.state.panels).length,
    });
    this.eventHandlers.setupPanelViewTracking();
  }

  /**
   * Enforce free-tier panel and source limits.
   * Reads current values from storage, trims if necessary, and saves back.
   * Safe to call multiple times (idempotent) — e.g. on auth state changes.
   */
  private enforceFreeTierLimits(): void {
    if (isProUser()) return;

    // --- Panel limit ---
    const panelSettings = loadFromStorage<Record<string, PanelConfig>>(STORAGE_KEYS.panels, {});
    let cwDisabled = false;
    for (const key of Object.keys(panelSettings)) {
      if (key.startsWith('cw-') && panelSettings[key]?.enabled) {
        panelSettings[key] = { ...panelSettings[key]!, enabled: false };
        cwDisabled = true;
      }
    }
    const enabledKeys = Object.entries(panelSettings)
      .filter(([k, v]) => v.enabled && !k.startsWith('cw-'))
      .sort(([ka, a], [kb, b]) => (a.priority ?? 99) - (b.priority ?? 99) || ka.localeCompare(kb))
      .map(([k]) => k);
    const needsTrim = enabledKeys.length > FREE_MAX_PANELS;
    if (needsTrim) {
      for (const key of enabledKeys.slice(FREE_MAX_PANELS)) {
        panelSettings[key] = { ...panelSettings[key]!, enabled: false };
      }
      console.log(`[App] Free tier: trimmed ${enabledKeys.length - FREE_MAX_PANELS} panel(s) to enforce ${FREE_MAX_PANELS}-panel limit`);
    }
    if (cwDisabled || needsTrim) saveToStorage(STORAGE_KEYS.panels, panelSettings);

    // --- Source limit ---
    const disabledSources = new Set(loadFromStorage<string[]>(STORAGE_KEYS.disabledFeeds, []));
    const startupProtectedSources = this.getStartupProtectedSources();
    let protectedSourcesChanged = false;
    if (SITE_VARIANT === 'startup') {
      for (const name of startupProtectedSources) {
        if (disabledSources.delete(name)) protectedSourcesChanged = true;
      }
    }
    const allSourceNames = (() => {
      const s = new Set<string>();
      Object.values(FEEDS).forEach(feeds => feeds?.forEach(f => s.add(f.name)));
      INTEL_SOURCES.forEach(f => s.add(f.name));
      return Array.from(s).sort((a, b) => a.localeCompare(b));
    })();
    const currentlyEnabled = allSourceNames.filter(n => !disabledSources.has(n));
    const enabledCount = currentlyEnabled.length;
    if (enabledCount > FREE_MAX_SOURCES) {
      const toDisable = enabledCount - FREE_MAX_SOURCES;
      const disableCandidates = currentlyEnabled.filter((name) => !startupProtectedSources.has(name));
      for (const name of disableCandidates.slice(0, toDisable)) {
        disabledSources.add(name);
      }
      saveToStorage(STORAGE_KEYS.disabledFeeds, Array.from(disabledSources));
      console.log(`[App] Free tier: disabled ${toDisable} source(s) to enforce ${FREE_MAX_SOURCES}-source limit`);
    } else if (protectedSourcesChanged) {
      saveToStorage(STORAGE_KEYS.disabledFeeds, Array.from(disabledSources));
    }
  }

  private getStartupProtectedSources(): Set<string> {
    if (SITE_VARIANT !== 'startup') return new Set();
    const fullyProtectedCategories = ['producthunt', 'funding', 'vcblogs', 'startups', 'hardware'];
    const minimumProtectedCategories = [
      'tech',
      'finance',
      'layoffs',
      'ai',
      'cloud',
      'fintech',
      'regionalStartups',
      'unicorns',
      'accelerators',
      'security',
      'policy',
      'ipo',
    ];
    const names = new Set<string>();
    for (const category of fullyProtectedCategories) {
      for (const feed of FEEDS[category] ?? []) names.add(feed.name);
    }
    for (const category of minimumProtectedCategories) {
      const firstFeed = FEEDS[category]?.[0];
      if (firstFeed) names.add(firstFeed.name);
    }
    return names;
  }

  public destroy(): void {
    this.state.isDestroyed = true;
    window.removeEventListener('scroll', this.handleViewportPrime);
    window.removeEventListener('resize', this.handleViewportPrime);
    window.removeEventListener('online', this.handleConnectivityChange);
    window.removeEventListener('offline', this.handleConnectivityChange);
    if (this.visiblePanelPrimeRaf !== null) {
      window.cancelAnimationFrame(this.visiblePanelPrimeRaf);
      this.visiblePanelPrimeRaf = null;
    }

    // Destroy all modules in reverse order
    for (let i = this.modules.length - 1; i >= 0; i--) {
      this.modules[i]!.destroy();
    }

    // Clean up subscriptions, map, AIS, and breaking news
    this.unsubAiFlow?.();
    this.unsubFreeTier?.();
    if (IS_STARTUP_BUILD) {
      this.state.breakingBanner?.destroy();
    } else {
      void import('@/app/non-startup-runtime')
        .then(({ destroyLegacyRuntime }) => destroyLegacyRuntime(this.state))
        .catch(() => {});
    }
    this.cachedModeBannerEl?.remove();
    this.cachedModeBannerEl = null;
    this.state.map?.destroy();
  }

  private handleDeepLinks(): void {
    const DEEP_LINK_INITIAL_DELAY_MS = 1500;

    // Startup keeps country deep links as map focus only. Legacy story/brief UI is removed.
    const deepLinkCountry = this.pendingDeepLinkCountry;
    this.pendingDeepLinkCountry = null;
    if (deepLinkCountry) {
      trackDeeplinkOpened('country', deepLinkCountry);
      const cName = CountryIntelManager.resolveCountryName(deepLinkCountry);
      setTimeout(() => {
        this.countryIntel.openCountryBriefByCode(deepLinkCountry, cName);
        this.eventHandlers.syncUrlState();
      }, DEEP_LINK_INITIAL_DELAY_MS);
    }
  }

  private setupRefreshIntervals(): void {
    // Always refresh news for all variants
    this.refreshScheduler.scheduleRefresh('news', () => this.dataLoader.loadNews(), REFRESH_INTERVALS.feeds);

    if (SITE_VARIANT === 'startup') {
      this.refreshScheduler.scheduleRefresh(
        'markets',
        () => this.dataLoader.loadMarkets(),
        REFRESH_INTERVALS.markets,
        () => this.isPanelNearViewport('markets'),
      );
      this.refreshScheduler.scheduleRefresh(
        'macro-signals',
        () => (this.state.panels['macro-signals'] as MacroSignalsPanel).fetchData(),
        REFRESH_INTERVALS.macroSignals,
        () => this.isPanelNearViewport('macro-signals'),
      );
      return;
    }

    // Happy variant only refreshes news -- skip all geopolitical/financial/military refreshes
    if (SITE_VARIANT !== 'happy') {
      this.refreshScheduler.registerAll([
        {
          name: 'markets',
          fn: () => this.dataLoader.loadMarkets(),
          intervalMs: REFRESH_INTERVALS.markets,
          condition: () => this.isAnyPanelNearViewport(['markets', 'heatmap', 'commodities', 'crypto', 'crypto-heatmap', 'defi-tokens', 'ai-tokens', 'other-tokens']),
        },
        {
          name: 'predictions',
          fn: () => this.dataLoader.loadPredictions(),
          intervalMs: REFRESH_INTERVALS.predictions,
          condition: () => this.isPanelNearViewport('polymarket'),
        },
        {
          name: 'forecasts',
          fn: () => this.dataLoader.loadForecasts(),
          intervalMs: REFRESH_INTERVALS.forecasts,
          condition: () => this.isPanelNearViewport('forecast'),
        },
        { name: 'pizzint', fn: () => this.dataLoader.loadPizzInt(), intervalMs: REFRESH_INTERVALS.pizzint, condition: () => SITE_VARIANT === 'full' },
        { name: 'natural', fn: () => this.dataLoader.loadNatural(), intervalMs: REFRESH_INTERVALS.natural, condition: () => this.state.mapLayers.natural },
        { name: 'weather', fn: () => this.dataLoader.loadWeatherAlerts(), intervalMs: REFRESH_INTERVALS.weather, condition: () => this.state.mapLayers.weather },
        { name: 'fred', fn: () => this.dataLoader.loadFredData(), intervalMs: REFRESH_INTERVALS.fred, condition: () => this.isPanelNearViewport('economic') },
        { name: 'spending', fn: () => this.dataLoader.loadGovernmentSpending(), intervalMs: REFRESH_INTERVALS.spending, condition: () => this.isPanelNearViewport('economic') },
        { name: 'bis', fn: () => this.dataLoader.loadBisData(), intervalMs: REFRESH_INTERVALS.bis, condition: () => this.isPanelNearViewport('economic') },
        { name: 'oil', fn: () => this.dataLoader.loadOilAnalytics(), intervalMs: REFRESH_INTERVALS.oil, condition: () => this.isPanelNearViewport('energy-complex') },
        { name: 'firms', fn: () => this.dataLoader.loadFirmsData(), intervalMs: REFRESH_INTERVALS.firms, condition: () => this.shouldRefreshFirms() },
        { name: 'ais', fn: () => this.dataLoader.loadAisSignals(), intervalMs: REFRESH_INTERVALS.ais, condition: () => this.state.mapLayers.ais },
        { name: 'cables', fn: () => this.dataLoader.loadCableActivity(), intervalMs: REFRESH_INTERVALS.cables, condition: () => this.state.mapLayers.cables },
        { name: 'cableHealth', fn: () => this.dataLoader.loadCableHealth(), intervalMs: REFRESH_INTERVALS.cableHealth, condition: () => this.state.mapLayers.cables },
        { name: 'flights', fn: () => this.dataLoader.loadFlightDelays(), intervalMs: REFRESH_INTERVALS.flights, condition: () => this.state.mapLayers.flights },
        {
          name: 'cyberThreats', fn: () => {
            this.state.cyberThreatsCache = null;
            return this.dataLoader.loadCyberThreats();
          }, intervalMs: REFRESH_INTERVALS.cyberThreats, condition: () => CYBER_LAYER_ENABLED && this.state.mapLayers.cyberThreats
        },
      ]);
    }

    if (SITE_VARIANT === 'finance') {
      this.refreshScheduler.scheduleRefresh(
        'stock-analysis',
        () => this.dataLoader.loadStockAnalysis(),
        REFRESH_INTERVALS.stockAnalysis,
        () => hasPremiumAccess() && this.isPanelNearViewport('stock-analysis'),
      );
      this.refreshScheduler.scheduleRefresh(
        'daily-market-brief',
        () => this.dataLoader.loadDailyMarketBrief(),
        REFRESH_INTERVALS.dailyMarketBrief,
        () => hasPremiumAccess() && this.isPanelNearViewport('daily-market-brief'),
      );
      this.refreshScheduler.scheduleRefresh(
        'stock-backtest',
        () => this.dataLoader.loadStockBacktest(),
        REFRESH_INTERVALS.stockBacktest,
        () => hasPremiumAccess() && this.isPanelNearViewport('stock-backtest'),
      );
      this.refreshScheduler.scheduleRefresh(
        'market-implications',
        () => this.dataLoader.loadMarketImplications(),
        REFRESH_INTERVALS.marketImplications,
        () => hasPremiumAccess() && this.isPanelNearViewport('market-implications'),
      );
    }

    // Panel-level refreshes (moved from panel constructors into scheduler for hidden-tab awareness + jitter)
    this.refreshScheduler.scheduleRefresh(
      'service-status',
      () => (this.state.panels['service-status'] as ServiceStatusPanel).fetchStatus(),
      REFRESH_INTERVALS.serviceStatus,
      () => this.isPanelNearViewport('service-status')
    );
    this.refreshScheduler.scheduleRefresh(
      'stablecoins',
      () => (this.state.panels.stablecoins as StablecoinPanel).fetchData(),
      REFRESH_INTERVALS.stablecoins,
      () => this.isPanelNearViewport('stablecoins')
    );
    this.refreshScheduler.scheduleRefresh(
      'energy-crisis',
      () => (this.state.panels['energy-crisis'] as EnergyCrisisPanel).fetchData(),
      REFRESH_INTERVALS.energyCrisis,
      () => this.isPanelNearViewport('energy-crisis')
    );
    this.refreshScheduler.scheduleRefresh(
      'etf-flows',
      () => (this.state.panels['etf-flows'] as ETFFlowsPanel).fetchData(),
      REFRESH_INTERVALS.etfFlows,
      () => this.isPanelNearViewport('etf-flows')
    );
    this.refreshScheduler.scheduleRefresh(
      'macro-signals',
      () => (this.state.panels['macro-signals'] as MacroSignalsPanel).fetchData(),
      REFRESH_INTERVALS.macroSignals,
      () => this.isPanelNearViewport('macro-signals')
    );
    this.refreshScheduler.scheduleRefresh(
      'defense-patents',
      () => { (this.state.panels['defense-patents'] as unknown as RefreshOnlyPanel).refresh(); return Promise.resolve(); },
      REFRESH_INTERVALS.defensePatents,
      () => this.isPanelNearViewport('defense-patents')
    );
    this.refreshScheduler.scheduleRefresh(
      'fear-greed',
      () => (this.state.panels['fear-greed'] as FearGreedPanel).fetchData(),
      REFRESH_INTERVALS.fearGreed,
      () => this.isPanelNearViewport('fear-greed')
    );
    this.refreshScheduler.scheduleRefresh(
      'positioning-247',
      () => (this.state.panels['positioning-247'] as unknown as RefreshablePanel).fetchData(),
      REFRESH_INTERVALS.hyperliquidFlow,
      () => this.isPanelNearViewport('positioning-247')
    );
    this.refreshScheduler.scheduleRefresh(
      'strategic-posture',
      () => (this.state.panels['strategic-posture'] as unknown as RefreshOnlyPanel).refresh(),
      REFRESH_INTERVALS.strategicPosture,
      () => this.isPanelNearViewport('strategic-posture')
    );
    this.refreshScheduler.scheduleRefresh(
      'strategic-risk',
      () => (this.state.panels['strategic-risk'] as StrategicRiskPanel).refresh(),
      REFRESH_INTERVALS.strategicRisk,
      () => this.isPanelNearViewport('strategic-risk')
    );

    this.refreshScheduler.scheduleRefresh(
      'wsb-tickers',
      () => this.dataLoader.loadWsbTickers(),
      REFRESH_INTERVALS.wsbTickers,
      () => hasPremiumAccess() && this.isPanelNearViewport('wsb-ticker-scanner'),
    );

    // Server-side temporal anomalies (news + satellite_fires)
    if (SITE_VARIANT !== 'happy') {
      this.refreshScheduler.scheduleRefresh('temporalBaseline', () => this.dataLoader.refreshTemporalBaseline(), REFRESH_INTERVALS.temporalBaseline, () => this.shouldRefreshIntelligence());
    }

    // WTO trade policy data — annual data, poll every 10 min to avoid hammering upstream
    if (SITE_VARIANT === 'full' || SITE_VARIANT === 'finance' || SITE_VARIANT === 'commodity') {
      this.refreshScheduler.scheduleRefresh('tradePolicy', () => this.dataLoader.loadTradePolicy(), REFRESH_INTERVALS.tradePolicy, () => this.isPanelNearViewport('trade-policy'));
    }

    this.refreshScheduler.scheduleRefresh(
      'cross-source-signals',
      () => this.dataLoader.loadCrossSourceSignals(),
      REFRESH_INTERVALS.crossSourceSignals,
      () => this.isPanelNearViewport('cross-source-signals'),
    );

    // Telegram Intel (near real-time, 60s refresh)
    this.refreshScheduler.scheduleRefresh(
      'telegram-intel',
      () => this.dataLoader.loadTelegramIntel(),
      REFRESH_INTERVALS.telegramIntel,
      () => this.isPanelNearViewport('telegram-intel')
    );

    this.refreshScheduler.scheduleRefresh(
      'gulf-economies',
      () => (this.state.panels['gulf-economies'] as unknown as RefreshablePanel).fetchData(),
      REFRESH_INTERVALS.gulfEconomies,
      () => this.isPanelNearViewport('gulf-economies')
    );

    this.refreshScheduler.scheduleRefresh(
      'grocery-basket',
      () => (this.state.panels['grocery-basket'] as unknown as RefreshablePanel).fetchData(),
      REFRESH_INTERVALS.groceryBasket,
      () => this.isPanelNearViewport('grocery-basket')
    );

    this.refreshScheduler.scheduleRefresh(
      'bigmac',
      () => (this.state.panels['bigmac'] as unknown as RefreshablePanel).fetchData(),
      REFRESH_INTERVALS.groceryBasket,
      () => this.isPanelNearViewport('bigmac')
    );

    this.refreshScheduler.scheduleRefresh(
      'fuel-prices',
      () => (this.state.panels['fuel-prices'] as FuelPricesPanel).fetchData(),
      REFRESH_INTERVALS.fuelPrices,
      () => this.isPanelNearViewport('fuel-prices')
    );

    this.refreshScheduler.scheduleRefresh(
      'fao-food-price-index',
      () => (this.state.panels['fao-food-price-index'] as unknown as RefreshablePanel).fetchData(),
      REFRESH_INTERVALS.faoFoodPriceIndex,
      () => this.isPanelNearViewport('fao-food-price-index')
    );

    this.refreshScheduler.scheduleRefresh(
      'oil-inventories',
      () => (this.state.panels['oil-inventories'] as OilInventoriesPanel).fetchData(),
      REFRESH_INTERVALS.oilInventories,
      () => this.isPanelNearViewport('oil-inventories')
    );

    this.refreshScheduler.scheduleRefresh(
      'climate-news',
      () => (this.state.panels['climate-news'] as unknown as RefreshablePanel).fetchData(),
      REFRESH_INTERVALS.climateNews,
      () => this.isPanelNearViewport('climate-news')
    );

    this.refreshScheduler.scheduleRefresh(
      'macro-tiles',
      () => (this.state.panels['macro-tiles'] as MacroTilesPanel).fetchData(),
      REFRESH_INTERVALS.macroTiles,
      () => this.isPanelNearViewport('macro-tiles')
    );
    this.refreshScheduler.scheduleRefresh(
      'fsi',
      () => (this.state.panels['fsi'] as FSIPanel).fetchData(),
      REFRESH_INTERVALS.fsi,
      () => this.isPanelNearViewport('fsi')
    );
    this.refreshScheduler.scheduleRefresh(
      'yield-curve',
      () => (this.state.panels['yield-curve'] as YieldCurvePanel).fetchData(),
      REFRESH_INTERVALS.yieldCurve,
      () => this.isPanelNearViewport('yield-curve')
    );
    this.refreshScheduler.scheduleRefresh(
      'earnings-calendar',
      () => (this.state.panels['earnings-calendar'] as EarningsCalendarPanel).fetchData(),
      REFRESH_INTERVALS.earningsCalendar,
      () => this.isPanelNearViewport('earnings-calendar')
    );
    this.refreshScheduler.scheduleRefresh(
      'economic-calendar',
      () => (this.state.panels['economic-calendar'] as EconomicCalendarPanel).fetchData(),
      REFRESH_INTERVALS.economicCalendar,
      () => this.isPanelNearViewport('economic-calendar')
    );
    this.refreshScheduler.scheduleRefresh(
      'cot-positioning',
      () => (this.state.panels['cot-positioning'] as unknown as RefreshablePanel).fetchData(),
      REFRESH_INTERVALS.cotPositioning,
      () => this.isPanelNearViewport('cot-positioning')
    );
    this.refreshScheduler.scheduleRefresh(
      'gold-intelligence',
      () => (this.state.panels['gold-intelligence'] as GoldIntelligencePanel).fetchData(),
      REFRESH_INTERVALS.goldIntelligence,
      () => this.isPanelNearViewport('gold-intelligence')
    );
    this.refreshScheduler.scheduleRefresh(
      'aaii-sentiment',
      () => this.dataLoader.loadAaiiSentiment(),
      REFRESH_INTERVALS.aaiiSentiment,
      () => this.isPanelNearViewport('aaii-sentiment')
    );
    this.refreshScheduler.scheduleRefresh(
      'market-breadth',
      () => this.dataLoader.loadMarketBreadth(),
      REFRESH_INTERVALS.marketBreadth,
      () => this.isPanelNearViewport('market-breadth')
    );

    // Refresh intelligence signals for CII (geopolitical variant only)
    if (SITE_VARIANT === 'full') {
      this.refreshScheduler.scheduleRefresh('intelligence', () => {
        const { military, iranEvents } = this.state.intelligenceCache;
        this.state.intelligenceCache = {};
        if (military) this.state.intelligenceCache.military = military;
        if (iranEvents) this.state.intelligenceCache.iranEvents = iranEvents;
        return this.dataLoader.loadIntelligenceSignals();
      }, REFRESH_INTERVALS.intelligence, () => this.shouldRefreshIntelligence());
    }

    // Correlation engine refresh
    this.refreshScheduler.scheduleRefresh(
      'correlation-engine',
      async () => {
        if (IS_STARTUP_BUILD) return;
        if (!this.state.correlationEngine) return;
        const { refreshLegacyCorrelationEngine } = await import('@/app/non-startup-runtime');
        await refreshLegacyCorrelationEngine(this.state);
      },
      REFRESH_INTERVALS.correlationEngine,
      () => this.shouldRefreshCorrelation(),
    );
  }
}
