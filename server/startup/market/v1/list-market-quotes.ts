/**
 * RPC: ListMarketQuotes -- reads seeded stock/index data from Railway seed cache.
 * All external Finnhub/Yahoo Finance calls happen in ais-relay.cjs on Railway.
 */

import type {
  ServerContext,
  ListMarketQuotesRequest,
  ListMarketQuotesResponse,
  MarketQuote,
} from '../../../../src/generated/server/startup_intelligence/market/v1/service_server';
import {
  fetchFinnhubQuote,
  fetchYahooQuotesBatch,
  parseStringArray,
  YAHOO_ONLY_SYMBOLS,
} from './_shared';
import { getCachedJson } from '../../../_shared/redis';
import stocksConfig from '../../../../shared/stocks.json';

const BOOTSTRAP_KEY = 'market:stocks-bootstrap:v1';
const FALLBACK_SYMBOL_LIMIT = 24;

const stockMeta = new Map(
  (stocksConfig.symbols as Array<{ symbol: string; name: string; display: string }>).map((item) => [item.symbol, item]),
);

function toQuote(
  symbol: string,
  price: number,
  change: number,
  sparkline: number[] = [],
): MarketQuote {
  const meta = stockMeta.get(symbol);
  return {
    symbol,
    name: meta?.name || symbol,
    display: meta?.display || symbol,
    price,
    change,
    sparkline,
  };
}

function toStooqSymbol(symbol: string): string | null {
  if (symbol.startsWith('^') || symbol.includes('=') || symbol.includes('.')) return null;
  return `${symbol.toLowerCase().replace('-', '-')}.us`;
}

function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let current = '';
  let quoted = false;
  for (const char of line) {
    if (char === '"') {
      quoted = !quoted;
    } else if (char === ',' && !quoted) {
      out.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  out.push(current);
  return out;
}

async function fetchStooqQuote(symbol: string): Promise<MarketQuote | null> {
  const stooqSymbol = toStooqSymbol(symbol);
  if (!stooqSymbol) return null;
  try {
    const url = `https://stooq.com/q/l/?s=${encodeURIComponent(stooqSymbol)}&f=sd2t2ohlcvn&h&e=csv`;
    const resp = await fetch(url, { signal: AbortSignal.timeout(8_000) });
    if (!resp.ok) return null;
    const [, row] = (await resp.text()).trim().split(/\r?\n/);
    if (!row) return null;
    const cols = parseCsvLine(row);
    const open = Number(cols[3]);
    const close = Number(cols[6]);
    if (!Number.isFinite(close) || close <= 0) return null;
    const change = Number.isFinite(open) && open > 0 ? ((close - open) / open) * 100 : 0;
    return toQuote(symbol, close, change, [open, close].filter(Number.isFinite));
  } catch {
    return null;
  }
}

async function fetchLiveFallback(symbols: string[]): Promise<{ quotes: MarketQuote[]; rateLimited: boolean }> {
  const requested = symbols
    .map((symbol) => symbol.trim())
    .filter(Boolean)
    .slice(0, FALLBACK_SYMBOL_LIMIT);
  if (requested.length === 0) return { quotes: [], rateLimited: false };

  const finnhubKey = process.env.FINNHUB_API_KEY || '';
  const finnhubSymbols = finnhubKey
    ? requested.filter((symbol) => !YAHOO_ONLY_SYMBOLS.has(symbol))
    : [];
  const yahooSymbols = requested.filter((symbol) => YAHOO_ONLY_SYMBOLS.has(symbol) || !finnhubKey);

  const quotes = new Map<string, MarketQuote>();

  if (finnhubSymbols.length > 0) {
    for (const symbol of finnhubSymbols) {
      const quote = await fetchFinnhubQuote(symbol, finnhubKey);
      if (quote) {
        quotes.set(symbol, toQuote(symbol, quote.price, quote.changePercent));
      } else {
        yahooSymbols.push(symbol);
      }
    }
  }

  const yahoo = await fetchYahooQuotesBatch([...new Set(yahooSymbols)]);
  for (const [symbol, quote] of yahoo.results) {
    quotes.set(symbol, toQuote(symbol, quote.price, quote.change, quote.sparkline));
  }

  const missing = requested.filter((symbol) => !quotes.has(symbol));
  for (const symbol of missing) {
    const quote = await fetchStooqQuote(symbol);
    if (quote) quotes.set(symbol, quote);
  }

  return {
    quotes: requested.map((symbol) => quotes.get(symbol)).filter((quote): quote is MarketQuote => Boolean(quote)),
    rateLimited: yahoo.rateLimited,
  };
}

export async function listMarketQuotes(
  _ctx: ServerContext,
  req: ListMarketQuotesRequest,
): Promise<ListMarketQuotesResponse> {
  const parsedSymbols = parseStringArray(req.symbols);

  try {
    const bootstrap = await getCachedJson(BOOTSTRAP_KEY, true) as ListMarketQuotesResponse | null;
    if (!bootstrap?.quotes?.length) {
      const fallbackSymbols = parsedSymbols.length > 0
        ? parsedSymbols
        : (stocksConfig.symbols as Array<{ symbol: string }>).map((item) => item.symbol);
      const fallback = await fetchLiveFallback(fallbackSymbols);
      return {
        quotes: fallback.quotes,
        finnhubSkipped: !process.env.FINNHUB_API_KEY,
        skipReason: process.env.FINNHUB_API_KEY ? '' : 'Redis seed missing; used Yahoo live fallback',
        rateLimited: fallback.rateLimited,
      };
    }

    if (parsedSymbols.length > 0) {
      const symbolSet = new Set(parsedSymbols);
      const filtered = bootstrap.quotes.filter((q: MarketQuote) => symbolSet.has(q.symbol));
      if (filtered.length > 0) {
        return { quotes: filtered, finnhubSkipped: false, skipReason: '', rateLimited: false };
      }
      const fallback = await fetchLiveFallback(parsedSymbols);
      return {
        quotes: fallback.quotes,
        finnhubSkipped: !process.env.FINNHUB_API_KEY,
        skipReason: process.env.FINNHUB_API_KEY ? '' : 'Requested symbols missing from seed; used Yahoo live fallback',
        rateLimited: fallback.rateLimited,
      };
    }

    return bootstrap;
  } catch {
    return { quotes: [], finnhubSkipped: false, skipReason: '', rateLimited: false };
  }
}
