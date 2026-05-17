import { Panel } from './Panel';
import { fetchLiveVideoInfo } from '@/services/live-news';
import { isDesktopRuntime, getRemoteApiBaseUrl, getApiBaseUrl, getLocalApiPort } from '@/services/runtime';
import { t } from '@/services/i18n';
import { loadFromStorage, saveToStorage } from '@/utils';
import { IDLE_PAUSE_MS, STORAGE_KEYS } from '@/config/variants/base';
import { SITE_VARIANT } from '@/config/variant';
import { escapeHtml, sanitizeUrl } from '@/utils/sanitize';

import { getStreamQuality } from '@/services/ai-flow-settings';
import { getLiveStreamsAlwaysOn, subscribeLiveStreamsSettingsChange } from '@/services/live-stream-settings';
import { track } from '@/services/analytics';

// YouTube IFrame Player API types
type YouTubePlayer = {
  mute(): void;
  unMute(): void;
  playVideo(): void;
  pauseVideo(): void;
  loadVideoById(videoId: string): void;
  cueVideoById(videoId: string): void;
  setPlaybackQuality?(quality: string): void;
  getIframe?(): HTMLIFrameElement;
  getVolume?(): number;
  destroy(): void;
};

type YouTubePlayerConstructor = new (
  elementId: string | HTMLElement,
  options: {
    videoId: string;
    host?: string;
    playerVars: Record<string, number | string>;
    events: {
      onReady: () => void;
      onError?: (event: { data: number }) => void;
    };
  },
) => YouTubePlayer;

type YouTubeNamespace = {
  Player: YouTubePlayerConstructor;
};

declare global {
  interface Window {
    YT?: YouTubeNamespace;
    onYouTubeIframeAPIReady?: () => void;
  }
}

export interface LiveChannel {
  id: string;
  name: string;
  handle?: string; // YouTube channel handle (e.g., @bloomberg) - optional for HLS streams
  fallbackVideoId?: string; // Fallback if no live stream detected
  videoId?: string; // Dynamically fetched live video ID
  isLive?: boolean;
  hlsUrl?: string; // HLS manifest URL for native <video> playback (desktop)
  useFallbackOnly?: boolean; // Skip auto-detection, always use fallback
  geoAvailability?: string[]; // ISO 3166-1 alpha-2 codes; undefined = available everywhere
}


// Startup Intelligence live sources: business, markets, and tech-relevant streams only.
const STARTUP_LIVE_CHANNELS: LiveChannel[] = [
  { id: 'bloomberg', name: 'Bloomberg', handle: '@markets', fallbackVideoId: 'iEpJwprxDdk' },
  { id: 'yahoo', name: 'Yahoo Finance', handle: '@YahooFinance', fallbackVideoId: 'KQp-e_XQnDE' },
  { id: 'cnbc', name: 'CNBC', handle: '@CNBC', fallbackVideoId: '9NyxcX3rhQs' },
];

// Optional channels users can add from the "Available Channels" tab UI.
// Startup app keeps only market, business, and tech-relevant live sources.
export const OPTIONAL_LIVE_CHANNELS: LiveChannel[] = [
  { id: 'bloomberg', name: 'Bloomberg', handle: '@markets', fallbackVideoId: 'iEpJwprxDdk' },
  { id: 'yahoo', name: 'Yahoo Finance', handle: '@YahooFinance', fallbackVideoId: 'KQp-e_XQnDE' },
  { id: 'cnbc', name: 'CNBC', handle: '@CNBC', fallbackVideoId: '9NyxcX3rhQs' },
  { id: 'bbc-news', name: 'BBC News', handle: '@BBCNews', fallbackVideoId: 'bjgQzJzCZKs' },
  { id: 'sky', name: 'Sky News', handle: '@SkyNews', fallbackVideoId: 'uvviIF4725I' },
  { id: 'euronews', name: 'Euronews', handle: '@euronews', fallbackVideoId: 'pykpO5kQJ98' },
  { id: 'dw', name: 'DW News', handle: '@DWNews', fallbackVideoId: 'LuKwFajn37U' },
  { id: 'france24', name: 'France 24', handle: '@FRANCE24', fallbackVideoId: 'u9foWyMSETk' },
  { id: 'france24-en', name: 'France 24 English', handle: '@France24_en', fallbackVideoId: 'Ap-UM1O9RBU' },
  { id: 'cna-asia', name: 'CNA (NewsAsia)', handle: '@channelnewsasia', fallbackVideoId: 'XWq5kBlakcQ' },
  { id: 'nhk-world', name: 'NHK World Japan', handle: '@NHKWORLDJAPAN', fallbackVideoId: 'f0lYfG_vY_U' },
];

function getOptionalLiveChannelsForVariant(): LiveChannel[] {
  return OPTIONAL_LIVE_CHANNELS;
}

const _REGION_ENTRIES: { key: string; labelKey: string; channelIds: string[] }[] = [
  { key: 'markets', labelKey: 'components.liveNews.regionNorthAmerica', channelIds: ['bloomberg', 'yahoo', 'cnbc'] },
  { key: 'global-business', labelKey: 'components.liveNews.regionEurope', channelIds: ['bbc-news', 'sky', 'euronews', 'dw', 'france24', 'france24-en'] },
  { key: 'asia-tech', labelKey: 'components.liveNews.regionAsia', channelIds: ['cna-asia', 'nhk-world'] },
];
export const OPTIONAL_CHANNEL_REGIONS: { key: string; labelKey: string; channelIds: string[] }[] = [
  ..._REGION_ENTRIES,
];

const DEFAULT_LIVE_CHANNELS = SITE_VARIANT === 'happy' ? [] : STARTUP_LIVE_CHANNELS;

/** Default channel list for the current variant (for restore in channel management). */
export function getDefaultLiveChannels(): LiveChannel[] {
  return [...DEFAULT_LIVE_CHANNELS];
}

/** Returns optional channels filtered by user country. Channels without geoAvailability pass through. */
export function getFilteredOptionalChannels(userCountry: string | null): LiveChannel[] {
  const channels = getOptionalLiveChannelsForVariant();
  if (!userCountry) return channels;
  const uc = userCountry.toUpperCase();
  return channels.filter((c) => !c.geoAvailability || c.geoAvailability.includes(uc));
}

/** Returns region entries with geo-restricted channel IDs removed for the user's country. */
export function getFilteredChannelRegions(userCountry: string | null): typeof OPTIONAL_CHANNEL_REGIONS {
  if (!userCountry) return OPTIONAL_CHANNEL_REGIONS;
  const filtered = getFilteredOptionalChannels(userCountry);
  const allowedIds = new Set(filtered.map((c) => c.id));
  return OPTIONAL_CHANNEL_REGIONS.map((r) => ({
    ...r,
    channelIds: r.channelIds.filter((id) => allowedIds.has(id)),
  }));
}

export interface StoredLiveChannels {
  order: string[];
  custom?: LiveChannel[];
  /** Display name overrides for built-in channels (and custom). */
  displayNameOverrides?: Record<string, string>;
}

const DEFAULT_STORED: StoredLiveChannels = {
  order: DEFAULT_LIVE_CHANNELS.map((c) => c.id),
};

