# Startup Intelligence Cleanup Map

Last updated: 2026-04-25

This map separates the original WorldMonitor surface from the target Startup Intelligence product. It is intentionally conservative: items marked as delete candidates should be removed only after imports, tests, and startup build prove they are unreachable.

## Current Cleanup Status

### Done

- Startup deploy surface keeps chat, MCP, Telegram, auth, billing, arXiv, GitHub, Hugging Face, RSS, market comps, research, news, economic, consumer-prices, and intelligence RPC APIs.
- Startup RPC handlers for `consumer-prices`, `economic`, `intelligence`, `market`, `news`, and `research` now live under `server/startup/`.
- Legacy handlers for `server/worldmonitor/{consumer-prices,economic,market,news,research}` are quarantined under `legacy/worldmonitor-server/`.
- Startup intelligence keeps startup-fit RPCs and stubs geopolitical/world-risk RPCs as unavailable.
- Startup news defaults to startup/tech feeds instead of the old full WorldMonitor feed set.
- Startup search no longer statically imports legacy geopolitical map datasets.
- Startup source-limit enforcement protects core startup dashboards: Product Hunt, funding/VC, startup dealflow, and semiconductors/hardware.
- Startup map data contracts are split from the legacy map data type bundle.
- Startup map popup renderers are split into `src/components/startup-map-popup-renderers.ts`; `MapPopup.ts` now delegates startup popups there.
- Startup map app contract now lives in `src/components/map-container-contract.ts`; `AppContext` and `CountryDeepDivePanel` no longer import the heavy `MapContainer` implementation type.
- Startup related-asset focus/click handling now ignores legacy pipeline, cable, military-base, and nuclear asset types and keeps only datacenter map activation.
- `MapContainer` now skips legacy cache rehydration and legacy map data setter side effects in the startup variant; startup rehydrates only startup-safe tech event data.
- `App.ts` now depends on the lightweight `src/app/data-loader-contract.ts` interface instead of importing loader types from both full and startup data-loader implementations.
- Startup event handling no longer forwards aviation live-position updates or legacy CII focal refreshes, and startup exports omit legacy intelligence/cyber/GPS payloads.
- `App.ts` now depends on the lightweight `src/app/event-handler-contract.ts` interface and dynamically imports the event handler implementation.
- `PanelLayoutManager` now initializes asynchronously and lazy-loads `MapContainer`, so the Startup Intelligence main app chunk no longer statically imports the legacy map shell.
- `api/intelligence/` and `api/research/` are active startup API domains and are no longer startup-deploy exclusions.
- Verification passed after the latest code cleanup batch: `npm run typecheck`, focused startup/MCP/chat/market tests, and `npm run build:startup`.

### Still Open

- Startup map shell no longer statically bundles the legacy map container into the main app chunk. The remaining work is a deeper renderer split inside the lazy map chunk.
- `AppContext`, event handlers, and country intelligence still carry legacy domain state or legacy extension points.
- Panel registry/config still mixes startup panels with legacy WorldMonitor panels.
- Full `data-loader.ts` is not needed for startup and should disappear from the startup import graph.
- `server/worldmonitor/intelligence/v1/` still contains legacy geopolitical handlers and tests/reference code.
- Excluded legacy API/client/service/config files remain in repo until import graph and tests prove they can be physically deleted.
- Generated proto stubs still use the WorldMonitor namespace and should be cleaned only after runtime imports no longer need them.

## Cleanup Decision Rule

Keep or refactor anything that can credibly become one of these target capabilities:

- GenAI, LLM, analyst workflows, agentic UX, MCP, custom widgets, semantic/ML ranking, summarization, enrichment, or prompt-safety infrastructure.
- Startup/VC intelligence: funding, founders, companies, markets, comps, sector trends, IPO/M&A signals, accelerators, ecosystems, talent, regulation, patents, product launches.
- AI application stack intelligence: arXiv, GitHub, Hugging Face, repos, models, datasets, benchmarks, leaderboards, AI security, gateways, observability, RAG, memory, agents.
- Reliability and freshness: data freshness, source health, service status, cloud/vendor outages, desktop/pro distribution, auth, billing, user preferences.
- Industry intelligence that can support startup theses: semiconductors, data centers, cloud, energy for compute, healthcare AI, fintech, robotics, cybersecurity, supply chain only when tied to technology sectors.

