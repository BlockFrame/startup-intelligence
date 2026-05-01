import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { buildStartupActionEvents, STARTUP_VISUAL_INTENT_RE } from '../server/startup/analyst/actions.ts';
import { extractStartupKeywords, type StartupAnalystContext } from '../server/startup/analyst/context.ts';
import { buildStartupAnalystSystemPrompt } from '../server/startup/analyst/prompt.ts';
import { postProcessAnalystHtml } from '../src/utils/analyst-markdown.ts';

function emptyCtx(): StartupAnalystContext {
  return {
    timestamp: 'Mon, 01 Jan 2026 00:00:00 GMT',
    relevantArticles: '',
    liveHeadlines: '',
    startupDigest: '',
    marketData: '',
    predictionMarkets: '',
    startupEcosystems: '',
    aiCompanyMap: '',
    activeSources: [],
    degraded: false,
  };
}

function fullCtx(): StartupAnalystContext {
  return {
    timestamp: 'Mon, 01 Jan 2026 00:00:00 GMT',
    relevantArticles: '- OpenAI infrastructure startup raises seed round (TechCrunch, VC 87)',
    liveHeadlines: '- GPU cloud startup expands inference regions (example.com)',
    startupDigest: '- Agent observability company launches benchmark suite (Developer tools, VC 82)',
    marketData: 'NVDA $900.00 (+1.20%)\nMSFT $420.00 (+0.80%)',
    predictionMarkets: '- AI IPO window reopens by Q4: 44%',
    startupEcosystems: '- San Francisco: AI density 96, VC access 98',
    aiCompanyMap: '- Anthropic: frontier model lab, San Francisco',
    activeSources: ['Articles', 'Live', 'Digest', 'Markets', 'Prediction', 'Ecosystems', 'CompanyMap'],
    degraded: false,
  };
}

describe('buildStartupAnalystSystemPrompt', () => {
  it('"all" domain includes every startup intelligence section with content', () => {
    const prompt = buildStartupAnalystSystemPrompt(fullCtx(), 'all');
    assert.ok(prompt.includes('Matched Startup/AI Articles'));
    assert.ok(prompt.includes('Live Startup/AI Headlines'));
    assert.ok(prompt.includes('Startup Signal Digest'));
    assert.ok(prompt.includes('AI/Software Market Comps'));
    assert.ok(prompt.includes('Relevant Prediction Markets'));
    assert.ok(prompt.includes('Startup Ecosystem Baseline'));
    assert.ok(prompt.includes('AI Company Map'));
  });

  it('"market" domain keeps comps and predictions but excludes ecosystem/company map sections', () => {
    const prompt = buildStartupAnalystSystemPrompt(fullCtx(), 'market');
    assert.ok(prompt.includes('AI/Software Market Comps'));
    assert.ok(prompt.includes('Relevant Prediction Markets'));
    assert.ok(prompt.includes('Startup Signal Digest'));
    assert.ok(!prompt.includes('Startup Ecosystem Baseline'));
    assert.ok(!prompt.includes('AI Company Map'));
  });

  it('"infrastructure" domain keeps live context, market comps, and company map', () => {
    const prompt = buildStartupAnalystSystemPrompt(fullCtx(), 'infrastructure');
    assert.ok(prompt.includes('Live Startup/AI Headlines'));
    assert.ok(prompt.includes('AI/Software Market Comps'));
    assert.ok(prompt.includes('AI Company Map'));
    assert.ok(!prompt.includes('Relevant Prediction Markets'));
    assert.ok(!prompt.includes('Startup Ecosystem Baseline'));
  });

  it('empty context produces startup no-live-data fallback', () => {
    const prompt = buildStartupAnalystSystemPrompt(emptyCtx(), 'all');
    assert.ok(prompt.includes('No live startup intelligence context is available'));
  });

  it('unknown domain falls back to all-inclusive behavior', () => {
    const prompt = buildStartupAnalystSystemPrompt(fullCtx(), 'unknown-domain' as never);
    assert.ok(prompt.includes('Startup Ecosystem Baseline'));
    assert.ok(prompt.includes('AI Company Map'));
  });

  it('keeps investor-facing prompt guardrails', () => {
    const prompt = buildStartupAnalystSystemPrompt(fullCtx(), 'vc');
    assert.ok(prompt.includes('350 words'));
    assert.ok(prompt.includes('SIGNAL / THESIS / WATCH'));
    assert.ok(prompt.includes('Never invent funding amounts'));
    assert.ok(prompt.includes(fullCtx().timestamp));
  });
});

describe('buildStartupActionEvents', () => {
  it('returns investor widget suggestion for visual startup query', () => {
    const events = buildStartupActionEvents('build a benchmark dashboard for AI observability startups');
    assert.equal(events.length, 1);
    assert.equal(events[0]?.type, 'suggest-widget');
    assert.equal(events[0]?.label, 'Create investor widget');
    assert.equal(events[0]?.prefill, 'build a benchmark dashboard for AI observability startups');
  });

  it('returns empty for non-visual startup query', () => {
    assert.deepEqual(buildStartupActionEvents('summarize Series A trends in AI agents'), []);
  });

  it('startup visual intent regex is case-insensitive', () => {
    assert.ok(STARTUP_VISUAL_INTENT_RE.test('Scorecard AI infrastructure companies'));
    assert.ok(STARTUP_VISUAL_INTENT_RE.test('RANK developer tool startups'));
  });
});

describe('postProcessAnalystHtml', () => {
  it('converts bold ALL-CAPS paragraph to section-header div', () => {
    const out = postProcessAnalystHtml('<p><strong>SIGNAL</strong></p>');
    assert.equal(out, '<div class="chat-section-header">SIGNAL</div>');
  });

  it('does not promote mixed-case paragraphs', () => {
    const input = '<p>AI infrastructure is moving quickly.</p>';
    assert.equal(postProcessAnalystHtml(input), input);
  });
});

describe('extractStartupKeywords', () => {
  it('lowercases, keeps startup acronyms, and filters stopwords', () => {
    const kw = extractStartupKeywords('What is happening with AI VC and RAG startups');
    assert.ok(kw.includes('ai'));
    assert.ok(kw.includes('vc'));
    assert.ok(kw.includes('rag'));
    assert.ok(kw.includes('startups'));
    assert.ok(!kw.includes('what'));
    assert.ok(!kw.includes('with'));
  });

  it('deduplicates repeated words', () => {
    const kw = extractStartupKeywords('agents agents agentic agents');
    assert.equal(kw.filter((k) => k === 'agents').length, 1);
  });

  it('caps output at 10 keywords', () => {
    const kw = extractStartupKeywords('alpha bravo charlie delta echo foxtrot golf hotel india juliet kilo lima');
    assert.ok(kw.length <= 10);
  });
});
