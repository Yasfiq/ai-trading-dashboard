import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createServer } from '../../src/backend/server.js';

describe('Fastify REST API & System Integration Tests', () => {
  let serverInstance: Awaited<ReturnType<typeof createServer>>;

  beforeAll(async () => {
    serverInstance = await createServer({ dbPath: ':memory:', enableLiveSim: false });
    await serverInstance.fastify.ready();
  });

  afterAll(async () => {
    serverInstance.simulator.stopLiveSimulation();
    serverInstance.db.close();
    await serverInstance.fastify.close();
  });

  it('GET /api/v1/market/summary should return all 4 instruments with safety status', async () => {
    const res = await serverInstance.fastify.inject({
      method: 'GET',
      url: '/api/v1/market/summary',
    });

    expect(res.statusCode).toBe(200);
    const json = JSON.parse(res.payload);
    expect(json.status).toBe('success');
    expect(json.data).toHaveLength(4);

    const xau = json.data.find((d: any) => d.symbol === 'XAUUSD');
    expect(xau).toBeDefined();
    expect(xau.safetyStatus).toBe('SAFE');
    expect(xau.feedHealthy).toBe(true);
  });

  it('POST /api/v1/calculator/lot should accurately compute broker lot size', async () => {
    const res = await serverInstance.fastify.inject({
      method: 'POST',
      url: '/api/v1/calculator/lot',
      payload: {
        symbol: 'XAUUSD',
        balance: 10000,
        riskPercentage: 1.0,
        entryPrice: 2746.30,
        stopLossPrice: 2739.00,
      },
    });

    expect(res.statusCode).toBe(200);
    const json = JSON.parse(res.payload);
    expect(json.status).toBe('success');
    expect(json.data.riskAmountUsd).toBe(100.0);
    expect(json.data.calculatedLot).toBe(0.13);
  });

  it('POST /api/v1/simulation/trigger-signal and tick playback should transition signal', async () => {
    // 1. Trigger bullish signal setup
    const triggerRes = await serverInstance.fastify.inject({
      method: 'POST',
      url: '/api/v1/simulation/trigger-signal',
      payload: { symbol: 'XAUUSD' },
    });
    expect(triggerRes.statusCode).toBe(200);

    // 2. Verify signal created in active signals
    const activeRes = await serverInstance.fastify.inject({
      method: 'GET',
      url: '/api/v1/signals/active',
    });
    const activeJson = JSON.parse(activeRes.payload);
    expect(activeJson.data.length).toBeGreaterThan(0);

    const sig = activeJson.data[0];
    expect(sig.symbol).toBe('XAUUSD');
    expect(sig.direction).toBe('BUY');
    expect(sig.lifecycleState).toBe('ENTRY_ZONE_ACTIVE');

    // 3. Replay tick inside entry zone -> ENTRY_CONFIRMED
    const entryAsk = (sig.entryZone.low + sig.entryZone.high) / 2;
    await serverInstance.fastify.inject({
      method: 'POST',
      url: '/api/v1/simulation/tick',
      payload: { symbol: 'XAUUSD', bid: entryAsk - 0.2, ask: entryAsk },
    });

    const activeRes2 = await serverInstance.fastify.inject({
      method: 'GET',
      url: '/api/v1/signals/active',
    });
    const activeJson2 = JSON.parse(activeRes2.payload);
    const updatedSig = activeJson2.data.find((s: any) => s.id === sig.id);
    expect(updatedSig?.lifecycleState).toBe('ENTRY_CONFIRMED');

    // 4. Replay tick hitting TP1 -> TP1_HIT
    await serverInstance.fastify.inject({
      method: 'POST',
      url: '/api/v1/simulation/tick',
      payload: { symbol: 'XAUUSD', bid: sig.targets.tp1 + 0.1, ask: sig.targets.tp1 + 0.3 },
    });

    const activeRes3 = await serverInstance.fastify.inject({
      method: 'GET',
      url: '/api/v1/signals/active',
    });
    const activeJson3 = JSON.parse(activeRes3.payload);
    const updatedSig2 = activeJson3.data.find((s: any) => s.id === sig.id);
    expect(updatedSig2?.lifecycleState).toBe('TP1_HIT');

    // 5. Verify audit event trail
    const eventsRes = await serverInstance.fastify.inject({
      method: 'GET',
      url: `/api/v1/signals/${sig.id}/events`,
    });
    const eventsJson = JSON.parse(eventsRes.payload);
    expect(eventsJson.data.length).toBeGreaterThanOrEqual(2);
    expect(eventsJson.data[0].toState).toBe('ENTRY_CONFIRMED');
    expect(eventsJson.data[1].toState).toBe('TP1_HIT');
  });
});
