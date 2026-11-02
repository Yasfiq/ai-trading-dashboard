import { describe, it, expect } from 'vitest';
import { evaluateSignalLifecycle } from '../../src/backend/engine/lifecycle_state_machine.js';
import { SignalRecord } from '../../src/shared/types.js';

describe('13-State Lifecycle State Machine Unit Tests', () => {
  const baseBuySignal: SignalRecord = {
    id: 'sig_test_buy_01',
    symbol: 'XAUUSD',
    direction: 'BUY',
    confidence: 85,
    confidenceLabel: 'HIGH CONFIDENCE',
    lifecycleState: 'ENTRY_ZONE_ACTIVE',
    entryZone: { low: 2745.50, high: 2747.00, suggested: 2746.30 },
    stopLoss: 2739.00,
    targets: { tp1: 2752.00, tp2: 2758.50, tp3: 2765.00 },
    riskRewardRatio: 2.0,
    reasoning: ['Bullish consensus'],
    indicatorSnapshot: {} as any,
    spreadPips: 1.6,
    createdAt: 1000000,
    expiresAt: 1000000 + 4 * 3600 * 1000,
    lastUpdated: 1000000,
  };

  it('BUY: should transition from ENTRY_ZONE_ACTIVE to ENTRY_CONFIRMED when Ask enters entry zone', () => {
    const tickInside = { bid: 2746.00, ask: 2746.20, time_msc: 1000010 };
    const result = evaluateSignalLifecycle(baseBuySignal, tickInside);

    expect(result.newState).toBe('ENTRY_CONFIRMED');
    expect(result.transitionOccurred).toBe(true);
  });

  it('BUY: should transition to INVALIDATED if price breaches SL before entering Entry Zone', () => {
    const tickBreach = { bid: 2738.50, ask: 2738.70, time_msc: 1000015 };
    const result = evaluateSignalLifecycle(baseBuySignal, tickBreach);

    expect(result.newState).toBe('INVALIDATED');
  });

  it('BUY: should transition through TP1_HIT -> TP2_HIT -> ALL_TP_DONE', () => {
    let currentSignal: SignalRecord = {
      ...baseBuySignal,
      lifecycleState: 'ENTRY_CONFIRMED',
    };

    // 1. Hit TP1 (Bid >= 2752.00)
    let res = evaluateSignalLifecycle(currentSignal, { bid: 2752.10, ask: 2752.30, time_msc: 1000020 });
    expect(res.newState).toBe('TP1_HIT');
    currentSignal = { ...currentSignal, lifecycleState: res.newState };

    // 2. Hit TP2 (Bid >= 2758.50)
    res = evaluateSignalLifecycle(currentSignal, { bid: 2758.60, ask: 2758.80, time_msc: 1000030 });
    expect(res.newState).toBe('TP2_HIT');
    currentSignal = { ...currentSignal, lifecycleState: res.newState };

    // 3. Hit TP3 (Bid >= 2765.00) -> ALL_TP_DONE
    res = evaluateSignalLifecycle(currentSignal, { bid: 2765.20, ask: 2765.40, time_msc: 1000040 });
    expect(res.newState).toBe('ALL_TP_DONE');
  });

  it('BUY: should trigger SL_HIT when Bid <= SL after entry confirmed', () => {
    const activeSignal: SignalRecord = {
      ...baseBuySignal,
      lifecycleState: 'ENTRY_CONFIRMED',
    };
    const slTick = { bid: 2738.90, ask: 2739.10, time_msc: 1000050 };
    const result = evaluateSignalLifecycle(activeSignal, slTick);

    expect(result.newState).toBe('SL_HIT');
  });

  it('BUY: Ambiguity Guard - should set INVALIDATED_AMBIGUOUS_VOLATILITY on conflicting extreme tick anomaly', () => {
    const activeSignal: SignalRecord = {
      ...baseBuySignal,
      lifecycleState: 'ENTRY_CONFIRMED',
    };
    // Tick with extreme spread where bid is below SL and ask is above TP1
    const freakTick = { bid: 2738.00, ask: 2755.00, time_msc: 1000060 };
    const result = evaluateSignalLifecycle(activeSignal, freakTick);

    expect(result.newState).toBe('INVALIDATED_AMBIGUOUS_VOLATILITY');
  });

  it('should transition to EXPIRED if time exceeds 4 hours in ENTRY_ZONE_ACTIVE', () => {
    const tickLate = { bid: 2750.00, ask: 2750.20, time_msc: baseBuySignal.expiresAt + 1000 };
    const result = evaluateSignalLifecycle(baseBuySignal, tickLate);

    expect(result.newState).toBe('EXPIRED');
  });

  it('SELL: should handle entry, TP hits, and SL hits correctly for short direction', () => {
    const sellSignal: SignalRecord = {
      ...baseBuySignal,
      direction: 'SELL',
      entryZone: { low: 2745.50, high: 2747.00, suggested: 2746.30 },
      stopLoss: 2752.00,
      targets: { tp1: 2740.00, tp2: 2735.00, tp3: 2730.00 },
      lifecycleState: 'ENTRY_ZONE_ACTIVE',
    };

    // Entry confirmed when Bid is inside entry zone
    let res = evaluateSignalLifecycle(sellSignal, { bid: 2746.00, ask: 2746.20, time_msc: 1000010 });
    expect(res.newState).toBe('ENTRY_CONFIRMED');

    // TP1 hit when Ask <= TP1 (2740.00)
    const confirmedSell = { ...sellSignal, lifecycleState: 'ENTRY_CONFIRMED' as const };
    res = evaluateSignalLifecycle(confirmedSell, { bid: 2739.80, ask: 2740.00, time_msc: 1000020 });
    expect(res.newState).toBe('TP1_HIT');

    // SL hit when Ask >= SL (2752.00)
    res = evaluateSignalLifecycle(confirmedSell, { bid: 2751.90, ask: 2752.10, time_msc: 1000030 });
    expect(res.newState).toBe('SL_HIT');
  });
});