Delete or quarantine anything whose only useful interpretation is legacy WorldMonitor geopolitics, military tracking, disaster monitoring, humanitarian monitoring, generic webcams, or non-tech crisis mapping.

## API Domain Decisions

| API domain | Current role | Decision | Rationale |
|---|---|---|---|
| `api/infrastructure/` | Internet outages, DDoS, service status, cable health, IP geo, temporal anomalies, bootstrap infra | Refactor | Keep cloud/vendor reliability, outages, service status, data center/internet resilience. Drop cable/geopolitical infra unless tied to AI infrastructure. |
| `api/intelligence/` | Mixed geopolitical intelligence, GDELT, country risk, Telegram, company enrichment, company signals, market implications, social velocity, LLM/deduction | Split | Preserve LLM, company, Telegram, social velocity, market implications. Move to startup namespace. Quarantine country/geopolitical risk. |
| `api/prediction/` | Prediction markets | Refactor optional | Useful if retargeted to AI/startup/VC prediction markets, IPO windows, AI regulation, model launches, rate/GPU/compute expectations. |
| `api/research/` | arXiv, trending repos, Hacker News, tech events | Keep or merge | Strongly aligned with target. We already have richer standalone arXiv/GitHub APIs, but HN and tech events may still be useful. |
| `api/trade/` | Trade restrictions, tariffs, flows, barriers, Comtrade | Optional refactor | Keep only for tech industry theses: chips, export controls, batteries, robotics, biotech supply chains. Not a core dashboard surface. |
| `api/webcam/` | Webcam listing and image proxy | Delete candidate | Weak fit. Only keep if a specific data-center/construction visual-monitoring use case emerges. |
| `api/bootstrap.js` | Bulk hydration of legacy WorldMonitor cache domains | Rewrite candidate | Current payload is mostly legacy and should stay excluded. Preserve the pattern as a future startup bootstrap for arXiv/GitHub/HF/RSS/Telegram/markets/MCP status. |
| `api/telegram-feed.js` | Relay-backed Telegram feed | Keep and retarget | User explicitly wants to keep it. Retarget topics/channels to startup, VC, AI, market and founder intelligence. |


## Target Product Surface

### Keep

These are first-class target capabilities and should remain in the project.

