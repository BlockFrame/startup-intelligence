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
const STORAGE_VERSION = 'v2-canonical-taxonomy';

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
    if (!previous || record.version > previous.version || new Date(record.updated) > new Date(previous.updated)) {
      map.set(record.id, record);
    }
  }
  return Array.from(map.values());
}

export async function fetchArxivDashboardData(options: { dateWindow: ArxivDateWindow; sortBy: ArxivSortBy; maxResults?: number }) {
  const requestUrls = (templates as ArxivQueryTemplate[]).map((template) => buildArxivApiUrl(template, options.dateWindow, options.sortBy, options.maxResults ?? 40));
  const feeds = await Promise.all(requestUrls.map(async (url) => {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`arXiv request failed: ${response.status}`);
    return response.text();
  }));
  const rawFeed: ArxivRawFeedSnapshot = { fetchedAt: new Date().toISOString(), requestUrls, feeds };
  const papers = enrichArxivPapers(dedupeArxivRecords(feeds.flatMap(parseArxivAtomFeed)));
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
