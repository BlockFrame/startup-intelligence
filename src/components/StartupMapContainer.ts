import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import type { AssetType, MapLayers, NewsItem, RelatedAsset } from '@/types';
import type { AIDataCenter, TechHQ } from '@/types';
import { AI_DATA_CENTERS } from '@/config/ai-datacenters';
import type { Accelerator, CloudRegion, StartupHub } from '@/config/tech-geo';
import { ACCELERATORS, CLOUD_REGIONS, STARTUP_HUBS, TECH_HQS } from '@/config/tech-geo';
import {
  FALLBACK_DARK_STYLE,
  getMapProvider,
  getMapTheme,
  getStyleForProvider,
  isLightMapTheme,
  registerPMTilesProtocol,
} from '@/config/basemap';
import type {
  AppMap,
  MapContainerState,
  MapContextMenuPayload,
  MapCountryClick,
  MapView,
  TimeRange,
} from './map-container-contract';
import type { StartupMapData } from './startup-map-data';
import { renderStartupMapPopup, type StartupPopupType } from './startup-map-popup-renderers';

type StartupMarkerKind = 'datacenter' | 'startupHub' | 'cloudRegion' | 'accelerator' | 'techHQ' | 'techEvent';

interface StartupMarker {
  id: string;
  kind: StartupMarkerKind;
  title: string;
  subtitle: string;
  lat: number;
  lon: number;
  data: StartupMarkerData;
}

type StartupMarkerData =
  | AIDataCenter
  | StartupHub
  | CloudRegion
  | Accelerator
  | TechHQ
  | StartupMapData['techEvent'];

interface StartupMarkerCluster {
  id: string;
  kind: StartupMarkerKind;
  title: string;
  subtitle: string;
  lat: number;
  lon: number;
  markers: StartupMarker[];
}

type StartupMarkerRenderItem = StartupMarker | StartupMarkerCluster;

const VIEW_CENTER: Record<MapView, { lat: number; lon: number; zoom: number }> = {
  global: { lat: 20, lon: 0, zoom: 1.1 },
  america: { lat: 38, lon: -97, zoom: 2.5 },
  mena: { lat: 27, lon: 45, zoom: 3 },
  eu: { lat: 50, lon: 12, zoom: 3 },
  asia: { lat: 28, lon: 100, zoom: 2.4 },
  latam: { lat: -15, lon: -60, zoom: 2.4 },
  africa: { lat: 2, lon: 20, zoom: 2.3 },
  oceania: { lat: -25, lon: 135, zoom: 3 },
};

const MARKER_COLORS: Record<StartupMarkerKind, string> = {
  datacenter: '#a855f7',
  startupHub: '#16a34a',
  cloudRegion: '#0ea5e9',
  accelerator: '#f59e0b',
  techHQ: '#38bdf8',
  techEvent: '#ec4899',
};

export class StartupMapContainer implements AppMap {
  private map: maplibregl.Map | null = null;
  private markers: maplibregl.Marker[] = [];
  private state: MapContainerState;
  private globeMode: boolean;
  private techEvents: StartupMapData['techEvent'][] = [];
  private onStateChange: ((state: MapContainerState) => void) | null = null;
  private onTimeRangeChange: ((range: TimeRange) => void) | null = null;
  private onCountryClick: ((country: MapCountryClick) => void) | null = null;
  private onContextMenu: ((payload: MapContextMenuPayload) => void) | null = null;
  private onLayerChange: ((layer: keyof MapLayers, enabled: boolean, source: 'user' | 'programmatic') => void) | null = null;

  constructor(private readonly container: HTMLElement, initialState: MapContainerState, preferGlobe = false) {
    this.state = { ...initialState, layers: { ...initialState.layers } };
    this.globeMode = preferGlobe;
    this.init();
  }

