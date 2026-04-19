import type { StartupAnalystContext, StartupAnalystDomain } from './context';

const DOMAIN_EMPHASIS: Record<StartupAnalystDomain, string> = {
  all: 'Balance startup, VC, AI stack, market, and infrastructure signals.',
  vc: 'Emphasise funding, valuation, investor relevance, deal timing, competitors, and exit implications.',
  startup: 'Emphasise company signals, founder/product momentum, category formation, and go-to-market implications.',
  ai_stack: 'Emphasise GenAI application infrastructure: agents, memory, RAG, evaluation, observability, gateways, AI security, and open-source adoption.',
  market: 'Emphasise public comps, market sentiment, rate/IPO windows, semiconductors, cloud, and AI infrastructure equities.',
  infrastructure: 'Emphasise data centers, cloud regions, GPU supply, inference cost, energy for compute, and platform reliability.',
  research: 'Emphasise arXiv/HN/research velocity, implementation readiness, benchmarks, datasets, and developer adoption signals.',
};

const DOMAIN_SECTIONS: Record<StartupAnalystDomain, Set<keyof StartupAnalystContext>> = {
  all: new Set(['relevantArticles', 'liveHeadlines', 'startupDigest', 'marketData', 'predictionMarkets', 'startupEcosystems', 'aiCompanyMap']),
  vc: new Set(['relevantArticles', 'liveHeadlines', 'startupDigest', 'marketData', 'predictionMarkets', 'startupEcosystems']),
  startup: new Set(['relevantArticles', 'liveHeadlines', 'startupDigest', 'startupEcosystems', 'aiCompanyMap']),
  ai_stack: new Set(['relevantArticles', 'liveHeadlines', 'startupDigest', 'aiCompanyMap']),
  market: new Set(['relevantArticles', 'liveHeadlines', 'marketData', 'predictionMarkets', 'startupDigest']),
  infrastructure: new Set(['relevantArticles', 'liveHeadlines', 'marketData', 'aiCompanyMap']),
  research: new Set(['relevantArticles', 'liveHeadlines', 'startupDigest', 'aiCompanyMap']),
};

export function buildStartupAnalystSystemPrompt(ctx: StartupAnalystContext, domainFocus: StartupAnalystDomain): string {
  const allowed = DOMAIN_SECTIONS[domainFocus] ?? DOMAIN_SECTIONS.all;
  const sections: string[] = [];
  const include = (field: keyof StartupAnalystContext) => allowed.has(field);

  if (ctx.relevantArticles && include('relevantArticles')) sections.push(`## Matched Startup/AI Articles\n${ctx.relevantArticles}`);
  if (ctx.liveHeadlines && include('liveHeadlines')) sections.push(`## Live Startup/AI Headlines\n${ctx.liveHeadlines}`);
  if (ctx.startupDigest && include('startupDigest')) sections.push(`## Startup Signal Digest\n${ctx.startupDigest}`);
  if (ctx.marketData && include('marketData')) sections.push(`## AI/Software Market Comps\n${ctx.marketData}`);
  if (ctx.predictionMarkets && include('predictionMarkets')) sections.push(`## Relevant Prediction Markets\n${ctx.predictionMarkets}`);
  if (ctx.startupEcosystems && include('startupEcosystems')) sections.push(`## Startup Ecosystem Baseline\n${ctx.startupEcosystems}`);
  if (ctx.aiCompanyMap && include('aiCompanyMap')) sections.push(`## AI Company Map\n${ctx.aiCompanyMap}`);

  const liveContext = sections.length > 0
    ? sections.join('\n\n')
    : '(No live startup intelligence context is available. Acknowledge the limitation and avoid claiming current facts.)';

  return `You are Startup Intelligence Analyst, a senior research partner for VC and technology investors.
Current timestamp: ${ctx.timestamp}.

Operating mode:
- Lead with the investment-relevant insight.
- Use concise structured prose under 350 words unless the user asks for depth.
- Prefer SIGNAL / THESIS / WATCH or WHY IT MATTERS / EVIDENCE / NEXT CHECK.
- Focus on startups, GenAI application infrastructure, venture markets, public comps, developer adoption, AI research, and emerging category formation.
- Treat matched articles and live headlines as the primary factual basis when available.
- Separate facts from inference. Label uncertainty clearly.
- Never invent funding amounts, dates, citations, rankings, benchmarks, or repository/model metrics not present in context.
- Do not mention model providers or internal implementation details.

Domain emphasis: ${DOMAIN_EMPHASIS[domainFocus] ?? DOMAIN_EMPHASIS.all}

--- LIVE STARTUP INTELLIGENCE CONTEXT ---
${liveContext}
--- END CONTEXT ---`;
}
