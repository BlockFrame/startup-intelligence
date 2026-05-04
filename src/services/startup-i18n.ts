type TranslationValue = string | Record<string, unknown>;
type TranslationDictionary = Record<string, TranslationValue>;

const dictionary = {
  app: {
    title: 'Startup Intelligence',
    description: 'Startup, VC, AI stack, and market intelligence',
  },
  header: {
    world: 'WORLD',
    tech: 'TECH',
    finance: 'FINANCE',
    commodity: 'COMMODITY',
    live: 'LIVE',
    cached: 'CACHED',
    unavailable: 'UNAVAILABLE',
    search: 'Search',
    settings: 'SETTINGS',
    copyLink: 'Link',
    downloadApp: 'Download App',
    fullscreen: 'Fullscreen',
    pinMap: 'Pin map to top',
    selectRegion: 'Select Region',
    filterPanels: 'Filter panels...',
    filterSources: 'Filter sources...',
    sourcesEnabled: '{{enabled}}/{{total}} enabled',
    sourceRegionAll: 'All',
    sourceRegionTechNews: 'Tech News',
    sourceRegionAiMl: 'AI & ML',
    sourceRegionStartupsVc: 'Startups & VC',
    sourceRegionRegionalTech: 'Regional Ecosystems',
    sourceRegionDeveloper: 'Developer',
    sourceRegionCybersecurity: 'Cybersecurity',
    sourceRegionTechPolicy: 'Policy & Research',
    sourceRegionMarkets: 'Markets & Analysis',
    tabSettings: 'Settings',
    tabPanels: 'Panels',
    tabSources: 'Sources',
    tabNotifications: 'Notifications',
    resetLayout: 'Reset Layout',
    resetLayoutTooltip: 'Restore default panel arrangement',
    unsavedChanges: 'You have unsaved panel changes. Discard them?',
    currentVariant: '(current)',
  },
  panels: {
    map: 'Startup Map',
    techMap: 'Startup Map',
    liveNews: 'Live News',
    status: 'System Status',
    insights: 'Investment Brief',
    markets: 'Public Comps',
    finance: 'Market Context',
    tech: 'Technology',
    ai: 'AI/ML',
    startups: 'Startups',
    cloud: 'Cloud Infrastructure',
    hardware: 'Semiconductors & Hardware',
    fintech: 'Fintech',
    vcblogs: 'VC Thesis & Essays',
    regionalStartups: 'Global Startup News',
    unicorns: 'Unicorn Tracker',
    accelerators: 'Accelerators & Demo Days',
    funding: 'Funding Rounds',
    producthunt: 'Launch Radar',
    security: 'Cybersecurity',
    policy: 'AI Policy & Regulation',
    ipo: 'IPO & M&A',
    layoffs: 'Layoffs Tracker',
    monitors: 'Investment Monitors',
    events: 'Tech Events',
    topVcSignals: 'Highest-Conviction Signals',
    macroSignals: 'Exit & Risk Window',
    techReadiness: 'Tech Readiness Index',
    serviceStatus: 'Service Status',
    chatAnalyst: 'Chat Analyst',
    worldClock: 'World Clock',
  },
  common: {
    loading: 'Loading...',
    error: 'Error',
    noData: 'No data available',
    noDataAvailable: 'No data available',
    updated: 'Updated just now',
    ago: '{{time}} ago',
    retrying: 'Retrying...',
    failedToLoad: 'Temporarily unavailable - retrying',
    dataTemporarilyUnavailable: 'Data temporarily unavailable',
    upstreamUnavailable: 'Upstream API unavailable - will retry automatically',
    failedMarketData: 'Market data temporarily unavailable',
    failedSectorData: 'Sector data temporarily unavailable',
    failedCommodities: 'Commodities data temporarily unavailable',
    failedCryptoData: 'Crypto data temporarily unavailable',
    failedTechReadiness: 'Tech readiness data temporarily unavailable',
    rateLimitedMarket: 'Market data temporarily unavailable (rate limited) - retrying shortly',
    noNewsAvailable: 'No news available',
    allSourcesDisabled: 'All sources disabled',
    selectAll: 'Select All',
    selectNone: 'Select None',
    live: 'LIVE',
    cached: 'CACHED',
    unavailable: 'UNAVAILABLE',
    close: 'Close',
    cancel: 'Cancel',
    currentVariant: '(current)',
    retry: 'Retry',
    refresh: 'Refresh',
    all: 'All',
    new: 'NEW',
  },
  connectivity: {
    offlineCached: 'Offline - showing cached data from {{freshness}}.',
    offlineUnavailable: 'Offline - live data is currently unavailable.',
    cachedFallback: 'Live data unavailable - showing cached data from {{freshness}}.',
  },
  components: {
    panel: {
      addPanel: 'Add Panel',
      removePanel: 'Remove Panel',
    },
    newsPanel: {
      sources: 'Sources',
      sortBy: 'Sort by',
      sortNewest: 'Newest',
      sortRelevance: 'Relevance',
      summarize: 'Summarize',
      generatingSummary: 'Generating summary',
      summaryFailed: 'Summary failed',
      summaryError: 'Summary unavailable',
      relatedAssetsNear: 'Related assets near',
      close: 'Close',
    },
    monitor: {
      placeholder: 'Company, thesis, sector, or signal keywords',
      add: '+ Add Monitor',
      intro: 'Track startup, funding, AI, company, and market-thesis keywords across loaded sources.',
      addKeywords: 'Add a thesis, company, sector, or use a preset to start monitoring.',
      noMatches: 'No matches in {{count}} articles',
      showingMatches: 'Showing {{count}} of {{total}} matches',
      match: 'match',
      matches: 'matches',
    },
    monitors: {
      infoTooltip: 'Track startup, company, founder, market, or technology keywords across live sources.',
    },
    insights: {
      infoTooltip: 'AI-ranked brief from startup and technology signals.',
      waitingForData: 'Waiting for data',
      rankingStories: 'Ranking stories',
      analyzingSentiment: 'Analyzing sentiment',
      generatingBrief: 'Generating brief',
      noStories: 'No stories yet',
      step: 'Step {{step}}',
      insightsDisabledTitle: 'AI insights disabled',
      insightsDisabledHint: 'Enable sources to generate insights.',
    },
    markets: {
      infoTooltip: 'Market comps and public-market context for startup sectors.',
    },
    heatmap: {
      infoTooltip: 'Sector heatmap across public comps and startup-relevant categories.',
    },
    commodities: {
      infoTooltip: 'Commodity context for semiconductors, energy, hardware, and compute inputs.',
    },
    crypto: {
      infoTooltip: 'Crypto market context for fintech and infrastructure theses.',
    },
    techEvents: {
      infoTooltip: 'Tech events, conferences, earnings, and ecosystem dates.',
      loading: 'Loading events',
      noEvents: 'No upcoming events',
      all: 'All',
      today: 'Today',
      soon: 'Soon',
      conferences: 'Conferences',
      earnings: 'Earnings',
      techmemeEvents: 'Techmeme Events',
      conferencesCount: '{{count}} conferences',
      onMap: 'On map',
      showOnMap: 'Show on map',
      moreInfo: 'More info',
      upcoming: 'Upcoming',
    },
    techReadiness: {
      infoTooltip: 'Country-level readiness signals for digital adoption and startup ecosystems.',
      fetchingData: 'Fetching readiness data',
      analyzingCountries: 'Analyzing countries',
      source: 'Source',
      updated: 'Updated',
      broadbandAccess: 'Broadband access',
      internetUsers: 'Internet users',
      internetUsersIndicator: 'Internet users',
      mobileSubscriptions: 'Mobile subscriptions',
      mobileSubscriptionsIndicator: 'Mobile subscriptions',
      rdExpenditure: 'R&D expenditure',
      rdSpending: 'R&D spending',
    },
    status: {
      dataFeeds: 'Data Feeds',
      apiStatus: 'API Status',
      storage: 'Storage',
      systemStatus: 'System Status',
      updatedJustNow: 'Updated just now',
      updatedAt: 'Updated {{time}}',
      storageUnavailable: 'Storage info unavailable',
    },
    playback: {
      toggleMode: 'Toggle Playback Mode',
      live: 'LIVE',
      historicalPlayback: 'Historical Playback',
      close: 'Close',
    },
    map: {
      hideMap: 'Hide map',
      showMap: 'Show map',
    },
    liveNews: {
      title: 'Live Channels',
      empty: 'No live channels configured',
    },
    serviceStatus: {
      operational: 'Operational',
      degraded: 'Degraded',
      outage: 'Outage',
    },
  },
  popups: {
    unknown: 'Unknown',
    location: 'Location',
    datacenter: {
      status: {
        existing: 'OPERATIONAL',
        planned: 'PLANNED',
        decommissioned: 'DECOMMISSIONED',
        unknown: 'UNKNOWN',
      },
      gpuChipCount: 'GPU/CHIP COUNT',
      chipType: 'CHIP TYPE',
      power: 'POWER',
      sector: 'SECTOR',
      attribution: 'Data: Epoch AI GPU Clusters',
      chips: 'chips',
      cluster: {
        title: '{{count}} Data Centers',
        totalChips: 'TOTAL CHIPS',
        totalPower: 'TOTAL POWER',
        operational: 'OPERATIONAL',
        planned: 'PLANNED',
        moreDataCenters: '+ {{count}} more data centers',
        sampledSites: 'Showing a sampled list of {{count}} sites.',
      },
    },
    startupHub: {
      tiers: {
        mega: 'MEGA HUB',
        major: 'MAJOR HUB',
        emerging: 'EMERGING',
        hub: 'HUB',
      },
      unicorns: 'UNICORNS',
    },
    cloudRegion: {
      provider: 'PROVIDER',
      availabilityZones: 'AVAILABILITY ZONES',
    },
    techHQ: {
      types: {
        faang: 'BIG TECH',
        unicorn: 'UNICORN',
        public: 'PUBLIC',
        tech: 'TECH',
      },
      marketCap: 'MARKET CAP',
      employees: 'EMPLOYEES',
    },
    accelerator: {
      types: {
        accelerator: 'ACCELERATOR',
        incubator: 'INCUBATOR',
        studio: 'STARTUP STUDIO',
      },
      founded: 'FOUNDED',
      notableAlumni: 'NOTABLE ALUMNI',
    },
    techEvent: {
      days: {
        today: 'TODAY',
        tomorrow: 'TOMORROW',
        inDays: 'IN {{count}} DAYS',
      },
      date: 'DATE',
      moreInformation: 'More Information',
    },
    techHQCluster: {
      companiesCount: '{{count}} COMPANIES',
      bigTechCount: '{{count}} Big Tech',
      unicornsCount: '{{count}} Unicorns',
      publicCount: '{{count}} Public',
      sampled: 'Showing a sampled list of {{count}} companies.',
    },
    techEventCluster: {
      eventsCount: '{{count}} EVENTS',
      upcomingWithin2Weeks: '{{count}} upcoming within 2 weeks',
      sampled: 'Showing a sampled list of {{count}} events.',
    },
  },
  widgets: {
    confirmDelete: 'Remove this widget permanently?',
    chatTitle: 'Widget Builder',
    modifyTitle: 'Modify Widget',
    inputPlaceholder: 'Describe your widget...',
    addToDashboard: 'Add to Dashboard',
    applyChanges: 'Apply Changes',
    send: 'Send',
    modifyWithAi: 'Modify widget with AI',
    createInteractive: 'Create Interactive Widget',
    proBadge: 'PRO',
    ready: 'Widget ready: {{title}}',
    fetching: 'Fetching {{target}}...',
    requestTimedOut: 'Request timed out. Please try again.',
    serverError: 'Server error: {{status}}',
    unknownError: 'Unknown error',
    generatedWidget: 'Generated widget: {{title}}',
    checkingConnection: 'Checking widget access...',
    readyToGenerate: 'Ready to generate. Pick an example or describe your widget.',
    readyToApply: 'Preview ready for {{title}}. Review it, then add it to the dashboard.',
    generating: 'Generating...',
    examplesTitle: 'Prompt ideas',
    previewTitle: 'Live Preview',
  },
  mcp: {
    connectPanel: 'Connect MCP',
    modalTitle: 'Connect MCP Server',
    serverUrl: 'Server URL',
    authHeader: 'Auth Header',
    optional: 'optional',
    apiKey: 'API Key',
    apiKeyPlaceholder: 'Paste your API key',
    useCustomHeaders: 'Advanced: use custom headers',
    useApiKey: 'Use API key',
    connectBtn: 'Connect & List Tools',
    connecting: 'Connecting...',
    foundTools: 'Found {{count}} tool(s)',
    connectFailed: 'Connection failed',
    selectTool: 'Select a tool',
    toolArgs: 'Arguments (JSON)',
    panelTitle: 'Panel Title',
    panelTitlePlaceholder: 'My MCP Panel',
    refreshEvery: 'Refresh every',
    seconds: 'seconds',
    addPanel: 'Add Panel',
    configure: 'Configure MCP',
    refreshNow: 'Refresh now',
    invalidJson: 'Invalid JSON',
    confirmDelete: 'Remove this MCP panel?',
    quickConnect: 'Quick Connect',
    or: 'or enter a custom server',
    generatingVisualization: 'Building visualization...',
    visualizationFailed: 'Visualization failed',
  },
  modals: {
    settingsWindow: {
      freePanelLimit: 'Free plan: max {{max}} panels. Upgrade to PRO for unlimited.',
      freeSourceLimit: 'Free plan: max {{max}} sources. Upgrade to PRO for unlimited.',
      saved: 'Settings saved',
    },
    downloadBanner: {
      description: 'Native performance, secure local key storage, offline map tiles.',
      showAllPlatforms: 'Show all platforms',
      showLess: 'Show less',
    },
    runtimeConfig: {
      title: 'Desktop Configuration',
    },
  },
  preferences: {
    display: 'Display',
    intelligence: 'Intelligence',
    media: 'Media',
    panels: 'Panels',
    dataAndCommunity: 'Data & Community',
    theme: 'Theme',
    themeDesc: 'Auto follows your system preference.',
    themeAuto: 'Auto (follow system)',
    themeDark: 'Dark',
    themeLight: 'Light',
    mapProvider: 'Map Tile Provider',
    mapTheme: 'Map Theme',
    fontFamily: 'Font Family',
    fontMono: 'Monospace',
    fontSystem: 'System Default',
  },
  premium: {
    pro: 'PRO',
    lockedDesc: 'Requires a Startup Intelligence license key',
    signInToUnlock: 'Sign in to unlock premium features',
    signIn: 'Sign In to Unlock',
    upgradeDesc: 'Upgrade to Pro for full access to premium analytics',
    upgradeToPro: 'Upgrade to Pro',
  },
  contextMenu: {
    openCountryBrief: 'Focus country',
    copyCoordinates: 'Copy Coordinates',
  },
} satisfies TranslationDictionary;

function lookup(path: string): string | null {
  let current: unknown = dictionary;
  for (const part of path.split('.')) {
    if (!current || typeof current !== 'object' || !(part in current)) return null;
    current = (current as Record<string, unknown>)[part];
  }
  return typeof current === 'string' ? current : null;
}

function interpolate(template: string, options?: Record<string, unknown>): string {
  if (!options) return template;
  return template.replace(/\{\{\s*([^}]+)\s*\}\}/g, (_match, key: string) => {
    const value = options[key.trim()];
    return value == null ? '' : String(value);
  });
}

export async function initI18n(): Promise<void> {
  document.documentElement.setAttribute('lang', 'en');
  document.documentElement.removeAttribute('dir');
}

export function t(key: string, options?: Record<string, unknown>): string {
  return interpolate(lookup(key) ?? key, options);
}

export async function changeLanguage(_lng: string): Promise<void> {
  await initI18n();
}

export function getCurrentLanguage(): string {
  return 'en';
}

export function isRTL(): boolean {
  return false;
}

export function getLocale(): string {
  return 'en-US';
}

export const LANGUAGES = [
  { code: 'en', label: 'English', flag: 'GB' },
];
