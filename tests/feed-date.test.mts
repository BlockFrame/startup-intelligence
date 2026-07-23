import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  FEED_FUTURE_SKEW_MS,
  FEED_STALE_AFTER_MS,
  getNewestFeedDate,
  isFeedCollectionStale,
  parseFeedDate,
} from '../src/services/feed-date';

const NOW = Date.parse('2026-07-23T12:00:00.000Z');

describe('feed date freshness', () => {
  it('rejects invalid and implausibly future publication dates', () => {
    assert.equal(parseFeedDate('not-a-date', NOW), null);
    assert.equal(
      parseFeedDate(new Date(NOW + FEED_FUTURE_SKEW_MS + 1).toISOString(), NOW),
      null,
    );
  });

  it('accepts a small future skew for timezone and publisher clock differences', () => {
    const value = new Date(NOW + FEED_FUTURE_SKEW_MS).toISOString();
    assert.equal(parseFeedDate(value, NOW)?.toISOString(), value);
  });

  it('finds the newest valid date without treating invalid values as current', () => {
    const newest = getNewestFeedDate([
      'invalid',
      new Date(NOW - 2 * 60 * 60 * 1000),
      new Date(NOW - 30 * 60 * 1000).toISOString(),
    ]);
    assert.equal(newest?.toISOString(), new Date(NOW - 30 * 60 * 1000).toISOString());
  });

  it('marks a collection stale only when its newest item exceeds the threshold', () => {
    assert.equal(
      isFeedCollectionStale([new Date(NOW - FEED_STALE_AFTER_MS - 1)], NOW),
      true,
    );
    assert.equal(
      isFeedCollectionStale([new Date(NOW - FEED_STALE_AFTER_MS)], NOW),
      false,
    );
    assert.equal(isFeedCollectionStale([], NOW), false);
  });
});