  private init(): void {
    registerPMTilesProtocol();
    const provider = getMapProvider();
    const theme = getMapTheme(provider);
    const center = VIEW_CENTER[this.state.view] ?? VIEW_CENTER.global;
    const style = getStyleForProvider(provider, theme);
    this.container.classList.add('deckgl-mode', 'startup-map-mode');
    this.container.innerHTML = '';
    this.map = new maplibregl.Map({
      container: this.container,
      style,
      center: [center.lon, center.lat],
      zoom: this.state.zoom || center.zoom,
      attributionControl: {},
      pitch: this.globeMode ? 28 : 0,
      bearing: this.globeMode ? -12 : 0,
      dragRotate: this.globeMode,
    });
    this.map.addControl(new maplibregl.NavigationControl({ visualizePitch: false }), 'top-left');
    this.map.on('load', () => {
      this.applyGlobeMode();
      this.renderMarkers();
      this.renderLegend(isLightMapTheme(theme));
    });
    this.map.on('moveend', () => this.emitState());
    this.map.on('contextmenu', (event) => {
      this.onContextMenu?.({
        lat: event.lngLat.lat,
        lon: event.lngLat.lng,
        screenX: event.originalEvent.clientX,
        screenY: event.originalEvent.clientY,
      });
    });
    this.map.on('click', (event) => {
      this.onCountryClick?.({ lat: event.lngLat.lat, lon: event.lngLat.lng });
    });
    this.renderControls();
  }

  private renderControls(): void {
    const controls = document.createElement('div');
    controls.className = 'startup-map-controls';
    controls.innerHTML = `
      <div class="time-range-selector">
        ${(['1h', '6h', '24h', '48h', '7d', 'all'] as TimeRange[]).map((range) => (
          `<button class="time-range-btn ${this.state.timeRange === range ? 'active' : ''}" data-range="${range}">${range === 'all' ? 'All' : range}</button>`
        )).join('')}
      </div>
    `;
    controls.querySelectorAll<HTMLButtonElement>('[data-range]').forEach((button) => {
      button.addEventListener('click', () => {
        this.setTimeRange(button.dataset.range as TimeRange);
        controls.querySelectorAll('.time-range-btn').forEach((el) => el.classList.toggle('active', el === button));
      });
    });
    this.container.appendChild(controls);
  }

  private renderLegend(isLight: boolean): void {
    const old = this.container.querySelector('.startup-map-legend');
    old?.remove();
    const legend = document.createElement('div');
    legend.className = `startup-map-legend ${isLight ? 'light' : 'dark'}`;
    legend.innerHTML = `
      <div class="startup-map-legend-title">LEGEND</div>
      ${this.legendItem('startupHub', 'Startup Hub')}
      ${this.legendItem('techHQ', 'Tech HQ')}
      ${this.legendItem('accelerator', 'Accelerator')}
      ${this.legendItem('cloudRegion', 'Cloud Region')}
      ${this.legendItem('datacenter', 'Datacenter')}
      ${this.legendItem('techEvent', 'Tech Event')}
    `;
    this.container.appendChild(legend);
  }

  private legendItem(kind: StartupMarkerKind, label: string): string {
    return `<div class="startup-map-legend-item"><span style="background:${MARKER_COLORS[kind]}"></span>${label}</div>`;
  }

  private getVisibleMarkers(): StartupMarker[] {
    const layers = this.state.layers;
    const markers: StartupMarker[] = [];
    if (layers.datacenters) {
      for (const dc of AI_DATA_CENTERS.filter((item) => item.status !== 'decommissioned')) {
        markers.push({
          id: dc.id,
          kind: 'datacenter',
          title: dc.name,
          subtitle: [dc.owner, dc.chipType, dc.country].filter(Boolean).join(' • '),
          lat: dc.lat,
          lon: dc.lon,
          data: dc,
        });
      }
    }
    if (layers.startupHubs) {
      for (const hub of STARTUP_HUBS) {
        markers.push({
          id: hub.id,
          kind: 'startupHub',
          title: hub.name,
          subtitle: [hub.city, hub.country, hub.tier].filter(Boolean).join(' • '),
          lat: hub.lat,
          lon: hub.lon,
          data: hub,
        });
      }
    }
    if (layers.cloudRegions) {
      for (const region of CLOUD_REGIONS) {
        markers.push({
          id: region.id,
          kind: 'cloudRegion',
          title: `${region.provider.toUpperCase()} ${region.name}`,
          subtitle: [region.city, region.country].filter(Boolean).join(' • '),
          lat: region.lat,
          lon: region.lon,
          data: region,
        });
      }
    }
    if (layers.accelerators) {
      for (const accelerator of ACCELERATORS) {
        markers.push({
          id: accelerator.id,
          kind: 'accelerator',
          title: accelerator.name,
          subtitle: [accelerator.city, accelerator.country, accelerator.type].filter(Boolean).join(' • '),
          lat: accelerator.lat,
          lon: accelerator.lon,
          data: accelerator,
        });
      }
    }
    if (layers.techHQs) {
      for (const hq of TECH_HQS) {
        markers.push({
          id: hq.id,
          kind: 'techHQ',
          title: hq.company,
          subtitle: [hq.city, hq.country, hq.type].filter(Boolean).join(' • '),
          lat: hq.lat,
          lon: hq.lon,
          data: hq,
        });
      }
    }
    if (layers.techEvents) {
      for (const event of this.techEvents) {
        markers.push({
          id: event.id,
          kind: 'techEvent',
          title: event.title,
          subtitle: [event.location, event.country, event.startDate].filter(Boolean).join(' • '),
          lat: event.lat,
          lon: event.lng,
          data: event,
        });
      }
    }
    return markers;
  }

