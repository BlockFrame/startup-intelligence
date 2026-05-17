import type { DataSourceId, MapLayers, PanelConfig } from '@/types';
import {
  DEFAULT_MAP_LAYERS,
  DEFAULT_PANELS as STARTUP_PANELS,
  MOBILE_DEFAULT_MAP_LAYERS,
} from '@/config/variants/startup';

export const ALL_PANELS: Record<string, PanelConfig> = STARTUP_PANELS;

export const VARIANT_DEFAULTS: Record<string, string[]> = {
  startup: Object.keys(STARTUP_PANELS),
};

export function getEffectivePanelConfig(key: string, _variant: string): PanelConfig {
  return STARTUP_PANELS[key] ?? { name: key, enabled: false, priority: 2 };
}

export const FREE_MAX_PANELS = 40;
export const FREE_MAX_SOURCES = 80;

export function isPanelEntitled(_key: string, _config: PanelConfig, _isPro = false): boolean {
  return true;
}

export { DEFAULT_MAP_LAYERS, MOBILE_DEFAULT_MAP_LAYERS };
export const DEFAULT_PANELS = STARTUP_PANELS;

export const LAYER_TO_SOURCE: Partial<Record<keyof MapLayers, DataSourceId[]>> = {};

export const PANEL_CATEGORY_MAP: Record<string, { labelKey: string; panelKeys: string[]; variants?: string[] }> = {
  core: {
    labelKey: 'header.panelCatCore',
    panelKeys: ['map', 'insights', 'top-vc-signals'],
  },
  fundingRadar: {
    labelKey: 'header.panelCatFundingRadar',
    panelKeys: ['startups', 'producthunt', 'ipo', 'unicorns', 'accelerators'],
  },
  aiObservatory: {
    labelKey: 'header.panelCatAiObservatory',
    panelKeys: ['ai', 'tech', 'cloud', 'hardware', 'events', 'tech-readiness'],
  },
  investmentDecision: {
    labelKey: 'header.panelCatMarkets',
    panelKeys: ['markets', 'finance', 'fintech', 'layoffs'],
  },
  optionalResearch: {
    labelKey: 'header.panelCatStartupsVc',
    panelKeys: ['live-news', 'vcblogs', 'regionalStartups'],
  },
  securityPolicy: {
    labelKey: 'header.panelCatSecurityPolicy',
    panelKeys: ['security', 'policy', 'monitors'],
  },
};
