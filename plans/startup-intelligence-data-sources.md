# Startup Intelligence Data Sources Map

Last updated: 2026-05-17

This document explains which sources currently feed Startup Intelligence and which sources should be considered for future upgrades. It focuses on the MVP product goal: help a VC monitor investable startup signals, funding activity, AI ecosystem releases, public-market context, and company/repo/paper momentum.

## Current Source Architecture

Most news cards are powered by RSS feeds through `api/rss-proxy.js` and the feed registry in `src/config/feeds.ts`.

The VC Startup workflow is:

1. `src/app/startup-data-loader.ts` loads startup RSS categories.
2. `src/services/startup-signal.ts` enriches each item with VC score, signal type, tags, rationale, and extracted entities.
3. `src/components/TopVCSignalsPanel.ts` renders the highest-conviction ranked signals.
4. `src/components/InsightsPanel.ts` builds the Investment Brief from ranked signals and optionally calls GenAI.
5. `src/components/NewsPanel.ts` renders category-specific news cards such as Companies to Watch, Launch Radar, AI Observatory, and optional sector cards.

## Active Core MVP Sources

These are first-class sources for the current VC Startup tab.

### Companies To Watch

Category keys: `startups`, plus `funding` in the aggregated scoring pool.

Current sources:

- TechCrunch Startups
- TechCrunch Venture
- VentureBeat
- Crunchbase News
- SaaStr
- AngelList News via Google News
- The Information via Google News
- Fortune Term Sheet via Google News
- PitchBook News via Google News
- CB Insights
- VC News via Google News
- Seed & Pre-Seed via Google News
- Crunchbase Funding via Google News

Primary use:

- startup/company discovery
- funding event detection
- investor/funding-stage extraction
- VC signal scoring
- Investment Brief and Highest-Conviction Signals input

### Launch Radar

Category key: `producthunt`.

Current sources:

- Product Hunt RSS

Primary use:

- product launch monitoring
- early builder traction signal
- “launch/demo” VC scoring tag

### AI Observatory

Category key: `ai`.

Current sources:

- OpenAI Official RSS
- AI News via Google News
- VentureBeat AI
- The Verge AI
- MIT Tech Review AI
- MIT Research
- arXiv AI RSS
- arXiv ML RSS
- AI Weekly via Google News
- Anthropic News via Google News
- OpenAI News via Google News

Primary use:

- AI market releases
- model/product launch monitoring
- AI-stack trend tracking
- GenAI/foundation-model signal scoring

### Public Comps

Panel key: `markets`.

Current sources:

- market quote RPC via `api/market/v1/[rpc].ts`
- server handlers under `server/startup/market/v1/`
- configured symbols in `src/config/markets.ts`
- optional custom market watchlist in local storage

Primary use:

- public-market reference points for startup sectors
- AI/chips/cloud/SaaS public comparables
- startup valuation context

### Startup Map

Panel key: `map`.

Current sources:

- `src/config/startup-ecosystems.ts`
- `src/config/tech-companies.ts`
- `src/config/tech-geo.ts`
- `src/config/ai-datacenters.ts`

Primary use:

- startup hubs
- tech HQs
- accelerators
- cloud regions
- datacenters
- tech events layer

## Optional Sources Present But Disabled By Default

These categories are present in the codebase but not shown as default core cards in the MVP layout. They can still be used as invisible scoring inputs or re-enabled as optional panels.

### VC Thesis Library

Category key: `vcblogs`.

Current sources:

- Y Combinator Blog
- a16z Blog via Google News
- Sequoia Blog via Google News
- Paul Graham Essays via Google News
- VC Insights via Google News
- Lenny’s Newsletter
- Stratechery
- FwdStart Newsletter API

Recommended use:

- keep as optional research/strategy panel
- use for thesis context, not urgent dealflow

### Ecosystem Radar

Category key: `regionalStartups`.

Current sources:

- EU Startups
- Tech.eu
- Sifted
- The Next Web
- Tech in Asia
- KrASIA
- SEA Startups via Google News
- Asia VC News via Google News
- China Startups via Google News
- 36Kr English via Google News
- China Tech Giants via Google News
- Japan Startups via Google News
- Japan Tech News via Google News
- Nikkei Tech via Google News
- Korea Tech News via Google News
- Korea Startups via Google News
- Inc42
- YourStory
- India Startups via Google News
- India Tech News via Google News
- SEA Tech News via Google News
- Vietnam Tech via Google News
- Indonesia Tech via Google News
- Taiwan Tech via Google News
- LAVCA LATAM via Google News
- LATAM Startups via Google News
- Startups LATAM via Google News
- Brazil Tech via Google News
- FinTech LATAM via Google News
- TechCabal
- Africa Startups via Google News
- Africa Tech News via Google News
- MENA Startups via Google News
- MENA Tech News via Google News

Recommended use:

- keep as optional panel
- use as hidden scoring input for geography-aware signals

