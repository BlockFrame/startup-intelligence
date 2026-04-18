import type { GithubThemeTag } from './github-repos';

export type HuggingFaceEntityType = 'models' | 'datasets' | 'spaces' | 'papers' | 'collections';
export type HuggingFaceUpdatedWindow = '7d' | '30d' | '90d' | '365d' | 'any';
export type HuggingFacePopularityBucket = 'all' | '100' | '1k' | '10k';
export type HuggingFaceItemRole =
  | 'model'
  | 'embedding_model'
  | 'reranker'
  | 'dataset'
  | 'benchmark_dataset'
  | 'demo_space'
  | 'leaderboard_space'
  | 'paper'
  | 'collection';
export type HuggingFaceThemeTag = Extract<
  GithubThemeTag,
  'agents' | 'memory' | 'rag' | 'graphrag' | 'knowledge_layer' | 'evaluation' | 'benchmark' | 'observability' | 'world_models' | 'ai_security'
>;

export interface HuggingFaceRawItem {
  id?: string;
  _id?: string;
  modelId?: string;
  datasetId?: string;
  spaceId?: string;
  slug?: string;
  title?: string;
  name?: string;
  author?: string;
  owner?: string;
  url?: string;
  tags?: string[];
  likes?: number;
  downloads?: number;
  createdAt?: string;
  created_at?: string;
  lastModified?: string;
  last_modified?: string;
  updatedAt?: string;
  updated_at?: string;
  description?: string;
  summary?: string;
  cardData?: { description?: string; tags?: string[]; license?: string; pipeline_tag?: string };
  pipeline_tag?: string;
  task?: string;
}

export interface HuggingFaceRecord {
  id: string;
  title: string;
  owner: string;
  url: string;
  entityType: HuggingFaceEntityType;
  tags: string[];
  likes: number;
  downloads: number;
  createdAt: string;
  updatedAt: string;
  summary: string;
  taskType: string;
  pipelineTag: string;
  ageDays: number;
  updatedDays: number;
}

export interface HuggingFaceEnrichedItem extends HuggingFaceRecord {
  themeTags: HuggingFaceThemeTag[];
  roles: HuggingFaceItemRole[];
  hasDemo: boolean;
  hasPaper: boolean;
  hasDataset: boolean;
  hasLeaderboard: boolean;
  hasViewer: boolean;
  relevanceScore: number;
  freshnessScore: number;
  popularityScore: number;
  utilityScore: number;
  curationScore: number;
  finalScore: number;
}

export interface HuggingFaceDashboardState {
  rawPayload: unknown[];
  items: HuggingFaceEnrichedItem[];
  fetchedAt: string;
}
