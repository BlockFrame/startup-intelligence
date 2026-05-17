# Startup Intelligence Cleanup Map

Last updated: 2026-05-16

This map tracks the cleanup from the original broad global-monitoring surface to the target Startup Intelligence product. It is intentionally conservative: items marked as delete candidates should be removed only after imports, tests, and startup build prove they are unreachable.

## Current Cleanup Status

### Done

- Startup deploy surface keeps chat, MCP, Telegram, auth, billing, arXiv, GitHub, Hugging Face, RSS, market comps, research, news, economic, consumer-prices, and intelligence RPC APIs.
- Startup RPC handlers for `consumer-prices`, `economic`, `intelligence`, `market`, `news`, and `research` now live under `server/startup/`.
- Legacy handlers for `server/startup_intelligence/{consumer-prices,economic,market,news,research}` are quarantined under `legacy/startupintelligence-server/`.
- Startup intelligence keeps startup-fit RPCs and stubs geopolitical/world-risk RPCs as unavailable.
- Startup news defaults to startup/tech feeds instead of the old full StartupIntelligence feed set.
- Startup search no longer statically imports legacy geopolitical map datasets.
- Startup source-limit enforcement protects core startup dashboards: Product Hunt, funding/VC, startup dealflow, and semiconductors/hardware.
- Startup map data contracts are split from the legacy map data type bundle.
- Startup map popup renderers are split into `src/components/startup-map-popup-renderers.ts`; `MapPopup.ts` now delegates startup popups there.
- Startup map app contract now lives in `src/components/map-container-contract.ts`; `AppContext` no longer imports the heavy `MapContainer` implementation type.
- Startup related-asset focus/click handling now ignores legacy pipeline, cable, military-base, and nuclear asset types and keeps only datacenter map activation.
- `MapContainer` now skips legacy cache rehydration and legacy map data setter side effects in the startup variant; startup rehydrates only startup-safe tech event data.
- Startup now uses `src/components/StartupMapContainer.ts`, a startup-only MapLibre renderer for datacenters, startup hubs, cloud regions, accelerators, tech HQs, and tech events. The startup build no longer emits the legacy `MapContainer`, `DeckGLMap`, `Map`, or `GlobeMap` chunks.
- Startup map cleanup is fully closed for this phase: rich popups, low-zoom marker clustering, optional MapLibre globe mode, and `tests/startup-map-cleanup.test.mjs` guard against legacy map renderer re-coupling.
- `App.ts` now depends on the lightweight `src/app/data-loader-contract.ts` interface instead of importing loader types from both full and startup data-loader implementations.
- Startup event handling no longer forwards aviation live-position updates or legacy CII focal refreshes, and startup exports omit legacy intelligence/cyber/GPS payloads.
- `App.ts` now depends on the lightweight `src/app/event-handler-contract.ts` interface and dynamically imports the event handler implementation.
- `PanelLayoutManager` now initializes asynchronously and lazy-loads `MapContainer`, so the Startup Intelligence main app chunk no longer statically imports the legacy map shell.
- `AppContext` is split into startup-safe core plus legacy extension: `StartupAppContext` owns core startup state, `legacy-app-context.ts` owns legacy intelligence/cyber cache state, and `tests/startup-app-context-cleanup.test.mjs` guardrails the boundary.
- Startup panel chunking no longer forces every `*Panel.ts` file into a shared startup `panels` bundle; startup-only secondary panels now lazy-load as small chunks.
- Startup data loading is protected against lazy panel races through queued panel calls for markets, VC signals, monitor results, and tech events.
- `App.ts` imports `startup-data-loader.ts` directly, so the full legacy `data-loader.ts` has been physically removed rather than hidden behind a Vite alias.
- Startup bundle bloat cleanup is closed for the startup app core: `App.ts`, `panel-layout.ts`, `event-handlers.ts`, `startup-data-loader.ts`, `search-manager.ts`, and hot startup panels import config modules directly instead of `src/config/index.ts`; startup search no longer statically imports country-instability; ML/world-risk services are lazy; startup builds alias `@/services/i18n` to `src/services/startup-i18n.ts`.
- Startup country intelligence is split from legacy world-risk intelligence: startup uses `src/app/startup-country-intel.ts`; `AppContext` no longer carries country brief UI contracts; the `src/app` barrel exports the startup manager only; `tests/startup-country-intel-cleanup.test.mjs` prevents startup re-coupling to CII, military, sanctions, maritime, aviation, and legacy country panels.
- Startup build secondary HTML entries are trimmed: `build:startup` now uses only `index.html` as Rollup input, so standalone `settings.html` and `live-channels.html` are not emitted into the startup build; in-app settings and optional live-channel management remain lazy capabilities.
- `api/intelligence/` and `api/research/` are active startup API domains and are no longer startup-deploy exclusions.
- Startup runtime branding cleanup is closed for this phase: startup premium gates no longer link to StartupIntelligence Pro, startup does not fetch legacy StartupIntelligence GitHub stars, startup HTML metadata no longer advertises the legacy StartupIntelligence product, and tests guard these paths.
- Second frontend physical delete batch removed dead legacy/non-core panel files that had no startup/runtime factory imports: `StrategicPosturePanel`, `DefensePatentsPanel`, `GulfEconomiesPanel`, `GroceryBasketPanel`, `BigMacPanel`, `FaoFoodPriceIndexPanel`, `CotPositioningPanel`, and `PositioningPanel`. `App.ts` and legacy country intelligence now use small structural refresh/posture contracts instead of importing those panel types.
- Third frontend physical delete batch removed the legacy world-risk country manager and dead story modal/share stack: `src/app/country-intel.ts`, `CountryIntelModal`, `StoryModal`, `story-data`, `story-renderer`, and `story-share`. Text-only legacy tests were pruned where they only asserted call sites in the deleted manager, while supply-chain/deep-dive tests that still cover retained capabilities remain.
- Fourth frontend physical delete batch removed the legacy country deep-dive UI stack: `CountryDeepDivePanel`, `CountryDeepDivePanel-news-utils`, `CountryBriefPage`, `CountryBriefPanel`, `CountryTimeline`, `country-deep-dive.css`, and related legacy-only tests. `AppContext`, startup country intelligence, URL sharing, and the app barrel no longer carry `countryBriefPage`, `countryTimeline`, or `country-brief-contract` state.
- Legacy country story deep links are removed from the startup app. Startup keeps `?country=XX` only as map focus behavior; `/story`, `?c=XX`, and `expanded=1` brief semantics are gone from `App.ts`, and story meta-tag handling is bypassed for the startup variant.
- Startup build no longer bypasses the lightweight i18n alias through relative `./services/i18n` imports in `src/main.ts`; startup build output no longer emits the full `locale-*` translation chunks.
- Startup i18n no longer imports the full `src/locales/en.json` dictionary. `src/services/startup-i18n.ts` now carries a small startup-only inline dictionary, dropping the startup i18n chunk from roughly 109 KB to roughly 11 KB before gzip.
- Startup build aliases `@/config/panels` to `src/config/startup-panels.ts`, a compatibility registry that exposes only startup panels, startup categories, startup map defaults, and free-tier constants. The legacy all-variant `panels` chunk is no longer emitted in the startup build; it is replaced by a roughly 3 KB startup-only registry chunk.
- Startup MCP surface is now physically startup-only. `api/mcp.ts` publishes market, cyber, macro, EU economic, infrastructure, supply-chain, research, social-velocity, and commodity-geo tools; aviation, maritime, military, conflict, sanctions, natural-disaster, radiation, flight-search, climate-crisis, positive-event, and geopolitical forecast tool implementations have been removed from the active MCP server file, not just hidden from `tools/list`.
- Non-startup runtime setup has been extracted from `App.ts` into `src/app/non-startup-runtime.ts`. Legacy AIS/bootstrap/signal-modal/findings/breaking-news/correlation/country-learning teardown paths now live behind a single non-startup dynamic import, so startup keeps only guarded startup behavior in the main app shell.
- Non-startup event runtime paths have been extracted from `src/app/event-handlers.ts` into `src/app/non-startup-event-runtime.ts`. Legacy focal-point refresh, GPS export enrichment, AIS stream toggles, and aviation live-position forwarding are no longer static event-handler imports in the startup bundle.
- Non-startup layout runtime paths have been extracted from `src/app/panel-layout.ts` into `src/app/non-startup-layout-runtime.ts`. Legacy StartupIntelligence Pro/GitHub/status/footer links, GitHub star fetching, and escalation map getter setup are no longer inline startup layout code.
- Startup build now uses build-time startup guards for the extracted non-startup runtimes. `build:startup` no longer emits `non-startup-runtime`, `non-startup-event-runtime`, `non-startup-layout-runtime`, `SignalModal`, `BreakingNewsBanner`, `IntelligenceGapBadge`, or `country-instability` chunks; startup precache dropped from 114 to 102 entries in this batch.
- First API/server physical deletion wave is complete. Removed legacy aviation, climate, conflict, displacement, forecast, giving, health-v1, imagery, maritime, military, natural, positive-events, prediction, radiation, resilience, sanctions, scenario, seismology, thermal, trade, unrest, v2 shipping, webcam, wildfire API/server handlers and their legacy-only tests. Vite dev RPC routing and gateway cache tiers now exclude the deleted domains.
- Final API/server physical deletion wave is complete. Removed retained-but-unrefactored `api/cyber/`, `api/infrastructure/`, `api/supply-chain/`, `server/startup_intelligence/cyber/`, `server/startup_intelligence/infrastructure/`, `server/startup_intelligence/intelligence/`, and `server/startup_intelligence/supply-chain/`. Startup intelligence now uses `server/startup/intelligence/` and `server/startup/analyst/`; legacy supply-chain/geopolitical tests were pruned; `tests/chat-analyst.test.mts` now targets the startup analyst modules.
- Optional legacy supply-chain frontend cleanup is complete for the active repo surface. Removed `SupplyChainPanel`, `HormuzPanel`, `RouteExplorer`, `src/services/supply-chain/`, `src/services/hormuz-tracker.ts`, supply-chain/route-explorer CSS, route-explorer command handling, supply-chain source freshness/runtime settings, and route-explorer/supply-chain UI tests. Startup build precache dropped from 102 to 100 entries in this batch.
- Legacy relay/seed route cleanup is complete for deleted domains. Removed infrastructure/cyber/supply-chain warm-pings from `scripts/ais-relay.cjs` and `scripts/seed-forecasts.mjs`, deleted standalone legacy seed/validation workers (`seed-infra`, `seed-service-statuses`, `validate-seed-migration`, `scenario-worker`), and removed the stale seed warm-ping test. Repository search now finds no active `api/infrastructure`, `api/cyber`, or `api/supply-chain` route references outside generated/proto/history exclusions.
- First generated/proto stub deletion is complete. Removed unused wildfire service stubs from `src/generated/client/startup_intelligence/wildfire/`, `src/generated/server/startup_intelligence/wildfire/`, and `proto/startup_intelligence/wildfire/`, after deleting the last real frontend service reference.
- Verification passed after the latest code cleanup batch: `npm run typecheck`, `node --test scripts/ais-relay-rss.test.cjs tests/seed-contract.test.mjs`, and `npm run build:startup`.
- Hard brand sterilization is complete for active repo text, file paths, env examples, headers, CORS rules, metadata, deploy settings, docs, and generated contract paths. The old brand string no longer appears in the workspace outside Git history and third-party dependency caches.
- Environment/settings cleanup is complete for the active example env: removed deleted-domain keys for aviation, conflict, wildfire/disaster, generic outage, and supply-chain-only feeds; retained only startup/AI-stack/market/research, auth/billing, MCP/OAuth, Telegram, relay, notification, LLM, cache, and map settings.
- Generated and proto contract directories are renamed from the old brand path to `startup_intelligence`, and all active imports now target `src/generated/{client,server}/startup_intelligence` plus `proto/startup_intelligence`.
- GitHub Repo radar split is complete for the current MVP iteration: `Master repos` and `Trending repos` are separate in-page tabs, master repositories use curated/startup GenAI sources, and trending repositories fetch directly from GitHub Trending through `/api/github-repos?trending=1`.