const DIRECT_HLS_MAP: Readonly<Record<string, string>> = {
  bloomberg: 'https://bloomberg.com/media-manifest/streams/us.m3u8',
  sky: 'https://linear901-oo-hls0-prd-gtm.delivery.skycdp.com/17501/sde-fast-skynews/master.m3u8',
  euronews: 'https://dash4.antik.sk/live/test_euronews/playlist.m3u8',
  dw: 'https://dwamdstream103.akamaized.net/hls/live/2015526/dwstream103/master.m3u8',
  france24: 'https://amg00106-france24-france24-samsunguk-qvpp8.amagi.tv/playlist/amg00106-france24-france24-samsunguk/playlist.m3u8',
  'bbc-news': 'https://vs-hls-push-uk.live.fastly.md.bbci.co.uk/x=4/i=urn:bbc:pips:service:bbc_news_channel_hd/iptv_hd_abr_v1.m3u8',
  'nhk-world': 'https://nhkwlive-ojp.akamaized.net/hls/live/2003459/nhkwlive-ojp-en/index_4M.m3u8',
};

interface ProxiedHlsEntry { url: string; referer: string; }
const PROXIED_HLS_MAP: Readonly<Record<string, ProxiedHlsEntry>> = {
  'cnbc': { url: 'https://cdn-ca2-na.lncnetworks.host/hls/cnbc_live/index.m3u8', referer: 'https://livenewschat.eu/' },
};

const IDLE_ACTIVITY_EVENTS = ['mousedown', 'keydown', 'scroll', 'touchstart', 'mousemove'] as const;

if (import.meta.env.DEV) {
  const allChannels = [...STARTUP_LIVE_CHANNELS, ...OPTIONAL_LIVE_CHANNELS];
  for (const id of Object.keys(DIRECT_HLS_MAP)) {
    const ch = allChannels.find(c => c.id === id);
    if (!ch) console.error(`[LiveNews] DIRECT_HLS_MAP key '${id}' has no matching channel`);
    else if (!ch.fallbackVideoId && !ch.hlsUrl && !ch.handle) {
      console.error(`[LiveNews] Channel '${id}' in DIRECT_HLS_MAP lacks fallback (videoId/hlsUrl/handle)`);
    }
  }
}

export const BUILTIN_IDS = new Set([
  ...STARTUP_LIVE_CHANNELS.map((c) => c.id),
  ...OPTIONAL_LIVE_CHANNELS.map((c) => c.id),
]);

export function loadChannelsFromStorage(): LiveChannel[] {
  const stored = loadFromStorage<StoredLiveChannels>(STORAGE_KEYS.liveChannels, DEFAULT_STORED);
  const order = stored.order?.length ? stored.order : DEFAULT_STORED.order;
  const channelMap = new Map<string, LiveChannel>();
  for (const c of STARTUP_LIVE_CHANNELS) channelMap.set(c.id, { ...c });
  for (const c of OPTIONAL_LIVE_CHANNELS) channelMap.set(c.id, { ...c });
  for (const c of stored.custom ?? []) {
    if (c.id && (c.handle || c.hlsUrl)) channelMap.set(c.id, { ...c });
  }
  const overrides = stored.displayNameOverrides ?? {};
  for (const [id, name] of Object.entries(overrides)) {
    const ch = channelMap.get(id);
    if (ch) ch.name = name;
  }
  const result: LiveChannel[] = [];
  for (const id of order) {
    const ch = channelMap.get(id);
    if (ch) result.push(ch);
  }
  return result;
}

export function saveChannelsToStorage(channels: LiveChannel[]): void {
  const order = channels.map((c) => c.id);
  const custom = channels.filter((c) => !BUILTIN_IDS.has(c.id));
  const builtinNames = new Map<string, string>();
  for (const c of [...STARTUP_LIVE_CHANNELS, ...OPTIONAL_LIVE_CHANNELS]) builtinNames.set(c.id, c.name);
  const displayNameOverrides: Record<string, string> = {};
  for (const c of channels) {
    if (builtinNames.has(c.id) && c.name !== builtinNames.get(c.id)) {
      displayNameOverrides[c.id] = c.name;
    }
  }
  saveToStorage(STORAGE_KEYS.liveChannels, { order, custom, displayNameOverrides });
}

export class LiveNewsPanel extends Panel {
  private static apiPromise: Promise<void> | null = null;
  private channels: LiveChannel[] = [];
  private activeChannel!: LiveChannel;
  private channelSwitcher: HTMLElement | null = null;
  private isMuted = true;
  private isPlaying = true;
  private wasPlayingBeforeIdle = true;
  private muteBtn: HTMLButtonElement | null = null;
  private fullscreenBtn: HTMLButtonElement | null = null;
  private isFullscreen = false;
  private liveBtn: HTMLButtonElement | null = null;
  private idleTimeout: ReturnType<typeof setTimeout> | null = null;
  private readonly ECO_IDLE_PAUSE_MS = IDLE_PAUSE_MS;
  private boundVisibilityHandler!: () => void;
  private boundIdleResetHandler!: () => void;
  private idleDetectionEnabled = false;
  private alwaysOn = getLiveStreamsAlwaysOn();
  private unsubscribeStreamSettings: (() => void) | null = null;

  // YouTube Player API state
  private player: YouTubePlayer | null = null;
  private playerContainer: HTMLDivElement | null = null;
  private playerElement: HTMLDivElement | null = null;
  private playerElementId: string;
  private isPlayerReady = false;
  private currentVideoId: string | null = null;
  private readonly youtubeOrigin: string | null;
  private forceFallbackVideoForNextInit = false;

  // Desktop: always use sidecar embed for YouTube (tauri:// origin gets 153).
  // DIRECT_HLS_MAP channels use native <video> instead.
  private useDesktopEmbedProxy = isDesktopRuntime();
  private desktopEmbedIframe: HTMLIFrameElement | null = null;
  private desktopEmbedRenderToken = 0;
  private suppressChannelClick = false;
  private boundMessageHandler!: (e: MessageEvent) => void;
  private muteSyncInterval: ReturnType<typeof setInterval> | null = null;
  private static readonly MUTE_SYNC_POLL_MS = 500;

  // Bot-check detection: if player doesn't become ready within this timeout,
  // YouTube is likely showing "Sign in to confirm you're not a bot".
  private botCheckTimeout: ReturnType<typeof setTimeout> | null = null;
  private static readonly BOT_CHECK_TIMEOUT_MS = 15_000;

  // Native HLS <video> element for direct stream playback (bypasses iframe/cookie issues)
  private nativeVideoElement: HTMLVideoElement | null = null;
  private hlsInstance: import('hls.js').default | null = null;
  private hlsFailureCooldown = new Map<string, number>();
  private readonly HLS_COOLDOWN_MS = 5 * 60 * 1000;

  private deferredInit = false;
  private lazyObserver: IntersectionObserver | null = null;
  private idleCallbackId: number | ReturnType<typeof setTimeout> | null = null;

  constructor() {
    super({ id: 'live-news', title: t('panels.liveNews'), className: 'panel-wide', closable: true, collapsible: true, infoTooltip: t('components.panelTooltips.liveNews') });
    this.insertLiveCountBadge(OPTIONAL_LIVE_CHANNELS.length);
    this.youtubeOrigin = LiveNewsPanel.resolveYouTubeOrigin();
    this.playerElementId = `live-news-player-${Date.now()}`;
    this.channels = loadChannelsFromStorage();
    if (this.channels.length === 0) this.channels = getDefaultLiveChannels();
    const savedChannelId = loadFromStorage<string>(STORAGE_KEYS.activeChannel, '');
    const savedChannel = savedChannelId ? this.channels.find(c => c.id === savedChannelId) : null;
    this.activeChannel = savedChannel ?? this.channels[0]!;
    this.createLiveButton();
    this.createMuteButton();
    this.createChannelSwitcher();
    this.setupBridgeMessageListener();
    this.renderPlaceholder();
    this.setupLazyInit();
    this.setupIdleDetection();
    this.unsubscribeStreamSettings = subscribeLiveStreamsSettingsChange((alwaysOn) => {
      this.alwaysOn = alwaysOn;
      this.applyIdleMode();
    });
    document.addEventListener('keydown', this.boundFullscreenEscHandler);
  }

