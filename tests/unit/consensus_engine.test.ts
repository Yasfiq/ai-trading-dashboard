import { describe, it, expect } from 'vitest';
import { evaluateConsensus } from '../../src/backend/engine/consensus_engine.js';

describe('Rule-Based Consensus Engine Unit Tests', () => {
  it('should generate BUY signal with HIGH CONFIDENCE when H1, M15, M5 align bullish', () => {
    // 120 bars for H1 so EMA 50 is clearly above EMA 200
    const h1Bars = Array.from({ length: 120 }, (_, i) => {
      const p = 2500 + i * 2.0;
      return { high: p + 1.5, low: p - 1.5, close: p };
    });

    // M15: bars with alternating gains and losses to keep RSI around 52-58
    // Close > EMA 20
    const m15Bars = [];
    let m15p = 2740;
    for (let i = 0; i < 60; i++) {
      // 3 up, 2 down
      const delta = (i % 5 < 3) ? +0.4 : -0.3;
      m15p += delta;
      m15Bars.push({ high: m15p + 0.6, low: m15p - 0.6, close: m15p });
    }

    // M5: 30 bars, modest momentum, last bar closes green
    const m5Bars = [];
    let m5p = 2745;
    for (let i = 0; i < 30; i++) {
      const delta = (i % 4 < 2) ? +0.3 : -0.2;
      m5p += delta;
      m5Bars.push({ high: m5p + 0.4, low: m5p - 0.4, close: m5p });
    }

    const result = evaluateConsensus({
      symbol: 'XAUUSD',
      currentSpreadPips: 1.2,
      h1Bars,
      m15Bars,
      m5Bars,
      newsEvents: [],
      timestamp: 1793617200000,
    });

    expect(result.direction).toBe('BUY');
    expect(result.confidence).toBeGreaterThanOrEqual(80);
    expect(result.confidenceLabel).toBe('HIGH CONFIDENCE');
    expect(result.reasoning.length).toBeGreaterThan(0);
    expect(result.tradeLevels).toBeDefined();
    expect(result.tradeLevels?.targets.tp1).toBeGreaterThan(result.tradeLevels!.entryZone.suggested);
  });

  it('should return WAIT when spread is blocked', () => {
    const bars = Array.from({ length: 50 }, (_, i) => ({
      high: 2700 + i,
      low: 2700 + i - 1,
      close: 2700 + i,
    }));

    const result = evaluateConsensus({
      symbol: 'XAUUSD',
      currentSpreadPips: 4.5, // > maxSpreadPips (3.5)
      h1Bars: bars,
      m15Bars: bars,
      m5Bars: bars,
      newsEvents: [],
      timestamp: Date.now(),
    });

    expect(result.direction).toBe('WAIT');
    expect(result.reasoning.some((r) => r.includes('Spread'))).toBe(true);
  });
});
