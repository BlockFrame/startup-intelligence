import type { AssetType, MapLayers, NewsItem, RelatedAsset } from '@/types';

export type TimeRange = '1h' | '6h' | '8h' | '24h' | '48h' | '7d' | 'all';
export type MapView = 'global' | 'america' | 'mena' | 'eu' | 'asia' | 'latam' | 'africa' | 'oceania';

export interface MapContainerState {
  zoom: number;
  pan: { x: number; y: number };
  view: MapView;
  layers: MapLayers;
  timeRange: TimeRange;
}

export interface MapCountryClick {
  lat: number;
  lon: number;
  code?: string;
  name?: string;
}

export interface MapContextMenuPayload {
  lat: number;
  lon: number;
  screenX: number;
  screenY: number;
  countryCode?: string;
  countryName?: string;
}

export interface AppMap {
  getState(): MapContainerState;
  getCenter(): { lat: number; lon: number } | null;
  getTimeRange(): TimeRange;
  getBbox(): string | null;
  setView(view: MapView, zoom?: number): void;
  setZoom(zoom: number): void;
  setCenter(lat: number, lon: number, zoom?: number): void;
  setTimeRange(range: TimeRange): void;
  setLayers(layers: MapLayers): void;
  onStateChanged(callback: (state: MapContainerState) => void): void;
  onTimeRangeChanged(callback: (range: TimeRange) => void): void;
  onCountryClicked(callback: (country: MapCountryClick) => void): void;
  onMapContextMenu(callback: (payload: MapContextMenuPayload) => void): void;
  isDeckGLActive?(): boolean;
  isGlobeMode(): boolean;
  destroy(): void;
  render(): void;
  resize(): void;
  setIsResizing(resizing: boolean): void;
  reloadBasemap(): void;
  switchToGlobe(): void;
  switchToFlat(): void;
  initEscalationGetters(): void;
  enableLayer(layer: keyof MapLayers): void;
  hideLayerToggle(layer: keyof MapLayers): void;
  setLayerLoading(layer: keyof MapLayers, loading: boolean): void;
  setLayerReady(layer: keyof MapLayers, hasData: boolean): void;
  setOnLayerChange(callback: (layer: keyof MapLayers, enabled: boolean, source: 'user' | 'programmatic') => void): void;
  setOnAircraftPositionsUpdate(callback: (positions: any[]) => void): void;
  setWebcams(markers: any): void;
  setCIIScores(scores: any): void;
  setHappinessScores(scores: any): void;
  setRenewableInstallations(installations: any): void;
  setResilienceRanking(ranking: any, meta?: any): void;
  setSatellites(satellites: any): void;
  setImageryScenes(scenes: any): void;
  setNewsLocations(locations: any): void;
  setEarthquakes(earthquakes: any): void;
  setNaturalEvents(events: any): void;
  setTechEvents(events: any): void;
  setWeatherAlerts(alerts: any): void;
  setOutages(outages: any): void;
  setTrafficAnomalies(anomalies: any): void;
  setDdosLocations(hits: any): void;
  setProtests(protests: any): void;
  setMilitaryFlights(flights: any, meta?: any): void;
  setMilitaryVessels(vessels: any, meta?: any): void;
  setUcdpEvents(events: any): void;
  setDisplacementFlows(flows: any): void;
  setClimateAnomalies(anomalies: any): void;
  setGpsJamming(jamming: any): void;
  setCyberThreats(threats: any): void;
  setIranEvents(events: any): void;
  setAisData(data: any, meta?: any): void;
  setCableActivity(activity: any, meta?: any): void;
  setCableHealth(health: any): void;
  setFlightDelays(delays: any): void;
  setChokepointData(data: any): void;
  setDiseaseOutbreaks(outbreaks: any): void;
  setFires(fires: any): void;
  setPositiveEvents(events: any): void;
  setKindnessData(data: any): void;
  setSpeciesRecoveryZones(zones: any): void;
  setRadiationObservations(observations: any): void;
  flashLocation(lat: number, lon: number, durationMs?: number): void;
  highlightAssets(assets: RelatedAsset[] | null): void;
  flashAssets(assetType: AssetType, ids: string[]): void;
  getHotspotLevels(): Record<string, string>;
  setHotspotLevels(levels: Record<string, string>): void;
  triggerPipelineClick(id: string): void;
  triggerCableClick(id: string): void;
  triggerDatacenterClick(id: string): void;
  triggerBaseClick(id: string): void;
  triggerNuclearClick(id: string): void;
  triggerHotspotClick(id: string): void;
  triggerConflictClick(id: string): void;
  triggerIrradiatorClick(id: string): void;
  highlightCountry(code: string): void;
  clearCountryHighlight(): void;
  fitCountry(code: string): void;
  setRenderPaused(paused: boolean): void;
  updateHotspotActivity(news: NewsItem[]): void;
  updateMilitaryForEscalation(flights: any, vessels: any): void;
  highlightRoute(routeIds: string[]): void;
  clearHighlightedRoute(): void;
  setBypassRoutes(corridors: Array<{ fromPort: [number, number]; toPort: [number, number] }>): void;
  clearBypassRoutes(): void;
  zoomToRoutes(routeIds: string[]): void;
}
