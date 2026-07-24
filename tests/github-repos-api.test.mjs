import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import githubReposHandler, { parseGithubTrending } from '../api/github-repos.js';
import githubTrendingHandler from '../api/github-trending.js';

const originalFetch = globalThis.fetch;

const trendingHtml = `
  <article class="Box-row">
    <h2 class="h3 lh-condensed">
      <a href="/openai/example-repo">openai / example-repo</a>
    </h2>
    <p class="col-9 color-fg-muted my-1 pr-4">An &amp; useful repository.</p>
    <span itemprop="programmingLanguage">TypeScript</span>
    <a href="/openai/example-repo/stargazers">12,345</a>
    <a href="/openai/example-repo/forks">678</a>
    <span>321 stars today</span>
  </article>
`;

describe('GitHub Trending API', () => {
  test('parses repositories from GitHub Trending HTML', () => {
    const items = parseGithubTrending(trendingHtml);

    assert.equal(items.length, 1);
    assert.equal(items[0].full_name, 'openai/example-repo');
    assert.equal(items[0].stargazers_count, 12_345);
    assert.equal(items[0].forks_count, 678);
    assert.equal(items[0].starsToday, 321);
    assert.equal(items[0].source, 'github-trending');
  });

  test('fetches only github.com/trending and returns parsed repositories', async () => {
    const requestedUrls = [];
    try {
      globalThis.fetch = async (url) => {
        requestedUrls.push(String(url));
        return new Response(trendingHtml, { status: 200, headers: { 'Content-Type': 'text/html' } });
      };

      const response = await githubReposHandler(new Request(
        'https://startupintelligence.app/api/github-repos?trending=1&since=daily',
      ));
      const body = await response.json();

      assert.equal(response.status, 200);
      assert.deepEqual(requestedUrls, ['https://github.com/trending?since=daily']);
      assert.equal(body.items[0].full_name, 'openai/example-repo');
      assert.equal(body.source, 'github-trending-live');
      assert.equal(body.isFallback, false);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test('serves trending from the dedicated endpoint without the repository cache stack', async () => {
    const requestedUrls = [];
    try {
      globalThis.fetch = async (url) => {
        requestedUrls.push(String(url));
        return new Response(trendingHtml, { status: 200, headers: { 'Content-Type': 'text/html' } });
      };

      const response = await githubTrendingHandler(new Request(
        'https://startupintelligence.app/api/github-trending?since=daily',
      ));
      const body = await response.json();

      assert.equal(response.status, 200);
      assert.deepEqual(requestedUrls, ['https://github.com/trending?since=daily']);
      assert.equal(body.items[0].full_name, 'openai/example-repo');
      assert.equal(body.cache, 'cdn-refresh');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test('does not replace Trending with curated or search results when GitHub blocks the request', async () => {
    const requestedUrls = [];
    try {
      globalThis.fetch = async (url) => {
        requestedUrls.push(String(url));
        return new Response('Forbidden', { status: 403 });
      };

      const response = await githubReposHandler(new Request(
        'https://startupintelligence.app/api/github-repos?trending=1&since=weekly',
      ));
      const body = await response.json();

      assert.equal(response.status, 502);
      assert.deepEqual(requestedUrls, ['https://github.com/trending?since=weekly']);
      assert.equal(body.items.length, 0);
      assert.match(body.error, /HTTP 403/);
      assert.equal(body.source, 'github-trending');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
