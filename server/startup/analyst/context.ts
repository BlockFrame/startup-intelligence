import { getCachedJson } from '../../_shared/redis';
import { sanitizeForPrompt, sanitizeHeadline } from '../../_shared/llm-sanitize.js';
import { CHROME_UA } from '../../_shared/constants';
import { tokenizeForMatch, findMatchingKeywords } from '../../../src/utils/keyword-match';
import { STARTUP_ECOSYSTEMS } from '../../../src/config/startup-ecosystems';
import { TECH_COMPANIES } from '../../../src/config/tech-companies';

export type StartupAnalystDomain =
  | 'all'
  | 'vc'
  | 'startup'
  | 'ai_stack'
  | 'market'
  | 'infrastructure'
  | 'research';

export interface StartupAnalystContext {
  timestamp: string;
  relevantArticles: string;
  liveHeadlines: string;
  startupDigest: string;
  marketData: string;
  predictionMarkets: string;
  startupEcosystems: string;
  aiCompanyMap: string;
  activeSources: string[];
  degraded: boolean;
}

const DOMAIN_TOPICS: Record<StartupAnalystDomain, string> = {
  all: 'startup funding venture capital artificial intelligence developer tools enterprise software',
  vc: 'venture capital startup funding seed series a growth equity unicorn valuation',
  startup: 'startup launch founder product growth funding unicorn accelerator',
  ai_stack: 'AI agents RAG LLM gateway vector database evaluation benchmark observability open source',
  market: 'AI stocks software semiconductors cloud data centers venture capital IPO M&A',
  infrastructure: 'AI data center GPU cloud infrastructure inference chips energy compute',
  research: 'arxiv machine learning generative AI agents retrieval evaluation benchmark',
};

const DIGEST_KEY_EN = 'news:digest:v1:full:en';
const MAX_RELEVANT_ARTICLES = 10;
const MAX_KEYWORDS = 10;

const STOPWORDS = new Set([
  'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
  'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
  'should', 'may', 'might', 'can', 'who', 'what', 'where', 'when',
  'why', 'how', 'which', 'that', 'this', 'these', 'those', 'and',
  'or', 'but', 'not', 'for', 'with', 'about', 'into', 'through',
  'from', 'show', 'tell', 'give', 'explain', 'describe', 'compare',
]);

const KNOWN_SHORT_TERMS = new Set(['ai', 'vc', 'ipo', 'm&a', 'gpu', 'rag']);

interface DigestItem {
  title: string;
  source?: string;
  link?: string;
  publishedAt?: number;
  importanceScore?: number;
  startupSignal?: { score?: number; label?: string; rationale?: string };
}

function safeStr(v: unknown): string {
  return typeof v === 'string' ? v : '';
}

function safeNum(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}

function formatChange(n: number): string {
  return `${n >= 0 ? '+' : ''}${n.toFixed(2)}%`;
}

export function normalizeStartupAnalystDomain(value: unknown): StartupAnalystDomain {
  if (typeof value !== 'string') return 'all';
  const normalized = value.trim().toLowerCase().replace(/[-\s]+/g, '_');
  return ['all', 'vc', 'startup', 'ai_stack', 'market', 'infrastructure', 'research'].includes(normalized)
    ? normalized as StartupAnalystDomain
    : 'all';
}

export function extractStartupKeywords(query: string): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const raw of query.split(/[^\w&]+/)) {
    if (!raw) continue;
    const lower = raw.toLowerCase();
    if ((lower.length > 2 || KNOWN_SHORT_TERMS.has(lower)) && !STOPWORDS.has(lower) && !seen.has(lower)) {
      seen.add(lower);
      result.push(lower);
    }
  }
  return result.slice(0, MAX_KEYWORDS);
}

function flattenDigest(digest: unknown): DigestItem[] {
  if (!digest || typeof digest !== 'object') return [];
  if (Array.isArray(digest)) return digest as DigestItem[];
  const d = digest as Record<string, unknown>;

  if (d.categories && typeof d.categories === 'object') {
    const items: DigestItem[] = [];
    for (const bucket of Object.values(d.categories as Record<string, unknown>)) {
      const b = bucket as Record<string, unknown>;
      if (Array.isArray(b.items)) items.push(...(b.items as DigestItem[]));
    }
    return items;
  }

  return Array.isArray(d.items) ? d.items as DigestItem[] : [];
}

