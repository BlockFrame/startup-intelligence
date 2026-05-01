/**
 * Shared gateway logic for per-domain Vercel edge functions.
 *
 * Each domain edge function calls `createDomainGateway(routes)` to get a
 * request handler that applies CORS, API-key validation, rate limiting,
 * POST-to-GET compat, error boundary, and cache-tier headers.
 *
 * Splitting domains into separate edge functions means Vercel bundles only the
 * code for one domain per function, cutting cold-start cost by ~20×.
 */

import { createRouter, type RouteDescriptor } from './router';
import { getCorsHeaders, isDisallowedOrigin, isAllowedOrigin } from './cors';
// @ts-expect-error — JS module, no declaration file
import { validateApiKey } from '../api/_api-key.js';
import { mapErrorToResponse } from './error-mapper';
import { checkRateLimit, checkEndpointRateLimit, hasEndpointRatePolicy } from './_shared/rate-limit';
import { drainResponseHeaders } from './_shared/response-headers';
import { checkEntitlement, getRequiredTier } from './_shared/entitlement-check';
import { resolveSessionUserId } from './_shared/auth-session';
import { RPC_CACHE_TIER, STARTUP_RPC_CACHE_TIER, type CacheTier } from './gateway-cache-tiers';
import type { ServerOptions } from '../src/generated/server/startup_intelligence/seismology/v1/service_server';

export const serverOptions: ServerOptions = { onError: mapErrorToResponse };

// Three-tier caching: browser (max-age) → CF edge (s-maxage) → Vercel CDN (CDN-Cache-Control).
// CF ignores Vary: Origin so it may pin a single ACAO value, but this is acceptable
// since production traffic is same-origin and preview deployments hit Vercel CDN directly.
const TIER_HEADERS: Record<CacheTier, string> = {
  fast: 'public, max-age=60, s-maxage=300, stale-while-revalidate=60, stale-if-error=600',
  medium: 'public, max-age=120, s-maxage=600, stale-while-revalidate=120, stale-if-error=900',
  slow: 'public, max-age=300, s-maxage=1800, stale-while-revalidate=300, stale-if-error=3600',
  'slow-browser': 'max-age=300, stale-while-revalidate=60, stale-if-error=1800',
  static: 'public, max-age=600, s-maxage=3600, stale-while-revalidate=600, stale-if-error=14400',
  daily: 'public, max-age=3600, s-maxage=14400, stale-while-revalidate=7200, stale-if-error=172800',
  'no-store': 'no-store',
};

// Vercel CDN-specific cache TTLs — CDN-Cache-Control overrides Cache-Control for
// Vercel's own edge cache, so Vercel can still cache aggressively (and respects
// Vary: Origin correctly) while CF sees no public s-maxage and passes through.
const TIER_CDN_CACHE: Record<CacheTier, string | null> = {
  fast: 'public, s-maxage=600, stale-while-revalidate=300, stale-if-error=1200',
  medium: 'public, s-maxage=1200, stale-while-revalidate=600, stale-if-error=1800',
  slow: 'public, s-maxage=3600, stale-while-revalidate=900, stale-if-error=7200',
  'slow-browser': 'public, s-maxage=900, stale-while-revalidate=60, stale-if-error=1800',
  static: 'public, s-maxage=14400, stale-while-revalidate=3600, stale-if-error=28800',
  daily: 'public, s-maxage=86400, stale-while-revalidate=14400, stale-if-error=172800',
  'no-store': null,
};

import { PREMIUM_RPC_PATHS } from '../src/shared/premium-paths';

/**
 * Creates a Vercel Edge handler for a single domain's routes.
 *
 * Applies the full gateway pipeline: origin check → CORS → OPTIONS preflight →
 * API key → rate limit → route match (with POST→GET compat) → execute → cache headers.
 */
export function createDomainGateway(
  routes: RouteDescriptor[],
): (req: Request) => Promise<Response> {
  return createDomainGatewayWithCache(routes, RPC_CACHE_TIER);
}

export function createStartupDomainGateway(
  routes: RouteDescriptor[],
): (req: Request) => Promise<Response> {
  return createDomainGatewayWithCache(routes, STARTUP_RPC_CACHE_TIER);
}

