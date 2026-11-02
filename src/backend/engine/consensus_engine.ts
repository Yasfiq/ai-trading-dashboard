import {
  SymbolName,
  SignalDirection,
  ConfidenceLabel,
  IndicatorSnapshot,
  EconomicNewsEvent,
  EntryZone,
  TargetPrices,
} from '../../shared/types.js';
import { INSTRUMENTS } from '../../shared/constants.js';
import { calculateEMA, calculateRSI, calculateATR, calculateADX, BarInput } from './indicators.js';
import { checkSpreadSafety, checkNewsBlackout } from './safety_filter.js';
import { calculateTradeLevels } from './risk_calculator.js';

export interface ConsensusInput {
  symbol: SymbolName;
  currentSpreadPips: number;
  h1Bars: BarInput[];
  m15Bars: BarInput[];
  m5Bars: BarInput[];
  newsEvents: EconomicNewsEvent[];
  timestamp?: number;
}

export interface ConsensusOutput {
  direction: SignalDirection;
  confidence: number;
  confidenceLabel: ConfidenceLabel;
  reasoning: string[];
  indicatorSnapshot: IndicatorSnapshot;
  tradeLevels?: {
    entryZone: EntryZone;
    stopLoss: number;
    targets: TargetPrices;
    riskRewardRatio: number;
  };
}

