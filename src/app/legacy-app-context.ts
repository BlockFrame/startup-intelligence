import type {
  CyberThreat,
  InternetOutage,
  SocialUnrestEvent,
  MilitaryFlight,
  MilitaryFlightCluster,
  MilitaryVessel,
  MilitaryVesselCluster,
  USNIFleetReport,
} from '@/types';
import type { AirportDelayAlert, PositionSample } from '@/services/aviation';
import type { IranEvent } from '@/generated/client/worldmonitor/conflict/v1/service_client';
import type { SanctionsPressureResult } from '@/services/sanctions-pressure';
import type { RadiationWatchResult } from '@/services/radiation';
import type { SecurityAdvisory } from '@/services/security-advisories';
import type { Earthquake } from '@/services/earthquakes';

export interface LegacyIntelligenceCache {
  flightDelays?: AirportDelayAlert[];
  thermalEscalation?: import('@/services/thermal-escalation').ThermalEscalationWatch;
  aircraftPositions?: PositionSample[];
  outages?: InternetOutage[];
  protests?: { events: SocialUnrestEvent[]; sources: { acled: number; gdelt: number } };
  military?: {
    flights: MilitaryFlight[];
    flightClusters: MilitaryFlightCluster[];
    vessels: MilitaryVessel[];
    vesselClusters: MilitaryVesselCluster[];
  };
  earthquakes?: Earthquake[];
  usniFleet?: USNIFleetReport;
  iranEvents?: IranEvent[];
  orefAlerts?: { alertCount: number; historyCount24h: number };
  advisories?: SecurityAdvisory[];
  sanctions?: SanctionsPressureResult;
  radiation?: RadiationWatchResult;
  imageryScenes?: Array<{
    id: string;
    satellite: string;
    datetime: string;
    resolutionM: number;
    mode: string;
    geometryGeojson: string;
    previewUrl: string;
    assetUrl: string;
  }>;
}

export interface LegacyAppContextExtension {
  intelligenceCache: LegacyIntelligenceCache;
  cyberThreatsCache: CyberThreat[] | null;
}
