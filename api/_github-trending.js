export const GITHUB_TRENDING_URL = 'https://github.com/trending';

export const GITHUB_TRENDING_HEADERS = Object.freeze({
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
});

function decodeHtml(text = '') {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

function stripTags(text = '') {
  return decodeHtml(text.replace(/<[^>]*>/g, ' '));
}

function parseCompactNumber(text = '') {
  const clean = text.replace(/,/g, '').trim().toLowerCase();
  const match = clean.match(/([\d.]+)\s*([km])?/);
  if (!match) return 0;
  const value = Number(match[1]);
  if (!Number.isFinite(value)) return 0;
  if (match[2] === 'm') return Math.round(value * 1_000_000);
  if (match[2] === 'k') return Math.round(value * 1_000);
  return Math.round(value);
}

export function parseGithubTrending(html) {
  const today = new Date().toISOString();
  return html
    .split(/<article\b/i)
    .slice(1)
    .map((chunk, index) => {
      const href = chunk.match(/<h2[\s\S]*?<a[^>]+href="\/([^"]+)"[\s\S]*?<\/a>/i)?.[1]?.replace(/\s/g, '');
      if (!href || !/^[\w.-]+\/[\w.-]+$/.test(href)) return null;
      const description = stripTags(chunk.match(/<p[^>]*>([\s\S]*?)<\/p>/i)?.[1] || '');
      const language = stripTags(chunk.match(/itemprop="programmingLanguage"[^>]*>([\s\S]*?)<\/span>/i)?.[1] || '') || null;
      const starsText = stripTags(chunk.match(/href="\/[^"]+\/stargazers"[^>]*>([\s\S]*?)<\/a>/i)?.[1] || '');
      const forksText = stripTags(chunk.match(/href="\/[^"]+\/forks"[^>]*>([\s\S]*?)<\/a>/i)?.[1] || '');
      const starsTodayText = stripTags(chunk.match(/([\d,]+)\s+stars?\s+today/i)?.[0] || '');
      const fullName = href;
      return {
        full_name: fullName,
        owner: { login: fullName.split('/')[0] },
        name: fullName.split('/')[1],
        description: description || null,
        topics: [],
        html_url: `https://github.com/${fullName}`,
        stargazers_count: parseCompactNumber(starsText),
        forks_count: parseCompactNumber(forksText),
        watchers_count: parseCompactNumber(starsText),
        language,
        created_at: today,
        updated_at: today,
        pushed_at: today,
        homepage: null,
        license: null,
        trendingRank: index + 1,
        starsToday: parseCompactNumber(starsTodayText),
        source: 'github-trending',
      };
    })
    .filter(Boolean)
    .slice(0, 25);
}
