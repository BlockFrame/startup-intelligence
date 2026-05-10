import fs from 'fs';
import fetch from 'node-fetch';
import { extractTrendingReposFromHtml } from './api/github-repos.js';

async function run() {
  const res = await fetch('https://github.com/trending');
  const html = await res.text();
  const items = extractTrendingReposFromHtml(html);
  console.log('Parsed items:', items.length);
  if (items.length > 0) console.log(items[0]);
}
run();
