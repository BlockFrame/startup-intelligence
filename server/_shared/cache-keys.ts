// ── Story persistence tracking keys (E3) ─────────────────────────────────────
// Hash: firstSeen, lastSeen, mentionCount, sourceCount, currentScore, peakScore, title, link, severity, lang
export const STORY_TRACK_KEY_PREFIX = 'story:track:v1:';
// Set: unique feed names that have mentioned this story
export const STORY_SOURCES_KEY_PREFIX = 'story:sources:v1:';
// Sorted set: single member "peak" with score = highest importanceScore seen
export const STORY_PEAK_KEY_PREFIX = 'story:peak:v1:';
// Sorted set: accumulator for digest mode notifications (score = pubDate epoch ms)
export const DIGEST_ACCUMULATOR_KEY_PREFIX = 'digest:accumulator:v1:';
// TTL for all story tracking keys (48 hours)
export const STORY_TRACKING_TTL_S = 172800;

/**
 * Story tracking keys — written by list-feed-digest.ts, read by digest cron (E2).
 * All keys use 32-char SHA-256 hex prefix of the normalised title as ${titleHash}.
 *
 *   story:track:v1:${titleHash}     Hash   firstSeen/lastSeen/title/link/severity/mentionCount/currentScore/lang
 *   story:sources:v1:${titleHash}   Set    feed IDs (SADD per appearance)
 *   story:peak:v1:${titleHash}      ZSet   single member "peak", score = highest importanceScore (ZADD GT)
 *   digest:accumulator:v1:${variant}:${lang} ZSet  member=titleHash, score=lastSeen_ms (updated every appearance)
 *
 * TTL for all: 172800s (48h), refreshed each digest cycle.
 * Shadow scoring key (written by notification-relay.cjs, which owns the live
 * value — the constant here is documentation only, not imported):
 *   shadow:score-log:v3            ZSet   score=epoch_ms, member=JSON{ts,importanceScore,severity,eventType,title,source,publishedAt,corroborationCount,variant}
 *   shadow:score-log:v2            ZSet   legacy (weight rebalance PR) — self-prunes via 7d ZREMRANGEBYSCORE
 *   shadow:score-log:v1            ZSet   legacy (pre-PR #3069) — self-prunes
 */
export const STORY_TRACK_KEY = (titleHash: string) => `story:track:v1:${titleHash}`;
export const STORY_SOURCES_KEY = (titleHash: string) => `story:sources:v1:${titleHash}`;
export const STORY_PEAK_KEY = (titleHash: string) => `story:peak:v1:${titleHash}`;
export const DIGEST_ACCUMULATOR_KEY = (variant: string, lang = 'en') => `digest:accumulator:v1:${variant}:${lang}`;
export const DIGEST_LAST_SENT_KEY = (userId: string, variant: string) => `digest:last-sent:v1:${userId}:${variant}`;
// NOTE: notification-relay.cjs owns the live value (shadow:score-log:v3 since weight rebalance).
// This export is documentation/discoverability; changing it here does NOT affect the relay.
// If you modify the key, also update scripts/notification-relay.cjs SHADOW_SCORE_LOG_KEY.
export const SHADOW_SCORE_LOG_KEY = 'shadow:score-log:v3';
export const STORY_TTL = 604800;           // 7 days — enough for sustained multi-day stories
export const DIGEST_ACCUMULATOR_TTL = 172800; // 48h — lookback window for digest content

/**
 * Shared Redis pointer keys for simulation artifacts.
 * Defined here so TypeScript handlers and seed scripts agree on the exact string.
 * The MJS seed script keeps its own copy (cannot import TS source directly).
 */
export const SIMULATION_OUTCOME_LATEST_KEY = 'forecast:simulation-outcome:latest';
export const SIMULATION_PACKAGE_LATEST_KEY = 'forecast:simulation-package:latest';
export const REGULATORY_ACTIONS_KEY = 'regulatory:actions:v1';
export const CLIMATE_ANOMALIES_KEY = 'climate:anomalies:v2';
export const CLIMATE_AIR_QUALITY_KEY = 'climate:air-quality:v1';
export const CLIMATE_ZONE_NORMALS_KEY = 'climate:zone-normals:v1';
export const CLIMATE_CO2_MONITORING_KEY = 'climate:co2-monitoring:v1';
export const CLIMATE_OCEAN_ICE_KEY = 'climate:ocean-ice:v1';
export const CLIMATE_NEWS_KEY = 'climate:news-intelligence:v1';
export const HEALTH_AIR_QUALITY_KEY = 'health:air-quality:v1';

