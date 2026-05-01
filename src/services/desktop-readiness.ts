import { isFeatureAvailable, type RuntimeFeatureId } from './runtime-config';

export type LocalityClass = 'fully-local' | 'api-key' | 'cloud-fallback';

export interface DesktopParityFeature {
  id: string;
  panel: string;
  serviceFiles: string[];
  apiRoutes: string[];
  apiHandlers: string[];
  locality: LocalityClass;
  fallback: string;
  priority: 1 | 2 | 3;
}

export interface DesktopReadinessCheck {
  id: string;
  label: string;
  ready: boolean;
}

const keyBackedFeatures: RuntimeFeatureId[] = [
  'aiOllama',
  'aiGroq',
  'aiOpenRouter',
  'economicFred',
  'energyEia',
];

export const DESKTOP_PARITY_FEATURES: DesktopParityFeature[] = [
  {
    id: 'live-news',
    panel: 'LiveNewsPanel',
    serviceFiles: ['src/services/live-news.ts'],
    apiRoutes: ['/api/youtube/live'],
    apiHandlers: ['api/youtube/live.js'],
    locality: 'fully-local',
    fallback: 'Channel fallback video IDs are used when live detection fails.',
    priority: 1,
  },
  {
    id: 'monitor',
    panel: 'MonitorPanel',
    serviceFiles: [],
    apiRoutes: [],
    apiHandlers: [],
    locality: 'fully-local',
    fallback: 'Keyword monitoring runs fully client-side on loaded news corpus.',
    priority: 1,
  },
  {
    id: 'startup-news',
    panel: 'NewsPanel',
    serviceFiles: ['src/services/rss.ts', 'src/services/startup-signal.ts'],
    apiRoutes: ['/api/news/v1/list-items', '/api/rss-proxy'],
    apiHandlers: ['server/startup/news/v1/handler.ts', 'api/rss-proxy.js'],
    locality: 'api-key',
    fallback: 'Dashboard keeps cached startup headlines and source-health state when live feeds fail.',
    priority: 1,
  },
  {
    id: 'startup-map',
    panel: 'StartupMapContainer',
    serviceFiles: ['src/components/startup-map-data.ts', 'src/services/tech-hub-index.ts', 'src/services/hub-activity-scoring.ts'],
    apiRoutes: [],
    apiHandlers: [],
    locality: 'fully-local',
    fallback: 'Static startup ecosystem layers remain available when live tech-event overlays fail.',
    priority: 1,
  },
  {
    id: 'summaries',
    panel: 'Summaries',
    serviceFiles: ['src/services/summarization.ts'],
    apiRoutes: ['/api/news/v1/summarize-article'],
    apiHandlers: ['server/startup/news/v1/handler.ts'],
    locality: 'api-key',
    fallback: 'Browser summarizer executes when hosted LLM providers are unavailable.',
    priority: 2,
  },
  {
    id: 'market-panel',
    panel: 'MarketPanel',
    serviceFiles: ['src/services/market/index.ts'],
    apiRoutes: ['/api/market/v1/list-crypto-quotes', '/api/market/v1/list-stablecoin-markets', '/api/market/v1/list-etf-flows'],
    apiHandlers: ['server/startup/market/v1/handler.ts'],
    locality: 'fully-local',
    fallback: 'Multi-source market fetchers degrade to remaining providers and cached values.',
    priority: 2,
  },
  {
    id: 'research-dashboards',
    panel: 'arXiv / GitHub / Hugging Face dashboards',
    serviceFiles: ['src/services/arxiv/index.ts', 'src/services/github-repos/index.ts', 'src/services/huggingface/index.ts'],
    apiRoutes: ['/api/arxiv', '/api/github-repos', '/api/huggingface'],
    apiHandlers: ['api/arxiv.js', 'api/github-repos.js', 'api/huggingface.js'],
    locality: 'api-key',
    fallback: 'Dashboards use curated fallbacks and cached prior results when upstream APIs are unavailable.',
    priority: 3,
  },
  {
    id: 'mcp-widgets',
    panel: 'McpDataPanel / CustomWidgetPanel',
    serviceFiles: ['src/services/mcp-store.ts', 'src/services/widget-store.ts'],
    apiRoutes: ['/api/mcp', '/api/mcp-proxy', '/api/widget-agent'],
    apiHandlers: ['api/mcp.ts', 'api/mcp-proxy.js', 'api/widget-agent.ts'],
    locality: 'cloud-fallback',
    fallback: 'Custom widgets stay local until MCP or widget-agent calls are available.',
    priority: 3,
  },
];

export function getNonParityFeatures(): DesktopParityFeature[] {
  return DESKTOP_PARITY_FEATURES.filter(feature => feature.locality !== 'fully-local');
}

export function getDesktopReadinessChecks(localBackendEnabled: boolean): DesktopReadinessCheck[] {
  const liveTrackingReady = isFeatureAvailable('aisRelay') || isFeatureAvailable('openskyRelay');

  return [
    { id: 'startup', label: 'Desktop startup + sidecar API health', ready: localBackendEnabled },
    { id: 'map', label: 'Map rendering (local layers + static geo assets)', ready: true },
    { id: 'core-intel', label: 'Core intelligence panels (Live News, Monitor, Strategic Risk)', ready: true },
    { id: 'summaries', label: 'Summaries (provider-backed or browser fallback)', ready: isFeatureAvailable('aiOllama') || isFeatureAvailable('aiGroq') || isFeatureAvailable('aiOpenRouter') },
    { id: 'market', label: 'Market panel live data paths', ready: true },
    { id: 'live-tracking', label: 'At least one live-tracking mode (AIS or OpenSky)', ready: liveTrackingReady },
  ];
}

export function getKeyBackedAvailabilitySummary(): { available: number; total: number } {
  const available = keyBackedFeatures.filter(featureId => isFeatureAvailable(featureId)).length;
  return { available, total: keyBackedFeatures.length };
}
