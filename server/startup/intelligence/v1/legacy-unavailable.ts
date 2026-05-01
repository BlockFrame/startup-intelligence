import type { ServerContext } from '../../../../src/generated/server/startup_intelligence/intelligence/v1/service_server';

type LegacyRequest = Record<string, unknown> | undefined;

export function legacyUnavailableRpc(name: string) {
  return async (_ctx: ServerContext, _req: LegacyRequest): Promise<unknown> => ({
    degraded: true,
    upstreamUnavailable: true,
    error: `${name} is not available in Startup Intelligence`,
    emptyReason: 'legacy_startup_intelligence_rpc_disabled',
  });
}