export const ENERGY_MIX_KEY_PREFIX = 'energy:mix:v1:';
export const ENERGY_EXPOSURE_INDEX_KEY = 'energy:exposure:v1:index';
export const GAS_STORAGE_KEY_PREFIX = 'energy:gas-storage:v1:';
export const GAS_STORAGE_COUNTRIES_KEY = 'energy:gas-storage:v1:_countries';
export const ELECTRICITY_KEY_PREFIX = 'energy:electricity:v1:';
export const ELECTRICITY_INDEX_KEY = 'energy:electricity:v1:index';
export const ENERGY_INTELLIGENCE_KEY = 'energy:intelligence:v1:feed';
export const CHOKEPOINT_FLOWS_KEY = 'energy:chokepoint-flows:v1';
export const ENERGY_SPINE_KEY_PREFIX = 'energy:spine:v1:';
export const ENERGY_SPINE_COUNTRIES_KEY = 'energy:spine:v1:_countries';
export const EMBER_ELECTRICITY_KEY_PREFIX = 'energy:ember:v1:';
export const EMBER_ELECTRICITY_ALL_KEY = 'energy:ember:v1:_all';
export const SPR_KEY = 'economic:spr:v1';
export const SPR_POLICIES_KEY = 'energy:spr-policies:v1';
export const REFINERY_INPUTS_KEY = 'economic:refinery-inputs:v1';

/**
 * Per-country chokepoint exposure index. Request-varying — excluded from bootstrap.
 * Key: supply-chain:exposure:{iso2}:{hs2}:v1
 */
export const CHOKEPOINT_EXPOSURE_KEY = (iso2: string, hs2: string) =>
  `supply-chain:exposure:${iso2}:${hs2}:v1`;
export const CHOKEPOINT_EXPOSURE_SEED_META_KEY = 'seed-meta:supply_chain:chokepoint-exposure';

/**
 * Per-country + per-chokepoint cost shock cache.
 * NOT in bootstrap — request-varying, PRO-gated.
 */
export const COST_SHOCK_KEY = (iso2: string, chokepointId: string) =>
  `supply-chain:cost-shock:${iso2}:${chokepointId}:v1` as const;

/**
 * Per-country + per-HS2 sector dependency cache.
 * NOT in bootstrap — request-varying, PRO-gated.
 */
export const SECTOR_DEPENDENCY_KEY = (iso2: string, hs2: string) =>
  `supply-chain:sector-dep:${iso2}:${hs2}:v1` as const;

/**
 * Route Explorer lane cache — per (fromIso2, toIso2, hs2, cargoType).
 * NOT in bootstrap — request-varying, PRO-gated.
 */
export const ROUTE_EXPLORER_LANE_KEY = (
  fromIso2: string,
  toIso2: string,
  hs2: string,
  cargoType: string,
) => `supply-chain:route-explorer-lane:${fromIso2}:${toIso2}:${hs2}:${cargoType}:v1` as const;

/**
 * Route impact cache — per (fromIso2, toIso2, hs2).
 * NOT in bootstrap — request-varying, PRO-gated. 24h Redis TTL.
 */
export const ROUTE_IMPACT_KEY = (fromIso2: string, toIso2: string, hs2: string) =>
  `supply-chain:route-impact:${fromIso2}:${toIso2}:${hs2}:v1` as const;

/**
 * Shared chokepoint status cache key — written by get-chokepoint-status, read by bypass-options and cost-shock handlers.
 */
export const CHOKEPOINT_STATUS_KEY = 'supply_chain:chokepoints:v4' as const;

/**
 * Static cache keys for the bootstrap endpoint.
 * Only keys with NO request-varying suffixes are included.
 */
