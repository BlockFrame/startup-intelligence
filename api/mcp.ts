import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';
// @ts-expect-error — JS module, no declaration file
import { getPublicCorsHeaders } from './_cors.js';
// @ts-expect-error — JS module, no declaration file
import { jsonResponse } from './_json-response.js';
// @ts-expect-error — JS module, no declaration file
import { readJsonFromUpstash } from './_upstash-json.js';
// @ts-expect-error — JS module, no declaration file
import { resolveApiKeyFromBearer } from './_oauth-token.js';
// @ts-expect-error — JS module, no declaration file
import { timingSafeIncludes } from './_crypto.js';
// @ts-expect-error — generated JS module, no declaration file
import MINING_SITES_RAW from '../shared/mining-sites.js';

export const config = { runtime: 'edge' };

const MCP_PROTOCOL_VERSION = '2025-03-26';
const SERVER_NAME = 'worldmonitor';
const SERVER_VERSION = '1.0';

// ---------------------------------------------------------------------------
// Per-key rate limiter (60 calls/min per PRO API key)
// ---------------------------------------------------------------------------
let mcpRatelimit: Ratelimit | null = null;

function getMcpRatelimit(): Ratelimit | null {
  if (mcpRatelimit) return mcpRatelimit;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  mcpRatelimit = new Ratelimit({
    redis: new Redis({ url, token }),
    limiter: Ratelimit.slidingWindow(60, '60 s'),
    prefix: 'rl:mcp',
    analytics: false,
  });
  return mcpRatelimit;
}

// ---------------------------------------------------------------------------
// Tool registry
// ---------------------------------------------------------------------------
interface BaseToolDef {
  name: string;
  description: string;
  inputSchema: { type: string; properties: Record<string, unknown>; required: string[] };
}

interface FreshnessCheck {
  key: string;
  maxStaleMin: number;
}

// Cache-read tool: reads one or more Redis keys and returns them with staleness info.
interface CacheToolDef extends BaseToolDef {
  _cacheKeys: string[];
  _seedMetaKey: string;
  _maxStaleMin: number;
  _freshnessChecks?: FreshnessCheck[];
  _execute?: never;
}

// AI inference tool: calls an internal RPC endpoint and returns the raw response.
interface RpcToolDef extends BaseToolDef {
  _cacheKeys?: never;
  _seedMetaKey?: never;
  _maxStaleMin?: never;
  _freshnessChecks?: never;
  _execute: (params: Record<string, unknown>, base: string, apiKey: string) => Promise<unknown>;
}

type ToolDef = CacheToolDef | RpcToolDef;

