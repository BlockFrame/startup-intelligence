# Startup Intelligence — Vercel/Render Deployment Action Plan

Last updated: 2026-05-16

## Current Situation

The app has been deployed to Vercel and Redis/Upstash has been configured.
Render relay is not configured yet, so some live/relay-backed capabilities can be incomplete or fail silently.

Local app now runs in the correct startup variant:

```bash
npm run dev:startup -- --host 127.0.0.1 --port 3007
```

Local URL:

```text
http://127.0.0.1:3007/
```

## Verified Locally

- `npm run typecheck` passes.
- `npm run build:startup` passes.
- arXiv, GitHub, MCP, and chat analyst tests pass.
- VC Startup page loads in startup mode.
- GitHub page has `Master repos` and `Trending repos` tabs.
- `/api/github-repos?trending=1` works locally.
- `/api/rss-proxy` works for normal RSS sources.

## Immediate Fix Already Applied

Local `.env` had:

```text
VITE_VARIANT=tech
```

This caused the local app to run the wrong variant. It must be:

```text
VITE_VARIANT=startup
```

`.env.example` has also been updated to use:

```text
VITE_VARIANT=startup
```

## Important Security Note

Local `.env` contains real secrets.

Do not commit `.env`.

If any secret has been committed, pasted in logs, or exposed in a public deployment trace, rotate it immediately:

- Upstash Redis token
- OpenRouter key
- GitHub token
- Clerk keys
- Convex secrets
- Relay shared secret
- Billing/payment secrets

## Vercel Environment Variables

Set these in Vercel project settings.

### Required Core

```text
VITE_VARIANT=startup
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=
```

### LLM / Analyst

Configure at least one working provider.

```text
OPENROUTER_API_KEY=
OPENROUTER_MODEL=openrouter/free
OPENAI_API_KEY=
OPENAI_MODEL=gpt-4o-mini
ANTHROPIC_API_KEY=
ANTHROPIC_MODEL=claude-3-5-sonnet-latest
MISTRAL_API_KEY=
MISTRAL_MODEL=mistral-small-latest
HUGGINGFACE_API_KEY=
HUGGINGFACE_MODEL=
```

### Research / AI Stack

```text
GITHUB_TOKEN=
HUGGINGFACE_TOKEN=
PRODUCT_HUNT_TOKEN=
```

### Relay / Render

These stay empty until Render relay is deployed.

```text
WS_RELAY_URL=
VITE_WS_RELAY_URL=
RELAY_SHARED_SECRET=
RELAY_AUTH_HEADER=x-relay-key
ALLOW_UNAUTHENTICATED_RELAY=false
```

### Auth / Billing

Only configure if auth and paid features are active.

```text
VITE_CLERK_PUBLISHABLE_KEY=
CLERK_SECRET_KEY=
CLERK_JWT_ISSUER_DOMAIN=
CONVEX_URL=
CONVEX_SITE_URL=
VITE_CONVEX_URL=
RELAY_SHARED_SECRET=
DODO_API_KEY=
DODO_WEBHOOK_SECRET=
DODO_PAYMENTS_WEBHOOK_SECRET=
DODO_IDENTITY_SIGNING_SECRET=
DODO_BUSINESS_ID=
VITE_DODO_ENVIRONMENT=test_mode
```

## Render Relay Setup

Render is needed for relay-backed capabilities:

- Telegram feed
- relay-only RSS domains
- notification relay
- optional streaming/live services
- market data jobs that were designed to run outside Vercel

### Render Deployment Steps

1. Create Render Web Service from the repository.
2. Use the relay/server entrypoint defined by the project deployment config.
3. Add required environment variables:

```text
WS_RELAY_URL=
RELAY_SHARED_SECRET=
RELAY_AUTH_HEADER=x-relay-key
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=
TELEGRAM_API_ID=
TELEGRAM_API_HASH=
TELEGRAM_SESSION=
TELEGRAM_CHANNEL_SET=tech
```

4. After Render is live, set these in Vercel:

```text
WS_RELAY_URL=https://<render-service-url>
VITE_WS_RELAY_URL=https://<render-service-url>
RELAY_SHARED_SECRET=<same-secret-as-render>
```