function scoreArticle(title: string, keywords: string[], item: DigestItem): number {
  const tokens = tokenizeForMatch(title);
  const matched = findMatchingKeywords(tokens, keywords);
  const signalScore = safeNum(item.startupSignal?.score);
  const importance = safeNum(item.importanceScore);
  const startupTerms = /\b(startup|founder|funding|raised|series|seed|venture|vc|unicorn|ipo|acquire|acquisition|ai|llm|agents?|rag|data center|gpu|semiconductor)\b/i.test(title)
    ? 2
    : 0;
  return matched.length * 3 + Math.log1p(signalScore) + Math.log1p(importance) + startupTerms;
}

async function searchDigestByKeywords(keywords: string[]): Promise<string> {
  let digest: unknown;
  try {
    digest = await getCachedJson(DIGEST_KEY_EN, true);
  } catch {
    return '';
  }

  const items = flattenDigest(digest);
  if (items.length === 0) return '';

  const scored = items
    .map((item) => {
      const title = safeStr(item.title);
      if (!title) return null;
      const score = scoreArticle(title, keywords, item);
      if (score <= 0) return null;
      return { item, score };
    })
    .filter((x): x is { item: DigestItem; score: number } => x !== null)
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_RELEVANT_ARTICLES);

  if (scored.length === 0) return '';

  return scored.map(({ item }) => {
    const title = sanitizeHeadline(safeStr(item.title));
    const source = safeStr(item.source).slice(0, 40);
    const signal = item.startupSignal?.score ? `VC ${Math.round(item.startupSignal.score)}` : '';
    const ts = item.publishedAt ? new Date(item.publishedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '';
    const meta = [source, signal, ts].filter(Boolean).join(', ');
    return `- ${title}${meta ? ` (${meta})` : ''}`;
  }).join('\n');
}

async function buildLiveHeadlines(domainFocus: StartupAnalystDomain, keywords: string[]): Promise<string> {
  const topic = `${DOMAIN_TOPICS[domainFocus]} ${keywords.slice(0, 4).join(' ')}`.trim();
  try {
    const url = new URL('https://api.gdeltproject.org/api/v2/doc/doc');
    url.searchParams.set('mode', 'ArtList');
    url.searchParams.set('maxrecords', '6');
    url.searchParams.set('query', topic);
    url.searchParams.set('format', 'json');
    url.searchParams.set('timespan', '12h');
    url.searchParams.set('sort', 'DateDesc');

    const res = await fetch(url.toString(), {
      headers: { 'User-Agent': CHROME_UA },
      signal: AbortSignal.timeout(2_500),
    });
    if (!res.ok) return '';

    const data = await res.json() as { articles?: Array<{ title?: string; domain?: string; seendate?: string }> };
    const lines = (data.articles ?? []).slice(0, 6).map((article) => {
      const title = sanitizeForPrompt(safeStr(article.title)) ?? '';
      const source = safeStr(article.domain).slice(0, 40);
      return title ? `- ${title}${source ? ` (${source})` : ''}` : null;
    }).filter((line): line is string => line !== null);

    return lines.length ? lines.join('\n') : '';
  } catch {
    return '';
  }
}

function buildStartupDigest(digest: unknown): string {
  const items = flattenDigest(digest)
    .filter((item) => safeStr(item.title))
    .sort((a, b) => {
      const aScore = safeNum(a.startupSignal?.score) + safeNum(a.importanceScore);
      const bScore = safeNum(b.startupSignal?.score) + safeNum(b.importanceScore);
      return bScore - aScore;
    })
    .slice(0, 10);

  if (items.length === 0) return '';
  return items.map((item) => {
    const title = sanitizeHeadline(safeStr(item.title));
    const source = safeStr(item.source).slice(0, 40);
    const label = safeStr(item.startupSignal?.label);
    const score = item.startupSignal?.score ? `VC ${Math.round(item.startupSignal.score)}` : '';
    const meta = [source, label, score].filter(Boolean).join(', ');
    return `- ${title}${meta ? ` (${meta})` : ''}`;
  }).join('\n');
}

function buildMarketData(stocks: unknown): string {
  if (!stocks || typeof stocks !== 'object') return '';
  const quotes = Array.isArray((stocks as Record<string, unknown>).quotes)
    ? (stocks as { quotes: Array<Record<string, unknown>> }).quotes
    : [];
  const watched = new Set(['NVDA', 'MSFT', 'GOOGL', 'META', 'AMZN', 'TSLA', 'AMD', 'PLTR', 'SNOW', 'DDOG', 'CRWD', 'NET']);
  const lines = quotes
    .filter((quote) => watched.has(safeStr(quote.symbol || quote.ticker).toUpperCase()))
    .slice(0, 10)
    .map((quote) => {
      const sym = safeStr(quote.symbol || quote.ticker).toUpperCase();
      const price = safeNum(quote.price ?? quote.regularMarketPrice);
      const chg = safeNum(quote.changePercent ?? quote.regularMarketChangePercent);
      return sym && price ? `${sym} $${price.toFixed(2)} (${formatChange(chg)})` : null;
    })
    .filter((line): line is string => line !== null);

  return lines.length ? lines.join(', ') : '';
}

