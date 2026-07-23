// ========================================================================
// Constants
// ========================================================================

export const CACHE_TTL_SECONDS = 86400; // 24 hours

// ========================================================================
// Shared cache-key logic (used by both server handler and client GET lookup)
// ========================================================================

export {
  CACHE_VERSION,
  canonicalizeSummaryInputs,
  buildSummaryCacheKey,
  buildSummaryCacheKey as getCacheKey,
} from '../../../../src/utils/summary-cache-key';

// ========================================================================
// Hash utility (unified FNV-1a 52-bit -- H-7 fix)
// ========================================================================

import { hashString } from '../../../_shared/hash';
export { hashString };

// ========================================================================
// Headline deduplication (used by SummarizeArticle)
// ========================================================================

// @ts-expect-error -- plain JS module, no .d.mts needed for this pure function
export { deduplicateHeadlines } from './dedup.mjs';

// ========================================================================
// SummarizeArticle: Full prompt builder (ported from _summarize-handler.js)
// ========================================================================

export function buildArticlePrompts(
  headlines: string[],
  uniqueHeadlines: string[],
  opts: { mode: string; geoContext: string; variant: string; lang: string },
): { systemPrompt: string; userPrompt: string } {
  const headlineText = uniqueHeadlines.map((h, i) => `${i + 1}. ${h}`).join('\n');
  const intelSection = opts.geoContext ? `\n\n${opts.geoContext}` : '';
  const isTechVariant = opts.variant === 'tech' || opts.variant === 'startup';
  const dateContext = `Current date: ${new Date().toISOString().split('T')[0]}.${isTechVariant ? '' : ' Provide geopolitical context appropriate for the current date.'}`;
  const langInstruction = opts.lang && opts.lang !== 'en' ? `\nIMPORTANT: Output the summary in ${opts.lang.toUpperCase()} language.` : '';

  let systemPrompt: string;
  let userPrompt: string;

  if (opts.mode === 'vc_thesis') {
    systemPrompt = `${dateContext}

You are a venture capital research analyst preparing a concise partner-meeting thesis memo.
Use only the supplied headlines and context. Do not invent companies, metrics, funding rounds, market sizes, or dates.

Output in English with exactly four labeled lines:
Thesis: one investable theme, category shift, or explicit Weak signal.
Why now: the platform, technology, buyer behavior, regulation, distribution, or capital-market shift implied by the headlines.
Evidence: 2-3 concrete headline references compressed into one sentence.
Investor action: one practical next step for a VC, such as map comps, track founders, diligence category pull, monitor funding, or ignore.

Best-practice rules:
- Prefer non-obvious pattern recognition over generic summary.
- Separate durable thesis from one-off opinion or thought-leadership content.
- If the evidence is thin, fragmented, stale, or mostly essay/opinion, write "Weak signal" in the Thesis line and explain why.
- Never merge unrelated facts into a fake narrative.
- Keep under 120 words.
- No markdown bullets, no preamble, no meta-commentary.`;
    userPrompt = `Headlines for VC thesis review:\n${headlineText}${intelSection}`;
  } else if (opts.mode === 'brief') {
    if (isTechVariant) {
      systemPrompt = `${dateContext}

Write a compact tech/startup intelligence brief from the supplied headlines.
Output format:
Key signal: one cohesive takeaway in 1-2 sentences.
Why it matters: one sentence on startup, AI, funding, product, developer, or market relevance.
Evidence:
- synthesize one of the most relevant headlines in plain English
- synthesize another relevant headline if it supports or challenges the pattern
- synthesize a third headline only if it adds new evidence
Next step: one concrete monitoring or diligence action.

Rules:
- Do not enumerate every headline sequentially.
- Do not invent facts or merge unrelated companies into a fake narrative.
- If headlines are unrelated, synthesize only the strongest shared pattern and say evidence is mixed.
- Focus only on technology, startups, AI, funding, product launches, developer news, or tech policy.
- Ignore politics unless directly about tech regulation, AI policy, chips, cloud, or venture markets.
- Evidence bullets must be concise, not copied headline dumps.
- No preamble, no meta-commentary, under 130 words.${langInstruction}`;
    } else {
      systemPrompt = `${dateContext}

Summarize the single most important headline in 2 concise sentences MAX (under 60 words total).
Rules:
- Each numbered headline below is a SEPARATE, UNRELATED story
- Pick the ONE most significant headline and summarize ONLY that story
- NEVER combine or merge people, places, or facts from different headlines into one sentence
- Lead with WHAT happened and WHERE - be specific
- NEVER start with "Breaking news", "Good evening", "Tonight", or TV-style openings
- Start directly with the subject of the chosen headline
- If intelligence context is provided, use it only if it relates to your chosen headline
- No bullet points, no meta-commentary, no elaboration beyond the core facts${langInstruction}`;
    }
    userPrompt = `Headlines for one compact brief. Preserve uncertainty and do not fake connections:\n${headlineText}${intelSection}`;
  } else if (opts.mode === 'analysis') {
    if (isTechVariant) {
      systemPrompt = `${dateContext}

Write an insight-oriented tech/startup brief from the supplied headlines.
Output format:
Key insight: the most interesting pattern or tension.
Why it matters: why a VC, founder, or AI operator should care.
Evidence:
- synthesize one of the most relevant headlines in plain English
- synthesize another independent proof point if present
- synthesize a third headline only if it adds new evidence
Next step: what to watch or validate next.

Rules:
- Use multiple headlines when they support a real pattern.
- Do not summarize headlines sequentially.
- Do not invent facts or force unrelated stories together.
- If evidence is mixed, say so directly.
- Evidence bullets must be concise, not copied headline dumps.
- Focus on funding trends, AI developments, market shifts, product strategy, developer adoption, or tech policy.
- Under 130 words.`;
    } else {
      systemPrompt = `${dateContext}

Analyze the most significant development in 2 concise sentences MAX (under 60 words total). Be direct and specific.
Rules:
- Each numbered headline below is a SEPARATE, UNRELATED story
- Pick the ONE most significant story and analyze ONLY that
- NEVER combine or merge people, places, or facts from different headlines
- Lead with the insight - what's significant and why
- NEVER start with "Breaking news", "Tonight", "The key/dominant narrative is"
- Start with substance, no filler or elaboration
- If intelligence context is provided, use it only if it relates to your chosen headline`;
    }
    userPrompt = isTechVariant
      ? `Create one insight brief from these current panel headlines. Use multiple headlines only when they support a real pattern:\n${headlineText}${intelSection}`
      : `Each headline is a separate story. What's the key pattern or risk?\n${headlineText}${intelSection}`;
  } else if (opts.mode === 'translate') {
    const targetLang = opts.variant;
    systemPrompt = `You are a professional news translator. Translate the following news headlines/summaries into ${targetLang}.
Rules:
- Maintain the original tone and journalistic style.
- Do NOT add any conversational filler (e.g., "Here is the translation").
- Output ONLY the translated text.
- If the text is already in ${targetLang}, return it as is.`;
    userPrompt = `Translate to ${targetLang}:\n${headlines[0]}`;
  } else {
    systemPrompt = isTechVariant
      ? `${dateContext}\n\nWrite an insight-oriented tech/startup brief with labels Key insight, Why it matters, Evidence, and Next step. Evidence must be 2-4 concise bullet points that synthesize the most interesting headlines, not copied headline dumps. Use multiple headlines when they support a real pattern. Do not enumerate every headline. Do not invent facts or fake connections. Under 130 words.${langInstruction}`
      : `${dateContext}\n\nPick the most important headline and summarize it in 2 concise sentences (under 60 words). Each headline is a separate, unrelated story - NEVER merge people or facts from different headlines. Lead with substance. NEVER start with "Breaking news" or "Tonight".${langInstruction}`;
    userPrompt = `Create one insight brief from these current panel headlines. Preserve uncertainty and explain what is interesting and why:\n${headlineText}${intelSection}`;
  }

  return { systemPrompt, userPrompt };
}

// ========================================================================
// SummarizeArticle: Provider credential resolution (canonical source)
// ========================================================================

export { getProviderCredentials } from '../../../_shared/llm';
export type { ProviderCredentials } from '../../../_shared/llm';