### Still Open

No active World Monitor cleanup blockers remain for the Startup Intelligence app surface.

Current open work is now product/MVP hardening rather than legacy cleanup:

- GitHub Repo page QA: verify `Master repos` and `Trending repos`, filters, score labels, search, repo links, and visual density.
- VC Startup tab cleanup: remove duplicate/low-value cards and keep only investor-useful blocks such as funding, AI Observatory, market comps, readiness, and startup map.
- Data freshness: normalize source publication dates, prevent stale articles from appearing as fresh, and show clear stale-source fallbacks.
- Bundle bloat MVP: keep Clerk, MapLibre, HLS/live-channel, and ML worker as intentional/lazy product capabilities, but continue gating or lazy-loading non-core paths.
- Release hardening: run arXiv, GitHub, MCP, chat, startup build, and browser smoke checks before MVP deploy.

### Closed Decisions

- Contract rename wave is closed for brand cleanup. Active startup RPCs now import generated `startup_intelligence/*` contracts. A later product API naming pass can rename this namespace again if a public contract package name is chosen.
- Client/generated cleanup wave closed for this cleanup phase. Unused wildfire generated/proto stubs are deleted. Remaining generated client/server contracts still have code references in archived/non-startup map/services or active startup RPC handlers, so deleting them now would break typecheck. They are retained until their callers are deleted or the contract namespace is regenerated again.
- Retained product capabilities are closed as intentional keeps: Clerk auth, MapLibre startup map, optional HLS/live-channel support, MCP/custom widgets, and ML worker assets remain part of Startup Intelligence or future startup ML refactoring.
- Non-startup shared shell support is closed as non-blocking. `event-handlers.ts` and `panel-layout.ts` still support archived/non-startup variants, but extracted non-startup runtime chunks are excluded from `build:startup`. Revisit only if the repository fully deletes every non-startup variant.