  private renderMarkers(): void {
    if (!this.map) return;
    this.markers.forEach((marker) => marker.remove());
    this.markers = [];
    for (const marker of this.clusterMarkers(this.getVisibleMarkers())) {
      const el = document.createElement('button');
      const isCluster = 'markers' in marker;
      el.className = `startup-map-marker startup-map-marker-${marker.kind}${isCluster ? ' startup-map-marker-cluster' : ''}`;
      el.type = 'button';
      el.style.setProperty('--marker-color', MARKER_COLORS[marker.kind]);
      el.title = marker.title;
      if (isCluster) {
        el.dataset.count = String(marker.markers.length);
        el.textContent = String(marker.markers.length);
      }
      el.addEventListener('click', (event) => {
        event.stopPropagation();
        if (isCluster && this.map && this.map.getZoom() < 6) {
          this.map.easeTo({ center: [marker.lon, marker.lat], zoom: Math.min(7, this.map.getZoom() + 2), duration: 450 });
          return;
        }
        this.showPopup(marker);
      });
      this.markers.push(new maplibregl.Marker({ element: el, anchor: 'center' })
        .setLngLat([marker.lon, marker.lat])
        .addTo(this.map));
    }
  }

  private clusterMarkers(markers: StartupMarker[]): StartupMarkerRenderItem[] {
    if (!this.map || this.map.getZoom() >= 5.5) return markers;
    const buckets = new Map<string, StartupMarker[]>();
    const cellSize = this.map.getZoom() < 3 ? 54 : 44;
    for (const marker of markers) {
      const point = this.map.project([marker.lon, marker.lat]);
      const key = `${marker.kind}:${Math.round(point.x / cellSize)}:${Math.round(point.y / cellSize)}`;
      const bucket = buckets.get(key);
      if (bucket) bucket.push(marker);
      else buckets.set(key, [marker]);
    }

    const items: StartupMarkerRenderItem[] = [];
    for (const bucket of buckets.values()) {
      if (bucket.length === 1) {
        items.push(bucket[0]!);
        continue;
      }
      const lat = bucket.reduce((sum, marker) => sum + marker.lat, 0) / bucket.length;
      const lon = bucket.reduce((sum, marker) => sum + marker.lon, 0) / bucket.length;
      const first = bucket[0]!;
      items.push({
        id: `${first.kind}:${bucket.map((marker) => marker.id).join(',')}`,
        kind: first.kind,
        title: `${bucket.length} ${this.labelForKind(first.kind)}`,
        subtitle: this.clusterSubtitle(bucket),
        lat,
        lon,
        markers: bucket,
      });
    }
    return items;
  }

  private showPopup(marker: StartupMarkerRenderItem): void {
    if (!this.map) return;
    new maplibregl.Popup({ closeButton: true, closeOnClick: true, maxWidth: '320px' })
      .setLngLat([marker.lon, marker.lat])
      .setHTML('markers' in marker ? this.renderClusterPopup(marker) : this.renderMarkerPopup(marker))
      .addTo(this.map);
  }