function createDomainGatewayWithCache(
  routes: RouteDescriptor[],
  activeRpcCacheTier: Record<string, CacheTier>,
): (req: Request) => Promise<Response> {
  const router = createRouter(routes);

  return async function handler(originalRequest: Request): Promise<Response> {
    let request = originalRequest;
    const rawPathname = new URL(request.url).pathname;
    const pathname = rawPathname.length > 1 ? rawPathname.replace(/\/+$/, '') : rawPathname;

    // Origin check — skip CORS headers for disallowed origins
    if (isDisallowedOrigin(request)) {
      return new Response(JSON.stringify({ error: 'Origin not allowed' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    let corsHeaders: Record<string, string>;
    try {
      corsHeaders = getCorsHeaders(request);
    } catch {
      corsHeaders = { 'Access-Control-Allow-Origin': '*' };
    }

    // OPTIONS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    // Tier gate check first — JWT resolution is expensive (JWKS + RS256) and only needed
    // for tier-gated endpoints. Non-tier-gated endpoints never use sessionUserId.
    const isTierGated = getRequiredTier(pathname) !== null;
    const needsLegacyProBearerGate = PREMIUM_RPC_PATHS.has(pathname) && !isTierGated;

    // Session resolution — extract userId from bearer token (Clerk JWT) if present.
    // Only runs for tier-gated endpoints to avoid JWKS lookup on every request.
    let sessionUserId: string | null = null;
    if (isTierGated) {
      sessionUserId = await resolveSessionUserId(request);
      if (sessionUserId) {
        request = new Request(request.url, {
          method: request.method,
          headers: (() => {
            const h = new Headers(request.headers);
            h.set('x-user-id', sessionUserId);
            return h;
          })(),
          body: request.body,
        });
      }
    }

    // API key validation — tier-gated endpoints require EITHER an API key OR a valid bearer token.
    // Authenticated users (sessionUserId present) bypass the API key requirement.
    let keyCheck = validateApiKey(request, {
      forceKey: (isTierGated && !sessionUserId) || needsLegacyProBearerGate,
    }) as { valid: boolean; required: boolean; error?: string };

    // User-owned API keys (si_ prefix): when the static STARTUP_INTELLIGENCE_VALID_KEYS
    // check fails, try async Convex-backed validation for user-issued keys.
    let isUserApiKey = false;
    const startupIntelligenceKey = request.headers.get('X-Startup-Intelligence-Key') ?? '';
    if (keyCheck.required && !keyCheck.valid && startupIntelligenceKey.startsWith('si_')) {
      const { validateUserApiKey } = await import('./_shared/user-api-key');
      const userKeyResult = await validateUserApiKey(startupIntelligenceKey);
      if (userKeyResult) {
        isUserApiKey = true;
        keyCheck = { valid: true, required: true };
        // Inject x-user-id for downstream entitlement checks
        if (!sessionUserId) {
          sessionUserId = userKeyResult.userId;
          request = new Request(request.url, {
            method: request.method,
            headers: (() => {
              const h = new Headers(request.headers);
              h.set('x-user-id', sessionUserId);
              return h;
            })(),
            body: request.body,
          });
        }
      }
    }

    // User API keys on PREMIUM_RPC_PATHS need verified pro-tier entitlement.
    // Admin keys (STARTUP_INTELLIGENCE_VALID_KEYS) bypass this since they are operator-issued.
    if (isUserApiKey && needsLegacyProBearerGate && sessionUserId) {
      const { getEntitlements } = await import('./_shared/entitlement-check');
      const ent = await getEntitlements(sessionUserId);
      if (!ent || !ent.features.apiAccess) {
        return new Response(JSON.stringify({ error: 'API access subscription required' }), {
          status: 403,
          headers: { 'Content-Type': 'application/json', ...corsHeaders },
        });
      }
    }

    if (keyCheck.required && !keyCheck.valid) {
      if (needsLegacyProBearerGate) {
        const authHeader = request.headers.get('Authorization');
        if (authHeader?.startsWith('Bearer ')) {
          const { validateBearerToken } = await import('./auth-session');
          const session = await validateBearerToken(authHeader.slice(7));
          if (!session.valid) {
            return new Response(JSON.stringify({ error: 'Invalid or expired session' }), {
              status: 401,
              headers: { 'Content-Type': 'application/json', ...corsHeaders },
            });
          }
          if (session.role !== 'pro') {
            return new Response(JSON.stringify({ error: 'Pro subscription required' }), {
              status: 403,
              headers: { 'Content-Type': 'application/json', ...corsHeaders },
            });
          }
          // Valid pro session — fall through to route handling
        } else {
          return new Response(JSON.stringify({ error: keyCheck.error, _debug: (keyCheck as any)._debug }), {
            status: 401,
            headers: { 'Content-Type': 'application/json', ...corsHeaders },
          });
        }
      } else {
        return new Response(JSON.stringify({ error: keyCheck.error }), {
          status: 401,
          headers: { 'Content-Type': 'application/json', ...corsHeaders },
        });
      }
    }

    // Bearer role check — authenticated users who bypassed the API key gate still
    // need a pro role for PREMIUM_RPC_PATHS (entitlement check below handles tier-gated).
    if (sessionUserId && !keyCheck.valid && needsLegacyProBearerGate) {
      const authHeader = request.headers.get('Authorization');
      if (authHeader?.startsWith('Bearer ')) {
        const { validateBearerToken } = await import('./auth-session');
        const session = await validateBearerToken(authHeader.slice(7));
        if (!session.valid || session.role !== 'pro') {
          return new Response(JSON.stringify({ error: 'Pro subscription required' }), {
            status: 403,
            headers: { 'Content-Type': 'application/json', ...corsHeaders },
          });
        }
      }
    }

    // Entitlement check — blocks tier-gated endpoints for users below required tier.
    // Admin API-key holders (STARTUP_INTELLIGENCE_VALID_KEYS) bypass entitlement checks.
    // User API keys do NOT bypass — the key owner's tier is checked normally.
    if (!(keyCheck.valid && startupIntelligenceKey && !isUserApiKey)) {
      const entitlementResponse = await checkEntitlement(request, pathname, corsHeaders);
      if (entitlementResponse) return entitlementResponse;
    }

    // IP-based rate limiting — two-phase: endpoint-specific first, then global fallback
    const endpointRlResponse = await checkEndpointRateLimit(request, pathname, corsHeaders);
    if (endpointRlResponse) return endpointRlResponse;

    if (!hasEndpointRatePolicy(pathname)) {
      const rateLimitResponse = await checkRateLimit(request, corsHeaders);
      if (rateLimitResponse) return rateLimitResponse;
    }

    // Route matching — if POST doesn't match, convert to GET for stale clients
    let matchedHandler = router.match(request);
    if (!matchedHandler && request.method === 'POST') {
      const contentLen = parseInt(request.headers.get('Content-Length') ?? '0', 10);
      if (contentLen < 1_048_576) {
        const url = new URL(request.url);
        try {
          const body = await request.clone().json();
          const isScalar = (x: unknown): x is string | number | boolean =>
            typeof x === 'string' || typeof x === 'number' || typeof x === 'boolean';
          for (const [k, v] of Object.entries(body as Record<string, unknown>)) {
            if (Array.isArray(v)) v.forEach((item) => { if (isScalar(item)) url.searchParams.append(k, String(item)); });
            else if (isScalar(v)) url.searchParams.set(k, String(v));
          }
        } catch { /* non-JSON body — skip POST→GET conversion */ }
        const getReq = new Request(url.toString(), { method: 'GET', headers: request.headers });
        matchedHandler = router.match(getReq);
        if (matchedHandler) request = getReq;
      }
    }
    if (!matchedHandler) {
      const allowed = router.allowedMethods(new URL(request.url).pathname);
      if (allowed.length > 0) {
        return new Response(JSON.stringify({ error: 'Method not allowed' }), {
          status: 405,
          headers: { 'Content-Type': 'application/json', Allow: allowed.join(', '), ...corsHeaders },
        });
      }
      return new Response(JSON.stringify({ error: 'Not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }

    // Execute handler with top-level error boundary
    let response: Response;
    try {
      response = await matchedHandler(request);
    } catch (err) {
      console.error('[gateway] Unhandled handler error:', err);
      response = new Response(JSON.stringify({ message: 'Internal server error' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Merge CORS + handler side-channel headers into response
    const mergedHeaders = new Headers(response.headers);
    for (const [key, value] of Object.entries(corsHeaders)) {
      mergedHeaders.set(key, value);
    }
    const extraHeaders = drainResponseHeaders(request);
    if (extraHeaders) {
      for (const [key, value] of Object.entries(extraHeaders)) {
        mergedHeaders.set(key, value);
      }
    }

    // For GET 200 responses: read body once for cache-header decisions + ETag
    if (response.status === 200 && request.method === 'GET' && response.body) {
      const bodyBytes = await response.arrayBuffer();

      // Skip CDN caching for upstream-unavailable / empty responses so CF
      // doesn't serve stale error data for hours.
      const bodyStr = new TextDecoder().decode(bodyBytes);
      const isUpstreamUnavailable = bodyStr.includes('"upstreamUnavailable":true');

      if (mergedHeaders.get('X-No-Cache') || isUpstreamUnavailable) {
        mergedHeaders.set('Cache-Control', 'no-store');
        mergedHeaders.set('X-Cache-Tier', 'no-store');
      } else {
        const rpcName = pathname.split('/').pop() ?? '';
        const envOverride = process.env[`CACHE_TIER_OVERRIDE_${rpcName.replace(/-/g, '_').toUpperCase()}`] as CacheTier | undefined;
        const isPremium = PREMIUM_RPC_PATHS.has(pathname) || getRequiredTier(pathname) !== null;
        const tier = isPremium ? 'slow-browser' as CacheTier
          : (envOverride && envOverride in TIER_HEADERS ? envOverride : null) ?? activeRpcCacheTier[pathname] ?? 'medium';
        mergedHeaders.set('Cache-Control', TIER_HEADERS[tier]);
        // Only allow Vercel CDN caching for trusted origins (startupintelligence.app, Vercel previews,
        // Tauri). No-origin server-side requests (external scrapers) must always reach the edge
        // function so the auth check in validateApiKey() can run. Without this guard, a cached
        // 200 from a trusted-origin browser request could be served to a no-origin scraper,
        // bypassing auth entirely.
        const reqOrigin = request.headers.get('origin') || '';
        const cdnCache = !isPremium && isAllowedOrigin(reqOrigin) ? TIER_CDN_CACHE[tier] : null;
        if (cdnCache) mergedHeaders.set('CDN-Cache-Control', cdnCache);
        mergedHeaders.set('X-Cache-Tier', tier);

        // Keep per-origin ACAO (already set from corsHeaders above) and preserve Vary: Origin.
        // ACAO: * with no Vary would collapse all origins into one cache entry, bypassing
        // isDisallowedOrigin() for cache hits — Vercel CDN serves s-maxage responses without
        // re-invoking the function, so a disallowed origin could read a cached ACAO: * response.
      }
      mergedHeaders.delete('X-No-Cache');
      if (!new URL(request.url).searchParams.has('_debug')) {
        mergedHeaders.delete('X-Cache-Tier');
      }

      // FNV-1a inspired fast hash — good enough for cache validation
      let hash = 2166136261;
      const view = new Uint8Array(bodyBytes);
      for (let i = 0; i < view.length; i++) {
        hash ^= view[i]!;
        hash = Math.imul(hash, 16777619);
      }
      const etag = `"${(hash >>> 0).toString(36)}-${view.length.toString(36)}"`;
      mergedHeaders.set('ETag', etag);

      const ifNoneMatch = request.headers.get('If-None-Match');
      if (ifNoneMatch === etag) {
        return new Response(null, { status: 304, headers: mergedHeaders });
      }

      return new Response(bodyBytes, {
        status: response.status,
        statusText: response.statusText,
        headers: mergedHeaders,
      });
    }

    if (response.status === 200 && request.method === 'GET') {
      if (mergedHeaders.get('X-No-Cache')) {
        mergedHeaders.set('Cache-Control', 'no-store');
      }
      mergedHeaders.delete('X-No-Cache');
    }

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: mergedHeaders,
    });
  };
}
