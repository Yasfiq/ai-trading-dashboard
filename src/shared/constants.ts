import { InstrumentSpec, SymbolName } from './types.js';

export const INSTRUMENTS: Record<SymbolName, InstrumentSpec> = {
  XAUUSD: {
    symbol: 'XAUUSD',
    brokerSymbol: 'XAUUSD',
    baseCurrency: 'XAU',
    quoteCurrency: 'USD',
    contractSize: 100, // 100 oz per 1 standard lot
    tickSize: 0.01,
    tickValue: 1.0, // $1 per 0.01 price move for 1 lot (100 * 0.01)
    pipSize: 0.1, // 1 pip = 0.10 USD
    maxSpreadPips: 3.5, // 35 points
    volumeMin: 0.01,
    volumeMax: 50.0,
    volumeStep: 0.01,
  },
  XAGUSD: {
    symbol: 'XAGUSD',
    brokerSymbol: 'XAGUSD',
    baseCurrency: 'XAG',
    quoteCurrency: 'USD',
    contractSize: 5000, // 5000 oz
    tickSize: 0.001,
    tickValue: 5.0, // $5 per 0.001 price move for 1 lot
    pipSize: 0.01, // 1 pip = 0.01 USD
    maxSpreadPips: 4.0,
    volumeMin: 0.01,
    volumeMax: 20.0,
    volumeStep: 0.01,
  },
  USDJPY: {
    symbol: 'USDJPY',
    brokerSymbol: 'USDJPY',
    baseCurrency: 'USD',
    quoteCurrency: 'JPY',
    contractSize: 100000,
    tickSize: 0.001,
    tickValue: 0.65, // ~100 JPY approx $0.65 at 153 rate
    pipSize: 0.01,
    maxSpreadPips: 1.8,
    volumeMin: 0.01,
    volumeMax: 100.0,
    volumeStep: 0.01,
  },
  GBPUSD: {
    symbol: 'GBPUSD',
    brokerSymbol: 'GBPUSD',
    baseCurrency: 'GBP',
    quoteCurrency: 'USD',
    contractSize: 100000,
    tickSize: 0.00001,
    tickValue: 1.0, // $1 per 0.00001 (100,000 * 0.00001)
    pipSize: 0.0001,
    maxSpreadPips: 2.0,
    volumeMin: 0.01,
    volumeMax: 100.0,
    volumeStep: 0.01,
  },
};

export const NEWS_BLACKOUT_CONFIG = {
  PRE_EVENT_MINUTES: 30,
  POST_EVENT_MINUTES: 15,
};

export const STALE_FEED_THRESHOLD_MS = 5000;
export const SIGNAL_EXPIRY_MS = 4 * 60 * 60 * 1000; // 4 hours