  private renderMarkerPopup(marker: StartupMarker): string {
    const typeByKind: Record<StartupMarkerKind, StartupPopupType> = {
      datacenter: 'datacenter',
      startupHub: 'startupHub',
      cloudRegion: 'cloudRegion',
      accelerator: 'accelerator',
      techHQ: 'techHQ',
      techEvent: 'techEvent',
    };
    return renderStartupMapPopup(typeByKind[marker.kind], marker.data);
  }

  private renderClusterPopup(cluster: StartupMarkerCluster): string {
    if (cluster.kind === 'datacenter') {
      const items = cluster.markers.map((marker) => marker.data as AIDataCenter);
      return renderStartupMapPopup('datacenterCluster', {
        items,
        region: this.clusterRegion(cluster.markers),
        country: this.clusterCountry(cluster.markers),
      });
    }
    if (cluster.kind === 'techHQ') {
      const items = cluster.markers.map((marker) => marker.data as TechHQ);
      const first = items[0];
      return renderStartupMapPopup('techHQCluster', {
        items,
        city: first?.city ?? this.clusterRegion(cluster.markers),
        country: first?.country ?? this.clusterCountry(cluster.markers),
      });
    }
    if (cluster.kind === 'techEvent') {
      const items = cluster.markers.map((marker) => marker.data as StartupMapData['techEvent']);
      const first = items[0];
      return renderStartupMapPopup('techEventCluster', {
        items,
        location: first?.location ?? this.clusterRegion(cluster.markers),
        country: first?.country ?? this.clusterCountry(cluster.markers),
      });
    }
    const items = cluster.markers.slice(0, 8).map((marker) => `
      <li class="cluster-item">
        <strong>${this.escape(marker.title)}</strong>
        <span>${this.escape(marker.subtitle)}</span>
      </li>
    `).join('');
    return `
      <div class="popup-header startup-map-cluster">
        <span class="popup-title">${this.escape(cluster.title)}</span>
        <span class="popup-badge">${this.escape(this.clusterCountry(cluster.markers))}</span>
      </div>
      <div class="popup-body cluster-popup">
        <div class="popup-subtitle">${this.escape(cluster.subtitle)}</div>
        <ul class="cluster-list startup-map-cluster-list">${items}</ul>
      </div>
    `;
  }

  private labelForKind(kind: StartupMarkerKind): string {
    return {
      datacenter: 'datacenters',
      startupHub: 'startup hubs',
      cloudRegion: 'cloud regions',
      accelerator: 'accelerators',
      techHQ: 'tech HQs',
      techEvent: 'tech events',
    }[kind];
  }

  private clusterSubtitle(markers: StartupMarker[]): string {
    const countries = new Set(markers.map((marker) => this.markerCountry(marker)).filter(Boolean));
    return Array.from(countries).slice(0, 3).join(' • ') || markers[0]?.subtitle || '';
  }

  private clusterCountry(markers: StartupMarker[]): string {
    const countries = new Set(markers.map((marker) => this.markerCountry(marker)).filter(Boolean));
    return Array.from(countries).slice(0, 2).join(' / ') || 'Mixed';
  }

  private clusterRegion(markers: StartupMarker[]): string {
    const cities = new Set(markers.map((marker) => this.markerCity(marker)).filter(Boolean));
    return Array.from(cities).slice(0, 2).join(' / ') || markers[0]?.title || 'Cluster';
  }

  private markerCountry(marker: StartupMarker): string {
    return 'country' in marker.data ? marker.data.country : '';
  }

  private markerCity(marker: StartupMarker): string {
    if ('city' in marker.data) return marker.data.city;
    if ('location' in marker.data) return marker.data.location;
    return '';
  }