### Valuation Watch

Category key: `unicorns`.

Current sources:

- Unicorn News via Google News
- CB Insights Unicorn via Google News
- Decacorn News via Google News
- New Unicorns via Google News

Recommended use:

- use as hidden scoring input or optional panel
- useful for late-stage valuation and comps

### Demo Days & Accelerators

Category key: `accelerators`.

Current sources:

- Techstars News via Google News
- 500 Global News via Google News
- Demo Day News via Google News
- Startup School via Google News

Recommended use:

- optional early-stage discovery panel
- useful if MVP later adds “emerging companies before funding” workflow

### IPO & M&A Signals

Category key: `ipo`.

Current sources:

- IPO News via Google News
- Renaissance IPO via Google News
- Tech IPO News via Google News

Recommended use:

- keep as hidden scoring input
- optionally merge into IPO/M&A scoring instead of a separate card

### Tech Market Signals

Category key: `tech`.

Current sources:

- TechCrunch
- The Verge
- Ars Technica
- Hacker News
- MIT Tech Review
- ZDNet
- TechMeme
- Engadget
- Fast Company

Recommended use:

- optional broad tech news panel
- avoid making it core because it adds noise

### Cloud & AI Infrastructure

Category key: `cloud`.

Current sources:

- InfoQ
- The New Stack
- DevOps.com

Recommended use:

- keep as hidden scoring input for AI infra
- optional sector panel for infra-focused workflow

### Semiconductor & Hardware

Category key: `hardware`.

Current sources:

- Tom’s Hardware
- SemiAnalysis via Google News
- Semiconductor News via Google News

Recommended use:

- keep as hidden scoring input
- important for AI compute thesis, GPU supply, and data-center stack

### Fintech Watch

Category key: `fintech`.

Current sources:

- Fintech Funding via Google News
- Fintech News via Google News
- Digital Assets Infrastructure via Google News

Recommended use:

- keep as optional vertical panel
- use as hidden signal input for fintech-specific VC scoring

### Talent & Layoff Signals

Category key: `layoffs`.

Current sources:

- Layoffs.fyi via Google News
- TechCrunch Layoffs

Recommended use:

- optional talent-market signal
- useful for founder spinout and hiring-market intelligence

### AI Policy & Regulation

Category key: `policy`.

Current sources:

- Politico Tech
- AI Regulation via Google News
- Tech Antitrust via Google News
- EFF News via Google News
- EU Digital Policy via Google News
- Euractiv Digital via Google News
- EU Commission Digital via Google News
- China Tech Policy via Google News
- UK Tech Policy via Google News
- India Tech Policy via Google News

Recommended use:

- keep as hidden scoring input
- useful for AI regulation, export controls, privacy, antitrust, and platform risk

### Cybersecurity Watch

Category key: `security`.

Current sources:

- Krebs Security
- The Hacker News
- Dark Reading
- Schneier

Recommended use:

- optional vertical panel
- hidden input for cybersecurity startup signals

## Non-News Intelligence Sources

### arXiv Papers Page

Current sources:

- Hugging Face Papers
- AlphaXiv
- arXiv API/RSS fallback

Current positioning:

- Hugging Face Papers and AlphaXiv first
- arXiv gems after trend sources
- scoring aligned to investment/builder relevance

### GitHub Repo Page

Current sources:

- GitHub Trending
- curated GenAI/master repository list
- GitHub API/repo metadata
- fallback curated repository config

Current positioning:

- Master repos tab
- Trending repos tab
- filters aligned to GenAI, agents, RAG, memory, knowledge base, observability, and AI security

### Hugging Face Page

Current state:

- hidden from MVP navigation
- sources and services retained for future product design

## Current Gaps

The current source stack is good for RSS-level monitoring but weak in these areas:

- verified funding round database
- cap table/investor participation detail
- founder/team enrichment
- company graph and canonical entity resolution
- real-time social discussion signal
- LinkedIn founder/company momentum
- investor portfolio mapping
- private-company valuation history
- revenue/headcount/customer traction
- patent and technical defensibility
- newsletter/paywalled VC data
- accurate source freshness and canonical publication time from Google News reprints

## Future Free Sources To Add

These sources can improve coverage without immediate paid data contracts.

### Startup And Funding

- Dealroom open/public pages where legally accessible
- Crunchbase News RSS and category-specific search queries
- Tech.eu funding feeds/search
- EU Startups funding/search pages
- Sifted startup/funding search
- Y Combinator company directory metadata where accessible
- Product Hunt API if available for richer launch metadata
- Wellfound public company/job pages where accessible
- StartupBlink ecosystem public rankings for geography context

### AI Observatory