- Startup / VC dashboard shell: `src/App.ts`, `src/app/panel-layout.ts`, `src/app/event-handlers.ts`, `src/config/variants/tech.ts`, `src/config/panels.ts`.
- VC startup dashboard: `src/app/startup-data-loader.ts`, `src/app/startup-country-intel.ts`, `src/components/NewsPanel.ts`, `src/components/TopVCSignalsPanel.ts`, `src/components/InvestmentsPanel.ts`, `src/services/startup-signal.ts`, `src/services/startup-investor-brief.ts`.
- Tech/startup map: `src/components/DeckGLMap.ts`, `src/components/Map.ts`, `src/components/MapPopup.ts`, `src/config/startup-ecosystems.ts`, `src/config/tech-companies.ts`, `src/config/tech-geo.ts`, `src/config/ai-datacenters.ts`, `src/services/tech-hub-index.ts`, `src/services/hub-activity-scoring.ts`.
- arXiv intelligence: `api/arxiv.js`, `src/components/ArxivPapersDashboard.ts`, `src/services/arxiv/`, `src/config/arxiv-query-templates.json`, `tests/arxiv-papers.test.mts`.
- GitHub intelligence: `api/github-repos.js`, `src/components/GithubReposDashboard.ts`, `src/services/github-repos/`, `src/config/github-repo-sources.json`, `src/config/github-curated-fallback.json`, `tests/github-repos.test.mts`.
- Hugging Face intelligence: `api/huggingface.js`, `src/components/HuggingFaceDashboard.ts`, `src/services/huggingface/`, `src/config/huggingface-sources.json`, `src/config/huggingface-curated-fallback.json`, `tests/huggingface.test.mts`.
- Shared intelligence taxonomy: `src/config/intelligence-taxonomy.json`, `src/config/intelligence-clusters.ts`.
- Auth, billing, preferences, analytics: `api/create-checkout.ts`, `api/product-catalog.js`, `api/user-prefs.ts`, `src/services/auth-state.ts`, `src/services/billing.ts`, `src/services/entitlements.ts`, `src/services/widget-store.ts`, `src/components/AuthHeaderWidget.ts`, `src/components/AuthLauncher.ts`, `src/components/UnifiedSettings.ts`.
- Chat and GenAI analyst: `api/chat-analyst.ts`, `src/components/ChatAnalystPanel.ts`, `server/_shared/llm.ts`, `server/_shared/llm-health.ts`, `server/_shared/llm-sanitize.js`.
- MCP and custom data panels: `api/mcp.ts`, `api/mcp-proxy.js`, `api/oauth/`, `src/components/McpConnectModal.ts`, `src/components/McpDataPanel.ts`, `src/services/mcp-store.ts`, `tests/mcp.test.mjs`, `tests/mcp-proxy.test.mjs`, `tests/mcp-presets.test.mjs`.
- Widget agent / custom widgets: `api/widget-agent.ts`, `src/components/CustomWidgetPanel.ts`, `src/components/WidgetChatModal.ts`, `tests/widget-agent-auth.test.mts`, `tests/widget-builder.test.mjs`.
- Telegram feed ingestion: `api/telegram-feed.js` should stay and be retargeted to startup/VC/AI intelligence channels.
- Startup market comps: `api/market/v1/[rpc].ts`, `server/startup/market/v1/`, `src/services/market/`, relevant market panels still enabled for startup.

## Keep But Refactor

These files contain useful target capabilities mixed with WorldMonitor legacy assumptions.

- `api/chat-analyst.ts`: keep as the Startup Intelligence analyst edge function. It now points at `server/startup/analyst/` for startup-oriented context and prompt construction.
- `server/startup/analyst/context.ts`: startup-oriented context builder for VC/startup/AI-stack/market/research/infrastructure analysis.
- `server/startup/analyst/prompt.ts`: Startup Intelligence analyst system prompt for investor-facing responses.
- `server/startup/analyst/actions.ts`: action-event detection for investor widgets and dashboard creation.
- `server/worldmonitor/intelligence/v1/chat-analyst-*`: legacy analyst modules still exist for tests/reference, but are no longer the active chat endpoint path.
- `server/_shared/llm.ts`, `server/_shared/llm-health.ts`, `server/_shared/llm-sanitize.js`: keep as shared LLM foundation.
- `api/bootstrap.js`: do not keep in its current WorldMonitor shape, but preserve the bootstrap pattern. Rewrite as a startup bootstrap if we want fast first-load hydration for startup news, arXiv, GitHub, Hugging Face, market comps, chat/MCP status, and Telegram sources.
- `api/telegram-feed.js`: keep, but retarget topics/channels to startup intelligence and AI ecosystem monitoring.
- Desktop/download functionality, ML worker, and data freshness: keep as potential target capabilities, but separate from legacy WorldMonitor copy and domain assumptions.
- `src/app/event-handlers.ts`: keep, but continue lazy-loading desktop/worldmonitor-only features and trim maritime/aviation startup imports.
- `src/app/panel-layout.ts`: keep, but replace remaining `worldmonitor.app` links, GitHub repo links, and Pro copy with target brand/domain.
- `src/components/DeckGLMap.ts` and `src/components/Map.ts`: keep startup layers, but split legacy geo layers into separate modules so startup does not bundle imagery, webcams, aviation, military, sanctions, radiation, and conflict map code.
- `src/components/MapPopup.ts`: keep startup/tech popup renderers, but split legacy popup renderers into optional modules.
- `src/config/feeds.ts` and `server/startup/news/v1/_feeds.ts`: keep startup/tech feeds, move non-startup feeds to legacy or archived config.

## Backend Deploy Surface

### Keep In Deploy

