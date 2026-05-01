import type { AppContext } from '@/app/app-context';
import type { BootstrapHydrationState } from '@/services/bootstrap';
import type { CorrelationPanel } from '@/components/CorrelationPanel';

export type { BootstrapHydrationState } from '@/services/bootstrap';

export async function setupLegacyAis(state: AppContext): Promise<void> {
  const { isAisConfigured, initAisStream } = await import('@/services/maritime');
  if (!isAisConfigured()) {
    state.mapLayers.ais = false;
  } else if (state.mapLayers.ais) {
    initAisStream();
  }
}

export async function fetchLegacyBootstrap(): Promise<BootstrapHydrationState> {
  const { fetchBootstrapData, getBootstrapHydrationState } = await import('@/services/bootstrap');
  await fetchBootstrapData();
  return getBootstrapHydrationState();
}

export async function promoteLegacyBootstrap(): Promise<BootstrapHydrationState> {
  const { markBootstrapAsLive, getBootstrapHydrationState } = await import('@/services/bootstrap');
  markBootstrapAsLive();
  return getBootstrapHydrationState();
}

export async function setupLegacySignalUi(state: AppContext): Promise<void> {
  const { SignalModal } = await import('@/components/SignalModal');
  state.signalModal = new SignalModal();
  state.signalModal.setLocationClickHandler((lat, lon) => {
    state.map?.setCenter(lat, lon, 4);
  });
}

export async function setupLegacyFindingsBadge(state: AppContext): Promise<void> {
  const { IntelligenceGapBadge } = await import('@/components/IntelligenceGapBadge');
  state.findingsBadge = new IntelligenceGapBadge();
  state.findingsBadge.setOnSignalClick((signal) => {
    if (localStorage.getItem('si-settings-open') === '1') return;
    state.signalModal?.showSignal(signal);
  });
  state.findingsBadge.setOnAlertClick((alert) => {
    if (localStorage.getItem('si-settings-open') === '1') return;
    state.signalModal?.showAlert(alert);
  });
}

export async function setupLegacyBreakingNews(state: AppContext): Promise<void> {
  const { initBreakingNewsAlerts } = await import('@/services/breaking-news-alerts');
  const { BreakingNewsBanner } = await import('@/components/BreakingNewsBanner');
  initBreakingNewsAlerts();
  state.breakingBanner = new BreakingNewsBanner();
}

export async function setupLegacyCorrelationEngine(state: AppContext): Promise<void> {
  const {
    CorrelationEngine,
    militaryAdapter,
    escalationAdapter,
    economicAdapter,
    disasterAdapter,
  } = await import('@/services/correlation-engine');
  const correlationEngine = new CorrelationEngine();
  correlationEngine.registerAdapter(militaryAdapter);
  correlationEngine.registerAdapter(escalationAdapter);
  correlationEngine.registerAdapter(economicAdapter);
  correlationEngine.registerAdapter(disasterAdapter);
  state.correlationEngine = correlationEngine;
}

export function runLegacyCorrelationEngine(state: AppContext): void {
  void refreshLegacyCorrelationEngine(state);
}

export async function refreshLegacyCorrelationEngine(state: AppContext): Promise<void> {
  if (!state.correlationEngine) return;
  await state.correlationEngine.run(state);
  for (const domain of ['military', 'escalation', 'economic', 'disaster'] as const) {
    const panel = state.panels[`${domain}-correlation`] as CorrelationPanel | undefined;
    panel?.updateCards(state.correlationEngine.getCards(domain));
  }
}

export async function startLegacyCountryLearning(): Promise<void> {
  const { startLearning } = await import('@/services/country-instability');
  startLearning();
}

export async function hideLegacyUnconfiguredLayers(state: AppContext): Promise<void> {
  if (!(await import('@/services/maritime')).isAisConfigured()) {
    state.map?.hideLayerToggle('ais');
  }
  if ((await import('@/services/infrastructure')).isOutagesConfigured() === false) {
    state.map?.hideLayerToggle('outages');
  }
}

export function destroyLegacyRuntime(state: AppContext): void {
  void import('@/services/breaking-news-alerts')
    .then(({ destroyBreakingNewsAlerts }) => {
      destroyBreakingNewsAlerts();
    })
    .catch(() => {});
  void import('@/services/maritime')
    .then(({ disconnectAisStream }) => disconnectAisStream())
    .catch(() => {});
  state.breakingBanner?.destroy();
}