## Cleanup Decision Rule

Keep or refactor anything that can credibly become one of these target capabilities:

- GenAI, LLM, analyst workflows, agentic UX, MCP, custom widgets, semantic/ML ranking, summarization, enrichment, or prompt-safety infrastructure.
- Startup/VC intelligence: funding, founders, companies, markets, comps, sector trends, IPO/M&A signals, accelerators, ecosystems, talent, regulation, patents, product launches.
- AI application stack intelligence: arXiv, GitHub, Hugging Face, repos, models, datasets, benchmarks, leaderboards, AI security, gateways, observability, RAG, memory, agents.
- Reliability and freshness: data freshness, source health, service status, cloud/vendor outages, desktop/pro distribution, auth, billing, user preferences.
- Industry intelligence that can support startup theses: semiconductors, data centers, cloud, energy for compute, healthcare AI, fintech, robotics, cybersecurity, supply chain only when tied to technology sectors.

Delete or quarantine anything whose only useful interpretation is legacy StartupIntelligence geopolitics, military tracking, disaster monitoring, humanitarian monitoring, generic webcams, or non-tech crisis mapping.

## API Domain Decisions

| API domain | Current role | Decision | Rationale |
|---|---|---|---|
| `api/infrastructure/` | Internet outages, DDoS, service status, cable health, IP geo, temporal anomalies, bootstrap infra | Deleted | Legacy endpoint family removed. Startup keeps reliability/source-health concepts through retained startup APIs, MCP, data freshness, and future startup-specific infrastructure work. |
| `api/intelligence/` | Mixed geopolitical intelligence, GDELT, country risk, Telegram, company enrichment, company signals, market implications, social velocity, LLM/deduction | Split and deleted legacy server | Public RPC path remains active, but handlers now live under `server/startup/intelligence/`; legacy `server/startup_intelligence/intelligence/` is deleted. |
| `api/prediction/` | Prediction markets | Deleted | Legacy Polymarket/geopolitical prediction endpoints removed. Rebuild later only for startup/AI/VC prediction use cases. |
| `api/research/` | arXiv, trending repos, Hacker News, tech events | Keep | Strongly aligned with target and routed to `server/startup/research/`. |
| `api/trade/` | Trade restrictions, tariffs, flows, barriers, Comtrade | Deleted | Not core dashboard surface. Rebuild later only if tech export-control thesis work needs it. |
| `api/webcam/` | Webcam listing and image proxy | Deleted | Weak fit. Rebuild only if a specific data-center/construction visual-monitoring use case emerges. |
| `api/bootstrap.js` | Bulk hydration of legacy StartupIntelligence cache domains | Rewrite candidate | Current payload is mostly legacy and should stay excluded. Preserve the pattern as a future startup bootstrap for arXiv/GitHub/HF/RSS/Telegram/markets/MCP status. |
| `api/telegram-feed.js` | Relay-backed Telegram feed | Keep and retarget | User explicitly wants to keep it. Retarget topics/channels to startup, VC, AI, market and founder intelligence. |


