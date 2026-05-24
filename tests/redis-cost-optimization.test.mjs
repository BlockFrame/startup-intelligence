import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const root = resolve('.');

describe('Redis command cost optimizations', () => {
  const healthSrc = readFileSync(join(root, 'api', 'health.js'), 'utf8');
  const rssProxySrc = readFileSync(join(root, 'api', 'rss-proxy.js'), 'utf8');

  it('limits startup health checks to startup-relevant Redis keys', () => {
    assert.match(healthSrc, /const STARTUP_HEALTH_NAMES = new Set/);
    assert.match(healthSrc, /getStartupHealthRegistries/);
    assert.doesNotMatch(healthSrc, /resolveHealthScope/);
    assert.doesNotMatch(healthSrc, /process\.env\.HEALTH_SCOPE/);

    const startupNamesBlock = healthSrc.match(/const STARTUP_HEALTH_NAMES = new Set\(\[([\s\S]*?)\]\);/)?.[1] ?? '';
    for (const kept of ['marketQuotes', 'sectors', 'techEvents', 'techReadiness', 'productCatalog', 'telegramFeed']) {
      assert.ok(startupNamesBlock.includes(`'${kept}'`), `startup health should keep ${kept}`);
    }
    for (const legacy of ['militaryFlights', 'radiationWatch', 'climateDisasters', 'sanctionsEntities', 'diseaseOutbreaks']) {
      assert.ok(!startupNamesBlock.includes(`'${legacy}'`), `startup health should not include legacy key ${legacy}`);
    }
  });

  it('does not keep a full legacy health branch available', () => {
    assert.doesNotMatch(healthSrc, /scope !== 'startup'/);
    assert.doesNotMatch(healthSrc, /queryScope/);
    assert.doesNotMatch(healthSrc, /envScope/);
    assert.match(healthSrc, /scope: 'startup'/);
  });

  it('makes RSS proxy Redis rate limiting opt-in', () => {
    assert.match(rssProxySrc, /RSS_PROXY_RATE_LIMIT_ENABLED = process\.env\.RSS_PROXY_RATE_LIMIT === 'true'/);
    assert.match(rssProxySrc, /if \(RSS_PROXY_RATE_LIMIT_ENABLED\)/);
  });
});
