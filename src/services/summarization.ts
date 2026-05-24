/**
 * Summarization Service with Fallback Chain
 * Server-side Redis caching handles cross-user deduplication
 * Fallback: OpenRouter free -> Browser T5.
 * Paid cloud fallbacks stay disabled unless VITE_ALLOW_PAID_LLM_FALLBACKS=true.
 *
 * Uses NewsServiceClient.summarizeArticle() RPC instead of legacy
 * per-provider fetch endpoints.
 */

import { mlWorker } from './ml-worker';
import { getRpcBaseUrl } from '@/services/rpc-client';
import { SITE_VARIANT } from '@/config/variant';
import { BETA_MODE } from '@/config/beta';
import { isFeatureAvailable, type RuntimeFeatureId } from './runtime-config';
import { trackLLMUsage, trackLLMFailure } from './analytics';
import { getCurrentLanguage } from '@/services/i18n';
import { NewsServiceClient, type SummarizeArticleResponse } from '@/generated/client/startup_intelligence/news/v1/service_client';
import { createCircuitBreaker } from '@/utils';
import { buildSummaryCacheKey } from '@/utils/summary-cache-key';

export type ApiSummarizationProvider =
  | 'ollama'
  | 'groq'
  | 'openrouter'
  | 'openai'
  | 'anthropic'
  | 'mistral'
  | 'huggingface';

export type SummarizationProvider = ApiSummarizationProvider | 'browser' | 'cache' | 'rules';
export type SummaryMode = 'brief' | 'analysis' | 'vc_thesis';

export interface SummarizationResult {
  summary: string;
  provider: SummarizationProvider;
  model: string;
  cached: boolean;
}

export type ProgressCallback = (step: number, total: number, message: string) => void;

export interface SummarizeOptions {
  skipCloudProviders?: boolean;  // true = skip Ollama/Groq/OpenRouter, go straight to browser T5
  skipBrowserFallback?: boolean; // true = skip browser T5 fallback
  mode?: SummaryMode;
  cacheSalt?: string;
}

// ── Sebuf client (replaces direct fetch to /api/{provider}-summarize) ──

const newsClient = new NewsServiceClient(getRpcBaseUrl(), { fetch: (...args) => globalThis.fetch(...args) });
const summaryBreaker = createCircuitBreaker<SummarizeArticleResponse>({ name: 'News Summarization', cacheTtlMs: 0 });

const summaryResultBreaker = createCircuitBreaker<SummarizationResult | null>({
  name: 'SummaryResult',
  cacheTtlMs: 2 * 60 * 60 * 1000,
  persistCache: true,
  maxCacheEntries: 128,
});

const emptySummaryFallback: SummarizeArticleResponse = { summary: '', provider: '', model: '', fallback: true, tokens: 0, error: '', errorType: '', status: 'SUMMARIZE_STATUS_UNSPECIFIED', statusDetail: '' };

// ── Provider definitions ──

interface ApiProviderDef {
  featureId: RuntimeFeatureId;
  provider: ApiSummarizationProvider;
  label: string;
}

const API_PROVIDERS: ApiProviderDef[] = [
  { featureId: 'aiOpenRouter',  provider: 'openrouter', label: 'OpenRouter' },
];

const PAID_FALLBACK_PROVIDERS: ApiProviderDef[] = [
  { featureId: 'aiOllama',      provider: 'ollama',     label: 'Ollama' },
  { featureId: 'aiGroq',        provider: 'groq',       label: 'Groq AI' },
  { featureId: 'aiOpenAI',      provider: 'openai',     label: 'OpenAI' },
  { featureId: 'aiAnthropic',   provider: 'anthropic',  label: 'Anthropic' },
  { featureId: 'aiMistral',     provider: 'mistral',    label: 'Mistral' },
  { featureId: 'aiHuggingFace', provider: 'huggingface', label: 'Hugging Face' },
];

const CLOUD_PROVIDERS: ApiProviderDef[] = import.meta.env.VITE_ALLOW_PAID_LLM_FALLBACKS === 'true'
  ? [...API_PROVIDERS, ...PAID_FALLBACK_PROVIDERS]
  : API_PROVIDERS;

let lastAttemptedProvider = 'none';

function shouldSkipSummarizationRpcInDev(): boolean {
  return false;
}

// ── Unified API provider caller (via SummarizeArticle RPC) ──

