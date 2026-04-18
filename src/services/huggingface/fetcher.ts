import sourceConfig from '@/config/huggingface-sources.json';
import fallback from '@/config/huggingface-curated-fallback.json';
import type { HuggingFaceDashboardState, HuggingFaceEntityType, HuggingFaceEnrichedItem, HuggingFaceRawItem } from '@/types/huggingface';
import { toApiUrl } from '@/services/runtime';
import { dedupeHuggingFaceItems, enrichHuggingFaceItem, normalizeHuggingFaceItem } from './enricher';

const RAW_STORAGE_KEY = 'startup-huggingface-raw';
const RECORD_STORAGE_KEY = 'startup-huggingface-records';
const STORAGE_VERSION_KEY = 'startup-huggingface-version';
const STORAGE_VERSION = 'v1-hf-section';

async function fetchJson<T>(path: string): Promise<T | null> {
  try {
    const response = await fetch(toApiUrl(path));
    if (!response.ok) return null;
    return response.json() as Promise<T>;
  } catch {
    return null;
  }
}

async function fetchWithConcurrency<T>(paths: string[], concurrency = 3): Promise<Array<T | null>> {
  const results: Array<T | null> = new Array(paths.length).fill(null);
  let next = 0;
  const workers = Array.from({ length: Math.min(concurrency, paths.length) }, async () => {
    while (next < paths.length) {
      const index = next;
      next += 1;
      const path = paths[index];
      if (path) results[index] = await fetchJson<T>(path);
    }
  });
  await Promise.all(workers);
  return results;
}

function extractItems(payload: unknown): HuggingFaceRawItem[] {
  if (Array.isArray(payload)) return payload as HuggingFaceRawItem[];
  if (payload && typeof payload === 'object' && Array.isArray((payload as { items?: unknown[] }).items)) return (payload as { items: HuggingFaceRawItem[] }).items;
  return [];
}

export async function fetchHuggingFaceDashboardData(): Promise<HuggingFaceDashboardState> {
  const entityTypes = sourceConfig.entityTypes as HuggingFaceEntityType[];
  const searchPaths = entityTypes.flatMap((entityType) => sourceConfig.searchQueries.map((query) => `/api/huggingface?type=${entityType}&search=${encodeURIComponent(query)}&limit=12`));
  const curatedPaths = entityTypes.flatMap((entityType) => (sourceConfig.curatedIds[entityType] || []).map((id) => `/api/huggingface?type=${entityType}&id=${encodeURIComponent(id)}`));
  const requests = [...curatedPaths, ...searchPaths];
  const payloads = await fetchWithConcurrency<unknown>(requests, 3);
  const liveItems = payloads.flatMap((payload) => extractItems(payload));
  const fallbackItems = fallback as Array<HuggingFaceRawItem & { entityType: HuggingFaceEntityType }>;
  const normalized = dedupeHuggingFaceItems([
    ...liveItems.map((item) => normalizeHuggingFaceItem(item, ((item as HuggingFaceRawItem & { entityType?: HuggingFaceEntityType }).entityType || 'models'))),
    ...fallbackItems.map((item) => normalizeHuggingFaceItem(item, item.entityType)),
  ]);
  const items = normalized.map(enrichHuggingFaceItem).sort((a, b) => b.finalScore - a.finalScore);
  const state = { rawPayload: payloads, items, fetchedAt: new Date().toISOString() };
  localStorage.setItem(RAW_STORAGE_KEY, JSON.stringify({ fetchedAt: state.fetchedAt, rawPayload: payloads }));
  localStorage.setItem(RECORD_STORAGE_KEY, JSON.stringify(items));
  localStorage.setItem(STORAGE_VERSION_KEY, STORAGE_VERSION);
  return state;
}

export function loadStoredHuggingFaceDashboardData(): HuggingFaceDashboardState {
  try {
    if (localStorage.getItem(STORAGE_VERSION_KEY) !== STORAGE_VERSION) {
      localStorage.removeItem(RAW_STORAGE_KEY);
      localStorage.removeItem(RECORD_STORAGE_KEY);
      localStorage.setItem(STORAGE_VERSION_KEY, STORAGE_VERSION);
      return { rawPayload: [], items: [], fetchedAt: '' };
    }
    const raw = JSON.parse(localStorage.getItem(RAW_STORAGE_KEY) || 'null') as { fetchedAt?: string; rawPayload?: unknown[] } | null;
    const items = JSON.parse(localStorage.getItem(RECORD_STORAGE_KEY) || '[]') as HuggingFaceEnrichedItem[];
    return { rawPayload: raw?.rawPayload || [], items: Array.isArray(items) ? items : [], fetchedAt: raw?.fetchedAt || '' };
  } catch {
    return { rawPayload: [], items: [], fetchedAt: '' };
  }
}
