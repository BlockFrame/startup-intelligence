import type { NewsItem } from '@/types';
import { getSourceTier } from '@/config/feeds';
import { STARTUP_ECOSYSTEMS } from '@/config/startup-ecosystems';

export type StartupSignalKind = 'funding' | 'ipo-ma' | 'ai' | 'infra' | 'fintech' | 'cyber' | 'policy' | 'talent' | 'launch' | 'general';

export interface StartupSignalMetadata {
  score: number;
  kind: StartupSignalKind;
  label: string;
  matchedTags: string[];
  rationale: string;
  entities: StartupSignalEntities;
}

export interface StartupSignalEntities {
  companies: string[];
  investors: string[];
  geographies: string[];
  fundingStage?: string;
  fundingAmount?: string;
}

interface KeywordRule {
  kind: StartupSignalKind;
  tag: string;
  weight: number;
  terms: RegExp[];
}

const RULES: KeywordRule[] = [
  { kind: 'funding', tag: 'funding round', weight: 34, terms: [/\bseries [a-g]\b/i, /\bseed round\b/i, /\bpre-seed\b/i, /\bfunding round\b/i, /\braises?\b/i, /\braised \$?\d/i, /\bventure capital\b/i] },
  { kind: 'ipo-ma', tag: 'exit/liquidity', weight: 30, terms: [/\bipo\b/i, /\bs-1\b/i, /\bdirect listing\b/i, /\bspac\b/i, /\bacquires?\b/i, /\bacquisition\b/i, /\bmerger\b/i, /\bbuyout\b/i] },
  { kind: 'ai', tag: 'AI', weight: 24, terms: [/\bai\b/i, /\bartificial intelligence\b/i, /\bllm\b/i, /\bfoundation model\b/i, /\bagents?\b/i, /\binference\b/i, /\bgpu\b/i] },
  { kind: 'infra', tag: 'AI infrastructure', weight: 22, terms: [/\bdata centers?\b/i, /\bcloud\b/i, /\bsemiconductor\b/i, /\bchips?\b/i, /\bnvidia\b/i, /\btsmc\b/i, /\bcompute\b/i] },
  { kind: 'fintech', tag: 'fintech', weight: 20, terms: [/\bfintech\b/i, /\bpayments?\b/i, /\bneobank\b/i, /\bembedded finance\b/i, /\bstablecoin\b/i, /\btokenization\b/i] },
  { kind: 'cyber', tag: 'cybersecurity', weight: 18, terms: [/\bcybersecurity\b/i, /\bsecurity startup\b/i, /\bdata breach\b/i, /\bransomware\b/i, /\bidentity security\b/i] },
  { kind: 'policy', tag: 'policy/regulatory', weight: 16, terms: [/\bai act\b/i, /\bregulation\b/i, /\bantitrust\b/i, /\bftc\b/i, /\bsec\b/i, /\bexport controls?\b/i] },
  { kind: 'talent', tag: 'talent signal', weight: 14, terms: [/\blayoffs?\b/i, /\bhiring\b/i, /\bfounder\b/i, /\bspinout\b/i, /\bex-(google|meta|openai|anthropic|apple|amazon|microsoft)\b/i] },
  { kind: 'launch', tag: 'launch/demo', weight: 14, terms: [/\blaunch(?:es|ed)?\b/i, /\bproduct hunt\b/i, /\bdemo day\b/i, /\by combinator\b/i, /\byc\b/i] },
];

const KIND_LABELS: Record<StartupSignalKind, string> = {
  funding: 'Funding',
  'ipo-ma': 'IPO/M&A',
  ai: 'AI',
  infra: 'AI Infra',
  fintech: 'Fintech',
  cyber: 'Cyber',
  policy: 'Policy',
  talent: 'Talent',
  launch: 'Launch',
  general: 'Signal',
};

const CATEGORY_BASELINE: Record<string, number> = {
  funding: 22,
  startups: 18,
  unicorns: 18,
  ipo: 18,
  accelerators: 14,
  producthunt: 12,
  ai: 12,
  fintech: 12,
  cloud: 10,
  hardware: 10,
  security: 8,
  policy: 8,
};

const INVESTOR_HINTS = [
  'Accel',
  'Andreessen Horowitz',
  'a16z',
  'Benchmark',
  'Bessemer',
  'Coatue',
  'Founders Fund',
  'General Catalyst',
  'Greylock',
  'Index Ventures',
  'Insight Partners',
  'Khosla Ventures',
  'Lightspeed',
  'NEA',
  'Sequoia',
  'SoftBank',
  'Tiger Global',
  'Y Combinator',
];

const COMPANY_STOPWORDS = new Set([
  'AI',
  'CEO',
  'CFO',
  'CTO',
  'EU',
  'IPO',
  'M&A',
  'SEC',
  'US',
  'VC',
]);

function recencyBoost(pubDate: Date): number {
  const ageHours = Math.max(0, (Date.now() - pubDate.getTime()) / 3_600_000);
  if (ageHours <= 12) return 12;
  if (ageHours <= 48) return 8;
  if (ageHours <= 168) return 4;
  return 0;
}

function clampScore(score: number): number {
  return Math.max(0, Math.min(100, Math.round(score)));
}