function buildPredictionMarkets(data: unknown): string {
  if (!data || typeof data !== 'object') return '';
  const d = data as Record<string, unknown>;
  const markets = [
    ...(Array.isArray(d.tech) ? d.tech : []),
    ...(Array.isArray(d.finance) ? d.finance : []),
  ].sort((a: unknown, b: unknown) => safeNum((b as Record<string, unknown>).volume) - safeNum((a as Record<string, unknown>).volume))
    .slice(0, 8);

  const lines = markets.map((market: unknown) => {
    const m = market as Record<string, unknown>;
    const title = sanitizeHeadline(safeStr(m.title));
    const yes = safeNum(m.yesPrice);
    return title ? `- ${title}${yes ? ` (${Math.round((yes > 1 ? yes : yes * 100))}% yes)` : ''}` : null;
  }).filter((line): line is string => line !== null);

  return lines.join('\n');
}

function buildStartupEcosystems(): string {
  return STARTUP_ECOSYSTEMS
    .slice()
    .sort((a, b) => b.unicorns - a.unicorns)
    .slice(0, 8)
    .map((eco) => `- ${eco.name}: ${eco.unicorns} unicorns, ${eco.notableStartups.slice(0, 4).join(', ')}`)
    .join('\n');
}

function buildAiCompanyMap(): string {
  return TECH_COMPANIES
    .filter((company) => ['unicorn', 'public', 'faang'].includes(company.type))
    .slice(0, 12)
    .map((company) => `- ${company.company} (${company.city}, ${company.country})${company.marketCap ? ` ${company.marketCap}` : ''}`)
    .join('\n');
}

const SOURCE_LABELS: Array<[keyof Omit<StartupAnalystContext, 'timestamp' | 'activeSources' | 'degraded'>, string]> = [
  ['relevantArticles', 'Articles'],
  ['liveHeadlines', 'Live'],
  ['startupDigest', 'StartupDigest'],
  ['marketData', 'Markets'],
  ['predictionMarkets', 'Prediction'],
  ['startupEcosystems', 'Ecosystems'],
  ['aiCompanyMap', 'AICompanies'],
];

export async function assembleStartupAnalystContext(
  domainFocus: StartupAnalystDomain,
  userQuery: string,
): Promise<StartupAnalystContext> {
  const keywords = extractStartupKeywords(userQuery);
  const effectiveKeywords = keywords.length > 0 ? keywords : DOMAIN_TOPICS[domainFocus].split(/\s+/).slice(0, 8);

  const [
    digestResult,
    relevantResult,
    liveResult,
    stocksResult,
    predictionsResult,
  ] = await Promise.allSettled([
    getCachedJson(DIGEST_KEY_EN, true),
    searchDigestByKeywords(effectiveKeywords),
    buildLiveHeadlines(domainFocus, effectiveKeywords),
    getCachedJson('market:stocks-bootstrap:v1', true),
    getCachedJson('prediction:markets-bootstrap:v1', true),
  ]);

  const get = (r: PromiseSettledResult<unknown>) => r.status === 'fulfilled' ? r.value : null;
  const getStr = (r: PromiseSettledResult<unknown>) => r.status === 'fulfilled' && typeof r.value === 'string' ? r.value : '';

  const ctx: StartupAnalystContext = {
    timestamp: new Date().toUTCString(),
    relevantArticles: getStr(relevantResult),
    liveHeadlines: getStr(liveResult),
    startupDigest: buildStartupDigest(get(digestResult)),
    marketData: buildMarketData(get(stocksResult)),
    predictionMarkets: buildPredictionMarkets(get(predictionsResult)),
    startupEcosystems: buildStartupEcosystems(),
    aiCompanyMap: buildAiCompanyMap(),
    activeSources: [],
    degraded: [digestResult, stocksResult, predictionsResult].filter((r) => r.status === 'rejected' || !r.value).length >= 2,
  };

  ctx.activeSources = SOURCE_LABELS
    .filter(([field]) => Boolean(ctx[field]))
    .map(([, label]) => label);

  return ctx;
}
