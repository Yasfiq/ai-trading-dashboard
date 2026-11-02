import { describe, it, expect } from 'vitest';
import { calculateLotSize, calculateTradeLevels } from '../../src/backend/engine/risk_calculator.js';
import { INSTRUMENTS } from '../../src/shared/constants.js';

describe('Risk Calculator & Trade Levels Unit Tests', () => {
  it('calculateLotSize should calculate broker-specific lot accurately with volume step normalization', () => {
    // XAUUSD:
    // Balance: $10,000, Risk: 1% ($100 risk)
    // Entry: 2746.30, SL: 2739.00 -> diff = 7.30
    // tickSize = 0.01, tickValue = 1.0
    // Distance in points = 7.30 / 0.01 = 730 points
    // Loss per 1 lot = 730 * $1.0 = $730
    // Lot = $100 / $730 = 0.1369 -> floor to 0.01 step = 0.13
    const result = calculateLotSize({
      symbol: 'XAUUSD',
      balance: 10000,
      riskPercentage: 1.0,
      entryPrice: 2746.30,
      stopLossPrice: 2739.00,
    }, INSTRUMENTS.XAUUSD);

    expect(result.riskAmountUsd).toBe(100.0);
    expect(result.slDistancePoints).toBe(730);
    expect(result.calculatedLot).toBe(0.13);
    expect(result.potentialLossUsd).toBeCloseTo(0.13 * 730 * 1.0, 2);
  });

  it('calculateLotSize should clamp to broker volumeMin and volumeMax', () => {
    // Huge balance, tiny risk
    const tinyResult = calculateLotSize({
      symbol: 'XAUUSD',
      balance: 10,
      riskPercentage: 0.1, // $0.01 risk
      entryPrice: 2746.30,
      stopLossPrice: 2739.00,
    }, INSTRUMENTS.XAUUSD);
    expect(tinyResult.calculatedLot).toBe(0.01); // volumeMin

    // Giant balance
    const giantResult = calculateLotSize({
      symbol: 'XAUUSD',
      balance: 10000000,
      riskPercentage: 5,
      entryPrice: 2746.30,
      stopLossPrice: 2739.00,
    }, INSTRUMENTS.XAUUSD);
    expect(giantResult.calculatedLot).toBe(50.0); // volumeMax
  });

  it('calculateTradeLevels should calculate valid Entry Zone, SL, and 3-Tier TP for BUY', () => {
    const pClose = 2746.30;
    const atr = 4.0;
    const levels = calculateTradeLevels('BUY', pClose, atr);

    // BUY:
    // Entry Low = 2746.30 - (0.25 * 4) = 2745.30
    // Entry High = 2746.30 + (0.10 * 4) = 2746.70
    // SL = 2745.30 - (1.20 * 4) = 2745.30 - 4.80 = 2740.50
    // Risk Points = 2746.30 - 2740.50 = 5.80
    // TP1 = 2746.30 + 5.80 = 2752.10
    // TP2 = 2746.30 + 11.60 = 2757.90
    // TP3 = 2746.30 + 17.40 = 2763.70
    expect(levels.entryZone.low).toBeCloseTo(2745.30, 2);
    expect(levels.entryZone.high).toBeCloseTo(2746.70, 2);
    expect(levels.entryZone.suggested).toBe(2746.30);
    expect(levels.stopLoss).toBeCloseTo(2740.50, 2);
    expect(levels.targets.tp1).toBeCloseTo(2752.10, 2);
    expect(levels.targets.tp2).toBeCloseTo(2757.90, 2);
    expect(levels.targets.tp3).toBeCloseTo(2763.70, 2);
    expect(levels.riskRewardRatio).toBe(2.0); // Minimum target ratio check
  });

  it('calculateTradeLevels should calculate valid Entry Zone, SL, and 3-Tier TP for SELL', () => {
    const pClose = 2746.30;
    const atr = 4.0;
    const levels = calculateTradeLevels('SELL', pClose, atr);

    // SELL:
    // Entry High = 2746.30 + (0.25 * 4) = 2747.30
    // Entry Low = 2746.30 - (0.10 * 4) = 2745.90
    // SL = 2747.30 + (1.20 * 4) = 2747.30 + 4.80 = 2752.10
    // Risk Points = 2752.10 - 2746.30 = 5.80
    // TP1 = 2746.30 - 5.80 = 2740.50
    expect(levels.entryZone.high).toBeCloseTo(2747.30, 2);
    expect(levels.entryZone.low).toBeCloseTo(2745.90, 2);
    expect(levels.stopLoss).toBeCloseTo(2752.10, 2);
    expect(levels.targets.tp1).toBeCloseTo(2740.50, 2);
    expect(levels.targets.tp2).toBeCloseTo(2734.70, 2);
    expect(levels.targets.tp3).toBeCloseTo(2728.90, 2);
  });
});
