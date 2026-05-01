import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

function source(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
}

test('startup app imports the startup country intelligence manager only', () => {
  const appSource = source('src/App.ts');
  assert.match(appSource, /from '@\/app\/startup-country-intel'/);
  assert.doesNotMatch(appSource, /from '@\/app\/country-intel'/);
});

test('startup country intelligence manager is free of world-risk dependencies', () => {
  const startupCountrySource = source('src/app/startup-country-intel.ts');
  for (const token of [
    'country-instability',
    'CountryDeepDivePanel',
    'CountryBriefPage',
    'MILITARY_BASES',
    'mlWorker',
    'signalAggregator',
    'TradeServiceClient',
    'IntelligenceServiceClient',
    'sanctions',
    'maritime',
    'aviation',
  ]) {
    assert.doesNotMatch(startupCountrySource, new RegExp(token), `startup country intel must not reference ${token}`);
  }
});

test('startup AppContext no longer carries legacy country brief UI contracts', () => {
  const appContextSource = source('src/app/app-context.ts');
  const appIndexSource = source('src/app/index.ts');
  assert.doesNotMatch(appContextSource, /countryBriefPage/);
  assert.doesNotMatch(appContextSource, /country-brief-contract/);
  assert.doesNotMatch(appContextSource, /components\/CountryBriefPanel/);
  assert.match(appIndexSource, /from '\.\/startup-country-intel'/);
  assert.doesNotMatch(appIndexSource, /from '\.\/country-intel'/);
  assert.doesNotMatch(appIndexSource, /country-brief-contract/);
});

test('startup app does not keep legacy country story deep links', () => {
  const appSource = source('src/App.ts');
  const metaTagsSource = source('src/services/meta-tags.ts');
  assert.doesNotMatch(appSource, /pendingDeepLinkStoryCode/);
  assert.doesNotMatch(appSource, /pendingDeepLinkExpanded/);
  assert.doesNotMatch(appSource, /url\.pathname === '\/story'/);
  assert.doesNotMatch(appSource, /searchParams\.get\('c'\)/);
  assert.match(metaTagsSource, /SITE_VARIANT === 'startup'[\s\S]+resetMetaTags\(\);[\s\S]+return;/);
});