const TOOL_REGISTRY: ToolDef[] = [
  {
    name: 'get_market_data',
    description: 'Real-time equity quotes, commodity prices (including gold futures GC=F), crypto prices, forex FX rates (USD/EUR, USD/JPY etc.), sector performance, ETF flows, and Gulf market quotes from WorldMonitor\'s curated bootstrap cache.',
    inputSchema: { type: 'object', properties: {}, required: [] },
    _cacheKeys: [
      'market:stocks-bootstrap:v1',
      'market:commodities-bootstrap:v1',
      'market:crypto:v1',
      'market:sectors:v2',
      'market:etf-flows:v1',
      'market:gulf-quotes:v1',
      'market:fear-greed:v1',
    ],
    _seedMetaKey: 'seed-meta:market:stocks',
    _maxStaleMin: 30,
  },
  {
    name: 'get_cyber_threats',
    description: 'Active cyber threat intelligence: malware IOCs (URLhaus, Feodotracker), CISA known exploited vulnerabilities, and active command-and-control infrastructure.',
    inputSchema: { type: 'object', properties: {}, required: [] },
    _cacheKeys: ['cyber:threats-bootstrap:v2'],
    _seedMetaKey: 'seed-meta:cyber:threats',
    _maxStaleMin: 240,
  },
  {
    name: 'get_economic_data',
    description: 'Macro economic indicators: Fed Funds rate (FRED), economic calendar events, fuel prices, ECB FX rates, EU yield curve, earnings calendar, COT positioning, energy storage data, BIS household debt service ratio (DSR, quarterly, leading indicator of household financial stress across ~40 advanced economies), and BIS residential + commercial property price indices (real, quarterly).',
    inputSchema: { type: 'object', properties: {}, required: [] },
    _cacheKeys: [
      'economic:fred:v1:FEDFUNDS:0',
      'economic:econ-calendar:v1',
      'economic:fuel-prices:v1',
      'economic:ecb-fx-rates:v1',
      'economic:yield-curve-eu:v1',
      'economic:spending:v1',
      'market:earnings-calendar:v1',
      'market:cot:v1',
      'economic:bis:dsr:v1',
      'economic:bis:property-residential:v1',
      'economic:bis:property-commercial:v1',
    ],
    _seedMetaKey: 'seed-meta:economic:econ-calendar',
    _maxStaleMin: 1440,
    _freshnessChecks: [
      { key: 'seed-meta:economic:econ-calendar', maxStaleMin: 1440 },
      // Per-dataset BIS seed-meta keys — the aggregate
      // `seed-meta:economic:bis-extended` would report "fresh" even if only
      // one of the three datasets (DSR / SPP / CPP) is current, matching the
      // false-freshness bug already fixed for /api/health and resilience.
      { key: 'seed-meta:economic:bis-dsr', maxStaleMin: 1440 }, // 12h cron × 2
      { key: 'seed-meta:economic:bis-property-residential', maxStaleMin: 1440 },
      { key: 'seed-meta:economic:bis-property-commercial', maxStaleMin: 1440 },
    ],
  },
  {
    name: 'get_country_macro',
    description: 'Per-country macroeconomic indicators from IMF WEO (~210 countries, monthly cadence). Bundles fiscal/external balance (inflation, current account, gov revenue/expenditure/primary balance, CPI), growth & per-capita (real GDP growth, GDP/capita USD & PPP, savings & investment rates, savings-investment gap), labor & demographics (unemployment, population), and external trade (current account USD, import/export volume % changes). Latest available year per series. Use for country-level economic screening, peer benchmarking, and stagflation/imbalance flags. NOTE: export/import LEVELS in USD (exportsUsd, importsUsd, tradeBalanceUsd) are returned as null — WEO retracted broad coverage for BX/BM indicators in 2026-04; use currentAccountUsd or volume changes (import/exportVolumePctChg) instead.',
    inputSchema: { type: 'object', properties: {}, required: [] },
    _cacheKeys: [
      'economic:imf:macro:v2',
      'economic:imf:growth:v1',
      'economic:imf:labor:v1',
      'economic:imf:external:v1',
    ],
    _seedMetaKey: 'seed-meta:economic:imf-macro',
    _maxStaleMin: 100800, // monthly WEO release; 70d = 2× interval (absorbs one missed run)
    _freshnessChecks: [
      { key: 'seed-meta:economic:imf-macro', maxStaleMin: 100800 },
      { key: 'seed-meta:economic:imf-growth', maxStaleMin: 100800 },
      { key: 'seed-meta:economic:imf-labor', maxStaleMin: 100800 },
      { key: 'seed-meta:economic:imf-external', maxStaleMin: 100800 },
    ],
  },
  {
    name: 'get_eu_housing_cycle',
    description: 'Eurostat annual house price index (prc_hpi_a, base 2015=100) for all 27 EU members plus EA20 and EU27_2020 aggregates. Each country entry includes the latest value, prior value, date, unit, and a 10-year sparkline series. Complements BIS WS_SPP with broader EU coverage for the Housing cycle tile.',
    inputSchema: { type: 'object', properties: {}, required: [] },
    _cacheKeys: ['economic:eurostat:house-prices:v1'],
    _seedMetaKey: 'seed-meta:economic:eurostat-house-prices',
    _maxStaleMin: 60 * 24 * 50, // weekly cron, annual data
  },
  {
    name: 'get_eu_quarterly_gov_debt',
    description: 'Eurostat quarterly general government gross debt (gov_10q_ggdebt, %GDP) for all 27 EU members plus EA20 and EU27_2020 aggregates. Each country entry includes latest value, prior value, quarter label, and an 8-quarter sparkline series. Provides fresher debt-trajectory signal than annual IMF GGXWDG_NGDP for EU panels.',
    inputSchema: { type: 'object', properties: {}, required: [] },
    _cacheKeys: ['economic:eurostat:gov-debt-q:v1'],
    _seedMetaKey: 'seed-meta:economic:eurostat-gov-debt-q',
    _maxStaleMin: 60 * 24 * 14, // quarterly data, 2-day cron
  },
  {
    name: 'get_eu_industrial_production',
    description: 'Eurostat monthly industrial production index (sts_inpr_m, NACE B-D industry excl. construction, SCA, base 2021=100) for all 27 EU members plus EA20 and EU27_2020 aggregates. Each country entry includes latest value, prior value, month label, and a 12-month sparkline series. Leading indicator of real-economy activity used by the "Real economy pulse" sparkline.',
    inputSchema: { type: 'object', properties: {}, required: [] },
    _cacheKeys: ['economic:eurostat:industrial-production:v1'],
    _seedMetaKey: 'seed-meta:economic:eurostat-industrial-production',
    _maxStaleMin: 60 * 24 * 5, // monthly data, daily cron
  },
  {
    name: 'get_infrastructure_status',
    description: 'Internet infrastructure health: Cloudflare Radar outages and service status for major cloud providers and internet services.',
    inputSchema: { type: 'object', properties: {}, required: [] },
    _cacheKeys: ['infra:outages:v1'],
    _seedMetaKey: 'seed-meta:infra:outages',
    _maxStaleMin: 30,
  },
  {
    name: 'get_supply_chain_data',
    description: 'Dry bulk shipping stress index, customs revenue flows, and COMTRADE bilateral trade data. Tracks global supply chain pressure and trade disruptions.',
    inputSchema: { type: 'object', properties: {}, required: [] },
    _cacheKeys: [
      'supply_chain:shipping_stress:v1',
      'trade:customs-revenue:v1',
      'comtrade:flows:v1',
    ],
    _seedMetaKey: 'seed-meta:trade:customs-revenue',
    _maxStaleMin: 2880,
  },
  {
    name: 'get_research_signals',
    description: 'Tech and research event signals: emerging technology events bootstrap data from curated research feeds.',
    inputSchema: { type: 'object', properties: {}, required: [] },
    _cacheKeys: ['research:tech-events-bootstrap:v1'],
    _seedMetaKey: 'seed-meta:research:tech-events',
    _maxStaleMin: 480,
  },
  // -------------------------------------------------------------------------
  // Social velocity — cache read (Reddit signals, seeded by relay)
  // -------------------------------------------------------------------------
  {
    name: 'get_social_velocity',
    description: 'Reddit geopolitical social velocity: top posts from worldnews, geopolitics, and related subreddits with engagement scores and trend signals.',
    inputSchema: { type: 'object', properties: {}, required: [] },
    _cacheKeys: ['intelligence:social:reddit:v1'],
    _seedMetaKey: 'seed-meta:intelligence:social-reddit',
    _maxStaleMin: 30,
  },

  {
    name: 'get_commodity_geo',
    description: 'Global mining sites with coordinates, operator, mineral type, and production status. Covers 71 major mines spanning gold, silver, copper, lithium, uranium, coal, and other minerals worldwide.',
    inputSchema: {
      type: 'object',
      properties: {
        mineral: { type: 'string', description: 'Filter by mineral type (e.g. "Gold", "Copper", "Lithium")' },
        country: { type: 'string', description: 'Filter by country name (e.g. "Australia", "Chile")' },
      },
      required: [],
    },
    _execute: async (params: Record<string, unknown>) => {
      type MineSite = { id: string; name: string; lat: number; lon: number; mineral: string; country: string; operator: string; status: string; significance: string; annualOutput?: string; productionRank?: number; openPitOrUnderground?: string };
      let sites = MINING_SITES_RAW as MineSite[];
      if (params.mineral) sites = sites.filter((s) => s.mineral === String(params.mineral));
      if (params.country) sites = sites.filter((s) => s.country.toLowerCase().includes(String(params.country).toLowerCase()));
      return { sites, total: sites.length };
    },
  },
];

