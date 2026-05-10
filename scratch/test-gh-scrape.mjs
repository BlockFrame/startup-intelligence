import { extractTrendingReposFromHtml } from '../api/github-repos.js';

async function test() {
  console.log('Fetching GitHub trending page...');
  const res = await fetch('https://github.com/trending', {
    headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' }
  });
  const html = await res.text();
  console.log('HTML length:', html.length);
  const repos = extractTrendingReposFromHtml(html);
  console.log('Found repos:', repos.length);
  if (repos.length > 0) {
    console.log('First repo:', repos[0].full_name);
  } else {
    console.log('No repos found. Check the regex in extractTrendingReposFromHtml.');
    // Print a bit of HTML to see what's there
    console.log('HTML snippet:', html.slice(0, 1000));
  }
}

test();