- Hugging Face Papers trending
- Hugging Face models/datasets/spaces APIs
- Papers With Code trending/tasks
- AlphaXiv discussion pages
- arXiv API by curated AI topics
- OpenAI news RSS
- Anthropic news/RSS or Google News query
- Google DeepMind blog/RSS
- Meta AI blog/RSS
- Mistral news/blog
- Cohere blog
- Perplexity blog/news
- LangChain blog/changelog
- LlamaIndex blog/changelog
- Vercel AI SDK changelog
- Cloudflare AI blog
- Modal blog
- Replicate blog
- Together AI blog

### GitHub And Open Source

- GitHub Trending direct scrape/API proxy
- GitHub Search API for topic queries
- GitHub releases API for curated AI repos
- GH Archive / GitHub events public dataset for advanced trend scoring
- Libraries.io API for package ecosystem signal
- npm trends/downloads for JS AI tooling
- PyPI download stats via public datasets where available

### Social And Community

- Hacker News Algolia API
- Reddit public JSON for selected subreddits where allowed
- Lobsters RSS
- Dev.to API/RSS
- Stack Overflow trends/tags
- YouTube channel RSS for AI/product demos
- Podcast RSS feeds for 20VC, Acquired, All-In, Latent Space, No Priors

### Policy And Market Context

- SEC EDGAR company filings
- SEC S-1 filings for IPO pipeline
- FTC/DOJ antitrust press releases
- EU Commission digital policy releases
- UK AI Safety Institute
- OECD AI policy observatory
- NIST AI RMF publications
- BIS/central bank tech and fintech releases

### Talent And Company Momentum

- GitHub org activity
- company careers pages where RSS/API exists
- public layoff trackers
- public job-board search queries for AI startup hiring
- OpenAlex for research/company/founder publication graph

## Future Paid Sources To Consider

These are potential upgrade paths for a serious VC-grade product.

### Funding And Company Data

- Crunchbase API
- PitchBook
- Dealroom
- Tracxn
- CB Insights
- Harmonic
- Affinity data enrichment
- People Data Labs
- Clearbit/company enrichment alternatives

Best use:

- funding rounds
- investors and syndicates
- company canonical profiles
- founder/team enrichment
- valuation and stage history
- sector taxonomy

### Market And Private Company Intelligence

- AlphaSense
- Tegus / AlphaSense expert transcripts
- Canalyst / Tegus financial models
- Similarweb
- Sensor Tower / data.ai
- Apptopia
- G2 / TrustRadius datasets
- BuiltWith
- Wappalyzer

Best use:

- traction proxies
- customer adoption
- web/app traffic
- software stack
- category momentum

### Social And Attention Signal

- X/Twitter API enterprise/basic, if cost acceptable
- LinkedIn data partners, if contractually available
- Reddit API paid tier
- Quid / Brandwatch / Meltwater
- Signal AI
- Talkwalker

Best use:

- social discussion velocity
- founder/investor attention
- sentiment and narrative shifts
- early hype versus durable traction

### Research, Patents, And Technical Moat

- The Lens API
- PatSnap
- Google Patents public scraping/API alternatives where compliant
- Dimensions
- OpenAlex premium/data snapshots
- Semantic Scholar API higher quota

Best use:

- patent signal
- academic founder/research lab mapping
- technical defensibility
- model/research trend validation

### News And Premium Media

- Factiva
- Dow Jones Newswires
- Bloomberg
- Financial Times API/content licensing
- The Information
- TechCrunch+ if API/licensing available
- S&P Capital IQ news/data
- Refinitiv/LSEG

Best use:

- high-quality source freshness
- licensed premium coverage
- fewer Google News duplicates
- better publication-time fidelity

## Recommended Source Upgrade Roadmap

### Phase 1: Clean Free Stack

- keep current RSS stack
- remove low-quality duplicate Google News queries
- add source freshness diagnostics per feed
- show true publication date from article when available
- normalize duplicate stories across Google News and direct RSS

### Phase 2: Better AI And Open Source Observatory

- deepen Hugging Face Papers and AlphaXiv ingestion
- add Papers With Code
- add GitHub releases for master repos
- add HN Algolia discussion score
- add GitHub stars/activity velocity

### Phase 3: VC-Grade Funding Layer

- integrate one paid company/funding data provider
- recommended first evaluation: Dealroom or Crunchbase API
- use provider data for canonical company/funding/investor entities
- keep RSS as freshness and narrative layer

### Phase 4: Traction And Moat Signals

- add Similarweb/Sensor Tower or equivalent
- add BuiltWith/Wappalyzer
- add patent/research graph source
- connect these signals into scoring formula

### Phase 5: Social Momentum

- add HN/Reddit first
- add X/LinkedIn only if legal/commercial terms are clear
- use social signal as one factor, not as final ranking authority

## MVP Recommendation

For now:

- keep `startups`, `funding`, `producthunt`, `ai`, `ipo`, `cloud`, `hardware`, `fintech`, `policy`, and `security` as scoring inputs
- keep only the clean core cards visible by default
- use optional panels for deeper drill-down
- next major paid source should be either Crunchbase, Dealroom, or Harmonic depending on budget and API access
