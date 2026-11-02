/**
 * Mathematical Indicators (Non-repainting, Wilder smoothed)
 */

export interface BarInput {
  high: number;
  low: number;
  close: number;
}

export function calculateEMA(prices: number[], period: number): number[] {
  if (prices.length === 0) return [];
  if (prices.length < period) {
    return new Array(prices.length).fill(prices[0]);
  }

  const result: number[] = new Array(prices.length).fill(0);
  const alpha = 2 / (period + 1);

  // Initial SMA
  let sum = 0;
  for (let i = 0; i < period; i++) {
    sum += prices[i];
    result[i] = sum / (i + 1);
  }
  result[period - 1] = sum / period;

  for (let i = period; i < prices.length; i++) {
    result[i] = prices[i] * alpha + result[i - 1] * (1 - alpha);
  }

  return result;
}

export function calculateRSI(prices: number[], period: number = 14): number[] {
  if (prices.length <= 1) return new Array(prices.length).fill(50);

  const result: number[] = new Array(prices.length).fill(50);
  const gains: number[] = [];
  const losses: number[] = [];

  for (let i = 1; i < prices.length; i++) {
    const diff = prices[i] - prices[i - 1];
    gains.push(diff > 0 ? diff : 0);
    losses.push(diff < 0 ? -diff : 0);
  }

  if (gains.length < period) {
    return result;
  }

  // Initial average
  let avgGain = gains.slice(0, period).reduce((a, b) => a + b, 0) / period;
  let avgLoss = losses.slice(0, period).reduce((a, b) => a + b, 0) / period;

  const computeRsi = (ag: number, al: number) => {
    if (al === 0) return 100;
    if (ag === 0) return 0;
    const rs = ag / al;
    return 100 - 100 / (1 + rs);
  };

  result[period] = computeRsi(avgGain, avgLoss);

  for (let i = period; i < gains.length; i++) {
    avgGain = (avgGain * (period - 1) + gains[i]) / period;
    avgLoss = (avgLoss * (period - 1) + losses[i]) / period;
    result[i + 1] = computeRsi(avgGain, avgLoss);
  }

  // Fill initial uncomputed elements
  for (let i = 0; i < period; i++) {
    result[i] = result[period];
  }

  return result;
}

export function calculateATR(bars: BarInput[], period: number = 14): number[] {
  if (bars.length === 0) return [];
  const result: number[] = new Array(bars.length).fill(0);
  const tr: number[] = [bars[0].high - bars[0].low];

  for (let i = 1; i < bars.length; i++) {
    const hl = bars[i].high - bars[i].low;
    const hc = Math.abs(bars[i].high - bars[i - 1].close);
    const lc = Math.abs(bars[i].low - bars[i - 1].close);
    tr.push(Math.max(hl, hc, lc));
  }

  if (bars.length < period) {
    const avg = tr.reduce((a, b) => a + b, 0) / tr.length;
    return result.fill(avg);
  }

  // First ATR is SMA of TR
  let atr = tr.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = 0; i < period; i++) {
    result[i] = atr;
  }

  for (let i = period; i < bars.length; i++) {
    atr = (atr * (period - 1) + tr[i]) / period;
    result[i] = atr;
  }

  return result;
}

export function calculateADX(bars: BarInput[], period: number = 14): number[] {
  if (bars.length < period * 2) {
    return new Array(bars.length).fill(25);
  }

  const result: number[] = new Array(bars.length).fill(25);
  const tr: number[] = [bars[0].high - bars[0].low];
  const plusDm: number[] = [0];
  const minusDm: number[] = [0];

  for (let i = 1; i < bars.length; i++) {
    const hl = bars[i].high - bars[i].low;
    const hc = Math.abs(bars[i].high - bars[i - 1].close);
    const lc = Math.abs(bars[i].low - bars[i - 1].close);
    tr.push(Math.max(hl, hc, lc));

    const upMove = bars[i].high - bars[i - 1].high;
    const downMove = bars[i - 1].low - bars[i].low;

    if (upMove > downMove && upMove > 0) {
      plusDm.push(upMove);
    } else {
      plusDm.push(0);
    }

    if (downMove > upMove && downMove > 0) {
      minusDm.push(downMove);
    } else {
      minusDm.push(0);
    }
  }

  // Smooth TR, +DM, -DM
  let smoothTr = tr.slice(0, period).reduce((a, b) => a + b, 0);
  let smoothPlusDm = plusDm.slice(0, period).reduce((a, b) => a + b, 0);
  let smoothMinusDm = minusDm.slice(0, period).reduce((a, b) => a + b, 0);

  const dxList: number[] = [];

  for (let i = period; i < bars.length; i++) {
    smoothTr = smoothTr - smoothTr / period + tr[i];
    smoothPlusDm = smoothPlusDm - smoothPlusDm / period + plusDm[i];
    smoothMinusDm = smoothMinusDm - smoothMinusDm / period + minusDm[i];

    const plusDi = smoothTr === 0 ? 0 : (100 * smoothPlusDm) / smoothTr;
    const minusDi = smoothTr === 0 ? 0 : (100 * smoothMinusDm) / smoothTr;
    const diSum = plusDi + minusDi;
    const dx = diSum === 0 ? 0 : (100 * Math.abs(plusDi - minusDi)) / diSum;
    dxList.push(dx);
  }

  if (dxList.length < period) {
    return result;
  }

  let adx = dxList.slice(0, period).reduce((a, b) => a + b, 0) / period;
  const startIndex = period * 2 - 1;

  for (let i = 0; i < startIndex && i < result.length; i++) {
    result[i] = adx;
  }

  for (let i = period; i < dxList.length; i++) {
    adx = (adx * (period - 1) + dxList[i]) / period;
    const resIdx = period + i;
    if (resIdx < result.length) {
      result[resIdx] = adx;
    }
  }

  return result;
}
