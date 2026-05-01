import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const panelsSource = readFileSync(new URL('../src/config/panels.ts', import.meta.url), 'utf8');
const panelLayoutSource = readFileSync(new URL('../src/app/panel-layout.ts', import.meta.url), 'utf8');
const nonStartupLayoutRuntimeSource = readFileSync(new URL('../src/app/non-startup-layout-runtime.ts', import.meta.url), 'utf8');
const startupVariantSource = readFileSync(new URL('../src/config/variants/startup.ts', import.meta.url), 'utf8');
const startupPanelsSource = readFileSync(new URL('../src/config/startup-panels.ts', import.meta.url), 'utf8');
const viteConfigSource = readFileSync(new URL('../vite.config.ts', import.meta.url), 'utf8');

const legacyPanelKeys = [
  'live-webcams',
  'windy-webcams',
  'strategic-posture',
  'forecast',
  'cii',
  'strategic-risk',
  'intel',
  'gdelt-intel',
  'cascade',
  'military-correlation',
  'escalation-correlation',
  'economic-correlation',
  'disaster-correlation',
  'polymarket',
  'supply-chain',
  'satellite-fires',
  'ucdp-events',
  'disease-outbreaks',
  'displacement',
  'climate',
  'sanctions-pressure',
  'radiation-watch',
  'thermal-escalation',
  'oref-sirens',
  'telegram-intel',
  'airline-intel',
  'world-clock',
  'national-debt',
  'geo-hubs',
];

const requiredStartupPanelKeys = [
  'producthunt',
  'funding',
  'hardware',
  'tech-readiness',
  'top-vc-signals',
  'accelerators',
  'vcblogs',
  'unicorns',
];

function defaultPanelsBlock() {
  const start = startupVariantSource.indexOf('export const DEFAULT_PANELS');
  const end = startupVariantSource.indexOf('export const STARTUP_PANEL_KEYS');
  assert.ok(start >= 0, 'startup DEFAULT_PANELS must exist');
  assert.ok(end > start, 'startup panel keys must follow DEFAULT_PANELS');
  return startupVariantSource.slice(start, end);
}

test('startup panel registry lives in its own variant module', () => {
  assert.match(panelsSource, /from '\.\/variants\/startup'/);
  assert.doesNotMatch(panelsSource, /const STARTUP_PANELS/);
  assert.doesNotMatch(panelsSource, /const STARTUP_MAP_LAYERS/);
  assert.doesNotMatch(panelsSource, /const STARTUP_MOBILE_MAP_LAYERS/);
  assert.match(startupPanelsSource, /STARTUP_PANELS/);
  assert.match(viteConfigSource, /find: '@\/config\/panels'/);
  assert.match(viteConfigSource, /startup-panels\.ts/);
});

test('startup variant includes target dashboards and excludes legacy WorldMonitor panels', () => {
  const panelBlock = defaultPanelsBlock();
  for (const key of requiredStartupPanelKeys) {
    assert.match(panelBlock, new RegExp(`${key}:|['"]${key}['"]`), `${key} should stay in startup registry`);
  }

  for (const key of legacyPanelKeys) {
    assert.doesNotMatch(panelBlock, new RegExp(`${key}:|['"]${key}['"]`), `${key} must not be in startup registry`);
  }
});

test('startup map layer defaults are explicit and do not inherit tech or legacy layer presets', () => {
  assert.match(startupVariantSource, /export const DEFAULT_MAP_LAYERS: MapLayers = \{/);
  assert.doesNotMatch(startupVariantSource, /\.\.\.TECH_/);
  assert.doesNotMatch(startupVariantSource, /from '\.\/tech'/);
  assert.doesNotMatch(startupVariantSource, /from '\.\.\/geo'/);

  for (const enabledLayer of ['datacenters', 'startupHubs', 'cloudRegions', 'accelerators', 'techHQs', 'techEvents']) {
    assert.match(startupVariantSource, new RegExp(`${enabledLayer}: true`), `${enabledLayer} should be enabled`);
  }

  for (const disabledLayer of ['conflicts', 'bases', 'cables', 'ais', 'military', 'ucdpEvents', 'displacement', 'climate', 'webcams']) {
    assert.match(startupVariantSource, new RegExp(`${disabledLayer}: false`), `${disabledLayer} should be disabled`);
  }
});

test('startup panel layout repairs stale cross-variant panel storage', () => {
  assert.match(panelLayoutSource, /DEFAULT_PANELS as STARTUP_PANEL_DEFAULTS/);
  assert.match(panelLayoutSource, /for \(const key of VARIANT_DEFAULTS\.startup \?\? \[\]\)/);
  assert.match(panelLayoutSource, /this\.ctx\.panelSettings\[key\] = \{ \.\.\.defaultConfig \}/);
  assert.match(panelLayoutSource, /enabled: defaultConfig\.enabled/);
  assert.match(panelLayoutSource, /saveToStorage\(STORAGE_KEYS\.panels, this\.ctx\.panelSettings\)/);
});

test('startup route does not call legacy WorldMonitor product links for premium gating or repo stars', () => {
  assert.doesNotMatch(panelLayoutSource, /https:\/\/worldmonitor\.app\/pro/);
  assert.doesNotMatch(panelLayoutSource, /https:\/\/api\.github\.com\/repos\/koala73\/worldmonitor/);
  assert.match(panelLayoutSource, /IS_STARTUP_BUILD[\s\S]+\(\) => window\.open\('\/pro', '_blank'\)/);
  assert.match(panelLayoutSource, /import\('@\/app\/non-startup-layout-runtime'\)/);
  assert.match(panelLayoutSource, /const IS_STARTUP_BUILD = import\.meta\.env\.VITE_VARIANT === 'startup'/);
  assert.match(nonStartupLayoutRuntimeSource, /https:\/\/worldmonitor\.app\/pro/);
  assert.match(nonStartupLayoutRuntimeSource, /https:\/\/api\.github\.com\/repos\/koala73\/worldmonitor/);
});
