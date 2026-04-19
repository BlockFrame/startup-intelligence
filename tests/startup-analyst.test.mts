import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { buildStartupActionEvents, STARTUP_VISUAL_INTENT_RE } from '../server/startup/analyst/actions.ts';
import { extractStartupKeywords, normalizeStartupAnalystDomain, type StartupAnalystContext } from '../server/startup/analyst/context.ts';
import { buildStartupAnalystSystemPrompt } from '../server/startup/analyst/prompt.ts';

function ctx(): StartupAnalystContext {
  return {
    timestamp: 'Mon, 20 Apr 2026 00:00:00 GMT',
    relevantArticles: '- Open-source agent framework raises funding (TechCrunch, VC 88)',
    liveHeadlines: '- GPU cloud startup expands inference region (example.com)',
    startupDigest: '- AI observability platform launches benchmark suite (VC 74)',
    marketData: 'NVDA $900.00 (+1.20%), MSFT $420.00 (-0.30%)',
    predictionMarkets: '- AI IPO window improves (62% yes)',
    startupEcosystems: '- San Francisco Bay Area: 420 unicorns, OpenAI, Anthropic',
    aiCompanyMap: '- OpenAI (San Francisco, USA)',
    activeSources: ['Articles', 'Live', 'StartupDigest'],
    degraded: false,
  };
}

describe('startup analyst domain model', () => {
  it('normalizes only startup intelligence domains', () => {
    assert.equal(normalizeStartupAnalystDomain('ai-stack'), 'ai_stack');
    assert.equal(normalizeStartupAnalystDomain('military'), 'all');
    assert.equal(normalizeStartupAnalystDomain('geo'), 'all');
  });

  it('extracts startup-relevant short tokens', () => {
    assert.deepEqual(
      extractStartupKeywords('Compare AI agents, RAG and VC funding signals'),
      ['compare', 'ai', 'agents', 'rag', 'vc', 'funding', 'signals'].filter((v) => v !== 'compare'),
    );
  });
});

describe('buildStartupAnalystSystemPrompt', () => {
  it('uses investor-facing framing and excludes geopolitical operating modes', () => {
    const prompt = buildStartupAnalystSystemPrompt(ctx(), 'vc');
    assert.ok(prompt.includes('Startup Intelligence Analyst'));
    assert.ok(prompt.includes('VC'));
    assert.ok(prompt.includes('SIGNAL / THESIS / WATCH'));
    assert.ok(!prompt.includes('geopolitical'));
    assert.ok(!prompt.includes('military operations'));
  });

  it('filters market domain toward market context', () => {
    const prompt = buildStartupAnalystSystemPrompt(ctx(), 'market');
    assert.ok(prompt.includes('AI/Software Market Comps'));
    assert.ok(prompt.includes('Relevant Prediction Markets'));
    assert.ok(!prompt.includes('Startup Ecosystem Baseline'));
  });
});

describe('startup analyst action events', () => {
  it('detects dashboard/widget intents', () => {
    assert.match('build a dashboard for agent memory repos', STARTUP_VISUAL_INTENT_RE);
    assert.equal(buildStartupActionEvents('rank the best AI gateway repos').length, 1);
  });

  it('does not emit actions for plain questions', () => {
    assert.equal(buildStartupActionEvents('what matters today for AI infrastructure?').length, 0);
  });
});
