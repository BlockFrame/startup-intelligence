export const FEED_FUTURE_SKEW_MS = 6 * 60 * 60 * 1000;
export const FEED_STALE_AFTER_MS = 24 * 60 * 60 * 1000;

export function parseFeedDateOrNow(value: string | null | undefined): Date {
  return parseFeedDate(value) ?? new Date();
}

export function parseFeedDate(
  value: string | null | undefined,
  now = Date.now(),
): Date | null {
  if (!value) return null;
  const parsed = new Date(value);
  const timestamp = parsed.getTime();
  if (!Number.isFinite(timestamp)) return null;
  if (timestamp > now + FEED_FUTURE_SKEW_MS) return null;
  return parsed;
}

export function getNewestFeedDate(
  values: Array<Date | string | null | undefined>,
): Date | null {
  let newestTimestamp = Number.NEGATIVE_INFINITY;
  for (const value of values) {
    const timestamp = value instanceof Date ? value.getTime() : value ? new Date(value).getTime() : Number.NaN;
    if (Number.isFinite(timestamp) && timestamp > newestTimestamp) {
      newestTimestamp = timestamp;
    }
  }
  return Number.isFinite(newestTimestamp) ? new Date(newestTimestamp) : null;
}

export function isFeedCollectionStale(
  values: Array<Date | string | null | undefined>,
  now = Date.now(),
  staleAfterMs = FEED_STALE_AFTER_MS,
): boolean {
  const newest = getNewestFeedDate(values);
  return newest !== null && now - newest.getTime() > staleAfterMs;
}
