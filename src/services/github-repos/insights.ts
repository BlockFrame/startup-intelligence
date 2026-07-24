import type { GithubEnrichedRepo, GithubRepoLlmInsights } from '@/types/github-repos';
import { toGithubRepoApiUrl } from './api-url';

const INSIGHTS_TIMEOUT_MS = 35_000;
const MAX_REPOS = 20;

function toInsightRepo(repo: GithubEnrichedRepo): Record<string, unknown> {
  return {
    fullName: repo.fullName,
    description: repo.description.slice(0, 500),
    trendingRank: repo.trendingRank ?? null,
    stars: repo.stars,
    starsToday: repo.starsToday ?? 0,
    forks: repo.forks,
    language: repo.language,
    themes: repo.themeTags,
    types: repo.repoTypes,
    finalScore: repo.finalScore,
    signals: {
      hasMcp: repo.hasMcp,
      hasBenchmark: repo.hasBenchmark,
      hasPaper: repo.hasPaper,
      hasDocs: repo.hasDocs,
      hasDemo: repo.hasDemo,
    },
  };
}

export async function fetchGithubRepoInsights(
  repos: GithubEnrichedRepo[],
  trendingWindow: 'daily' | 'weekly',
): Promise<GithubRepoLlmInsights> {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), INSIGHTS_TIMEOUT_MS);

  try {
    const response = await fetch(toGithubRepoApiUrl('/api/github-repo-insights'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        trendingWindow,
        repos: repos
          .slice()
          .sort((a, b) => (a.trendingRank ?? 9999) - (b.trendingRank ?? 9999))
          .slice(0, MAX_REPOS)
          .map(toInsightRepo),
      }),
      signal: controller.signal,
    });

    const body = await response.json().catch(() => null) as (GithubRepoLlmInsights & { error?: string }) | null;
    if (!response.ok || !body) {
      throw new Error(body?.error || `AI insights request failed (${response.status})`);
    }
    if (!Array.isArray(body.topRepos) || typeof body.summary !== 'string') {
      throw new Error('AI insights returned an invalid response');
    }
    return body;
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('AI market analysis took too long. Please try again.');
    }
    throw error;
  } finally {
    window.clearTimeout(timeoutId);
  }
}