async function tryApiProvider(
  providerDef: ApiProviderDef,
  headlines: string[],
  geoContext?: string,
  lang?: string,
  mode: SummaryMode = 'brief',
): Promise<SummarizationResult | null> {
  if (shouldSkipSummarizationRpcInDev()) return null;
  if (!isFeatureAvailable(providerDef.featureId)) return null;
  lastAttemptedProvider = providerDef.provider;
  try {
    const resp: SummarizeArticleResponse = await summaryBreaker.execute(async () => {
      return newsClient.summarizeArticle({
        provider: providerDef.provider,
        headlines,
        mode,
        geoContext: geoContext || '',
        variant: SITE_VARIANT,
        lang: lang || 'en',
        systemAppend: '',
      });
    }, emptySummaryFallback);

    // Provider skipped (credentials missing) or signaled fallback
    if (resp.status === 'SUMMARIZE_STATUS_SKIPPED' || resp.fallback) return null;

    const summary = typeof resp.summary === 'string' ? resp.summary.trim() : '';
    if (!summary) return null;

    const cached = resp.status === 'SUMMARIZE_STATUS_CACHED';
    const resultProvider = cached ? 'cache' : providerDef.provider;
    return {
      summary,
      provider: resultProvider as SummarizationProvider,
      model: resp.model || providerDef.provider,
      cached,
    };
  } catch (error) {
    console.warn(`[Summarization] ${providerDef.label} failed:`, error);
    return null;
  }
}

// ── Browser T5 provider (different interface -- no API call) ──

async function tryBrowserT5(headlines: string[], modelId?: string, mode: SummaryMode = 'brief'): Promise<SummarizationResult | null> {
  try {
    if (!mlWorker.isAvailable) {
      return null;
    }
    lastAttemptedProvider = 'browser';

    const lang = getCurrentLanguage();
    const combinedText = headlines.slice(0, 5).map(h => h.slice(0, 80)).join('. ');
    const prompt = mode === 'vc_thesis'
      ? `Create a compact VC thesis memo in English with exactly these labels: Thesis, Why now, Evidence, Investor action. Use only the headline facts. If evidence is thin, say Weak signal. Under 120 words: ${combinedText}`
      : lang === 'fr'
      ? `Résumez le titre le plus important en 2 phrases concises (moins de 60 mots) : ${combinedText}`
      : `Summarize the most important headline in 2 concise sentences (under 60 words): ${combinedText}`;

    const [summary] = await mlWorker.summarize([prompt], modelId);

    if (!summary || summary.length < 20 || summary.toLowerCase().includes('summarize') || summary.toLowerCase().includes('résumez')) {
      return null;
    }

    return {
      summary,
      provider: 'browser',
      model: modelId || 't5-small',
      cached: false,
    };
  } catch (error) {
    console.warn('[Summarization] Browser T5 failed:', error);
    return null;
  }
}

