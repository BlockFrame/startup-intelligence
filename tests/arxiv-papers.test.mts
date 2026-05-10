import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { dedupeArxivRecords, parseArxivAtomFeed } from '../src/services/arxiv/fetcher.ts';
import { enrichArxivPaper } from '../src/services/arxiv/enricher.ts';

const SAMPLE_FEED = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <entry>
    <id>http://arxiv.org/abs/2401.00001v1</id>
    <updated>2026-04-10T12:00:00Z</updated>
    <published>2026-04-09T12:00:00Z</published>
    <title>Adaptive RAG Memory for Multi-Session Tool-Using Agents</title>
    <summary>We introduce a retrieval augmented generation system with query routing, memory read and memory write policies. The benchmark includes code and a dataset, and reports latency and cost.</summary>
    <author><name>Ada Lovelace</name></author>
    <author><name>Grace Hopper</name></author>
    <category term="cs.AI" />
    <category term="cs.CL" />
    <link href="http://arxiv.org/abs/2401.00001v1" rel="alternate" type="text/html" />
    <link title="pdf" href="http://arxiv.org/pdf/2401.00001v1" rel="related" type="application/pdf" />
  </entry>
  <entry>
    <id>http://arxiv.org/abs/2401.00001v2</id>
    <updated>2026-04-11T12:00:00Z</updated>
    <published>2026-04-09T12:00:00Z</published>
    <title>Adaptive RAG Memory for Multi-Session Tool-Using Agents</title>
    <summary>Updated version.</summary>
    <author><name>Ada Lovelace</name></author>
    <category term="cs.AI" />
    <link title="pdf" href="http://arxiv.org/pdf/2401.00001v2" rel="related" type="application/pdf" />
  </entry>
</feed>`;

describe('arXiv parser', () => {
  test('extracts normalized paper fields from Atom entries', () => {
    const papers = parseArxivAtomFeed(SAMPLE_FEED);
    assert.equal(papers.length, 2);
    assert.equal(papers[0].id, '2401.00001');
    assert.equal(papers[0].version, 1);
    assert.deepEqual(papers[0].authors, ['Ada Lovelace', 'Grace Hopper']);
    assert.deepEqual(papers[0].categories, ['cs.AI', 'cs.CL']);
    assert.equal(papers[0].absUrl, 'https://arxiv.org/abs/2401.00001');
    assert.equal(papers[0].pdfUrl, 'http://arxiv.org/pdf/2401.00001v1');
  });

  test('deduplicates by arXiv id and keeps latest version', () => {
    const deduped = dedupeArxivRecords(parseArxivAtomFeed(SAMPLE_FEED));
    assert.equal(deduped.length, 1);
    assert.equal(deduped[0].version, 2);
    assert.equal(deduped[0].summary, 'Updated version.');
  });
});

describe('arXiv enrichment', () => {
  test('tags GenAI application components and implementation signals', () => {
    const paper = parseArxivAtomFeed(SAMPLE_FEED)[0];
    const enriched = enrichArxivPaper(paper);
    assert(enriched.topicTags.includes('rag'));
    assert(enriched.topicTags.includes('memory'));
    assert(enriched.topicTags.includes('adaptive_rag'));
    assert(enriched.topicTags.includes('tool_use'));
    assert(enriched.componentTags.includes('retrieval'));
    assert(enriched.componentTags.includes('query_routing'));
    assert(enriched.componentTags.includes('memory_read'));
    assert(enriched.componentTags.includes('memory_write'));
    assert(enriched.hasCode);
    assert(enriched.hasDataset);
    assert(enriched.mentionsLatency);
    assert(enriched.mentionsCost);
    assert(enriched.mentionsMultiSession);
    assert(enriched.mentionsToolUse);
    assert(enriched.discussionScore > 0);
    assert(enriched.investorScore > 0);
    assert(enriched.socialSignals.includes('benchmark / leaderboard'));
    assert(enriched.finalScore >= 50);
  });
});
