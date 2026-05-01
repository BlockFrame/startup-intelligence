import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

function source(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
}

const startupHandlerSource = source('server/startup/intelligence/v1/handler.ts');
const apiIntelligenceSource = source('api/intelligence/v1/[rpc].ts');
const mcpSource = source('api/mcp.ts');

test('startup intelligence API routes to startup handler namespace', () => {
  assert.match(apiIntelligenceSource, /server\/startup\/intelligence\/v1\/handler/);
  assert.doesNotMatch(apiIntelligenceSource, /server\/worldmonitor\/intelligence\/v1\/handler/);
});

test('startup intelligence handler keeps startup capabilities and disables legacy world-risk RPCs', () => {
  for (const kept of [
    'getCompanyEnrichment',
    'listCompanySignals',
    'listTelegramFeed',
    'listMarketImplications',
    'getSocialVelocity',
    'listSecurityAdvisories',
  ]) {
    assert.match(startupHandlerSource, new RegExp(`\\b${kept}\\b`), `${kept} should stay active`);
  }

  for (const disabled of [
    'getRiskScores',
    'getCountryRisk',
    'getCountryIntelBrief',
    'deductSituation',
    'listSatellites',
    'listGpsInterference',
    'listOrefAlerts',
    'getCountryEnergyProfile',
    'computeEnergyShockScenario',
    'getCountryPortActivity',
    'getRegionalSnapshot',
    'getRegimeHistory',
    'getRegionalBrief',
  ]) {
    assert.match(
      startupHandlerSource,
      new RegExp(`${disabled}: legacyUnavailableRpc\\('${disabled}'\\)`),
      `${disabled} should be unavailable in startup handler`,
    );
  }
});

test('startup target intelligence tests point at startup server handlers', () => {
  assert.match(source('tests/market-implications.test.mts'), /server\/startup\/intelligence\/v1\/list-market-implications/);
  assert.doesNotMatch(source('tests/market-implications.test.mts'), /server\/worldmonitor\/intelligence\/v1\/list-market-implications/);

  const enrichmentTest = source('tests/enrichment-caching.test.mjs');
  assert.match(enrichmentTest, /server\/startup\/intelligence\/v1\/get-company-enrichment\.ts/);
  assert.match(enrichmentTest, /server\/startup\/intelligence\/v1\/list-company-signals\.ts/);
});

test('startup MCP and premium path config no longer expose disabled legacy intelligence RPCs', () => {
  for (const legacyTool of ["name: 'get_country_brief'", "name: 'get_country_risk'", "name: 'analyze_situation'"]) {
    assert.doesNotMatch(mcpSource, new RegExp(legacyTool.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }

  for (const legacyPath of [
    '/api/intelligence/v1/get-country-intel-brief',
    '/api/intelligence/v1/get-country-risk',
    '/api/intelligence/v1/deduct-situation',
  ]) {
    assert.doesNotMatch(mcpSource, new RegExp(legacyPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    assert.doesNotMatch(source('src/shared/premium-paths.ts'), new RegExp(legacyPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
});

test('startup gateway cache tiers cover active startup intelligence RPCs only', () => {
  const tierSource = source('server/gateway-cache-tiers.ts');
  const startupBlock = tierSource.slice(
    tierSource.indexOf('export const STARTUP_RPC_CACHE_TIER'),
    tierSource.indexOf('export const LEGACY_RPC_CACHE_TIER'),
  );
  for (const activePath of [
    '/api/intelligence/v1/list-telegram-feed',
    '/api/intelligence/v1/get-company-enrichment',
    '/api/intelligence/v1/list-company-signals',
    '/api/intelligence/v1/list-market-implications',
    '/api/intelligence/v1/get-social-velocity',
    '/api/intelligence/v1/get-gdelt-topic-timeline',
    '/api/intelligence/v1/list-cross-source-signals',
    '/api/intelligence/v1/list-security-advisories',
  ]) {
    assert.match(startupBlock, new RegExp(activePath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
  for (const disabledPath of [
    '/api/intelligence/v1/get-country-intel-brief',
    '/api/intelligence/v1/get-country-risk',
    '/api/intelligence/v1/deduct-situation',
  ]) {
    assert.doesNotMatch(startupBlock, new RegExp(disabledPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
});
