import type { GithubEnrichedRepo, GithubRawRepo, GithubRepoDashboardState } from '@/types/github-repos';
import { toGithubRepoApiUrl } from './api-url';
import { dedupeGithubRepos, enrichGithubRepo, normalizeGithubRepo } from './enricher';

const RAW_STORAGE_KEY = 'startup-github-trending-raw';
const RECORD_STORAGE_KEY = 'startup-github-trending-records';
const STORAGE_VERSION_KEY = 'startup-github-trending-version';
const STORAGE_VERSION = 'v10-trending-only';
const CLIENT_REQUEST_TIMEOUT_MS = 22_000;

async function fetchJson<T>(path: string): Promise<T | null> {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), CLIENT_REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(toGithubRepoApiUrl(path), { signal: controller.signal });
    if (!response.ok) {
      try {
        const errJson = await response.json();
        if (errJson && typeof errJson === 'object') {
          const msg = (errJson as any).error || (errJson as any).message;
          if (msg) throw new Error(msg);
        }
      } catch (e) {
        if (e instanceof Error && e.message !== 'Unexpected token < in JSON at position 0') throw e;
      }
      return null;
    }
    return response.json() as Promise<T>;
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('GitHub Trending took too long to respond. Please try again.');
    }
    throw error;
  } finally {
    window.clearTimeout(timeoutId);
  }
}

export async function fetchGithubRepoDashboardData(trendingWindow: 'daily' | 'weekly' = 'daily'): Promise<GithubRepoDashboardState> {
  const payload = await fetchJson<{ items?: GithubRawRepo[]; error?: string }>(
    `/api/github-trending?since=${encodeURIComponent(trendingWindow)}`,
  );
  if (payload?.error) {
    throw new Error(`GitHub Error: ${payload.error}`);
  }
  const rawRepos = payload?.items || [];
  if (rawRepos.length === 0) {
    throw new Error('GitHub Trending returned no repositories. Please try again shortly.');
  }
  const repos = dedupeGithubRepos(
    rawRepos.map((repo) => normalizeGithubRepo(repo, 'emerging', false)),
  ).map(enrichGithubRepo).sort((a, b) => (a.trendingRank ?? 9999) - (b.trendingRank ?? 9999));
  const state = { rawPayload: [payload], repos, fetchedAt: new Date().toISOString() };
  localStorage.setItem(RAW_STORAGE_KEY, JSON.stringify({ fetchedAt: state.fetchedAt, rawPayload: state.rawPayload }));
  localStorage.setItem(RECORD_STORAGE_KEY, JSON.stringify(repos));
  localStorage.setItem(STORAGE_VERSION_KEY, STORAGE_VERSION);
  return state;
}

export function loadStoredGithubRepoDashboardData(): GithubRepoDashboardState {
  try {
    if (localStorage.getItem(STORAGE_VERSION_KEY) !== STORAGE_VERSION) {
      localStorage.removeItem(RAW_STORAGE_KEY);
      localStorage.removeItem(RECORD_STORAGE_KEY);
      localStorage.setItem(STORAGE_VERSION_KEY, STORAGE_VERSION);
      return { rawPayload: [], repos: [], fetchedAt: '' };
    }
    const raw = JSON.parse(localStorage.getItem(RAW_STORAGE_KEY) || 'null') as { fetchedAt?: string; rawPayload?: unknown[] } | null;
    const repos = JSON.parse(localStorage.getItem(RECORD_STORAGE_KEY) || '[]') as GithubEnrichedRepo[];
    return { rawPayload: raw?.rawPayload || [], repos: Array.isArray(repos) ? repos : [], fetchedAt: raw?.fetchedAt || '' };
  } catch {
    return { rawPayload: [], repos: [], fetchedAt: '' };
  }
}
