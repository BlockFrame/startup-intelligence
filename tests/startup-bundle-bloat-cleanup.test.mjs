import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { test } from 'node:test';

const files = [
  'src/App.ts',
  'src/app/panel-layout.ts',
  'src/app/event-handlers.ts',
  'src/app/startup-data-loader.ts',
  'src/app/search-manager.ts',
  'src/components/LiveNewsPanel.ts',
  'src/components/NewsPanel.ts',
  'src/components/MarketPanel.ts',
  'src/components/InsightsPanel.ts',
  'src/components/MonitorPanel.ts',
  'src/components/StatusPanel.ts',
  'src/services/rss.ts',
  'src/services/clustering.ts',
  'src/services/summarization.ts',
  'src/services/ai-classify-queue.ts',
  'src/services/stock-analysis.ts',
  'src/settings-window.ts',
];

function source(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
}

test('startup bundle core imports config modules directly instead of the legacy config barrel', () => {
  for (const file of files) {
    assert.doesNotMatch(source(file), /from ['"]@\/config['"]/, `${file} must not import the legacy config barrel`);
  }
});

test('startup build variant cannot be overridden by stale localhost storage', () => {
  const variantSource = source('src/config/variant.ts');
  assert.match(variantSource, /if \(buildVariant === 'startup'\) return 'startup';/);
});

test('startup search manager does not statically import country instability or legacy geo configs', () => {
  const searchSource = source('src/app/search-manager.ts');
  assert.doesNotMatch(searchSource, /from ['"]@\/services\/country-instability['"]/);
  assert.doesNotMatch(searchSource, /from ['"]@\/config['"]/);
  assert.match(searchSource, /registerLegacyGeoSearchSources/);
  assert.match(searchSource, /import\('@\/config\/geo'\)/);
});

test('startup app keeps heavyweight ML and world-risk modules lazy', () => {
  const appSource = source('src/App.ts');
  assert.doesNotMatch(appSource, /from ['"]@\/services\/ml-worker['"]/);
  assert.doesNotMatch(appSource, /from ['"]@\/services\/country-instability['"]/);
  assert.doesNotMatch(appSource, /from ['"]@\/services\/infrastructure['"]/);
  assert.match(appSource, /import\('@\/services\/ml-worker'\)/);
  assert.match(appSource, /SITE_VARIANT !== 'startup'[\s\S]+import\('@\/services\/country-instability'\)/);
});

test('startup build aliases i18n to the lightweight English-only service', () => {
  const viteSource = source('vite.config.ts');
  const startupI18nSource = source('src/services/startup-i18n.ts');
  const mainSource = source('src/main.ts');
  assert.match(viteSource, /find: '@\/services\/i18n'/);
  assert.match(viteSource, /startup-i18n\.ts/);
  assert.doesNotMatch(mainSource, /import\('\.\/services\/i18n'\)/);
  assert.match(mainSource, /import\('@\/services\/i18n'\)/);
  assert.doesNotMatch(startupI18nSource, /i18next/);
  assert.doesNotMatch(startupI18nSource, /import\.meta\.glob/);
});

test('startup build uses only the main HTML entry', () => {
  const viteSource = source('vite.config.ts');
  assert.match(viteSource, /input: startupOnly/);
  assert.match(viteSource, /main: resolve\(__dirname, 'index\.html'\)/);
  assert.match(viteSource, /settings: resolve\(__dirname, 'settings\.html'\)/);
  assert.match(viteSource, /liveChannels: resolve\(__dirname, 'live-channels\.html'\)/);
});

test('startup html metadata does not advertise the legacy WorldMonitor product', () => {
  const htmlSource = source('index.html');
  assert.doesNotMatch(htmlSource, /World Monitor App/);
  assert.doesNotMatch(htmlSource, /WM Intelligence/);
  assert.doesNotMatch(htmlSource, /global intelligence dashboard with 3D globe/);
  assert.doesNotMatch(htmlSource, /github\.com\/koala73\/worldmonitor/);
  assert.doesNotMatch(htmlSource, /hreflang="(ar|bg|cs|de|el|es|fr|it|ja|ko|nl|pl|pt|ro|ru|sv|th|tr|vi|zh)"/);
});

test('component and service barrels expose startup surface only', () => {
  const componentBarrel = source('src/components/index.ts');
  const serviceBarrel = source('src/services/index.ts');
  const legacyTokens = [
    './MapContainer',
    'DeckGLMap',
    'LiveWebcamsPanel',
    'CIIPanel',
    'StrategicPosturePanel',
    'CascadePanel',
    'SatelliteFiresPanel',
    'UcdpEventsPanel',
    'DisplacementPanel',
    'ClimateAnomalyPanel',
    'SupplyChainPanel',
    'SanctionsPressurePanel',
    'RadiationWatchPanel',
    'ThermalEscalationPanel',
    'OrefSirensPanel',
    'AirlineIntelPanel',
    'aviation',
    'maritime',
    'military-flights',
    'military-vessels',
    'conflict',
    'displacement',
    'wildfires',
    'climate',
    'radiation',
    'sanctions-pressure',
    'thermal-escalation',
    'infrastructure-cascade',
    'imagery',
  ];

  for (const token of legacyTokens) {
    assert.doesNotMatch(componentBarrel, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    assert.doesNotMatch(serviceBarrel, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
});

test('deleted dead legacy panel files stay physically removed', () => {
  const deletedLegacyPanels = [
    'src/components/StrategicPosturePanel.ts',
    'src/components/DefensePatentsPanel.ts',
    'src/components/GulfEconomiesPanel.ts',
    'src/components/GroceryBasketPanel.ts',
    'src/components/BigMacPanel.ts',
    'src/components/FaoFoodPriceIndexPanel.ts',
    'src/components/CotPositioningPanel.ts',
    'src/components/PositioningPanel.ts',
    'src/app/country-intel.ts',
    'src/components/CountryIntelModal.ts',
    'src/components/StoryModal.ts',
    'src/components/CountryDeepDivePanel.ts',
    'src/components/CountryDeepDivePanel-news-utils.ts',
    'src/components/CountryBriefPage.ts',
    'src/components/CountryBriefPanel.ts',
    'src/components/CountryTimeline.ts',
    'src/services/story-data.ts',
    'src/services/story-renderer.ts',
    'src/services/story-share.ts',
    'src/styles/country-deep-dive.css',
  ];

  for (const file of deletedLegacyPanels) {
    assert.equal(existsSync(new URL(`../${file}`, import.meta.url)), false, `${file} should stay deleted`);
  }
});
