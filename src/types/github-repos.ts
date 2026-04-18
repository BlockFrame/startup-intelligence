export type GithubThemeTag = 'agents' | 'memory' | 'rag' | 'adaptive_rag' | 'graphrag' | 'knowledge_layer' | 'document_intelligence' | 'conversational_platform' | 'ai_dashboard' | 'llm_gateway' | 'ai_security' | 'evaluation' | 'benchmark' | 'observability' | 'world_models' | 'planning' | 'tool_use';
export type GithubRepoType = 'framework' | 'platform' | 'gateway' | 'security_tool' | 'benchmark' | 'dataset' | 'awesome_list' | 'demo' | 'library' | 'reference_implementation';
export type GithubUpdatedWindow = '7d' | '30d' | '90d' | '365d' | 'any';
export type GithubPopularityBucket = 'all' | '1k' | '5k' | '10k' | '50k';
export type GithubDiscoveryLane = 'curated' | 'established' | 'emerging';

export interface GithubRawRepo {
  full_name: string;
  owner?: { login?: string };
  name: string;
  description: string | null;
  topics?: string[];
  html_url: string;
  stargazers_count: number;
  forks_count: number;
  watchers_count: number;
  language: string | null;
  created_at: string;
  updated_at: string;
  pushed_at: string;
  homepage: string | null;
  license?: { spdx_id?: string; name?: string } | null;
}

export interface GithubRepoRecord {
  owner: string;
  name: string;
  fullName: string;
  description: string;
  topics: string[];
  url: string;
  stars: number;
  forks: number;
  watchers: number;
  language: string;
  createdAt: string;
  updatedAt: string;
  pushedAt: string;
  homepage: string;
  license: string;
  readmeText?: string;
  isFallback?: boolean;
  discoveryLane: GithubDiscoveryLane;
  ageDays: number;
  updatedDays: number;
}

export interface GithubEnrichedRepo extends GithubRepoRecord {
  themeTags: GithubThemeTag[];
  repoTypes: GithubRepoType[];
  hasPaper: boolean;
  hasArxivLink: boolean;
  hasDocs: boolean;
  hasDemo: boolean;
  hasMcp: boolean;
  hasDataset: boolean;
  hasBenchmark: boolean;
  relevanceScore: number;
  recencyScore: number;
  activityScore: number;
  popularityScore: number;
  implementationSignalScore: number;
  finalScore: number;
}

export interface GithubRepoDashboardState {
  rawPayload: unknown[];
  repos: GithubEnrichedRepo[];
  fetchedAt: string;
}