5. Redeploy Vercel.

## DNS / External Domains

Current local smoke found DNS failures for:

```text
analytics.startupintelligence.app
maps.startupintelligence.app
```

Action:

- Configure DNS records for these domains, or
- Disable the related fetches/scripts until the domains exist.

These failures do not block the core dashboard, but they create noisy console errors and can confuse QA.

## CORS Checklist

Current CORS allows:

```text
https://startupintelligence.app
https://*.startupintelligence.app
https://startup-intelligence-*.vercel.app
https://startupintelligence-*.vercel.app
localhost / 127.0.0.1 in non-production
```

Files to keep aligned:

- `api/_cors.js`
- `server/cors.ts`

If Vercel preview URL has a different pattern, add it to both files.

## Post-Deploy Smoke Test

Run this after every deploy.

### Startup Shell

- Open deployed URL.
- Confirm tabs:
  - `VC Startup`
  - `arXiv Papers`
  - `GitHub Repo`
- Hugging Face tab should remain hidden for MVP if intentionally disabled.

### VC Startup

Check these cards:

- Investment Brief loads and does not stay stuck.
- AI Observatory loads fresh AI/tech news.
- Public Comps loads market data.
- Tech Readiness Index loads.
- Tech Events loads or shows clear empty state.
- Startup Map renders markers and filters.

### arXiv Papers

- Trending papers load.
- Hugging Face Papers / AlphaXiv sources are hidden from copy.
- Score color semaphore works.
- Left radar opens and filters without losing focus.

### GitHub Repo

- `Master repos` tab loads curated GenAI repositories.
- `Trending repos` tab loads direct GitHub Trending data.
- Search and filters work inside each tab.
- Repo first column is clickable.
- `Master repos` first tries `/api/github-master-repos` backed by Supabase, then falls back to `src/config/github-curated-fallback.json`.
- Public users do not fan out into one GitHub request per master repo.

Supabase table for manually managed master repos:

```sql
create table if not exists public.github_master_repos (
  full_name text primary key,
  status text not null default 'master',
  sort_order integer not null default 1000,
  repo_json jsonb not null,
  updated_at timestamptz not null default now()
);

create index if not exists github_master_repos_status_sort_idx
  on public.github_master_repos (status, sort_order);
```

Required env vars:

```bash
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
SUPABASE_GITHUB_MASTER_REPOS_TABLE=github_master_repos
RELAY_SHARED_SECRET=
```

Admin update endpoint:

```bash
curl -X PUT "$APP_URL/api/github-master-repos" \
  -H "Authorization: Bearer $RELAY_SHARED_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"items":[{"full_name":"owner/repo","description":"...","html_url":"https://github.com/owner/repo"}]}'
```

### APIs

Test from browser or curl:

```text
/api/github-master-repos
/api/github-repos?trending=1
/api/arxiv
/api/rss-proxy?url=https%3A%2F%2Ftechcrunch.com%2Ffeed%2F
/api/bootstrap
/api/chat-analyst
/api/mcp
```

After Render relay is configured, also test:

```text
/api/telegram-feed
```

## Known Open Risks

### Render Not Configured

Impact:

- Telegram may not load.
- Some relay-only RSS feeds may fail.
- Notification/stream features may not work.

Fix:

- Deploy Render relay.
- Set `WS_RELAY_URL`, `VITE_WS_RELAY_URL`, and `RELAY_SHARED_SECRET`.

### Redis Has Keys But Some Sources May Be Empty

Impact:

- Cards can show stale or missing data even if Redis is reachable.

Fix:

- Seed/refresh required cache keys.
- Add source freshness panel or diagnostics for MVP QA.

### Large Startup Chunks

Known chunks:

- Clerk auth
- MapLibre
- HLS/live-channel
- ML worker

Impact:

- Slower first load.

Fix later:

- Lazy-load Clerk only when auth UI opens.
- Keep MapLibre only for map route/card.
- Remove or gate HLS/live-channel from MVP if unused.
- Keep ML worker, but feature-flag/refactor it.

## Recommended Next Work Order

