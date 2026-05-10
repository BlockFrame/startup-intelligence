import type { ArxivComponentTag, ArxivContributionType, ArxivEnrichedPaper, ArxivPaperRecord, ArxivTopicTag } from '@/types/arxiv';
import taxonomy from '@/config/intelligence-taxonomy.json';

type Rule<T extends string> = { tag: T; patterns: RegExp[]; weight: number };

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function aliasPattern(alias: string): RegExp {
  return new RegExp(`(^|[^a-z0-9])${alias.split(/\s+/).map(escapeRegExp).join('[-\\s]?')}([^a-z0-9]|$)`, 'i');
}

const topicWeights: Partial<Record<ArxivTopicTag, number>> = {
  memory: 14,
  rag: 14,
  adaptive_rag: 16,
  graphrag: 14,
  knowledge_layer: 12,
  benchmark: 12,
  world_models: 12,
  tool_use: 12,
  evaluation: 11,
  agents: 12,
  document_intelligence: 11,
  observability: 9,
  planning: 10,
  ai_security: 10,
};

const topicRules: Rule<ArxivTopicTag>[] = Object.entries(taxonomy.topics)
  .filter(([, topic]) => topic.sources.includes('arxiv'))
  .map(([tag, topic]) => ({
    tag: tag as ArxivTopicTag,
    weight: topicWeights[tag as ArxivTopicTag] ?? 10,
    patterns: topic.aliases.map(aliasPattern),
  }));

const componentRules: Rule<ArxivComponentTag>[] = [
  { tag: 'retrieval', weight: 10, patterns: [/retrieval/i, /retriever/i] },
  { tag: 'reranking', weight: 10, patterns: [/rerank/i, /re-rank/i] },
  { tag: 'query_routing', weight: 12, patterns: [/query\s+routing/i, /router/i] },
  { tag: 'memory_write', weight: 10, patterns: [/memory\s+write/i, /write.*memory/i] },
  { tag: 'memory_read', weight: 10, patterns: [/memory\s+read/i, /retrieve.*memory/i] },
  { tag: 'memory_compression', weight: 11, patterns: [/memory\s+compression/i, /compress.*memory/i] },
  { tag: 'memory_graph', weight: 11, patterns: [/memory\s+graph/i, /graph.*memory/i] },
  { tag: 'kb_ingestion', weight: 9, patterns: [/ingestion/i, /indexing/i, /document\s+processing/i] },
  { tag: 'entity_linking', weight: 9, patterns: [/entity\s+linking/i, /entity\s+resolution/i] },
  { tag: 'multi_hop_reasoning', weight: 11, patterns: [/multi[-\s]?hop/i, /compositional\s+reasoning/i] },
  { tag: 'evaluation_harness', weight: 12, patterns: [/evaluation\s+harness/i, /test\s+harness/i, /benchmark\s+suite/i] },
  { tag: 'agent_policy', weight: 10, patterns: [/agent\s+policy/i, /policy\s+learning/i] },
  { tag: 'simulator_world_model', weight: 10, patterns: [/simulator/i, /world\s+model/i] },
];

const contributionRules: Rule<ArxivContributionType>[] = [
  { tag: 'benchmark', weight: 12, patterns: [/benchmark/i, /leaderboard/i] },
  { tag: 'survey', weight: 10, patterns: [/\bsurvey\b/i, /review/i, /taxonomy/i] },
  { tag: 'system', weight: 8, patterns: [/\bsystem\b/i, /framework/i, /platform/i] },
  { tag: 'method', weight: 7, patterns: [/\bmethod\b/i, /approach/i, /algorithm/i] },
  { tag: 'dataset', weight: 8, patterns: [/\bdataset\b/i, /\bdata set\b/i] },
  { tag: 'analysis', weight: 6, patterns: [/analysis/i, /empirical/i] },
];

function matches<T extends string>(text: string, rules: Rule<T>[]): T[] {
  return rules.filter((rule) => rule.patterns.some((pattern) => pattern.test(text))).map((rule) => rule.tag);
}

function scoreFor<T extends string>(text: string, rules: Rule<T>[]): number {
  return Math.min(100, rules.reduce((sum, rule) => sum + (rule.patterns.some((pattern) => pattern.test(text)) ? rule.weight : 0), 0));
}

function daysSince(dateIso: string): number {
  const ms = Date.now() - new Date(dateIso).getTime();
  return Number.isFinite(ms) ? Math.max(0, ms / 86_400_000) : 90;
}

function recencyScore(published: string): number {
  const days = daysSince(published);
  if (days <= 7) return 100;
  if (days <= 30) return 78;
  if (days <= 90) return 48;
  return 20;
}

function scoreKeywordPresence(text: string, patterns: RegExp[], weight: number): number {
  return patterns.some((pattern) => pattern.test(text)) ? weight : 0;
}

