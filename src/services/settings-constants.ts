import type { RuntimeSecretKey, RuntimeFeatureId } from './runtime-config';

export const SIGNUP_URLS: Partial<Record<RuntimeSecretKey, string>> = {
  GROQ_API_KEY: 'https://console.groq.com/keys',
  GROQ_MODEL: 'https://console.groq.com/docs/models',
  OPENROUTER_API_KEY: 'https://openrouter.ai/settings/keys',
  OPENROUTER_MODEL: 'https://openrouter.ai/models',
  OPENAI_API_KEY: 'https://platform.openai.com/api-keys',
  OPENAI_MODEL: 'https://platform.openai.com/docs/models',
  ANTHROPIC_API_KEY: 'https://console.anthropic.com/settings/keys',
  ANTHROPIC_MODEL: 'https://docs.anthropic.com/en/docs/about-claude/models',
  MISTRAL_API_KEY: 'https://console.mistral.ai/api-keys',
  MISTRAL_MODEL: 'https://docs.mistral.ai/getting-started/models/models_overview/',
  HUGGINGFACE_API_KEY: 'https://huggingface.co/settings/tokens',
  HUGGINGFACE_MODEL: 'https://huggingface.co/models',
  EXA_API_KEYS: 'https://dashboard.exa.ai/api-keys',
  BRAVE_API_KEYS: 'https://api-dashboard.search.brave.com/app/keys',
  SERPAPI_API_KEYS: 'https://serpapi.com/manage-api-key',
  FRED_API_KEY: 'https://fred.stlouisfed.org/docs/api/api_key.html',
  EIA_API_KEY: 'https://www.eia.gov/opendata/register.php',
  CLOUDFLARE_API_TOKEN: 'https://dash.cloudflare.com/profile/api-tokens',
  ACLED_ACCESS_TOKEN: 'https://developer.acleddata.com/',
  URLHAUS_AUTH_KEY: 'https://auth.abuse.ch/',
  OTX_API_KEY: 'https://otx.alienvault.com/',
  ABUSEIPDB_API_KEY: 'https://www.abuseipdb.com/login',
  WINGBITS_API_KEY: 'https://wingbits.com/register',
  AISSTREAM_API_KEY: 'https://aisstream.io/authenticate',
  OPENSKY_CLIENT_ID: 'https://opensky-network.org/login?view=registration',
  OPENSKY_CLIENT_SECRET: 'https://opensky-network.org/login?view=registration',
  FINNHUB_API_KEY: 'https://finnhub.io/register',
  NASA_FIRMS_API_KEY: 'https://firms.modaps.eosdis.nasa.gov/api/area/',
  UCDP_ACCESS_TOKEN: 'https://ucdp.uu.se/apidocs/',
  OLLAMA_API_URL: 'https://ollama.com/download',
  OLLAMA_MODEL: 'https://ollama.com/library',
  WTO_API_KEY: 'https://apiportal.wto.org/',
  AVIATIONSTACK_API: 'https://aviationstack.com/signup/free',
  ICAO_API_KEY: 'https://dataservices.icao.int/',
};

export const PLAINTEXT_KEYS = new Set<RuntimeSecretKey>([
  'GROQ_MODEL',
  'OPENROUTER_MODEL',
  'OPENAI_MODEL',
  'ANTHROPIC_MODEL',
  'MISTRAL_MODEL',
  'HUGGINGFACE_MODEL',
  'OLLAMA_API_URL',
  'OLLAMA_MODEL',
  'WS_RELAY_URL',
  'VITE_OPENSKY_RELAY_URL',
]);

export const MASKED_SENTINEL = '__SI_MASKED__';

export const HUMAN_LABELS: Record<RuntimeSecretKey, string> = {
  GROQ_API_KEY: 'Groq API Key',
  GROQ_MODEL: 'Groq Model',
  OPENROUTER_API_KEY: 'OpenRouter API Key',
  OPENROUTER_MODEL: 'OpenRouter Model',
  OPENAI_API_KEY: 'OpenAI API Key',
  OPENAI_MODEL: 'OpenAI Model',
  ANTHROPIC_API_KEY: 'Anthropic API Key',
  ANTHROPIC_MODEL: 'Anthropic Model',
  MISTRAL_API_KEY: 'Mistral API Key',
  MISTRAL_MODEL: 'Mistral Model',
  HUGGINGFACE_API_KEY: 'Hugging Face API Key',
  HUGGINGFACE_MODEL: 'Hugging Face Model',
  EXA_API_KEYS: 'Exa API Keys',
  BRAVE_API_KEYS: 'Brave Search API Keys',
  SERPAPI_API_KEYS: 'SerpAPI Keys',
  FRED_API_KEY: 'FRED API Key',
  EIA_API_KEY: 'EIA API Key',
  CLOUDFLARE_API_TOKEN: 'Cloudflare API Token',
  ACLED_ACCESS_TOKEN: 'ACLED Access Token',
  URLHAUS_AUTH_KEY: 'URLhaus Auth Key',
  OTX_API_KEY: 'AlienVault OTX Key',
  ABUSEIPDB_API_KEY: 'AbuseIPDB API Key',
  WINGBITS_API_KEY: 'Wingbits API Key',
  WS_RELAY_URL: 'WebSocket Relay URL',
  VITE_OPENSKY_RELAY_URL: 'OpenSky Relay URL',
  OPENSKY_CLIENT_ID: 'OpenSky Client ID',
  OPENSKY_CLIENT_SECRET: 'OpenSky Client Secret',
  AISSTREAM_API_KEY: 'AISStream API Key',
  FINNHUB_API_KEY: 'Finnhub API Key',
  NASA_FIRMS_API_KEY: 'NASA FIRMS API Key',
  UCDP_ACCESS_TOKEN: 'UCDP Access Token',
  OLLAMA_API_URL: 'Ollama Server URL',
  OLLAMA_MODEL: 'Ollama Model',
  STARTUP_INTELLIGENCE_API_KEY: 'Startup Intelligence License Key',
  WTO_API_KEY: 'WTO API Key',
  AVIATIONSTACK_API: 'AviationStack API Key',
  ICAO_API_KEY: 'ICAO NOTAM API Key',
};

export interface SettingsCategory {
  id: string;
  label: string;
  features: RuntimeFeatureId[];
}

export const SETTINGS_CATEGORIES: SettingsCategory[] = [
  {
    id: 'ai',
    label: 'AI & Summarization',
    features: ['aiOllama', 'aiGroq', 'aiOpenRouter', 'aiOpenAI', 'aiAnthropic', 'aiMistral', 'aiHuggingFace'],
  },
  {
    id: 'economy',
    label: 'Economic & Energy',
    features: ['economicFred', 'energyEia'],
  },
  {
    id: 'markets',
    label: 'Markets & Trade',
    features: ['finnhubMarkets', 'stockNewsSearchExa', 'stockNewsSearchBrave', 'stockNewsSearchSerpApi', 'wtoTrade'],
  },
  {
    id: 'security',
    label: 'Security & Threats',
    features: ['internetOutages', 'acledConflicts', 'ucdpConflicts', 'abuseChThreatIntel', 'alienvaultOtxThreatIntel', 'abuseIpdbThreatIntel'],
  },
  {
    id: 'tracking',
    label: 'Tracking & Sensing',
    features: ['aisRelay', 'openskyRelay', 'wingbitsEnrichment', 'nasaFirms', 'aviationStack', 'icaoNotams', 'newsPerFeedFallback'],
  },
];