// Public shape for tools/list (strip internal _-prefixed fields, add MCP annotations)
const TOOL_LIST_RESPONSE = TOOL_REGISTRY.map(({ name, description, inputSchema }) => ({
  name,
  description,
  inputSchema,
  annotations: { readOnlyHint: true, openWorldHint: true },
}));

// ---------------------------------------------------------------------------
// JSON-RPC helpers
// ---------------------------------------------------------------------------
function rpcOk(id: unknown, result: unknown, extraHeaders: Record<string, string> = {}): Response {
  return jsonResponse({ jsonrpc: '2.0', id: id ?? null, result }, 200, extraHeaders);
}

function rpcError(id: unknown, code: number, message: string): Response {
  return jsonResponse({ jsonrpc: '2.0', id: id ?? null, error: { code, message } }, 200);
}

export function evaluateFreshness(checks: FreshnessCheck[], metas: unknown[], now = Date.now()): { cached_at: string | null; stale: boolean } {
  let stale = false;
  let oldestFetchedAt = Number.POSITIVE_INFINITY;
  let hasAnyValidMeta = false;
  let hasAllValidMeta = true;

  for (const [i, check] of checks.entries()) {
    const meta = metas[i];
    const fetchedAt = meta && typeof meta === 'object' && 'fetchedAt' in meta
      ? Number((meta as { fetchedAt: unknown }).fetchedAt)
      : Number.NaN;

    if (!Number.isFinite(fetchedAt) || fetchedAt <= 0) {
      hasAllValidMeta = false;
      stale = true;
      continue;
    }

    hasAnyValidMeta = true;
    oldestFetchedAt = Math.min(oldestFetchedAt, fetchedAt);
    stale ||= (now - fetchedAt) / 60_000 > check.maxStaleMin;
  }

  return {
    cached_at: hasAnyValidMeta && hasAllValidMeta ? new Date(oldestFetchedAt).toISOString() : null,
    stale,
  };
}

