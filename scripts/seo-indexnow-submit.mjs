#!/usr/bin/env node
/**
 * Submit all startupintelligence.app URLs to IndexNow after deploy.
 * Run once after deploying the IndexNow key file:
 *   node scripts/seo-indexnow-submit.mjs
 *
 * IndexNow requires all URLs in one request to share the same host.
 * Submits separate batches per subdomain.
 */

const KEY = 'a7f3e9d1b2c44e8f9a0b1c2d3e4f5a6b';

const BATCHES = [
  {
    host: 'startupintelligence.app',
    urls: [
      'https://startupintelligence.app/',
      'https://startupintelligence.app/pro',
      'https://startupintelligence.app/blog/',
      'https://startupintelligence.app/blog/posts/what-is-startupintelligence-real-time-global-intelligence/',
      'https://startupintelligence.app/blog/posts/five-dashboards-one-platform-startup-intelligence-variants/',
      'https://startupintelligence.app/blog/posts/track-global-conflicts-in-real-time/',
      'https://startupintelligence.app/blog/posts/cyber-threat-intelligence-for-security-teams/',
      'https://startupintelligence.app/blog/posts/osint-for-everyone-open-source-intelligence-democratized/',
      'https://startupintelligence.app/blog/posts/natural-disaster-monitoring-earthquakes-fires-volcanoes/',
      'https://startupintelligence.app/blog/posts/real-time-market-intelligence-for-traders-and-analysts/',
      'https://startupintelligence.app/blog/posts/monitor-global-supply-chains-and-commodity-disruptions/',
      'https://startupintelligence.app/blog/posts/satellite-imagery-orbital-surveillance/',
      'https://startupintelligence.app/blog/posts/live-webcams-from-geopolitical-hotspots/',
      'https://startupintelligence.app/blog/posts/prediction-markets-ai-forecasting-geopolitics/',
      'https://startupintelligence.app/blog/posts/command-palette-search-everything-instantly/',
      'https://startupintelligence.app/blog/posts/startupintelligence-in-21-languages-global-intelligence-for-everyone/',
      'https://startupintelligence.app/blog/posts/ai-powered-intelligence-without-the-cloud/',
      'https://startupintelligence.app/blog/posts/build-on-startupintelligence-developer-api-open-source/',
      'https://startupintelligence.app/blog/posts/startupintelligence-vs-traditional-intelligence-tools/',
      'https://startupintelligence.app/blog/posts/tracking-global-trade-routes-chokepoints-freight-costs/',
    ],
  },
  { host: 'tech.startupintelligence.app', urls: ['https://tech.startupintelligence.app/'] },
  { host: 'finance.startupintelligence.app', urls: ['https://finance.startupintelligence.app/'] },
  { host: 'happy.startupintelligence.app', urls: ['https://happy.startupintelligence.app/'] },
];

const ENDPOINTS = [
  'https://api.indexnow.org/IndexNow',
  'https://www.bing.com/IndexNow',
  'https://searchadvisor.naver.com/indexnow',
  'https://search.seznam.cz/indexnow',
  'https://yandex.com/indexnow',
];

async function submit(endpoint, host, urlList) {
  const keyLocation = `https://${host}/${KEY}.txt`;
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({ host, key: KEY, keyLocation, urlList }),
  });
  return { endpoint, host, status: res.status, ok: res.ok };
}

for (const { host, urls } of BATCHES) {
  console.log(`\n[${host}] (${urls.length} URLs)`);
  const results = await Promise.allSettled(ENDPOINTS.map(ep => submit(ep, host, urls)));
  for (const r of results) {
    if (r.status === 'fulfilled') {
      console.log(`  ${r.value.ok ? '✓' : '✗'} ${r.value.endpoint.replace('https://', '')} → ${r.value.status}`);
    } else {
      console.log(`  ✗ error: ${r.reason}`);
    }
  }
}