function buildRulesSummary(headlines: string[], mode: SummaryMode = 'brief'): SummarizationResult | null {
  const cleaned = headlines
    .map((headline) => headline.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .slice(0, 5);
  if (cleaned.length < 2) return null;

  const primary = cleaned[0];
  const secondary = cleaned.slice(1, 4);
  const summary = mode === 'vc_thesis'
    ? [
      `Key signal: ${primary}`,
      `Why it matters: ${secondary[0] || primary}`,
      `Investor angle: Track whether this becomes repeated customer, funding, product, or distribution evidence.`,
      'Confidence: Early signal until confirmed by multiple sources.',
    ].join('\n\n')
    : `${primary}. Related signals: ${secondary.join('; ')}.`;

  return {
    summary,
    provider: 'rules',
    model: 'startup-summary-rules',
    cached: false,
  };
}

// ── Fallback chain runner ──

async function runApiChain(
  providers: ApiProviderDef[],
  headlines: string[],
  geoContext: string | undefined,
  lang: string | undefined,
  onProgress: ProgressCallback | undefined,
  stepOffset: number,
  totalSteps: number,
  mode: SummaryMode = 'brief',
): Promise<SummarizationResult | null> {
  for (const [i, provider] of providers.entries()) {
    onProgress?.(stepOffset + i, totalSteps, `Connecting to ${provider.label}...`);
    const result = await tryApiProvider(provider, headlines, geoContext, lang, mode);
    if (result) return result;
  }
  return null;
}

/**
 * Generate a summary using the fallback chain:
 * OpenRouter free -> Browser T5
 * Server-side Redis caching is handled by the SummarizeArticle RPC handler
 * @param geoContext Optional geographic signal context to include in the prompt
 */
export async function generateSummary(
  headlines: string[],
  onProgress?: ProgressCallback,
  geoContext?: string,
  lang: string = 'en',
  options?: SummarizeOptions,
): Promise<SummarizationResult | null> {
  if (!headlines || headlines.length < 2) {
    return null;
  }

  const mode = options?.mode || 'brief';
  const optionsSuffix = options?.skipCloudProviders || options?.skipBrowserFallback
    ? `:opts${options.skipCloudProviders ? 'C' : ''}${options.skipBrowserFallback ? 'B' : ''}`
    : '';
  const saltSuffix = options?.cacheSalt ? `:${options.cacheSalt}` : '';
  const cacheKey = buildSummaryCacheKey(headlines, mode, geoContext, SITE_VARIANT, lang) + optionsSuffix + saltSuffix;

  return summaryResultBreaker.execute(
    async () => {
      lastAttemptedProvider = 'none';
      const result = await generateSummaryInternal(headlines, onProgress, geoContext, lang, options);

      if (result) {
        trackLLMUsage(result.provider, result.model, result.cached);
      } else {
        trackLLMFailure(lastAttemptedProvider);
      }

      return result;
    },
    null,
    { cacheKey, shouldCache: (result) => result !== null },
  );
}

async function generateSummaryInternal(
  headlines: string[],
  onProgress: ProgressCallback | undefined,
  geoContext: string | undefined,
  lang: string,
  options?: SummarizeOptions,
): Promise<SummarizationResult | null> {
  if (shouldSkipSummarizationRpcInDev() && options?.skipBrowserFallback) {
    return null;
  }

  if (!options?.skipCloudProviders) {
    try {
      const mode = options?.mode || 'brief';
      const cacheKey = buildSummaryCacheKey(headlines, mode, geoContext, SITE_VARIANT, lang);
      const cached = await newsClient.getSummarizeArticleCache({ cacheKey });
      if (cached.summary) {
        return { summary: cached.summary, provider: 'cache', model: cached.model || '', cached: true };
      }
    } catch { /* cache lookup failed — proceed to provider chain */ }
  }

  if (BETA_MODE) {
    const modelReady = mlWorker.isAvailable && mlWorker.isModelLoaded('summarization-beta');

    if (modelReady) {
      const totalSteps = 1 + CLOUD_PROVIDERS.length;
      // Model already loaded -- use browser T5-small first
      if (!options?.skipBrowserFallback) {
        onProgress?.(1, totalSteps, 'Running local AI model (beta)...');
        const browserResult = await tryBrowserT5(headlines, 'summarization-beta', options?.mode || 'brief');
        if (browserResult) {
          return browserResult;
        }
      }

      // Warm model failed inference -- fallback through API providers
      if (!options?.skipCloudProviders) {
        const chainResult = await runApiChain(CLOUD_PROVIDERS, headlines, geoContext, undefined, onProgress, 2, totalSteps, options?.mode || 'brief');
        if (chainResult) return chainResult;
      }
    } else {
      const totalSteps = CLOUD_PROVIDERS.length + 2;
      if (mlWorker.isAvailable && !options?.skipBrowserFallback) {
        mlWorker.loadModel('summarization-beta').catch(() => {});
      }

      // API providers while model loads
      if (!options?.skipCloudProviders) {
        const chainResult = await runApiChain(CLOUD_PROVIDERS, headlines, geoContext, undefined, onProgress, 1, totalSteps, options?.mode || 'brief');
        if (chainResult) {
          return chainResult;
        }
      }

      // Last resort: try browser T5 (may have finished loading by now)
      if (mlWorker.isAvailable && !options?.skipBrowserFallback) {
        onProgress?.(CLOUD_PROVIDERS.length + 1, totalSteps, 'Waiting for local AI model...');
        const browserResult = await tryBrowserT5(headlines, 'summarization-beta', options?.mode || 'brief');
        if (browserResult) return browserResult;
      }

      onProgress?.(totalSteps, totalSteps, 'Using fallback summary');
    }

    return buildRulesSummary(headlines, options?.mode || 'brief');
  }

  // Normal mode: API chain -> Browser T5
  const totalSteps = CLOUD_PROVIDERS.length + 1;
  let chainResult: SummarizationResult | null = null;

  if (!options?.skipCloudProviders) {
    chainResult = await runApiChain(CLOUD_PROVIDERS, headlines, geoContext, lang, onProgress, 1, totalSteps, options?.mode || 'brief');
  }
  if (chainResult) return chainResult;

  if (!options?.skipBrowserFallback) {
    onProgress?.(totalSteps, totalSteps, 'Loading local AI model...');
    const browserResult = await tryBrowserT5(headlines, undefined, options?.mode || 'brief');
    if (browserResult) return browserResult;
  }

  return buildRulesSummary(headlines, options?.mode || 'brief');
}


/**
 * Translate text using the fallback chain (via SummarizeArticle RPC with mode='translate')
 * @param text Text to translate
 * @param targetLang Target language code (e.g., 'fr', 'es')
 */
export async function translateText(
  text: string,
  targetLang: string,
  onProgress?: ProgressCallback
): Promise<string | null> {
  if (!text) return null;

  const totalSteps = CLOUD_PROVIDERS.length;
  for (const [i, providerDef] of CLOUD_PROVIDERS.entries()) {
    if (!isFeatureAvailable(providerDef.featureId)) continue;

    onProgress?.(i + 1, totalSteps, `Translating with ${providerDef.label}...`);
    try {
      const resp = await summaryBreaker.execute(async () => {
        return newsClient.summarizeArticle({
          provider: providerDef.provider,
          headlines: [text],
          mode: 'translate',
          geoContext: '',
          variant: targetLang,
          lang: '',
          systemAppend: '',
        });
      }, emptySummaryFallback);

      if (resp.fallback || resp.status === 'SUMMARIZE_STATUS_SKIPPED') continue;
      const summary = typeof resp.summary === 'string' ? resp.summary.trim() : '';
      if (summary) return summary;
    } catch (e) {
      console.warn(`${providerDef.label} translation failed`, e);
    }
  }

  return null;
}