## Target Product Surface

### Keep

These are first-class target capabilities and should remain in the project.

- Startup / VC dashboard shell: `src/App.ts`, `src/app/panel-layout.ts`, `src/app/event-handlers.ts`, `src/config/variants/tech.ts`, `src/config/panels.ts`.
- VC startup dashboard: `src/app/startup-data-loader.ts`, `src/app/startup-country-intel.ts`, `src/components/NewsPanel.ts`, `src/components/TopVCSignalsPanel.ts`, `src/components/InvestmentsPanel.ts`, `src/services/startup-signal.ts`, `src/services/startup-investor-brief.ts`.
- Tech/startup map: `src/components/StartupMapContainer.ts`, `src/components/startup-map-data.ts`, `src/components/startup-map-popup-renderers.ts`, `src/components/map-container-contract.ts`, `src/config/startup-ecosystems.ts`, `src/config/tech-companies.ts`, `src/config/tech-geo.ts`, `src/config/ai-datacenters.ts`, `src/services/tech-hub-index.ts`, `src/services/hub-activity-scoring.ts`.
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

These files contain useful target capabilities mixed with StartupIntelligence legacy assumptions.

- `api/chat-analyst.ts`: keep as the Startup Intelligence analyst edge function. It now points at `server/startup/analyst/` for startup-oriented context and prompt construction.
- `server/startup/analyst/context.ts`: startup-oriented context builder for VC/startup/AI-stack/market/research/infrastructure analysis.
- `server/startup/analyst/prompt.ts`: Startup Intelligence analyst system prompt for investor-facing responses.
- `server/startup/analyst/actions.ts`: action-event detection for investor widgets and dashboard creation.
- Legacy `server/startup_intelligence/intelligence/v1/chat-analyst-*` modules are deleted. Startup analyst tests now cover `server/startup/analyst/`.
- `server/_shared/llm.ts`, `server/_shared/llm-health.ts`, `server/_shared/llm-sanitize.js`: keep as shared LLM foundation.
- `api/bootstrap.js`: do not keep in its current StartupIntelligence shape, but preserve the bootstrap pattern. Rewrite as a startup bootstrap if we want fast first-load hydration for startup news, arXiv, GitHub, Hugging Face, market comps, chat/MCP status, and Telegram sources.
- `api/telegram-feed.js`: keep, but retarget topics/channels to startup intelligence and AI ecosystem monitoring.
- Desktop/download functionality, ML worker, and data freshness: keep as potential target capabilities, but separate from legacy StartupIntelligence copy and domain assumptions.
- `src/app/event-handlers.ts`: keep, but continue lazy-loading desktop/startupintelligence-only features and trim maritime/aviation startup imports.
- `src/app/panel-layout.ts`: keep. Startup runtime no longer exposes StartupIntelligence Pro links or legacy GitHub repo stars; non-startup variants still retain their existing StartupIntelligence links.
- Legacy map stack (`src/components/DeckGLMap.ts`, `src/components/Map.ts`, `src/components/MapPopup.ts`, `src/components/GlobeMap.ts`, `src/components/MapContainer.ts`): keep only for non-startup variants until those variants are archived. Startup no longer depends on this stack.
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