- Standalone startup APIs: `api/arxiv.js`, `api/github-repos.js`, `api/huggingface.js`, `api/rss-proxy.js`.
- Market RPC: `api/market/v1/[rpc].ts` and `server/startup/market/v1/`.
- Chat/MCP: `api/chat-analyst.ts`, `api/mcp.ts`, `api/mcp-proxy.js`, `api/oauth/`.
- Auth, billing, notifications, prefs, product catalog, health, version, contact.
- Shared backend utilities needed by kept APIs: `api/_*.js`, `server/_shared/`, `server/cors.ts`, `server/router.ts`, `server/gateway.ts`.

### Excluded From Startup Deploy

Already excluded in `.vercelignore`, except active startup RPC domains that have been re-enabled:

- Legacy API domains: `api/aviation/`, `api/climate/`, `api/conflict/`, `api/cyber/`, `api/displacement/`, `api/health/`, `api/imagery/`, `api/infrastructure/`, `api/maritime/`, `api/military/`, `api/natural/`, `api/prediction/`, `api/radiation/`, `api/resilience/`, `api/sanctions/`, `api/seismology/`, `api/supply-chain/`, `api/thermal/`, `api/trade/`, `api/unrest/`, `api/webcam/`, `api/wildfire/`.
- Legacy single APIs: `api/ais-snapshot.js`, `api/gpsjam.js`, `api/military-flights.js`, `api/opensky.js`, `api/oref-alerts.js`, `api/polymarket.js`, `api/sanctions-entity-search.js`, `api/satellites.js`.
- `api/bootstrap.js` is excluded only because its current payload is legacy; it should be rewritten rather than treated as a discarded product idea.
- Legacy server handlers under `server/worldmonitor/`, except chat/intelligence code that still needs final extraction or test migration.

Important correction: `api/chat-analyst.ts`, `api/mcp.ts`, `api/telegram-feed.js`, `api/intelligence/`, and `api/research/` are target capabilities and must not be excluded.

## Physical Delete Candidates

Delete only after replacing or removing all imports from startup entrypoints.

- Frontend panels unrelated to startup intelligence: aviation, military, sanctions, climate disaster, disease, displacement, radiation, wildfire, seismic, live webcams, positive-events-only panels, commodity-only panels.
- Client services unrelated to startup intelligence: `src/services/aviation/`, `maritime/`, `military/`, `military-flights.ts`, `military-vessels.ts`, `conflict/`, `displacement/`, `climate/`, `radiation.ts`, `sanctions-pressure.ts`, `webcams/`, `wildfires/`, `thermal-escalation.ts`, most `supply-chain/` unless later reused for industry mapping.
- Config data unrelated to startup map: military bases, ports, pipelines, airports, commodities, sanctions/geopolitical datasets, weather/natural hazard datasets.
- Server handlers for excluded domains after chat has been extracted from `server/worldmonitor/intelligence/v1/`.
- Generated proto stubs for removed domains after no runtime/server code imports them.
- Tests covering deleted legacy domains, after preserving target tests for startup intelligence, auth, billing, MCP, chat, and market comps.

## Current Blockers To Physical Deletion

- `src/components/DeckGLMap.ts` still statically imports military bases, aviation, conflict, imagery, webcams, displacement, climate, radiation, and supply-chain map code.
- `src/components/Map.ts`, `src/components/GlobeMap.ts`, `src/components/MapPopup.ts`, and `src/components/MapContainer.ts` still combine startup map rendering with legacy world-risk rendering.
- `src/app/app-context.ts` and `src/app/event-handlers.ts` still have legacy state, layer refresh behavior, desktop/download support, ML worker hooks, and domain extension points.
- `src/App.ts` and `src/config/panels.ts` still know about legacy panel types and non-startup variants.
- `server/worldmonitor/intelligence/v1/` still contains legacy geopolitical intelligence handlers.
- `proto/` and `src/generated/` still carry WorldMonitor service contracts for domains that startup no longer ships.

## Final Cleanup Sequence

