import { describe, it, expect } from 'vitest';
import { checkSpreadSafety, checkNewsBlackout, isFeedHealthy } from '../../src/backend/engine/safety_filter.js';
import { EconomicNewsEvent } from '../../src/shared/types.js';

describe('Safety Filters & Circuit Breakers Unit Tests', () => {
  it('checkSpreadSafety should return SAFE, WARNING, or BLOCKED based on thresholds', () => {
    // XAUUSD max spread = 3.5 pips
    expect(checkSpreadSafety('XAUUSD', 1.5).status).toBe('SAFE');
    expect(checkSpreadSafety('XAUUSD', 3.0).status).toBe('WARNING'); // 3.0 > 3.5 * 0.8 (2.8)
    expect(checkSpreadSafety('XAUUSD', 4.0).status).toBe('BLOCKED');
    expect(checkSpreadSafety('XAUUSD', 4.0).allowed).toBe(false);
  });

  it('checkNewsBlackout should block trading during blackout window (T-30m to T+15m)', () => {
    const now = 1793617200000; // Reference timestamp
    const newsEvents: EconomicNewsEvent[] = [
      {
        id: 'news_1',
        currency: 'USD',
        eventName: 'Non-Farm Payrolls',
        impactLevel: 'HIGH',
        scheduledAt: now + 20 * 60 * 1000, // In 20 mins (Inside -30m window)
      },
    ];

    // XAUUSD contains USD -> should be blocked
    const resultBlocked = checkNewsBlackout('XAUUSD', newsEvents, now);
    expect(resultBlocked.inBlackout).toBe(true);
    expect(resultBlocked.activeEvent?.eventName).toBe('Non-Farm Payrolls');

    // Time is 50 mins before news -> Outside blackout
    const resultOutside = checkNewsBlackout('XAUUSD', newsEvents, now - 35 * 60 * 1000);
    expect(resultOutside.inBlackout).toBe(false);

    // Time is 10 mins after news -> Inside +15m window
    const resultAfter = checkNewsBlackout('XAUUSD', newsEvents, now + 30 * 60 * 1000); // news was at now+20m, so +10m after news
    expect(resultAfter.inBlackout).toBe(true);

    // Time is 20 mins after news -> Outside window
    const resultCleared = checkNewsBlackout('XAUUSD', newsEvents, now + 45 * 60 * 1000);
    expect(resultCleared.inBlackout).toBe(false);
  });

  it('isFeedHealthy should flag feed as stale if elapsed time exceeds 5000ms', () => {
    const now = Date.now();
    expect(isFeedHealthy(now - 1000, now)).toBe(true);
    expect(isFeedHealthy(now - 4999, now)).toBe(true);
    expect(isFeedHealthy(now - 5500, now)).toBe(false); // Stale
  });
});
