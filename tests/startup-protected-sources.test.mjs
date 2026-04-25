import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const appSource = readFileSync(new URL('../src/App.ts', import.meta.url), 'utf8');

test('startup free-tier source trim keeps launch, VC, and hardware feeds enabled', () => {
  assert.match(appSource, /getStartupProtectedSources\(\)/);
  assert.match(appSource, /fullyProtectedCategories/);
  assert.match(appSource, /minimumProtectedCategories/);
  assert.match(appSource, /'producthunt'/);
  assert.match(appSource, /'funding'/);
  assert.match(appSource, /'vcblogs'/);
  assert.match(appSource, /'startups'/);
  assert.match(appSource, /'hardware'/);
  assert.match(appSource, /'fintech'/);
  assert.match(appSource, /disabledSources\.delete\(name\)/);
  assert.match(appSource, /filter\(\(name\) => !startupProtectedSources\.has\(name\)\)/);
});

test('startup migration reenables requested startup dashboards', () => {
  assert.match(appSource, /STARTUP_REQUIRED_PANELS_KEY/);
  assert.match(appSource, /'producthunt'/);
  assert.match(appSource, /'funding'/);
  assert.match(appSource, /'startups'/);
  assert.match(appSource, /'vcblogs'/);
  assert.match(appSource, /'hardware'/);
  assert.match(appSource, /'tech-readiness'/);
  assert.match(appSource, /enabled: true/);
});