- `api/bootstrap.js` is excluded only because its current payload is legacy; it should be rewritten rather than treated as a discarded product idea.
- All non-startup StartupIntelligence API/server domains are now physically deleted or quarantined outside the active deploy surface. This includes the first wave domains plus the final retained-but-unrefactored `cyber`, `infrastructure`, `supply-chain`, and legacy `intelligence` server domains.

Important correction: `api/chat-analyst.ts`, `api/mcp.ts`, `api/telegram-feed.js`, `api/intelligence/`, and `api/research/` are target capabilities and must not be excluded.

## Physical Delete Candidates

Delete only after replacing or removing all imports from startup entrypoints.

- Frontend panels unrelated to startup intelligence: aviation, military, sanctions, climate disaster, disease, displacement, radiation, wildfire, seismic, live webcams, positive-events-only panels, commodity-only panels.
- Client services unrelated to startup intelligence: `src/services/aviation/`, `maritime/`, `military/`, `military-flights.ts`, `military-vessels.ts`, `conflict/`, `displacement/`, `climate/`, `radiation.ts`, `sanctions-pressure.ts`, `webcams/`, `wildfires/`, `thermal-escalation.ts`.
- Config data unrelated to startup map: military bases, ports, pipelines, airports, commodities, sanctions/geopolitical datasets, weather/natural hazard datasets.
- Generated proto stubs for removed domains after no runtime/server/client code imports them.
- Tests covering deleted legacy domains, after preserving target tests for startup intelligence, auth, billing, MCP, chat, and market comps.

