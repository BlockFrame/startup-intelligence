import type { ArxivComponentTag, ArxivTopicTag } from '@/types/arxiv';
import type { GithubRepoType, GithubThemeTag } from '@/types/github-repos';

export type IntelligenceClusterId =
  | 'all'
  | 'agents'
  | 'memory'
  | 'rag'
  | 'conversational'
  | 'dashboards'
  | 'gateways'
  | 'security'
  | 'evaluation'
  | 'world_models';

export interface IntelligenceClusterView {
  id: IntelligenceClusterId;
  label: string;
  topicTags?: ArxivTopicTag[];
  componentTags?: ArxivComponentTag[];
  githubThemes?: GithubThemeTag[];
  githubTypes?: GithubRepoType[];
}

export const intelligenceClusterViews: IntelligenceClusterView[] = [
  { id: 'all', label: 'All' },
  {
    id: 'agents',
    label: 'Agent Frameworks',
    topicTags: ['agents', 'planning', 'tool_use'],
    componentTags: ['agent_policy'],
    githubThemes: ['agents', 'planning', 'tool_use'],
    githubTypes: ['framework'],
  },
  {
    id: 'memory',
    label: 'Memory Systems',
    topicTags: ['memory', 'knowledge_layer'],
    componentTags: ['memory_read', 'memory_write', 'memory_compression', 'memory_graph'],
    githubThemes: ['memory', 'knowledge_layer'],
  },
  {
    id: 'rag',
    label: 'RAG / Document Intelligence',
    topicTags: ['rag', 'adaptive_rag', 'graphrag', 'document_intelligence', 'knowledge_layer'],
    componentTags: ['retrieval', 'reranking', 'query_routing', 'kb_ingestion', 'entity_linking', 'multi_hop_reasoning'],
    githubThemes: ['rag', 'adaptive_rag', 'graphrag', 'document_intelligence', 'knowledge_layer'],
  },
  {
    id: 'conversational',
    label: 'Conversational Platforms',
    topicTags: ['agents', 'rag', 'tool_use'],
    componentTags: ['agent_policy', 'retrieval'],
    githubThemes: ['conversational_platform', 'agents', 'rag'],
    githubTypes: ['platform'],
  },
  {
    id: 'dashboards',
    label: 'AI Dashboards',
    topicTags: ['observability', 'evaluation'],
    componentTags: ['evaluation_harness'],
    githubThemes: ['ai_dashboard', 'observability', 'evaluation'],
    githubTypes: ['platform'],
  },
  {
    id: 'gateways',
    label: 'LLM / AI Gateways',
    topicTags: ['tool_use', 'observability'],
    componentTags: ['query_routing'],
    githubThemes: ['llm_gateway', 'observability', 'tool_use'],
    githubTypes: ['gateway'],
  },
  {
    id: 'security',
    label: 'AI Security',
    topicTags: ['ai_security'],
    githubThemes: ['ai_security'],
    githubTypes: ['security_tool'],
  },
  {
    id: 'evaluation',
    label: 'Evaluation & Benchmarks',
    topicTags: ['evaluation', 'benchmark', 'observability'],
    componentTags: ['evaluation_harness'],
    githubThemes: ['evaluation', 'benchmark', 'observability'],
  },
  {
    id: 'world_models',
    label: 'World Models',
    topicTags: ['world_models', 'planning', 'agents'],
    componentTags: ['simulator_world_model', 'agent_policy'],
    githubThemes: ['world_models', 'planning', 'agents'],
  },
];