  private escape(value: string): string {
    return value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char] ?? char);
  }

  private emitState(): void {
    if (!this.map) return;
    const center = this.map.getCenter();
    this.state = {
      ...this.state,
      zoom: this.map.getZoom(),
      pan: { x: center.lng, y: center.lat },
    };
    this.onStateChange?.(this.getState());
  }

  private applyGlobeMode(): void {
    if (!this.map) return;
    const projection = this.map as unknown as { setProjection?: (projection: { type: string }) => void };
    try {
      projection.setProjection?.({ type: this.globeMode ? 'globe' : 'mercator' });
    } catch {
      // Older/custom MapLibre styles may reject projection changes; pitch fallback still gives startup a 3D map mode.
    }
    this.map.dragRotate[this.globeMode ? 'enable' : 'disable']();
    this.map.touchZoomRotate[this.globeMode ? 'enableRotation' : 'disableRotation']();
    this.map.easeTo({
      pitch: this.globeMode ? 28 : 0,
      bearing: this.globeMode ? -12 : 0,
      duration: 450,
    });
    this.container.classList.toggle('startup-map-globe-mode', this.globeMode);
  }

  public getState(): MapContainerState { return { ...this.state, layers: { ...this.state.layers } }; }
  public getCenter(): { lat: number; lon: number } | null {
    const center = this.map?.getCenter();
    return center ? { lat: center.lat, lon: center.lng } : null;
  }
  public getTimeRange(): TimeRange { return this.state.timeRange; }
  public getBbox(): string | null {
    const bounds = this.map?.getBounds();
    if (!bounds) return null;
    return [bounds.getWest(), bounds.getSouth(), bounds.getEast(), bounds.getNorth()].join(',');
  }
  public setView(view: MapView, zoom?: number): void {
    const center = VIEW_CENTER[view] ?? VIEW_CENTER.global;
    this.state.view = view;
    this.map?.easeTo({ center: [center.lon, center.lat], zoom: zoom ?? center.zoom, duration: 450 });
  }
  public setZoom(zoom: number): void { this.state.zoom = zoom; this.map?.setZoom(zoom); }
  public setCenter(lat: number, lon: number, zoom?: number): void {
    if (zoom != null) this.state.zoom = zoom;
    this.map?.easeTo({ center: [lon, lat], zoom: zoom ?? this.map.getZoom(), duration: 450 });
  }
  public setTimeRange(range: TimeRange): void {
    this.state.timeRange = range;
    this.onTimeRangeChange?.(range);
    this.emitState();
  }
  public setLayers(layers: MapLayers): void {
    this.state.layers = { ...layers };
    this.renderMarkers();
  }
  public onStateChanged(callback: (state: MapContainerState) => void): void { this.onStateChange = callback; }
  public onTimeRangeChanged(callback: (range: TimeRange) => void): void { this.onTimeRangeChange = callback; }
  public onCountryClicked(callback: (country: MapCountryClick) => void): void { this.onCountryClick = callback; }
  public onMapContextMenu(callback: (payload: MapContextMenuPayload) => void): void { this.onContextMenu = callback; }
  public isDeckGLActive(): boolean { return false; }
  public isGlobeMode(): boolean { return this.globeMode; }
  public destroy(): void { this.markers.forEach((marker) => marker.remove()); this.map?.remove(); this.map = null; }
  public render(): void { this.renderMarkers(); }
  public resize(): void { this.map?.resize(); }
  public setIsResizing(_resizing: boolean): void {}
  public reloadBasemap(): void {
    if (!this.map) return;
    const provider = getMapProvider();
    this.map.setStyle(getStyleForProvider(provider, getMapTheme(provider)) || FALLBACK_DARK_STYLE);
    this.map.once('styledata', () => this.renderMarkers());
  }
  public switchToGlobe(): void {
    this.globeMode = true;
    this.applyGlobeMode();
    this.emitState();
  }
  public switchToFlat(): void {
    this.globeMode = false;
    this.applyGlobeMode();
    this.emitState();
  }
  public initEscalationGetters(): void {}
  public enableLayer(layer: keyof MapLayers): void {
    this.state.layers = { ...this.state.layers, [layer]: true };
    this.onLayerChange?.(layer, true, 'programmatic');
    this.renderMarkers();
  }
  public hideLayerToggle(_layer: keyof MapLayers): void {}
  public setLayerLoading(_layer: keyof MapLayers, _loading: boolean): void {}
  public setLayerReady(_layer: keyof MapLayers, _hasData: boolean): void {}
  public setOnLayerChange(callback: (layer: keyof MapLayers, enabled: boolean, source: 'user' | 'programmatic') => void): void { this.onLayerChange = callback; }
  public setTechEvents(events: StartupMapData['techEvent'][]): void { this.techEvents = events; this.renderMarkers(); }
  public flashLocation(lat: number, lon: number, durationMs = 1600): void {
    const el = document.createElement('div');
    el.className = 'startup-map-flash';
    const marker = new maplibregl.Marker({ element: el }).setLngLat([lon, lat]).addTo(this.map!);
    window.setTimeout(() => marker.remove(), durationMs);
  }
  public triggerDatacenterClick(id: string): void {
    const dc = AI_DATA_CENTERS.find((item) => item.id === id);
    if (!dc) return;
    this.setCenter(dc.lat, dc.lon, 5);
    this.showPopup({ id: dc.id, kind: 'datacenter', title: dc.name, subtitle: [dc.owner, dc.country].filter(Boolean).join(' • '), lat: dc.lat, lon: dc.lon, data: dc });
  }
  public highlightCountry(code: string): void { void code; }
  public clearCountryHighlight(): void {}
  public fitCountry(_code: string): void {}
  public setRenderPaused(_paused: boolean): void {}
  public highlightAssets(_assets: RelatedAsset[] | null): void {}
  public flashAssets(_assetType: AssetType, _ids: string[]): void {}
  public getHotspotLevels(): Record<string, string> { return {}; }
  public setHotspotLevels(_levels: Record<string, string>): void {}
  public setOnAircraftPositionsUpdate(_callback: (positions: any[]) => void): void {}
  public setWebcams(_markers: any): void {}
  public setCIIScores(_scores: any): void {}
  public setHappinessScores(_scores: any): void {}
  public setRenewableInstallations(_installations: any): void {}
  public setResilienceRanking(_ranking: any, _meta?: any): void {}
  public setSatellites(_satellites: any): void {}
  public setImageryScenes(_scenes: any): void {}
  public setNewsLocations(_locations: any): void {}
  public setEarthquakes(_earthquakes: any): void {}
  public setNaturalEvents(_events: any): void {}
  public setWeatherAlerts(_alerts: any): void {}
  public setOutages(_outages: any): void {}
  public setTrafficAnomalies(_anomalies: any): void {}
  public setDdosLocations(_hits: any): void {}
  public setProtests(_protests: any): void {}
  public setMilitaryFlights(_flights: any, _meta?: any): void {}
  public setMilitaryVessels(_vessels: any, _meta?: any): void {}
  public setUcdpEvents(_events: any): void {}
  public setDisplacementFlows(_flows: any): void {}
  public setClimateAnomalies(_anomalies: any): void {}
  public setGpsJamming(_jamming: any): void {}
  public setCyberThreats(_threats: any): void {}
  public setIranEvents(_events: any): void {}
  public setAisData(_data: any, _meta?: any): void {}
  public setCableActivity(_activity: any, _meta?: any): void {}
  public setCableHealth(_health: any): void {}
  public setFlightDelays(_delays: any): void {}
  public setChokepointData(_data: any): void {}
  public setDiseaseOutbreaks(_outbreaks: any): void {}
  public setFires(_fires: any): void {}
  public setPositiveEvents(_events: any): void {}
  public setKindnessData(_data: any): void {}
  public setSpeciesRecoveryZones(_zones: any): void {}
  public setRadiationObservations(_observations: any): void {}
  public triggerPipelineClick(_id: string): void {}
  public triggerCableClick(_id: string): void {}
  public triggerBaseClick(_id: string): void {}
  public triggerNuclearClick(_id: string): void {}
  public triggerHotspotClick(_id: string): void {}
  public triggerConflictClick(_id: string): void {}
  public triggerIrradiatorClick(_id: string): void {}
  public updateHotspotActivity(_news: NewsItem[]): void {}
  public updateMilitaryForEscalation(_flights: any, _vessels: any): void {}
  public highlightRoute(_routeIds: string[]): void {}
  public clearHighlightedRoute(): void {}
  public setBypassRoutes(_corridors: Array<{ fromPort: [number, number]; toPort: [number, number] }>): void {}
  public clearBypassRoutes(): void {}
  public zoomToRoutes(_routeIds: string[]): void {}
}