  private renderPlaceholder(): void {
    this.content.innerHTML = '';
    const container = document.createElement('div');
    container.className = 'live-news-placeholder';
    container.style.cssText = 'display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;gap:12px;cursor:pointer;';

    const label = document.createElement('div');
    label.style.cssText = 'color:var(--text-secondary);font-size:13px;';
    label.textContent = this.getChannelDisplayName(this.activeChannel);

    const playBtn = document.createElement('button');
    playBtn.className = 'offline-retry';
    playBtn.textContent = 'Load Player';
    playBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.triggerInit();
    });

    container.appendChild(label);
    container.appendChild(playBtn);
    container.addEventListener('click', () => this.triggerInit());
    this.content.appendChild(container);
  }

  private setupLazyInit(): void {
    this.lazyObserver = new IntersectionObserver(
      (entries) => {
        if (entries.some(e => e.isIntersecting)) {
          this.lazyObserver?.disconnect();
          this.lazyObserver = null;
          if ('requestIdleCallback' in window) {
            this.idleCallbackId = (window as any).requestIdleCallback(
              () => { this.idleCallbackId = null; this.triggerInit(); },
              { timeout: 1000 },
            );
          } else {
            this.idleCallbackId = setTimeout(() => { this.idleCallbackId = null; this.triggerInit(); }, 1000);
          }
        }
      },
      { threshold: 0.1 },
    );
    this.lazyObserver.observe(this.element);
  }

  private triggerInit(): void {
    if (this.deferredInit) return;
    this.deferredInit = true;
    if (this.lazyObserver) { this.lazyObserver.disconnect(); this.lazyObserver = null; }
    if (this.idleCallbackId !== null) {
      if ('cancelIdleCallback' in window) (window as any).cancelIdleCallback(this.idleCallbackId);
      else clearTimeout(this.idleCallbackId as ReturnType<typeof setTimeout>);
      this.idleCallbackId = null;
    }
    this.renderPlayer();
  }

  private saveChannels(): void {
    saveChannelsToStorage(this.channels);
  }

  private getDirectHlsUrl(channelId: string): string | undefined {
    const url = DIRECT_HLS_MAP[channelId];
    if (!url) return undefined;
    const failedAt = this.hlsFailureCooldown.get(channelId);
    if (failedAt && Date.now() - failedAt < this.HLS_COOLDOWN_MS) return undefined;
    return url;
  }

  private getProxiedHlsUrl(channelId: string): string | undefined {
    if (!isDesktopRuntime()) return undefined;
    const entry = PROXIED_HLS_MAP[channelId];
    if (!entry) return undefined;
    const failedAt = this.hlsFailureCooldown.get(channelId);
    if (failedAt && Date.now() - failedAt < this.HLS_COOLDOWN_MS) return undefined;
    return `http://127.0.0.1:${getLocalApiPort()}/api/hls-proxy?url=${encodeURIComponent(entry.url)}`;
  }

  private get embedOrigin(): string {
    if (isDesktopRuntime()) return `http://localhost:${getLocalApiPort()}`;
    try { return new URL(getRemoteApiBaseUrl()).origin; } catch { return 'https://startupintelligence.app'; }
  }

  private setupBridgeMessageListener(): void {
    this.boundMessageHandler = (e: MessageEvent) => {
      if (e.source !== this.desktopEmbedIframe?.contentWindow) return;
      const expected = this.embedOrigin;
      const localOrigin = getApiBaseUrl();
      if (e.origin !== expected && (!localOrigin || e.origin !== localOrigin)) return;
      const msg = e.data;
      if (!msg || typeof msg !== 'object' || !msg.type) return;
      if (msg.type === 'yt-ready') {
        this.clearBotCheckTimeout();
        this.isPlayerReady = true;
        this.syncDesktopEmbedState();
      } else if (msg.type === 'yt-error') {
        this.clearBotCheckTimeout();
        const code = Number(msg.code ?? 0);
        if (code === 153 && this.activeChannel.fallbackVideoId &&
          this.activeChannel.videoId !== this.activeChannel.fallbackVideoId) {
          this.activeChannel.videoId = this.activeChannel.fallbackVideoId;
          this.renderDesktopEmbed(true);
        } else {
          this.showEmbedError(this.activeChannel, code);
        }
      } else if (msg.type === 'yt-mute-state') {
        const muted = msg.muted === true;
        if (this.isMuted !== muted) {
          this.isMuted = muted;
          this.updateMuteIcon();
        }
      }
    };
    window.addEventListener('message', this.boundMessageHandler);
  }

  private static resolveYouTubeOrigin(): string | null {
    const fallbackOrigin = SITE_VARIANT === 'tech'
      ? 'https://startupintelligence.app'
      : 'https://startupintelligence.app';

    try {
      const { protocol, origin, host } = window.location;
      if (protocol === 'http:' || protocol === 'https:') {
        // Desktop webviews commonly run from tauri.localhost which can trigger
        // YouTube embed restrictions. Use canonical public origin instead.
        if (host === 'tauri.localhost' || host.endsWith('.tauri.localhost')) {
          return fallbackOrigin;
        }
        return origin;
      }
      if (protocol === 'tauri:' || protocol === 'asset:') {
        return fallbackOrigin;
      }
    } catch {
      // Ignore invalid location values.
    }
    return fallbackOrigin;
  }


  private applyIdleMode(): void {
    if (this.alwaysOn) {
      if (this.idleTimeout) {
        clearTimeout(this.idleTimeout);
        this.idleTimeout = null;
      }
      if (this.idleDetectionEnabled) {
        IDLE_ACTIVITY_EVENTS.forEach((event) => {
          document.removeEventListener(event, this.boundIdleResetHandler);
        });
        this.idleDetectionEnabled = false;
      }
      if (!document.hidden) {
        this.resumeFromIdle();
      }
      return;
    }

    if (!this.idleDetectionEnabled) {
      IDLE_ACTIVITY_EVENTS.forEach((event) => {
        document.addEventListener(event, this.boundIdleResetHandler, { passive: true });
      });
      this.idleDetectionEnabled = true;
    }

    this.boundIdleResetHandler();
  }

  private setupIdleDetection(): void {
    // Suspend idle timer when hidden, resume when visible
    this.boundVisibilityHandler = () => {
      if (document.hidden) {
        // Suspend idle timer so background playback isn't killed
        if (this.idleTimeout) clearTimeout(this.idleTimeout);
      } else {
        this.resumeFromIdle();
        this.applyIdleMode();
      }
    };
    document.addEventListener('visibilitychange', this.boundVisibilityHandler);

    // Track user activity to detect idle (pauses after 5 min inactivity)
    this.boundIdleResetHandler = () => {
      if (this.alwaysOn) return;
      if (this.idleTimeout) clearTimeout(this.idleTimeout);
      this.resumeFromIdle();
      this.idleTimeout = setTimeout(() => this.pauseForIdle(), this.ECO_IDLE_PAUSE_MS);
    };

    this.applyIdleMode();
  }

  private pauseForIdle(): void {
    if (this.isPlaying) {
      this.wasPlayingBeforeIdle = true;
      this.isPlaying = false;
      this.updateLiveIndicator();
    }
    this.destroyPlayer();
  }

  private stopMuteSyncPolling(): void {
    if (this.muteSyncInterval !== null) {
      clearInterval(this.muteSyncInterval);
      this.muteSyncInterval = null;
    }
  }

  private startMuteSyncPolling(): void {
    this.stopMuteSyncPolling();
    this.muteSyncInterval = setInterval(() => this.syncMuteStateFromPlayer(), LiveNewsPanel.MUTE_SYNC_POLL_MS);
  }

  private syncMuteStateFromPlayer(): void {
    if (this.useDesktopEmbedProxy || !this.player || !this.isPlayerReady) return;
    const p = this.player as { getVolume?(): number; isMuted?(): boolean };
    const muted = typeof p.isMuted === 'function'
      ? p.isMuted()
      : (p.getVolume?.() === 0);
    if (typeof muted === 'boolean' && muted !== this.isMuted) {
      this.isMuted = muted;
      this.updateMuteIcon();
    }
  }

  private destroyPlayer(): void {
    this.clearBotCheckTimeout();
    this.stopMuteSyncPolling();
    if (this.player) {
      if (typeof this.player.destroy === 'function') this.player.destroy();
      this.player = null;
    }

    if (this.hlsInstance) {
      this.hlsInstance.destroy();
      this.hlsInstance = null;
    }

    if (this.nativeVideoElement) {
      this.nativeVideoElement.pause();
      this.nativeVideoElement.removeAttribute('src');
      this.nativeVideoElement.load();
      this.nativeVideoElement = null;
    }

    this.desktopEmbedIframe = null;
    this.desktopEmbedRenderToken += 1;
    this.isPlayerReady = false;
    this.currentVideoId = null;

    // Clear the container to remove player/iframe
    if (this.playerContainer) {
      this.playerContainer.innerHTML = '';

      if (!this.useDesktopEmbedProxy) {
        // Recreate player element for JS API mode
        this.playerElement = document.createElement('div');
        this.playerElement.id = this.playerElementId;
        this.playerContainer.appendChild(this.playerElement);
      } else {
        this.playerElement = null;
      }
    }
  }

  private resumeFromIdle(): void {
    if (this.wasPlayingBeforeIdle && !this.isPlaying) {
      this.isPlaying = true;
      this.updateLiveIndicator();
      void this.initializePlayer();
    }
  }

  private createLiveButton(): void {
    this.liveBtn = document.createElement('button');
    this.liveBtn.className = 'live-mute-btn';
    this.liveBtn.title = 'Toggle playback';
    this.updateLiveIndicator();
    this.liveBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.togglePlayback();
    });
  }

  private updateLiveIndicator(): void {
    if (!this.liveBtn) return;
    this.liveBtn.innerHTML = this.isPlaying
      ? '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>'
      : '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3"/></svg>';
  }

  private togglePlayback(): void {
    this.isPlaying = !this.isPlaying;
    this.wasPlayingBeforeIdle = this.isPlaying;
    this.updateLiveIndicator();
    if (this.isPlaying && !this.player && !this.desktopEmbedIframe && !this.nativeVideoElement) {
      this.ensurePlayerContainer();
      void this.initializePlayer();
    } else {
      this.syncPlayerState();
    }
  }

  private createMuteButton(): void {
    this.muteBtn = document.createElement('button');
    this.muteBtn.className = 'live-mute-btn';
    this.muteBtn.title = 'Toggle sound';
    this.updateMuteIcon();
    this.muteBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.toggleMute();
    });

    const header = this.element.querySelector('.panel-header');
    if (this.liveBtn) header?.appendChild(this.liveBtn);
    header?.appendChild(this.muteBtn);

    this.createFullscreenButton();
  }

  private createFullscreenButton(): void {
    this.fullscreenBtn = document.createElement('button');
    this.fullscreenBtn.className = 'live-mute-btn';
    this.fullscreenBtn.title = 'Fullscreen';
    this.fullscreenBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M8 3H5a2 2 0 0 0-2 2v3"/><path d="M21 8V5a2 2 0 0 0-2-2h-3"/><path d="M3 16v3a2 2 0 0 0 2 2h3"/><path d="M16 21h3a2 2 0 0 0 2-2v-3"/></svg>';
    this.fullscreenBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      track('live-news-fullscreen', { entering: !this.isFullscreen });
      this.toggleFullscreen();
    });
    const header = this.element.querySelector('.panel-header');
    header?.appendChild(this.fullscreenBtn);
  }

  private toggleFullscreen(): void {
    this.isFullscreen = !this.isFullscreen;
    this.element.classList.toggle('live-news-fullscreen', this.isFullscreen);
    document.body.classList.toggle('live-news-fullscreen-active', this.isFullscreen);

    if (this.fullscreenBtn) {
      this.fullscreenBtn.title = this.isFullscreen ? 'Exit fullscreen' : 'Fullscreen';
      this.fullscreenBtn.innerHTML = this.isFullscreen
        ? '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 14h6v6"/><path d="M20 10h-6V4"/><path d="M14 10l7-7"/><path d="M3 21l7-7"/></svg>'
        : '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M8 3H5a2 2 0 0 0-2 2v3"/><path d="M21 8V5a2 2 0 0 0-2-2h-3"/><path d="M3 16v3a2 2 0 0 0 2 2h3"/><path d="M16 21h3a2 2 0 0 0 2-2v-3"/></svg>';
    }
  }

  private boundFullscreenEscHandler = (e: KeyboardEvent) => {
    if (e.key === 'Escape' && this.isFullscreen) this.toggleFullscreen();
  };

  private updateMuteIcon(): void {
    if (!this.muteBtn) return;
    this.muteBtn.innerHTML = this.isMuted
      ? '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 5L6 9H2v6h4l5 4V5z"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/></svg>'
      : '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 5L6 9H2v6h4l5 4V5z"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/></svg>';
    this.muteBtn.classList.toggle('unmuted', !this.isMuted);
  }

  private toggleMute(): void {
    this.isMuted = !this.isMuted;
    this.updateMuteIcon();
    this.syncPlayerState();
  }

  private getChannelDisplayName(channel: LiveChannel): string {
    return channel.name;
  }

  /** Creates a single channel tab button with click and drag handlers. */
  private createChannelButton(channel: LiveChannel): HTMLButtonElement {
    const btn = document.createElement('button');
    btn.className = `live-channel-btn ${channel.id === this.activeChannel.id ? 'active' : ''}`;
    btn.dataset.channelId = channel.id;

    btn.textContent = this.getChannelDisplayName(channel);

    btn.style.cursor = 'grab';
    btn.addEventListener('click', (e) => {
      if (this.suppressChannelClick) {
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      e.preventDefault();
      e.stopPropagation();
      this.switchChannel(channel);
    });
    return btn;
  }

  private createChannelSwitcher(): void {
    this.channelSwitcher = document.createElement('div');
    this.channelSwitcher.className = 'live-news-switcher';

    for (const channel of this.channels) {
      this.channelSwitcher.appendChild(this.createChannelButton(channel));
    }

    // Mouse-based drag reorder (works in WKWebView/Tauri)
    let dragging: HTMLElement | null = null;
    let dragStarted = false;
    let startX = 0;
    const THRESHOLD = 6;

    this.channelSwitcher.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return;
      const btn = (e.target as HTMLElement).closest('.live-channel-btn') as HTMLElement | null;
      if (!btn) return;
      this.suppressChannelClick = false;
      dragging = btn;
      dragStarted = false;
      startX = e.clientX;
    });

    document.addEventListener('mousemove', (e) => {
      if (!dragging || !this.channelSwitcher) return;
      if (!dragStarted) {
        if (Math.abs(e.clientX - startX) < THRESHOLD) return;
        dragStarted = true;
        dragging.classList.add('live-channel-dragging');
      }
      e.preventDefault();
      const target = document.elementFromPoint(e.clientX, e.clientY)?.closest('.live-channel-btn') as HTMLElement | null;
      if (!target || target === dragging) return;
      const all = Array.from(this.channelSwitcher!.querySelectorAll('.live-channel-btn'));
      const idx = all.indexOf(dragging);
      const targetIdx = all.indexOf(target);
      if (idx === -1 || targetIdx === -1) return;
      if (idx < targetIdx) {
        target.parentElement?.insertBefore(dragging, target.nextSibling);
      } else {
        target.parentElement?.insertBefore(dragging, target);
      }
    });

    document.addEventListener('mouseup', () => {
      if (!dragging) return;
      if (dragStarted) {
        dragging.classList.remove('live-channel-dragging');
        this.applyChannelOrderFromDom();
        this.suppressChannelClick = true;
        setTimeout(() => {
          this.suppressChannelClick = false;
        }, 0);
      }
      dragging = null;
      dragStarted = false;
    });

    const toolbar = document.createElement('div');
    toolbar.className = 'live-news-toolbar';
    toolbar.appendChild(this.channelSwitcher);
    this.createManageButton(toolbar);
    this.element.insertBefore(toolbar, this.content);
  }

  private createManageButton(toolbar: HTMLElement): void {
    const openBtn = document.createElement('button');
    openBtn.type = 'button';
    openBtn.className = 'live-news-settings-btn';
    openBtn.title = t('components.liveNews.channelSettings') ?? 'Channel Settings';
    openBtn.innerHTML =
      '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>';
    openBtn.addEventListener('click', () => {
      this.openChannelManagementModal();
    });
    toolbar.appendChild(openBtn);
  }

  private openChannelManagementModal(): void {
    const existing = document.querySelector('.live-channels-modal-overlay');
    if (existing) return;

    const overlay = document.createElement('div');
    overlay.className = 'live-channels-modal-overlay';
    overlay.setAttribute('aria-modal', 'true');

    const modal = document.createElement('div');
    modal.className = 'live-channels-modal';

    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'live-channels-modal-close';
    closeBtn.setAttribute('aria-label', t('common.close') ?? 'Close');
    closeBtn.innerHTML = '&times;';

    const container = document.createElement('div');

    modal.appendChild(closeBtn);
    modal.appendChild(container);
    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    requestAnimationFrame(() => overlay.classList.add('active'));

    import('@/live-channels-window').then(async ({ initLiveChannelsWindow }) => {
      await initLiveChannelsWindow(container);
    }).catch(console.error);

    const close = () => {
      overlay.remove();
      document.removeEventListener('keydown', onKey);
      this.refreshChannelsFromStorage();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    closeBtn.addEventListener('click', close);
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) close();
    });
    document.addEventListener('keydown', onKey);
  }

  private refreshChannelSwitcher(): void {
    if (!this.channelSwitcher) return;
    this.channelSwitcher.innerHTML = '';
    for (const channel of this.channels) {
      this.channelSwitcher.appendChild(this.createChannelButton(channel));
    }
  }

  private applyChannelOrderFromDom(): void {
    if (!this.channelSwitcher) return;
    const ids = Array.from(this.channelSwitcher.querySelectorAll<HTMLElement>('.live-channel-btn'))
      .map((el) => el.dataset.channelId)
      .filter((id): id is string => !!id);
    const orderMap = new Map(this.channels.map((c) => [c.id, c]));
    this.channels = ids.map((id) => orderMap.get(id)).filter((c): c is LiveChannel => !!c);
    this.saveChannels();
  }

  private async resolveChannelVideo(channel: LiveChannel, forceFallback = false): Promise<void> {
    const useFallbackVideo = channel.useFallbackOnly || forceFallback;

    if (this.getDirectHlsUrl(channel.id) || this.getProxiedHlsUrl(channel.id) || channel.hlsUrl) {
      channel.videoId = channel.fallbackVideoId;
      channel.isLive = true;
      return;
    }

    if (useFallbackVideo) {
      channel.videoId = channel.fallbackVideoId;
      channel.isLive = false;
      return;
    }

    // Skip fetchLiveVideoInfo for channels without handle (HLS-only)
    if (!channel.handle) {
      channel.videoId = channel.fallbackVideoId;
      channel.isLive = false;
      return;
    }

    const info = await fetchLiveVideoInfo(channel.handle);
    channel.videoId = info.videoId || channel.fallbackVideoId;
    channel.isLive = !!info.videoId;
    // Don't re-apply an hlsUrl while the channel is on HLS failure cooldown —
    // prevents an infinite retry loop in browsers (e.g. Firefox) that reject
    // YouTube HLS manifests via CORS. The cooldown lets the embed fallback run.
    const failedAt = this.hlsFailureCooldown.get(channel.id);
    const hlsCooldownActive = failedAt !== undefined && Date.now() - failedAt < this.HLS_COOLDOWN_MS;
    channel.hlsUrl = (!hlsCooldownActive && info.hlsUrl) ? info.hlsUrl : undefined;
  }

  private async switchChannel(channel: LiveChannel): Promise<void> {
    if (channel.id === this.activeChannel.id) return;

    this.activeChannel = channel;
    saveToStorage(STORAGE_KEYS.activeChannel, channel.id);

    this.channelSwitcher?.querySelectorAll('.live-channel-btn').forEach(btn => {
      const btnEl = btn as HTMLElement;
      btnEl.classList.toggle('active', btnEl.dataset.channelId === channel.id);
      if (btnEl.dataset.channelId === channel.id) {
        btnEl.classList.add('loading');
      }
    });

    await this.resolveChannelVideo(channel);
    if (!this.element?.isConnected) return;

    this.channelSwitcher?.querySelectorAll('.live-channel-btn').forEach(btn => {
      const btnEl = btn as HTMLElement;
      btnEl.classList.remove('loading');
      if (btnEl.dataset.channelId === channel.id && !channel.videoId) {
        btnEl.classList.add('offline');
      }
    });

    if (this.getDirectHlsUrl(channel.id) || this.getProxiedHlsUrl(channel.id) || channel.hlsUrl) {
      void this.renderNativeHlsPlayer();
      return;
    }

    if (!channel.videoId || !/^[\w-]{10,12}$/.test(channel.videoId)) {
      this.showOfflineMessage(channel);
      return;
    }

    if (this.useDesktopEmbedProxy) {
      this.renderDesktopEmbed(true);
      return;
    }

    if (!this.player) {
      this.ensurePlayerContainer();
      void this.initializePlayer();
      return;
    }

    this.syncPlayerState();
  }

  private showOfflineMessage(channel: LiveChannel): void {
    this.destroyPlayer();
    const safeName = escapeHtml(channel.name);
    this.content.innerHTML = `
      <div class="live-offline">
        <div class="offline-icon">📺</div>
        <div class="offline-text">${t('components.liveNews.notLive', { name: safeName })}</div>
        <button class="offline-retry" onclick="this.closest('.panel').querySelector('.live-channel-btn.active')?.click()">${t('common.retry')}</button>
      </div>
    `;
  }

  private showEmbedError(channel: LiveChannel, errorCode: number): void {
    this.destroyPlayer();
    const watchUrl = channel.videoId
      ? `https://www.youtube.com/watch?v=${encodeURIComponent(channel.videoId)}`
      : channel.handle
      ? `https://www.youtube.com/${encodeURIComponent(channel.handle)}`
      : 'https://www.youtube.com';
    const safeName = escapeHtml(channel.name);

    this.content.innerHTML = `
      <div class="live-offline">
        <div class="offline-icon">!</div>
        <div class="offline-text">${t('components.liveNews.cannotEmbed', { name: safeName, code: String(errorCode) })}</div>
        <a class="offline-retry" href="${sanitizeUrl(watchUrl)}" target="_blank" rel="noopener noreferrer">${t('components.liveNews.openOnYouTube')}</a>
      </div>
    `;
  }

  private renderPlayer(): void {
    this.ensurePlayerContainer();
    void this.initializePlayer();
  }

  private ensurePlayerContainer(): void {
    this.deferredInit = true;
    this.content.innerHTML = '';
    this.playerContainer = document.createElement('div');
    this.playerContainer.className = 'live-news-player';

    if (!this.useDesktopEmbedProxy) {
      this.playerElement = document.createElement('div');
      this.playerElement.id = this.playerElementId;
      this.playerContainer.appendChild(this.playerElement);
    } else {
      this.playerElement = null;
    }

    this.content.appendChild(this.playerContainer);
  }

  private postToEmbed(msg: Record<string, unknown>): void {
    if (!this.desktopEmbedIframe?.contentWindow) return;
    this.desktopEmbedIframe.contentWindow.postMessage(msg, this.embedOrigin);
  }

  private syncDesktopEmbedState(): void {
    this.postToEmbed({ type: this.isPlaying ? 'play' : 'pause' });
    this.postToEmbed({ type: this.isMuted ? 'mute' : 'unmute' });
  }

  private renderDesktopEmbed(force = false): void {
    if (!this.useDesktopEmbedProxy) return;
    void this.renderDesktopEmbedAsync(force);
  }

  private async renderDesktopEmbedAsync(force = false): Promise<void> {
    const videoId = this.activeChannel.videoId;
    if (!videoId) {
      this.showOfflineMessage(this.activeChannel);
      return;
    }

    // Only recreate iframe when video ID changes (not for play/mute toggling).
    if (!force && this.currentVideoId === videoId && this.desktopEmbedIframe) {
      this.syncDesktopEmbedState();
      return;
    }

    const renderToken = ++this.desktopEmbedRenderToken;
    this.currentVideoId = videoId;
    this.isPlayerReady = true;

    // Always recreate if container was removed from DOM (e.g. showEmbedError replaced content).
    if (!this.playerContainer || !this.playerContainer.parentElement) {
      this.ensurePlayerContainer();
    }

    if (!this.playerContainer) {
      return;
    }

    this.playerContainer.innerHTML = '';

    // Use local sidecar embed — YouTube rejects tauri:// parent origin with error 153,
    // and Vercel WAF blocks cloud bridge iframe loads. The sidecar serves the embed from
    // http://127.0.0.1:PORT which YouTube accepts and has no WAF.
    const quality = getStreamQuality();
    const params = new URLSearchParams({
      videoId,
      autoplay: this.isPlaying ? '1' : '0',
      mute: this.isMuted ? '1' : '0',
    });
    if (quality !== 'auto') params.set('vq', quality);
    // origin = canonical site origin YouTube trusts for embed restrictions.
    // parentOrigin = actual parent frame origin so postMessage round-trips work.
    params.set('origin', this.youtubeOrigin || 'https://startupintelligence.app');
    params.set('parentOrigin', window.location.origin);
    const embedUrl = `http://localhost:${getLocalApiPort()}/api/youtube-embed?${params.toString()}`;

    if (renderToken !== this.desktopEmbedRenderToken) {
      return;
    }

    const iframe = document.createElement('iframe');
    iframe.className = 'live-news-embed-frame';
    iframe.src = embedUrl;
    iframe.title = `${this.activeChannel.name} live feed`;
    iframe.style.width = '100%';
    iframe.style.height = '100%';
    iframe.style.border = '0';
    iframe.allow = 'autoplay; encrypted-media; picture-in-picture; fullscreen; storage-access';
    iframe.allowFullscreen = true;
    iframe.referrerPolicy = 'strict-origin-when-cross-origin';
    iframe.setAttribute('loading', 'eager');

    this.playerContainer.appendChild(iframe);
    this.desktopEmbedIframe = iframe;
    this.startBotCheckTimeout();
  }

  private async renderNativeHlsPlayer(): Promise<void> {
    const hlsUrl = this.getDirectHlsUrl(this.activeChannel.id) || this.getProxiedHlsUrl(this.activeChannel.id) || this.activeChannel.hlsUrl;
    if (!hlsUrl || !(hlsUrl.startsWith('https://') || hlsUrl.startsWith('http://127.0.0.1'))) return;

    this.destroyPlayer();
    this.ensurePlayerContainer();
    if (!this.playerContainer) return;
    this.playerContainer.innerHTML = '';

    const video = document.createElement('video');
    video.className = 'live-news-native-video';
    video.autoplay = this.isPlaying;
    video.muted = this.isMuted;
    video.playsInline = true;
    video.controls = true;
    video.setAttribute('referrerpolicy', 'no-referrer');
    video.style.cssText = 'width:100%;height:100%;object-fit:contain;background:#000';

    const failedChannel = this.activeChannel;

    let hlsErrorFired = false;
    const onHlsFatalError = () => {
      if (hlsErrorFired) return;
      hlsErrorFired = true;
      console.warn('[LiveNews] HLS fatal error for', failedChannel.id, hlsUrl);
      if (this.hlsInstance) { this.hlsInstance.destroy(); this.hlsInstance = null; }
      video.pause();
      video.removeAttribute('src');
      this.nativeVideoElement = null;
      this.hlsFailureCooldown.set(failedChannel.id, Date.now());
      failedChannel.hlsUrl = undefined;

      if (this.activeChannel.id === failedChannel.id) {
        this.ensurePlayerContainer();
        void this.initializePlayer();
      }
    };

    const nativeHls = video.canPlayType('application/vnd.apple.mpegurl');
    if (nativeHls) {
      // Safari / WKWebView: native HLS support
      video.src = hlsUrl;
      video.addEventListener('error', onHlsFatalError);
    } else {
      // Chrome / Firefox: lazy-load hls.js only when needed
      const { default: Hls } = await import('hls.js');
      if (this.activeChannel.id !== failedChannel.id || !this.element?.isConnected) return;
      if (!Hls.isSupported()) {
        // No HLS support at all — fall through to YouTube
        onHlsFatalError();
        return;
      }
      const hls = new Hls({ enableWorker: true, lowLatencyMode: true });
      this.hlsInstance = hls;
      hls.loadSource(hlsUrl);
      hls.attachMedia(video);
      // Monitor both hls.js fatal events and raw media element errors (e.g. decode failures).
      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (data.fatal) onHlsFatalError();
      });
      video.addEventListener('error', onHlsFatalError);
    }

    video.addEventListener('volumechange', () => {
      if (!this.nativeVideoElement) return;
      const muted = this.nativeVideoElement.muted || this.nativeVideoElement.volume === 0;
      if (muted !== this.isMuted) {
        this.isMuted = muted;
        this.updateMuteIcon();
      }
    });

    video.addEventListener('pause', () => {
      if (!this.nativeVideoElement) return;
      if (this.isPlaying) {
        this.isPlaying = false;
        this.updateLiveIndicator();
      }
    });

    video.addEventListener('play', () => {
      if (!this.nativeVideoElement) return;
      if (!this.isPlaying) {
        this.isPlaying = true;
        this.updateLiveIndicator();
      }
    });

    this.nativeVideoElement = video;
    this.playerContainer.appendChild(video);
    this.isPlayerReady = true;
    this.currentVideoId = this.activeChannel.videoId || null;

    // WKWebView blocks autoplay without user gesture. Force muted play, then restore.
    if (this.isPlaying) {
      const wantUnmute = !this.isMuted;
      video.muted = true;
      video.play()?.then(() => {
        if (wantUnmute && this.nativeVideoElement === video) {
          video.muted = false;
        }
      }).catch(() => {});
    }
  }

  private syncNativeVideoState(): void {
    if (!this.nativeVideoElement) return;
    this.nativeVideoElement.muted = this.isMuted;
    if (this.isPlaying) {
      this.nativeVideoElement.play()?.catch(() => {});
    } else {
      this.nativeVideoElement.pause();
    }
  }

  private static loadYouTubeApi(): Promise<void> {
    if (LiveNewsPanel.apiPromise) return LiveNewsPanel.apiPromise;

    LiveNewsPanel.apiPromise = new Promise((resolve) => {
      if (window.YT?.Player) {
        resolve();
        return;
      }

      const existingScript = document.querySelector<HTMLScriptElement>(
        'script[data-youtube-iframe-api="true"]',
      );

      if (existingScript) {
        if (window.YT?.Player) {
          resolve();
          return;
        }
        const previousReady = window.onYouTubeIframeAPIReady;
        window.onYouTubeIframeAPIReady = () => {
          previousReady?.();
          resolve();
        };
        return;
      }

      const previousReady = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => {
        previousReady?.();
        resolve();
      };

      const script = document.createElement('script');
      script.src = 'https://www.youtube.com/iframe_api';
      script.async = true;
      script.dataset.youtubeIframeApi = 'true';
      script.onerror = () => {
        console.warn('[LiveNews] YouTube IFrame API failed to load (ad blocker or network issue)');
        LiveNewsPanel.apiPromise = null;
        script.remove();
        resolve();
      };
      document.head.appendChild(script);
    });

    return LiveNewsPanel.apiPromise;
  }

  private async initializePlayer(): Promise<void> {
    if (!this.useDesktopEmbedProxy && !this.nativeVideoElement && this.player) return;

    const useFallbackVideo = this.activeChannel.useFallbackOnly || this.forceFallbackVideoForNextInit;
    this.forceFallbackVideoForNextInit = false;
    await this.resolveChannelVideo(this.activeChannel, useFallbackVideo);
    if (!this.element?.isConnected) return;

    if (this.getDirectHlsUrl(this.activeChannel.id) || this.getProxiedHlsUrl(this.activeChannel.id) || this.activeChannel.hlsUrl) {
      void this.renderNativeHlsPlayer();
      return;
    }

    if (!this.activeChannel.videoId || !/^[\w-]{10,12}$/.test(this.activeChannel.videoId)) {
      this.showOfflineMessage(this.activeChannel);
      return;
    }

    if (this.useDesktopEmbedProxy) {
      this.renderDesktopEmbed(true);
      return;
    }

    await LiveNewsPanel.loadYouTubeApi();
    if (!this.element?.isConnected) return;
    if (this.player || !this.playerElement || !window.YT?.Player) return;

    // When YT.Player receives a DOM element it replaces that element in the
    // parent — the mutation fires on playerContainer, not inside playerElement.
    // Passing the string ID instead makes the API insert the iframe *as a child*
    // of the div, which the observer on playerContainer can catch.
    // We add storage-access so YouTube can call requestStorageAccess() and
    // access the user's cached session (avoids bot-check for signed-in users).
    const storageObserver = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (node instanceof HTMLIFrameElement) {
            let isYouTube = false;
            try {
              const parsed = new URL(node.src);
              isYouTube = parsed.hostname === 'youtube.com' || parsed.hostname.endsWith('.youtube.com');
            } catch {
              isYouTube = false;
            }
            if (!isYouTube) continue;
            const cur = node.getAttribute('allow') || '';
            if (!cur.includes('storage-access')) {
              node.setAttribute('allow', cur ? `${cur}; storage-access` : 'storage-access');
            }
            storageObserver.disconnect();
            if (observerTimeout !== null) clearTimeout(observerTimeout);
            return;
          }
        }
      }
    });
    // Auto-disconnect after 10 s to avoid leaking the observer if the iframe
    // never appears (e.g. YT.Player throws or the API fails to load).
    let observerTimeout: ReturnType<typeof setTimeout> | null = null;
    if (this.playerContainer) {
      storageObserver.observe(this.playerContainer, { childList: true, subtree: true });
      observerTimeout = setTimeout(() => storageObserver.disconnect(), 10_000);
    }

    try {
      this.player = new window.YT!.Player(this.playerElementId, {
      host: 'https://www.youtube.com',
      videoId: this.activeChannel.videoId,
      playerVars: {
        autoplay: this.isPlaying ? 1 : 0,
        mute: this.isMuted ? 1 : 0,
        rel: 0,
        playsinline: 1,
        enablejsapi: 1,
        ...(this.youtubeOrigin
          ? {
            origin: this.youtubeOrigin,
            widget_referrer: this.youtubeOrigin,
          }
          : {}),
      },
      events: {
        onReady: () => {
          this.clearBotCheckTimeout();
          this.isPlayerReady = true;
          this.currentVideoId = this.activeChannel.videoId || null;
          const iframe = this.player?.getIframe?.();
          if (iframe) iframe.referrerPolicy = 'strict-origin-when-cross-origin';
          const quality = getStreamQuality();
          if (quality !== 'auto') this.player?.setPlaybackQuality?.(quality);
          this.syncPlayerState();
          this.startMuteSyncPolling();
        },
        onError: (event) => {
          this.clearBotCheckTimeout();
          const errorCode = Number(event?.data ?? 0);

          // Retry once with known fallback stream.
          if (
            errorCode === 153 &&
            this.activeChannel.fallbackVideoId &&
            this.activeChannel.videoId !== this.activeChannel.fallbackVideoId
          ) {
            this.destroyPlayer();
            this.forceFallbackVideoForNextInit = true;
            this.ensurePlayerContainer();
            void this.initializePlayer();
            return;
          }

          // Desktop-specific last resort: switch to cloud bridge embed.
          if (errorCode === 153 && isDesktopRuntime()) {
            this.useDesktopEmbedProxy = true;
            this.destroyPlayer();
            this.ensurePlayerContainer();
            this.renderDesktopEmbed(true);
            return;
          }

          this.destroyPlayer();
          this.showEmbedError(this.activeChannel, errorCode);
        },
      },
    });
    } catch (err) {
      // YT.Player constructor threw — disconnect the observer so it doesn't leak.
      storageObserver.disconnect();
      if (observerTimeout !== null) clearTimeout(observerTimeout);
      throw err;
    }

    this.startBotCheckTimeout();
  }

  private startBotCheckTimeout(): void {
    this.clearBotCheckTimeout();
    this.botCheckTimeout = setTimeout(() => {
      this.botCheckTimeout = null;
      if (!this.isPlayerReady) {
        this.showBotCheckPrompt();
      }
    }, LiveNewsPanel.BOT_CHECK_TIMEOUT_MS);
  }

  private clearBotCheckTimeout(): void {
    if (this.botCheckTimeout) {
      clearTimeout(this.botCheckTimeout);
      this.botCheckTimeout = null;
    }
  }

  private showBotCheckPrompt(): void {
    const channel = this.activeChannel;
    const watchUrl = channel.videoId
      ? `https://www.youtube.com/watch?v=${encodeURIComponent(channel.videoId)}`
      : channel.handle
      ? `https://www.youtube.com/${encodeURIComponent(channel.handle)}`
      : 'https://www.youtube.com';

    this.destroyPlayer();
    this.content.innerHTML = '';

    const wrapper = document.createElement('div');
    wrapper.className = 'live-offline';

    const icon = document.createElement('div');
    icon.className = 'offline-icon';
    icon.textContent = '\u26A0\uFE0F';

    const text = document.createElement('div');
    text.className = 'offline-text';
    text.textContent = t('components.liveNews.botCheck', { name: channel.name }) || 'YouTube is requesting sign-in verification';

    const actions = document.createElement('div');
    actions.className = 'bot-check-actions';

    const signinBtn = document.createElement('button');
    signinBtn.className = 'offline-retry bot-check-signin';
    signinBtn.textContent = t('components.liveNews.signInToYouTube') || 'Sign in to YouTube';
    signinBtn.addEventListener('click', () => this.openYouTubeSignIn());

    const retryBtn = document.createElement('button');
    retryBtn.className = 'offline-retry bot-check-retry';
    retryBtn.textContent = t('common.retry') || 'Retry';
    retryBtn.addEventListener('click', () => {
      this.ensurePlayerContainer();
      if (this.useDesktopEmbedProxy) {
        this.renderDesktopEmbed(true);
      } else {
        void this.initializePlayer();
      }
    });

    const ytLink = document.createElement('a');
    ytLink.className = 'offline-retry';
    ytLink.href = watchUrl;
    ytLink.target = '_blank';
    ytLink.rel = 'noopener noreferrer';
    ytLink.textContent = t('components.liveNews.openOnYouTube') || 'Open on YouTube';

    actions.append(signinBtn, retryBtn, ytLink);
    wrapper.append(icon, text, actions);
    this.content.appendChild(wrapper);
  }

  private async openYouTubeSignIn(): Promise<void> {
    const youtubeLoginUrl = 'https://accounts.google.com/ServiceLogin?service=youtube&continue=https://www.youtube.com/';
    if (isDesktopRuntime()) {
      try {
        const { tryInvokeTauri } = await import('@/services/tauri-bridge');
        await tryInvokeTauri('open_youtube_login');
      } catch {
        window.open(youtubeLoginUrl, '_blank');
      }
    } else {
      window.open(youtubeLoginUrl, '_blank');
    }
  }

  private syncPlayerState(): void {
    // Native HLS <video> (desktop + web for CORS-enabled streams)
    if (this.nativeVideoElement) {
      const videoId = this.activeChannel.videoId;
      if (videoId && this.currentVideoId !== videoId) {
        // Channel changed — reinitialize
        void this.initializePlayer();
      } else {
        this.syncNativeVideoState();
      }
      return;
    }

    if (this.useDesktopEmbedProxy) {
      const videoId = this.activeChannel.videoId;
      if (videoId && this.currentVideoId !== videoId) {
        this.renderDesktopEmbed(true);
      } else {
        this.syncDesktopEmbedState();
      }
      return;
    }

    if (!this.player || !this.isPlayerReady) return;

    const videoId = this.activeChannel.videoId;
    if (!videoId) return;

    // Handle channel switch
    const isNewVideo = this.currentVideoId !== videoId;
    if (isNewVideo) {
      this.currentVideoId = videoId;
      if (!this.playerElement || !document.getElementById(this.playerElementId)) {
        this.ensurePlayerContainer();
        void this.initializePlayer();
        return;
      }
      if (this.isPlaying) {
        if (typeof this.player.loadVideoById === 'function') {
          this.player.loadVideoById(videoId);
        }
      } else {
        if (typeof this.player.cueVideoById === 'function') {
          this.player.cueVideoById(videoId);
        }
      }
    }

    if (this.isMuted) {
      this.player.mute?.();
    } else {
      this.player.unMute?.();
    }

    if (this.isPlaying) {
      if (isNewVideo) {
        // WKWebView loses user gesture context after await.
        // Pause then play after a delay — mimics the manual workaround.
        this.player.pauseVideo?.();
        setTimeout(() => {
          if (this.player && this.isPlaying) {
            this.player.mute?.();
            this.player.playVideo?.();
            // Restore mute state after play starts
            if (!this.isMuted) {
              setTimeout(() => { this.player?.unMute?.(); }, 500);
            }
          }
        }, 800);
      } else {
        this.player.playVideo?.();
      }
    } else {
      this.player.pauseVideo?.();
    }
  }

  public refresh(): void {
    this.syncPlayerState();
  }

  /** Reload channel list from storage (e.g. after edit in separate channel management window). */
  public refreshChannelsFromStorage(): void {
    this.channels = loadChannelsFromStorage();
    if (this.channels.length === 0) this.channels = getDefaultLiveChannels();
    if (!this.channels.some((c) => c.id === this.activeChannel.id)) {
      this.activeChannel = this.channels[0]!;
      void this.switchChannel(this.activeChannel);
    }
    this.refreshChannelSwitcher();
  }

  public destroy(): void {
    this.destroyPlayer();
    this.unsubscribeStreamSettings?.();
    this.unsubscribeStreamSettings = null;

    if (this.lazyObserver) { this.lazyObserver.disconnect(); this.lazyObserver = null; }
    if (this.idleCallbackId !== null) {
      if ('cancelIdleCallback' in window) (window as any).cancelIdleCallback(this.idleCallbackId);
      else clearTimeout(this.idleCallbackId as ReturnType<typeof setTimeout>);
      this.idleCallbackId = null;
    }

    if (this.idleTimeout) {
      clearTimeout(this.idleTimeout);
      this.idleTimeout = null;
    }

    document.removeEventListener('visibilitychange', this.boundVisibilityHandler);
    document.removeEventListener('keydown', this.boundFullscreenEscHandler);
    window.removeEventListener('message', this.boundMessageHandler);
    if (this.isFullscreen) this.toggleFullscreen();
    if (this.idleDetectionEnabled) {
      IDLE_ACTIVITY_EVENTS.forEach(event => {
        document.removeEventListener(event, this.boundIdleResetHandler);
      });
      this.idleDetectionEnabled = false;
    }

    this.playerContainer = null;

    super.destroy();
  }
}
