export const CLOUD_SYNC_KEYS = [
  'startupintelligence-panels',
  'startupintelligence-monitors',
  'startupintelligence-layers',
  'startupintelligence-disabled-feeds',
  'startupintelligence-panel-spans',
  'startupintelligence-panel-col-spans',
  'startupintelligence-panel-order',
  'startup-intelligence-theme',
  'startup-intelligence-variant',
  'startupintelligence-map-mode',
  'si-breaking-alerts-v1',
  'si-market-watchlist-v1',
  'aviation:watchlist:v1',
  'si-pinned-webcams',
  'si-map-provider',
  'si-font-family',
  'si-globe-visual-preset',
  'si-stream-quality',
  'si-ai-flow-cloud-llm',
  'si-analysis-frameworks',
  'si-panel-frameworks',
  // Provider-specific map themes (si-map-theme:<provider>)
  'si-map-theme:auto',
  'si-map-theme:pmtiles',
  'si-map-theme:openfreemap',
  'si-map-theme:carto',
  // Live-stream mode
  'si-live-streams-always-on',
] as const;

export type CloudSyncKey = (typeof CLOUD_SYNC_KEYS)[number];