function uniq(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function extractFundingStage(text: string): string | undefined {
  const match = text.match(/\b(pre-seed|seed|series [a-g]|growth|mezzanine)\b/i);
  return match?.[1]?.replace(/\b\w/g, (char) => char.toUpperCase());
}

function extractFundingAmount(text: string): string | undefined {
  const match = text.match(/(?:raises?|raised|lands?|secures?|closes?|funding|round)\s+(?:a\s+)?(\$|€|£)\s?\d+(?:\.\d+)?\s?(?:m|mn|million|b|bn|billion)\b/i)
    ?? text.match(/(\$|€|£)\s?\d+(?:\.\d+)?\s?(?:m|mn|million|b|bn|billion)\b/i);
  return match?.[0]?.replace(/^(raises?|raised|lands?|secures?|closes?|funding|round)\s+(?:a\s+)?/i, '').trim();
}

function extractGeographies(text: string): string[] {
  const geos: string[] = [];
  for (const ecosystem of STARTUP_ECOSYSTEMS) {
    const candidates = [ecosystem.city, ecosystem.country, ecosystem.name];
    if (candidates.some((candidate) => new RegExp(`\\b${candidate.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(text))) {
      geos.push(ecosystem.city || ecosystem.country);
    }
  }
  return uniq(geos).slice(0, 4);
}

function extractInvestors(text: string): string[] {
  return INVESTOR_HINTS.filter((name) => new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(text)).slice(0, 4);
}

function extractCompanies(title: string): string[] {
  const patterns = [
    /\b([A-Z][A-Za-z0-9&.-]*(?:\s+[A-Z][A-Za-z0-9&.-]*){0,3})\s+(?:raises?|raised|lands?|secures?|closes?|files|acquires?|launches?)\b/g,
    /\b(?:startup|company|firm)\s+([A-Z][A-Za-z0-9&.-]*(?:\s+[A-Z][A-Za-z0-9&.-]*){0,3})\b/g,
    /\b([A-Z][A-Za-z0-9&.-]*(?:\s+[A-Z][A-Za-z0-9&.-]*){0,3})\s+(?:valued at|valuation|hits unicorn)\b/g,
  ];
  const companies: string[] = [];
  for (const pattern of patterns) {
    for (const match of title.matchAll(pattern)) {
      const value = match[1]?.trim();
      if (!value) continue;
      const first = value.split(/\s+/)[0] ?? value;
      if (COMPANY_STOPWORDS.has(value) || COMPANY_STOPWORDS.has(first)) continue;
      companies.push(value.replace(/\s+(Inc|Ltd|LLC|Corp)\.?$/i, ''));
    }
  }
  return uniq(companies).slice(0, 4);
}

function extractEntities(item: NewsItem): StartupSignalEntities {
  const text = `${item.title} ${item.source}`;
  return {
    companies: extractCompanies(item.title),
    investors: extractInvestors(text),
    geographies: extractGeographies(text),
    fundingStage: extractFundingStage(text),
    fundingAmount: extractFundingAmount(text),
  };
}

export function scoreStartupSignal(item: NewsItem, category: string): number {
  return buildStartupSignal(item, category).score;
}

export function buildStartupSignal(item: NewsItem, category: string): StartupSignalMetadata {
  const text = `${item.title} ${item.source}`.toLowerCase();
  const matchedKinds = new Set<StartupSignalKind>();
  const matchedTags = new Set<string>();
  let score = CATEGORY_BASELINE[category] ?? 6;

  for (const rule of RULES) {
    if (rule.terms.some((term) => term.test(text))) {
      matchedKinds.add(rule.kind);
      matchedTags.add(rule.tag);
      score += rule.weight;
    }
  }

  const recency = recencyBoost(item.pubDate);
  const sourceBoost = Math.max(0, 7 - getSourceTier(item.source));
  const corroborationBoost = Math.min(10, (item.corroborationCount ?? item.storyMeta?.sourceCount ?? 0) * 2);
  score += recency;
  score += sourceBoost;
  score += corroborationBoost;
  if (matchedKinds.size >= 2) score += 8;

  const orderedKinds = [...matchedKinds].sort((a, b) => (KIND_LABELS[a] > KIND_LABELS[b] ? 1 : -1));
  const kind = orderedKinds[0] ?? 'general';
  const tags = [...matchedTags];
  if (recency > 0) tags.push('recent');
  if (sourceBoost >= 4) tags.push('source quality');
  if (corroborationBoost > 0) tags.push('multi-source');

  const rationale = tags.length > 0
    ? `Matched ${tags.slice(0, 4).join(', ')}`
    : 'Relevant startup or technology market item';
  const entities = extractEntities(item);

  return {
    score: clampScore(score),
    kind,
    label: KIND_LABELS[kind],
    matchedTags: tags,
    rationale,
    entities,
  };
}

export function enrichStartupSignals(items: NewsItem[], category: string): NewsItem[] {
  return items.map((item) => {
    const startupSignal = buildStartupSignal(item, category);
    return {
      ...item,
      startupSignal,
      importanceScore: Math.max(item.importanceScore ?? 0, startupSignal.score),
    };
  });
}