function buildDiscussionSignals(args: {
  text: string;
  topicTags: ArxivTopicTag[];
  contributionTypes: ArxivContributionType[];
  hasCode: boolean;
  hasDataset: boolean;
  mentionsLatency: boolean;
  mentionsCost: boolean;
  mentionsToolUse: boolean;
  mentionsMultiSession: boolean;
  recency: number;
  sourceSignals?: string[];
  sourceDiscussionScore?: number;
}): { discussionScore: number; investorScore: number; socialSignals: string[] } {
  const socialSignals: string[] = args.sourceSignals?.length ? ['external trend signal'] : [];
  let trendScore = args.sourceDiscussionScore ?? 0;
  let evidenceScore = 0;
  let investorScore = 0;

  const add = (condition: boolean, label: string, evidence: number, investor = 0) => {
    if (!condition) return;
    socialSignals.push(label);
    evidenceScore += evidence;
    investorScore += investor;
  };

  add(args.recency >= 100, 'fresh submission', 18, 8);
  add(args.recency >= 78 && args.recency < 100, 'recent paper', 12, 5);
  add(args.contributionTypes.includes('benchmark'), 'benchmark / leaderboard', 18, 14);
  add(args.contributionTypes.includes('survey'), 'survey / taxonomy', 14, 8);
  add(args.contributionTypes.includes('system'), 'system paper', 12, 12);
  add(args.hasCode, 'code mentioned', 16, 16);
  add(args.hasDataset, 'dataset mentioned', 12, 12);
  add(args.mentionsToolUse || args.topicTags.includes('agents'), 'agentic AI', 16, 15);
  add(args.topicTags.includes('evaluation'), 'evaluation signal', 14, 12);
  add(args.topicTags.includes('rag') || args.topicTags.includes('adaptive_rag') || args.topicTags.includes('graphrag'), 'RAG / knowledge systems', 12, 10);
  add(args.topicTags.includes('memory'), 'agent memory', 12, 10);
  add(args.topicTags.includes('ai_security'), 'AI safety / security', 12, 10);
  add(args.mentionsLatency, 'latency / throughput', 8, 10);
  add(args.mentionsCost, 'cost / efficiency', 8, 10);
  add(args.mentionsMultiSession, 'multi-session workflow', 8, 8);

  evidenceScore += scoreKeywordPresence(args.text, [
    /\bstate[-\s]?of[-\s]?the[-\s]?art\b/i,
    /\bSOTA\b/i,
    /\bleaderboard\b/i,
    /\bfrontier\b/i,
    /\bopen[-\s]?source\b/i,
    /\brelease\b/i,
    /\bnew benchmark\b/i,
  ], 12);

  investorScore += scoreKeywordPresence(args.text, [
    /\benterprise\b/i,
    /\bproduction\b/i,
    /\bdeployment\b/i,
    /\bworkflow\b/i,
    /\breliability\b/i,
    /\bobservability\b/i,
    /\bsecurity\b/i,
  ], 14);

  trendScore += Math.min(35, Math.round(evidenceScore * 0.45));

  return {
    discussionScore: Math.min(100, Math.round(trendScore)),
    investorScore: Math.min(100, Math.round(investorScore)),
    socialSignals: socialSignals.slice(0, 6),
  };
}

export function enrichPaperExternally<T extends ArxivEnrichedPaper>(paper: T): T {
  return paper;
}

export function enrichArxivPaper(paper: ArxivPaperRecord): ArxivEnrichedPaper {
  const text = `${paper.title}\n${paper.summary}`;
  const topicTags = matches(text, topicRules);
  const componentTags = matches(text, componentRules);
  const contributionTypes = matches(text, contributionRules);
  const keywordScore = scoreFor(text, topicRules);
  const semanticScore = scoreFor(text, componentRules);
  const hasCode = /\b(code|github|implementation|open[-\s]?source|repository)\b/i.test(text);
  const hasDataset = /\b(dataset|data set|corpus|benchmark data)\b/i.test(text);
  const mentionsLatency = /\b(latency|throughput|real[-\s]?time|speed)\b/i.test(text);
  const mentionsCost = /\b(cost|token budget|compute budget|efficient|efficiency)\b/i.test(text);
  const mentionsMultiSession = /multi[-\s]?session|long[-\s]?term|persistent/i.test(text);
  const mentionsToolUse = /tool[-\s]?use|tool[-\s]?using|function calling|api call/i.test(text);
  const implementationScore = Math.min(100, (hasCode ? 28 : 0) + (hasDataset ? 22 : 0) + (mentionsLatency ? 12 : 0) + (mentionsCost ? 12 : 0) + (mentionsToolUse ? 14 : 0));
  const recency = recencyScore(paper.published);
  const { discussionScore, investorScore, socialSignals } = buildDiscussionSignals({
    text,
    topicTags,
    contributionTypes,
    hasCode,
    hasDataset,
    mentionsLatency,
    mentionsCost,
    mentionsToolUse,
    mentionsMultiSession,
    recency,
    sourceSignals: paper.sourceSignals,
    sourceDiscussionScore: paper.sourceDiscussionScore,
  });
  const topicDepthScore = Math.min(100, keywordScore + semanticScore);
  const finalScore = Math.round(
    (discussionScore * 0.3)
    + (topicDepthScore * 0.2)
    + (implementationScore * 0.2)
    + (investorScore * 0.2)
    + (recency * 0.1),
  );

  return enrichPaperExternally({
    ...paper,
    topicTags,
    componentTags,
    contributionTypes,
    recencyScore: recency,
    keywordScore,
    semanticScore,
    implementationScore,
    discussionScore,
    investorScore,
    socialSignals,
    finalScore,
    hasCode,
    hasDataset,
    mentionsLatency,
    mentionsCost,
    mentionsMultiSession,
    mentionsToolUse,
  });
}

export function enrichArxivPapers(papers: ArxivPaperRecord[]): ArxivEnrichedPaper[] {
  return papers.map(enrichArxivPaper).sort((a, b) => {
    const aTrending = (a.sourceSignals?.length ?? 0) > 0 ? 1 : 0;
    const bTrending = (b.sourceSignals?.length ?? 0) > 0 ? 1 : 0;
    if (aTrending !== bTrending) return bTrending - aTrending;
    if (aTrending && bTrending) {
      const rankDelta = (a.sourceRank ?? 9999) - (b.sourceRank ?? 9999);
      if (rankDelta !== 0) return rankDelta;
      return b.discussionScore - a.discussionScore || b.finalScore - a.finalScore;
    }
    return b.finalScore - a.finalScore;
  });
}