1. Finish Render relay deployment.
2. Configure Vercel env variables.
3. Redeploy Vercel.
4. Run post-deploy smoke test.
5. Fix DNS for analytics/maps or disable those fetches.
6. Add a lightweight `/api/deploy-health` or diagnostics panel showing:
   - Redis reachable
   - Render relay reachable
   - LLM provider configured
   - GitHub token configured
   - RSS proxy working
7. Continue MVP polish only after data loading is stable.

## Product / MVP Cleanup Action Plan

This section tracks the next product cleanup steps after the latest arXiv and GitHub work.

### 1. GitHub Repo Page QA

Goal: make the GitHub page as clear and usable as the arXiv page.

Actions:

- Verify the `Master repos` tab.
- Verify the `Trending repos` tab.
- Check filters inside each tab.
- Check score labels and score color semaphore.
- Check search behavior and focus retention.
- Check that repo links open the correct GitHub pages.
- Reduce visual density if the page feels overloaded.

Done criteria:

- Master repos and Trending repos load independently.
- Filters do not cross-contaminate the two source modes.
- Search works without losing focus.
- Every visible repo has a clickable repo link.
- Score meaning is understandable without reading code.

### 2. VC Startup Tab Cleanup Final

Goal: remove entropy from the main VC Startup tab.

Actions:

- Remove or merge duplicate cards.
- Keep only blocks with clear VC value:
  - funding / investment signals
  - AI Observatory
  - market comps
  - readiness / ecosystem indicators
  - startup map
- Re-check cards that overlap:
  - Investment Brief
  - Highest-Conviction Signals
  - Funding Momentum / Radar
  - AI Brief / AI Observatory
- Prefer one strong investor area over three similar cards.

Done criteria:

- First screen feels decision-oriented, not noisy.
- No card says the same thing in different words.
- Each remaining card answers a clear investor question.

### 3. Data Freshness

Goal: stop old news from appearing as fresh.

Actions:

- Check RSS/API date parsing.
- Detect cases where UI says `9h ago` but source article is older.
- Normalize true publication dates.
- Store and display source timestamp separately from fetch timestamp.
- Add clear fallback when a source is stale or unavailable.

Done criteria:

- Freshness label reflects article publication time, not ingestion time.
- Stale source states are visible.
- User can trust “today / yesterday / hours ago” labels.

### 4. Bundle Bloat MVP

Goal: keep startup MVP fast without deleting useful future capabilities.

Actions:

- Clerk auth: load only when auth/pro UI is opened.
- HLS/live-channel: lazy-load or remove from startup MVP if not used.
- MapLibre: keep only for Startup Map.
- ML worker: keep, but place behind feature flag/refactor path.

Done criteria:

- Startup build still passes.
- Startup app does not eagerly load non-MVP heavy capabilities.
- ML worker remains available for future Startup Intelligence refactor.

### 5. Cleanup Map Update

Goal: keep `plans/startup-cleanup-map.md` aligned with reality.

Actions:

- Mark GitHub radar split as done.
- Mark current World Monitor cleanup blockers as closed if no longer active.
- Leave open only product/MVP improvement points.
- Separate deploy/runtime issues from legacy cleanup issues.

Done criteria:

- `plans/startup-cleanup-map.md` no longer suggests old cleanup blockers are still active.
- Open points are actionable and current.

### 6. Release Hardening

Goal: have a repeatable MVP release checklist.

Actions:

- Run focused tests:
  - arXiv
  - GitHub
  - MCP
  - chat analyst
  - startup build
- Run browser smoke on local 3007.
- Run browser smoke on Vercel deploy.
- Create or update “MVP ready” checklist.

Done criteria:

- Local and Vercel both load core tabs.
- No critical card remains in infinite loading.
- Known missing integrations are clearly gated or explained.

## Commands

Local dev:

```bash
npm run dev:startup -- --host 127.0.0.1 --port 3007
```

Validation:

```bash
npm run typecheck
npx tsx --test tests/github-repos.test.mts tests/arxiv-papers.test.mts tests/mcp.test.mjs tests/chat-analyst.test.mts
npm run build:startup
```
