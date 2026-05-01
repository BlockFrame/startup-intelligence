import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const startupMapSource = readFileSync(new URL('../src/components/StartupMapContainer.ts', import.meta.url), 'utf8');
const panelLayoutSource = readFileSync(new URL('../src/app/panel-layout.ts', import.meta.url), 'utf8');
const viteConfigSource = readFileSync(new URL('../vite.config.ts', import.meta.url), 'utf8');
const appSource = readFileSync(new URL('../src/App.ts', import.meta.url), 'utf8');

test('startup map container is isolated from legacy StartupIntelligence map renderers', () => {
  assert.match(startupMapSource, /export class StartupMapContainer/);
  assert.doesNotMatch(startupMapSource, /['"]\.\/MapContainer['"]/);
  assert.doesNotMatch(startupMapSource, /['"]\.\/DeckGLMap['"]/);
  assert.doesNotMatch(startupMapSource, /['"]\.\/Map['"]/);
  assert.doesNotMatch(startupMapSource, /['"]\.\/GlobeMap['"]/);
  assert.doesNotMatch(startupMapSource, /['"]\.\/MapPopup['"]/);
});

test('startup map cleanup polish remains implemented in startup-only renderer', () => {
  assert.match(startupMapSource, /renderStartupMapPopup/);
  assert.match(startupMapSource, /clusterMarkers\(/);
  assert.match(startupMapSource, /startup-map-marker-cluster/);
  assert.match(startupMapSource, /switchToGlobe\(\)/);
  assert.match(startupMapSource, /setProjection/);
});

test('startup build selects startup map without statically importing legacy map stack', () => {
  assert.match(panelLayoutSource, /IS_STARTUP_BUILD/);
  assert.match(panelLayoutSource, /import\('@\/components\/StartupMapContainer'\)/);
  assert.match(panelLayoutSource, /import\('@\/components\/MapContainer'\)/);
  assert.doesNotMatch(appSource, /import\('@\/app\/data-loader'\)/);
  assert.doesNotMatch(viteConfigSource, /find: '@\/app\/data-loader'/);
});
