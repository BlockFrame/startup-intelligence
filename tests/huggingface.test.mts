import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { dedupeHuggingFaceItems, enrichHuggingFaceItem, normalizeHuggingFaceItem } from '../src/services/huggingface/enricher.ts';

const raw = {
  id: 'acme/rag-reranker-leaderboard',
  title: 'RAG Reranker Leaderboard',
  author: 'acme',
  tags: ['RAG', 'Reranker', 'Leaderboard'],
  likes: 1200,
  downloads: 100000,
  createdAt: '2025-01-01T00:00:00Z',
  lastModified: '2026-04-10T00:00:00Z',
  description: 'Embedding and reranker model benchmark for retrieval augmented generation with dataset viewer and demo.',
  pipeline_tag: 'text-ranking',
};

describe('Hugging Face normalization', () => {
  test('normalizes Hub metadata', () => {
    const item = normalizeHuggingFaceItem(raw, 'models');
    assert.equal(item.id, 'acme/rag-reranker-leaderboard');
    assert.equal(item.owner, 'acme');
    assert.equal(item.entityType, 'models');
    assert(item.tags.includes('rag'));
    assert(item.tags.includes('reranker'));
    assert.equal(item.pipelineTag, 'text-ranking');
    assert(item.updatedDays >= 0);
  });

  test('deduplicates by entity type and id', () => {
    const weak = normalizeHuggingFaceItem({ ...raw, likes: 1, downloads: 1, lastModified: '2025-01-01T00:00:00Z' }, 'models');
    const strong = normalizeHuggingFaceItem(raw, 'models');
    const deduped = dedupeHuggingFaceItems([weak, strong]);
    assert.equal(deduped.length, 1);
    assert.equal(deduped[0].likes, 1200);
  });
});

describe('Hugging Face enrichment', () => {
  test('tags themes, roles, utility signals and scores', () => {
    const enriched = enrichHuggingFaceItem(normalizeHuggingFaceItem(raw, 'models'));
    assert(enriched.themeTags.includes('rag'));
    assert(enriched.themeTags.includes('benchmark'));
    assert(enriched.roles.includes('model'));
    assert(enriched.roles.includes('reranker'));
    assert(enriched.hasDemo);
    assert(enriched.hasDataset);
    assert(enriched.hasLeaderboard);
    assert(enriched.finalScore > 0);
  });
});