// ---------------------------------------------------------------------------
// Tool execution
// ---------------------------------------------------------------------------
async function executeTool(tool: CacheToolDef): Promise<{ cached_at: string | null; stale: boolean; data: Record<string, unknown> }> {
  const reads = tool._cacheKeys.map(k => readJsonFromUpstash(k));
  const freshnessChecks = tool._freshnessChecks?.length
    ? tool._freshnessChecks
    : [{ key: tool._seedMetaKey, maxStaleMin: tool._maxStaleMin }];
  const metaReads = freshnessChecks.map((check) => readJsonFromUpstash(check.key));
  const [results, metas] = await Promise.all([Promise.all(reads), Promise.all(metaReads)]);
  const { cached_at, stale } = evaluateFreshness(freshnessChecks, metas);

  const data: Record<string, unknown> = {};
  // Walk backward through ':'-delimited segments, skipping non-informative suffixes
  // (version tags, bare numbers, internal format names) to produce a readable label.
  const NON_LABEL = /^(v\d+|\d+|stale|sebuf)$/;
  tool._cacheKeys.forEach((key, i) => {
    const parts = key.split(':');
    let label = '';
    for (let idx = parts.length - 1; idx >= 0; idx--) {
      const seg = parts[idx] ?? '';
      if (!NON_LABEL.test(seg)) { label = seg; break; }
    }
    data[label || (parts[0] ?? key)] = results[i];
  });

  return { cached_at, stale, data };
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------
export default async function handler(req: Request): Promise<Response> {
  // MCP is a public API endpoint secured by API key — allow all origins (claude.ai, Claude Desktop, custom agents)
  const corsHeaders = getPublicCorsHeaders('POST, OPTIONS');

  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  // HEAD probe — return 200 with no body (Anthropic submission guide compatibility)
  if (req.method === 'HEAD') {
    return new Response(null, { status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
  }

  // MCP Streamable HTTP transport (2025-03-26) uses POST only.
  // Return 405 for GET/other so clients don't mistake JSON error for a valid SSE stream.
  if (req.method !== 'POST') {
    return new Response(null, { status: 405, headers: { Allow: 'POST, HEAD, OPTIONS', ...corsHeaders } });
  }

  // Origin validation: allow claude.ai/claude.com web clients; allow absent origin (desktop/CLI)
  const origin = req.headers.get('Origin');
  if (origin && origin !== 'https://claude.ai' && origin !== 'https://claude.com') {
    return new Response('Forbidden', { status: 403, headers: corsHeaders });
  }
  // Auth chain (in priority order):
  //   1. Authorization: Bearer <oauth_token> — issued by /oauth/token (spec-compliant OAuth 2.0)
  //   2. X-WorldMonitor-Key header — direct API key (curl, custom integrations)
  let apiKey = '';
  const authHeader = req.headers.get('Authorization') ?? '';
  if (authHeader.startsWith('Bearer ')) {
    const token = authHeader.slice(7).trim();
    let bearerApiKey: string | null;
    try {
      bearerApiKey = await resolveApiKeyFromBearer(token);
    } catch {
      // Redis/network error — return 503 so clients know to retry, not re-authenticate
      return new Response(
        JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32603, message: 'Auth service temporarily unavailable. Try again.' } }),
        { status: 503, headers: { 'Content-Type': 'application/json', 'Retry-After': '5', ...corsHeaders } }
      );
    }
    if (bearerApiKey) {
      apiKey = bearerApiKey;
    } else {
      // Bearer token present but unresolvable — expired or invalid UUID
      return new Response(
        JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32001, message: 'Invalid or expired OAuth token. Re-authenticate via /oauth/token.' } }),
        { status: 401, headers: { 'Content-Type': 'application/json', 'WWW-Authenticate': 'Bearer realm="worldmonitor", error="invalid_token", resource_metadata="https://api.worldmonitor.app/.well-known/oauth-protected-resource"', ...corsHeaders } }
      );
    }
  } else {
    const candidateKey = req.headers.get('X-WorldMonitor-Key') ?? '';
    if (!candidateKey) {
      return new Response(
        JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32001, message: 'Authentication required. Use OAuth (/oauth/token) or pass your API key via X-WorldMonitor-Key header.' } }),
        { status: 401, headers: { 'Content-Type': 'application/json', 'WWW-Authenticate': 'Bearer realm="worldmonitor", resource_metadata="https://api.worldmonitor.app/.well-known/oauth-protected-resource"', ...corsHeaders } }
      );
    }
    const validKeys = (process.env.WORLDMONITOR_VALID_KEYS || '').split(',').filter(Boolean);
    if (!await timingSafeIncludes(candidateKey, validKeys)) {
      return rpcError(null, -32001, 'Invalid API key');
    }
    apiKey = candidateKey;
  }


  // Per-key rate limit
  const rl = getMcpRatelimit();
  if (rl) {
    try {
      const { success } = await rl.limit(`key:${apiKey}`);
      if (!success) {
        return rpcError(null, -32029, 'Rate limit exceeded. Max 60 requests per minute per API key.');
      }
    } catch {
      // Upstash unavailable — allow through (graceful degradation)
    }
  }

  // Parse body
  let body: { jsonrpc?: string; id?: unknown; method?: string; params?: unknown };
  try {
    body = await req.json();
  } catch {
    return rpcError(null, -32600, 'Invalid request: malformed JSON');
  }

  if (!body || typeof body.method !== 'string') {
    return rpcError(body?.id ?? null, -32600, 'Invalid request: missing method');
  }

  const { id, method, params } = body;

  // Dispatch
  switch (method) {
    case 'initialize': {
      const sessionId = crypto.randomUUID();
      return rpcOk(id, {
        protocolVersion: MCP_PROTOCOL_VERSION,
        capabilities: { tools: {} },
        serverInfo: { name: SERVER_NAME, version: SERVER_VERSION },
      }, { 'Mcp-Session-Id': sessionId, ...corsHeaders });
    }

    case 'notifications/initialized':
      return new Response(null, { status: 202, headers: corsHeaders });

    case 'ping':
      return rpcOk(id, {}, corsHeaders);

    case 'tools/list':
      return rpcOk(id, { tools: TOOL_LIST_RESPONSE }, corsHeaders);

    case 'tools/call': {
      const p = params as { name?: string; arguments?: Record<string, unknown> } | null;
      if (!p || typeof p.name !== 'string') {
        return rpcError(id, -32602, 'Invalid params: missing tool name');
      }
      const tool = TOOL_REGISTRY.find(t => t.name === p.name);
      if (!tool) {
        return rpcError(id, -32602, `Unknown tool: ${p.name}`);
      }
      try {
        let result: unknown;
        if (tool._execute) {
          const origin = new URL(req.url).origin;
          result = await tool._execute(p.arguments ?? {}, origin, apiKey);
        } else {
          result = await executeTool(tool);
        }
        return rpcOk(id, {
          content: [{ type: 'text', text: JSON.stringify(result) }],
        }, corsHeaders);
      } catch (err: unknown) {
        console.error('[mcp] tool execution error:', err);
        return rpcError(id, -32603, 'Internal error: data fetch failed');
      }
    }

    default:
      return rpcError(id, -32601, `Method not found: ${method}`);
  }
}
