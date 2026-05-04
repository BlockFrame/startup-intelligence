/**
 * RPC: getMacroSignals -- reads seeded macro signal data from Railway seed cache.
 * All external Yahoo Finance/Alternative.me/Mempool calls happen in seed-economy.mjs on Railway.
 */

import type {
  ServerContext,
  GetMacroSignalsRequest,
  GetMacroSignalsResponse,
} from '../../../../src/generated/server/startup_intelligence/economic/v1/service_server';

import { getCachedJson } from '../../../_shared/redis';

const SEED_CACHE_KEY = 'economic:macro-signals:v1';

type Quote = { price: number; change: number; sparkline: number[] };

function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let current = '';
  let quoted = false;
  for (const char of line) {
    if (char === '"') quoted = !quoted;
    else if (char === ',' && !quoted) {
      out.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  out.push(current);
  return out;
}

async function fetchStooqQuote(symbol: string): Promise<Quote | null> {
  try {
    const url = `https://stooq.com/q/l/?s=${encodeURIComponent(symbol)}&f=sd2t2ohlcvn&h&e=csv`;
    const resp = await fetch(url, { signal: AbortSignal.timeout(8_000) });
    if (!resp.ok) return null;
    const [, row] = (await resp.text()).trim().split(/\r?\n/);
    if (!row) return null;
    const cols = parseCsvLine(row);
    const open = Number(cols[3]);
    const close = Number(cols[6]);
    if (!Number.isFinite(close) || close <= 0) return null;
    const change = Number.isFinite(open) && open > 0 ? ((close - open) / open) * 100 : 0;
    return { price: close, change, sparkline: [open, close].filter(Number.isFinite) };
  } catch {
    return null;
  }
}

async function fetchFearGreed(): Promise<{ status: string; value?: number; history: Array<{ value: number; date: string }> } | null> {
  try {
    const resp = await fetch('https://api.alternative.me/fng/?limit=7&format=json', { signal: AbortSignal.timeout(8_000) });
    if (!resp.ok) return null;
    const body = await resp.json() as {
      data?: Array<{ value?: string; value_classification?: string; timestamp?: string }>;
    };
    const rows = body.data ?? [];
    const latest = rows[0];
    const value = Number(latest?.value);
    return {
      status: latest?.value_classification || 'UNKNOWN',
      value: Number.isFinite(value) ? value : undefined,
      history: rows
        .map((row) => {
          const v = Number(row.value);
          const ts = Number(row.timestamp);
          if (!Number.isFinite(v) || !Number.isFinite(ts)) return null;
          return { value: v, date: new Date(ts * 1000).toISOString().slice(0, 10) };
        })
        .filter((item): item is { value: number; date: string } => Boolean(item))
        .reverse(),
    };
  } catch {
    return null;
  }
}

function buildFallbackResult(): GetMacroSignalsResponse {
  return {
    timestamp: new Date().toISOString(),
    verdict: 'UNKNOWN',
    bullishCount: 0,
    totalCount: 0,
    signals: {
      liquidity: { status: 'UNKNOWN', sparkline: [] },
      flowStructure: { status: 'UNKNOWN' },
      macroRegime: { status: 'UNKNOWN' },
      technicalTrend: { status: 'UNKNOWN', sparkline: [] },
      hashRate: { status: 'UNKNOWN' },
      priceMomentum: { status: 'UNKNOWN' },
      fearGreed: { status: 'UNKNOWN', history: [] },
    },
    meta: { qqqSparkline: [] },
    unavailable: true,
  };
}

async function buildLiveFallbackResult(): Promise<GetMacroSignalsResponse> {
  const [qqq, xlp, btc, fearGreed] = await Promise.all([
    fetchStooqQuote('qqq.us'),
    fetchStooqQuote('xlp.us'),
    fetchStooqQuote('btcusd'),
    fetchFearGreed(),
  ]);

  if (!qqq && !xlp && !btc && !fearGreed) return buildFallbackResult();

  const flowStatus = btc?.change != null && qqq?.change != null
    ? btc.change >= qqq.change ? 'RISK-ON' : 'DEFENSIVE'
    : 'UNKNOWN';
  const regimeStatus = qqq?.change != null && xlp?.change != null
    ? qqq.change >= xlp.change ? 'BULLISH' : 'DEFENSIVE'
    : 'UNKNOWN';
  const btcTrendStatus = btc?.change == null
    ? 'UNKNOWN'
    : btc.change >= 1 ? 'BULLISH'
      : btc.change <= -1 ? 'BEARISH'
        : 'NEUTRAL';
  const fgStatus = fearGreed?.status ?? 'UNKNOWN';

  const statuses = [flowStatus, regimeStatus, btcTrendStatus, fgStatus.toUpperCase()];
  const bullishCount = statuses.filter((status) => ['BULLISH', 'RISK-ON', 'GREED', 'EXTREME GREED'].includes(status)).length;
  const totalCount = statuses.filter((status) => status !== 'UNKNOWN').length;

  return {
    timestamp: new Date().toISOString(),
    verdict: bullishCount >= Math.max(2, Math.ceil(totalCount * 0.55)) ? 'BUY' : 'CASH',
    bullishCount,
    totalCount,
    signals: {
      liquidity: { status: 'UNKNOWN', sparkline: [] },
      flowStructure: {
        status: flowStatus,
        btcReturn5: btc?.change,
        qqqReturn5: qqq?.change,
      },
      macroRegime: {
        status: regimeStatus,
        qqqRoc20: qqq?.change,
        xlpRoc20: xlp?.change,
      },
      technicalTrend: {
        status: btcTrendStatus,
        btcPrice: btc?.price,
        sparkline: btc?.sparkline ?? [],
      },
      hashRate: { status: 'UNKNOWN' },
      priceMomentum: { status: btcTrendStatus },
      fearGreed: {
        status: fearGreed?.status ?? 'UNKNOWN',
        value: fearGreed?.value,
        history: fearGreed?.history ?? [],
      },
    },
    meta: { qqqSparkline: qqq?.sparkline ?? [] },
    unavailable: false,
  };
}

export async function getMacroSignals(
  _ctx: ServerContext,
  _req: GetMacroSignalsRequest,
): Promise<GetMacroSignalsResponse> {
  try {
    const result = await getCachedJson(SEED_CACHE_KEY, true) as GetMacroSignalsResponse | null;
    if (result && !result.unavailable && result.totalCount > 0) return result;
    return await buildLiveFallbackResult();
  } catch {
    return await buildLiveFallbackResult();
  }
}
