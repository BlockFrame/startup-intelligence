# Startup Intelligence

Investor-focused intelligence dashboard for VC and startup investors.

This fork starts from WorldMonitor and is being pruned into a narrower product for:

- startup and VC news monitoring
- funding round and unicorn tracking
- global startup ecosystem mapping
- accelerator and demo day discovery
- AI, fintech, cybersecurity, and policy signal tracking
- public-market comps and macro context
- investor briefs and saved monitors

## Quick Start

```bash
npm install
npm run dev
```

The default development command starts the `startup` variant.

```bash
npm run dev:startup
npm run typecheck
npm run build
```

## Current Product Scope

The app currently keeps the browser SPA, startup/tech/finance intelligence panels, news ingestion, map UI, search, summarization, and market-context services.

The first pruning pass removed the WorldMonitor blog, docs site, desktop shell, E2E visual suite, and prebuilt Pro static bundle. The next pruning pass should remove unused runtime domains such as military, aviation, maritime, climate/disaster, radiation/thermal, webcams, happy-news, and commodity-heavy modules after their imports and data loaders are fully disconnected.

## License

The upstream project is AGPL-3.0-only and its README stated that commercial use requires a commercial license from the original maintainer. Resolve licensing before using this as a commercial SaaS or investor-facing product.
