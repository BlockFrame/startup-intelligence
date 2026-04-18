import sourceConfig from '@/config/github-repo-sources.json';
import taxonomy from '@/config/intelligence-taxonomy.json';
import type { GithubDiscoveryLane, GithubEnrichedRepo, GithubRawRepo, GithubRepoRecord, GithubRepoType, GithubThemeTag } from '@/types/github-repos';

function daysSince(iso: string): number {
  const ms = Date.now() - new Date(iso).getTime();
  return Number.isFinite(ms) ? Math.max(0, Math.round(ms / 86_400_000)) : 9999;
}

function normalizeTopic(topic: string): string {
  return topic.toLowerCase().trim().replace(/\s+/g, '-');
}

function includesAny(text: string, terms: string[]): boolean {
  return terms.some((term) => text.includes(term.toLowerCase()));
}

function tagsFromRules<T extends string>(text: string, rules: Record<string, string[]>): T[] {
  return Object.entries(rules).filter(([, terms]) => includesAny(text, terms)).map(([tag]) => tag as T);
}

function uniq<T>(items: T[]): T[] {
  return Array.from(new Set(items));
}

export function normalizeGithubRepo(raw: GithubRawRepo, discoveryLane: GithubDiscoveryLane = 'established', isFallback = false): GithubRepoRecord {
  return {
    owner: raw.owner?.login || raw.full_name.split('/')[0] || '',
    name: raw.name,
    fullName: raw.full_name,
    description: raw.description || '',
    topics: (raw.topics || []).map(normalizeTopic).sort(),
    url: raw.html_url,
    stars: raw.stargazers_count || 0,
    forks: raw.forks_count || 0,
    watchers: raw.watchers_count || 0,
    language: raw.language || 'Unknown',
    createdAt: raw.created_at,
    updatedAt: raw.updated_at,
    pushedAt: raw.pushed_at,
    homepage: raw.homepage || '',
    license: raw.license?.spdx_id || raw.license?.name || '',
    isFallback,
    discoveryLane,
    ageDays: daysSince(raw.created_at),
    updatedDays: daysSince(raw.pushed_at || raw.updated_at),
  };
}

export function enrichGithubRepo(repo: GithubRepoRecord): GithubEnrichedRepo {
  const text = `${repo.fullName} ${repo.description} ${repo.topics.join(' ')} ${repo.homepage}`.toLowerCase();
  const readme = (repo.readmeText || '').toLowerCase();
  const combined = `${text} ${readme.slice(0, 5000)}`;
  const override = sourceConfig.curatedTagOverrides?.[repo.fullName.toLowerCase() as keyof typeof sourceConfig.curatedTagOverrides];
  const canonicalRules = Object.fromEntries(Object.entries(taxonomy.topics).filter(([, topic]) => topic.sources.includes('github')).map(([tag, topic]) => [tag, topic.aliases])) as Record<string, string[]>;
  const themeTags = uniq([...tagsFromRules<GithubThemeTag>(combined, canonicalRules), ...tagsFromRules<GithubThemeTag>(combined, sourceConfig.tagRules), ...((override?.themeTags || []) as GithubThemeTag[])]);
  const repoTypes = uniq([...tagsFromRules<GithubRepoType>(combined, sourceConfig.repoTypeRules), ...((override?.repoTypes || []) as GithubRepoType[])]);
  const hasArxivLink = /arxiv\.org\/(abs|pdf)\//i.test(combined);
  const hasPaper = hasArxivLink || /\bpaper\b|publication|citation|neurips|iclr|acl|emnlp/i.test(combined);
  const hasDocs = Boolean(override?.booleans?.hasDocs) || /\bdocs?\b|documentation|readthedocs|mkdocs|docusaurus/i.test(combined);
  const hasDemo = /\bdemo\b|playground|example app|streamlit|gradio|huggingface\.co\/spaces/i.test(combined);
  const hasMcp = Boolean(override?.booleans?.hasMcp) || /\bmcp\b|model context protocol/i.test(combined);
  const hasDataset = /\bdataset\b|corpus|huggingface\.co\/datasets/i.test(combined);
  const hasBenchmark = themeTags.includes('benchmark') || repoTypes.includes('benchmark');
  const relevanceScore = Math.min(100, themeTags.length * 12 + repoTypes.length * 8);
  const recencyScore = repo.updatedDays <= 7 ? 100 : repo.updatedDays <= 30 ? 82 : repo.updatedDays <= 90 ? 58 : repo.updatedDays <= 365 ? 30 : 10;
  const activityScore = Math.min(100, Math.log10(repo.forks + repo.watchers + 10) * 28);
  const popularityScore = Math.min(100, Math.log10(repo.stars + 10) * 24);
  const tractionBonus = repo.discoveryLane === 'emerging' && repo.stars >= sourceConfig.discovery.emergingMinStars ? 8 : repo.discoveryLane === 'curated' ? 5 : 0;
  const implementationSignalScore = Math.min(100, (hasDocs ? 18 : 0) + (hasDemo ? 16 : 0) + (hasPaper ? 16 : 0) + (hasDataset ? 14 : 0) + (hasBenchmark ? 16 : 0) + (hasMcp ? 20 : 0));
  const finalScore = Math.min(100, Math.round(relevanceScore * 0.35 + recencyScore * 0.2 + activityScore * 0.2 + popularityScore * 0.15 + implementationSignalScore * 0.1 + tractionBonus));
  return { ...repo, themeTags, repoTypes, hasPaper, hasArxivLink, hasDocs, hasDemo, hasMcp, hasDataset, hasBenchmark, relevanceScore, recencyScore, activityScore, popularityScore, implementationSignalScore, finalScore };
}

export function dedupeGithubRepos(repos: GithubRepoRecord[]): GithubRepoRecord[] {
  const map = new Map<string, GithubRepoRecord>();
  for (const repo of repos) {
    const existing = map.get(repo.fullName.toLowerCase());
    if (!existing) {
      map.set(repo.fullName.toLowerCase(), repo);
      continue;
    }
    if (existing.isFallback && !repo.isFallback) {
      map.set(repo.fullName.toLowerCase(), repo);
      continue;
    }
    if (!existing.isFallback && repo.isFallback) continue;
    if (repo.stars > existing.stars || new Date(repo.pushedAt) > new Date(existing.pushedAt)) map.set(repo.fullName.toLowerCase(), repo);
  }
  return Array.from(map.values());
}
