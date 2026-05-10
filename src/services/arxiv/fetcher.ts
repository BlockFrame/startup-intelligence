import { XMLParser } from 'fast-xml-parser';
import templates from '@/config/arxiv-query-templates.json';
import type { ArxivDateWindow, ArxivPaperRecord, ArxivQueryTemplate, ArxivRawFeedSnapshot, ArxivSortBy } from '@/types/arxiv';
import { enrichArxivPapers } from './enricher';
import { toApiUrl } from '@/services/runtime';

const DEFAULT_CATEGORIES = ['cs.AI', 'cs.CL', 'cs.IR', 'cs.LG'];
const API_BASE = '/api/arxiv';
const RAW_STORAGE_KEY = 'startup-arxiv-raw-feed';
const RECORD_STORAGE_KEY = 'startup-arxiv-records';
const STORAGE_VERSION_KEY = 'startup-arxiv-version';
const STORAGE_VERSION = 'v6-hf-trending-stars';

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  textNodeName: '#text',
});

function asArray<T>(value: T | T[] | undefined): T[] {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function cleanText(value: unknown): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function normalizeArxivId(idUrl: string): { id: string; version: number } {
  const raw = idUrl.split('/abs/').pop() ?? idUrl;
  const match = raw.match(/^(.+?)v(\d+)$/);
  return {
    id: match?.[1] ?? raw,
    version: match?.[2] ? Number(match[2]) : 1,
  };
}

function dateWindowStart(window: ArxivDateWindow): string {
  const days = window === '7d' ? 7 : window === '30d' ? 30 : 90;
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString().slice(0, 10).replace(/-/g, '');
}

function buildSearchQuery(template: ArxivQueryTemplate, dateWindow: ArxivDateWindow): string {
  const categories = DEFAULT_CATEGORIES.map((category) => `cat:${category}`).join(' OR ');
  return `(${template.query}) AND (${categories}) AND submittedDate:[${dateWindowStart(dateWindow)}0000 TO 999912312359]`;
}

function sortByParam(sortBy: ArxivSortBy): string {
  if (sortBy === 'lastUpdatedDate') return 'lastUpdatedDate';
  if (sortBy === 'relevance') return 'relevance';
  return 'submittedDate';
}

export function buildArxivApiUrl(template: ArxivQueryTemplate, dateWindow: ArxivDateWindow, sortBy: ArxivSortBy, maxResults = 40): string {
  const params = new URLSearchParams({
    search_query: buildSearchQuery(template, dateWindow),
    start: '0',
    max_results: String(maxResults),
    sortBy: sortByParam(sortBy),
    sortOrder: 'descending',
  });
  return toApiUrl(`${API_BASE}?${params.toString()}`);
}

function buildArxivIdListApiUrl(ids: string[]): string {
  const params = new URLSearchParams({
    id_list: ids.join(','),
    start: '0',
    max_results: String(ids.length),
  });
  return toApiUrl(`${API_BASE}?${params.toString()}`);
}

function buildArxivUpstreamUrl(template: ArxivQueryTemplate, dateWindow: ArxivDateWindow, sortBy: ArxivSortBy, maxResults = 40): string {
  const params = new URLSearchParams({
    search_query: buildSearchQuery(template, dateWindow),
    start: '0',
    max_results: String(maxResults),
    sortBy: sortByParam(sortBy),
    sortOrder: 'descending',
  });
  return `https://export.arxiv.org/api/query?${params.toString()}`;
}

function buildArxivIdListUpstreamUrl(ids: string[]): string {
  const params = new URLSearchParams({
    id_list: ids.join(','),
    start: '0',
    max_results: String(ids.length),
  });
  return `https://export.arxiv.org/api/query?${params.toString()}`;
}

export function parseArxivAtomFeed(xml: string): ArxivPaperRecord[] {
  const parsed = parser.parse(xml) as { feed?: { entry?: unknown } };
  return asArray(parsed.feed?.entry).map((entry): ArxivPaperRecord | null => {
    const item = entry as Record<string, unknown>;
    const idUrl = cleanText(item.id);
    if (!idUrl) return null;
    const { id, version } = normalizeArxivId(idUrl);
    const links = asArray(item.link as Record<string, unknown> | Record<string, unknown>[]);
    const pdf = links.find((link) => link['@_title'] === 'pdf' || link['@_type'] === 'application/pdf');
    const authors = asArray(item.author as Record<string, unknown> | Record<string, unknown>[]).map((author) => cleanText(author.name)).filter(Boolean);
    const categories = asArray(item.category as Record<string, unknown> | Record<string, unknown>[]).map((cat) => cleanText(cat['@_term'])).filter(Boolean).sort();
    return {
      id,
      version,
      title: cleanText(item.title),
      summary: cleanText(item.summary),
      authors,
      categories,
      published: new Date(cleanText(item.published)).toISOString(),
      updated: new Date(cleanText(item.updated)).toISOString(),
      pdfUrl: cleanText(pdf?.['@_href']) || `https://arxiv.org/pdf/${id}`,
      absUrl: `https://arxiv.org/abs/${id}`,
    };
  }).filter((paper): paper is ArxivPaperRecord => Boolean(paper));
}

export function dedupeArxivRecords(records: ArxivPaperRecord[]): ArxivPaperRecord[] {
  const map = new Map<string, ArxivPaperRecord>();
  for (const record of records) {
    const previous = map.get(record.id);
    map.set(record.id, mergeArxivRecord(previous, record));
  }
  return Array.from(map.values());
}

function titleLooksLikeArxivId(value: string): boolean {
  return /^\d{4}\.\d{4,6}(?:v\d+)?$/.test(value.trim());
}

function richerText(previous: string, next: string, options: { rejectId?: boolean } = {}): string {
  const a = cleanText(previous);
  const b = cleanText(next);
  if (!a) return b;
  if (!b) return a;
  if (options.rejectId && titleLooksLikeArxivId(a) && !titleLooksLikeArxivId(b)) return b;
  if (options.rejectId && titleLooksLikeArxivId(b)) return a;
  return b.length > a.length ? b : a;
}

function newerDate(previous: string, next: string): string {
  const a = new Date(previous).getTime();
  const b = new Date(next).getTime();
  if (!Number.isFinite(a)) return next;
  if (!Number.isFinite(b)) return previous;
  return b > a ? next : previous;
}

function mergeArxivRecord(previous: ArxivPaperRecord | undefined, record: ArxivPaperRecord): ArxivPaperRecord {
  if (!previous) return record;
  const recordIsNewerVersion = (record.version || 1) > (previous.version || 1);
  return {
    ...previous,
    ...record,
    version: Math.max(previous.version || 1, record.version || 1),
    title: richerText(previous.title, record.title, { rejectId: true }),
    summary: recordIsNewerVersion ? (cleanText(record.summary) || previous.summary) : richerText(previous.summary, record.summary),
    authors: recordIsNewerVersion && record.authors.length ? record.authors : (previous.authors.length >= record.authors.length ? previous.authors : record.authors),
    categories: Array.from(new Set(recordIsNewerVersion && record.categories.length ? [...record.categories, ...previous.categories] : [...previous.categories, ...record.categories])).sort(),
    published: new Date(previous.published).getTime() <= new Date(record.published).getTime() ? previous.published : record.published,
    updated: newerDate(previous.updated, record.updated),
    pdfUrl: record.pdfUrl || previous.pdfUrl,
    absUrl: record.absUrl || previous.absUrl,
    sourceSignals: Array.from(new Set([...(previous.sourceSignals || []), ...(record.sourceSignals || [])])),
    sourceRank: Math.min(previous.sourceRank ?? Infinity, record.sourceRank ?? Infinity),
    sourceDiscussionScore: Math.max(previous.sourceDiscussionScore ?? 0, record.sourceDiscussionScore ?? 0),
    sourceGithubStars: Math.max(previous.sourceGithubStars ?? 0, record.sourceGithubStars ?? 0),
    sourceGithubRepo: record.sourceGithubRepo || previous.sourceGithubRepo,
  };
}

async function fetchJson<T>(path: string): Promise<T | null> {
  try {
    const response = await fetch(path.startsWith('http') ? path : toApiUrl(path), { signal: AbortSignal.timeout(10_000) });
    if (!response.ok) return null;
    const text = await response.text();
    if (/^\s*(import|export)\s/m.test(text)) return null;
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

function normalizeDate(value: unknown): string {
  const parsed = new Date(String(value || ''));
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : new Date().toISOString();
}

function asAuthorNames(value: unknown): string[] {
  const arr = asArray(value as unknown[]);
  return arr.map((author) => {
    if (typeof author === 'string') return author;
    if (author && typeof author === 'object') {
      const obj = author as Record<string, unknown>;
      return cleanText(obj.name || obj.fullname || obj.user || obj.id);
    }
    return '';
  }).filter(Boolean);
}

function numericValue(value: unknown): number {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function normalizeHfDailyPaper(raw: unknown, rank: number): ArxivPaperRecord | null {
  const item = raw as Record<string, unknown>;
  const paper = ((item.paper && typeof item.paper === 'object') ? item.paper : item) as Record<string, unknown>;
  const rawId = cleanText(paper.id || paper.arxivId || paper.paperId || paper.arxiv_id || item.id);
  const idMatch = rawId.match(/(\d{4}\.\d{4,6})(?:v\d+)?/);
  if (!idMatch) return null;
  const id = idMatch[1]!;
  const title = cleanText(paper.title || item.title);
  return {
    id,
    version: 1,
    title: title || id,
    summary: cleanText(paper.summary || paper.abstract || item.summary || item.description),
    authors: asAuthorNames(paper.authors || item.authors),
    categories: asArray(paper.categories as string[]).map(cleanText).filter(Boolean),
    published: normalizeDate(paper.publishedAt || paper.published || paper.submittedOnDailyAt || item.publishedAt || item.date),
    updated: normalizeDate(paper.updatedAt || paper.publishedAt || paper.submittedOnDailyAt || item.updatedAt || item.date),
    pdfUrl: cleanText(paper.pdfUrl || paper.pdf_url) || `https://arxiv.org/pdf/${id}`,
    absUrl: `https://arxiv.org/abs/${id}`,
    sourceSignals: [item.source === 'trending' ? 'Hugging Face Trending' : 'Hugging Face Papers'],
    sourceRank: rank,
    sourceDiscussionScore: Math.max(55, 96 - (rank * 2), Math.min(100, 55 + Math.log10(numericValue(paper.githubStars) + 1) * 9)),
    sourceGithubStars: numericValue(paper.githubStars),
    sourceGithubRepo: cleanText(paper.githubRepo),
  };
}

function normalizeAlphaXivPaper(raw: unknown, rank: number): ArxivPaperRecord | null {
  const item = raw as Record<string, unknown>;
  const rawId = cleanText(item.id || item.arxivId || item.paperId);
  const idMatch = rawId.match(/(\d{4}\.\d{4,6})(?:v\d+)?/);
  if (!idMatch) return null;
  const id = idMatch[1]!;
  return {
    id,
    version: 1,
    title: cleanText(item.title) || id,
    summary: cleanText(item.summary || item.description),
    authors: asAuthorNames(item.authors),
    categories: [],
    published: new Date().toISOString(),
    updated: new Date().toISOString(),
    pdfUrl: `https://arxiv.org/pdf/${id}`,
    absUrl: `https://arxiv.org/abs/${id}`,
    sourceSignals: ['AlphaXiv trending'],
    sourceRank: rank,
    sourceDiscussionScore: Math.max(55, 94 - (rank * 2)),
  };
}

async function fetchTrendingPaperRecords(limit = 50): Promise<{ records: ArxivPaperRecord[]; sources: string[] }> {
  const [hfPayload, alphaPayload] = await Promise.all([
    fetchJson<unknown>(`/api/huggingface?type=papers&source=trending&limit=${limit}`)
      .then((payload) => payload ?? fetchJson<unknown>(`https://huggingface.co/api/daily_papers?limit=${limit}`)),
    fetchJson<{ items?: unknown[] }>(`/api/alphaxiv?limit=${limit}`),
  ]);

  const hfItems = Array.isArray((hfPayload as { items?: unknown[] } | null)?.items)
    ? (hfPayload as { items: unknown[] }).items
    : Array.isArray(hfPayload) ? hfPayload as unknown[] : [];
  const alphaItems = Array.isArray(alphaPayload?.items) ? alphaPayload.items : [];

  return {
    records: [
      ...hfItems.map((item, index) => normalizeHfDailyPaper(item, index + 1)).filter((item): item is ArxivPaperRecord => Boolean(item)),
      ...alphaItems.map((item, index) => normalizeAlphaXivPaper(item, index + 1)).filter((item): item is ArxivPaperRecord => Boolean(item)),
    ],
    sources: [
      ...(hfItems.length ? ['Hugging Face Trending'] : []),
      ...(alphaItems.length ? ['AlphaXiv'] : []),
    ],
  };
}

async function fetchArxivRecordsByIds(ids: string[]): Promise<ArxivPaperRecord[]> {
  const cleanIds = Array.from(new Set(ids.filter(Boolean))).slice(0, 50);
  if (cleanIds.length === 0) return [];
  const apiUrl = buildArxivIdListApiUrl(cleanIds);
  const upstreamUrl = buildArxivIdListUpstreamUrl(cleanIds);
  try {
    const response = await fetch(apiUrl, { signal: AbortSignal.timeout(4_000) });
    const text = response.ok ? await response.text() : '';
    if (text && !/^\s*(import|export)\s/m.test(text)) return parseArxivAtomFeed(text);
    const upstream = await fetch(upstreamUrl, { signal: AbortSignal.timeout(4_000) });
    if (!upstream.ok) return [];
    return parseArxivAtomFeed(await upstream.text());
  } catch {
    return [];
  }
}

export async function fetchArxivDashboardData(options: { dateWindow: ArxivDateWindow; sortBy: ArxivSortBy; maxResults?: number }) {
  const trending = await fetchTrendingPaperRecords(options.maxResults ?? 50);
  const trendingMetadata = await fetchArxivRecordsByIds(trending.records.map((record) => record.id));
  const requestUrls = (templates as ArxivQueryTemplate[]).map((template) => buildArxivApiUrl(template, options.dateWindow, options.sortBy, options.maxResults ?? 40));
  const upstreamUrls = (templates as ArxivQueryTemplate[]).map((template) => buildArxivUpstreamUrl(template, options.dateWindow, options.sortBy, options.maxResults ?? 40));
  const feedResults = await Promise.allSettled(requestUrls.map(async (url, index) => {
    const response = await fetch(url, { signal: AbortSignal.timeout(4_000) });
    if (!response.ok) throw new Error(`arXiv request failed: ${response.status}`);
    const text = await response.text();
    if (/^\s*(import|export)\s/m.test(text)) {
      const upstream = upstreamUrls[index];
      if (!upstream) throw new Error('arXiv upstream unavailable');
      const upstreamResponse = await fetch(upstream, { signal: AbortSignal.timeout(4_000) });
      if (!upstreamResponse.ok) throw new Error(`arXiv upstream failed: ${upstreamResponse.status}`);
      return upstreamResponse.text();
    }
    return text;
  }));
  const feeds = feedResults.flatMap((result) => result.status === 'fulfilled' ? [result.value] : []);
  if (feeds.length === 0 && trending.records.length === 0) {
    throw new Error('No paper sources available');
  }
  const rawFeed: ArxivRawFeedSnapshot = { fetchedAt: new Date().toISOString(), requestUrls, feeds, trendingSources: trending.sources };
  let records = dedupeArxivRecords([...trending.records, ...trendingMetadata, ...feeds.flatMap(parseArxivAtomFeed)]);
  const metadataGaps = records
    .filter((record) => titleLooksLikeArxivId(record.title) || !record.summary || record.authors.length === 0 || record.categories.length === 0)
    .map((record) => record.id);
  if (metadataGaps.length > 0) {
    records = dedupeArxivRecords([...records, ...await fetchArxivRecordsByIds(metadataGaps)]);
  }
  const papers = enrichArxivPapers(records);
  localStorage.setItem(RAW_STORAGE_KEY, JSON.stringify(rawFeed));
  localStorage.setItem(RECORD_STORAGE_KEY, JSON.stringify(papers));
  localStorage.setItem(STORAGE_VERSION_KEY, STORAGE_VERSION);
  return { rawFeed, papers };
}

export function loadStoredArxivDashboardData() {
  try {
    if (localStorage.getItem(STORAGE_VERSION_KEY) !== STORAGE_VERSION) {
      localStorage.removeItem(RAW_STORAGE_KEY);
      localStorage.removeItem(RECORD_STORAGE_KEY);
      localStorage.setItem(STORAGE_VERSION_KEY, STORAGE_VERSION);
      return { rawFeed: null, papers: [] };
    }
    const rawFeed = JSON.parse(localStorage.getItem(RAW_STORAGE_KEY) || 'null') as ArxivRawFeedSnapshot | null;
    const papers = JSON.parse(localStorage.getItem(RECORD_STORAGE_KEY) || '[]');
    return { rawFeed, papers };
  } catch {
    return { rawFeed: null, papers: [] };
  }
}
