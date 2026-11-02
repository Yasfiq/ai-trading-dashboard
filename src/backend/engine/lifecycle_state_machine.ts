import { SignalRecord, LifecycleState } from '../../shared/types.js';

export interface TickInput {
  bid: number;
  ask: number;
  time_msc: number;
}

export interface LifecycleEvaluationResult {
  newState: LifecycleState;
  transitionOccurred: boolean;
  reason?: string;
  triggerPrice: number;
}

const TERMINAL_STATES: Set<LifecycleState> = new Set([
  'ALL_TP_DONE',
  'SL_HIT',
  'CLOSED_MANUAL',
  'INVALIDATED',
  'EXPIRED',
  'INVALIDATED_AMBIGUOUS_VOLATILITY',
]);

export function evaluateSignalLifecycle(signal: SignalRecord, tick: TickInput): LifecycleEvaluationResult {
  const currentState = signal.lifecycleState;

  if (TERMINAL_STATES.has(currentState)) {
    return {
      newState: currentState,
      transitionOccurred: false,
      triggerPrice: tick.bid,
    };
  }

  // 1. Check expiration if in waiting/entry stage
  if (currentState === 'ENTRY_ZONE_ACTIVE' || currentState === 'WAITING_CONFIRMATION') {
    if (tick.time_msc > signal.expiresAt) {
      return {
        newState: 'EXPIRED',
        transitionOccurred: true,
        reason: 'Signal expired after 4 hours without reaching completion',
        triggerPrice: tick.bid,
      };
    }
  }

  // 2. Handling ENTRY_ZONE_ACTIVE
  if (currentState === 'ENTRY_ZONE_ACTIVE') {
    if (signal.direction === 'BUY') {
      // If price breaks below SL before even entering zone -> Invalidate
      if (tick.bid <= signal.stopLoss) {
        return {
          newState: 'INVALIDATED',
          transitionOccurred: true,
          reason: 'Price invalidated setup by breaking SL before Entry Zone touch',
          triggerPrice: tick.bid,
        };
      }

      // Entry confirmed when Ask touches inside entry zone [low, high]
      if (tick.ask <= signal.entryZone.high && tick.ask >= signal.entryZone.low) {
        return {
          newState: 'ENTRY_CONFIRMED',
          transitionOccurred: true,
          reason: `Ask price ${tick.ask} confirmed entry inside zone [${signal.entryZone.low} - ${signal.entryZone.high}]`,
          triggerPrice: tick.ask,
        };
      }
    } else if (signal.direction === 'SELL') {
      // If price breaks above SL before entering zone -> Invalidate
      if (tick.ask >= signal.stopLoss) {
        return {
          newState: 'INVALIDATED',
          transitionOccurred: true,
          reason: 'Price invalidated setup by breaking SL before Entry Zone touch',
          triggerPrice: tick.ask,
        };
      }

      // Entry confirmed when Bid touches inside entry zone [low, high]
      if (tick.bid >= signal.entryZone.low && tick.bid <= signal.entryZone.high) {
        return {
          newState: 'ENTRY_CONFIRMED',
          transitionOccurred: true,
          reason: `Bid price ${tick.bid} confirmed entry inside zone [${signal.entryZone.low} - ${signal.entryZone.high}]`,
          triggerPrice: tick.bid,
        };
      }
    }
  }

  // 3. Handling ACTIVE TRADES: ENTRY_CONFIRMED, TP1_HIT, TP2_HIT
  if (currentState === 'ENTRY_CONFIRMED' || currentState === 'TP1_HIT' || currentState === 'TP2_HIT') {
    // Ambiguity Guard: Both SL and TP hit simultaneously
    if (signal.direction === 'BUY') {
      const slCondition = tick.bid <= signal.stopLoss;
      const tp1Condition = tick.bid >= signal.targets.tp1;
      const freakSpread = tick.ask - tick.bid > (signal.targets.tp1 - signal.stopLoss) * 0.7;

      if ((slCondition && tp1Condition) || (slCondition && freakSpread)) {
        return {
          newState: 'INVALIDATED_AMBIGUOUS_VOLATILITY',
          transitionOccurred: true,
          reason: 'Ambiguous extreme volatility: SL and TP simultaneously hit in single tick frame',
          triggerPrice: tick.bid,
        };
      }

      if (slCondition) {
        return {
          newState: 'SL_HIT',
          transitionOccurred: true,
          reason: `Stop Loss hit at Bid ${tick.bid} <= SL ${signal.stopLoss}`,
          triggerPrice: tick.bid,
        };
      }

      if (tick.bid >= signal.targets.tp3) {
        return {
          newState: 'ALL_TP_DONE',
          transitionOccurred: true,
          reason: `Final Target 3 Hit at Bid ${tick.bid} >= ${signal.targets.tp3}`,
          triggerPrice: tick.bid,
        };
      }

      if (tick.bid >= signal.targets.tp2 && currentState !== 'TP2_HIT') {
        return {
          newState: 'TP2_HIT',
          transitionOccurred: true,
          reason: `Target 2 Hit at Bid ${tick.bid} >= ${signal.targets.tp2}`,
          triggerPrice: tick.bid,
        };
      }

      if (tick.bid >= signal.targets.tp1 && currentState === 'ENTRY_CONFIRMED') {
        return {
          newState: 'TP1_HIT',
          transitionOccurred: true,
          reason: `Target 1 Hit at Bid ${tick.bid} >= ${signal.targets.tp1}`,
          triggerPrice: tick.bid,
        };
      }
    } else if (signal.direction === 'SELL') {
      const slCondition = tick.ask >= signal.stopLoss;
      const tp1Condition = tick.ask <= signal.targets.tp1;
      const freakSpread = tick.ask - tick.bid > (signal.stopLoss - signal.targets.tp1) * 0.7;

      if ((slCondition && tp1Condition) || (slCondition && freakSpread)) {
        return {
          newState: 'INVALIDATED_AMBIGUOUS_VOLATILITY',
          transitionOccurred: true,
          reason: 'Ambiguous extreme volatility: SL and TP simultaneously hit in single tick frame',
          triggerPrice: tick.ask,
        };
      }

      if (slCondition) {
        return {
          newState: 'SL_HIT',
          transitionOccurred: true,
          reason: `Stop Loss hit at Ask ${tick.ask} >= SL ${signal.stopLoss}`,
          triggerPrice: tick.ask,
        };
      }

      if (tick.ask <= signal.targets.tp3) {
        return {
          newState: 'ALL_TP_DONE',
          transitionOccurred: true,
          reason: `Final Target 3 Hit at Ask ${tick.ask} <= ${signal.targets.tp3}`,
          triggerPrice: tick.ask,
        };
      }

      if (tick.ask <= signal.targets.tp2 && currentState !== 'TP2_HIT') {
        return {
          newState: 'TP2_HIT',
          transitionOccurred: true,
          reason: `Target 2 Hit at Ask ${tick.ask} <= ${signal.targets.tp2}`,
          triggerPrice: tick.ask,
        };
      }

      if (tick.ask <= signal.targets.tp1 && currentState === 'ENTRY_CONFIRMED') {
        return {
          newState: 'TP1_HIT',
          transitionOccurred: true,
          reason: `Target 1 Hit at Ask ${tick.ask} <= ${signal.targets.tp1}`,
          triggerPrice: tick.ask,
        };
      }
    }
  }

  return {
    newState: currentState,
    transitionOccurred: false,
    triggerPrice: tick.bid,
  };
}
