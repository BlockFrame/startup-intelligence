import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, test } from 'node:test';

const apiUrlSource = await readFile(
  new URL('../src/services/github-repos/api-url.ts', import.meta.url),
  'utf8',
);

describe('GitHub repository API routing', () => {
  test('keeps web requests on the current deployment origin', () => {
    assert.match(apiUrlSource, /new URL\(path, window\.location\.origin\)/);
    assert.doesNotMatch(apiUrlSource, /DEFAULT_WEB_API_URL/);
  });

  test('keeps desktop requests on the configured runtime API', () => {
    assert.match(apiUrlSource, /isDesktopRuntime\(\)/);
    assert.match(apiUrlSource, /return toApiUrl\(path\)/);
  });
});
