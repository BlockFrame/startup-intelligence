import type { NewsItem } from '@/types';
import { generateSummary, type SummarizationResult } from '@/services/summarization';

export interface StartupInvestorBriefResult {
  brief: string;
  provider: SummarizationResult['provider'] | 'rules';
  model: string;
  cached: boolean;
}

function score(item: NewsItem): number {
  return Math.round(item.startupSignal?.score ?? item.importanceScore ?? 0);
}

function describeSignal(item: NewsItem): string {
  const signal = item.startupSignal;
  const entities = signal?.entities;
  const entityText = [
    entities?.companies?.length ? `Companies: ${entities.companies.join(', ')}` : '',
    entities?.fundingStage ? `Stage: ${entities.fundingStage}` : '',
    entities?.fundingAmount ? `Amount: ${entities.fundingAmount}` : '',
    entities?.investors?.length ? `Investors: ${entities.investors.join(', ')}` : '',
    entities?.geographies?.length ? `Geographies: ${entities.geographies.join(', ')}` : '',
  ].filter(Boolean).join('; ');
  return [
    signal?.label ?? 'Signal',
    `VC ${score(item)}`,
    signal?.rationale ?? 'Relevant startup signal',
    entityText || 'Entities: not detected',
    item.source,
    item.title,
  ].join(' | ');
}

function buildFallbackBrief(items: NewsItem[]): StartupInvestorBriefResult {
  const top = items[0];
  const kinds = new Map<string, number>();
  for (const item of items) {
    const label = item.startupSignal?.label ?? 'Signal';
    kinds.set(label, (kinds.get(label) ?? 0) + 1);
  }
  const dominant = [...kinds.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([label]) => label)
    .join(', ') || 'startup signals';

  const topLine = top
    ? `${top.startupSignal?.label ?? 'Signal'}: ${top.title}`
    : 'No high-confidence signal available yet.';

  return {
    provider: 'rules',
    model: 'startup-investor-brief-rules',
    cached: false,
    brief: [
      `Key signal: ${topLine}`,
      `Why it matters: The strongest current cluster is concentrated around ${dominant}.`,
      `Investor angle: Prioritize companies, geographies, and categories tied to the highest VC scores before broad market news.`,
      'Diligence questions: Is the signal backed by funding, customer adoption, technical moat, or only media attention? Who are the direct incumbents and likely buyers?',
      'Watch next: Follow repeat mentions, additional funding disclosures, customer references, investor syndicates, and regulatory or infrastructure constraints.',
      `Confidence: ${top && score(top) >= 75 ? 'High' : top && score(top) >= 60 ? 'Medium' : 'Early'}`,
    ].join('\n\n'),
  };
}

export async function generateStartupInvestorBrief(items: NewsItem[]): Promise<StartupInvestorBriefResult> {
  const topItems = items
    .filter((item) => score(item) > 0)
    .sort((a, b) => score(b) - score(a) || b.pubDate.getTime() - a.pubDate.getTime())
    .slice(0, 8);

  if (topItems.length < 2) return buildFallbackBrief(topItems);

  const inputs = topItems.map(describeSignal);
  const context = [
    'Startup VC investor brief v2.',
    'Return concise sections: Key signal, Why it matters, Investor angle, Diligence questions, Watch next, Confidence.',
    'Focus on investment implications, not generic news summary.',
    'Do not include geopolitical context unless the supplied signal is directly about startup/AI regulation, export controls, semiconductors, or venture markets.',
  ].join(' ');

  const result = await generateSummary(
    inputs,
    undefined,
    context,
    'en',
    { skipBrowserFallback: true },
  );

  if (!result?.summary) return buildFallbackBrief(topItems);

  return {
    brief: result.summary,
    provider: result.provider,
    model: result.model,
    cached: result.cached,
  };
}
