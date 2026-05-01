import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const appContextSource = readFileSync(new URL('../src/app/app-context.ts', import.meta.url), 'utf8');
const legacyContextSource = readFileSync(new URL('../src/app/legacy-app-context.ts', import.meta.url), 'utf8');
const panelLayoutSource = readFileSync(new URL('../src/app/panel-layout.ts', import.meta.url), 'utf8');

function startupCoreBlock() {
  const start = appContextSource.indexOf('export interface StartupAppContext');
  const end = appContextSource.indexOf('export type AppContext');
  assert.ok(start >= 0, 'StartupAppContext interface must exist');
  assert.ok(end > start, 'AppContext type must follow StartupAppContext');
  return appContextSource.slice(start, end);
}

test('StartupAppContext core excludes legacy world-risk cache fields', () => {
  const core = startupCoreBlock();
  for (const token of [
    'intelligenceCache',
    'cyberThreatsCache',
    'flightDelays',
    'aircraftPositions',
    'military',
    'sanctions',
    'radiation',
    'displacement',
    'wildfire',
    'maritime',
    'aviation',
  ]) {
    assert.doesNotMatch(core, new RegExp(token), `StartupAppContext must not include ${token}`);
  }
});

test('legacy app context extension owns legacy intelligence/cache state', () => {
  assert.match(legacyContextSource, /export interface LegacyIntelligenceCache/);
  assert.match(legacyContextSource, /export interface LegacyAppContextExtension/);
  assert.match(legacyContextSource, /intelligenceCache: LegacyIntelligenceCache/);
  assert.match(legacyContextSource, /cyberThreatsCache: CyberThreat\[\] \| null/);
});

test('AppContext composes startup core with legacy extension for non-startup compatibility', () => {
  assert.match(appContextSource, /export interface StartupAppContext/);
  assert.match(appContextSource, /import type \{ LegacyAppContextExtension \} from '\.\/legacy-app-context'/);
  assert.match(appContextSource, /export type AppContext = StartupAppContext & LegacyAppContextExtension/);
});

test('startup news panels keep showing available items when current time range is empty', () => {
  assert.match(panelLayoutSource, /SITE_VARIANT === 'startup'/);
  assert.match(panelLayoutSource, /filtered\.length === 0 && items\.length > 0/);
  assert.match(panelLayoutSource, /panel\.renderNews\(items\)/);
});
