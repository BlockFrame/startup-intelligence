import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  normalizeGithubRepoInsightInput,
  normalizeGithubRepoInsightOutput,
} from '../api/github-repo-insights.ts';

describe('GitHub repository LLM insights contract', () => {
  test('normalizes and bounds repository inputs', () => {
    const repos = normalizeGithubRepoInsightInput([
      {
        fullName: 'openai/example',
        description: 'Agent framework',
        trendingRank: 1,
        stars: 1234,
        starsToday: 200,
        forks: 50,
        language: 'TypeScript',
        themes: ['agents', 'tool_use'],
        types: ['framework'],
        finalScore: 115,
        signals: { hasMcp: true, hasDocs: true },
      },
      { fullName: 'invalid-name' },
    ]);

    assert.equal(repos.length, 1);
    assert.equal(repos[0]?.fullName, 'openai/example');
    assert.equal(repos[0]?.finalScore, 100);
    assert.equal(repos[0]?.signals.hasMcp, true);
  });

  test('keeps only ranked repositories from the supplied Trending snapshot', () => {
    const result = normalizeGithubRepoInsightOutput({
      summary: 'Agent infrastructure is leading the current open-source momentum.',
      marketSignals: ['Tool orchestration is gaining velocity.'],
      topRepos: [
        {
          fullName: 'openai/example',
          marketPotential: 91,
          agenticPotential: 96,
          generativePotential: 80,
          confidence: 'high',
          rationale: 'Strong agent workflow leverage.',
          opportunity: 'Developer infrastructure.',
          risk: 'Crowded category.',
        },
        {
          fullName: 'acme/generator',
          marketPotential: 82,
          agenticPotential: 60,
          generativePotential: 94,
          confidence: 'medium',
          rationale: 'Clear generative workflow.',
          opportunity: 'Vertical content tooling.',
          risk: 'Low switching costs.',
        },
        {
          fullName: 'labs/evals',
          marketPotential: 76,
          agenticPotential: 74,
          generativePotential: 72,
          confidence: 'medium',
          rationale: 'Evaluation demand grows with deployment.',
          opportunity: 'Quality infrastructure.',
          risk: 'Platform bundling.',
        },
        {
          fullName: 'invented/not-present',
          marketPotential: 100,
          rationale: 'Must be discarded.',
        },
      ],
      watchlist: [{ fullName: 'labs/evals', reason: 'Could become an agent testing layer.' }],
    }, ['openai/example', 'acme/generator', 'labs/evals']);

    assert.ok(result);
    assert.deepEqual(result.topRepos.map((repo) => repo.fullName), [
      'openai/example',
      'acme/generator',
      'labs/evals',
    ]);
    assert.deepEqual(result.topRepos.map((repo) => repo.rank), [1, 2, 3]);
    assert.equal(result.watchlist[0]?.fullName, 'labs/evals');
  });
});
