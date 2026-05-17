import type { DataSourceId, MapLayers, PanelConfig } from '@/types';
import {
  DEFAULT_MAP_LAYERS as STARTUP_MAP_LAYERS,
  DEFAULT_PANELS as STARTUP_PANELS,
  MOBILE_DEFAULT_MAP_LAYERS as STARTUP_MOBILE_MAP_LAYERS,
} from './variants/startup';
import { getSecretState } from '@/services/runtime-config';
import { isEntitled } from '@/services/entitlements';
import { isDesktopRuntime } from '@/services/runtime';

export const ALL_PANELS: Record<string, PanelConfig> = { ...STARTUP_PANELS };

export const VARIANT_DEFAULTS: Record<string, string[]> = {
  startup: Object.keys(STARTUP_PANELS),
};

export const VARIANT_PANEL_OVERRIDES: Partial<Record<string, Partial<Record<string, Partial<PanelConfig>>>>> = {
  startup: {
    map: { name: 'Startup Intelligence Map' },
    'live-news': { name: 'Live News' },
    insights: { name: 'AI Investor Brief' },
  },
};

export function getEffectivePanelConfig(key: string, variant = 'startup'): PanelConfig {
  const base = ALL_PANELS[key];
  if (!base) return { name: key, enabled: false, priority: 2 };
  const override = VARIANT_PANEL_OVERRIDES[variant]?.[key] ?? {};
  return { ...base, ...override };
}

export const FREE_MAX_PANELS = 40;
export const FREE_MAX_SOURCES = 80;

export function isPanelEntitled(key: string, config: PanelConfig, isPro = false): boolean {
  if (!config.premium) return true;
  if (isEntitled()) return true;
  const apiKeyPanels = ['chat-analyst', 'stock-analysis', 'stock-backtest', 'daily-market-brief', 'market-implications'];
  if (apiKeyPanels.includes(key)) {
    return getSecretState('STARTUP_INTELLIGENCE_API_KEY').present || isPro;
  }
  if (config.premium === 'locked') {
    return isDesktopRuntime();
  }
  return true;
}

export const DEFAULT_PANELS: Record<string, PanelConfig> = Object.fromEntries(
  (VARIANT_DEFAULTS.startup ?? []).map(key => [key, getEffectivePanelConfig(key, 'startup')]),
);

export const DEFAULT_MAP_LAYERS: MapLayers = STARTUP_MAP_LAYERS;
export const MOBILE_DEFAULT_MAP_LAYERS: MapLayers = STARTUP_MOBILE_MAP_LAYERS;

export const LAYER_TO_SOURCE: Partial<Record<keyof MapLayers, DataSourceId[]>> = {
  outages: ['outages'],
};

export const PANEL_CATEGORY_MAP: Record<string, { labelKey: string; panelKeys: string[]; variants?: string[] }> = {
  core: {
    labelKey: 'header.panelCatCore',
    panelKeys: ['map', 'insights', 'top-vc-signals', 'startups', 'producthunt', 'ai', 'markets'],
  },
  fundingRadar: {
    labelKey: 'header.panelCatFundingRadar',
    panelKeys: ['vcblogs', 'regionalStartups', 'unicorns', 'accelerators', 'ipo'],
  },
  aiObservatory: {
    labelKey: 'header.panelCatAiObservatory',
    panelKeys: ['ai', 'tech', 'cloud', 'hardware', 'events', 'tech-readiness'],
  },
  markets: {
    labelKey: 'header.panelCatMarkets',
    panelKeys: ['markets', 'finance', 'fintech', 'layoffs'],
  },
  workspace: {
    labelKey: 'header.panelCatWorkspace',
    panelKeys: ['monitors', 'live-news'],
  },
};
