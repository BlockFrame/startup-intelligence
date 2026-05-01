import type { AppContext } from '@/app/app-context';
import type { EventHandlerCallbacks } from '@/app/event-handlers';
import type { MapLayers } from '@/types';
import { getCachedGpsInterference } from '@/services/gps-interference';

type AirlineIntelView = {
  setLiveMode(enabled: boolean): void;
  updateLivePositions(positions: unknown[]): void;
};

type RefreshablePanel = {
  refresh(force?: boolean): void;
};

export function refreshLegacyFocalPoints(ctx: AppContext, callbacks: EventHandlerCallbacks): void {
  (ctx.panels.cii as RefreshablePanel | undefined)?.refresh(true);
  callbacks.refreshOpenCountryBrief?.();
}

export function getLegacyExportPayload(): Record<string, unknown> {
  return {
    gpsJamming: getCachedGpsInterference() ?? undefined,
  };
}

export function handleLegacyLayerChange(
  ctx: AppContext,
  callbacks: EventHandlerCallbacks,
  layer: keyof MapLayers,
  enabled: boolean,
): boolean {
  if (layer === 'ais') {
    if (enabled) {
      ctx.map?.setLayerLoading('ais', true);
      void import('@/services/maritime')
        .then(({ initAisStream }) => initAisStream())
        .catch(() => {});
      callbacks.waitForAisData();
    } else {
      void import('@/services/maritime')
        .then(({ disconnectAisStream }) => disconnectAisStream())
        .catch(() => {});
    }
    return true;
  }

  if (layer === 'flights') {
    const airlineIntel = ctx.panels['airline-intel'] as AirlineIntelView | undefined;
    airlineIntel?.setLiveMode(enabled);
  }

  return false;
}

export function setupLegacyAircraftPositionUpdates(ctx: AppContext, callbacks: EventHandlerCallbacks): void {
  ctx.map?.setOnAircraftPositionsUpdate((positions) => {
    ctx.intelligenceCache.aircraftPositions = positions;
    const airlineIntel = ctx.panels['airline-intel'] as AirlineIntelView | undefined;
    airlineIntel?.updateLivePositions(positions);
    const military = ctx.intelligenceCache.military?.flights ?? [];
    callbacks.updateFlightSource?.(positions, military);
  });
}