export const BOOTSTRAP_CACHE_KEYS: Record<string, string> = {
  outages:          'infra:outages:v1',
  serviceStatuses:  'infra:service-statuses:v1',
  ddosAttacks:      'cf:radar:ddos:v1',
  trafficAnomalies: 'cf:radar:traffic-anomalies:v1',
  marketQuotes:     'market:stocks-bootstrap:v1',
  sectors:          'market:sectors:v2',
  etfFlows:         'market:etf-flows:v1',
  macroSignals:     'economic:macro-signals:v1',
  bisPolicy:        'economic:bis:policy:v1',
  bisExchange:      'economic:bis:eer:v1',
  bisCredit:        'economic:bis:credit:v1',
  crossSourceSignals: 'intelligence:cross-source-signals:v1',
  cyberThreats:     'cyber:threats-bootstrap:v2',
  techReadiness:    'economic:worldbank-techreadiness:v1',
  insights:         'news:insights:v1',
  cryptoQuotes:     'market:crypto:v1',
  cryptoSectors:    'market:crypto-sectors:v1',
  defiTokens:       'market:defi-tokens:v1',
  aiTokens:         'market:ai-tokens:v1',
  otherTokens:      'market:other-tokens:v1',
  stablecoinMarkets: 'market:stablecoins:v1',
  techEvents:        'research:tech-events-bootstrap:v1',
  gdeltIntel:        'intelligence:gdelt-intel:v1',
  securityAdvisories: 'intelligence:advisories-bootstrap:v1',
  consumerPricesOverview:   'consumer-prices:overview:ae',
  consumerPricesCategories: 'consumer-prices:categories:ae:30d',
  consumerPricesMovers:     'consumer-prices:movers:ae:30d',
  consumerPricesSpread:     'consumer-prices:retailer-spread:ae:essentials-ae',
  marketImplications: 'intelligence:market-implications:v1',
  fearGreedIndex:   'market:fear-greed:v1',
  hyperliquidFlow:  'market:hyperliquid:flow:v1',
  crudeInventories: 'economic:crude-inventories:v1',
  natGasStorage:    'economic:nat-gas-storage:v1',
  ecbFxRates:       'economic:ecb-fx-rates:v1',
  euFsi:            'economic:fsi-eu:v1',
  socialVelocity:   'intelligence:social:reddit:v1',
  wsbTickers:       'intelligence:wsb-tickers:v1',
  aaiiSentiment:    'market:aaii-sentiment:v1',
  breadthHistory:   'market:breadth-history:v1',
};

export const PORTWATCH_PORT_ACTIVITY_KEY_PREFIX = 'supply_chain:portwatch-ports:v1:';
export const PORTWATCH_PORT_ACTIVITY_COUNTRIES_KEY = 'supply_chain:portwatch-ports:v1:_countries';

export const BOOTSTRAP_TIERS: Record<string, 'slow' | 'fast'> = {
  bisPolicy: 'slow',
  bisExchange: 'slow',
  bisCredit: 'slow',
  sectors: 'slow',
  etfFlows: 'slow',
  crossSourceSignals: 'slow',
  cyberThreats: 'slow',
  techReadiness: 'slow',
  cryptoQuotes: 'slow',
  cryptoSectors: 'slow',
  defiTokens: 'slow',
  aiTokens: 'slow',
  otherTokens: 'slow',
  stablecoinMarkets: 'slow',
  techEvents: 'slow',
  securityAdvisories: 'slow',
  consumerPricesOverview: 'slow',
  consumerPricesCategories: 'slow',
  consumerPricesMovers: 'slow',
  consumerPricesSpread: 'slow',
  marketImplications: 'slow',
  fearGreedIndex: 'slow',
  hyperliquidFlow: 'slow',
  crudeInventories: 'slow',
  natGasStorage: 'slow',
  ecbFxRates: 'slow',
  euFsi: 'slow',
  aaiiSentiment: 'slow',
  breadthHistory: 'slow',
  outages: 'fast',
  serviceStatuses: 'fast',
  ddosAttacks: 'fast',
  trafficAnomalies: 'fast',
  marketQuotes: 'fast',
  macroSignals: 'fast',
  insights: 'fast',
  gdeltIntel: 'fast',
  socialVelocity: 'fast',
  wsbTickers: 'fast',
};

export const PORTWATCH_CHOKEPOINTS_REF_KEY = 'portwatch:chokepoints:ref:v1';
