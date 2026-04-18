import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { dedupeGithubRepos, enrichGithubRepo, normalizeGithubRepo } from '../src/services/github-repos/enricher.ts';

const raw = {
  full_name: 'acme/agent-memory-rag',
  owner: { login: 'acme' },
  name: 'agent-memory-rag',
  description: 'Agent framework with long-term memory, GraphRAG, docs, benchmark dataset and MCP tools. Paper: https://arxiv.org/abs/2401.00001',
  topics: ['LLM', 'GraphRAG', 'Knowledge Graph'],
  html_url: 'https://github.com/acme/agent-memory-rag',
  stargazers_count: 4200,
  forks_count: 320,
  watchers_count: 90,
  language: 'Python',
  created_at: '2025-01-01T00:00:00Z',
  updated_at: '2026-04-10T00:00:00Z',
  pushed_at: '2026-04-12T00:00:00Z',
  homepage: 'https://docs.example.com/demo',
  license: { spdx_id: 'MIT' },
};

describe('GitHub repo normalization', () => {
  test('normalizes GitHub API metadata', () => {
    const repo = normalizeGithubRepo(raw);
    assert.equal(repo.fullName, 'acme/agent-memory-rag');
    assert.equal(repo.owner, 'acme');
    assert.equal(repo.language, 'Python');
    assert.deepEqual(repo.topics, ['graphrag', 'knowledge-graph', 'llm']);
    assert.equal(repo.license, 'MIT');
    assert(repo.ageDays >= 0);
    assert(repo.updatedDays >= 0);
  });

  test('deduplicates by full name and keeps stronger record', () => {
    const older = normalizeGithubRepo({ ...raw, stargazers_count: 10, pushed_at: '2025-01-01T00:00:00Z' });
    const newer = normalizeGithubRepo(raw);
    const deduped = dedupeGithubRepos([older, newer]);
    assert.equal(deduped.length, 1);
    assert.equal(deduped[0].stars, 4200);
  });
});

describe('GitHub repo enrichment', () => {
  test('tags themes, repo type, booleans and scores', () => {
    const enriched = enrichGithubRepo(normalizeGithubRepo(raw));
    assert(enriched.themeTags.includes('agents'));
    assert(enriched.themeTags.includes('memory'));
    assert(enriched.themeTags.includes('graphrag'));
    assert(enriched.themeTags.includes('knowledge_layer'));
    assert(enriched.themeTags.includes('benchmark'));
    assert(enriched.repoTypes.includes('framework'));
    assert(enriched.hasPaper);
    assert(enriched.hasArxivLink);
    assert(enriched.hasDocs);
    assert(enriched.hasDemo);
    assert(enriched.hasMcp);
    assert(enriched.hasDataset);
    assert(enriched.hasBenchmark);
    assert(enriched.finalScore > 0);
  });

  test('applies curated overrides for known strategic repositories', () => {
    const openclaw = enrichGithubRepo(normalizeGithubRepo({
      ...raw,
      full_name: 'openclaw/openclaw',
      owner: { login: 'openclaw' },
      name: 'openclaw',
      description: 'OpenClaw',
      topics: [],
      html_url: 'https://github.com/openclaw/openclaw',
      homepage: '',
    }));

    assert(openclaw.themeTags.includes('agents'));
    assert(openclaw.themeTags.includes('memory'));
    assert(openclaw.repoTypes.includes('framework'));
    assert(openclaw.hasDocs);
    assert(openclaw.hasMcp);
  });

  test('tags PageIndex as document intelligence and reasoning RAG', () => {
    const pageIndex = enrichGithubRepo(normalizeGithubRepo({
      ...raw,
      full_name: 'VectifyAI/PageIndex',
      owner: { login: 'VectifyAI' },
      name: 'PageIndex',
      description: 'Document Index for vectorless, reasoning-based RAG',
      topics: ['document-ai', 'retrieval', 'mcp'],
      html_url: 'https://github.com/VectifyAI/PageIndex',
      homepage: 'https://pageindex.ai/',
    }));

    assert(pageIndex.themeTags.includes('rag'));
    assert(pageIndex.themeTags.includes('document_intelligence'));
    assert(pageIndex.themeTags.includes('knowledge_layer'));
    assert(pageIndex.hasMcp);
  });
});
