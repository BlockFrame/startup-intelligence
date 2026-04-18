export type ArxivSortBy = 'submittedDate' | 'lastUpdatedDate' | 'relevance';
export type ArxivDateWindow = '7d' | '30d' | '90d';

export type ArxivTopicTag =
  | 'agents'
  | 'memory'
  | 'rag'
  | 'adaptive_rag'
  | 'graphrag'
  | 'document_intelligence'
  | 'knowledge_layer'
  | 'evaluation'
  | 'benchmark'
  | 'observability'
  | 'world_models'
  | 'planning'
  | 'tool_use'
  | 'ai_security';

export type ArxivComponentTag =
  | 'retrieval'
  | 'reranking'
  | 'query_routing'
  | 'memory_write'
  | 'memory_read'
  | 'memory_compression'
  | 'memory_graph'
  | 'kb_ingestion'
  | 'entity_linking'
  | 'multi_hop_reasoning'
  | 'evaluation_harness'
  | 'agent_policy'
  | 'simulator_world_model';

export type ArxivContributionType = 'benchmark' | 'survey' | 'system' | 'method' | 'dataset' | 'analysis';

export interface ArxivQueryTemplate {
  id: string;
  label: string;
  query: string;
}

export interface ArxivRawFeedSnapshot {
  fetchedAt: string;
  requestUrls: string[];
  feeds: string[];
}

export interface ArxivPaperRecord {
  id: string;
  version: number;
  title: string;
  summary: string;
  authors: string[];
  categories: string[];
  published: string;
  updated: string;
  pdfUrl: string;
  absUrl: string;
}

export interface ArxivEnrichedPaper extends ArxivPaperRecord {
  topicTags: ArxivTopicTag[];
  componentTags: ArxivComponentTag[];
  contributionTypes: ArxivContributionType[];
  recencyScore: number;
  keywordScore: number;
  semanticScore: number;
  implementationScore: number;
  finalScore: number;
  hasCode: boolean;
  hasDataset: boolean;
  mentionsLatency: boolean;
  mentionsCost: boolean;
  mentionsMultiSession: boolean;
  mentionsToolUse: boolean;
}

export interface ArxivDashboardState {
  rawFeed: ArxivRawFeedSnapshot | null;
  papers: ArxivEnrichedPaper[];
}
