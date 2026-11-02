import { describe, it, expect } from 'vitest';
import { calculateEMA, calculateRSI, calculateATR, calculateADX } from '../../src/backend/engine/indicators.js';

describe('Technical Indicators Mathematical Unit Tests', () => {
  it('calculateEMA should correctly calculate EMA on known dataset', () => {
    // 5-period EMA on simple price series
    // Prices: [10, 11, 12, 13, 14, 15]
    // k = 2 / (5 + 1) = 2/6 = 1/3
    // SMA of first 5: (10+11+12+13+14)/5 = 12
    // Next EMA: 15 * (1/3) + 12 * (2/3) = 5 + 8 = 13.0
    const prices = [10, 11, 12, 13, 14, 15];
    const ema5 = calculateEMA(prices, 5);
    expect(ema5).toHaveLength(prices.length);
    expect(ema5[4]).toBeCloseTo(12.0, 4);
    expect(ema5[5]).toBeCloseTo(13.0, 4);
  });

  it('calculateRSI should return valid 0-100 values and detect overbought/oversold', () => {
    // Monotonically increasing prices -> RSI should be near 100
    const upPrices = [10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25];
    const rsiUp = calculateRSI(upPrices, 14);
    expect(rsiUp[rsiUp.length - 1]).toBeGreaterThan(95);

    // Monotonically decreasing prices -> RSI should be near 0
    const downPrices = [25, 24, 23, 22, 21, 20, 19, 18, 17, 16, 15, 14, 13, 12, 11, 10];
    const rsiDown = calculateRSI(downPrices, 14);
    expect(rsiDown[rsiDown.length - 1]).toBeLessThan(5);
  });

  it('calculateATR should compute Wilder True Range accurately', () => {
    // Array of bars with high, low, close
    const bars = [
      { high: 10, low: 8, close: 9 },
      { high: 12, low: 9, close: 11 },
      { high: 13, low: 10, close: 12 },
      { high: 14, low: 11, close: 13 },
      { high: 15, low: 12, close: 14 },
    ];
    // TR1 = 10 - 8 = 2
    // TR2 = max(12-9, |12-9|, |9-9|) = 3
    // TR3 = max(13-10, |13-11|, |10-11|) = 3
    const atrs = calculateATR(bars, 3);
    expect(atrs[atrs.length - 1]).toBeGreaterThan(0);
    expect(atrs[2]).toBeCloseTo((2 + 3 + 3) / 3, 2); // Initial SMA of TR
  });

  it('calculateADX should correctly compute trend strength', () => {
    // Generate trending bars
    const trendingBars = Array.from({ length: 35 }, (_, i) => ({
      high: 100 + i * 2,
      low: 98 + i * 2,
      close: 99.5 + i * 2,
    }));
    const adx = calculateADX(trendingBars, 14);
    const lastAdx = adx[adx.length - 1];
    expect(lastAdx).toBeGreaterThan(25); // Strong trend
  });
});