## Current Blockers To Physical Deletion

- Legacy map files still carry old StartupIntelligence domains, but this is no longer a Startup Intelligence blocker: startup imports `StartupMapContainer` and guard tests prevent re-coupling.
- Frontend startup shell cleanup is closed for build/deploy: `App.ts`, `event-handlers.ts`, and `panel-layout.ts` now isolate non-startup runtime behind build-time startup guards. They are no longer physical deletion blockers for the startup app.
- `proto/` and `src/generated/` still carry StartupIntelligence service contracts for domains that startup no longer ships.
- Relay/seed route references for deleted infrastructure, cyber, and supply-chain APIs are closed. Remaining script cleanup is broader archival work for legacy aviation/maritime/geopolitical seeders, not a blocker for the active startup app.

## Final Cleanup Sequence

1. Restore target exclusions: keep chat and MCP deployable. Done.
2. Extract chat analyst backend from `server/startup_intelligence/intelligence/v1/` into a startup-oriented namespace, then update `api/chat-analyst.ts`. Done.
3. Split backend startup RPCs out of `server/startup_intelligence/` for market, news, research, economic, consumer-prices, and startup intelligence. Done.
4. Re-enable active startup RPC API domains in `.vercelignore` and route Vite dev startup APIs to `server/startup/`. Done.
5. Freeze the current green baseline: `npm run typecheck`, focused startup/MCP/chat/market tests, `npm run build:startup`, and one browser smoke test. Done.
6. Protect startup source defaults so core startup dashboards never render as all-sources-disabled after free-tier source trimming. Done.
7. Split startup map data contracts from legacy map data contracts. Done.
8. Split the map into startup map modules and legacy geo modules. Done and guardrailed: startup uses `StartupMapContainer`; the startup build no longer emits `MapContainer`, `DeckGLMap`, `Map`, or `GlobeMap`; rich popups, marker clustering, and optional globe mode are implemented; `tests/startup-map-cleanup.test.mjs` protects the boundary.
9. Split `MapPopup` into startup popup renderers and legacy popup renderers. Done.
10. Split `MapContainer` so startup imports a startup map shell and never statically imports the legacy map stack. Done: app-facing map contract extracted, startup uses `StartupMapContainer`, and legacy map chunks are absent from startup build output.
11. Split `AppContext` into startup-safe core plus legacy extensions, so startup no longer references aviation, maritime, conflict, sanctions, climate, radiation, displacement, or wildfire state. Done and guardrailed: `StartupAppContext` excludes legacy cache fields, `LegacyAppContextExtension` owns them, and export utilities now import legacy cache types directly from `legacy-app-context.ts`.
12. Split event handlers and layout runtime into startup handlers and legacy handlers. Keep desktop/download, ML worker, and data freshness only where still useful for startup. In progress: event handler contract extracted; non-startup runtime setup extracted from `App.ts`; legacy CII/GPS/AIS/aviation paths extracted into `non-startup-event-runtime.ts`; legacy layout links/star fetch/escalation setup extracted into `non-startup-layout-runtime.ts`; build-time guards keep all three non-startup runtime chunks out of startup output.
13. Remove `data-loader.ts` from the startup import graph. Done: `App.ts` imports `startup-data-loader.ts` directly; the legacy `src/app/data-loader.ts` and its legacy-only tests have been physically deleted.
14. Split panel registry/config into startup registry plus archived legacy registry. Done and guardrailed: startup panel and map-layer defaults now live in `src/config/variants/startup.ts`; startup layers are explicit rather than inherited from tech defaults; `tests/startup-panel-registry-cleanup.test.mjs` blocks legacy StartupIntelligence panel keys from returning to the startup registry.
15. Split country intelligence into startup country intelligence plus archived world-risk intelligence. Done and guardrailed: startup uses `startup-country-intel.ts`, `AppContext` no longer owns country brief UI contracts, legacy `country-intel.ts` and the country deep-dive/story UI stacks are physically removed, and the app barrel exports only the startup country manager.
16. Quarantine `server/startup_intelligence/intelligence/v1/` after tests are migrated to `server/startup/intelligence/v1/` or removed. Done and physically deleted: production `/api/intelligence/v1/[rpc].ts` routes to `server/startup/intelligence/v1/handler.ts`; startup handler disables legacy world-risk RPCs; MCP no longer exposes disabled country/deduction tools; premium path config no longer marks disabled legacy intelligence RPCs; active startup intelligence cache tiers are explicit; `tests/chat-analyst.test.mts` now targets `server/startup/analyst/`.
17. Quarantine frontend legacy panels, services, configs, and workers only after `rg`, typecheck, and startup build prove no startup imports remain. In progress: component/service barrels now expose only the startup surface; first physical delete batch removed unused aviation/world-risk panels and legacy aviation tests (`AirlineIntelPanel`, `AviationCommandBar`, `SanctionsPressurePanel`, `RadiationWatchPanel`, `ThermalEscalationPanel`, `DisplacementPanel`, `DeductionPanel`, `UcdpEventsPanel`, `SatelliteFiresPanel`, `DiseaseOutbreaksPanel`, `ClimateNewsPanel`); the full legacy `src/app/data-loader.ts` was removed after `App.ts` switched to direct startup loader import; second physical delete batch removed dead/non-core legacy panels (`StrategicPosturePanel`, `DefensePatentsPanel`, `GulfEconomiesPanel`, `GroceryBasketPanel`, `BigMacPanel`, `FaoFoodPriceIndexPanel`, `CotPositioningPanel`, `PositioningPanel`) after type-only dependencies were replaced with small structural contracts; third physical delete batch removed the legacy world-risk country manager and dead story modal/share stack; fourth physical delete batch removed the country deep-dive/brief/timeline stack and its legacy-only tests; API/server physical deletion removed all non-startup StartupIntelligence API/server domains. ML worker assets remain intentionally retained for future startup ML refactoring.
18. Rewrite `api/bootstrap.js` as startup bootstrap for startup news, arXiv, GitHub, Hugging Face, market comps, Telegram, MCP, and chat health. Done for active registry: `/api/bootstrap` and `server/_shared/cache-keys.ts` now keep startup/AI-stack/market/reliability keys only; legacy geopolitics, disaster, aviation, sanctions, radiation, thermal, health, energy-crisis, and humanitarian keys are removed from the served bootstrap registry.
19. Replace remaining StartupIntelligence product copy, links, docs, and branding in startup routes. Done for startup runtime and metadata: premium gating uses `/pro`, startup skips legacy GitHub stars, `index.html` metadata no longer advertises StartupIntelligence aliases/geopolitical copy/repo links, and guard tests prevent regression. The canonical deployment URL remains `startupintelligence.app` until a dedicated Startup Intelligence domain is chosen.
20. Remove or quarantine optional frontend services/components that still reference deleted legacy API route strings, while keeping startup registry and build green. Done for supply-chain/Hormuz/RouteExplorer.
21. Remove deleted-domain route warm-pings from relay/seed scripts. Done for infrastructure, cyber, and supply-chain route references.
22. Rename or replace remaining generated proto contracts so startup no longer imports old-brand namespaces for active startup RPCs. Done: generated/proto paths now use `startup_intelligence`.
23. Remove generated proto stubs for deleted domains after no runtime/server/client imports remain. Partially done: wildfire removed; remaining stubs still have callers in archived/non-startup services or active RPC contracts.
24. Run full cleanup verification and bundle audit. Done for this batch: typecheck, startup build, MCP/chat/startup cleanup tests passed after fixes.
25. Delete quarantined legacy files in one final deletion batch after CI-style verification stays green. Done for active quarantine: `legacy/`, old server root, stale docs, stale todos, and deleted-domain API/server files are gone from the active workspace.