1. Restore target exclusions: keep chat and MCP deployable. Done.
2. Extract chat analyst backend from `server/worldmonitor/intelligence/v1/` into a startup-oriented namespace, then update `api/chat-analyst.ts`. Done.
3. Split backend startup RPCs out of `server/worldmonitor/` for market, news, research, economic, consumer-prices, and startup intelligence. Done.
4. Re-enable active startup RPC API domains in `.vercelignore` and route Vite dev startup APIs to `server/startup/`. Done.
5. Freeze the current green baseline: `npm run typecheck`, focused startup/MCP/chat/market tests, `npm run build:startup`, and one browser smoke test. Done.
6. Protect startup source defaults so core startup dashboards never render as all-sources-disabled after free-tier source trimming. Done.
7. Split startup map data contracts from legacy map data contracts. Done.
8. Split the map into startup map modules and legacy geo modules. Done for the app shell: `MapContainer` is lazy-loaded and no longer statically bundled into Startup Intelligence `App`. Follow-up renderer work remains inside the lazy map chunk.
9. Split `MapPopup` into startup popup renderers and legacy popup renderers. Done.
10. Split `MapContainer` so startup imports a startup map shell and never statically imports the legacy map stack. Done at app-shell level: app-facing map contract extracted, `MapContainer` lazy-loaded, startup blocks legacy map cache rehydrate/data setter side effects.
11. Split `AppContext` into startup-safe core plus legacy extensions, so startup no longer references aviation, maritime, conflict, sanctions, climate, radiation, displacement, or wildfire state. In progress: map implementation type removed from core context.
12. Split event handlers into startup handlers and legacy handlers. Keep desktop/download, ML worker, and data freshness only where still useful for startup. In progress: event handler contract extracted, startup legacy aviation/CII/export payload paths gated off.
13. Remove `data-loader.ts` from the startup import graph. Startup should use only `startup-data-loader.ts`. In progress: runtime import is already dynamic, and `App.ts` now uses a shared loader contract instead of implementation types.
14. Split panel registry/config into startup registry plus archived legacy registry. Startup variants should not register military, aviation, maritime, sanctions, disaster, disease, webcam, or non-tech crisis panels.
15. Split country intelligence into startup country intelligence plus archived world-risk intelligence.
16. Quarantine `server/worldmonitor/intelligence/v1/` after tests are migrated to `server/startup/intelligence/v1/` or removed.
17. Quarantine frontend legacy panels, services, configs, and workers only after `rg`, typecheck, and startup build prove no startup imports remain.
18. Rewrite `api/bootstrap.js` as startup bootstrap for startup news, arXiv, GitHub, Hugging Face, market comps, Telegram, MCP, and chat health.
19. Replace remaining WorldMonitor product copy, links, docs, and branding in startup routes.
20. Remove generated proto stubs only after deleted domains have no runtime/server/client imports.
21. Run full cleanup verification and bundle audit.
22. Delete quarantined legacy files in one final deletion batch after CI-style verification stays green.

## Final Cleanup Verification

Run after every risky batch:

- `npm run typecheck`
- `npx tsx --test tests/arxiv-papers.test.mts tests/github-repos.test.mts tests/huggingface.test.mts`
- `npx tsx --test tests/mcp.test.mjs tests/mcp-proxy.test.mjs tests/mcp-presets.test.mjs tests/chat-analyst.test.mts`
- `npx tsx --test tests/shared-relay.test.mjs tests/stock-analysis.test.mts tests/server-handlers.test.mjs`
- `npm run build:startup`

Run before physical deletion:

- `rg "server/worldmonitor/(consumer-prices|economic|market|news|research|intelligence)" api server src tests vite.config.ts`
- `rg "(aviation|maritime|military|sanctions|displacement|radiation|wildfire|webcam|conflict)" src/App.ts src/app src/components src/config src/services`
- Browser smoke on startup URL with layers `datacenters,startupHubs,cloudRegions,accelerators,techHQs,techEvents`.

## Verification Checklist For Each Cleanup Batch

- `npm run typecheck`
- `npx tsx --test tests/arxiv-papers.test.mts tests/github-repos.test.mts tests/huggingface.test.mts`
- `npx tsx --test tests/mcp.test.mjs tests/mcp-proxy.test.mjs tests/mcp-presets.test.mjs tests/chat-analyst.test.mts`
- `npm run build:startup`