export function evaluateConsensus(input: ConsensusInput): ConsensusOutput {
  const { symbol, currentSpreadPips, h1Bars, m15Bars, m5Bars, newsEvents, timestamp = Date.now() } = input;
  const reasoning: string[] = [];
  const spec = INSTRUMENTS[symbol];

  // 1. Safety Checks first
  const spreadCheck = checkSpreadSafety(symbol, currentSpreadPips);
  if (!spreadCheck.allowed) {
    reasoning.push(`[BLOCKED] ${spreadCheck.reason}`);
  } else if (spreadCheck.status === 'WARNING') {
    reasoning.push(`[WARNING] ${spreadCheck.reason}`);
  } else {
    reasoning.push(`[PASS] Spread ${currentSpreadPips.toFixed(1)} pips (Batas aman < ${spec.maxSpreadPips.toFixed(1)} pips)`);
  }

  const newsCheck = checkNewsBlackout(symbol, newsEvents, timestamp);
  if (newsCheck.inBlackout) {
    reasoning.push(`[BLOCKED] ${newsCheck.reason}`);
  } else {
    reasoning.push(`[PASS] News Safe (Tidak ada High-Impact blackout aktif)`);
  }

  // 2. Compute Indicators
  const h1Closes = h1Bars.map((b) => b.close);
  const m15Closes = m15Bars.map((b) => b.close);
  const m5Closes = m5Bars.map((b) => b.close);

  const h1Ema50List = calculateEMA(h1Closes, 50);
  const h1Ema200List = calculateEMA(h1Closes, Math.min(200, Math.max(20, Math.floor(h1Closes.length * 0.8))));
  const h1AdxList = calculateADX(h1Bars, 14);

  const m15Ema20List = calculateEMA(m15Closes, 20);
  const m15RsiList = calculateRSI(m15Closes, 14);
  const m15AtrList = calculateATR(m15Bars, 14);

  const m5RsiList = calculateRSI(m5Closes, 14);

  const h1Close = h1Closes[h1Closes.length - 1] ?? 0;
  const h1Ema50 = h1Ema50List[h1Ema50List.length - 1] ?? 0;
  const h1Ema200 = h1Ema200List[h1Ema200List.length - 1] ?? 0;
  const h1Adx = h1AdxList[h1AdxList.length - 1] ?? 25;

  const m15Close = m15Closes[m15Closes.length - 1] ?? 0;
  const m15Ema20 = m15Ema20List[m15Ema20List.length - 1] ?? 0;
  const m15Rsi = m15RsiList[m15RsiList.length - 1] ?? 50;
  const m15Atr = m15AtrList[m15AtrList.length - 1] ?? (h1Close * 0.002);
  const m15AtrAvg = m15AtrList.slice(-50).reduce((a, b) => a + b, 0) / Math.max(1, Math.min(50, m15AtrList.length));

  const m5Close = m5Closes[m5Closes.length - 1] ?? 0;
  const m5Rsi = m5RsiList[m5RsiList.length - 1] ?? 50;

  // H1 Trend
  const h1Bullish = h1Close > h1Ema50 && h1Ema50 >= h1Ema200 && h1Adx >= 20;
  const h1Bearish = h1Close < h1Ema50 && h1Ema50 <= h1Ema200 && h1Adx >= 20;
  const h1Trend = h1Bullish ? 'BULLISH' : h1Bearish ? 'BEARISH' : 'NEUTRAL';

  // M15 Setup
  const m15Bullish = m15Close > m15Ema20 && m15Rsi >= 45 && m15Rsi <= 75;
  const m15Bearish = m15Close < m15Ema20 && m15Rsi >= 25 && m15Rsi <= 55;
  const m15Trend = m15Bullish ? 'BULLISH' : m15Bearish ? 'BEARISH' : 'NEUTRAL';

  // M5 Trigger
  const m5TriggerBuy = m5Close >= (m5Bars[m5Bars.length - 2]?.close ?? m5Close) && m5Rsi >= 48;
  const m5TriggerSell = m5Close <= (m5Bars[m5Bars.length - 2]?.close ?? m5Close) && m5Rsi <= 52;

  const indicatorSnapshot: IndicatorSnapshot = {
    h1: {
      ema50: Number(h1Ema50.toFixed(2)),
      ema200: Number(h1Ema200.toFixed(2)),
      adx14: Number(h1Adx.toFixed(2)),
      trend: h1Trend,
    },
    m15: {
      ema20: Number(m15Ema20.toFixed(2)),
      rsi14: Number(m15Rsi.toFixed(2)),
      atr14: Number(m15Atr.toFixed(4)),
      atrAvg50: Number(m15AtrAvg.toFixed(4)),
      trend: m15Trend,
    },
    m5: {
      rsi14: Number(m5Rsi.toFixed(2)),
      triggerConfirmed: h1Bullish ? m5TriggerBuy : m5TriggerSell,
    },
  };

  // Determine Direction Candidates
  let candidateDirection: SignalDirection = 'WAIT';
  if (h1Bullish && m15Bullish && m5TriggerBuy) {
    candidateDirection = 'BUY';
  } else if (h1Bearish && m15Bearish && m5TriggerSell) {
    candidateDirection = 'SELL';
  }

  // console.log for debug removed

  // Circuit breakers override
  if (!spreadCheck.allowed || newsCheck.inBlackout) {
    return {
      direction: 'WAIT',
      confidence: 0,
      confidenceLabel: 'LOW / WAIT',
      reasoning,
      indicatorSnapshot,
    };
  }

  if (candidateDirection === 'WAIT') {
    reasoning.push('[WAIT] Multi-timeframe trend alignment not met (H1/M15/M5 conflict)');
    return {
      direction: 'WAIT',
      confidence: 40,
      confidenceLabel: 'LOW / WAIT',
      reasoning,
      indicatorSnapshot,
    };
  }

  // Calculate Confidence Score (0 - 100)
  let score = 0;

  // 1. Trend Alignment (Max 40)
  if (candidateDirection === 'BUY' && h1Close > h1Ema50 && h1Ema50 >= h1Ema200) {
    score += 20;
    reasoning.push('[PASS] H1 Macro Trend Bullish (Price above EMA 50/200)');
  } else if (candidateDirection === 'SELL' && h1Close < h1Ema50 && h1Ema50 <= h1Ema200) {
    score += 20;
    reasoning.push('[PASS] H1 Macro Trend Bearish (Price below EMA 50/200)');
  }

  if (h1Adx >= 25) {
    score += 10;
    reasoning.push(`[PASS] H1 ADX Strong Trend (${h1Adx.toFixed(1)} > 25)`);
  } else if (h1Adx >= 20) {
    score += 5;
    reasoning.push(`[PASS] H1 ADX Moderate Trend (${h1Adx.toFixed(1)} > 20)`);
  }

  if ((candidateDirection === 'BUY' && m15Close > m15Ema20) || (candidateDirection === 'SELL' && m15Close < m15Ema20)) {
    score += 10;
    reasoning.push('[PASS] M15 EMA 20 Structure Alignment');
  }

  // 2. Momentum Confluence (Max 30)
  if (candidateDirection === 'BUY' && m15Rsi >= 45 && m15Rsi <= 65) {
    score += 15;
    reasoning.push(`[PASS] M15 RSI in Ideal Momentum Range (${m15Rsi.toFixed(1)})`);
  } else if (candidateDirection === 'SELL' && m15Rsi >= 35 && m15Rsi <= 55) {
    score += 15;
    reasoning.push(`[PASS] M15 RSI in Ideal Momentum Range (${m15Rsi.toFixed(1)})`);
  }

  if ((candidateDirection === 'BUY' && m5Rsi >= 50) || (candidateDirection === 'SELL' && m5Rsi <= 50)) {
    score += 15;
    reasoning.push(`[PASS] M5 RSI Trigger Aligned (${m5Rsi.toFixed(1)})`);
  }

  // 3. Volatility & Structure (Max 20)
  const atrRatio = m15AtrAvg > 0 ? m15Atr / m15AtrAvg : 1.0;
  if (atrRatio >= 0.8 && atrRatio <= 1.8) {
    score += 10;
    reasoning.push(`[PASS] ATR Volatility Normal (${atrRatio.toFixed(2)}x of 50-bar avg)`);
  }

  // R:R setup test
  const tradeLevels = calculateTradeLevels(candidateDirection, m15Close, m15Atr);
  if (tradeLevels.riskRewardRatio >= 1.5) {
    score += 10;
    reasoning.push(`[PASS] Risk/Reward Ratio >= 1:1.5 (Planned 1:${tradeLevels.riskRewardRatio})`);
  }

  // 4. Spread & Safety (Max 10)
  if (currentSpreadPips <= spec.maxSpreadPips * 0.5) {
    score += 10;
    reasoning.push(`[PASS] Spread Ultra-Tight (${currentSpreadPips.toFixed(1)} <= ${(spec.maxSpreadPips * 0.5).toFixed(1)} pips)`);
  } else {
    score += 5;
  }

  score = Math.min(100, score);

  let confidenceLabel: ConfidenceLabel = 'LOW / WAIT';
  if (score >= 80) {
    confidenceLabel = 'HIGH CONFIDENCE';
  } else if (score >= 65) {
    confidenceLabel = 'MODERATE CONFIDENCE';
  }

  // Signals below 65 are WAIT
  const finalDirection = score >= 65 ? candidateDirection : 'WAIT';

  return {
    direction: finalDirection,
    confidence: score,
    confidenceLabel,
    reasoning,
    indicatorSnapshot,
    tradeLevels: finalDirection !== 'WAIT' ? tradeLevels : undefined,
  };
}
