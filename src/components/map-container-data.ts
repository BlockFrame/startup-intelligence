import type {
  InternetOutage,
  SocialUnrestEvent,
  MilitaryFlight,
  MilitaryVessel,
  MilitaryFlightCluster,
  MilitaryVesselCluster,
  NaturalEvent,
  UcdpGeoEvent,
  CyberThreat,
  CableHealthRecord,
  AisDisruptionEvent,
  AisDensityZone,
  CableAdvisory,
  RepairShip,
} from '@/types';
import type { AirportDelayAlert, PositionSample } from '@/services/aviation';
import type { DisplacementFlow } from '@/services/displacement';
import type { Earthquake } from '@/services/earthquakes';
import type { ClimateAnomaly } from '@/services/climate';
import type { WeatherAlert } from '@/services/weather';
import type { PositiveGeoEvent } from '@/services/positive-events-geo';
import type { KindnessPoint } from '@/services/kindness-data';
import type { HappinessData } from '@/services/happiness-data';
import type { SpeciesRecovery } from '@/services/conservation-data';
import type { RenewableInstallation } from '@/services/renewable-installations';
import type { ResilienceRankingItem } from '@/services/resilience';
import type { RadiationObservation } from '@/services/radiation';
import type { GpsJamHex } from '@/services/gps-interference';
import type { SatellitePosition } from '@/services/satellites';
import type { IranEvent } from '@/services/conflict';
import type { ImageryScene } from '@/generated/server/worldmonitor/imagery/v1/service_server';
import type { WebcamEntry, WebcamCluster } from '@/generated/client/worldmonitor/webcam/v1/service_client';
import type { TrafficAnomaly as ProtoTrafficAnomaly, DdosLocationHit } from '@/generated/client/worldmonitor/infrastructure/v1/service_client';
import type { DiseaseOutbreakItem } from '@/services/disease-outbreaks';

export interface StartupMapData {
  techEvent: {
    id: string;
    title: string;
    location: string;
    lat: number;
    lng: number;
    country: string;
    startDate: string;
    endDate: string;
    url: string | null;
    daysUntil: number;
  };
}

export interface LegacyMapData {
  earthquake: Earthquake;
  weatherAlert: WeatherAlert;
  outage: InternetOutage;
  aisDisruption: AisDisruptionEvent;
  aisDensity: AisDensityZone;
  cableAdvisory: CableAdvisory;
  repairShip: RepairShip;
  cableHealth: CableHealthRecord;
  protest: SocialUnrestEvent;
  flightDelay: AirportDelayAlert;
  aircraftPosition: PositionSample;
  militaryFlight: MilitaryFlight;
  militaryFlightCluster: MilitaryFlightCluster;
  militaryVessel: MilitaryVessel;
  militaryVesselCluster: MilitaryVesselCluster;
  naturalEvent: NaturalEvent;
  fireMarker: { lat: number; lon: number; brightness: number; frp: number; confidence: number; region: string; acq_date: string; daynight: string };
  ucdpEvent: UcdpGeoEvent;
  displacementFlow: DisplacementFlow;
  climateAnomaly: ClimateAnomaly;
  radiationObservation: RadiationObservation;
  gpsJamHex: GpsJamHex;
  satellitePosition: SatellitePosition;
  diseaseOutbreak: DiseaseOutbreakItem;
  cyberThreat: CyberThreat;
  iranEvent: IranEvent;
  newsLocation: { lat: number; lon: number; title: string; threatLevel: string; timestamp?: Date };
  positiveEvent: PositiveGeoEvent;
  kindnessPoint: KindnessPoint;
  happinessData: HappinessData;
  ciiScore: { code: string; score: number; level: string };
  resilienceRanking: ResilienceRankingItem;
  speciesRecovery: SpeciesRecovery;
  renewableInstallation: RenewableInstallation;
  imageryScene: ImageryScene;
  webcam: WebcamEntry | WebcamCluster;
  trafficAnomaly: ProtoTrafficAnomaly;
  ddosLocation: DdosLocationHit;
}

export interface StartupMapCache {
  techEvents?: StartupMapData['techEvent'][];
}

export interface LegacyMapCache {
  earthquakes?: LegacyMapData['earthquake'][];
  weatherAlerts?: LegacyMapData['weatherAlert'][];
  outages?: LegacyMapData['outage'][];
  aisDisruptions?: LegacyMapData['aisDisruption'][];
  aisDensity?: LegacyMapData['aisDensity'][];
  cableAdvisories?: LegacyMapData['cableAdvisory'][];
  repairShips?: LegacyMapData['repairShip'][];
  cableHealth?: Record<string, LegacyMapData['cableHealth']>;
  protests?: LegacyMapData['protest'][];
  flightDelays?: LegacyMapData['flightDelay'][];
  aircraftPositions?: LegacyMapData['aircraftPosition'][];
  militaryFlights?: LegacyMapData['militaryFlight'][];
  militaryFlightClusters?: LegacyMapData['militaryFlightCluster'][];
  militaryVessels?: LegacyMapData['militaryVessel'][];
  militaryVesselClusters?: LegacyMapData['militaryVesselCluster'][];
  naturalEvents?: LegacyMapData['naturalEvent'][];
  fires?: LegacyMapData['fireMarker'][];
  ucdpEvents?: LegacyMapData['ucdpEvent'][];
  displacementFlows?: LegacyMapData['displacementFlow'][];
  climateAnomalies?: LegacyMapData['climateAnomaly'][];
  radiationObservations?: LegacyMapData['radiationObservation'][];
  gpsJamming?: LegacyMapData['gpsJamHex'][];
  satellites?: LegacyMapData['satellitePosition'][];
  diseaseOutbreaks?: LegacyMapData['diseaseOutbreak'][];
  cyberThreats?: LegacyMapData['cyberThreat'][];
  iranEvents?: LegacyMapData['iranEvent'][];
  newsLocations?: LegacyMapData['newsLocation'][];
  positiveEvents?: LegacyMapData['positiveEvent'][];
  kindnessData?: LegacyMapData['kindnessPoint'][];
  happinessScores?: LegacyMapData['happinessData'];
  ciiScores?: LegacyMapData['ciiScore'][];
  resilienceRanking?: LegacyMapData['resilienceRanking'][];
  resilienceGreyedOut?: LegacyMapData['resilienceRanking'][];
  speciesRecovery?: LegacyMapData['speciesRecovery'][];
  renewableInstallations?: LegacyMapData['renewableInstallation'][];
  hotspotActivity?: import('@/types').NewsItem[];
  escalationFlights?: LegacyMapData['militaryFlight'][];
  escalationVessels?: LegacyMapData['militaryVessel'][];
  imageryScenes?: LegacyMapData['imageryScene'][];
  webcams?: LegacyMapData['webcam'][];
}