## Final Cleanup Verification

Run after every risky batch:

- `npm run typecheck`
- `npx tsx --test tests/arxiv-papers.test.mts tests/github-repos.test.mts tests/huggingface.test.mts`
- `npx tsx --test tests/mcp.test.mjs tests/mcp-proxy.test.mjs tests/mcp-presets.test.mjs tests/chat-analyst.test.mts`
- `npx tsx --test tests/edge-functions.test.mjs tests/startup-bundle-bloat-cleanup.test.mjs tests/startup-app-context-cleanup.test.mjs tests/startup-panel-registry-cleanup.test.mjs`
- `npm run build:startup`

Run before physical deletion:

- `rg "server/startup_intelligence/(consumer-prices|economic|market|news|research|intelligence|cyber|infrastructure|supply-chain)" api server src tests vite.config.ts`
- `rg "(aviation|maritime|military|sanctions|displacement|radiation|wildfire|webcam|conflict)" src/App.ts src/app src/components src/config src/services`
- Browser smoke on startup URL with layers `datacenters,startupHubs,cloudRegions,accelerators,techHQs,techEvents`.

## Verification Checklist For Each Cleanup Batch

- `npm run typecheck`
- `npx tsx --test tests/arxiv-papers.test.mts tests/github-repos.test.mts tests/huggingface.test.mts`
- `npx tsx --test tests/mcp.test.mjs tests/mcp-proxy.test.mjs tests/mcp-presets.test.mjs tests/chat-analyst.test.mts`
- `npm run build:startup`
