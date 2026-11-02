import { SymbolName, SafetyStatus, EconomicNewsEvent } from '../../shared/types.js';
import { INSTRUMENTS, NEWS_BLACKOUT_CONFIG, STALE_FEED_THRESHOLD_MS } from '../../shared/constants.js';

export function checkSpreadSafety(
  symbol: SymbolName,
  spreadPips: number
): { status: SafetyStatus; allowed: boolean; reason?: string } {
  const spec = INSTRUMENTS[symbol];
  if (!spec) {
    return { status: 'BLOCKED', allowed: false, reason: `Unknown symbol ${symbol}` };
  }

  const maxAllowed = spec.maxSpreadPips;
  const warningThreshold = maxAllowed * 0.8;

  if (spreadPips > maxAllowed) {
    return {
      status: 'BLOCKED',
      allowed: false,
      reason: `Spread ${spreadPips.toFixed(1)} pips melebihi toleransi maksimal ${maxAllowed.toFixed(1)} pips`,
    };
  }

  if (spreadPips > warningThreshold) {
    return {
      status: 'WARNING',
      allowed: true,
      reason: `Spread ${spreadPips.toFixed(1)} pips mendekati ambang batas (${maxAllowed.toFixed(1)} pips)`,
    };
  }

  return {
    status: 'SAFE',
    allowed: true,
  };
}

export function checkNewsBlackout(
  symbol: SymbolName,
  events: EconomicNewsEvent[],
  currentTime: number = Date.now()
): { inBlackout: boolean; activeEvent?: EconomicNewsEvent; reason?: string } {
  // Currency correlation:
  // XAUUSD, XAGUSD, USDJPY, GBPUSD all correlate with USD
  // GBPUSD also correlates with GBP
  // USDJPY also correlates with JPY
  const correlatedCurrencies: Record<SymbolName, string[]> = {
    XAUUSD: ['USD'],
    XAGUSD: ['USD'],
    USDJPY: ['USD', 'JPY'],
    GBPUSD: ['USD', 'GBP'],
  };

  const targets = correlatedCurrencies[symbol] || ['USD'];
  const preMs = NEWS_BLACKOUT_CONFIG.PRE_EVENT_MINUTES * 60 * 1000;
  const postMs = NEWS_BLACKOUT_CONFIG.POST_EVENT_MINUTES * 60 * 1000;

  for (const event of events) {
    if (event.impactLevel === 'HIGH' && targets.includes(event.currency)) {
      const startBlackout = event.scheduledAt - preMs;
      const endBlackout = event.scheduledAt + postMs;

      if (currentTime >= startBlackout && currentTime <= endBlackout) {
        return {
          inBlackout: true,
          activeEvent: event,
          reason: `High Impact News Blackout: ${event.eventName} (${event.currency})`,
        };
      }
    }
  }

  return { inBlackout: false };
}

export function isFeedHealthy(lastTickTime: number, currentTime: number = Date.now()): boolean {
  return currentTime - lastTickTime <= STALE_FEED_THRESHOLD_MS;
}
