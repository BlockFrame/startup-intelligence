import sourceConfig from '@/config/github-repo-sources.json';
import curatedFallback from '@/config/github-curated-fallback.json';
import type { GithubDiscoveryLane, GithubEnrichedRepo, GithubRawRepo, GithubRepoDashboardState } from '@/types/github-repos';
import { toApiUrl } from '@/services/runtime';
import { dedupeGithubRepos, enrichGithubRepo, normalizeGithubRepo } from './enricher';

const RAW_STORAGE_KEY = 'startup-github-repos-raw';
const RECORD_STORAGE_KEY = 'startup-github-repos-records';
const STORAGE_VERSION_KEY = 'startup-github-repos-version';
const STORAGE_VERSION = 'v5-cluster-discovery';

async function fetchJson<T>(path: string): Promise<T | null> {
  const response = await fetch(toApiUrl(path));
  if (!response.ok) return null;
  return response.json() as Promise<T>;
}

async function fetchWithConcurrency<T>(paths: string[], concurrency = 3): Promise<Array<T | null>> {
  const results: Array<T | null> = new Array(paths.length).fill(null);
  let next = 0;
  const workers = Array.from({ length: Math.min(concurrency, paths.length) }, async () => {
    while (next < paths.length) {
      const index = next;
      next += 1;
      const path = paths[index];
      if (!path) continue;
      try {
        results[index] = await fetchJson<T>(path);
      } catch {
        results[index] = null;
      }
    }
  });
  await Promise.all(workers);
  return results;
}

export async function fetchGithubRepoDashboardData(clusterId = 'all'): Promise<GithubRepoDashboardState> {
  const clusters = sourceConfig.clusters as Record<string, { seedRepositories?: string[]; queries?: string[] }> | undefined;
  const cluster = clusterId === 'all' ? undefined : clusters?.[clusterId];
  const seedNames = Array.from(new Set([...(sourceConfig.seedRepositories || []), ...(cluster?.seedRepositories || [])]));
  const searchQueries = Array.from(new Set([...(sourceConfig.searchQueries || []), ...(cluster?.queries || [])]));
  const seedPaths = seedNames.map((fullName) => `/api/github-repos?repo=${encodeURIComponent(fullName)}&readme=1`);
  const searchPaths = searchQueries.map((q) => `/api/github-repos?search=${encodeURIComponent(q)}&sort=stars&order=desc&per_page=24`);
  const emergingPaths = [...(sourceConfig.emergingQueries || []), ...(cluster?.queries || [])].map((q) => `/api/github-repos?search=${encodeURIComponent(q)}&sort=updated&order=desc&per_page=16`);
  const topicPaths = sourceConfig.topics.map((topic) => `/api/github-repos?search=${encodeURIComponent(`topic:${topic}`)}&sort=stars&order=desc&per_page=16`);
  const requests: Array<{ path: string; lane: GithubDiscoveryLane }> = [
    ...seedPaths.map((path) => ({ path, lane: 'curated' as const })),
    ...emergingPaths.map((path) => ({ path, lane: 'emerging' as const })),
    ...searchPaths.map((path) => ({ path, lane: 'established' as const })),
    ...topicPaths.map((path) => ({ path, lane: 'emerging' as const })),
  ];
  const payloads = await fetchWithConcurrency<{ items?: GithubRawRepo[]; repo?: GithubRawRepo }>(requests.map((request) => request.path), 2);
  const liveRepos = payloads.flatMap((payload, index) => {
    if (!payload) return [];
    const lane = requests[index]?.lane ?? 'established';
    const repos = payload.repo ? [payload.repo] : payload.items || [];
    return repos.map((repo) => ({ repo, lane, isFallback: false }));
  });
  const fallbackRepos = (curatedFallback as GithubRawRepo[]).map((repo) => ({ repo, lane: 'curated' as const, isFallback: true }));
  const rawRepos = [...liveRepos, ...fallbackRepos];
  if (rawRepos.length === 0) {
    throw new Error('GitHub rate limit or access block. Add GITHUB_TOKEN to the dev environment, then restart the server.');
  }
  const minStars = sourceConfig.discovery.minStars;
  const emergingMinStars = sourceConfig.discovery.emergingMinStars;
  const establishedMinStars = sourceConfig.discovery.establishedMinStars;
  const repos = dedupeGithubRepos(
    rawRepos
      .filter(({ repo, lane }) => {
        if (lane === 'curated') return true;
        if (lane === 'emerging') return repo.stargazers_count >= emergingMinStars;
        return repo.stargazers_count >= Math.max(minStars, establishedMinStars);
      })
      .map(({ repo, lane, isFallback }) => normalizeGithubRepo(repo, lane, Boolean(isFallback))),
  ).map(enrichGithubRepo).sort((a, b) => b.finalScore - a.finalScore);
  const state = { rawPayload: payloads, repos, fetchedAt: new Date().toISOString() };
  localStorage.setItem(RAW_STORAGE_KEY, JSON.stringify({ fetchedAt: state.fetchedAt, rawPayload: payloads }));
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
